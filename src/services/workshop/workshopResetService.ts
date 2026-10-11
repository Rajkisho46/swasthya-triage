import type { UserRole } from '../../types/auth';

export type PortalScope = 'PATIENT' | 'NURSE' | 'DOCTOR' | 'ADMIN';

export interface PortalResetSummary {
  portal: PortalScope;
  displayName: string;
  resetScope: string[];
  preservedRecords: string[];
}

export interface PortalResetResult {
  success: boolean;
  portal: PortalScope;
  message: string;
  clearedStorageKeys: string[];
  resetScope: string[];
  preservedRecords: string[];
  serverAudited: boolean;
}

const TOKEN_STORAGE_KEY = 'swasthya_auth_token';
const USER_STORAGE_KEY = 'swasthya_auth_user';

export class WorkshopResetService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const defaultBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
    this.baseUrl = baseUrl || defaultBase.replace(/\/$/, '');
  }

  /**
   * Normalize an incoming role into a validated PortalScope
   */
  normalizePortalScope(role: UserRole | string): PortalScope {
    const upper = (role || '').toUpperCase().trim();
    if (upper === 'NURSE') return 'NURSE';
    if (upper === 'DOCTOR' || upper === 'MEDICAL_REVIEWER' || upper === 'REVIEWER') return 'DOCTOR';
    if (upper === 'ADMIN' || upper === 'ADMINISTRATOR') return 'ADMIN';
    return 'PATIENT';
  }

  /**
   * Retrieve human-readable display name for a portal
   */
  getPortalDisplayName(scope: PortalScope): string {
    switch (scope) {
      case 'NURSE':
        return 'Nurse Portal';
      case 'DOCTOR':
        return 'Medical Reviewer Portal';
      case 'ADMIN':
        return 'Admin Portal';
      case 'PATIENT':
      default:
        return 'Patient Portal';
    }
  }

  /**
   * Get pre-reset summary detailing what will be reset and what is preserved
   */
  getPortalResetSummary(roleOrScope: UserRole | string): PortalResetSummary {
    const portal = this.normalizePortalScope(roleOrScope);
    const displayName = this.getPortalDisplayName(portal);

    const scopeMap: Record<PortalScope, string[]> = {
      PATIENT: [
        'Symptom intake form inputs, voice audio scratchpads & uploaded documents',
        'Health AI conversation history & transient chat session tokens',
        'Patient language preferences & active tab selection',
        'Temporary symptom drafts in browser storage',
      ],
      NURSE: [
        'Nursing queue search queries, urgency filters & status toggles',
        'Bedside vitals draft inputs (Heart Rate, BP, SpO2, Temp, Glucose, RR)',
        'Bedside clinical observation scratchpad & physical exam draft checklists',
        'Selected triage case selection & bedside workspace view',
      ],
      DOCTOR: [
        'Medical Review queue status filters & search parameters',
        'Review modal draft clinical decisions, dispositions & notes',
        'Active case selection & evidence note inspection state',
      ],
      ADMIN: [
        'Audit trail filter selections & search term inputs',
        'Governance telemetry view filters & tab states',
        'Active administration workspace navigation state',
      ],
    };

    const preservedRecords = [
      'Real patient cases and clinical records in database (PatientCase)',
      'Submitted medical reviews and clinician sign-off decisions',
      'Persisted bedside vitals & assessment records in database',
      'Immutable provenance audit logs (AuditEvent)',
      'Active user authentication credentials & login sessions',
      'All other portals’ state, forms, and browser storage',
    ];

    return {
      portal,
      displayName,
      resetScope: scopeMap[portal],
      preservedRecords,
    };
  }

  /**
   * Perform safe, complete reset of the specified portal only.
   * Cleans only keys owned by that portal in localStorage and sessionStorage.
   * Completely preserves auth tokens, user profiles, and other portals' storage.
   * Submits audit event to backend /api/workshop/reset if server is reachable.
   */
  async resetPortalWorkshop(roleOrScope: UserRole | string): Promise<PortalResetResult> {
    const portal = this.normalizePortalScope(roleOrScope);
    const summary = this.getPortalResetSummary(portal);
    const clearedKeys: string[] = [];

    // 1. Scoped Browser Storage Cleanup (localStorage & sessionStorage)
    if (typeof window !== 'undefined') {
      const isPortalKey = (key: string): boolean => {
        // NEVER remove authentication keys or shared system credentials
        if (key === TOKEN_STORAGE_KEY || key === USER_STORAGE_KEY) return false;
        if (key.startsWith('swasthya_auth_')) return false;

        switch (portal) {
          case 'PATIENT':
            return (
              key.startsWith('swasthya_patient_') ||
              key.startsWith('swasthya_intake_') ||
              key.includes('patient_ai')
            );
          case 'NURSE':
            return (
              key.startsWith('swasthya_nurse_') ||
              key.startsWith('swasthya_bedside_')
            );
          case 'DOCTOR':
            return (
              key.startsWith('swasthya_doctor_') ||
              key.startsWith('swasthya_reviewer_')
            );
          case 'ADMIN':
            return (
              key.startsWith('swasthya_admin_')
            );
          default:
            return false;
        }
      };

      try {
        if (window.localStorage) {
          const toRemove: string[] = [];
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && isPortalKey(k)) toRemove.push(k);
          }
          toRemove.forEach((k) => {
            window.localStorage.removeItem(k);
            clearedKeys.push(`localStorage:${k}`);
          });
        }
      } catch (err) {
        console.warn('[WorkshopReset] Error reading/clearing scoped localStorage:', err);
      }

      try {
        if (window.sessionStorage) {
          const sToRemove: string[] = [];
          for (let i = 0; i < window.sessionStorage.length; i++) {
            const k = window.sessionStorage.key(i);
            if (k && isPortalKey(k)) sToRemove.push(k);
          }
          sToRemove.forEach((k) => {
            window.sessionStorage.removeItem(k);
            clearedKeys.push(`sessionStorage:${k}`);
          });
        }
      } catch (err) {
        console.warn('[WorkshopReset] Error reading/clearing scoped sessionStorage:', err);
      }
    }

    // 2. Call backend workshop reset endpoint to enforce permissions and record audit event
    let serverAudited = false;
    try {
      let token: string | null = null;
      if (typeof window !== 'undefined') {
        token =
          window.localStorage?.getItem(TOKEN_STORAGE_KEY) ||
          window.sessionStorage?.getItem(TOKEN_STORAGE_KEY) ||
          null;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${this.baseUrl}/api/workshop/reset`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ portal }),
      });

      if (res.ok) {
        serverAudited = true;
      } else if (res.status === 403) {
        const errorData = await res.json().catch(() => ({ detail: 'Forbidden' }));
        throw new Error(errorData.detail || 'Access Denied: Insufficient permissions to reset this portal.');
      } else {
        console.warn(`[WorkshopReset] Backend reset returned status ${res.status}`);
      }
    } catch (err: any) {
      if (err.message && err.message.includes('Access Denied')) {
        throw err;
      }
      // If backend network error in demo mode, proceed with frontend reset
      console.warn('[WorkshopReset] Backend audit call failed or offline:', err);
    }

    return {
      success: true,
      portal,
      message: `${summary.displayName} workshop has been reset to defaults.`,
      clearedStorageKeys: clearedKeys,
      resetScope: summary.resetScope,
      preservedRecords: summary.preservedRecords,
      serverAudited,
    };
  }
}

export const workshopResetService = new WorkshopResetService();
