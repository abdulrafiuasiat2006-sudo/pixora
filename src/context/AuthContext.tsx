import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserPreferences } from '../types';
import { StorageService, DEFAULT_PREFERENCES } from '../services/storageService';

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
  signup: (name: string, email: string, password?: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updatePreferences: (newPrefs: Partial<UserPreferences>) => void;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => StorageService.getUser());
  const [token, setToken] = useState<string | null>(() => StorageService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [intendedRoute, setIntendedRoute] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(() => StorageService.getPreferences());

  // Verify session on initial mount with backend
  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      const storedToken = StorageService.getToken();

      if (!storedToken) {
        if (isMounted) {
          setUser(null);
          setToken(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            const verifiedUser: UserProfile = {
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              createdAt: data.user.createdAt,
              isGuest: false,
              preferences,
            };
            setUser(verifiedUser);
            setToken(storedToken);
            StorageService.saveUser(verifiedUser);
          }
        } else {
          // Token expired or invalid on server
          console.warn('[AUTH] Stored session invalid or expired. Resetting session.');
          StorageService.clearUser();
          if (isMounted) {
            setUser(null);
            setToken(null);
          }
        }
      } catch (err) {
        console.error('[AUTH] Failed to verify session with server:', err);
        // Fallback to local stored user if offline, but keep valid session
        const localUser = StorageService.getUser();
        if (localUser && storedToken && isMounted) {
          setUser(localUser);
          setToken(storedToken);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    verifySession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password = ''): Promise<AuthResponse> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Authentication failed. Please verify your credentials.',
        };
      }

      const loggedInUser: UserProfile = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        createdAt: data.user.createdAt,
        isGuest: false,
        preferences,
      };

      StorageService.setToken(data.token);
      StorageService.saveUser(loggedInUser);
      setUser(loggedInUser);
      setToken(data.token);

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unable to connect to authentication service.',
      };
    }
  };

  const signup = async (name: string, email: string, password = ''): Promise<AuthResponse> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Account creation failed. Please check your information.',
        };
      }

      const newUser: UserProfile = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        createdAt: data.user.createdAt,
        isGuest: false,
        preferences,
      };

      StorageService.setToken(data.token);
      StorageService.saveUser(newUser);
      setUser(newUser);
      setToken(data.token);

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unable to connect to registration service.',
      };
    }
  };

  const logout = async (): Promise<void> => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.warn('[AUTH] Logout API call failed or offline:', err);
      }
    }

    StorageService.clearUser();
    setUser(null);
    setToken(null);
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      return {
        success: true,
        message: data.message || 'If an account exists with this email, password reset instructions have been dispatched.',
      };
    } catch {
      return {
        success: true,
        message: 'If an account exists with this email, password reset instructions have been dispatched.',
      };
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
        signup,
        logout,
        resetPassword,
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
