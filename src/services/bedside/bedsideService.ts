import { authClient } from '../auth/authClient';
import type { BedsideAssessment, BedsideVitals, NurseObservation, BedsideVerifications } from '../../types/triage';

export interface BackendBedsidePayload {
  vitals?: {
    systolic_bp?: number | null;
    diastolic_bp?: number | null;
    heart_rate?: number | null;
    spo2?: number | null;
    temperature?: number | null;
    temperature_unit?: string;
    respiratory_rate?: number | null;
    blood_glucose?: number | null;
    measurement_timestamp?: string | null;
  };
  observations?: {
    general_appearance?: string | null;
    consciousness?: string | null;
    breathing_effort?: string | null;
    mobility_status?: string | null;
    pain_score?: number | null;
    visible_distress?: string[] | string | boolean | null;
    additional_symptoms?: string | null;
  };
  verification?: {
    allergies?: string | null;
    allergies_verification_status?: string;
    current_medications?: string | null;
    medications_verification_status?: string;
    chief_complaint?: string | null;
    chief_complaint_verification_status?: string;
    relevant_history?: string | null;
    relevant_history_verification_status?: string;
  };
  nurse_notes?: string | null;
  facility_id?: string | null;
  department?: string | null;
  status?: string;
}

export class BedsideService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const defaultBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
    this.baseUrl = baseUrl || defaultBase.replace(/\/$/, '');
  }

  private getHeaders(): Record<string, string> {
    const authHeaders = authClient.getAuthHeader();
    return {
      'Content-Type': 'application/json',
      ...authHeaders,
    };
  }

  /**
   * Helper to convert frontend BedsideAssessment data to backend Pydantic payload format
   */
  formatPayload(
    vitals: BedsideVitals,
    observation: NurseObservation,
    verifications: BedsideVerifications,
    nurseNotes: string,
    department: string = 'Emergency Triage & Bedside Bay',
    status: string = 'completed'
  ): BackendBedsidePayload {
    return {
      vitals: {
        systolic_bp: vitals.systolicBP === '' || vitals.systolicBP === undefined ? null : Number(vitals.systolicBP),
        diastolic_bp: vitals.diastolicBP === '' || vitals.diastolicBP === undefined ? null : Number(vitals.diastolicBP),
        heart_rate: vitals.heartRate === '' || vitals.heartRate === undefined ? null : Number(vitals.heartRate),
        spo2: vitals.spo2 === '' || vitals.spo2 === undefined ? null : Number(vitals.spo2),
        temperature: vitals.temperature === '' || vitals.temperature === undefined ? null : Number(vitals.temperature),
        temperature_unit: vitals.tempUnit || 'F',
        respiratory_rate: vitals.respiratoryRate === '' || vitals.respiratoryRate === undefined ? null : Number(vitals.respiratoryRate),
        blood_glucose: vitals.bloodGlucose === '' || vitals.bloodGlucose === undefined ? null : Number(vitals.bloodGlucose),
        measurement_timestamp: vitals.measuredAt || new Date().toISOString(),
      },
      observations: {
        general_appearance: observation.generalAppearance || null,
        consciousness: observation.consciousnessOrientation || null,
        breathing_effort: observation.breathingEffort || null,
        mobility_status: observation.mobilityStatus || null,
        pain_score: observation.painScore === '' || observation.painScore === undefined ? null : Number(observation.painScore),
        visible_distress: observation.visibleDistress || [],
        additional_symptoms: observation.additionalSymptoms || null,
      },
      verification: {
        allergies: verifications.allergies?.patientValue || null,
        allergies_verification_status: verifications.allergies?.status || 'patient_reported',
        current_medications: verifications.currentMedications?.patientValue || null,
        medications_verification_status: verifications.currentMedications?.status || 'patient_reported',
        chief_complaint: verifications.chiefComplaint?.patientValue || null,
        chief_complaint_verification_status: verifications.chiefComplaint?.status || 'patient_reported',
        relevant_history: verifications.relevantHistory?.patientValue || null,
        relevant_history_verification_status: verifications.relevantHistory?.status || 'patient_reported',
      },
      nurse_notes: nurseNotes.trim() || null,
      department,
      status,
    };
  }

  /**
   * Helper to convert backend JSON response to frontend BedsideAssessment format
   */
  parseBackendResponse(data: any): BedsideAssessment {
    return {
      vitals: {
        systolicBP: data.vitals?.systolic_bp ?? '',
        diastolicBP: data.vitals?.diastolic_bp ?? '',
        heartRate: data.vitals?.heart_rate ?? '',
        spo2: data.vitals?.spo2 ?? '',
        temperature: data.vitals?.temperature ?? '',
        tempUnit: data.vitals?.temperature_unit ?? 'F',
        respiratoryRate: data.vitals?.respiratory_rate ?? '',
        bloodGlucose: data.vitals?.blood_glucose ?? '',
        measuredAt: data.vitals?.measurement_timestamp || data.assessed_at,
      },
      observation: {
        generalAppearance: data.observations?.general_appearance || 'Normal / Well-appearing',
        consciousnessOrientation: data.observations?.consciousness || 'Alert & Oriented (A)',
        breathingEffort: data.observations?.breathing_effort || 'Normal / Unlabored',
        mobilityStatus: data.observations?.mobility_status || 'Ambulatory (Independent)',
        painScore: data.observations?.pain_score ?? 0,
        visibleDistress: Array.isArray(data.observations?.visible_distress)
          ? data.observations.visible_distress
          : ['None Observed'],
        additionalSymptoms: data.observations?.additional_symptoms || '',
      },
      verifications: {
        allergies: {
          itemKey: 'allergies',
          label: 'Allergies',
          patientValue: data.verification?.allergies || 'No Known Drug Allergies (NKDA)',
          status: data.verification?.allergies_verification_status || 'patient_reported',
        },
        currentMedications: {
          itemKey: 'currentMedications',
          label: 'Current Medications',
          patientValue: data.verification?.current_medications || 'No routine daily medications reported',
          status: data.verification?.medications_verification_status || 'patient_reported',
        },
        chiefComplaint: {
          itemKey: 'chiefComplaint',
          label: 'Chief Complaint',
          patientValue: data.verification?.chief_complaint || 'Reported chief complaint',
          status: data.verification?.chief_complaint_verification_status || 'patient_reported',
        },
        relevantHistory: {
          itemKey: 'relevantHistory',
          label: 'Relevant History / Comorbidities',
          patientValue: data.verification?.relevant_history || 'No major past medical history documented',
          status: data.verification?.relevant_history_verification_status || 'patient_reported',
        },
      },
      nurseNotes: data.nurse_notes || '',
      assessmentTime: data.assessed_at || data.created_at,
      nurseId: data.assessor_id || 'usr_nur_01',
      nurseName: data.assessed_by || 'Nurse Priya Nair, RN',
      facilityDepartment: data.department || 'Emergency Triage & Bedside Observation Bay',
      assessmentStatus: data.status === 'pending_physician_review' ? 'pending_physician_review' : 'recorded',
    };
  }

  /**
   * POST /api/cases/{case_id}/bedside-assessment
   * Create and persist a new bedside assessment in the database.
   */
  async createBedsideAssessment(caseId: string, payload: BackendBedsidePayload): Promise<BedsideAssessment> {
    const res = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/bedside-assessment`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `Failed to create bedside assessment (HTTP ${res.status})`);
    }

    const data = await res.json();
    return this.parseBackendResponse(data);
  }

  /**
   * GET /api/cases/{case_id}/bedside-assessments
   * Return all saved bedside assessments for a case.
   */
  async getBedsideAssessments(caseId: string): Promise<BedsideAssessment[]> {
    const res = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/bedside-assessments`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      if (res.status === 404) return [];
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `Failed to fetch bedside assessments (HTTP ${res.status})`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item) => this.parseBackendResponse(item));
  }

  /**
   * GET /api/cases/{case_id}/bedside-assessment/latest
   * Return the latest saved bedside assessment.
   */
  async getLatestBedsideAssessment(caseId: string): Promise<BedsideAssessment | null> {
    const res = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/bedside-assessment/latest`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `Failed to fetch latest bedside assessment (HTTP ${res.status})`);
    }

    const data = await res.json();
    return this.parseBackendResponse(data);
  }

  /**
   * PUT /api/cases/{case_id}/bedside-assessment/{assessment_id}
   * Update an existing assessment.
   */
  async updateBedsideAssessment(
    caseId: string,
    assessmentId: string,
    payload: BackendBedsidePayload
  ): Promise<BedsideAssessment> {
    const res = await fetch(
      `${this.baseUrl}/api/cases/${encodeURIComponent(caseId)}/bedside-assessment/${encodeURIComponent(assessmentId)}`,
      {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `Failed to update bedside assessment (HTTP ${res.status})`);
    }

    const data = await res.json();
    return this.parseBackendResponse(data);
  }
}

export const bedsideService = new BedsideService();
