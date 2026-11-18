import JSZip from 'jszip';
import {
  ImageFormat,
  SplitTile,
  SplitConfig,
  CompressionConfig,
  CompressionResult,
  ResizeConfig,
  CropRect,
  CropConfig,
  ProcessingProgress,
} from '../types';
import { checkCanvasAlpha } from './validation';

export type ImageProcessingSource = HTMLImageElement | Blob;

export interface ProcessingOptions {
  onProgress?: (progress: ProcessingProgress) => void;
  signal?: AbortSignal;
}

/**
 * Yields control back to the browser event loop so animations, buttons, and UI remain responsive.
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Safely revokes an Object URL (`blob:...`) without throwing.
 */
export function revokeObjectUrlSafe(url?: string | null): void {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

/**
 * Translates low-level Canvas / Memory / Decode errors into friendly user-facing messages.
 */
export function formatProcessingError(err: any): string {
  const msg = String(err?.message || err || '');
  const lower = msg.toLowerCase();

  if (
    lower.includes('memory') ||
    lower.includes('out of') ||
    lower.includes('allocation') ||
    lower.includes('quota') ||
    lower.includes('rangeerror') ||
    lower.includes('empty blob') ||
    lower.includes('context')
  ) {
    return 'Your device does not have enough available browser memory to process this image at its current dimensions. Try resizing to smaller dimensions, closing other browser tabs, or using a desktop browser.';
  }

  if (lower.includes('decode') || lower.includes('corrupt') || lower.includes('load')) {
    return 'Could not decode this image file. Please ensure it is a valid, uncorrupted JPEG, PNG, or WebP image.';
  }

  return msg || 'An unexpected error occurred while processing the image locally.';
}

// ==========================================
// WEB WORKER RUNNER (WITH CLEAN FALLBACK)
// ==========================================

let sharedWorker: Worker | null = null;
let workerUnavailable = false;
let nextJobId = 1;

function canUseImageWorker(): boolean {
  if (workerUnavailable) return false;
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof OffscreenCanvas.prototype.convertToBlob === 'function' &&
    typeof createImageBitmap === 'function'
  );
}

