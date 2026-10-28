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
} from '../types';
import { checkCanvasAlpha } from './validation';

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
 * Converts a Canvas to a Blob asynchronously with fallback.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas export produced empty blob'));
        }
      },
      format,
      quality
    );
  });
}

/**
 * Converts a Blob to an Object URL or data URL.
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
  img: HTMLImageElement,
  config: SplitConfig
): Promise<SplitResult> {
  const { mode, rows, cols, format, quality, fileNamePrefix, carouselSlideCount } = config;
  const activeRows = mode === 'carousel' ? 1 : rows;
  const activeCols = mode === 'carousel' ? carouselSlideCount : cols;

  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  const tiles: SplitTile[] = [];
  let index = 1;

  for (let r = 0; r < activeRows; r++) {
    // Exact vertical slice calculation
    const startY = Math.round((r * srcH) / activeRows);
    const endY = Math.round(((r + 1) * srcH) / activeRows);
    const tileH = endY - startY;

    for (let c = 0; c < activeCols; c++) {
      // Exact horizontal slice calculation
      const startX = Math.round((c * srcW) / activeCols);
      const endX = Math.round(((c + 1) * srcW) / activeCols);
      const tileW = endX - startX;

      const canvas = document.createElement('canvas');
      canvas.width = tileW;
      canvas.height = tileH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to obtain canvas 2D context');
      }

      // If format is JPEG, fill background with white if source might have transparency
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, tileW, tileH);
      }

      // Draw the exact slice from source image
      ctx.drawImage(img, startX, startY, tileW, tileH, 0, 0, tileW, tileH);

      const blob = await canvasToBlob(canvas, format, quality);
      const dataUrl = await blobToDataUrl(blob);
      const ext = getExtension(format);
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

      index++;
    }
  }

  return {
    tiles,
    totalRows: activeRows,
    totalCols: activeCols,
    sourceWidth: srcW,
    sourceHeight: srcH,
  };
}

/**
 * Packages all split tiles into a single ZIP archive using JSZip.
 */
