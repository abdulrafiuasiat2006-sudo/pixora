import React, { useState } from 'react';
import { BRANDING } from '../../config/branding';
import { Shield, FileText, CheckCircle } from 'lucide-react';

export const LegalWorkspace: React.FC = () => {
  const [tab, setTab] = useState<'privacy' | 'terms'>('privacy');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header */}
      <div className="pb-6 border-b border-[#171717]/10 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#171717]/60">
            <span>Platform</span>
            <span>/</span>
            <span className="text-[#171717] font-medium">Compliance & Legal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#171717] mt-1">
            Privacy Policy & Terms
          </h1>
          <p className="mt-1 text-sm text-[#171717]/70">
            Strict client-side data sovereignty, zero cloud uploads, and transparent terms of service.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-1 p-1 bg-white border border-[#171717]/15 rounded-lg text-xs">
          <button
            onClick={() => setTab('privacy')}
            className={`px-3.5 py-1.5 rounded-md transition font-medium ${
              tab === 'privacy'
                ? 'bg-[#171717] text-white'
                : 'text-[#171717]/70 hover:text-[#171717]'
            }`}
          >
            Privacy Policy
          </button>
          <button
            onClick={() => setTab('terms')}
            className={`px-3.5 py-1.5 rounded-md transition font-medium ${
              tab === 'terms'
                ? 'bg-[#171717] text-white'
                : 'text-[#171717]/70 hover:text-[#171717]'
            }`}
          >
            Terms of Service
          </button>
        </div>
      </div>

      <div className="bg-white/80 border border-[#171717]/12 rounded-xl p-6 sm:p-8 shadow-xs text-xs text-[#171717]/80 leading-relaxed space-y-6">
        {tab === 'privacy' ? (
          <>
            <div>
              <h2 className="text-base font-bold text-[#171717] mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#FF6B35]" />
                <span>1. Strict Zero-Upload On-Device Processing</span>
              </h2>
              <p>
                PIXORA is engineered with privacy as a fundamental constraint. When you select, drag, or drop an image file into PIXORA, the file is read and processed exclusively within your device's browser sandbox using standard HTML5 Canvas APIs, WebGL acceleration, and Web Workers.
              </p>
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Our Technical Guarantee:</strong> No image bytes, pixel data, or binary streams are transmitted over the network or saved to remote cloud servers. Your files remain on your device at all times.
                </span>
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#171717] mb-2">2. Local Storage and Session Data</h2>
              <p>
                User preferences (such as your chosen default export format, JPEG quality index, and filename conventions) and recent project job summaries are saved strictly in your browser’s `localStorage`. You can purge all stored metadata at any time in the User Settings panel via the "Purge Data" control.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#171717] mb-2">3. Progressive Web App Offline Caching</h2>
              <p>
                When you install PIXORA as a PWA, our Service Worker caches the application shell (HTML, JavaScript, CSS, and icons) on your device. This allows PIXORA to function in standalone mode without an active internet connection.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#171717] mb-2">4. Contacting Data Protection</h2>
              <p>
                If you have questions regarding PIXORA's privacy architecture or wish to request information, please reach out to our privacy compliance lead at{' '}
                <a href={`mailto:${BRANDING.contactEmail}`} className="text-[#FF6B35] font-semibold underline">
                  {BRANDING.contactEmail}
                </a>.
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 className="text-base font-bold text-[#171717] mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#FF6B35]" />
                <span>1. Permitted Use of PIXORA</span>
              </h2>
              <p>
                PIXORA is provided as a utility platform for preparing, splitting, resizing, cropping, and compressing digital images for personal, creative, and commercial projects. You retain full ownership and intellectual property rights to all media processed through the application.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#171717] mb-2">2. Platform Specifications & Accuracy</h2>
              <p>
                While our social media preset library is periodically verified against published developer guidelines for Instagram, YouTube, TikTok, LinkedIn, and other networks, third-party social platforms frequently update their compression algorithms, display ratios, and feed layouts. PIXORA provides recommended targets but cannot guarantee how third-party platforms alter media upon upload.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#171717] mb-2">3. Limitation of Liability</h2>
              <p>
                PIXORA processes images locally in-browser. Users are advised to retain original copies of their media files before applying destructive crops or compression. The software is provided "as is" without warranty of any kind.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#171717] mb-2">4. Revisions & Updates</h2>
              <p>
                These terms are effective as of October 2026. Continued use of PIXORA signifies acceptance of updated specifications and service terms.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