function getOrCreateWorker(): Worker | null {
  if (!canUseImageWorker()) return null;
  if (sharedWorker) return sharedWorker;

  try {
    sharedWorker = new Worker(new URL('./imageWorker.ts', import.meta.url), {
      type: 'module',
    });
    sharedWorker.onerror = () => {
      workerUnavailable = true;
      try {
        sharedWorker?.terminate();
      } catch {
        // ignore
      }
      sharedWorker = null;
    };
    return sharedWorker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

function runWorkerJob<T>(
  op: 'split' | 'compress' | 'resize' | 'crop',
  source: Blob,
  payload: any,
  options?: ProcessingOptions
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = getOrCreateWorker();
    if (!worker) {
      reject(new Error('WORKER_UNAVAILABLE'));
      return;
    }

    if (options?.signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const id = nextJobId++;
    let settled = false;

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      options?.signal?.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      if (settled) return;
      settled = true;
      try {
        worker.postMessage({ type: 'cancel', id });
      } catch {
        // ignore
      }
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const handleMessage = (event: MessageEvent<any>) => {
      const data = event.data;
      if (!data || data.id !== id) return;

      if (data.type === 'progress') {
        options?.onProgress?.({ percent: data.percent, stage: data.stage });
        return;
      }

      if (data.type === 'result') {
        settled = true;
        cleanup();
        resolve(data.result as T);
        return;
      }

      if (data.type === 'error') {
        settled = true;
        cleanup();
        if (data.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
        } else {
          const err: any = new Error(data.error || 'Worker processing error');
          err.isMemoryError = Boolean(data.isMemoryError);
          reject(err);
        }
      }
    };

    const handleError = () => {
      if (settled) return;
      settled = true;
      workerUnavailable = true;
      cleanup();
      reject(new Error('WORKER_UNAVAILABLE'));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    options?.signal?.addEventListener('abort', handleAbort, { once: true });

    worker.postMessage({
      type: 'run',
      id,
      op,
      source,
      payload,
    });
  });
}

/**
 * Loads an image from a URL or Object URL into an HTMLImageElement safely.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load or decode image'));
    img.src = src;
  });
}

/**
 * Resolves a Blob or HTMLImageElement to a drawable HTMLImageElement (only used for fallback path).
 */
async function resolveDrawableElement(
  source: ImageProcessingSource
): Promise<{ img: HTMLImageElement; tempUrl?: string }> {
  if (source instanceof Blob) {
    const tempUrl = URL.createObjectURL(source);
    try {
      const img = await loadImageElement(tempUrl);
      return { img, tempUrl };
    } catch (err) {
      revokeObjectUrlSafe(tempUrl);
      throw err;
    }
  }
  return { img: source };
}

/**
 * Formats byte values into clean, readable KB or MB strings for DM Mono display.
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  if (bytes < k) {
    return `${bytes} B`;
  }
  const kb = bytes / k;
  if (kb < k) {
    return `${kb.toFixed(dm)} KB`;
  }
  const mb = kb / k;
  return `${mb.toFixed(dm)} MB`;
}

/**
 * Converts a Canvas to a Blob asynchronously.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
          } else {
            reject(new Error('Canvas export produced empty blob — device memory limit may have been reached.'));
          }
        },
        format,
        quality
      );
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Converts a Blob to a data URL (kept for backwards compatibility where small data URLs are explicitly needed).
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper to get clean file extension from ImageFormat.
 */
export function getExtension(format: ImageFormat): string {
  switch (format) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
    default:
      return 'jpg';
  }
}

// ==========================================
// 1. IMAGE SPLITTER ENGINE
// ==========================================

export interface SplitResult {
  tiles: SplitTile[];
  totalRows: number;
  totalCols: number;
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Splits an image into a grid of rows x cols tiles.
 * Uses exact integer remainder distribution math so zero pixels are lost.
 */
export async function splitImage(
  source: ImageProcessingSource,
  config: SplitConfig,
  options?: ProcessingOptions
): Promise<SplitResult> {
  if (source instanceof Blob && source.size > 0 && canUseImageWorker()) {
    try {
      const workerResult = await runWorkerJob<{
        tiles: Array<Omit<SplitTile, 'dataUrl'>>;
        totalRows: number;
        totalCols: number;
        sourceWidth: number;
        sourceHeight: number;
      }>('split', source, { config }, options);

      const tiles: SplitTile[] = workerResult.tiles.map((t) => ({
        ...t,
        dataUrl: URL.createObjectURL(t.blob),
      }));

      return {
        ...workerResult,
        tiles,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.isMemoryError) {
        throw err;
      }
      // Fall back cleanly to main-thread async canvas if worker/OffscreenCanvas is unavailable
    }
  }

  const { img, tempUrl } = await resolveDrawableElement(source);

  try {
    const { mode, rows, cols, format, quality, fileNamePrefix, carouselSlideCount } = config;

    let activeRows = rows;
    let activeCols = cols;

    if (mode === 'rows') {
      activeRows = Math.max(1, rows);
      activeCols = 1;
    } else if (mode === 'columns') {
      activeRows = 1;
      activeCols = Math.max(1, cols);
    } else if (mode === 'carousel') {
      activeRows = 1;
      activeCols = Math.max(2, carouselSlideCount || 2);
    } else {
      activeRows = Math.max(1, rows);
      activeCols = Math.max(1, cols);
    }

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    if (!srcW || !srcH) {
      throw new Error('Image dimensions could not be determined. Please ensure the image is loaded.');
    }

    const totalTiles = activeRows * activeCols;
    const tiles: SplitTile[] = [];
    const ext = getExtension(format);
    const canvas = document.createElement('canvas');
    let index = 1;

    try {
      for (let r = 0; r < activeRows; r++) {
        const startY = Math.round((r * srcH) / activeRows);
        const endY = Math.round(((r + 1) * srcH) / activeRows);
        const tileH = Math.max(1, endY - startY);

        for (let c = 0; c < activeCols; c++) {
          if (options?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          const startX = Math.round((c * srcW) / activeCols);
          const endX = Math.round(((c + 1) * srcW) / activeCols);
          const tileW = Math.max(1, endX - startX);

          canvas.width = tileW;
          canvas.height = tileH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Insufficient browser memory to obtain canvas 2D context.');
          }

          if (format === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, tileW, tileH);
          } else {
            ctx.clearRect(0, 0, tileW, tileH);
          }

          ctx.drawImage(img, startX, startY, tileW, tileH, 0, 0, tileW, tileH);

          const q = Math.max(0.01, Math.min(1.0, quality > 1 ? quality / 100 : quality));
          const blob = await canvasToBlob(canvas, format, q);
          const dataUrl = URL.createObjectURL(blob);
          const paddedIndex = String(index).padStart(2, '0');
          const fileName = `${fileNamePrefix || 'tile'}-${paddedIndex}.${ext}`;

          tiles.push({
            id: `tile-${r}-${c}-${index}`,
            index,
            row: r,
            col: c,
            dataUrl,
            blob,
            width: tileW,
            height: tileH,
            fileName,
          });

          options?.onProgress?.({
            percent: Math.round((index / totalTiles) * 100),
            stage: `Splitting slice ${index} of ${totalTiles}...`,
          });

          index++;
          await yieldToMain();
        }
      }
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }

    return {
      tiles,
      totalRows: activeRows,
      totalCols: activeCols,
      sourceWidth: srcW,
      sourceHeight: srcH,
    };
  } finally {
    revokeObjectUrlSafe(tempUrl);
  }
}

export interface ExportableFile {
  fileName: string;
  blob: Blob;
  width?: number;
  height?: number;
}

/**
 * Packages one or more generated image files into a single valid ZIP archive using JSZip.
 */
export async function createFilesZipArchive(
  files: ExportableFile[],
  manifestTitle: string = 'PIXORA — Export Manifest',
  instructionNote?: string,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  let totalInputBytes = 0;

  for (const file of files) {
    totalInputBytes += file.blob.size;
    zip.file(file.fileName, file.blob);
  }

  const manifestContent = [
    manifestTitle,
    '='.repeat(Math.max(24, manifestTitle.length)),
    `Exported: ${new Date().toISOString()}`,
    `Total Files: ${files.length}`,
    '',
    instructionNote || 'All generated image files are packaged in full quality.',
    '',
    'Included Files:',
    ...files.map((f) => {
      const dims = f.width && f.height ? `${f.width}x${f.height} px, ` : '';
      return `  ${f.fileName}: ${dims}${formatBytes(f.blob.size)}`;
    }),
    '',
    'Created with PIXORA (Your images. Every format. One place.)',
  ].join('\n');

  zip.file('EXPORT_MANIFEST.txt', manifestContent);

  // Use faster, memory-light DEFLATE level for large payloads (>15MB), standard level 6 otherwise
  const compressionLevel = totalInputBytes > 15 * 1024 * 1024 ? 1 : 6;

  return await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
      streamFiles: true,
    },
    (metadata) => {
      onProgress?.(Math.round(metadata.percent));
    }
  );
}

