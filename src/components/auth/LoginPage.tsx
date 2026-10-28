import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BRANDING } from '../../config/branding';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface LoginPageProps {
  onNavigate: (tab: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login, intendedRoute } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await login(cleanEmail, password);
      if (res.success) {
        // Redirect to intended route or dashboard
        const destination = intendedRoute || 'dashboard';
        onNavigate(destination);
      } else {
        setError(res.error || 'Invalid credentials. Please verify your email and password.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during login. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemoCredentials = () => {
    setEmail('creator@pixora.app');
    setPassword('Pixora@2026!');
    setError(null);
  };

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="max-w-md w-full bg-white border border-[#171717]/15 rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#171717] text-[#FF6B35] mb-3 shadow-xs">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171717]">
            Log In to {BRANDING.name}
          </h1>
          <p className="text-xs sm:text-sm text-[#171717]/70 mt-1">
            Access your secure on-device image workspaces and saved projects.
          </p>
        </div>

        {/* Demo Quick-Fill Helper */}
        <div className="mb-5 p-3 bg-[#F7F5F0] border border-[#171717]/10 rounded-lg flex items-center justify-between text-xs">
          <div>
            <span className="font-semibold text-[#171717]">Test Account: </span>
            <span className="font-mono text-[#171717]/70">creator@pixora.app</span>
          </div>
          <button
            type="button"
            onClick={fillDemoCredentials}
            className="text-[11px] font-semibold text-[#FF6B35] hover:underline cursor-pointer"
          >
            Auto-Fill
          </button>
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

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#171717] mb-1.5" htmlFor="login-email">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#171717]/20 rounded-lg text-sm text-[#171717] placeholder:text-[#171717]/40 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="font-semibold text-[#171717]" htmlFor="login-password">
                Password
              </label>
              <button
                type="button"
                onClick={() => onNavigate('forgot-password')}
                className="text-[11px] font-semibold text-[#FF6B35] hover:underline"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#171717]/20 rounded-lg text-sm text-[#171717] placeholder:text-[#171717]/40 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] focus:outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#171717]/50 hover:text-[#171717] transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
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
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Log In</span>
                <ArrowRight className="w-4 h-4 text-[#FF6B35]" />
              </>
            )}
          </button>
        </form>

        {/* Switch to Register */}
        <div className="mt-6 pt-5 border-t border-[#171717]/10 text-center text-xs">
          <p className="text-[#171717]/70">
            Don't have an account yet?{' '}
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="font-bold text-[#FF6B35] hover:underline cursor-pointer"
            >
              Create Account
            </button>
          </p>
        </div>

        {/* Privacy Note */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[#171717]/50">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Encrypted Session • Zero Image Uploads to Server</span>
        </div>
      </div>
    </div>
  );
};
