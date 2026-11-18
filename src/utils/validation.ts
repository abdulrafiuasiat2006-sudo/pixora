export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  detectedMime?: string;
  hasAlpha?: boolean;
}

export interface DeviceResourceProfile {
  isMobile: boolean;
  deviceMemoryGB: number | null;
  isLowMemory: boolean;
  maxCanvasDimensionPx: number;
  maxMegapixels: number;
}

// 70 MB per image limit enforced across upload, validation, and client-side processing
export const MAX_FILE_SIZE_MB = 70;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; // 70 MB
export const WARN_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB advisory threshold

// High-resolution safety ceiling (allows large 50-70 MB images while blocking extreme decompression bombs)
export const MAX_SINGLE_DIMENSION_PX = 16384; // Browser 2D canvas standard ceiling
export const MAX_MEGAPIXELS = 135; // Up to 135 MP (~540 MB RGBA buffer)

/**
 * Inspects available browser/device hardware hints to adapt processing safely across mobile, tablet, and desktop.
 */
export function getDeviceResourceProfile(): DeviceResourceProfile {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const rawMemory =
    typeof navigator !== 'undefined' && typeof (navigator as any).deviceMemory === 'number'
      ? ((navigator as any).deviceMemory as number)
      : null;

  const isLowMemory =
    (rawMemory !== null && rawMemory <= 2) ||
    (isMobile && rawMemory !== null && rawMemory <= 3);

  return {
    isMobile,
    deviceMemoryGB: rawMemory,
    isLowMemory,
    maxCanvasDimensionPx: isLowMemory ? 12000 : MAX_SINGLE_DIMENSION_PX,
    maxMegapixels: isLowMemory ? 85 : MAX_MEGAPIXELS,
  };
}

/**
 * Sniffs the magic bytes in the initial file header to determine real MIME type.
 * Validates real binary signatures rather than relying on file extensions.
 */
export async function sniffMagicBytes(file: File): Promise<string | null> {
  try {
    const slice = file.slice(0, 16);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // JPEG signature: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'image/png';
    }

    // WebP signature: RIFF .... WEBP
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp';
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validates decoded image pixel dimensions against browser canvas & device memory ceilings.
 */
export function validateDecodedDimensions(width: number, height: number): ValidationResult {
  if (width <= 0 || height <= 0) {
    return { valid: false, error: 'Invalid or zero pixel dimensions.' };
  }

  const profile = getDeviceResourceProfile();

  if (width > MAX_SINGLE_DIMENSION_PX || height > MAX_SINGLE_DIMENSION_PX) {
    return {
      valid: false,
      error: `Image dimensions (${width}×${height} px) exceed the browser canvas axis ceiling of ${MAX_SINGLE_DIMENSION_PX.toLocaleString()} px.`,
    };
  }

  const megaPixels = (width * height) / 1_000_000;
  if (megaPixels > MAX_MEGAPIXELS) {
    return {
      valid: false,
      error: `Image expands to ${megaPixels.toFixed(1)} MP, exceeding the ${MAX_MEGAPIXELS} Megapixel browser memory safety limit.`,
    };
  }

  let warning: string | undefined;
  if (profile.isMobile && megaPixels > 45) {
    warning = `High-resolution image (${megaPixels.toFixed(1)} MP) detected on a mobile device. Processing may take a little longer depending on available device memory.`;
  } else if (profile.isLowMemory && megaPixels > profile.maxMegapixels * 0.7) {
    warning = `Large image (${megaPixels.toFixed(1)} MP) detected on a device with limited memory. If processing fails, try resizing or using a desktop browser.`;
  }

  return { valid: true, warning };
}

/**
 * Detects whether an image has any pixels with alpha < 255 using a lightweight 200x200 sample.
 */
export function checkCanvasAlpha(
  source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  _ctx?: CanvasRenderingContext2D
): boolean {
  try {
    const srcW =
      source instanceof HTMLCanvasElement
        ? source.width
        : source instanceof HTMLImageElement
        ? source.naturalWidth || source.width
        : source.width;
    const srcH =
      source instanceof HTMLCanvasElement
        ? source.height
        : source instanceof HTMLImageElement
        ? source.naturalHeight || source.height
        : source.height;

    const sampleWidth = Math.max(1, Math.min(srcW, 200));
    const sampleHeight = Math.max(1, Math.min(srcH, 200));
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sampleWidth;
    tempCanvas.height = sampleHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return false;

    tempCtx.drawImage(source, 0, 0, sampleWidth, sampleHeight);
    const imgData = tempCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imgData.data;

    // Check alpha byte (every 4th byte)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) {
        tempCanvas.width = 0;
        tempCanvas.height = 0;
        return true;
      }
    }
    tempCanvas.width = 0;
    tempCanvas.height = 0;
    return false;
  } catch {
    return false;
  }
}

/**
 * Full file size and binary signature validation before loading into workspace.
 */
export async function validateImageFile(file: File): Promise<ValidationResult> {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  // 1. File size check (70 MB limit)
  if (file.size <= 0) {
    return { valid: false, error: 'The selected file is empty (0 bytes).' };
  }

  const sizeMB = file.size / (1024 * 1024);

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `This file is ${sizeMB.toFixed(2)} MB, which exceeds the ${MAX_FILE_SIZE_MB} MB per-image limit. Please select an image that is ${MAX_FILE_SIZE_MB} MB or smaller.`,
    };
  }

  // 2. MIME type & Magic byte verification
  const detectedMime = await sniffMagicBytes(file);
  const acceptedMimes = ['image/jpeg', 'image/png', 'image/webp'];

  if (!detectedMime || !acceptedMimes.includes(detectedMime)) {
    return {
      valid: false,
      error: `Unsupported or unrecognized image format. Please choose a valid JPEG, PNG, or WebP image.`,
      detectedMime: detectedMime || 'unknown',
    };
  }

  const profile = getDeviceResourceProfile();
  let warning: string | undefined;
  if (profile.isMobile && file.size > 35 * 1024 * 1024) {
    warning = `Large image (${sizeMB.toFixed(1)} MB) loaded on a mobile device. All processing runs locally and may take a few seconds.`;
  } else if (file.size > WARN_FILE_SIZE_BYTES) {
    warning = `Large image (${sizeMB.toFixed(1)} MB / ${MAX_FILE_SIZE_MB} MB max) loaded locally.`;
  }

  return {
    valid: true,
    warning,
    detectedMime,
  };
}

/**
 * Text sanitizer: escapes HTML entities and prevents XSS injection into the DOM.
 */
export function sanitizeUserInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}
