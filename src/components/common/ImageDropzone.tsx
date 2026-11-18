import React, { useRef, useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { ImageFileState } from '../../types';
import {
  MAX_FILE_SIZE_MB,
  validateImageFile,
  validateDecodedDimensions,
} from '../../utils/validation';
import { formatBytes, revokeObjectUrlSafe, yieldToMain } from '../../utils/imageEngine';

interface ImageDropzoneProps {
  onImageLoaded: (imageState: ImageFileState) => void;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export const ImageDropzone: React.FC<ImageDropzoneProps> = ({
  onImageLoaded,
  title = 'Upload or drop an image',
  subtitle = `Supports JPEG, PNG, WebP up to ${MAX_FILE_SIZE_MB} MB. Processed 100% locally on your device.`,
  compact = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);

  const readDecodedDimensions = async (
    file: File,
    objectUrl: string
  ): Promise<{ width: number; height: number }> => {
    // Prefer lightweight header/bitmap probe where available, with Image fallback
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        const dims = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return dims;
      } catch {
        // Fall through to HTMLImageElement decode check
      }
    }

    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        reject(new Error('Could not decode image pixels. The file might be corrupted or unsupported on this browser.'));
      };
      img.src = objectUrl;
    });
  };

  const processFile = async (file: File) => {
    setErrorMessage(null);
    setWarningMessage(null);
    setLoading(true);
    setLoadingStage(`Checking ${formatBytes(file.size)} local file...`);

    let objectUrl: string | null = null;
    try {
      await yieldToMain();
      const validation = await validateImageFile(file);
      if (!validation.valid) {
        setErrorMessage(validation.error || 'Invalid image file.');
        setLoading(false);
        setLoadingStage(null);
        return;
      }

      if (validation.warning) {
        setWarningMessage(validation.warning);
      }

      setLoadingStage('Inspecting image dimensions locally...');
      await yieldToMain();

      // Use zero-copy Object URL instead of FileReader.readAsDataURL so 70 MB files never bloat JS heap
      objectUrl = URL.createObjectURL(file);
      const { width, height } = await readDecodedDimensions(file, objectUrl);

      const dimCheck = validateDecodedDimensions(width, height);
      if (!dimCheck.valid) {
        revokeObjectUrlSafe(objectUrl);
        objectUrl = null;
        setErrorMessage(dimCheck.error || 'Image dimension safety check failed.');
        setLoading(false);
        setLoadingStage(null);
        return;
      }

      if (dimCheck.warning) {
        setWarningMessage((prev) => (prev ? `${prev} ${dimCheck.warning}` : dimCheck.warning!));
      }

      const loadedUrl = objectUrl;
      objectUrl = null; // Ownership transferred to parent workspace

      onImageLoaded({
        file,
        dataUrl: loadedUrl,
        name: file.name,
        size: file.size,
        width,
        height,
        type: validation.detectedMime || file.type || 'image/jpeg',
      });
    } catch (err: any) {
      revokeObjectUrlSafe(objectUrl);
      const rawMsg = String(err?.message || '');
      if (rawMsg.toLowerCase().includes('memory') || rawMsg.toLowerCase().includes('allocation')) {
        setErrorMessage(
          'Your device ran out of browser memory while decoding this large image. Try closing other tabs or using a smaller resolution.'
        );
      } else {
        setErrorMessage(rawMsg || 'An unexpected error occurred while reading the local image.');
      }
    } finally {
      setLoading(false);
      setLoadingStage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !loading && fileInputRef.current?.click()}
        className={`group relative border-2 border-dashed rounded-xl cursor-pointer transition-colors text-center ${
          isDragging
            ? 'border-[#FF6B35] bg-[#FF6B35]/5'
            : 'border-[#171717]/20 hover:border-[#171717]/50 bg-white/40 hover:bg-white/70'
        } ${compact ? 'p-6' : 'p-10 sm:p-14'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload image"
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#171717]/5 flex items-center justify-center text-[#171717] group-hover:bg-[#FF6B35] group-hover:text-white transition-colors">
            {loading ? (
              <span className="w-5 h-5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
          </div>

          <div className="max-w-md">
            <h3 className="text-base font-semibold text-[#171717]">
              {loading && loadingStage ? loadingStage : title}
            </h3>
            <p className="mt-1 text-xs text-[#171717]/65">{subtitle}</p>
            <p className="mt-1 text-[11px] font-mono text-[#171717]/50">
              Max {MAX_FILE_SIZE_MB} MB per image · 100% client-side on your device
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {loading ? 'Reading Local File...' : 'Choose Image File'}
            </button>
          </div>
        </div>
      </div>

      {/* Validation Error Message */}
      {errorMessage && (
        <div
          role="alert"
          className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <div>
            <span className="font-semibold">Upload Rejected:</span> {errorMessage}
          </div>
        </div>
      )}

      {/* Validation Warning Message */}
      {warningMessage && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <span className="font-semibold">Notice:</span> {warningMessage}
          </div>
        </div>
      )}
    </div>
  );
};