/**
 * Packages all split tiles into a single ZIP archive using JSZip.
 */
export async function createZipArchive(
  tiles: SplitTile[],
  _zipFileName: string = 'pixora-split-export.zip',
  instructionNote?: string,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  return createFilesZipArchive(
    tiles.map((t) => ({
      fileName: t.fileName,
      blob: t.blob,
      width: t.width,
      height: t.height,
    })),
    'PIXORA — Image Split Export Manifest',
    instructionNote || 'Tiles are sequentially numbered in post order.',
    onProgress
  );
}

// ==========================================
// 2. IMAGE COMPRESSOR ENGINE
// ==========================================

/**
 * Genuine image compression with target size convergence.
 * Employs binary search across quality factors and dimension scaling if necessary.
 */
export async function compressImage(
  source: ImageProcessingSource,
  config: CompressionConfig,
  originalBytes: number,
  options?: ProcessingOptions
): Promise<CompressionResult> {
  if (source instanceof Blob && source.size > 0 && canUseImageWorker()) {
    try {
      const workerResult = await runWorkerJob<Omit<CompressionResult, 'dataUrl'>>(
        'compress',
        source,
        { config, originalBytes },
        options
      );
      return {
        ...workerResult,
        dataUrl: URL.createObjectURL(workerResult.blob),
      };
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.isMemoryError) {
        throw err;
      }
      // Fall back to main-thread async canvas
    }
  }

  const { img, tempUrl } = await resolveDrawableElement(source);

  try {
    const { mode, targetUnit, targetValue, manualQuality, format, flattenColor } = config;

    options?.onProgress?.({ percent: 10, stage: 'Inspecting image channels...' });
    const hasAlpha = checkCanvasAlpha(img);
    const hasAlphaWarning = hasAlpha && format === 'image/jpeg';

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Insufficient browser memory to allocate compression canvas.');
    }

    const prepareCanvasWithBackground = (
      targetCanvas: HTMLCanvasElement,
      targetCtx: CanvasRenderingContext2D
    ) => {
      targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      if (format === 'image/jpeg') {
        targetCtx.fillStyle = flattenColor || '#FFFFFF';
        targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
      }
      targetCtx.drawImage(img, 0, 0, targetCanvas.width, targetCanvas.height);
    };

    try {
      if (mode === 'manual') {
        if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        options?.onProgress?.({ percent: 50, stage: 'Encoding compressed image...' });
        prepareCanvasWithBackground(canvas, ctx);
        const q = Math.max(0.01, Math.min(1.0, manualQuality / 100));
        const blob = await canvasToBlob(canvas, format, q);
        const dataUrl = URL.createObjectURL(blob);
        const reduction = originalBytes > 0 ? ((originalBytes - blob.size) / originalBytes) * 100 : 0;

        options?.onProgress?.({ percent: 100, stage: 'Complete' });
        return {
          blob,
          dataUrl,
          originalSize: originalBytes,
          compressedSize: blob.size,
          reductionPercentage: reduction,
          qualityUsed: manualQuality,
          width: canvas.width,
          height: canvas.height,
          format,
          hasAlphaWarning,
        };
      }

      const multiplier = targetUnit === 'MB' ? 1024 * 1024 : 1024;
      const targetBytes = Math.max(1024, targetValue * multiplier);

      prepareCanvasWithBackground(canvas, ctx);

      let lowQ = 0.05;
      let highQ = 0.98;
      let bestBlob: Blob | null = null;
      let bestQuality = 0.8;
      const iterations = 8;

      for (let i = 0; i < iterations; i++) {
        if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        options?.onProgress?.({
          percent: Math.round(15 + ((i + 1) / iterations) * 55),
          stage: `Target convergence pass ${i + 1}/${iterations}...`,
        });

        const testQ = (lowQ + highQ) / 2;
        const testBlob = await canvasToBlob(canvas, format, testQ);

        if (testBlob.size <= targetBytes) {
          bestBlob = testBlob;
          bestQuality = testQ;
          lowQ = testQ;
        } else {
          highQ = testQ;
          if (!bestBlob) {
            bestBlob = testBlob;
            bestQuality = testQ;
          }
        }
        await yieldToMain();
      }

      let currentWidth = canvas.width;
      let currentHeight = canvas.height;

      if (bestBlob && bestBlob.size > targetBytes) {
        let scaleAttempts = 0;
        while (
          bestBlob &&
          bestBlob.size > targetBytes &&
          scaleAttempts < 8 &&
          currentWidth > 200 &&
          currentHeight > 200
        ) {
          if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          scaleAttempts++;
          options?.onProgress?.({
            percent: Math.round(70 + (scaleAttempts / 8) * 25),
            stage: `Adjusting pixel dimensions (${scaleAttempts}/8)...`,
          });

          currentWidth = Math.round(currentWidth * 0.85);
          currentHeight = Math.round(currentHeight * 0.85);

          canvas.width = currentWidth;
          canvas.height = currentHeight;
          const scaledCtx = canvas.getContext('2d');
          if (!scaledCtx) break;

          prepareCanvasWithBackground(canvas, scaledCtx);
          bestBlob = await canvasToBlob(canvas, format, 0.7);
          bestQuality = 0.7;
          await yieldToMain();
        }
      }

      if (!bestBlob) {
        bestBlob = await canvasToBlob(canvas, format, 0.75);
      }

      const dataUrl = URL.createObjectURL(bestBlob);
      const reduction = originalBytes > 0 ? ((originalBytes - bestBlob.size) / originalBytes) * 100 : 0;

      options?.onProgress?.({ percent: 100, stage: 'Complete' });
      return {
        blob: bestBlob,
        dataUrl,
        originalSize: originalBytes,
        compressedSize: bestBlob.size,
        reductionPercentage: reduction,
        qualityUsed: Math.round(bestQuality * 100),
        width: canvas.width,
        height: canvas.height,
        format,
        hasAlphaWarning,
      };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    revokeObjectUrlSafe(tempUrl);
  }
}

