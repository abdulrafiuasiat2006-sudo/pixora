export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  detectedMime?: string;
  hasAlpha?: boolean;
}

// 10 MB per file limit enforced in both browser and server
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const WARN_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

// Decompression bomb protection: block tiny files that expand into gigantic in-memory buffers
export const MAX_SINGLE_DIMENSION_PX = 12000; // 12,000 px max single axis
export const MAX_MEGAPIXELS = 50; // 50 Megapixels max (50,000,000 pixels)

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
 * Validates decoded image pixel dimensions to prevent decompression bombs.
 */
export function validateDecodedDimensions(width: number, height: number): ValidationResult {
  if (width <= 0 || height <= 0) {
    return { valid: false, error: 'Invalid or zero pixel dimensions.' };
  }

  if (width > MAX_SINGLE_DIMENSION_PX || height > MAX_SINGLE_DIMENSION_PX) {
    return {
      valid: false,
      error: `Image dimensions (${width}×${height}px) exceed the maximum allowed axis limit of ${MAX_SINGLE_DIMENSION_PX}px.`,
    };
  }

  const megaPixels = (width * height) / 1000000;
  if (megaPixels > MAX_MEGAPIXELS) {
    return {
      valid: false,
      error: `Decompression Bomb Blocked: Image expands to ${megaPixels.toFixed(1)} MP, exceeding the 50 Megapixel memory safety ceiling.`,
    };
  }

  return { valid: true };
}

/**
 * Detects whether an image has any pixels with alpha < 255.
 */
export function checkCanvasAlpha(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): boolean {
  try {
    const sampleWidth = Math.min(canvas.width, 400);
    const sampleHeight = Math.min(canvas.height, 400);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sampleWidth;
    tempCanvas.height = sampleHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return false;

    tempCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
    const imgData = tempCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imgData.data;

    // Check alpha byte (every 4th byte)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Full file and dimension validation before loading into workspace.
 */
export async function validateImageFile(file: File): Promise<ValidationResult> {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  // 1. File size check (Strict 10MB baseline)
  if (file.size <= 0) {
    return { valid: false, error: 'The selected file is empty (0 bytes).' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds maximum allowed size of 10MB (actual: ${(file.size / (1024 * 1024)).toFixed(2)}MB). Please choose a file under 10MB.`,
    };
  }

  // 2. MIME type & Magic byte verification
  const detectedMime = await sniffMagicBytes(file);
  const acceptedMimes = ['image/jpeg', 'image/png', 'image/webp'];

  if (!detectedMime || !acceptedMimes.includes(detectedMime)) {
    return {
      valid: false,
      error: `File signature rejected. Only authentic JPEG, PNG, and WebP images are allowed.`,
      detectedMime: detectedMime || 'unknown',
    };
  }

  let warning: string | undefined;
  if (file.size > WARN_FILE_SIZE_BYTES) {
    warning = `File is close to the 10MB limit (${(file.size / (1024 * 1024)).toFixed(2)}MB).`;
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
