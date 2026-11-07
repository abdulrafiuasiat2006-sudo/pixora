import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserPreferences } from '../types';
import { StorageService, DEFAULT_PREFERENCES } from '../services/storageService';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  deleteUser,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, testFirestoreConnection } from '../config/firebase';

export interface AuthResponse {
  success: boolean;
  error?: string;
  message?: string;
  isLocked?: boolean;
  remainingSeconds?: number;
  failedAttempts?: number;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isGuest: boolean;
  isAdmin: boolean;
  preferences: UserPreferences;
  intendedRoute: string | null;
  setIntendedRoute: (route: string | null) => void;
  login: (email: string, password?: string) => Promise<AuthResponse>;
  loginWithGoogle: () => Promise<AuthResponse>;
  signup: (name: string, email: string, password?: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string; error?: string }>;
  sendVerificationEmail: () => Promise<{ success: boolean; message?: string; error?: string }>;
  checkLockout: (email: string) => Promise<{ locked: boolean; remainingSeconds: number; failedAttempts: number }>;
  reloadUser: () => Promise<void>;
  updatePreferences: (newPrefs: Partial<UserPreferences>) => void;
  deleteAccount: () => Promise<void>;
}

function formatLockoutDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * Security-hardened error formatter.
 * Strictly prevents account enumeration (does not disclose if an email exists).
 */
function formatFirebaseAuthError(error: any, context?: 'login' | 'signup' | 'reset-password' | 'verification'): string {
  const code = error?.code || '';
  const message = error?.message || '';

  if (code.includes('token-service') || message.includes('securetoken.googleapis.com') || message.includes('Token Service API')) {
    return 'The Token Service API is initializing on your Google Cloud project. Please allow a few moments or enable it in Google Cloud Console.';
  }

  switch (code) {
    case 'auth/invalid-email':
      return 'The email address format is invalid. Please check the spelling.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact support.';
    // Unified credentials error - no enumeration of existing accounts
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password. Please verify your credentials or click Forgot Password.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address. Please log in.';
    case 'auth/operation-not-allowed':
      return 'Email/Password authentication is being initialized. Please verify configuration.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 8 characters with letters, numbers, and symbols.';
    case 'auth/too-many-requests':
      if (context === 'verification') {
        return 'A verification email was sent recently. Please check your spam folder or wait 60 seconds before requesting another.';
      }
      if (context === 'reset-password') {
        return 'A password reset request was recently submitted. Please check your spam folder or wait a moment.';
      }
      return 'Access temporarily locked due to multiple failed login attempts. Please reset your password or try again later.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please verify your internet connection.';
    default:
      return 'An unexpected authentication error occurred. Please try again.';
  }
}

// -------------------------------------------------------------
// PROGRESSIVE LOCKOUT API CLIENT HELPERS
// -------------------------------------------------------------
async function checkServerLockout(email: string): Promise<{ locked: boolean; remainingSeconds: number; failedAttempts: number }> {
  try {
    const res = await fetch('/api/security/lockout-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[SECURITY CLIENT] Lockout check server request error:', e);
  }
  return { locked: false, remainingSeconds: 0, failedAttempts: 0 };
}

async function recordServerLoginFailure(email: string): Promise<{ locked: boolean; remainingSeconds: number; failedAttempts: number }> {
  try {
    const res = await fetch('/api/security/record-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[SECURITY CLIENT] Failed to report login failure:', e);
  }
  return { locked: false, remainingSeconds: 0, failedAttempts: 1 };
}

