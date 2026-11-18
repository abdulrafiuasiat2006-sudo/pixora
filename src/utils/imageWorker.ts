/// <reference lib="webworker" />
import {
  CompressionConfig,
  CropConfig,
  CropRect,
  ImageFormat,
  ResizeConfig,
  SplitConfig,
} from '../types';

interface WorkerJobRequest {
  type: 'run';
  id: number;
  op: 'split' | 'compress' | 'resize' | 'crop';
  source: Blob;
  payload: any;
}

interface WorkerCancelRequest {
  type: 'cancel';
  id: number;
}

const cancelledJobs = new Set<number>();

function postProgress(id: number, percent: number, stage: string) {
  self.postMessage({
    id,
    type: 'progress',
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    stage,
  });
}

function getExtension(format: ImageFormat): string {
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

function isMemoryOrCanvasError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('memory') ||
    msg.includes('out of') ||
    msg.includes('allocation') ||
    msg.includes('canvas') ||
    msg.includes('exceeds') ||
    msg.includes('rangeerror') ||
    err?.name === 'RangeError' ||
    err?.name === 'QuotaExceededError'
  );
}

function checkBitmapAlpha(bitmap: ImageBitmap): boolean {
  const sampleW = Math.max(1, Math.min(bitmap.width, 200));
  const sampleH = Math.max(1, Math.min(bitmap.height, 200));
  const tempCanvas = new OffscreenCanvas(sampleW, sampleH);
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) return false;
  try {
    ctx.drawImage(bitmap, 0, 0, sampleW, sampleH);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    tempCanvas.width = 0;
    tempCanvas.height = 0;
  }
}

