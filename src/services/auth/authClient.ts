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
   * Save session token and user profile in sessionStorage (or memory fallback)
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

    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, tokenResp.accessToken);
      window.sessionStorage.setItem(USER_STORAGE_KEY, userJson);
    }
  }

  /**
   * Get stored user profile from sessionStorage (or memory fallback)
   */
  getStoredUser(): UserProfile | null {
    let raw: string | null | undefined = null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      raw = window.sessionStorage.getItem(USER_STORAGE_KEY);
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
   * Get stored JWT access token
   */
  getStoredToken(): string | null {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const token = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (token) return token;
    }
    return this.memoryStore.get(TOKEN_STORAGE_KEY) || null;
  }

  /**
   * Clear session on logout
   */
  clearSession(): void {
    this.memoryStore.clear();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(USER_STORAGE_KEY);
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
