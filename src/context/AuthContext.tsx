import React, { createContext, useContext, useState, useEffect, useTransition } from 'react';
import type { UserProfile } from '../types/auth';
import { authClient } from '../services/auth/authClient';
import { patientAuthService, type MessageResponse } from '../services/auth/patientAuthService';

interface AuthContextType {
  currentUser: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  patientLogin: (email: string, password: string) => Promise<void>;
  patientRegister: (fullName: string, email: string, password: string, preferredLanguage?: string) => Promise<MessageResponse>;
  patientVerifyEmail: (email: string, otp: string) => Promise<void>;
  patientResendOtp: (email: string, purpose?: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') => Promise<MessageResponse>;
  patientRequestReset: (email: string) => Promise<MessageResponse>;
  patientVerifyReset: (email: string, otp: string, newPassword: string) => Promise<MessageResponse>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Synchronous initialization from persistent storage ensures 0 flash on page load
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authClient.getStoredUser());
  const [token, setToken] = useState<string | null>(() => authClient.getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // Background validation and profile refresh on application startup
    const stored = authClient.getStoredUser();
    const storedToken = authClient.getStoredToken();

    if (stored && storedToken) {
      // Validate expiration
      if (authClient.isTokenExpired(storedToken)) {
        logout();
        return;
      }

      setCurrentUser(stored);
      setToken(storedToken);

      // If authenticated as PATIENT, verify token validity with backend
      if (stored.role === 'PATIENT') {
        patientAuthService
          .getMe()
          .then((me) => {
            if (me) {
              startTransition(() => {
                setCurrentUser((prev) =>
                  prev
                    ? {
                        ...prev,
                        displayName: me.fullName || prev.displayName,
                        username: me.email || prev.username,
                        userId: me.id || prev.userId,
                      }
                    : null
                );
              });
            }
          })
          .catch((err) => {
            // If backend rejects the token (HTTP 401 or 403), gracefully clear expired session
            if (
              err?.message &&
              (err.message.includes('401') ||
                err.message.includes('403') ||
                err.message.includes('Access denied') ||
                err.message.includes('Unauthorized'))
            ) {
              console.warn('[AuthContext] Persisted session rejected by server. Logging out.');
              logout();
            }
          });
      }
    }
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const resp = await authClient.login(username, password);
      startTransition(() => {
        setCurrentUser({
          userId: resp.userId,
          username: resp.username,
          displayName: resp.displayName,
          role: resp.role,
        });
        setToken(resp.accessToken);
      });
    } finally {
      setIsLoading(false);
    }
  };

  const patientLogin = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const resp = await patientAuthService.login(email, password);
      startTransition(() => {
        setCurrentUser({
          userId: resp.userId,
          username: resp.username,
          displayName: resp.displayName,
          role: 'PATIENT',
        });
        setToken(resp.access_token);
      });
    } finally {
      setIsLoading(false);
    }
  };

  const patientRegister = async (
    fullName: string,
    email: string,
    password: string,
    preferredLanguage?: string
  ): Promise<MessageResponse> => {
    setIsLoading(true);
    try {
      return await patientAuthService.register(fullName, email, password, preferredLanguage);
    } finally {
      setIsLoading(false);
    }
  };

  const patientVerifyEmail = async (email: string, otp: string): Promise<void> => {
    setIsLoading(true);
    try {
      const resp = await patientAuthService.verifyEmail(email, otp);
      startTransition(() => {
        setCurrentUser({
          userId: resp.userId,
          username: resp.username,
          displayName: resp.displayName,
          role: 'PATIENT',
        });
        setToken(resp.access_token);
      });
    } finally {
      setIsLoading(false);
    }
  };

  const patientResendOtp = async (
    email: string,
    purpose?: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET'
  ): Promise<MessageResponse> => {
    setIsLoading(true);
    try {
      return await patientAuthService.resendOtp(email, purpose);
    } finally {
      setIsLoading(false);
    }
  };

  const patientRequestReset = async (email: string): Promise<MessageResponse> => {
    setIsLoading(true);
    try {
      return await patientAuthService.requestPasswordReset(email);
    } finally {
      setIsLoading(false);
    }
  };

  const patientVerifyReset = async (
    email: string,
    otp: string,
    newPassword: string
  ): Promise<MessageResponse> => {
    setIsLoading(true);
    try {
      return await patientAuthService.verifyPasswordReset(email, otp, newPassword);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    authClient.clearSession();

    // Clean up local patient cached keys on explicit logout
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('swasthya_patient_ai_') || k.startsWith('swasthya_auth_'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {
        // ignore
      }

      try {
        const sKeysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith('swasthya_patient_ai_') || k.startsWith('swasthya_auth_'))) {
            sKeysToRemove.push(k);
          }
        }
        sKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
      } catch {
        // ignore
      }
    }

    startTransition(() => {
      setCurrentUser(null);
      setToken(null);
    });
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        token,
        isAuthenticated: currentUser !== null,
        isLoading,
        login,
        logout,
        patientLogin,
        patientRegister,
        patientVerifyEmail,
        patientResendOtp,
        patientRequestReset,
        patientVerifyReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
