import React from 'react';
import { BRANDING } from '../../config/branding';
import { ImageDropzone } from '../common/ImageDropzone';
import { ImageFileState, ToolType } from '../../types';
import {
  Grid,
  Sliders,
  Layers,
  Crop,
  Download,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Archive,
  Sparkles,
  Smartphone,
  Cpu,
} from 'lucide-react';

interface LandingPageProps {
  onStartTool: (tool: ToolType, image?: ImageFileState) => void;
  onNavigate: (tab: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStartTool, onNavigate }) => {
  return (
    <div className="flex flex-col">
      {/* HERO SECTION */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-12 pb-16 md:pt-20 md:pb-24 border-b border-[#171717]/10">
        <div className="max-w-5xl mx-auto text-center flex flex-col items-center">
          {/* Subtle Tagline kicker */}
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[#171717]/70 mb-4">
            <span className="w-2 h-2 rounded-full bg-[#FF6B35]" />
            <span>Digital Media Preparation Engine</span>
          </div>

          {/* Hero Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-[#171717] max-w-4xl text-balance">
            Your images. Every format. <br className="hidden sm:inline" />
            <span className="text-[#FF6B35]">One place.</span>
          </h1>

          {/* Hero Description */}
          <p className="mt-4 sm:mt-6 text-base sm:text-lg text-[#171717]/75 max-w-2xl text-balance leading-relaxed">
            Split multi-tile profile grids, hit exact target KB/MB size limits, crop to verified social aspect ratios, and export clean ZIP archives. All processed 100% on-device in your browser.
          </p>

          {/* Direct Dropzone Call to Action */}
          <div className="w-full max-w-2xl mt-8 sm:mt-10">
            <ImageDropzone
              onImageLoaded={(imageState) => onStartTool('splitter', imageState)}
              title="Drag & drop your image here to begin"
              subtitle="Loads instantly into local canvas. Zero server uploads."
            />
          </div>

          {/* Quick Tool Links */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-[#171717]/60">Or open directly:</span>
            <button
              onClick={() => onStartTool('splitter')}
              className="px-3 py-1 bg-white border border-[#171717]/15 rounded-md hover:border-[#FF6B35] transition text-[#171717] font-medium"
            >
              Splitter
            </button>
            <button
              onClick={() => onStartTool('compressor')}
              className="px-3 py-1 bg-white border border-[#171717]/15 rounded-md hover:border-[#FF6B35] transition text-[#171717] font-medium"
            >
              Compressor
            </button>
            <button
              onClick={() => onStartTool('resizer')}
              className="px-3 py-1 bg-white border border-[#171717]/15 rounded-md hover:border-[#FF6B35] transition text-[#171717] font-medium"
            >
              Resizer
            </button>
            <button
              onClick={() => onStartTool('cropper')}
              className="px-3 py-1 bg-white border border-[#171717]/15 rounded-md hover:border-[#FF6B35] transition text-[#171717] font-medium"
            >
              Cropper
            </button>
            <button
              onClick={() => onNavigate('presets')}
              className="px-3 py-1 bg-white border border-[#171717]/15 rounded-md hover:border-[#FF6B35] transition text-[#171717] font-medium"
            >
              Presets
            </button>
          </div>
        </div>
      </section>

      {/* CORE CAPABILITIES GRID */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#171717]">
            Engineered for Precision Image Preparation
          </h2>
          <p className="mt-2 text-sm text-[#171717]/70">
            Four specialized client-side image processing engines built into one unified interface.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Splitter */}
          <div className="bg-white/80 border border-[#171717]/12 rounded-xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#171717] flex items-center justify-center text-white mb-4">
                <Grid className="w-5 h-5 text-[#FF6B35]" />
              </div>
              <h3 className="text-base font-bold text-[#171717]">Image Splitter & Grid Tiles</h3>
              <p className="mt-2 text-xs text-[#171717]/70 leading-relaxed">
                Take any high-res photo and divide it into 3×3 Instagram profile grids or swipeable multi-card carousels with subpixel remainder distribution.
              </p>
              <div className="mt-3 font-mono text-[11px] text-[#171717]/60">
                · Numbered tile order
                <br />
                · Instagram post 9→1 guide
                <br />
                · One-click ZIP download
              </div>
            </div>

            <button
              onClick={() => onStartTool('splitter')}
              className="mt-6 pt-3 border-t border-[#171717]/10 text-xs font-semibold text-[#171717] hover:text-[#FF6B35] flex items-center justify-between"
            >
              <span>Explore Splitter</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Compressor */}
          <div className="bg-white/80 border border-[#171717]/12 rounded-xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#171717] flex items-center justify-center text-white mb-4">
                <Sliders className="w-5 h-5 text-[#FF6B35]" />
              </div>
              <h3 className="text-base font-bold text-[#171717]">Target KB/MB Compressor</h3>
              <p className="mt-2 text-xs text-[#171717]/70 leading-relaxed">
                Target exact file caps (e.g. YouTube’s strict 2.0MB limit) via iterative binary search. Reports actual byte sizes, never approximations.
              </p>
              <div className="mt-3 font-mono text-[11px] text-[#171717]/60">
                · Split view comparison slider
                <br />
                · Alpha transparency guard
                <br />
                · WebP / JPEG / PNG output
              </div>
            </div>

            <button
              onClick={() => onStartTool('compressor')}
              className="mt-6 pt-3 border-t border-[#171717]/10 text-xs font-semibold text-[#171717] hover:text-[#FF6B35] flex items-center justify-between"
            >
              <span>Explore Compressor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 3: Resizer */}
          <div className="bg-white/80 border border-[#171717]/12 rounded-xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#171717] flex items-center justify-center text-white mb-4">
                <Layers className="w-5 h-5 text-[#FF6B35]" />
              </div>
              <h3 className="text-base font-bold text-[#171717]">Pixel Dimension Resizer</h3>
              <p className="mt-2 text-xs text-[#171717]/70 leading-relaxed">
                Scale images by exact pixel dimensions or percentage factors with aspect ratio lock and high-quality canvas resampling.
              </p>
              <div className="mt-3 font-mono text-[11px] text-[#171717]/60">
                · 1080p, 4K, Social presets
                <br />
                · Aspect ratio lock/unlock
                <br />
                · Memory safety validation
              </div>
            </div>

            <button
              onClick={() => onStartTool('resizer')}
              className="mt-6 pt-3 border-t border-[#171717]/10 text-xs font-semibold text-[#171717] hover:text-[#FF6B35] flex items-center justify-between"
            >
              <span>Explore Resizer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 4: Cropper */}
          <div className="bg-white/80 border border-[#171717]/12 rounded-xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#171717] flex items-center justify-center text-white mb-4">
                <Crop className="w-5 h-5 text-[#FF6B35]" />
              </div>
              <h3 className="text-base font-bold text-[#171717]">Interactive Precision Cropper</h3>
              <p className="mt-2 text-xs text-[#171717]/70 leading-relaxed">
                Adjust crop frames with rule-of-thirds overlays, aspect ratio locks (1:1, 4:5, 16:9, 9:16), 90° rotations, and horizontal/vertical flips.
              </p>
              <div className="mt-3 font-mono text-[11px] text-[#171717]/60">
                · Draggable 8-handle box
                <br />
                · Social aspect ratio lock
                <br />
                · Live cropped pixel preview
              </div>
            </div>

            <button
              onClick={() => onStartTool('cropper')}
              className="mt-6 pt-3 border-t border-[#171717]/10 text-xs font-semibold text-[#171717] hover:text-[#FF6B35] flex items-center justify-between"
            >
              <span>Explore Cropper</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* MECHANISM-TO-OUTCOME TECHNICAL DISCIPLINE */}
      <section className="bg-white/60 border-y border-[#171717]/10 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-[#171717]">
              Technical Mechanism & Accuracy
            </h2>
            <p className="mt-2 text-xs text-[#171717]/70">
              How PIXORA guarantees pixel-accurate results across all tools.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-[#171717]/80">
            <div className="p-5 bg-white border border-[#171717]/10 rounded-xl space-y-2">
              <span className="font-bold text-[#171717] block text-sm">
                01. Integer Remainder Math
              </span>
              <p className="leading-relaxed">
                When dividing 1000px by 3 columns, naive rounding drops 1 pixel. PIXORA uses cumulative coordinate calculus:
              </p>
              <code className="block bg-[#171717]/5 p-2 rounded text-[11px] font-mono">
                start = Math.round((c * W) / total)
                <br />
                end = Math.round(((c+1) * W) / total)
              </code>
              <p className="text-[11px] text-[#171717]/60">
                Zero white gaps, zero missing lines, 100% seam alignment.
              </p>
            </div>

            <div className="p-5 bg-white border border-[#171717]/10 rounded-xl space-y-2">
              <span className="font-bold text-[#171717] block text-sm">
                02. Binary Search Compression
              </span>
              <p className="leading-relaxed">
                Instead of guessing quality factors, PIXORA generates real Canvas Blobs and measures actual byte counts in an 8-pass convergence loop:
              </p>
              <code className="block bg-[#171717]/5 p-2 rounded text-[11px] font-mono">
                testQ = (lowQ + highQ) / 2
                <br />
                if (blob.size &lt;= target) ...
              </code>
              <p className="text-[11px] text-[#171717]/60">
                Guarantees you never get rejected for exceeding strict platform file caps.
              </p>
            </div>

            <div className="p-5 bg-white border border-[#171717]/10 rounded-xl space-y-2">
              <span className="font-bold text-[#171717] block text-sm">
                03. Strict Client-Side Privacy
              </span>
              <p className="leading-relaxed">
                No third-party image processors or cloud buckets. Media buffers stay in your local browser sandbox memory:
              </p>
              <code className="block bg-[#171717]/5 p-2 rounded text-[11px] font-mono">
                window.createImageBitmap()
                <br />
                canvas.toBlob() local stream
              </code>
              <p className="text-[11px] text-[#171717]/60">
                Complete security compliance for private or commercial creative assets.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM & MOBILE ACCESS CALLOUT */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 max-w-4xl mx-auto text-center">
        <div className="bg-[#171717] text-[#F7F5F0] rounded-2xl p-8 sm:p-12 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-6 h-6 text-[#FF6B35]" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Use in Browser or Install on Any Device
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-[#F7F5F0]/75 max-w-lg mx-auto leading-relaxed">
            Open directly in any modern desktop or mobile browser without installation, or add to your home screen for full offline execution.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => onStartTool('splitter')}
              className="px-5 py-2.5 text-xs font-bold text-[#171717] bg-[#F7F5F0] hover:bg-white rounded-md transition-colors shadow-xs"
            >
              Start in Browser (Free)
            </button>
            <button
              onClick={() => onNavigate('help')}
              className="px-4 py-2.5 text-xs font-semibold text-[#F7F5F0] border border-white/20 hover:bg-white/10 rounded-md transition-colors"
            >
              Native Android / iOS Guide
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
