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
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authClient.getStoredUser());
  const [token, setToken] = useState<string | null>(() => authClient.getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // Check if there is already an existing valid stored user session on refresh
    const stored = authClient.getStoredUser();
    const storedToken = authClient.getStoredToken();
    if (stored && storedToken) {
      setCurrentUser(stored);
      setToken(storedToken);
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
