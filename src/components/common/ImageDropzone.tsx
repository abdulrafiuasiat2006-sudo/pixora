import React, { useRef, useState } from 'react';
import { Upload, AlertCircle, Image as ImageIcon, Sparkles } from 'lucide-react';
import { ImageFileState } from '../../types';
import { validateImageFile, validateDecodedDimensions } from '../../utils/validation';
import { formatBytes } from '../../utils/imageEngine';

interface ImageDropzoneProps {
  onImageLoaded: (imageState: ImageFileState) => void;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export const ImageDropzone: React.FC<ImageDropzoneProps> = ({
  onImageLoaded,
  title = 'Upload or drop an image',
  subtitle = 'Supports JPEG, PNG, WebP up to 10MB. Processed 100% locally on your device.',
  compact = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const processFile = async (file: File) => {
    setErrorMessage(null);
    setWarningMessage(null);
    setLoading(true);

    try {
      const validation = await validateImageFile(file);
      if (!validation.valid) {
        setErrorMessage(validation.error || 'Invalid image file.');
        setLoading(false);
        return;
      }

      if (validation.warning) {
        setWarningMessage(validation.warning);
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          // Decompression bomb check (max 50 Megapixels & max 12000px axis)
          const dimCheck = validateDecodedDimensions(img.naturalWidth, img.naturalHeight);
          if (!dimCheck.valid) {
            setErrorMessage(dimCheck.error || 'Image dimension safety check failed.');
            setLoading(false);
            return;
          }

          onImageLoaded({
            file,
            dataUrl,
            name: file.name,
            size: file.size,
            width: img.naturalWidth,
            height: img.naturalHeight,
            type: validation.detectedMime || file.type,
          });
          setLoading(false);
        };
        img.onerror = () => {
          setErrorMessage('Could not decode image pixels. File might be corrupted.');
          setLoading(false);
        };
        img.src = dataUrl;
      };
      reader.onerror = () => {
        setErrorMessage('Failed to read file from storage.');
        setLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during upload.');
      setLoading(false);
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

  /**
   * Generates a high-resolution crisp test image on a local canvas for instant testing.
   */
  const loadSampleImage = (type: 'photo' | 'graphic' = 'photo') => {
    setLoading(true);
    setErrorMessage(null);

    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw rich crisp scene with geometry, text, and color zones
    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, 2400, 1600);

    // Dynamic graphic blocks
    ctx.fillStyle = '#FF6B35';
    ctx.fillRect(100, 100, 1000, 1400);

    ctx.fillStyle = '#F7F5F0';
    ctx.fillRect(1150, 100, 1150, 680);

    ctx.fillStyle = '#2A2A2A';
    ctx.fillRect(1150, 820, 1150, 680);

    // Decorative geometric patterns for split testing
    ctx.strokeStyle = '#F7F5F0';
    ctx.lineWidth = 12;
    for (let i = 0; i < 5; i++) {
      ctx.strokeRect(180 + i * 60, 200 + i * 60, 840 - i * 120, 1200 - i * 120);
    }

    // High resolution text
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 72px Inter, sans-serif';
    ctx.fillText('PIXORA HIGH-RES SAMPLE', 1220, 320);

    ctx.font = '36px "DM Mono", monospace';
    ctx.fillStyle = '#171717';
    ctx.fillText('2400 × 1600 px · RGB 24-bit Canvas', 1220, 400);
    ctx.fillText('Grid & Carousel Benchmark Specimen', 1220, 460);

    // Bottom dark block text
    ctx.fillStyle = '#F7F5F0';
    ctx.font = '40px Inter, sans-serif';
    ctx.fillText('Zero-loss Remainder Distribution Test', 1220, 1000);
    ctx.fillStyle = '#FF6B35';
    ctx.fillText('Precision Tile Math Verification', 1220, 1080);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'pixora-test-specimen.jpg', { type: 'image/jpeg' });
        processFile(file);
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
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
            <h3 className="text-base font-semibold text-[#171717]">{title}</h3>
            <p className="mt-1 text-xs text-[#171717]/65">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition-colors whitespace-nowrap"
            >
              Choose Image File
            </button>
          </div>
        </div>
      </div>

      {/* Validation Error Message */}
      {errorMessage && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <div>
            <span className="font-semibold">Validation Error:</span> {errorMessage}
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
