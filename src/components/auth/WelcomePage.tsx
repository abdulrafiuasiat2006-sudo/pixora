import React from 'react';
import { BRANDING } from '../../config/branding';
import {
  Grid3X3,
  Minimize2,
  Maximize2,
  Crop,
  ArrowRight,
  UserCheck,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';

interface WelcomePageProps {
  onNavigate: (tab: string) => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-[calc(100vh-140px)] flex flex-col justify-between max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Top Banner / Brand Intro */}
      <div className="text-center max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#171717] leading-tight">
          Your images. <br className="hidden sm:inline" />
          Every format. <span className="text-[#FF6B35]">One place.</span>
        </h1>

        <p className="mt-4 sm:mt-6 text-base sm:text-lg text-[#171717]/80 max-w-2xl mx-auto leading-relaxed">
          {BRANDING.name} is the unified, high-precision image utility engineered for creators.
          Split giant grid tiles, compress to exact KB/MB caps, crop to social ratios, and batch export — all within your authenticated session.
        </p>

        {/* Primary Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-lg shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
          >
            <UserCheck className="w-4 h-4 text-[#FF6B35]" />
            <span>Log In to Pixora</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('register')}
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B35]"
          >
            <span>Create Account</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-3 text-xs text-[#171717]/60">
          Already have credentials? Test account available: <span className="font-mono text-[#171717] font-medium">creator@pixora.app</span>
        </p>
      </div>

      {/* Feature Highlights Grid */}
      <div className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-[#171717]/10 rounded-xl shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-[#171717] flex items-center justify-center text-[#FF6B35] mb-3">
            <Grid3X3 className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-[#171717]">Image Splitter</h2>
          <p className="mt-1 text-xs text-[#171717]/70 leading-relaxed">
            3×3 Instagram grids and continuous carousels with mathematical zero-seam remainder preservation.
          </p>
        </div>

        <div className="p-5 bg-white border border-[#171717]/10 rounded-xl shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-[#171717] flex items-center justify-center text-[#FF6B35] mb-3">
            <Minimize2 className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-[#171717]">Target Compressor</h2>
          <p className="mt-1 text-xs text-[#171717]/70 leading-relaxed">
            8-stage binary search algorithm guaranteed to satisfy strict KB/MB upload limits without quality degradation.
          </p>
        </div>

        <div className="p-5 bg-white border border-[#171717]/10 rounded-xl shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-[#171717] flex items-center justify-center text-[#FF6B35] mb-3">
            <Maximize2 className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-[#171717]">Pixel Resizer</h2>
          <p className="mt-1 text-xs text-[#171717]/70 leading-relaxed">
            Exact width and height pixel scaling with instant aspect ratio locking and bicubic rendering.
          </p>
        </div>

        <div className="p-5 bg-white border border-[#171717]/10 rounded-xl shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-[#171717] flex items-center justify-center text-[#FF6B35] mb-3">
            <Crop className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-[#171717]">Aspect Cropper</h2>
          <p className="mt-1 text-xs text-[#171717]/70 leading-relaxed">
            Standard 1:1, 4:5, 16:9, and 9:16 framing with 90° rotation and horizontal/vertical flipping.
          </p>
        </div>
      </div>

      {/* Security Baseline Footer Notice */}
      <div className="mt-12 p-4 bg-[#171717]/5 border border-[#171717]/10 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#171717]/70">
        <div className="flex items-center gap-3">
          <Lock className="w-4 h-4 text-[#FF6B35] shrink-0" />
          <span>
            <strong>Global Access Control:</strong> All application dashboards, workspaces, saved projects, and utilities are strictly protected behind session-authenticated security.
          </span>
        </div>
        <div className="flex items-center gap-4 shrink-0 font-medium">
          <button
            type="button"
            onClick={() => onNavigate('legal')}
            className="hover:text-[#171717] hover:underline"
          >
            Privacy & Terms
          </button>
          <button
            type="button"
            onClick={() => onNavigate('help')}
            className="hover:text-[#171717] hover:underline"
          >
            Help & FAQ
          </button>
        </div>
      </div>
    </div>
  );
};
