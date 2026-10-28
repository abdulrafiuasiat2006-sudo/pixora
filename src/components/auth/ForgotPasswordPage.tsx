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
} from 'lucide-react';

interface ForgotPasswordPageProps {
  onNavigate: (tab: string) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await resetPassword(cleanEmail);
      setIsSubmitted(true);
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
            Enter your account email to receive a secure password recovery authorization link.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}

        {isSubmitted ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Recovery Instructions Dispatched</span>
              </div>
              <p className="leading-relaxed text-emerald-800/90">
                If an account exists under <span className="font-mono font-medium">{email}</span>, we have sent instructions with a secure one-hour password reset link.
              </p>
              <p className="text-[11px] text-emerald-700">
                Please check your inbox and spam folder. For security and anti-enumeration, we do not reveal whether the email exists.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Log In</span>
            </button>
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
                  placeholder="creator@example.com"
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
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Send Reset Link</span>
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
          <span>Anti-Enumeration Protection Active</span>
        </div>
      </div>
    </div>
  );
};
