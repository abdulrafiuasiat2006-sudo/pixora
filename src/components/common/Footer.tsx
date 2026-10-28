import React from 'react';
import { BRANDING } from '../../config/branding';

interface FooterProps {
  onNavigate: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="mt-auto border-t border-[#171717]/10 bg-[#F7F5F0] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-[#171717]/70">
        {/* Left: Brand & Tagline */}
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
          <span className="font-semibold text-[#171717]">{BRANDING.name}</span>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <span>{BRANDING.tagline}</span>
        </div>

        {/* Center: Privacy Notice */}
        <div className="text-center">
          <span>Client-side execution · No image files stored on remote servers</span>
        </div>

        {/* Right: Functional Navigation Links */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => onNavigate('help')}
            className="min-h-[44px] px-2.5 py-2 inline-flex items-center text-xs hover:text-[#171717] transition-colors cursor-pointer active:scale-95"
          >
            Help &amp; FAQs
          </button>
          <span aria-hidden="true" className="text-[#171717]/30 hidden xs:inline">·</span>
          <button
            type="button"
            onClick={() => onNavigate('legal')}
            className="min-h-[44px] px-2.5 py-2 inline-flex items-center text-xs hover:text-[#171717] transition-colors cursor-pointer active:scale-95"
          >
            Privacy &amp; Terms
          </button>
          <span aria-hidden="true" className="text-[#171717]/30 hidden xs:inline">·</span>
          <button
            type="button"
            onClick={() => onNavigate('qa')}
            className="min-h-[44px] px-2.5 py-2 inline-flex items-center text-xs hover:text-[#171717] transition-colors cursor-pointer active:scale-95"
          >
            QA Suite
          </button>
        </div>
      </div>
    </footer>
  );
};
