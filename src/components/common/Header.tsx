import React, { useState, useEffect } from 'react';
import { BRANDING } from '../../config/branding';
import { useAuth } from '../../context/AuthContext';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, User, Menu, X, Laptop, LogOut, Mail, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  onOpenAuth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onNavigate }) => {
  const { user, isAuthenticated, logout, sendVerificationEmail, reloadUser } = useAuth();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);
  const [dismissVerificationBanner, setDismissVerificationBanner] = useState(false);
  const [resendCooldown, setResendCooldown] = useState<number>(() => {
    try {
      const exp = sessionStorage.getItem('pixora_resend_cooldown_expiry');
      if (exp) {
        const remaining = Math.ceil((parseInt(exp, 10) - Date.now()) / 1000);
        return remaining > 0 ? remaining : 0;
      }
    } catch {}
    return 0;
  });

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          sessionStorage.removeItem('pixora_resend_cooldown_expiry');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setIsResendingEmail(true);
    setVerificationFeedback(null);
    try {
      const res = await sendVerificationEmail();
      const expiry = Date.now() + 60 * 1000;
      try {
        sessionStorage.setItem('pixora_resend_cooldown_expiry', expiry.toString());
      } catch {}
      setResendCooldown(60);
      setVerificationFeedback(res.message || res.error || 'Verification email dispatched. Please check your inbox and spam folder.');
    } catch {
      setVerificationFeedback('Failed to resend email. Please try again later.');
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleRefreshVerification = async () => {
    await reloadUser();
    if (user?.emailVerified) {
      setVerificationFeedback('Email successfully verified!');
    } else {
      setVerificationFeedback('Email still shows unverified. If you clicked the link, please wait a few seconds and try again.');
    }
  };

  const protectedNavItems = [
    { id: 'dashboard', label: 'Tools' },
    { id: 'splitter', label: 'Splitter' },
    { id: 'compressor', label: 'Compressor' },
    { id: 'resizer', label: 'Resizer' },
    { id: 'cropper', label: 'Cropper' },
    { id: 'projects', label: 'Projects' },
  ];

  const publicNavItems = [
    { id: 'welcome', label: 'Overview' },
    { id: 'help', label: 'Help & FAQ' },
    { id: 'legal', label: 'Privacy & Terms' },
  ];

  const handleNavClick = (id: string) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      onNavigate('welcome');
    } finally {
      setIsLoggingOut(false);
      setMobileMenuOpen(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#F7F5F0] border-b border-[#171717]/10 px-3 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-16 flex items-center justify-between gap-2 sm:gap-6">
          {/* ZONE 1: BRAND WORDMARK */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isAuthenticated && currentTab !== 'dashboard' ? (
              <button
                type="button"
                onClick={() => handleNavClick('dashboard')}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[38px] text-xs font-semibold text-[#171717] bg-white border border-[#171717]/15 rounded-lg hover:bg-[#171717]/5 transition shadow-2xs cursor-pointer active:scale-95"
                aria-label="Back to Studio Hub"
              >
                <span className="text-[#FF6B35] font-bold text-sm">‹</span>
                <span className="hidden xs:inline">Studio</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => handleNavClick(isAuthenticated ? 'dashboard' : 'welcome')}
              className="flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35] rounded-md cursor-pointer py-1"
              aria-label={`${BRANDING.name} Home`}
            >
              <div className="w-8 h-8 rounded-lg bg-[#171717] flex items-center justify-center p-1.5 shadow-xs shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
                  <rect x="10" y="10" width="36" height="36" rx="6" fill="#FF6B35" />
                  <rect x="54" y="10" width="36" height="36" rx="6" fill="#F7F5F0" />
                  <rect x="10" y="54" width="36" height="36" rx="6" fill="#F7F5F0" />
                  <rect x="54" y="54" width="36" height="36" rx="6" fill="#F7F5F0" fillOpacity="0.4" />
                </svg>
              </div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-[#171717]">
                {BRANDING.name}
              </span>
            </button>
          </div>

          {/* ZONE 2: PRIMARY NAVIGATION LINKS */}
          <nav className="hidden md:flex items-center gap-4 lg:gap-6 text-sm font-medium text-[#171717]/75">
            {isAuthenticated
              ? protectedNavItems.map((item) => {
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`whitespace-nowrap transition-colors py-1.5 border-b-2 text-sm cursor-pointer ${
                        isActive
                          ? 'text-[#171717] font-semibold border-[#FF6B35]'
                          : 'border-transparent text-[#171717]/70 hover:text-[#171717] hover:border-[#171717]/20'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })
              : publicNavItems.map((item) => {
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`whitespace-nowrap transition-colors py-1.5 border-b-2 text-sm cursor-pointer ${
                        isActive
                          ? 'text-[#171717] font-semibold border-[#FF6B35]'
                          : 'border-transparent text-[#171717]/70 hover:text-[#171717] hover:border-[#171717]/20'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
          </nav>

          {/* ZONE 3: ACTIONS & AUTHENTICATION CONTROLS */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* PWA Install Button (Desktop & Tablet) */}
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] text-xs font-semibold text-[#171717] bg-[#171717]/5 hover:bg-[#171717]/10 border border-[#171717]/15 rounded-md transition-colors whitespace-nowrap cursor-pointer active:scale-95"
                title="Install PIXORA PWA on your device"
              >
                <Download className="w-3.5 h-3.5 text-[#FF6B35]" />
                <span>Install</span>
              </button>
            )}

            {!isInstalled && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSModal(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] text-xs font-medium text-[#171717] bg-[#171717]/5 hover:bg-[#171717]/10 border border-[#171717]/15 rounded-md transition-colors whitespace-nowrap cursor-pointer active:scale-95"
              >
                <Laptop className="w-3.5 h-3.5 text-[#FF6B35]" />
                <span>Add to Home</span>
              </button>
            )}

            {/* Authenticated User Menu */}
            {isAuthenticated && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="flex items-center gap-2 p-1.5 min-h-[40px] min-w-[40px] justify-center text-xs font-medium text-[#171717] bg-white hover:bg-[#171717]/5 rounded-lg border border-[#171717]/15 transition shadow-2xs whitespace-nowrap cursor-pointer active:scale-95"
                  title={`Signed in as ${user?.email}`}
                  aria-label="Account Settings"
                >
                  <div className="w-6 h-6 rounded-full bg-[#171717] text-[#FF6B35] flex items-center justify-center font-bold text-[11px]">
                    {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[40px] text-xs font-semibold text-[#171717] hover:text-red-700 hover:bg-red-50 rounded-lg border border-[#171717]/15 transition cursor-pointer disabled:opacity-50 active:scale-95"
                  title="Sign out of Pixora"
                >
                  <LogOut className="w-3.5 h-3.5 text-red-600" />
                  <span className="hidden md:inline">Log Out</span>
                </button>
              </div>
            )}

            {/* Mobile hamburger button - Accessible min 44x44px hitbox */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[#171717] hover:bg-[#171717]/5 rounded-lg cursor-pointer active:scale-95"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* MOBILE NAVIGATION DRAWER */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-[#171717]/10 flex flex-col gap-1.5 animate-in slide-in-from-top-2 duration-150">
            {isAuthenticated ? (
              <>
                <div className="px-3.5 py-2.5 mb-1 bg-white border border-[#171717]/10 rounded-xl text-xs shadow-2xs">
                  <span className="text-[#171717]/60 block text-[11px] font-medium">Signed in as:</span>
                  <span className="font-bold text-[#171717] block truncate text-sm mt-0.5">{user?.name} ({user?.email})</span>
                </div>

                {/* Mobile PWA Install option */}
                {!isInstalled && isInstallable && (
                  <button
                    type="button"
                    onClick={() => {
                      install();
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-2.5 px-3.5 min-h-[44px] text-sm font-semibold text-[#171717] bg-[#FF6B35]/10 border border-[#FF6B35]/30 rounded-xl transition cursor-pointer active:scale-98"
                  >
                    <Download className="w-4 h-4 text-[#FF6B35]" />
                    <span>Install App on Device</span>
                  </button>
                )}

                {!isInstalled && isIOS && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowIOSModal(true);
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-2.5 px-3.5 min-h-[44px] text-sm font-semibold text-[#171717] bg-[#FF6B35]/10 border border-[#FF6B35]/30 rounded-xl transition cursor-pointer active:scale-98"
                  >
                    <Laptop className="w-4 h-4 text-[#FF6B35]" />
                    <span>Add to iPhone Home Screen</span>
                  </button>
                )}

                <div className="text-[11px] font-bold uppercase tracking-wider text-[#171717]/50 px-3 pt-1">
                  Image Tools
                </div>

                {protectedNavItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`text-left px-3.5 min-h-[44px] text-sm rounded-xl font-medium flex items-center transition cursor-pointer active:scale-98 ${
                      currentTab === item.id
                        ? 'bg-[#171717] text-[#F7F5F0]'
                        : 'text-[#171717]/80 hover:bg-[#171717]/5 bg-white/60 border border-[#171717]/5'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}

                <div className="pt-2 border-t border-[#171717]/10 flex flex-col gap-1.5 mt-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#171717]/50 px-3">
                    Preferences &amp; Support
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavClick('settings')}
                    className="text-left px-3.5 min-h-[44px] text-sm text-[#171717]/85 hover:bg-[#171717]/5 rounded-xl flex items-center cursor-pointer active:scale-98"
                  >
                    Settings &amp; Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavClick('help')}
                    className="text-left px-3.5 min-h-[44px] text-sm text-[#171717]/85 hover:bg-[#171717]/5 rounded-xl flex items-center cursor-pointer active:scale-98"
                  >
                    Help &amp; Native Builds
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavClick('legal')}
                    className="text-left px-3.5 min-h-[44px] text-sm text-[#171717]/85 hover:bg-[#171717]/5 rounded-xl flex items-center cursor-pointer active:scale-98"
                  >
                    Privacy &amp; Terms
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-left px-3.5 min-h-[44px] text-sm font-semibold text-red-700 hover:bg-red-50 rounded-xl flex items-center gap-2 mt-1 cursor-pointer active:scale-98 border border-red-200/60 bg-red-50/50"
                  >
                    <LogOut className="w-4 h-4 text-red-600" />
                    <span>Log Out</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                {publicNavItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`text-left px-3.5 min-h-[44px] text-sm rounded-xl font-medium flex items-center transition cursor-pointer active:scale-98 ${
                      currentTab === item.id
                        ? 'bg-[#171717] text-[#F7F5F0]'
                        : 'text-[#171717]/80 hover:bg-[#171717]/5 bg-white/60 border border-[#171717]/5'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <div className="pt-2 border-t border-[#171717]/10 flex flex-col gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => handleNavClick('login')}
                    className="w-full min-h-[44px] px-3 text-center text-sm font-semibold text-[#171717] bg-white border border-[#171717]/20 rounded-xl cursor-pointer flex items-center justify-center active:scale-98"
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavClick('register')}
                    className="w-full min-h-[44px] px-3 text-center text-sm font-semibold text-white bg-[#FF6B35] rounded-xl cursor-pointer flex items-center justify-center active:scale-98"
                  >
                    Create Account
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {/* EMAIL VERIFICATION BANNER */}
      {isAuthenticated && user && !user.emailVerified && !dismissVerificationBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-900 transition">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Email unverified:</strong> A verification link was sent to <strong className="font-mono">{user.email}</strong>.
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold shrink-0">
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isResendingEmail || resendCooldown > 0}
                className="text-[#FF6B35] hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResendingEmail ? 'Sending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Email'}
              </button>
              <span className="text-amber-400">|</span>
              <button
                type="button"
                onClick={handleRefreshVerification}
                className="text-amber-800 hover:text-amber-950 hover:underline cursor-pointer flex items-center gap-1"
                title="Refresh verification status"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Check Status</span>
              </button>
              <span className="text-amber-400">|</span>
              <button
                type="button"
                onClick={() => setDismissVerificationBanner(true)}
                className="text-amber-600 hover:text-amber-900 cursor-pointer ml-1"
                title="Dismiss banner"
              >
                Dismiss
              </button>
            </div>
          </div>
          {verificationFeedback && (
            <div className="max-w-7xl mx-auto mt-1 text-[11px] font-medium text-amber-800">
              {verificationFeedback}
            </div>
          )}
        </div>
      )}

      {/* iOS Safari Installation Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/60 p-4">
          <div className="w-full max-w-sm rounded-xl bg-[#F7F5F0] p-6 border border-[#171717]/20 shadow-xl">
            <h3 className="text-base font-bold text-[#171717]">Install PIXORA on iPhone / iPad</h3>
            <p className="mt-2 text-xs text-[#171717]/80 leading-relaxed">
              1. Tap the <strong>Share</strong> icon in Safari bottom bar.<br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.<br />
              3. Launch PIXORA directly like a native app with full offline support.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full rounded-md bg-[#171717] py-2 text-xs font-semibold text-[#F7F5F0] hover:bg-[#171717]/90 transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