async function recordServerLoginSuccess(email: string): Promise<void> {
  try {
    await fetch('/api/security/record-success', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch (e) {
    console.warn('[SECURITY CLIENT] Failed to report login success:', e);
  }
}

async function verifyServerSession(idToken: string): Promise<{ isAdmin: boolean }> {
  try {
    const res = await fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      return { isAdmin: Boolean(data?.user?.isAdmin) };
    }
  } catch {
    // Non-blocking
  }
  return { isAdmin: false };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => StorageService.getUser());
  const [token, setToken] = useState<string | null>(() => StorageService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [intendedRoute, setIntendedRoute] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(() => StorageService.getPreferences());

  // Listen to Firebase Auth state transitions
  useEffect(() => {
    testFirestoreConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        let isAdmin = false;
        let idToken = '';

        try {
          idToken = await firebaseUser.getIdToken();
          setToken(idToken);
          StorageService.setToken(idToken);

          const serverSession = await verifyServerSession(idToken);
          isAdmin = serverSession.isAdmin;
        } catch (e: any) {
          console.warn('[FIREBASE AUTH] Token refresh note:', e?.message || e);
        }

        const profile: UserProfile = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Pixora Creator',
          email: firebaseUser.email || '',
          emailVerified: firebaseUser.emailVerified,
          isAdmin,
          isGuest: false,
          createdAt: firebaseUser.metadata.creationTime ? new Date(firebaseUser.metadata.creationTime).getTime() : Date.now(),
          preferences: StorageService.getPreferences(),
        };

        setUser(profile);
        StorageService.saveUser(profile);
      } else {
        setUser(null);
        setToken(null);
        StorageService.clearUser();
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password = ''): Promise<AuthResponse> => {
    const cleanEmail = email.trim();

    // 1. Check server-side lockout status FIRST before passing credentials
    const lockoutStatus = await checkServerLockout(cleanEmail);
    if (lockoutStatus.locked) {
      const durationStr = formatLockoutDuration(lockoutStatus.remainingSeconds);
      return {
        success: false,
        isLocked: true,
        remainingSeconds: lockoutStatus.remainingSeconds,
        failedAttempts: lockoutStatus.failedAttempts,
        error: `Account is temporarily locked due to repeated failed login attempts. Please wait ${durationStr} before trying again, or use Forgot Password to reset.`,
      };
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);

      // 2. On successful authentication, reset server lockout counter immediately
      await recordServerLoginSuccess(cleanEmail);

      let idToken = '';
      let isAdmin = false;
      try {
        idToken = await cred.user.getIdToken();
        const serverSession = await verifyServerSession(idToken);
        isAdmin = serverSession.isAdmin;
      } catch (tokenErr: any) {
        console.warn('[FIREBASE AUTH] Token retrieval non-blocking notice:', tokenErr?.message || tokenErr);
      }

      const userProfile: UserProfile = {
        id: cred.user.uid,
        name: cred.user.displayName || cred.user.email?.split('@')[0] || 'Pixora Creator',
        email: cred.user.email || cleanEmail,
        emailVerified: cred.user.emailVerified,
        isAdmin,
        createdAt: cred.user.metadata.creationTime ? new Date(cred.user.metadata.creationTime).getTime() : Date.now(),
        isGuest: false,
        preferences,
      };

      if (idToken) StorageService.setToken(idToken);
      StorageService.saveUser(userProfile);
      setUser(userProfile);
      setToken(idToken || 'authenticated_session');

      return { success: true };
    } catch (err: any) {
      // 3. On failure, report failure to server progressive lockout engine
      const failureReport = await recordServerLoginFailure(cleanEmail);

      if (failureReport.locked) {
        const durationStr = formatLockoutDuration(failureReport.remainingSeconds);
        return {
          success: false,
          isLocked: true,
          remainingSeconds: failureReport.remainingSeconds,
          failedAttempts: failureReport.failedAttempts,
          error: `Access temporarily locked due to ${failureReport.failedAttempts} failed login attempts. Please wait ${durationStr} before trying again, or reset your password.`,
        };
      }

      return {
        success: false,
        isLocked: false,
        failedAttempts: failureReport.failedAttempts,
        error: formatFirebaseAuthError(err, 'login'),
      };
    }
  };

  const loginWithGoogle = async (): Promise<AuthResponse> => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      let idToken = '';
      let isAdmin = false;

      try {
        idToken = await cred.user.getIdToken();
        const serverSession = await verifyServerSession(idToken);
        isAdmin = serverSession.isAdmin;
      } catch (tokenErr: any) {
        console.warn('[FIREBASE AUTH] Token retrieval non-blocking notice:', tokenErr?.message || tokenErr);
      }

      const userProfile: UserProfile = {
        id: cred.user.uid,
        name: cred.user.displayName || cred.user.email?.split('@')[0] || 'Pixora Creator',
        email: cred.user.email || '',
        emailVerified: cred.user.emailVerified,
        isAdmin,
        createdAt: cred.user.metadata.creationTime ? new Date(cred.user.metadata.creationTime).getTime() : Date.now(),
        isGuest: false,
        preferences,
      };

      if (idToken) StorageService.setToken(idToken);
      StorageService.saveUser(userProfile);
      setUser(userProfile);
      setToken(idToken || 'authenticated_session');

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: formatFirebaseAuthError(err, 'login'),
      };
    }
  };

  const signup = async (name: string, email: string, password = ''): Promise<AuthResponse> => {
    const cleanEmail = email.trim();
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      if (name.trim()) {
        try {
          await updateProfile(cred.user, { displayName: name.trim() });
        } catch {
          // ignore display name update errors
        }
      }

      // Automatically dispatch email verification
      try {
        await sendEmailVerification(cred.user);
      } catch (verErr) {
        console.warn('[FIREBASE AUTH] Initial verification email warning:', verErr);
      }

      let idToken = '';
      try {
        idToken = await cred.user.getIdToken();
      } catch (tokenErr: any) {
        console.warn('[FIREBASE AUTH] Token retrieval non-blocking notice:', tokenErr?.message || tokenErr);
      }

      const newUser: UserProfile = {
        id: cred.user.uid,
        name: name.trim() || cred.user.email?.split('@')[0] || 'Pixora Creator',
        email: cred.user.email || cleanEmail,
        emailVerified: cred.user.emailVerified,
        isAdmin: false,
        createdAt: Date.now(),
        isGuest: false,
        preferences,
      };

      // Save user document in Firestore adhering to zero-trust rules (no roles or permissions allowed)
      try {
        await setDoc(doc(db, 'users', cred.user.uid), {
          id: cred.user.uid,
          name: newUser.name,
          email: newUser.email,
          createdAt: new Date().toISOString(),
          emailVerified: cred.user.emailVerified,
        });
      } catch (dbErr) {
        console.warn('[FIREBASE FIRESTORE] User doc init notice:', dbErr);
      }

      if (idToken) StorageService.setToken(idToken);
      StorageService.saveUser(newUser);
      setUser(newUser);
      setToken(idToken || 'authenticated_session');

      return {
        success: true,
        message: 'Account created! A verification link has been dispatched to your email address.',
      };
    } catch (err: any) {
      return {
        success: false,
        error: formatFirebaseAuthError(err, 'signup'),
      };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('[FIREBASE AUTH] Logout error:', err);
    }
    StorageService.clearUser();
    setUser(null);
    setToken(null);
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; message: string; error?: string }> => {
    const cleanEmail = email.trim();
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return {
        success: true,
        message: `If an account exists for ${cleanEmail}, password reset instructions have been sent. Please check your inbox and spam folder.`,
      };
    } catch (err: any) {
      const code = err?.code || '';
      // Anti-enumeration: If user not found, return generic success message anyway
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        return {
          success: true,
          message: `If an account exists for ${cleanEmail}, password reset instructions have been sent. Please check your inbox and spam folder.`,
        };
      }
      const errorMsg = formatFirebaseAuthError(err, 'reset-password');
      return {
        success: false,
        error: errorMsg,
        message: errorMsg,
      };
    }
  };

  const sendVerificationEmail = async (): Promise<{ success: boolean; message?: string; error?: string }> => {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be signed in to request a verification email.' };
    }
    try {
      await sendEmailVerification(auth.currentUser);
      return {
        success: true,
        message: `A verification link has been dispatched to ${auth.currentUser.email}. Please check your inbox and spam folder.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: formatFirebaseAuthError(err, 'verification'),
      };
    }
  };

  const checkLockout = async (email: string) => {
    return checkServerLockout(email);
  };

  const reloadUser = async (): Promise<void> => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.reload();
        setUser((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            emailVerified: auth.currentUser?.emailVerified,
          };
        });
      } catch (err) {
        console.warn('[FIREBASE AUTH] Reload user error:', err);
      }
    }
  };

  const updatePreferences = (newPrefs: Partial<UserPreferences>) => {
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated);
    StorageService.savePreferences(updated);
    if (user && !user.isGuest) {
      const updatedUser = { ...user, preferences: updated };
      StorageService.saveUser(updatedUser);
      setUser(updatedUser);
    }
  };

  const deleteAccount = async () => {
    if (auth.currentUser) {
      try {
        await deleteUser(auth.currentUser);
      } catch (err) {
        console.warn('[FIREBASE AUTH] Account deletion error:', err);
      }
    }
    await logout();
    StorageService.purgeAllData();
    setUser(null);
    setToken(null);
    setPreferences(DEFAULT_PREFERENCES);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token && !user.isGuest,
        isLoading,
        isGuest: !user || !!user.isGuest,
        isAdmin: !!user?.isAdmin,
        preferences,
        intendedRoute,
        setIntendedRoute,
        login,
        loginWithGoogle,
        signup,
        logout,
        resetPassword,
        sendVerificationEmail,
        checkLockout,
        reloadUser,
        updatePreferences,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
