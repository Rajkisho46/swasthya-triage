import type { UserProfile, AuthTokenResponse } from '../../types/auth';

const TOKEN_STORAGE_KEY = 'swasthya_auth_token';
const USER_STORAGE_KEY = 'swasthya_auth_user';

export class AuthClient {
  private baseUrl: string;
  private memoryStore: Map<string, string> = new Map();

  constructor(baseUrl?: string) {
    const defaultBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
    this.baseUrl = baseUrl || defaultBase.replace(/\/$/, '');
  }

  /**
   * Log in user via backend API.
   * Role is determined strictly by the backend and returned in TokenResponse.
   */
  async login(username: string, password: string): Promise<AuthTokenResponse> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.trim(),
        password: password.trim(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || 'Invalid credentials. Please check your username and password.');
    }

    const data: AuthTokenResponse = await res.json();
    this.saveSession(data);
    return data;
  }

  /**
   * Check whether a JWT access token has expired based on its standard `exp` claim.
   */
  isTokenExpired(token?: string | null): boolean {
    if (!token) return true;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);
      if (payload && typeof payload.exp === 'number') {
        // Expired if current timestamp exceeds exp (including 10s clock skew buffer)
        return Date.now() >= payload.exp * 1000 - 10000;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Save session token and user profile in persistent localStorage
   * (with sessionStorage fallback if localStorage is disabled/restricted, and memory store fallback).
   */
  saveSession(tokenResp: AuthTokenResponse): void {
    const userJson = JSON.stringify({
      userId: tokenResp.userId,
      username: tokenResp.username,
      displayName: tokenResp.displayName,
      role: tokenResp.role,
    });

    this.memoryStore.set(TOKEN_STORAGE_KEY, tokenResp.accessToken);
    this.memoryStore.set(USER_STORAGE_KEY, userJson);

    if (typeof window !== 'undefined') {
      let savedInLocalStorage = false;
      try {
        if (window.localStorage) {
          window.localStorage.setItem(TOKEN_STORAGE_KEY, tokenResp.accessToken);
          window.localStorage.setItem(USER_STORAGE_KEY, userJson);
          savedInLocalStorage = true;
        }
      } catch {
        savedInLocalStorage = false;
      }

      // If localStorage failed or unavailable, fallback to sessionStorage
      if (!savedInLocalStorage) {
        try {
          if (window.sessionStorage) {
            window.sessionStorage.setItem(TOKEN_STORAGE_KEY, tokenResp.accessToken);
            window.sessionStorage.setItem(USER_STORAGE_KEY, userJson);
          }
        } catch {
          // memoryStore serves as final fallback
        }
      }
    }
  }

  /**
   * Get stored user profile from persistent storage (or fallback stores).
   * Validates token expiration before returning user.
   */
  getStoredUser(): UserProfile | null {
    const token = this.getStoredToken();
    if (!token || this.isTokenExpired(token)) {
      if (token && this.isTokenExpired(token)) {
        this.clearSession();
      }
      return null;
    }

    let raw: string | null | undefined = null;
    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage) {
          raw = window.localStorage.getItem(USER_STORAGE_KEY);
        }
      } catch {
        // ignore
      }
      if (!raw) {
        try {
          if (window.sessionStorage) {
            raw = window.sessionStorage.getItem(USER_STORAGE_KEY);
          }
        } catch {
          // ignore
        }
      }
    }

    if (!raw) {
      raw = this.memoryStore.get(USER_STORAGE_KEY);
    }

    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get stored JWT access token from persistent storage (or fallback stores).
   * Returns null if token is missing or expired.
   */
  getStoredToken(): string | null {
    let token: string | null | undefined = null;

    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage) {
          token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
        }
      } catch {
        // ignore
      }

      if (!token) {
        try {
          if (window.sessionStorage) {
            token = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
          }
        } catch {
          // ignore
        }
      }
    }

    if (!token) {
      token = this.memoryStore.get(TOKEN_STORAGE_KEY) || null;
    }

    if (token && this.isTokenExpired(token)) {
      this.clearSession();
      return null;
    }

    return token || null;
  }

  /**
   * Clear session on logout from all storage tiers.
   */
  clearSession(): void {
    this.memoryStore.clear();

    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage) {
          window.localStorage.removeItem(TOKEN_STORAGE_KEY);
          window.localStorage.removeItem(USER_STORAGE_KEY);
        }
      } catch {
        // ignore
      }

      try {
        if (window.sessionStorage) {
          window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          window.sessionStorage.removeItem(USER_STORAGE_KEY);
        }
      } catch {
        // ignore
      }
    }
  }

  /**
   * Return Authorization header object if authenticated
   */
  getAuthHeader(): Record<string, string> {
    const token = this.getStoredToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }
}

export const authClient = new AuthClient();