// ==========================================
// 3. IMAGE RESIZER ENGINE
// ==========================================

export interface ResizeResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  sizeBytes: number;
}

export async function resizeImage(
  source: ImageProcessingSource,
  config: ResizeConfig,
  options?: ProcessingOptions
): Promise<ResizeResult> {
  if (source instanceof Blob && source.size > 0 && canUseImageWorker()) {
    try {
      const workerResult = await runWorkerJob<Omit<ResizeResult, 'dataUrl'>>(
        'resize',
        source,
        { config },
        options
      );
      return {
        ...workerResult,
        dataUrl: URL.createObjectURL(workerResult.blob),
      };
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.isMemoryError) {
        throw err;
      }
      // Fall back to main-thread async canvas
    }
  }

  const { img, tempUrl } = await resolveDrawableElement(source);

  try {
    const { width, height, format, quality } = config;
    const validW = Math.max(1, Math.min(width, 16384));
    const validH = Math.max(1, Math.min(height, 16384));

    options?.onProgress?.({ percent: 40, stage: `Resampling to ${validW}×${validH} px...` });
    await yieldToMain();
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const canvas = document.createElement('canvas');
    canvas.width = validW;
    canvas.height = validH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Insufficient browser memory to allocate resize canvas.');

    try {
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, validW, validH);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, validW, validH);

      options?.onProgress?.({ percent: 80, stage: 'Encoding resized image...' });
      const q = Math.max(0.01, Math.min(1.0, quality / 100));
      const blob = await canvasToBlob(canvas, format, q);
      const dataUrl = URL.createObjectURL(blob);

      options?.onProgress?.({ percent: 100, stage: 'Complete' });
      return {
        blob,
        dataUrl,
        width: validW,
        height: validH,
        originalWidth: img.naturalWidth || img.width,
        originalHeight: img.naturalHeight || img.height,
        sizeBytes: blob.size,
      };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    revokeObjectUrlSafe(tempUrl);
  }
}

