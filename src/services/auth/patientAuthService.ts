import type { AuthTokenResponse } from '../../types/auth';
import { authClient } from './authClient';

export interface PatientUserDTO {
  id: string;
  email: string;
  fullName: string;
  role: 'PATIENT';
  emailVerified: boolean;
  preferredLanguage?: string;
}

export interface PatientAuthResponse {
  access_token: string;
  token_type: string;
  user: PatientUserDTO;
  role: 'PATIENT';
  username: string;
  displayName: string;
  userId: string;
}

export interface MessageResponse {
  status: string;
  message: string;
}

export class PatientAuthService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const defaultBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
    this.baseUrl = baseUrl || defaultBase.replace(/\/$/, '');
  }

  private parseError(status: number, data: any): string {
    if (data?.detail) {
      if (typeof data.detail === 'string') return data.detail;
      if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
    }
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    if (status === 404) {
      return 'Authentication endpoint not found (HTTP 404). Ensure backend server is reachable.';
    }
    if (status === 429) {
      return 'Too many requests. Please wait before trying again.';
    }
    if (status === 500) {
      return 'Internal server error occurred. Please try again later.';
    }
    return `Server returned error (HTTP ${status})`;
  }

  /**
   * Register a new patient account and initiate email OTP verification.
   */
  async register(
    fullName: string,
    email: string,
    password: string,
    preferredLanguage: string = 'English'
  ): Promise<MessageResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/patient/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password: password,
          preferred_language: preferredLanguage,
        }),
      });

      const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      if (!res.ok) {
        throw new Error(this.parseError(res.status, data));
      }
      return data;
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
      throw new Error('Unable to connect to the backend server. Please check your internet connection or verify service status.');
    }
  }

  /**
   * Verify email address with 6-digit OTP code and authenticate.
   */
  async verifyEmail(email: string, otp: string): Promise<PatientAuthResponse> {
    return this.verifyOtp(email, otp);
  }

  /**
   * Verify 6-digit OTP code and authenticate (alias/implementation).
   */
  async verifyOtp(email: string, otp: string): Promise<PatientAuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/patient/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }),
      });

      const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      if (!res.ok) {
        throw new Error(this.parseError(res.status, data));
      }

      // Save session in authClient
      const tokenResp: AuthTokenResponse = {
        accessToken: data.access_token,
        tokenType: data.token_type || 'bearer',
        role: 'PATIENT',
        username: data.username || data.user?.email || email,
        displayName: data.displayName || data.user?.fullName || 'Patient',
        userId: data.userId || data.user?.id || 'usr_pat_01',
      };
      authClient.saveSession(tokenResp);
      return data;
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
      throw new Error('Unable to connect to the backend server. Please check your internet connection or verify service status.');
    }
  }

  /**
   * Log in existing patient with email and password.
   */
  async login(email: string, password: string): Promise<PatientAuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/patient/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
        }),
      });

      const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      if (!res.ok) {
        throw new Error(this.parseError(res.status, data));
      }

      // Save session in authClient
      const tokenResp: AuthTokenResponse = {
        accessToken: data.access_token,
        tokenType: data.token_type || 'bearer',
        role: 'PATIENT',
        username: data.username || data.user?.email || email,
        displayName: data.displayName || data.user?.fullName || 'Patient',
        userId: data.userId || data.user?.id || 'usr_pat_01',
      };
      authClient.saveSession(tokenResp);
      return data;
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
      throw new Error('Unable to connect to the backend server. Please check your internet connection or verify service status.');
    }
  }

  /**
   * Fetch current authenticated patient profile from server.
   */
  async getMe(): Promise<PatientUserDTO> {
    const authHeaders = authClient.getAuthHeader();
    const res = await fetch(`${this.baseUrl}/api/patient/auth/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
    });

    const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    if (!res.ok) {
      throw new Error(this.parseError(res.status, data));
    }
    return data;
  }

  /**
   * Request resending a new OTP code.
   */
  async resendOtp(email: string, purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' = 'EMAIL_VERIFICATION'): Promise<MessageResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/patient/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          purpose: purpose,
        }),
      });

      const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      if (!res.ok) {
        throw new Error(this.parseError(res.status, data));
      }
      return data;
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
      throw new Error('Unable to connect to the backend server. Please check your internet connection or verify service status.');
    }
  }

  /**
   * Initiate password reset request.
   */
  async requestPasswordReset(email: string): Promise<MessageResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/patient/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      });

      const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      if (!res.ok) {
        throw new Error(this.parseError(res.status, data));
      }
      return data;
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
      throw new Error('Unable to connect to the backend server. Please check your internet connection or verify service status.');
    }
  }

  /**
   * Verify password reset OTP and set new password.
   */
  async verifyPasswordReset(email: string, otp: string, newPassword: string): Promise<MessageResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/patient/auth/verify-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
          new_password: newPassword,
        }),
      });

      const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      if (!res.ok) {
        throw new Error(this.parseError(res.status, data));
      }
      return data;
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
      throw new Error('Unable to connect to the backend server. Please check your internet connection or verify service status.');
    }
  }
}

export const patientAuthService = new PatientAuthService();
