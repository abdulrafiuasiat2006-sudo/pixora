import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BRANDING } from '../../config/branding';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface RegisterPageProps {
  onNavigate: (tab: string) => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate }) => {
  const { signup, intendedRoute } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName || cleanName.length < 2) {
      setError('Please provide your full name (at least 2 characters).');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await signup(cleanName, cleanEmail, password);
      if (res.success) {
        const destination = intendedRoute || 'dashboard';
        onNavigate(destination);
      } else {
        setError(res.error || 'Account creation failed. Please check your information.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected registration error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPasswordLongEnough = password.length >= 8;
  const doPasswordsMatch = password && confirmPassword && password === confirmPassword;

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="max-w-md w-full bg-white border border-[#171717]/15 rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#171717] text-[#FF6B35] mb-3 shadow-xs">
            <User className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171717]">
            Create Pixora Account
          </h1>
          <p className="text-xs sm:text-sm text-[#171717]/70 mt-1">
            Set up your creator profile to unlock all photo utilities, presets, and private project saves.
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

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#171717] mb-1.5" htmlFor="reg-name">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                placeholder="e.g. Alex Rivera"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#171717]/20 rounded-lg text-sm text-[#171717] placeholder:text-[#171717]/40 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#171717] mb-1.5" htmlFor="reg-email">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
              <input
                id="reg-email"
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

          <div>
            <label className="block font-semibold text-[#171717] mb-1.5" htmlFor="reg-password">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
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

          <div>
            <label className="block font-semibold text-[#171717] mb-1.5" htmlFor="reg-confirm-password">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
              <input
                id="reg-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#171717]/20 rounded-lg text-sm text-[#171717] placeholder:text-[#171717]/40 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] focus:outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#171717]/50 hover:text-[#171717] transition"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Validation Checklist */}
          <div className="p-2.5 bg-[#F7F5F0] rounded-lg border border-[#171717]/10 space-y-1 text-[11px]">
            <div className={`flex items-center gap-1.5 ${isPasswordLongEnough ? 'text-emerald-700 font-medium' : 'text-[#171717]/60'}`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${isPasswordLongEnough ? 'text-emerald-600' : 'text-[#171717]/30'}`} />
              <span>Minimum 8 characters in length</span>
            </div>
            <div className={`flex items-center gap-1.5 ${doPasswordsMatch ? 'text-emerald-700 font-medium' : 'text-[#171717]/60'}`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${doPasswordsMatch ? 'text-emerald-600' : 'text-[#171717]/30'}`} />
              <span>Passwords match identically</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3 px-4 text-sm font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B35]"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Switch to Login */}
        <div className="mt-6 pt-5 border-t border-[#171717]/10 text-center text-xs">
          <p className="text-[#171717]/70">
            Already registered?{' '}
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="font-bold text-[#FF6B35] hover:underline cursor-pointer"
            >
              Log In
            </button>
          </p>
        </div>

        {/* Privacy Note */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[#171717]/50">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Passwords hashed with scrypt + salt • Zero plain-text storage</span>
        </div>
      </div>
    </div>
  );
};
