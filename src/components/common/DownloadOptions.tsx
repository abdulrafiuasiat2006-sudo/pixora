import React from 'react';
import { Download, Archive } from 'lucide-react';

interface DownloadOptionsProps {
  onDownloadIndividual: () => void;
  onDownloadZip: () => void;
  disabled?: boolean;
  isProcessing?: boolean;
  isZipping?: boolean;
  individualMeta?: string;
  zipMeta?: string;
  layout?: 'header' | 'panel';
}

/**
 * Standardized Cross-Device Download Options for every PIXORA tool.
 * Always presents exactly two download options across Mobile, Tablet, Laptop, and Desktop:
 * 1. Download as Individual Files (Primary / Default)
 * 2. Download as ZIP (Secondary / Optional)
 */
export const DownloadOptions: React.FC<DownloadOptionsProps> = ({
  onDownloadIndividual,
  onDownloadZip,
  disabled = false,
  isProcessing = false,
  isZipping = false,
  individualMeta,
  zipMeta,
  layout = 'panel',
}) => {
  const isActionDisabled = disabled || isProcessing;

  if (layout === 'header') {
    return (
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
        {/* Option 1: Primary / Default — Download as Individual Files */}
        <button
          type="button"
          onClick={onDownloadIndividual}
          disabled={isActionDisabled}
          className="px-4 py-2.5 min-h-[44px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Download as Individual Files</span>
          {individualMeta && (
            <span className="font-mono text-[11px] opacity-90">({individualMeta})</span>
          )}
        </button>

        {/* Option 2: Secondary / Optional — Download as ZIP */}
        <button
          type="button"
          onClick={onDownloadZip}
          disabled={isActionDisabled || isZipping}
          className="px-4 py-2.5 min-h-[44px] text-xs font-semibold text-[#171717] bg-white hover:bg-[#171717]/5 border border-[#171717]/25 rounded-lg transition-colors shadow-2xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95 whitespace-nowrap"
        >
          {isZipping ? (
            <span className="w-3.5 h-3.5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin shrink-0" />
          ) : (
            <Archive className="w-3.5 h-3.5 text-[#171717]/75 shrink-0" />
          )}
          <span>{isZipping ? 'Packaging ZIP...' : 'Download as ZIP'}</span>
          {zipMeta && !isZipping && (
            <span className="font-mono text-[11px] text-[#171717]/60">({zipMeta})</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#171717]/60">
        Export &amp; Download Options
      </div>

      {/* Option 1: Primary / Default — Download as Individual Files */}
      <button
        type="button"
        onClick={onDownloadIndividual}
        disabled={isActionDisabled}
        className="w-full py-2.5 px-4 min-h-[44px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Download as Individual Files</span>
        {individualMeta && (
          <span className="font-mono text-[11px] opacity-90">({individualMeta})</span>
        )}
      </button>

      {/* Option 2: Secondary / Optional — Download as ZIP */}
      <button
        type="button"
        onClick={onDownloadZip}
        disabled={isActionDisabled || isZipping}
        className="w-full py-2.5 px-4 min-h-[44px] text-xs font-semibold text-[#171717] bg-white hover:bg-[#171717]/5 border border-[#171717]/25 rounded-lg transition-colors shadow-2xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
      >
        {isZipping ? (
          <span className="w-4 h-4 border-2 border-[#171717] border-t-transparent rounded-full animate-spin shrink-0" />
        ) : (
          <Archive className="w-4 h-4 text-[#171717]/75 shrink-0" />
        )}
        <span>{isZipping ? 'Packaging ZIP...' : 'Download as ZIP'}</span>
        {zipMeta && !isZipping && (
          <span className="font-mono text-[11px] text-[#171717]/60">({zipMeta})</span>
        )}
      </button>
    </div>
  );
};