async function runSplit(id: number, bitmap: ImageBitmap, config: SplitConfig) {
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

  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const totalTiles = activeRows * activeCols;
  const tiles: Array<{
    id: string;
    index: number;
    row: number;
    col: number;
    blob: Blob;
    width: number;
    height: number;
    fileName: string;
  }> = [];

  const ext = getExtension(format);
  const workCanvas = new OffscreenCanvas(1, 1);
  let index = 1;

  try {
    for (let r = 0; r < activeRows; r++) {
      const startY = Math.round((r * srcH) / activeRows);
      const endY = Math.round(((r + 1) * srcH) / activeRows);
      const tileH = Math.max(1, endY - startY);

      for (let c = 0; c < activeCols; c++) {
        if (cancelledJobs.has(id)) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const startX = Math.round((c * srcW) / activeCols);
        const endX = Math.round(((c + 1) * srcW) / activeCols);
        const tileW = Math.max(1, endX - startX);

        workCanvas.width = tileW;
        workCanvas.height = tileH;
        const ctx = workCanvas.getContext('2d');
        if (!ctx) {
          throw new Error('Insufficient browser memory to allocate tile canvas.');
        }

        if (format === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, tileW, tileH);
        } else {
          ctx.clearRect(0, 0, tileW, tileH);
        }

        ctx.drawImage(bitmap, startX, startY, tileW, tileH, 0, 0, tileW, tileH);

        const q = Math.max(0.01, Math.min(1.0, quality > 1 ? quality / 100 : quality));
        const blob = await workCanvas.convertToBlob({ type: format, quality: q });
        if (!blob || blob.size === 0) {
          throw new Error('Tile encoding failed due to insufficient device memory.');
        }

        const paddedIndex = String(index).padStart(2, '0');
        const fileName = `${fileNamePrefix || 'tile'}-${paddedIndex}.${ext}`;

        tiles.push({
          id: `tile-${r}-${c}-${index}`,
          index,
          row: r,
          col: c,
          blob,
          width: tileW,
          height: tileH,
          fileName,
        });

        postProgress(id, 10 + (index / totalTiles) * 88, `Splitting slice ${index} of ${totalTiles}...`);
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
  } finally {
    workCanvas.width = 0;
    workCanvas.height = 0;
  }
}

async function runCompress(
  id: number,
  bitmap: ImageBitmap,
  config: CompressionConfig,
  originalBytes: number
) {
  const { mode, targetUnit, targetValue, manualQuality, format, flattenColor } = config;
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  postProgress(id, 12, 'Inspecting image channels...');
  const hasAlpha = checkBitmapAlpha(bitmap);
  const hasAlphaWarning = hasAlpha && format === 'image/jpeg';

  let canvas = new OffscreenCanvas(srcW, srcH);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Insufficient device memory to create compression canvas.');
  }

  const drawPrepared = (targetCanvas: OffscreenCanvas, targetCtx: OffscreenCanvasRenderingContext2D) => {
    targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    if (format === 'image/jpeg') {
      targetCtx.fillStyle = flattenColor || '#FFFFFF';
      targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    }
    targetCtx.drawImage(bitmap, 0, 0, targetCanvas.width, targetCanvas.height);
  };

  try {
    if (mode === 'manual') {
      if (cancelledJobs.has(id)) throw new DOMException('Aborted', 'AbortError');
      postProgress(id, 45, 'Encoding compressed image...');
      drawPrepared(canvas, ctx);
      const q = Math.max(0.01, Math.min(1.0, manualQuality / 100));
      const blob = await canvas.convertToBlob({ type: format, quality: q });
      if (!blob || blob.size === 0) throw new Error('Compression produced an empty output.');
      const reduction = originalBytes > 0 ? ((originalBytes - blob.size) / originalBytes) * 100 : 0;

      return {
        blob,
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

    drawPrepared(canvas, ctx);

    let lowQ = 0.05;
    let highQ = 0.98;
    let bestBlob: Blob | null = null;
    let bestQuality = 0.8;
    const iterations = 8;

    for (let i = 0; i < iterations; i++) {
      if (cancelledJobs.has(id)) throw new DOMException('Aborted', 'AbortError');
      postProgress(id, 15 + ((i + 1) / iterations) * 55, `Target convergence pass ${i + 1}/${iterations}...`);
      const testQ = (lowQ + highQ) / 2;
      const testBlob = await canvas.convertToBlob({ type: format, quality: testQ });

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
        if (cancelledJobs.has(id)) throw new DOMException('Aborted', 'AbortError');
        scaleAttempts++;
        postProgress(
          id,
          70 + (scaleAttempts / 8) * 25,
          `Adjusting pixel dimensions (${scaleAttempts}/8)...`
        );

        currentWidth = Math.round(currentWidth * 0.85);
        currentHeight = Math.round(currentHeight * 0.85);

        canvas.width = currentWidth;
        canvas.height = currentHeight;
        const scaledCtx = canvas.getContext('2d');
        if (!scaledCtx) break;

        drawPrepared(canvas, scaledCtx);
        bestBlob = await canvas.convertToBlob({ type: format, quality: 0.7 });
        bestQuality = 0.7;
      }
    }

    if (!bestBlob) {
      bestBlob = await canvas.convertToBlob({ type: format, quality: 0.75 });
    }

    const reduction = originalBytes > 0 ? ((originalBytes - bestBlob.size) / originalBytes) * 100 : 0;

    return {
      blob: bestBlob,
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
}

async function runResize(id: number, bitmap: ImageBitmap, config: ResizeConfig) {
  const { width, height, format, quality } = config;
  const validW = Math.max(1, Math.min(width, 16384));
  const validH = Math.max(1, Math.min(height, 16384));

  postProgress(id, 35, `Resampling to ${validW}×${validH} px...`);
  const canvas = new OffscreenCanvas(validW, validH);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Insufficient device memory to allocate resize canvas.');
  }

  try {
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, validW, validH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, validW, validH);

    if (cancelledJobs.has(id)) throw new DOMException('Aborted', 'AbortError');
    postProgress(id, 75, 'Encoding resized image...');

    const q = Math.max(0.01, Math.min(1.0, quality / 100));
    const blob = await canvas.convertToBlob({ type: format, quality: q });
    if (!blob || blob.size === 0) {
      throw new Error('Resized image export produced empty data.');
    }

    return {
      blob,
      width: validW,
      height: validH,
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      sizeBytes: blob.size,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function runCrop(id: number, bitmap: ImageBitmap, rect: CropRect, config: CropConfig) {
  const { rotation, flipHorizontal, flipVertical, format, quality } = config;
  const rotRad = (rotation * Math.PI) / 180;
  const isRotated90or270 = rotation % 180 !== 0;

  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const baseW = isRotated90or270 ? srcH : srcW;
  const baseH = isRotated90or270 ? srcW : srcH;

  const safeX = Math.max(0, Math.min(rect.x, baseW - 1));
  const safeY = Math.max(0, Math.min(rect.y, baseH - 1));
  const safeW = Math.max(1, Math.min(rect.width, baseW - safeX));
  const safeH = Math.max(1, Math.min(rect.height, baseH - safeY));

  postProgress(id, 40, `Extracting ${safeW}×${safeH} px crop...`);

  const cropCanvas = new OffscreenCanvas(safeW, safeH);
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) {
    throw new Error('Insufficient device memory to allocate crop canvas.');
  }

  try {
    if (format === 'image/jpeg') {
      cropCtx.fillStyle = '#FFFFFF';
      cropCtx.fillRect(0, 0, safeW, safeH);
    }

    cropCtx.imageSmoothingEnabled = true;
    cropCtx.imageSmoothingQuality = 'high';

    // Transform directly into the cropped viewport — avoids allocating a full-size intermediate canvas
    cropCtx.save();
    cropCtx.translate(-safeX, -safeY);
    cropCtx.translate(baseW / 2, baseH / 2);
    cropCtx.rotate(rotRad);
    cropCtx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
    cropCtx.drawImage(bitmap, -srcW / 2, -srcH / 2, srcW, srcH);
    cropCtx.restore();

    if (cancelledJobs.has(id)) throw new DOMException('Aborted', 'AbortError');
    postProgress(id, 75, 'Encoding cropped image...');

    const q = Math.max(0.01, Math.min(1.0, quality / 100));
    const blob = await cropCanvas.convertToBlob({ type: format, quality: q });
    if (!blob || blob.size === 0) {
      throw new Error('Cropped image export produced empty data.');
    }

    return {
      blob,
      width: safeW,
      height: safeH,
      sizeBytes: blob.size,
    };
  } finally {
    cropCanvas.width = 0;
    cropCanvas.height = 0;
  }
}

self.onmessage = async (event: MessageEvent<WorkerJobRequest | WorkerCancelRequest>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    cancelledJobs.add(msg.id);
    return;
  }

  const { id, op, source, payload } = msg;
  let bitmap: ImageBitmap | null = null;

  try {
    if (cancelledJobs.has(id)) {
      throw new DOMException('Aborted', 'AbortError');
    }

    postProgress(id, 5, 'Decoding image locally in worker...');
    bitmap = await createImageBitmap(source);

    if (cancelledJobs.has(id)) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let result: any;
    if (op === 'split') {
      result = await runSplit(id, bitmap, payload.config);
    } else if (op === 'compress') {
      result = await runCompress(id, bitmap, payload.config, payload.originalBytes);
    } else if (op === 'resize') {
      result = await runResize(id, bitmap, payload.config);
    } else if (op === 'crop') {
      result = await runCrop(id, bitmap, payload.rect, payload.config);
    } else {
      throw new Error(`Unsupported worker operation: ${op}`);
    }

    postProgress(id, 100, 'Complete');
    self.postMessage({ id, type: 'result', result });
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    self.postMessage({
      id,
      type: 'error',
      aborted,
      isMemoryError: !aborted && isMemoryOrCanvasError(err),
      error: err?.message || 'Worker image processing failed.',
    });
  } finally {
    cancelledJobs.delete(id);
    if (bitmap) {
      try {
        bitmap.close();
      } catch {
        // ignore
      }
    }
  }
};
