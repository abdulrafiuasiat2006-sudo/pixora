import React, { useState, useEffect } from 'react';
import { Shield, Check, X } from 'lucide-react';

interface CookieConsentBannerProps {
  onOpenPrivacy: () => void;
}

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ onOpenPrivacy }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('pixora_cookie_consent');
      if (!consent) {
        // Show after brief delay
        const timer = setTimeout(() => setIsVisible(true), 1000);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, []);

  const handleAcceptAll = () => {
    try {
      localStorage.setItem('pixora_cookie_consent', JSON.stringify({
        essential: true,
        performance: true,
        timestamp: Date.now(),
        regulations: ['NDPA-2023', 'GDPR-Art-6'],
      }));
    } catch {}
    setIsVisible(false);
  };

  const handleEssentialOnly = () => {
    try {
      localStorage.setItem('pixora_cookie_consent', JSON.stringify({
        essential: true,
        performance: false,
        timestamp: Date.now(),
        regulations: ['NDPA-2023', 'GDPR-Art-6'],
      }));
    } catch {}
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <aside
      role="region"
      aria-label="Privacy and Cookie Consent"
      className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-[#171717] text-[#F7F5F0] border border-[#171717]/30 rounded-xl p-4 shadow-2xl animate-fade-in"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
          <Shield className="w-4 h-4 text-[#FF6B35]" />
        </div>
        <div className="flex-1 text-xs leading-relaxed">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-white">Privacy &amp; Data Consent</span>
            <button
              onClick={handleEssentialOnly}
              className="text-[#F7F5F0]/60 hover:text-white p-1"
              aria-label="Dismiss consent notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-1 text-[#F7F5F0]/80">
            PIXORA processes images exclusively on your device. We use local browser storage for project history and export settings under the <strong>Nigeria Data Protection Act (NDPA)</strong> and <strong>GDPR</strong> guidelines.
          </p>
          <div className="mt-3 flex flex-wrap sm:flex-nowrap items-center gap-2 pt-1.5 border-t border-white/10">
            <button
              type="button"
              onClick={handleAcceptAll}
              className="flex-1 min-h-[40px] py-2 px-3 text-xs font-semibold bg-[#FF6B35] hover:bg-[#e05825] rounded-lg transition shadow-xs whitespace-nowrap text-center text-white active:scale-95 cursor-pointer"
            >
              Accept All
            </button>
            <button
              type="button"
              onClick={handleEssentialOnly}
              className="min-h-[40px] py-2 px-3 text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/15 rounded-lg transition whitespace-nowrap text-center active:scale-95 cursor-pointer"
            >
              Essential Only
            </button>
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="min-h-[40px] py-2 px-2.5 text-[11px] text-[#F7F5F0]/70 hover:text-white underline whitespace-nowrap inline-flex items-center cursor-pointer"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
