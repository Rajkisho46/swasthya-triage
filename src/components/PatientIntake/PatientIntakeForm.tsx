import React, { useState } from 'react';
import {
  CheckSquare,
  AlertCircle,
  Mic,
  FileText,
  Cpu,
  Upload,
  Check,
  User,
  ArrowRight,
  FileSearch,
  RefreshCw,
  Square,
  Info,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import type {
  TriageFormData,
  TriageCase,
  VoiceInputData,
  OCRReportData,
  MultilingualData,
} from '../../types/triage';
import type { TrustCenterTab } from '../TrustCenter/PrivacyTrustCenter';
import { generatePatientId, generateCaseId } from '../../utils/caseId';

import {
  getActiveProcessorMode,
  setActiveProcessorMode,
  getAllAvailableProcessors,
} from '../../services/processor/processorFactory';
import { defaultSpeechService } from '../../services/stt/MockSpeechService';
import { backendSpeechService } from '../../services/stt/BackendSpeechService';
import { defaultOCRService } from '../../services/ocr/MockOCRService';
import { defaultTranslationService } from '../../services/translation/MockTranslationService';
import { caseService } from '../../services/caseService';
import { recordAuditEvent } from '../../utils/audit';

import { SafetyBanner } from '../SafetyDisclaimer/SafetyBanner';
import { CaseJourney } from '../Layout/CaseJourney';

interface PatientIntakeFormProps {
  onCaseCreated: (newCase: TriageCase) => void;
  onOpenTrustCenter?: (tab?: TrustCenterTab) => void;
  defaultPatientId?: string;
  initialSymptoms?: string;
  initialLanguage?: string;
  initialOCRReports?: OCRReportData[];
}


export const PatientIntakeForm: React.FC<PatientIntakeFormProps> = ({
  onCaseCreated,
  onOpenTrustCenter,
  defaultPatientId,
  initialSymptoms = '',
  initialLanguage = 'English',
  initialOCRReports = [],
}) => {
  const [patientId, setPatientId] = useState<string>(() => defaultPatientId || generatePatientId());
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState<TriageFormData['gender']>('');
  const [preferredLanguage, setPreferredLanguage] = useState<string>(() => initialLanguage || 'English');
  const [symptoms, setSymptoms] = useState<string>(() => initialSymptoms || '');
  const [consentGiven, setConsentGiven] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // V2 Multimodal State
  const [activeInputMode, setActiveInputMode] = useState<'text' | 'voice' | 'ocr'>('text');
  const [voiceData, setVoiceData] = useState<VoiceInputData | undefined>(undefined);
  const [ocrReports, setOcrReports] = useState<OCRReportData[]>(() => initialOCRReports || []);
  const [processorMode, setProcessorModeState] = useState<'deterministic' | 'ai_pluggable'>(
    getActiveProcessorMode()
  );

  // Live Voice Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isTranscribingVoice, setIsTranscribingVoice] = useState<boolean>(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSecondsRef = React.useRef<number>(0);

  const cleanupRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.error('Error stopping media tracks:', err);
      }
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error('Error stopping MediaRecorder:', err);
      }
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
  };

  React.useEffect(() => {
    return () => {
      cleanupRecording();
    };
  }, []);

  const availableProcessors = getAllAvailableProcessors();
  const voiceSamples = defaultSpeechService.getPreloadedVoiceScenarios();
  const sampleReports = defaultOCRService.getPreloadedSampleReports();


  const handleSelectVoiceSample = async (sampleId: string) => {
    cleanupRecording();
    const selected = voiceSamples.find((v) => v.id === sampleId);
    if (!selected) return;

    setIsProcessing(true);
    try {
      const result = await backendSpeechService.transcribeAudio(sampleId, {
        language: selected.language,
      });
      setVoiceData(result);
      if (!symptoms) {
        setSymptoms(result.transcript);
      }
      setPreferredLanguage(selected.language);
    } catch (err: unknown) {
      console.error('Error transcribing audio sample:', err);
      setErrors((prev) => ({
        ...prev,
        voice: 'Voice audio transcription could not be completed. Please try another sample or type symptoms manually.',
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartLiveRecording = async () => {
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy.voice;
      return copy;
    });

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setErrors((prev) => ({
        ...prev,
        voice: 'Microphone recording is not supported in this browser environment. Please select a clinical scenario sample below or enter symptoms manually.',
      }));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        const finalDuration = recordingSecondsRef.current || 5;

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        setIsRecording(false);
        setIsTranscribingVoice(true);

        try {
          const result = await backendSpeechService.transcribeAudio(audioBlob, {
            language: preferredLanguage,
            durationSeconds: Math.max(1, finalDuration),
          });
          setVoiceData(result);
          if (!symptoms) {
            setSymptoms(result.transcript);
          }
        } catch (err: unknown) {
          console.error('Error transcribing live audio recording:', err);
          setErrors((prev) => ({
            ...prev,
            voice: 'Voice audio transcription could not be completed. Please try another sample or type symptoms manually.',
          }));
        } finally {
          setIsTranscribingVoice(false);
          setRecordingSeconds(0);
          recordingSecondsRef.current = 0;
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          recordingSecondsRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access error:', err);
      let errorMsg = 'Voice audio recording could not be completed. Please try again or select an audio sample.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        errorMsg = 'Microphone permission was denied. Please allow microphone access in your browser or select an audio sample below.';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        errorMsg = 'No microphone device was detected on your system. Please use the clinical sample scenarios below.';
      } else if (err?.name === 'NotSupportedError') {
        errorMsg = 'Audio recording is not supported on this browser or connection. Please use the clinical voice samples.';
      }
      setErrors((prev) => ({
        ...prev,
        voice: errorMsg,
      }));
      cleanupRecording();
    }
  };

  const handleStopLiveRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error('Error stopping recorder:', err);
      }
    }
  };

  const handleCancelLiveRecording = () => {
    cleanupRecording();
    audioChunksRef.current = [];
  };

  const handleAddOCRReport = async (reportId: string) => {
    const selected = sampleReports.find((r) => r.id === reportId);
    if (!selected) return;

    setIsProcessing(true);
    try {
      const result = await defaultOCRService.extractTextFromDocument(reportId, selected.fileType);
      setOcrReports((prev) => {
        if (prev.some((r) => r.fileName === result.fileName)) return prev;
        return [...prev, result];
      });
    } catch (err: unknown) {
      console.error('Error processing OCR document:', err);
      setErrors((prev) => ({
        ...prev,
        ocr: 'Document OCR parsing could not be completed. Please check the document format.',
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const fileType = file.type.includes('pdf') ? 'pdf' : 'image';
      const result = await defaultOCRService.extractTextFromDocument(file, fileType);
      setOcrReports((prev) => [...prev, result]);
    } catch (err: unknown) {
      console.error('Error extracting uploaded file:', err);
      setErrors((prev) => ({
        ...prev,
        ocr: 'Failed to extract text from the uploaded document. Please upload a PDF or image.',
      }));
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleProcessorChange = (mode: 'deterministic' | 'ai_pluggable') => {
    setActiveProcessorMode(mode);
    setProcessorModeState(mode);
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const hasAnyInput = symptoms.trim() || voiceData || ocrReports.length > 0;

    if (!hasAnyInput) {
      newErrors.symptoms = 'Reported symptoms, voice transcript, or document upload is required to generate triage note.';
    }

    if (!consentGiven) {
      newErrors.consent = 'Patient/Guardian consent is mandatory before processing.';
    }

    if (age !== '' && (age < 0 || age > 125)) {
      newErrors.age = 'Please enter a valid age between 0 and 125.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsProcessing(true);

    try {
      const caseId = generateCaseId();

      // 1. STEP 1: Validate & Record Consent and Patient Intake
      recordAuditEvent(
        caseId,
        'Patient',
        'Consent recorded',
        'Patient / guardian informed consent confirmed for prototype triage processing'
      );

      const modalitiesList: string[] = ['text'];
      if (voiceData) modalitiesList.push('voice');
      if (ocrReports.length > 0) modalitiesList.push('ocr');

      recordAuditEvent(
        caseId,
        'Patient',
        'Patient intake submitted',
        `Patient: ${patientId}, Age: ${age || 'N/A'}, Language: ${preferredLanguage} | Modalities: [${modalitiesList.join(', ')}]`
      );

      // 2. STEP 2: Record Multimodal Input Events (if present)
      if (voiceData) {
        recordAuditEvent(
          caseId,
          'System',
          voiceData.isDemoTranscription ? 'Voice audio transcribed (Demo STT)' : 'Voice audio transcribed (Backend STT)',
          `Duration: ${voiceData.durationSeconds}s | Language: ${voiceData.originalLanguage} | Provider: ${voiceData.provider || (voiceData.isDemoTranscription ? 'Demo STT' : 'Gemini STT')} | Provenance: Patient-Provided`
        );
      }

      if (ocrReports.length > 0) {
        recordAuditEvent(
          caseId,
          'System',
          `Medical documents processed via OCR (${ocrReports.length} files)`,
          ocrReports.map((r) => `${r.fileName} (${r.reportCategory || r.fileType})`).join(', ')
        );
      }

      // Multilingual Normalization if required
      let multilingualData: MultilingualData | undefined = undefined;
      const rawText = symptoms.trim() || voiceData?.transcript || '';

      if (preferredLanguage !== 'English' && rawText) {
        multilingualData = await defaultTranslationService.translateToNormalizedEnglish(
          rawText,
          preferredLanguage
        );
        if (multilingualData?.isTranslated) {
          recordAuditEvent(
            caseId,
            'System',
            'Multilingual text normalized to English',
            `Original Language: ${multilingualData.originalLanguage} (Original text preserved)`
          );
        }
      }

      const formData: TriageFormData = {
        caseId,
        patientId,
        age,
        gender,
        preferredLanguage,
        symptoms: rawText,
        consentGiven,
        voiceData,
        ocrReports: ocrReports.length > 0 ? ocrReports : undefined,
        multilingualData,
      };

      // 3. STEP 3: Persist case to real backend database via caseService (POST /api/intake)
      const triageCase = await caseService.createCase(formData);

      // 4. STEP 4: Record Structured Triage Note / Summary Generated in audit log
      recordAuditEvent(
        triageCase.caseId,
        'AI Triage Engine',
        'Structured triage note generated & persisted to backend',
        `Extracted symptoms: ${triageCase.extractedSymptoms?.join(', ') || 'None'} | Urgency Signals: ${triageCase.urgencySignals?.length || 0} | Processor: ${triageCase.processorUsed || 'Deterministic'}`
      );

      onCaseCreated(triageCase);

    } catch (err: unknown) {
      console.error('Error during triage intake persistence:', err);
      const errorMsg = (err instanceof Error && err.message)
        ? `Unable to create case. The clinical backend could not save this case (${err.message}). Please retry.`
        : 'Unable to create case. The clinical backend could not save this case. Please retry.';
      setErrors((prev) => ({
        ...prev,
        form: errorMsg,
      }));
    } finally {
      setIsProcessing(false);
    }

  };

  const initials = patientId.slice(-4);

  return (
    <div className="patient-intake-container" role="region" aria-label="Patient Intake Workspace">
      <SafetyBanner />

      {/* Global Clinical Evidence Chain Stepper */}
      <CaseJourney
        currentStep="intake"
        compact
        intakeState={{
          hasPatientInfo: Boolean(symptoms.trim() || age !== '' || gender),
          consentGiven,
          hasMultimodal: Boolean(voiceData || ocrReports.length > 0),
        }}
      />

      {/* Screen Title & Command Center State Bar */}
      <div className="intake-screen-header scroll-reveal">
        <div className="intake-header-left">
          <span className="intake-step-badge">01 / PATIENT INTAKE</span>
          <h2 className="intake-title">Create Triage Case</h2>
          <p className="intake-subtitle">
            Capture patient-provided information and multimodal evidence for structured triage review.
          </p>
        </div>
        <div className="intake-status-pill">
          <span className="pulse-indicator-teal" aria-hidden="true" />
          <span>Ready for Intake</span>
        </div>
      </div>


      <form onSubmit={handleSubmit} noValidate>
        {/* Main 2-Column Split Workspace */}
        <div className="intake-grid-layout">
          {/* LEFT COLUMN: Patient Identity & Profile */}
          <div className="glass-card scroll-reveal reveal-delay-2" style={{ background: '#13181D', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '1.35rem 1.5rem' }}>
            <div className="card-header" style={{ marginBottom: '0.75rem', paddingBottom: '0.65rem', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={18} color="#67E8D4" aria-hidden="true" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#F5F5F2' }}>
                  PATIENT PROFILE
                </h3>
              </div>
              <span className="provenance-tag patient">Source: PATIENT EVIDENCE</span>
            </div>

            {/* Data Minimization Notice */}
            <div
              className="data-minimization-banner"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.76rem',
                color: '#A3AEAC',
                padding: '0.45rem 0.70rem',
                borderRadius: '10px',
                marginBottom: '0.85rem',
                border: '1px solid rgba(103, 232, 212, 0.16)',
                background: 'rgba(103, 232, 212, 0.04)',
              }}
            >
              <Lock size={12} color="#67E8D4" aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>Only information needed for this triage workflow is requested.</span>
            </div>

            {/* Profile Identity Card Display */}
            <div className="profile-identity-card">
              <div className="profile-avatar-initials" aria-hidden="true">
                {initials || 'PT'}
              </div>
              <div className="profile-details-group">
                <div className="profile-id-row">
                  <span className="profile-id-text">{patientId}</span>
                  {!defaultPatientId && (
                    <button
                      type="button"
                      className="btn btn-secondary glass"
                      onClick={() => setPatientId(generatePatientId())}
                      title="Generate new anonymous Patient ID"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem' }}
                    >
                      <RefreshCw size={11} aria-hidden="true" />
                      <span>New ID</span>
                    </button>
                  )}
                </div>
                <span className="profile-meta-text">
                  {age ? `${age} yrs` : 'Age unspecified'} &bull; {gender || 'Gender unspecified'} &bull; {preferredLanguage}
                </span>
              </div>
            </div>

            {/* Demographics Input Fields */}
            <div className="form-group">
              <label htmlFor="patient-id" className="form-label">
                Patient Identifier (Anonymized) <span className="required">*</span>
              </label>
              <input
                id="patient-id"
                type="text"
                className="form-input glass-input"
                value={patientId}
                readOnly
                aria-label="Anonymized Patient Identifier"
              />
              <span className="form-help">System-generated to protect patient privacy</span>
            </div>

            <div className="demographics-grid">
              <div className="form-group">
                <label htmlFor="patient-age" className="form-label">
                  Age (Years)
                </label>
                <input
                  id="patient-age"
                  type="number"
                  min="0"
                  max="125"
                  className="form-input glass-input"
                  placeholder="e.g. 67"
                  value={age}
                  onChange={(e) => setAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                />
                {errors.age && <span className="form-error">{errors.age}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="patient-gender" className="form-label">
                  Gender
                </label>
                <select
                  id="patient-gender"
                  className="form-select glass-input"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as TriageFormData['gender'])}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="patient-language" className="form-label">
                Preferred Language
              </label>
              <select
                id="patient-language"
                className="form-select glass-input"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi (हिंदी)</option>
                <option value="Regional (Tamil)">Regional (Tamil - தமிழ்)</option>
                <option value="Regional (Telugu)">Regional (Telugu - తెలుగు)</option>
                <option value="Regional (Bengali)">Regional (Bengali - বাংলা)</option>
                <option value="Regional (Marathi)">Regional (Marathi - मराठी)</option>
                <option value="Regional (Kannada)">Regional (Kannada - ಕನ್ನಡ)</option>
              </select>
            </div>
            <div
              style={{
                marginTop: '1.15rem',
                padding: '0.85rem 1rem',
                background: '#182025',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.50rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', fontWeight: 700, color: '#A3AEAC' }}>
                  <Cpu size={14} color="#67E8D4" aria-hidden="true" />
                  <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Triage Engine Selection</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.50rem', flexWrap: 'wrap' }}>
                {availableProcessors.map((p) => {
                  const mode = p.isAIBased ? 'ai_pluggable' : 'deterministic';
                  const isSelected = processorMode === mode;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleProcessorChange(mode)}
                      className={`sample-chip-btn ${isSelected ? 'active' : ''}`}
                      title={p.description}
                    >
                      {isSelected && <Check size={12} style={{ display: 'inline', marginRight: '4px' }} />}
                      {p.isAIBased ? 'AI-Ready Processor' : 'Deterministic Engine (V1)'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Multimodal Ingestion Dock */}
          <div className="glass-card scroll-reveal reveal-delay-3" style={{ background: '#13181D', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '1.35rem 1.5rem' }}>
            <div className="card-header" style={{ marginBottom: '0.85rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileSearch size={18} color="#67E8D4" aria-hidden="true" />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#F5F5F2' }}>
                    MULTIMODAL INPUT DOCK
                  </h3>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Select available patient evidence capture pathways
                </div>
              </div>
              <span className="provenance-tag multimodal">SOURCE: MULTIMODAL</span>
            </div>

            {/* 3 Pathway Cards */}
            <div className="multimodal-modules-grid">
              {/* Pathway 1: Text */}
              <button
                type="button"
                className={`modality-card ${activeInputMode === 'text' ? 'active' : ''}`}
                onClick={() => setActiveInputMode('text')}
                aria-pressed={activeInputMode === 'text'}
                aria-label="Select Text Narrative modality"
              >
                <div className="modality-card-header">
                  <span className="modality-card-title">
                    <FileText size={16} color="#67E8D4" aria-hidden="true" />
                    <span>01 / Text</span>
                  </span>
                  <span className="badge badge-teal" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                    {symptoms.trim() ? 'BUFFERED' : 'READY'}
                  </span>
                </div>
                <p className="modality-card-sub">Structured input buffer for verbatim clinical statements.</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <span className="font-mono">{symptoms.length} chars</span>
                  <span style={{ color: symptoms.trim() ? '#67E8D4' : 'var(--text-muted)' }}>
                    {symptoms.trim() ? 'Synced' : 'Empty'}
                  </span>
                </div>
              </button>

              {/* Pathway 2: Voice STT */}
              <button
                type="button"
                id="modality-voice-btn"
                className={`modality-card glass-card ${activeInputMode === 'voice' ? 'active' : ''}`}
                onClick={() => setActiveInputMode('voice')}
                aria-pressed={activeInputMode === 'voice'}
                aria-label="Select Voice Input / Voice STT modality"
              >
                <div className="modality-card-header">
                  <span className="modality-card-title">
                    <Mic size={16} color="var(--champagne)" aria-hidden="true" />
                    <span>02 / Voice STT</span>
                  </span>
                  <span
                    className="badge badge-champagne"
                    style={{
                      fontSize: '0.65rem',
                      padding: '0.1rem 0.4rem',
                      backgroundColor: isRecording ? 'var(--urgency-high)' : undefined,
                      color: isRecording ? '#fff' : undefined,
                    }}
                  >
                    {isRecording ? 'RECORDING' : voiceData ? 'ATTACHED' : 'VOICE STT'}
                  </span>
                </div>
                <p className="modality-card-sub">
                  {isRecording
                    ? `Recording live audio (00:${recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds})...`
                    : voiceData
                    ? `Voice note attached (${voiceData.originalLanguage}, ${voiceData.durationSeconds}s)`
                    : 'Live microphone recording & speech-to-text transcription.'}
                </p>
                {/* Audio Waveform Bar */}
                <div className="waveform-container glass" aria-hidden="true">
                  <div className="waveform-bar" style={isRecording ? { animationDuration: '0.4s' } : undefined} />
                  <div className="waveform-bar" style={isRecording ? { animationDuration: '0.6s' } : undefined} />
                  <div className="waveform-bar" style={isRecording ? { animationDuration: '0.3s' } : undefined} />
                  <div className="waveform-bar" style={isRecording ? { animationDuration: '0.8s' } : undefined} />
                  <div className="waveform-bar" style={isRecording ? { animationDuration: '0.5s' } : undefined} />
                  <div className="waveform-bar" style={isRecording ? { animationDuration: '0.7s' } : undefined} />
                  <div className="waveform-bar" style={isRecording ? { animationDuration: '0.4s' } : undefined} />
                  <div className="waveform-bar" style={isRecording ? { animationDuration: '0.6s' } : undefined} />
                  <div className="waveform-bar" style={isRecording ? { animationDuration: '0.5s' } : undefined} />
                </div>
              </button>

              {/* Pathway 3: Document OCR */}
              <button
                type="button"
                className={`modality-card ${activeInputMode === 'ocr' ? 'active' : ''}`}
                onClick={() => setActiveInputMode('ocr')}
                aria-pressed={activeInputMode === 'ocr'}
                aria-label="Select Document OCR modality"
              >
                <div className="modality-card-header">
                  <span className="modality-card-title">
                    <Upload size={16} color="#3DB8AA" aria-hidden="true" />
                    <span>03 / OCR</span>
                  </span>
                  <span className="badge badge-blue" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                    CLINICAL OCR
                  </span>
                </div>
                <p className="modality-card-sub">Radiology & lab report document parser.</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <span className="font-mono">{ocrReports.length} attached</span>
                  <span style={{ color: ocrReports.length > 0 ? '#67E8D4' : 'var(--text-muted)' }}>
                    {ocrReports.length > 0 ? 'Parsed' : 'Ready'}
                  </span>
                </div>
              </button>
            </div>

            {/* Active Modality Auxiliary Controls */}
            {activeInputMode === 'voice' && (
              <div className="modality-content-panel" id="voice-stt-panel" role="region" aria-label="Voice Input and Speech-to-Text Controls">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Mic size={16} color="#E2C382" aria-hidden="true" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E2C382', letterSpacing: '0.03em' }}>
                      VOICE INPUT & SPEECH-TO-TEXT ENGINE
                    </span>
                  </div>
                  <span className={`provenance-tag ${voiceData && !voiceData.isDemoTranscription ? 'patient' : 'ai'}`}>
                    {voiceData
                      ? voiceData.isDemoTranscription
                        ? 'VOICE RECOGNITION PROVIDER'
                        : 'SOURCE: PATIENT-PROVIDED'
                      : 'VOICE STT READY'}
                  </span>
                </div>

                {/* Pre-Recording Voice Consent Notice */}
                <div
                  className="voice-consent-notice"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.45rem',
                    fontSize: '0.75rem',
                    color: '#A3AEAC',
                    padding: '0.45rem 0.70rem',
                    borderRadius: '10px',
                    marginBottom: '0.75rem',
                    border: '1px solid rgba(226, 195, 130, 0.2)',
                    background: 'rgba(226, 195, 130, 0.05)',
                    lineHeight: 1.45,
                  }}
                >
                  <Info size={14} color="#E2C382" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: '#E2C382' }}>Voice Processing Notice:</strong> Voice recording will be processed to create a text transcription for this triage workflow. Audio is processed via secure server-side pipeline and not retained for advertising or secondary training.
                  </div>
                </div>

                {/* State 1: IDLE / READY FOR RECORDING */}
                {!isRecording && !isTranscribingVoice && !voiceData && (
                  <div className="voice-idle-box" style={{ padding: '1rem', marginBottom: '0.85rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem' }}>
                      <button
                        type="button"
                        id="btn-record-voice"
                        className="voice-record-btn"
                        onClick={handleStartLiveRecording}
                        disabled={isProcessing}
                        aria-label="Start Voice Recording"
                        style={{
                          padding: '0.75rem 1.4rem',
                          fontSize: '0.90rem',
                          minHeight: '48px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          borderRadius: '12px',
                          backgroundColor: 'rgba(226, 195, 130, 0.12)',
                          border: '1px solid #E2C382',
                          color: '#E2C382',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        <Mic size={18} aria-hidden="true" />
                        <span>Start Voice Recording</span>
                      </button>
                      <p style={{ fontSize: '0.78rem', color: '#A3AEAC', margin: 0, lineHeight: 1.4 }}>
                        Speak patient symptoms clearly in English, Hindi, or regional language. Captured audio will be processed via the STT pipeline.
                      </p>
                    </div>
                  </div>
                )}

                {/* State 2: RECORDING */}
                {isRecording && (
                  <div
                    className="voice-recording-box"
                    style={{
                      padding: '1rem 1.15rem',
                      marginBottom: '0.85rem',
                      borderColor: '#F2A6A0',
                      backgroundColor: 'rgba(242, 166, 160, 0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="pulse-indicator-red" aria-hidden="true" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F2A6A0', letterSpacing: '0.04em' }}>
                          RECORDING IN PROGRESS
                        </span>
                      </div>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '0.90rem',
                          fontWeight: 700,
                          color: '#F5F5F2',
                          background: 'rgba(0,0,0,0.4)',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '8px',
                        }}
                      >
                        00:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}
                      </span>
                    </div>

                    <div className="waveform-container" style={{ marginBottom: '0.85rem' }} aria-hidden="true">
                      <div className="waveform-bar" style={{ animationDuration: '0.4s' }} />
                      <div className="waveform-bar" style={{ animationDuration: '0.7s' }} />
                      <div className="waveform-bar" style={{ animationDuration: '0.3s' }} />
                      <div className="waveform-bar" style={{ animationDuration: '0.9s' }} />
                      <div className="waveform-bar" style={{ animationDuration: '0.5s' }} />
                      <div className="waveform-bar" style={{ animationDuration: '0.8s' }} />
                      <div className="waveform-bar" style={{ animationDuration: '0.4s' }} />
                      <div className="waveform-bar" style={{ animationDuration: '0.6s' }} />
                      <div className="waveform-bar" style={{ animationDuration: '0.3s' }} />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        id="btn-stop-recording"
                        className="btn btn-primary"
                        onClick={handleStopLiveRecording}
                        aria-label="Stop and Transcribe Audio"
                        style={{
                          minHeight: '48px',
                          padding: '0.6rem 1.25rem',
                          backgroundColor: '#F2A6A0',
                          borderColor: '#F2A6A0',
                          color: '#0A0D10',
                          fontWeight: 700,
                        }}
                      >
                        <Square size={16} fill="currentColor" aria-hidden="true" />
                        <span>Stop & Transcribe Audio</span>
                      </button>
                      <button
                        type="button"
                        id="btn-cancel-recording"
                        className="btn btn-secondary"
                        onClick={handleCancelLiveRecording}
                        aria-label="Cancel Recording"
                        style={{ minHeight: '48px', padding: '0.6rem 1rem' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* State 3: PROCESSING / TRANSCRIBING */}
                {isTranscribingVoice && (
                  <div
                    className="glass-card"
                    style={{
                      padding: '1.25rem',
                      marginBottom: '0.85rem',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.6rem',
                      background: '#182025',
                    }}
                  >
                    <RefreshCw size={24} className="spin-slow" color="#E2C382" aria-hidden="true" />
                    <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#E2C382' }}>
                      Transcribing audio via Speech-to-Text Pipeline...
                    </span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Extracting patient verbal narrative and preserving verbatim statement.
                    </span>
                  </div>
                )}

                {/* State 4 & 5: TRANSCRIBED & PLAYBACK */}
                {voiceData && !isRecording && !isTranscribingVoice && (
                  <div className="voice-transcription-card" style={{ padding: '0.85rem 1rem', marginBottom: '0.85rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.76rem',
                        color: '#E2C382',
                        marginBottom: '0.45rem',
                        fontFamily: 'var(--font-mono)',
                        flexWrap: 'wrap',
                        gap: '0.4rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Mic size={13} aria-hidden="true" />
                        <span>
                          Language: {voiceData.originalLanguage} &bull; Duration: {voiceData.durationSeconds}s
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span className="badge badge-champagne" style={{ fontSize: '0.65rem' }}>
                          {voiceData.isDemoTranscription ? 'Voice STT' : (voiceData.provider || 'Transcribed STT')}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setVoiceData(undefined)}
                          style={{ padding: '0.15rem 0.5rem', fontSize: '0.70rem', color: '#F2A6A0' }}
                          title="Remove attached voice recording"
                          aria-label="Remove attached voice recording"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <p style={{ fontStyle: 'italic', fontSize: '0.88rem', color: '#F5F5F2', margin: 0, lineHeight: 1.45 }}>
                      "{voiceData.transcript}"
                    </p>

                    {/* Audio Playback if available */}
                    {voiceData.audioBlobUrl && (
                      <div style={{ marginTop: '0.65rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                          Recorded Audio Playback:
                        </div>
                        <audio
                          controls
                          src={voiceData.audioBlobUrl}
                          style={{ width: '100%', height: '36px', borderRadius: '10px' }}
                          aria-label="Play recorded patient voice note"
                        />
                      </div>
                    )}

                    {/* Quick action to add to symptoms textarea if needed */}
                    <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setSymptoms((prev) => (prev ? `${prev}\n${voiceData.transcript}` : voiceData.transcript));
                        }}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem' }}
                        title="Add transcribed text to patient symptoms field"
                      >
                        + Add to Patient Statement
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleStartLiveRecording}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem' }}
                        title="Re-record audio note"
                      >
                        <Mic size={11} style={{ marginRight: '3px' }} />
                        Re-record
                      </button>
                    </div>
                  </div>
                )}

                {/* State 6: ERROR State */}
                {errors.voice && (
                  <div
                    className="form-error"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      marginBottom: '0.85rem',
                      padding: '0.55rem 0.85rem',
                      borderRadius: '10px',
                    }}
                    role="alert"
                  >
                    <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.80rem' }}>{errors.voice}</span>
                  </div>
                )}

                {/* Preloaded Clinical Scenarios Section */}
                <div style={{ marginTop: '0.65rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.45rem' }}>
                    Or Select Clinical Voice Sample:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {voiceSamples.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        className="sample-chip-btn"
                        onClick={() => handleSelectVoiceSample(sample.id)}
                        disabled={isProcessing || isRecording || isTranscribingVoice}
                        style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}
                      >
                        <Mic size={12} style={{ marginRight: '4px', flexShrink: 0 }} aria-hidden="true" />
                        <span>{sample.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeInputMode === 'ocr' && (
              <div className="modality-content-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.60rem' }}>
                  <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#67E8D4' }}>
                    CLINICAL MEDICAL DOCUMENT OCR ATTACHMENTS
                  </span>
                  <span className="provenance-tag ai">CLINICAL OCR</span>
                </div>

                {/* Pre-Upload OCR Consent Notice */}
                <div
                  className="ocr-consent-notice"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.45rem',
                    fontSize: '0.75rem',
                    color: '#A3AEAC',
                    padding: '0.45rem 0.70rem',
                    borderRadius: '10px',
                    marginBottom: '0.75rem',
                    border: '1px solid rgba(103, 232, 212, 0.2)',
                    background: 'rgba(103, 232, 212, 0.04)',
                    lineHeight: 1.45,
                  }}
                >
                  <Info size={14} color="#67E8D4" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: '#67E8D4' }}>Document Processing Notice:</strong> Uploaded medical documents may be processed to extract text and structured information for this triage workflow. OCR extractions are provisional and subject to qualified clinician verification.
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.75rem' }}>
                  {sampleReports.map((report) => (
                    <button
                      key={report.id}
                      type="button"
                      className="sample-chip-btn"
                      onClick={() => handleAddOCRReport(report.id)}
                      disabled={isProcessing}
                    >
                      <FileText size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      + {report.title}
                    </button>
                  ))}
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="file-ocr-upload" className="form-label" style={{ fontSize: '0.75rem' }}>
                    Or Upload Custom Document (Image / PDF):
                  </label>
                  <input
                    id="file-ocr-upload"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                    className="form-input glass-input"
                    style={{ fontSize: '0.78rem', padding: '0.4rem 0.6rem' }}
                  />
                </div>
                {ocrReports.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {ocrReports.map((r, idx) => (
                      <div key={idx} style={{ background: '#182025', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '0.60rem 0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#F5F5F2' }}>
                            {r.fileName}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span className="badge badge-teal" style={{ fontSize: '0.65rem' }}>
                              OCR PARSED
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setOcrReports((prev) => prev.filter((_, i) => i !== idx))}
                              style={{ padding: '0.15rem 0.5rem', fontSize: '0.70rem', color: '#F2A6A0' }}
                              title="Remove document"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <p
                          style={{
                            fontSize: '0.74rem',
                            color: '#A3AEAC',
                            fontFamily: 'var(--font-mono)',
                            margin: '0.3rem 0 0 0',
                          }}
                        >
                          {r.extractedText.slice(0, 140)}...
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {errors.ocr && (
                  <div className="form-error" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.5rem' }}>
                    <AlertCircle size={15} aria-hidden="true" />
                    <span>{errors.ocr}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* FULL WIDTH: Patient Narrative Editor */}
        <div className="glass-card" style={{ background: '#13181D', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '1.35rem 1.5rem', marginBottom: '1.25rem' }}>
          <div className="card-header" style={{ marginBottom: '0.85rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} color="#67E8D4" aria-hidden="true" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#F5F5F2' }}>
                  PATIENT NARRATIVE & CLINICAL STATEMENT
                </h3>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Verbatim observations reported by patient.
              </div>
            </div>
            <span className="provenance-tag patient">SOURCE: PATIENT</span>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="patient-symptoms" className="form-label">
              Patient Statement & History <span className="required">*</span>
            </label>
            <textarea
              id="patient-symptoms"
              className="form-textarea glass-input"
              placeholder="Describe what the patient is experiencing, when it started, and how it has changed (e.g., 'मुझे 3 दिन से तेज बुखार है और कल से सांस लेने में बहुत तकलीफ हो रही है...')"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              rows={5}
              style={{ fontSize: '0.94rem', lineHeight: 1.55 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
              <span className="form-help">
                Multilingual text is preserved verbatim and normalized for medical reviewer evaluation.
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {symptoms.length} characters &bull; {symptoms.trim() ? symptoms.trim().split(/\s+/).length : 0} words
              </span>
            </div>
          </div>

          {errors.symptoms && (
            <div className="form-error" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.65rem' }}>
              <AlertCircle size={15} aria-hidden="true" />
              <span>{errors.symptoms}</span>
            </div>
          )}
        </div>

        {/* Informed Consent & Contextual Safety Box */}
        <div className="glass-card scroll-reveal reveal-delay-4" style={{ background: '#13181D', border: '1px solid rgba(226, 195, 130, 0.25)', borderRadius: '18px', padding: '1.35rem 1.5rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={18} color="#67E8D4" aria-hidden="true" />
              <strong style={{ fontSize: '0.92rem', color: '#F5F5F2' }}>
                INFORMED PATIENT / GUARDIAN CONSENT
              </strong>
            </div>
            {onOpenTrustCenter && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onOpenTrustCenter('consent')}
                style={{ fontSize: '0.74rem', padding: '0.25rem 0.60rem' }}
                title="View itemized data categories and DPDP-oriented notice"
              >
                <Info size={12} style={{ marginRight: '3px' }} aria-hidden="true" />
                <span>View DPDP Notice</span>
              </button>
            )}
          </div>

          <div
            className="consent-itemized-summary"
            style={{
              fontSize: '0.78rem',
              color: '#A3AEAC',
              background: '#182025',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              marginBottom: '0.85rem',
              lineHeight: 1.50,
            }}
          >
            <div style={{ fontWeight: 600, color: '#F5F5F2', marginBottom: '0.30rem' }}>
              Summary of Processing:
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.15rem' }}>
              <li><strong>Data Processed:</strong> Anonymized demographics, reported narrative, voice recordings/transcripts, and uploaded document OCR extractions.</li>
              <li><strong>Purpose:</strong> Generating structured triage summaries, timelines, and highlighting urgency signals for human clinician review.</li>
              <li><strong>Clinical Mandate:</strong> AI extraction is purely advisory; all final clinical triage decisions are made by a qualified Medical Officer.</li>
              <li><strong>Withdrawal:</strong> You can cancel intake or clear data at any time prior to clinician sign-off.</li>
            </ul>
          </div>

          <div className="checkbox-container" style={{ alignItems: 'flex-start', background: '#182025', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
            <input
              type="checkbox"
              id="consent-checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              aria-label="Confirm Patient / Guardian Informed Consent"
            />
            <div style={{ flex: 1 }}>
              <label htmlFor="consent-checkbox" className="checkbox-label" style={{ fontWeight: 600, color: '#F5F5F2', cursor: 'pointer' }}>
                <span style={{ color: '#67E8D4' }}>Patient / Guardian Informed Consent Obtained</span> &bull; I confirm that informed consent has been obtained for this clinical triage intake. <span className="required" aria-hidden="true">*</span>
              </label>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.35 }}>
                Recorded in chronological in-memory audit log. Pre-checked consent is strictly prohibited.
              </div>
              {errors.consent && (
                <div className="form-error" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.45rem' }} role="alert">
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>{errors.consent}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {errors.form && (
          <div className="form-error" style={{ marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 0.95rem', borderRadius: '10px' }}>
            <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>{errors.form}</span>
          </div>
        )}

        {/* Primary Action Floating Bar */}
        <div className="intake-action-bar">
          <div className="action-bar-notice">
            <span className="pulse-indicator-teal" aria-hidden="true" />
            <span>AI ASSISTS &bull; HUMAN CLINICIAN DECIDES</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSymptoms('');
                setAge('');
                setGender('');
                setConsentGiven(false);
                setVoiceData(undefined);
                setOcrReports([]);
                setErrors({});
              }}
              disabled={isProcessing}
            >
              Clear Form
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              id="btn-submit-triage"
              disabled={isProcessing}
              style={{ padding: '0.75rem 1.75rem', fontSize: '0.92rem', minHeight: '48px' }}
            >
              <CheckSquare size={18} aria-hidden="true" />
              <span>{isProcessing ? 'Processing Triage...' : 'CREATE TRIAGE CASE'}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
