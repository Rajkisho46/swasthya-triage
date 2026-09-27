export type UrgencyLevel = 'ROUTINE' | 'ELEVATED' | 'HIGH_URGENCY';

export type ReviewerDecision = 'Routine Review' | 'Escalate' | 'Refer';

export type ReviewStatus = 'awaiting_nursing_triage' | 'awaiting_review' | 'reviewed';

export type ProvenanceSource = 'PATIENT' | 'AI' | 'REVIEWER' | 'SYSTEM';

export type InputModality = 'text' | 'voice' | 'ocr_image' | 'ocr_pdf';

export interface ExtractedTimelineItem {
  symptom: string;
  durationOrOnset: string;
  notes?: string;
  source?: ProvenanceSource;
}

export interface UrgencySignal {
  signal: string;
  level: 'advisory' | 'attention_required' | 'immediate_attention';
  reason: string;
  source?: ProvenanceSource;
}

export interface VoiceInputData {
  audioBlobUrl?: string;
  durationSeconds?: number;
  transcript: string;
  originalLanguage: string;
  isDemoTranscription: boolean;
  recordedAt: string;
  provider?: string;
  provenance?: string;
  rawTranscription?: string;
}

export interface OCRReportData {
  id: string;
  fileName: string;
  fileType: 'image' | 'pdf';
  fileSize?: string;
  extractedText: string;
  reportCategory?: string;
  isDemoOCR: boolean;
  uploadedAt: string;
}

export interface MultilingualData {
  originalLanguage: string;
  originalText: string;
  translatedText?: string;
  isTranslated: boolean;
  translationProvider?: string;
}

export interface TriageCase {
  caseId: string;
  patientId: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
  preferredLanguage: string;
  rawSymptoms: string;
  consentGiven: boolean;
  createdAt: string;

  // V2 Multimodal & Multilingual Provenance
  inputModalities?: InputModality[];
  voiceData?: VoiceInputData;
  ocrReports?: OCRReportData[];
  multilingualData?: MultilingualData;
  processorUsed?: string;
  isFallbackUsed?: boolean;
  fallbackReason?: string;

  // AI-extracted advisory sections (Provenance: AI)
  extractedSymptoms: string[];
  timeline: ExtractedTimelineItem[];
  missingInformation: string[];
  followUpQuestions: string[];
  urgencySignals: UrgencySignal[];
  aiSummary: string;

  // Backward compatibility alias for reports
  uploadedReports?: Array<{
    fileName: string;
    fileType: string;
    extractedSnippet?: string;
  }>;

  // Bedside Assessment section (Provenance: NURSE - Objective measurement & bedside observation)
  bedsideAssessment?: BedsideAssessment;

  // Reviewer section (Provenance: REVIEWER - Human in the loop)
  reviewStatus: ReviewStatus;
  reviewerNotes?: string;
  reviewerDecision?: ReviewerDecision;
  reviewedAt?: string;
  reviewerName?: string;
}

export interface BedsideVitals {
  systolicBP?: number | '';
  diastolicBP?: number | '';
  heartRate?: number | '';
  spo2?: number | '';
  temperature?: number | '';
  tempUnit?: 'C' | 'F';
  respiratoryRate?: number | '';
  bloodGlucose?: number | '';
  measuredAt?: string;
}

export type BedsideVerificationStatus = 'patient_reported' | 'nurse_verified' | 'unable_to_verify';

export interface VerificationItemState {
  itemKey: string;
  label: string;
  patientValue: string;
  status: BedsideVerificationStatus;
  notes?: string;
}

export interface NurseObservation {
  generalAppearance?: string;
  consciousnessOrientation?: string;
  breathingEffort?: string;
  mobilityStatus?: string;
  painScore?: number | '';
  visibleDistress?: string[];
  additionalSymptoms?: string;
}

export interface BedsideVerifications {
  allergies?: VerificationItemState;
  currentMedications?: VerificationItemState;
  chiefComplaint?: VerificationItemState;
  relevantHistory?: VerificationItemState;
}

export interface BedsideAssessment {
  vitals: BedsideVitals;
  observation: NurseObservation;
  verifications: BedsideVerifications;
  nurseNotes: string;
  assessmentTime: string;
  nurseId: string;
  nurseName: string;
  facilityDepartment: string;
  assessmentStatus: 'recorded' | 'pending_physician_review';
}

export interface AuditEvent {
  id: string;
  caseId: string;
  timestamp: string;
  actor: 'Patient' | 'Patient / Health Worker' | 'Nurse' | 'AI Triage Engine' | 'Medical Reviewer' | 'System' | string;
  action: string;
  details?: string;
}

export interface TriageFormData {
  caseId?: string;
  patientId: string;
  age?: number | '';
  gender?: 'Male' | 'Female' | 'Other' | 'Prefer not to say' | '';
  preferredLanguage?: string;
  symptoms: string;
  consentGiven: boolean;

  // V2 Multimodal inputs
  voiceData?: VoiceInputData;
  ocrReports?: OCRReportData[];
  multilingualData?: MultilingualData;
  inputModalities?: InputModality[];
}