// ==========================================
// 4. IMAGE CROPPER ENGINE
// ==========================================

export interface CropResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export async function cropImage(
  source: ImageProcessingSource,
  rect: CropRect,
  config: CropConfig,
  options?: ProcessingOptions
): Promise<CropResult> {
  if (source instanceof Blob && source.size > 0 && canUseImageWorker()) {
    try {
      const workerResult = await runWorkerJob<Omit<CropResult, 'dataUrl'>>(
        'crop',
        source,
        { rect, config },
        options
      );
      return {
        ...workerResult,
        dataUrl: URL.createObjectURL(workerResult.blob),
      };
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.isMemoryError) {
        throw err;
      }
      // Fall back to main-thread async canvas
    }
  }

  const { img, tempUrl } = await resolveDrawableElement(source);

  try {
    const { rotation, flipHorizontal, flipVertical, format, quality } = config;
    const rotRad = (rotation * Math.PI) / 180;
    const isRotated90or270 = rotation % 180 !== 0;

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const baseW = isRotated90or270 ? srcH : srcW;
    const baseH = isRotated90or270 ? srcW : srcH;

    const safeX = Math.max(0, Math.min(rect.x, baseW - 1));
    const safeY = Math.max(0, Math.min(rect.y, baseH - 1));
    const safeW = Math.max(1, Math.min(rect.width, baseW - safeX));
    const safeH = Math.max(1, Math.min(rect.height, baseH - safeY));

    options?.onProgress?.({ percent: 45, stage: `Extracting ${safeW}×${safeH} px crop...` });
    await yieldToMain();
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = safeW;
    cropCanvas.height = safeH;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) {
      throw new Error('Insufficient browser memory to allocate crop canvas.');
    }

    try {
      if (format === 'image/jpeg') {
        cropCtx.fillStyle = '#FFFFFF';
        cropCtx.fillRect(0, 0, safeW, safeH);
      }

      cropCtx.imageSmoothingEnabled = true;
      cropCtx.imageSmoothingQuality = 'high';

      // Transform directly into the cropped canvas without allocating a full-size intermediate canvas
      cropCtx.save();
      cropCtx.translate(-safeX, -safeY);
      cropCtx.translate(baseW / 2, baseH / 2);
      cropCtx.rotate(rotRad);
      cropCtx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
      cropCtx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
      cropCtx.restore();

      options?.onProgress?.({ percent: 80, stage: 'Encoding cropped image...' });
      const q = Math.max(0.01, Math.min(1.0, quality / 100));
      const blob = await canvasToBlob(cropCanvas, format, q);
      const dataUrl = URL.createObjectURL(blob);

      options?.onProgress?.({ percent: 100, stage: 'Complete' });
      return {
        blob,
        dataUrl,
        width: safeW,
        height: safeH,
        sizeBytes: blob.size,
      };
    } finally {
      cropCanvas.width = 0;
      cropCanvas.height = 0;
    }
  } finally {
    revokeObjectUrlSafe(tempUrl);
  }
}

/**
 * Downloads a Blob directly with specified filename.
 * Uses a generous cleanup delay so mobile Safari / Android / desktop browsers complete handoff.
 */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) {
      document.body.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }, 1500);
}
