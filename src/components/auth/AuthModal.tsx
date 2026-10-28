import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BRANDING } from '../../config/branding';
import { Mail, Lock, User, AlertCircle, CheckCircle2, Shield } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
}) => {
  const { login, signup, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        if (!password || password.length < 6) {
          setError('Password must be at least 6 characters.');
          setIsSubmitting(false);
          return;
        }
        await login(email, name);
        onClose();
      } else if (mode === 'signup') {
        if (!name.trim()) {
          setError('Please provide your name or display handle.');
          setIsSubmitting(false);
          return;
        }
        if (!password || password.length < 6) {
          setError('Password must be at least 6 characters.');
          setIsSubmitting(false);
          return;
        }
        await signup(email, name);
        onClose();
      } else if (mode === 'forgot') {
        const res = await resetPassword(email);
        setSuccessNotice(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/60 p-4">
      <div className="bg-[#F7F5F0] border border-[#171717]/20 rounded-xl max-w-sm w-full p-6 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#171717]/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#171717] flex items-center justify-center p-1">
              <Shield className="w-3.5 h-3.5 text-[#FF6B35]" />
            </div>
            <span className="font-bold text-sm text-[#171717]">
              {mode === 'signin' && 'Sign In to PIXORA'}
              {mode === 'signup' && 'Create Creator Account'}
              {mode === 'forgot' && 'Reset Password'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-bold text-[#171717]/60 hover:text-[#171717]"
          >
            ✕
          </button>
        </div>

        {/* Tab switch between Sign In and Sign Up */}
        {mode !== 'forgot' && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#171717]/5 rounded-lg mb-4 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`py-1.5 rounded transition ${
                mode === 'signin' ? 'bg-white shadow-xs text-[#171717] font-semibold' : 'text-[#171717]/60'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`py-1.5 rounded transition ${
                mode === 'signup' ? 'bg-white shadow-xs text-[#171717] font-semibold' : 'text-[#171717]/60'
              }`}
            >
              Register
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-xs">
          {mode === 'signup' && (
            <div>
              <label className="block font-semibold text-[#171717] mb-1">Your Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
                <input
                  type="text"
                  placeholder="e.g. Maya Chen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#171717]/20 rounded-md focus:border-[#FF6B35] focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold text-[#171717] mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
              <input
                type="email"
                placeholder="creator@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#171717]/20 rounded-md focus:border-[#FF6B35] focus:outline-none"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-[#171717]">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                    }}
                    className="text-[11px] text-[#FF6B35] hover:underline"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#171717]/20 rounded-md focus:border-[#FF6B35] focus:outline-none"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-800 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-[11px] flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>{successNotice}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full py-2 px-4 text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-md transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            ) : mode === 'signin' ? (
              'Sign In'
            ) : mode === 'signup' ? (
              'Create Account'
            ) : (
              'Send Reset Link'
            )}
          </button>

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                setSuccessNotice(null);
              }}
              className="mt-1 text-center text-[11px] text-[#171717]/70 hover:text-[#171717]"
            >
              Back to Sign In
            </button>
          )}
        </form>

        {/* Guest Note */}
        <div className="mt-4 pt-3 border-t border-[#171717]/10 text-center">
          <p className="text-[11px] text-[#171717]/60">
            Guest mode is always available with 100% functionality. Creating an account lets you sync preferences across browser sessions.
          </p>
        </div>
      </div>
    </div>
  );
};
