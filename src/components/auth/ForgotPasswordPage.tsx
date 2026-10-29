import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BRANDING } from '../../config/branding';
import {
  Mail,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Send,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface ForgotPasswordPageProps {
  onNavigate: (tab: string) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('pixora_last_login_email') || 'abdulrafiuasiat2006@gmail.com';
    } catch {
      return 'abdulrafiuasiat2006@gmail.com';
    }
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please provide a valid email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await resetPassword(cleanEmail);
      if (res.success) {
        setIsSent(true);
        setSentMessage(res.message);
      } else {
        setError(res.error || 'Failed to dispatch password reset email.');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to submit password recovery request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="max-w-md w-full bg-white border border-[#171717]/15 rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#171717] text-[#FF6B35] mb-3 shadow-xs">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171717]">
            Reset Your Password
          </h1>
          <p className="text-xs sm:text-sm text-[#171717]/70 mt-1">
            {isSent
              ? 'Password recovery link has been dispatched to your inbox.'
              : 'Enter your email address to receive an official password reset link.'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}

        {isSent ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Reset Email Dispatched</span>
              </div>
              <p className="leading-relaxed text-emerald-800/90">
                An email containing a secure password reset link was dispatched to{' '}
                <strong className="font-mono text-emerald-950 font-bold">{email}</strong>.
              </p>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                Click the link in the email to set your new password. If you do not see the email within 1–2 minutes, please check your spam or junk folder.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Log In</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSent(false)}
                className="w-full py-2 px-4 text-xs font-medium text-[#171717]/70 hover:text-[#171717] transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Send to another email</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-[#171717] mb-1.5" htmlFor="reset-email">
                Account Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="abdulrafiuasiat2006@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#171717]/20 rounded-lg text-sm text-[#171717] placeholder:text-[#171717]/40 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] focus:outline-none transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 text-sm font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717]"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  <span>Sending Reset Email...</span>
                </>
              ) : (
                <>
                  <span>Send Reset Email</span>
                  <Send className="w-3.5 h-3.5 text-[#FF6B35]" />
                </>
              )}
            </button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171717]/70 hover:text-[#171717] transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Log In</span>
              </button>
            </div>
          </form>
        )}

        {/* Security Note */}
        <div className="mt-6 pt-5 border-t border-[#171717]/10 flex items-center justify-center gap-1.5 text-[11px] text-[#171717]/50">
          <ShieldCheck className="w-3.5 h-3.5 text-[#FF6B35]" />
          <span>Google Firebase Identity Protection Active</span>
        </div>
      </div>
    </div>
  );
};