export async function createZipArchive(
  tiles: SplitTile[],
  zipFileName: string = 'pixora-split-export.zip',
  instructionNote?: string
): Promise<Blob> {
  const zip = new JSZip();

  // Add individual tiles
  for (const tile of tiles) {
    zip.file(tile.fileName, tile.blob);
  }

  // Add an informative README / posting guide inside the zip
  const manifestContent = [
    'PIXORA — Image Split Export Manifest',
    '====================================',
    `Exported: ${new Date().toISOString()}`,
    `Total Tiles: ${tiles.length}`,
    '',
    instructionNote || 'Tiles are sequentially numbered in post order.',
    '',
    'Tile Dimensions:',
    ...tiles.map((t) => `  ${t.fileName}: ${t.width}x${t.height} px (${formatBytes(t.blob.size)})`),
    '',
    'Created with PIXORA (Your images. Every format. One place.)',
  ].join('\n');

  zip.file('EXPORT_MANIFEST.txt', manifestContent);

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// ==========================================
// 2. IMAGE COMPRESSOR ENGINE
// ==========================================

/**
 * Genuine image compression with target size convergence.
 * Employs binary search across quality factors and dimension scaling if necessary.
 */
export async function compressImage(
  img: HTMLImageElement,
  config: CompressionConfig,
  originalBytes: number
): Promise<CompressionResult> {
  const { mode, targetUnit, targetValue, manualQuality, format, flattenColor } = config;

  let canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  let ctx = canvas.getContext('2d')!;

  // Check if source image has alpha
  ctx.drawImage(img, 0, 0);
  const hasAlpha = checkCanvasAlpha(canvas, ctx);
  const hasAlphaWarning = hasAlpha && format === 'image/jpeg';

  const prepareCanvasWithBackground = (targetCanvas: HTMLCanvasElement, targetCtx: CanvasRenderingContext2D, src: HTMLImageElement | HTMLCanvasElement) => {
    targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    if (format === 'image/jpeg') {
      targetCtx.fillStyle = flattenColor || '#FFFFFF';
      targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    }
    targetCtx.drawImage(src, 0, 0, targetCanvas.width, targetCanvas.height);
  };

  // If manual mode: straightforward single-pass export
  if (mode === 'manual') {
    prepareCanvasWithBackground(canvas, ctx, img);
    const q = Math.max(0.01, Math.min(1.0, manualQuality / 100));
    const blob = await canvasToBlob(canvas, format, q);
    const dataUrl = await blobToDataUrl(blob);
    const reduction = originalBytes > 0 ? ((originalBytes - blob.size) / originalBytes) * 100 : 0;

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

  // TARGET SIZE MODE:
  // Calculate target bytes
  const multiplier = targetUnit === 'MB' ? 1024 * 1024 : 1024;
  const targetBytes = Math.max(1024, targetValue * multiplier);

  prepareCanvasWithBackground(canvas, ctx, img);

  // Binary search for quality
  let lowQ = 0.05;
  let highQ = 0.98;
  let bestBlob: Blob | null = null;
  let bestQuality = 0.8;
  const iterations = 8;

  for (let i = 0; i < iterations; i++) {
    const testQ = (lowQ + highQ) / 2;
    const testBlob = await canvasToBlob(canvas, format, testQ);

    if (testBlob.size <= targetBytes) {
      bestBlob = testBlob;
      bestQuality = testQ;
      // We can try higher quality
      lowQ = testQ;
    } else {
      // Too large, try lower quality
      highQ = testQ;
      if (!bestBlob) {
        bestBlob = testBlob;
        bestQuality = testQ;
      }
    }
  }

  // If even at lowest quality (0.05) the blob is still bigger than targetBytes,
  // we step down the dimensions by 10% until it meets target size or reaches min dimension
  let currentWidth = canvas.width;
  let currentHeight = canvas.height;

  if (bestBlob && bestBlob.size > targetBytes) {
    let scaleAttempts = 0;
    while (bestBlob && bestBlob.size > targetBytes && scaleAttempts < 8 && currentWidth > 200 && currentHeight > 200) {
      currentWidth = Math.round(currentWidth * 0.85);
      currentHeight = Math.round(currentHeight * 0.85);

      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = currentWidth;
      scaledCanvas.height = currentHeight;
      const scaledCtx = scaledCanvas.getContext('2d')!;

      prepareCanvasWithBackground(scaledCanvas, scaledCtx, img);
      bestBlob = await canvasToBlob(scaledCanvas, format, 0.7);
      bestQuality = 0.7;
      canvas = scaledCanvas;
      scaleAttempts++;
    }
  }

  if (!bestBlob) {
    bestBlob = await canvasToBlob(canvas, format, 0.75);
  }

  const dataUrl = await blobToDataUrl(bestBlob);
  const reduction = originalBytes > 0 ? ((originalBytes - bestBlob.size) / originalBytes) * 100 : 0;

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
  img: HTMLImageElement,
  config: ResizeConfig
): Promise<ResizeResult> {
  const { width, height, format, quality } = config;

  const validW = Math.max(1, Math.min(width, 16384));
  const validH = Math.max(1, Math.min(height, 16384));

  const canvas = document.createElement('canvas');
  canvas.width = validW;
  canvas.height = validH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  // Fill white for JPEG
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, validW, validH);
  }

  // Smooth resampling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(img, 0, 0, validW, validH);

  const q = Math.max(0.01, Math.min(1.0, quality / 100));
  const blob = await canvasToBlob(canvas, format, q);
  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    dataUrl,
    width: validW,
    height: validH,
    originalWidth: img.naturalWidth,
    originalHeight: img.naturalHeight,
    sizeBytes: blob.size,
  };
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
  img: HTMLImageElement,
  rect: CropRect,
  config: CropConfig
): Promise<CropResult> {
  const { rotation, flipHorizontal, flipVertical, format, quality } = config;

  // 1. Create a canvas for transformed base image
  const rotRad = (rotation * Math.PI) / 180;
  const isRotated90or270 = rotation % 180 !== 0;

  const baseW = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
  const baseH = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = baseW;
  baseCanvas.height = baseH;
  const baseCtx = baseCanvas.getContext('2d')!;

  baseCtx.save();
  baseCtx.translate(baseW / 2, baseH / 2);
  baseCtx.rotate(rotRad);
  baseCtx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
  baseCtx.drawImage(
    img,
    -img.naturalWidth / 2,
    -img.naturalHeight / 2,
    img.naturalWidth,
    img.naturalHeight
  );
  baseCtx.restore();

  // 2. Bound crop coordinates within baseCanvas
  const safeX = Math.max(0, Math.min(rect.x, baseW - 1));
  const safeY = Math.max(0, Math.min(rect.y, baseH - 1));
  const safeW = Math.max(1, Math.min(rect.width, baseW - safeX));
  const safeH = Math.max(1, Math.min(rect.height, baseH - safeY));

  // 3. Extract cropped segment onto target canvas
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = safeW;
  cropCanvas.height = safeH;
  const cropCtx = cropCanvas.getContext('2d')!;

  if (format === 'image/jpeg') {
    cropCtx.fillStyle = '#FFFFFF';
    cropCtx.fillRect(0, 0, safeW, safeH);
  }

  cropCtx.imageSmoothingEnabled = true;
  cropCtx.imageSmoothingQuality = 'high';
  cropCtx.drawImage(baseCanvas, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);

  const q = Math.max(0.01, Math.min(1.0, quality / 100));
  const blob = await canvasToBlob(cropCanvas, format, q);
  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    dataUrl,
    width: safeW,
    height: safeH,
    sizeBytes: blob.size,
  };
}

/**
 * Downloads a Blob directly with specified filename.
 */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
