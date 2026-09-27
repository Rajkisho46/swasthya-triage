import type { TriageCase, TriageFormData, ReviewerDecision } from '../types/triage';

class CaseService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
  }

  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    try {
      const stored = localStorage.getItem('swasthya_auth_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.token) {
          headers['Authorization'] = `Bearer ${parsed.token}`;
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
    return headers;
  }

  /**
   * Fetch all persisted clinical triage cases from the backend.
   */
  async fetchCases(): Promise<TriageCase[]> {
    try {
      const url = this.baseUrl ? `${this.baseUrl.replace(/\/$/, '')}/api/intake` : '/api/intake';
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!res.ok) {
        console.warn(`[CaseService] fetchCases returned HTTP ${res.status}`);
        return [];
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        return data as TriageCase[];
      }
      return [];
    } catch (err) {
      console.error('[CaseService] Network error in fetchCases:', err);
      return [];
    }
  }

  /**
   * Fetch a single persisted triage case by ID.
   */
  async fetchCaseById(caseId: string): Promise<TriageCase | null> {
    try {
      const url = this.baseUrl
        ? `${this.baseUrl.replace(/\/$/, '')}/api/intake/${encodeURIComponent(caseId)}`
        : `/api/intake/${encodeURIComponent(caseId)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      return data as TriageCase;
    } catch (err) {
      console.error(`[CaseService] Failed to fetch case ${caseId}:`, err);
      return null;
    }
  }

  /**
   * Submit and persist a new patient intake case to the backend database.
   */
  async createCase(formData: TriageFormData): Promise<TriageCase> {
    const url = this.baseUrl ? `${this.baseUrl.replace(/\/$/, '')}/api/intake` : '/api/intake';

    const rawSymptoms = formData.symptoms ? formData.symptoms.trim() : formData.voiceData?.transcript || '';

    const payload = {
      patientId: formData.patientId,
      age: typeof formData.age === 'number' ? formData.age : undefined,
      gender: formData.gender || undefined,
      preferredLanguage: formData.preferredLanguage || 'English',
      symptoms: rawSymptoms,
      consentGiven: formData.consentGiven,
      inputModalities: formData.symptoms ? ['text'] : [],
      voiceData: formData.voiceData,
      ocrReports: formData.ocrReports,
      multilingualData: formData.multilingualData,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to create case: HTTP ${res.status} ${errText}`);
    }

    const resJson = await res.json();

    if (resJson.case) {
      return resJson.case as TriageCase;
    }

    // Fallback: fetch created case by ID if not returned inline
    if (resJson.caseId) {
      const fetched = await this.fetchCaseById(resJson.caseId);
      if (fetched) return fetched;
    }

    throw new Error('Case created on server but failed to retrieve structured record');
  }

  /**
   * Persist a clinician's human review decision to the backend database.
   */
  async submitClinicalReviewDecision(
    caseId: string,
    decision: ReviewerDecision,
    notes?: string,
    reviewerName?: string,
    reviewerRole?: string
  ): Promise<TriageCase> {
    const url = this.baseUrl
      ? `${this.baseUrl.replace(/\/$/, '')}/api/review/${encodeURIComponent(caseId)}/decision`
      : `/api/review/${encodeURIComponent(caseId)}/decision`;

    const payload = {
      decision,
      notes: notes || '',
      reviewerName: reviewerName || 'Dr. Clinical Reviewer',
      reviewerRole: reviewerRole || 'DOCTOR',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(errData.detail || `Failed to submit review decision: HTTP ${res.status}`);
    }

    const resJson = await res.json();
    if (resJson.case) {
      return resJson.case as TriageCase;
    }

    const fetched = await this.fetchCaseById(caseId);
    if (fetched) return fetched;

    throw new Error('Review decision saved on server but failed to reload updated record');
  }

  /**
   * Transition case status to awaiting_review and forward to Medical Review queue.
   */
  async sendForMedicalReview(caseId: string, notes?: string): Promise<TriageCase> {
    const url = this.baseUrl
      ? `${this.baseUrl.replace(/\/$/, '')}/api/cases/${encodeURIComponent(caseId)}/send-to-review`
      : `/api/cases/${encodeURIComponent(caseId)}/send-to-review`;

    const payload = {
      notes: notes || '',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(errData.detail || `Failed to send case for review: HTTP ${res.status}`);
    }

    const resJson = await res.json();
    if (resJson.case) {
      return resJson.case as TriageCase;
    }

    const fetched = await this.fetchCaseById(caseId);
    if (fetched) return fetched;

    throw new Error('Case forwarded to review on server but failed to reload updated record');
  }

  /**
   * Permanently delete a reviewed case from the backend database.
   */
  async deleteCase(caseId: string): Promise<boolean> {
    const url = this.baseUrl
      ? `${this.baseUrl.replace(/\/$/, '')}/api/cases/${encodeURIComponent(caseId)}`
      : `/api/cases/${encodeURIComponent(caseId)}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(errData.detail || `Failed to delete case: HTTP ${res.status}`);
    }

    return true;
  }
}

export const caseService = new CaseService();
