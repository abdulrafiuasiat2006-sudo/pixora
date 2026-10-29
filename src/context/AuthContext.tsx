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
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isGuest: boolean;
  preferences: UserPreferences;
  intendedRoute: string | null;
  setIntendedRoute: (route: string | null) => void;
  login: (email: string, password?: string) => Promise<AuthResponse>;
  loginWithGoogle: () => Promise<AuthResponse>;
  signup: (name: string, email: string, password?: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string; error?: string }>;
  sendVerificationEmail: () => Promise<{ success: boolean; message?: string; error?: string }>;
  reloadUser: () => Promise<void>;
  updatePreferences: (newPrefs: Partial<UserPreferences>) => void;
  deleteAccount: () => Promise<void>;
}

function formatFirebaseAuthError(error: any, context?: 'login' | 'signup' | 'reset-password' | 'verification'): string {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'The email address is invalid. Please check the spelling.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact support.';
    case 'auth/user-not-found':
      return 'No account was found with this email. Please register.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please verify your credentials or click Forgot Password.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address. Please log in.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Console. Please enable Email/Password under Authentication > Sign-in method in Firebase Console.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 8 characters with letters and numbers.';
    case 'auth/too-many-requests':
      if (context === 'verification') {
        return 'A verification email was sent recently. Please check your spam/junk folder or wait 60 seconds before requesting another.';
      }
      if (context === 'reset-password') {
        return 'A password reset request was recently submitted. Please check your spam/junk folder or wait a moment before trying again.';
      }
      if (context === 'login') {
        return 'Access temporarily blocked due to multiple failed login attempts. Please reset your password or try again later.';
      }
      return 'Too many requests. Please check your inbox/spam folder or wait a moment before trying again.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please verify your internet connection.';
    default:
      return error?.message || 'An unexpected authentication error occurred.';
  }
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
        try {
          const idToken = await firebaseUser.getIdToken();
          const profile: UserProfile = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Pixora Creator',
            email: firebaseUser.email || '',
            emailVerified: firebaseUser.emailVerified,
            isGuest: false,
            createdAt: firebaseUser.metadata.creationTime ? new Date(firebaseUser.metadata.creationTime).getTime() : Date.now(),
            preferences: StorageService.getPreferences(),
          };

          setUser(profile);
          setToken(idToken);
          StorageService.setToken(idToken);
          StorageService.saveUser(profile);
        } catch (e) {
          console.error('[FIREBASE AUTH] Failed to retrieve user token:', e);
        }
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
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await cred.user.getIdToken();
      const userProfile: UserProfile = {
        id: cred.user.uid,
        name: cred.user.displayName || cred.user.email?.split('@')[0] || 'Pixora Creator',
        email: cred.user.email || email.trim(),
        emailVerified: cred.user.emailVerified,
        createdAt: cred.user.metadata.creationTime ? new Date(cred.user.metadata.creationTime).getTime() : Date.now(),
        isGuest: false,
        preferences,
      };

      StorageService.setToken(idToken);
      StorageService.saveUser(userProfile);
      setUser(userProfile);
      setToken(idToken);

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: formatFirebaseAuthError(err, 'login'),
      };
    }
  };

  const loginWithGoogle = async (): Promise<AuthResponse> => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken();
      const userProfile: UserProfile = {
        id: cred.user.uid,
        name: cred.user.displayName || cred.user.email?.split('@')[0] || 'Pixora Creator',
        email: cred.user.email || '',
        emailVerified: cred.user.emailVerified,
        createdAt: cred.user.metadata.creationTime ? new Date(cred.user.metadata.creationTime).getTime() : Date.now(),
        isGuest: false,
        preferences,
      };

      StorageService.setToken(idToken);
      StorageService.saveUser(userProfile);
      setUser(userProfile);
      setToken(idToken);

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: formatFirebaseAuthError(err, 'login'),
      };
    }
  };

  const signup = async (name: string, email: string, password = ''): Promise<AuthResponse> => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name.trim()) {
        try {
          await updateProfile(cred.user, { displayName: name.trim() });
        } catch {
          // ignore display name update errors
        }
      }

      // Automatically send email verification
      try {
        await sendEmailVerification(cred.user);
      } catch (verErr) {
        console.warn('[FIREBASE AUTH] Initial verification email warning:', verErr);
      }

      const idToken = await cred.user.getIdToken();
      const newUser: UserProfile = {
        id: cred.user.uid,
        name: name.trim() || cred.user.email?.split('@')[0] || 'Pixora Creator',
        email: cred.user.email || email.trim(),
        emailVerified: cred.user.emailVerified,
        createdAt: Date.now(),
        isGuest: false,
        preferences,
      };

      // Save user document in Firestore
      try {
        await setDoc(doc(db, 'users', cred.user.uid), {
          id: cred.user.uid,
          name: newUser.name,
          email: newUser.email,
          createdAt: new Date().toISOString(),
          emailVerified: cred.user.emailVerified,
        });
      } catch (dbErr) {
        console.warn('[FIREBASE FIRESTORE] User doc init warning:', dbErr);
      }

      StorageService.setToken(idToken);
      StorageService.saveUser(newUser);
      setUser(newUser);
      setToken(idToken);

      return {
        success: true,
        message: 'Account created! We dispatched a verification link to your email.',
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
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return {
        success: true,
        message: `Password reset instructions have been sent to ${email.trim()}. Please check your inbox and spam folder.`,
      };
    } catch (err: any) {
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
        message: `A verification link has been sent to ${auth.currentUser.email}. Please check your inbox and spam folder.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: formatFirebaseAuthError(err, 'verification'),
      };
    }
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
        preferences,
        intendedRoute,
        setIntendedRoute,
        login,
        loginWithGoogle,
        signup,
        logout,
        resetPassword,
        sendVerificationEmail,
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
