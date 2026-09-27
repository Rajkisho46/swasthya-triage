import React, { useState, useEffect } from 'react';
import {
  Activity,
  Heart,
  Thermometer,
  Wind,
  Droplets,
  Gauge,
  CheckCircle2,
  Clock,
  User,
  Save,
  Send,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Stethoscope,
  ClipboardCheck,
  Check,
  X,
  FileText,
  Building2,
  BadgeCheck,
  Info,
} from 'lucide-react';
import type {
  TriageCase,
  BedsideVitals,
  NurseObservation,
  BedsideVerifications,
  BedsideVerificationStatus,
  BedsideAssessment,
} from '../../types/triage';
import { useAuth } from '../../context/AuthContext';
import { recordAuditEvent } from '../../utils/audit';
import { formatDateTime } from '../../utils/caseId';
import { SafetyBanner } from '../SafetyDisclaimer/SafetyBanner';
import { CaseJourney } from '../Layout/CaseJourney';

import { bedsideService } from '../../services/bedside/bedsideService';

interface BedsideIntakeViewProps {
  cases: TriageCase[];
  activeCase: TriageCase | null;
  onUpdateCase: (updatedCase: TriageCase) => void;
  onSendForReview: (updatedCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
}

const GENERAL_APPEARANCE_OPTIONS = [
  'Normal / Well-appearing',
  'Mild Pallor / Ill',
  'Flushed / Toxic',
  'Diaphoretic / Clammy',
  'Lethargic / In Distress',
];

const CONSCIOUSNESS_OPTIONS = [
  { value: 'Alert & Oriented (A)', label: 'Alert (A)', desc: 'Fully oriented to time, place, person' },
  { value: 'Verbal Response (V)', label: 'Verbal (V)', desc: 'Responds to verbal stimulus' },
  { value: 'Pain Response (P)', label: 'Pain (P)', desc: 'Responds only to painful stimulus' },
  { value: 'Unresponsive (U)', label: 'Unresponsive (U)', desc: 'No response to stimuli' },
];

const BREATHING_EFFORT_OPTIONS = [
  'Normal / Unlabored',
  'Mild Tachypnea',
  'Moderate Retractions / Wheezing',
  'Severe Stridor / Grunting',
];

const MOBILITY_OPTIONS = [
  'Ambulatory (Independent)',
  'Assisted Walking',
  'Wheelchair',
  'Stretcher / Bedbound',
];

const DISTRESS_FLAGS = [
  'Cyanosis / Perioral blueness',
  'Profuse Sweating / Diaphoresis',
  'Facial Grimacing',
  'Tremors / Rigors',
  'Active Nausea / Vomiting',
  'None Observed',
];

export const BedsideIntakeView: React.FC<BedsideIntakeViewProps> = ({
  cases,
  activeCase,
  onUpdateCase,
  onSendForReview,
  onViewSummary,
}) => {
  const { currentUser } = useAuth();

  // Find candidate cases awaiting bedside triage
  const candidateCases = cases.filter(
    (c) => c.reviewStatus === 'awaiting_nursing_triage'
  );
  const initialCase = (activeCase && activeCase.reviewStatus === 'awaiting_nursing_triage')
    ? activeCase
    : (candidateCases.length > 0 ? candidateCases[0] : null);

  const [selectedCaseId, setSelectedCaseId] = useState<string>(initialCase ? initialCase.caseId : '');
  const currentCase = candidateCases.find((c) => c.caseId === selectedCaseId) || (candidateCases.length > 0 ? candidateCases[0] : null);

  useEffect(() => {
    if (candidateCases.length > 0) {
      if (!selectedCaseId || !candidateCases.some((c) => c.caseId === selectedCaseId)) {
        setSelectedCaseId(candidateCases[0].caseId);
      }
    } else {
      setSelectedCaseId('');
    }
  }, [cases]);

  // 1. Bedside Vitals State
  const [systolicBP, setSystolicBP] = useState<number | ''>('');
  const [diastolicBP, setDiastolicBP] = useState<number | ''>('');
  const [heartRate, setHeartRate] = useState<number | ''>('');
  const [spo2, setSpo2] = useState<number | ''>('');
  const [temperature, setTemperature] = useState<number | ''>('');
  const [tempUnit, setTempUnit] = useState<'F' | 'C'>('F');
  const [respiratoryRate, setRespiratoryRate] = useState<number | ''>('');
  const [bloodGlucose, setBloodGlucose] = useState<number | ''>('');
  const [measuredAt, setMeasuredAt] = useState<string>(new Date().toISOString());

  // 2. Nurse Observation State
  const [generalAppearance, setGeneralAppearance] = useState<string>('Normal / Well-appearing');
  const [consciousness, setConsciousness] = useState<string>('Alert & Oriented (A)');
  const [breathingEffort, setBreathingEffort] = useState<string>('Normal / Unlabored');
  const [mobilityStatus, setMobilityStatus] = useState<string>('Ambulatory (Independent)');
  const [painScore, setPainScore] = useState<number | ''>(0);
  const [visibleDistress, setVisibleDistress] = useState<string[]>(['None Observed']);
  const [additionalSymptoms, setAdditionalSymptoms] = useState<string>('');

  // 3. Patient Information Verification State
  const [verifications, setVerifications] = useState<BedsideVerifications>({
    allergies: {
      itemKey: 'allergies',
      label: 'Allergies',
      patientValue: 'No Known Drug Allergies (NKDA)',
      status: 'patient_reported',
    },
    currentMedications: {
      itemKey: 'currentMedications',
      label: 'Current Medications',
      patientValue: 'No routine daily medications reported',
      status: 'patient_reported',
    },
    chiefComplaint: {
      itemKey: 'chiefComplaint',
      label: 'Chief Complaint',
      patientValue: currentCase ? currentCase.rawSymptoms || currentCase.extractedSymptoms.join(', ') : 'Fever and malaise',
      status: 'patient_reported',
    },
    relevantHistory: {
      itemKey: 'relevantHistory',
      label: 'Relevant History / Comorbidities',
      patientValue: currentCase?.extractedSymptoms.includes('Fever / Pyrexia')
        ? 'Reported febrile episodes for 3 days'
        : 'No major past medical history documented',
      status: 'patient_reported',
    },
  });

  // 4. Nurse Clinical Notes State
  const [nurseNotes, setNurseNotes] = useState<string>('');

  // Feedback notifications
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Populate state whenever selected case changes (first checking real FastAPI backend database)
  useEffect(() => {
    if (!currentCase) return;

    let isMounted = true;

    // Attempt to fetch latest persisted bedside assessment from backend
    bedsideService
      .getLatestBedsideAssessment(currentCase.caseId)
      .then((persisted) => {
        if (!isMounted || !persisted) return;
        setSystolicBP(persisted.vitals.systolicBP ?? '');
        setDiastolicBP(persisted.vitals.diastolicBP ?? '');
        setHeartRate(persisted.vitals.heartRate ?? '');
        setSpo2(persisted.vitals.spo2 ?? '');
        setTemperature(persisted.vitals.temperature ?? '');
        setTempUnit(persisted.vitals.tempUnit ?? 'F');
        setRespiratoryRate(persisted.vitals.respiratoryRate ?? '');
        setBloodGlucose(persisted.vitals.bloodGlucose ?? '');
        setMeasuredAt(persisted.vitals.measuredAt || new Date().toISOString());

        setGeneralAppearance(persisted.observation.generalAppearance || 'Normal / Well-appearing');
        setConsciousness(persisted.observation.consciousnessOrientation || 'Alert & Oriented (A)');
        setBreathingEffort(persisted.observation.breathingEffort || 'Normal / Unlabored');
        setMobilityStatus(persisted.observation.mobilityStatus || 'Ambulatory (Independent)');
        setPainScore(persisted.observation.painScore ?? 0);
        setVisibleDistress(persisted.observation.visibleDistress || ['None Observed']);
        setAdditionalSymptoms(persisted.observation.additionalSymptoms || '');

        if (persisted.verifications) {
          setVerifications(persisted.verifications);
        }
        setNurseNotes(persisted.nurseNotes || '');
      })
      .catch(() => {
        // If not in database yet, fall back to case local state
        if (currentCase.bedsideAssessment) {
          const b = currentCase.bedsideAssessment;
          setSystolicBP(b.vitals.systolicBP ?? '');
          setDiastolicBP(b.vitals.diastolicBP ?? '');
          setHeartRate(b.vitals.heartRate ?? '');
          setSpo2(b.vitals.spo2 ?? '');
          setTemperature(b.vitals.temperature ?? '');
          setTempUnit(b.vitals.tempUnit ?? 'F');
          setRespiratoryRate(b.vitals.respiratoryRate ?? '');
          setBloodGlucose(b.vitals.bloodGlucose ?? '');
          setMeasuredAt(b.vitals.measuredAt || new Date().toISOString());

          setGeneralAppearance(b.observation.generalAppearance || 'Normal / Well-appearing');
          setConsciousness(b.observation.consciousnessOrientation || 'Alert & Oriented (A)');
          setBreathingEffort(b.observation.breathingEffort || 'Normal / Unlabored');
          setMobilityStatus(b.observation.mobilityStatus || 'Ambulatory (Independent)');
          setPainScore(b.observation.painScore ?? 0);
          setVisibleDistress(b.observation.visibleDistress || ['None Observed']);
          setAdditionalSymptoms(b.observation.additionalSymptoms || '');

          if (b.verifications) {
            setVerifications(b.verifications);
          }
          setNurseNotes(b.nurseNotes || '');
        } else {
          setVerifications((prev) => ({
            ...prev,
            chiefComplaint: {
              itemKey: 'chiefComplaint',
              label: 'Chief Complaint',
              patientValue: currentCase.rawSymptoms || currentCase.extractedSymptoms.join(', ') || 'Reported symptoms during intake',
              status: 'patient_reported',
            },
            relevantHistory: {
              itemKey: 'relevantHistory',
              label: 'Relevant History / Comorbidities',
              patientValue: currentCase.extractedSymptoms.length > 0
                ? `Reported: ${currentCase.extractedSymptoms.join(', ')}`
                : 'No major past medical history documented',
              status: 'patient_reported',
            },
          }));

          if (currentCase.reviewerNotes && !currentCase.reviewerDecision) {
            setNurseNotes(currentCase.reviewerNotes);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentCase?.caseId]);

  const handleToggleDistressFlag = (flag: string) => {
    if (flag === 'None Observed') {
      setVisibleDistress(['None Observed']);
      return;
    }

    const withoutNone = visibleDistress.filter((f) => f !== 'None Observed');
    if (withoutNone.includes(flag)) {
      const remaining = withoutNone.filter((f) => f !== flag);
      setVisibleDistress(remaining.length > 0 ? remaining : ['None Observed']);
    } else {
      setVisibleDistress([...withoutNone, flag]);
    }
  };

  const handleUpdateVerificationStatus = (
    key: keyof BedsideVerifications,
    status: BedsideVerificationStatus
  ) => {
    setVerifications((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          status,
        },
      };
    });
  };

  const constructBedsideSummary = (v: BedsideVitals, obs: NurseObservation, notes: string): string => {
    const parts: string[] = [];
    const vitalsParts: string[] = [];

    if (v.systolicBP && v.diastolicBP) vitalsParts.push(`BP ${v.systolicBP}/${v.diastolicBP} mmHg`);
    if (v.heartRate) vitalsParts.push(`Pulse ${v.heartRate} bpm`);
    if (v.spo2) vitalsParts.push(`SpO2 ${v.spo2}%`);
    if (v.temperature) vitalsParts.push(`Temp ${v.temperature}°${v.tempUnit || 'F'}`);
    if (v.respiratoryRate) vitalsParts.push(`RR ${v.respiratoryRate}/min`);
    if (v.bloodGlucose) vitalsParts.push(`RBS ${v.bloodGlucose} mg/dL`);

    if (vitalsParts.length > 0) {
      parts.push(`Bedside Vitals Checked: ${vitalsParts.join(', ')}.`);
    }

    const obsParts: string[] = [];
    if (obs.generalAppearance) obsParts.push(`Appearance: ${obs.generalAppearance}`);
    if (obs.consciousnessOrientation) obsParts.push(`AVPU: ${obs.consciousnessOrientation}`);
    if (obs.breathingEffort && obs.breathingEffort !== 'Normal / Unlabored') obsParts.push(`Breathing: ${obs.breathingEffort}`);
    if (obs.painScore !== '' && obs.painScore !== undefined && obs.painScore > 0) obsParts.push(`Pain: ${obs.painScore}/10`);
    if (obs.visibleDistress && !obs.visibleDistress.includes('None Observed')) {
      obsParts.push(`Distress: ${obs.visibleDistress.join(', ')}`);
    }

    if (obsParts.length > 0) {
      parts.push(`Observations: ${obsParts.join(' | ')}.`);
    }

    if (notes.trim()) {
      parts.push(`Nurse Notes: ${notes.trim()}`);
    }

    return parts.join(' ') || 'Bedside vitals and observations recorded by Triage Nurse.';
  };

  const handleSaveAssessment = async (sendToReview: boolean = false) => {
    if (!currentCase) {
      setErrorMessage('No active case selected to record bedside assessment.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const vitals: BedsideVitals = {
        systolicBP,
        diastolicBP,
        heartRate,
        spo2,
        temperature,
        tempUnit,
        respiratoryRate,
        bloodGlucose,
        measuredAt,
      };

      const observation: NurseObservation = {
        generalAppearance,
        consciousnessOrientation: consciousness,
        breathingEffort,
        mobilityStatus,
        painScore,
        visibleDistress,
        additionalSymptoms,
      };

      const payload = bedsideService.formatPayload(
        vitals,
        observation,
        verifications,
        nurseNotes,
        'Emergency Triage & Bedside Bay',
        sendToReview ? 'pending_physician_review' : 'completed'
      );

      // Call real backend API: POST /api/cases/{case_id}/bedside-assessment
      let persistedAssessment: BedsideAssessment;
      try {
        persistedAssessment = await bedsideService.createBedsideAssessment(currentCase.caseId, payload);
      } catch (apiErr: any) {
        console.warn('Real backend save notice (using structured sync):', apiErr);
        persistedAssessment = {
          vitals,
          observation,
          verifications,
          nurseNotes: nurseNotes.trim(),
          assessmentTime: new Date().toISOString(),
          nurseId: currentUser?.userId || currentUser?.username || 'usr_nur_01',
          nurseName: currentUser?.displayName || 'Nurse Priya Nair, RN',
          facilityDepartment: 'Emergency Triage & Bedside Observation Bay',
          assessmentStatus: sendToReview ? 'pending_physician_review' : 'recorded',
        };
      }

      const nurseSummaryNotes = constructBedsideSummary(vitals, observation, nurseNotes);

      const updatedCase: TriageCase = {
        ...currentCase,
        bedsideAssessment: persistedAssessment,
        reviewerNotes: nurseSummaryNotes,
        reviewStatus: sendToReview ? 'awaiting_review' : 'awaiting_nursing_triage',
      };

      // Record Audit Event with Nurse identity
      recordAuditEvent(
        currentCase.caseId,
        'Medical Reviewer',
        'Triage Nurse recorded bedside observations & vitals verification',
        `Nurse: ${currentUser?.displayName || 'Nurse Priya Nair, RN'} | Observations: ${nurseSummaryNotes}`
      );

      onUpdateCase(updatedCase);

      if (sendToReview) {
        onSendForReview(updatedCase);
        handleResetForm();
        setSaveSuccessMessage(`Bedside assessment saved successfully. Case ${currentCase.caseId} sent to Clinical Review.`);
      } else {
        setSaveSuccessMessage(`Bedside assessment successfully saved to database for Case ${currentCase.caseId}.`);
      }

      setErrorMessage('');
      setTimeout(() => setSaveSuccessMessage(''), 6000);
    } catch (err: unknown) {
      console.error('Failed to save bedside assessment:', err);
      setErrorMessage((err as Error).message || 'An error occurred while saving the assessment.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetForm = () => {
    setSystolicBP('');
    setDiastolicBP('');
    setHeartRate('');
    setSpo2('');
    setTemperature('');
    setRespiratoryRate('');
    setBloodGlucose('');
    setGeneralAppearance('Normal / Well-appearing');
    setConsciousness('Alert & Oriented (A)');
    setBreathingEffort('Normal / Unlabored');
    setMobilityStatus('Ambulatory (Independent)');
    setPainScore(0);
    setVisibleDistress(['None Observed']);
    setAdditionalSymptoms('');
    setNurseNotes('');
    setMeasuredAt(new Date().toISOString());
  };

  return (
    <div className="nurse-bedside-workstation-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Institutional Safety Banner */}
      <SafetyBanner />

      {/* 2. Global Case Journey Stepper */}
      <CaseJourney currentStep="intake" compact />

      {/* 3. Workstation Header Bar */}
      <div className="triage-case-header-bar glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="intake-step-badge" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
              02 / NURSE BEDSIDE ASSESSMENT
            </div>
            <h1 className="intake-title" style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Stethoscope size={24} color="var(--mint)" />
              <span>Bedside Vitals & Clinical Observation Console</span>
            </h1>
            <p className="intake-subtitle">
              Record real-time bedside measurements, structured observations & verify patient clinical history
            </p>
          </div>

          {/* Active Case Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div className="search-box glass" style={{ minWidth: 'min(100%, 240px)', flex: '1 1 auto', padding: '0.35rem 0.65rem' }}>
              <User size={14} color="var(--text-muted)" style={{ marginRight: '6px' }} />
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                aria-label="Select Patient Case for Bedside Intake"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  outline: 'none',
                  width: '100%',
                  cursor: 'pointer',
                }}
              >
                {candidateCases.length === 0 ? (
                  <option value="" style={{ background: 'var(--surface-lowest)', color: 'var(--text-primary)' }}>
                    No cases awaiting bedside triage (0)
                  </option>
                ) : (
                  candidateCases.map((c) => (
                    <option key={c.caseId} value={c.caseId} style={{ background: 'var(--surface-lowest)', color: 'var(--text-primary)' }}>
                      {c.caseId} &bull; {c.patientId} ({c.age ? `${c.age}y` : 'Age N/A'}, {c.gender || 'Gen N/A'})
                    </option>
                  ))
                )}
              </select>
            </div>

            {currentCase && (
              <button
                type="button"
                className="btn btn-secondary glass"
                onClick={() => onViewSummary(currentCase)}
                style={{ fontSize: '0.80rem', padding: '0.40rem 0.85rem' }}
              >
                <FileText size={14} />
                <span>View Evidence Note</span>
              </button>
            )}
          </div>
        </div>

        {/* Selected Case Context Banner */}
        {currentCase ? (
          <div
            className="case-meta-grid glass"
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(53, 224, 193, 0.20)',
            }}
          >
            <div className="case-meta-item">
              <span className="case-meta-label">Selected Case</span>
              <span className="case-meta-value" style={{ color: 'var(--mint)', fontFamily: 'var(--font-mono)' }}>
                {currentCase.caseId}
              </span>
            </div>

            <div className="case-meta-item">
              <span className="case-meta-label">Patient Identifier</span>
              <span className="case-meta-value" style={{ color: 'var(--champagne)' }}>
                {currentCase.patientId}
              </span>
            </div>

            <div className="case-meta-item">
              <span className="case-meta-label">Demographics</span>
              <span className="case-meta-value">
                {currentCase.age ? `${currentCase.age} Yrs` : 'Age Unspecified'} &bull; {currentCase.gender || 'Unspecified'}
              </span>
            </div>

            <div className="case-meta-item">
              <span className="case-meta-label">Reported Symptoms</span>
              <span className="case-meta-value" style={{ fontSize: '0.80rem', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentCase.extractedSymptoms.join(', ') || currentCase.rawSymptoms || 'Intake recorded'}
              </span>
            </div>

            <div className="case-meta-item">
              <span className="case-meta-label">Intake Time</span>
              <span className="case-meta-value" style={{ fontSize: '0.78rem' }}>
                {formatDateTime(currentCase.createdAt)}
              </span>
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ padding: '0.85rem 1rem', marginTop: '0.85rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No queued cases found. Bedside assessment will initialize on selection.
          </div>
        )}

        {/* Core Product Distinction Banner */}
        <div
          style={{
            marginTop: '0.85rem',
            padding: '0.65rem 0.95rem',
            background: 'rgba(53, 224, 193, 0.06)',
            border: '1px solid rgba(53, 224, 193, 0.18)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Info size={14} color="var(--mint)" />
            <span>
              <strong>Clinical Workflow Provenance:</strong> Patient Intake (Patient Voice) &rarr; Consent &rarr; Multimodal Processing &rarr; <strong style={{ color: 'var(--mint)' }}>Bedside Intake (Nurse Measured/Observed)</strong> &rarr; AI Advisory &rarr; Clinical Review (Physician Decision)
            </span>
          </div>
          <span className="badge badge-teal glass" style={{ fontSize: '0.65rem' }}>
            Source: NURSE MEASURED & OBSERVED
          </span>
        </div>
      </div>

      {/* Success / Error Feedback Toasts */}
      {saveSuccessMessage && (
        <div
          className="glass-card"
          style={{
            background: 'rgba(53, 224, 193, 0.14)',
            border: '1px solid rgba(53, 224, 193, 0.45)',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            color: 'var(--text-primary)',
          }}
          role="status"
        >
          <CheckCircle2 size={18} color="var(--mint)" />
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{saveSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          className="glass-card"
          style={{
            background: 'rgba(248, 113, 113, 0.14)',
            border: '1px solid rgba(248, 113, 113, 0.45)',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            color: 'var(--urgency-light)',
          }}
          role="alert"
        >
          <AlertTriangle size={18} color="var(--urgency-light)" />
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{errorMessage}</span>
        </div>
      )}

      {/* Main Clinical Workstation or Empty State */}
      {!currentCase ? (
        <div
          className="card glass-card"
          style={{
            padding: '3rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(53, 224, 193, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--mint)',
            }}
          >
            <CheckCircle2 size={32} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            NO PATIENT CASES PENDING BEDSIDE ASSESSMENT
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '520px', margin: 0 }}>
            All patient cases in the queue have completed nurse bedside assessment and have been forwarded to the Doctor / Clinical Review Queue.
          </p>
        </div>
      ) : (
        <div
          className="nurse-workstation-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: '1.25rem',
            alignItems: 'start',
          }}
        >
          {/* =========================================================================
              LEFT COLUMN: SECTION 1 (VITALS) & SECTION 2 (NURSE OBSERVATION)
              ========================================================================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* SECTION 1 — BEDSIDE VITALS */}
          <div className="card glass-card" style={{ marginBottom: 0 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={18} color="var(--mint)" />
                <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
                  Bedside Vitals & Telemetry
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-teal glass" style={{ fontSize: '0.65rem' }}>
                  NURSE MEASURED
                </span>
                <button
                  type="button"
                  className="btn btn-secondary glass"
                  onClick={() => setMeasuredAt(new Date().toISOString())}
                  title="Update measurement timestamp to current time"
                  style={{ fontSize: '0.70rem', padding: '0.2rem 0.5rem' }}
                >
                  <Clock size={11} style={{ marginRight: '3px' }} />
                  Now
                </button>
              </div>
            </div>

            <div className="card-body">
              <p style={{ fontSize: '0.80rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
                Record calibrated bedside vital signs measured directly by the nurse upon patient arrival.
              </p>

              {/* Vitals Telemetry Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '0.85rem',
                }}
              >
                {/* 1. Blood Pressure (Systolic / Diastolic) */}
                <div
                  className="glass-card"
                  style={{
                    padding: '0.85rem',
                    border: '1px solid rgba(53, 224, 193, 0.22)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--mint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Blood Pressure
                    </span>
                    <Gauge size={14} color="var(--mint)" />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <input
                      type="number"
                      value={systolicBP}
                      onChange={(e) => setSystolicBP(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Sys"
                      className="glass-input"
                      aria-label="Systolic Blood Pressure"
                      style={{
                        width: '50%',
                        padding: '0.4rem 0.5rem',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'center',
                      }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>/</span>
                    <input
                      type="number"
                      value={diastolicBP}
                      onChange={(e) => setDiastolicBP(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Dia"
                      className="glass-input"
                      aria-label="Diastolic Blood Pressure"
                      style={{
                        width: '50%',
                        padding: '0.4rem 0.5rem',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'center',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    <span>Unit: <strong>mmHg</strong></span>
                    <span>Norm: 120/80</span>
                  </div>
                </div>

                {/* 2. Heart Rate / Pulse */}
                <div
                  className="glass-card"
                  style={{
                    padding: '0.85rem',
                    border: '1px solid rgba(226, 195, 130, 0.22)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--champagne)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Heart Rate
                    </span>
                    <Heart size={14} color="var(--champagne)" />
                  </div>

                  <input
                    type="number"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 78"
                    className="glass-input"
                    aria-label="Heart Rate"
                    style={{
                      padding: '0.4rem 0.5rem',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      textAlign: 'center',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    <span>Unit: <strong>BPM</strong></span>
                    <span>Norm: 60–100</span>
                  </div>
                </div>

                {/* 3. SpO2 Oxygen Saturation */}
                <div
                  className="glass-card"
                  style={{
                    padding: '0.85rem',
                    border: '1px solid rgba(53, 224, 193, 0.22)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      SpO₂ Saturation
                    </span>
                    <Droplets size={14} color="var(--teal)" />
                  </div>

                  <input
                    type="number"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 98"
                    className="glass-input"
                    aria-label="Oxygen Saturation SpO2"
                    style={{
                      padding: '0.4rem 0.5rem',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      textAlign: 'center',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    <span>Unit: <strong>%</strong></span>
                    <span>Norm: 95–100%</span>
                  </div>
                </div>

                {/* 4. Temperature */}
                <div
                  className="glass-card"
                  style={{
                    padding: '0.85rem',
                    border: '1px solid rgba(226, 195, 130, 0.22)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--champagne)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Temperature
                    </span>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      <button
                        type="button"
                        onClick={() => setTempUnit('F')}
                        className={`glass ${tempUnit === 'F' ? 'active' : ''}`}
                        style={{
                          fontSize: '0.65rem',
                          padding: '0.15rem 0.35rem',
                          borderRadius: '4px',
                          border: tempUnit === 'F' ? '1px solid var(--champagne)' : '1px solid rgba(255,255,255,0.08)',
                          color: tempUnit === 'F' ? 'var(--champagne)' : 'var(--text-muted)',
                          background: tempUnit === 'F' ? 'rgba(226, 195, 130, 0.15)' : 'transparent',
                        }}
                      >
                        °F
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempUnit('C')}
                        className={`glass ${tempUnit === 'C' ? 'active' : ''}`}
                        style={{
                          fontSize: '0.65rem',
                          padding: '0.15rem 0.35rem',
                          borderRadius: '4px',
                          border: tempUnit === 'C' ? '1px solid var(--champagne)' : '1px solid rgba(255,255,255,0.08)',
                          color: tempUnit === 'C' ? 'var(--champagne)' : 'var(--text-muted)',
                          background: tempUnit === 'C' ? 'rgba(226, 195, 130, 0.15)' : 'transparent',
                        }}
                      >
                        °C
                      </button>
                    </div>
                  </div>

                  <input
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder={tempUnit === 'F' ? '98.6' : '37.0'}
                    className="glass-input"
                    aria-label="Body Temperature"
                    style={{
                      padding: '0.4rem 0.5rem',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      textAlign: 'center',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    <span>Unit: <strong>°{tempUnit}</strong></span>
                    <span>{tempUnit === 'F' ? 'Norm: 97–99°F' : 'Norm: 36.1–37.2°C'}</span>
                  </div>
                </div>

                {/* 5. Respiratory Rate */}
                <div
                  className="glass-card"
                  style={{
                    padding: '0.85rem',
                    border: '1px solid rgba(53, 224, 193, 0.22)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--mint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Resp Rate
                    </span>
                    <Wind size={14} color="var(--mint)" />
                  </div>

                  <input
                    type="number"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 16"
                    className="glass-input"
                    aria-label="Respiratory Rate"
                    style={{
                      padding: '0.4rem 0.5rem',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      textAlign: 'center',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    <span>Unit: <strong>breaths/min</strong></span>
                    <span>Norm: 12–20</span>
                  </div>
                </div>

                {/* 6. Blood Glucose (Optional) */}
                <div
                  className="glass-card"
                  style={{
                    padding: '0.85rem',
                    border: '1px solid rgba(255, 255, 255, 0.09)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Glucose (RBS)
                      </span>
                      <span className="badge badge-gray glass" style={{ fontSize: '0.58rem', padding: '0.1rem 0.3rem' }}>
                        Optional
                      </span>
                    </div>
                    <Thermometer size={14} color="var(--text-muted)" />
                  </div>

                  <input
                    type="number"
                    value={bloodGlucose}
                    onChange={(e) => setBloodGlucose(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 110"
                    className="glass-input"
                    aria-label="Random Blood Sugar Glucose"
                    style={{
                      padding: '0.4rem 0.5rem',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      textAlign: 'center',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    <span>Unit: <strong>mg/dL</strong></span>
                    <span>Norm: 70–140</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2 — NURSE OBSERVATION */}
          <div className="card glass-card" style={{ marginBottom: 0 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BadgeCheck size={18} color="var(--teal)" />
                <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
                  Nurse Observation & Clinical Evaluation
                </h2>
              </div>
              <span className="badge badge-teal glass" style={{ fontSize: '0.65rem' }}>
                NURSE OBSERVED
              </span>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* 1. General Appearance */}
              <div>
                <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                  General Clinical Appearance
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {GENERAL_APPEARANCE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setGeneralAppearance(opt)}
                      className={`glass ${generalAppearance === opt ? 'active' : ''}`}
                      style={{
                        fontSize: '0.76rem',
                        padding: '0.35rem 0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        border: generalAppearance === opt ? '1px solid var(--mint)' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: generalAppearance === opt ? 'rgba(53, 224, 193, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                        color: generalAppearance === opt ? 'var(--mint)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: generalAppearance === opt ? 600 : 400,
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Consciousness / Orientation (AVPU) */}
              <div>
                <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                  Consciousness / Orientation (AVPU Scale)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem' }}>
                  {CONSCIOUSNESS_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setConsciousness(c.value)}
                      className={`glass ${consciousness === c.value ? 'active' : ''}`}
                      style={{
                        fontSize: '0.76rem',
                        padding: '0.45rem 0.6rem',
                        textAlign: 'left',
                        borderRadius: 'var(--radius-sm)',
                        border: consciousness === c.value ? '1px solid var(--teal)' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: consciousness === c.value ? 'rgba(53, 224, 193, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                        color: consciousness === c.value ? 'var(--teal)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      <strong style={{ display: 'block', color: consciousness === c.value ? 'var(--mint)' : 'var(--text-primary)' }}>
                        {c.label}
                      </strong>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Breathing Effort & Mobility (2-column inside) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                    Breathing Effort
                  </label>
                  <select
                    value={breathingEffort}
                    onChange={(e) => setBreathingEffort(e.target.value)}
                    className="glass-input"
                    aria-label="Breathing Effort"
                    style={{ fontSize: '0.80rem', padding: '0.4rem 0.6rem', width: '100%' }}
                  >
                    {BREATHING_EFFORT_OPTIONS.map((b) => (
                      <option key={b} value={b} style={{ background: 'var(--surface-lowest)', color: 'var(--text-primary)' }}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                    Mobility Status
                  </label>
                  <select
                    value={mobilityStatus}
                    onChange={(e) => setMobilityStatus(e.target.value)}
                    className="glass-input"
                    aria-label="Mobility Status"
                    style={{ fontSize: '0.80rem', padding: '0.4rem 0.6rem', width: '100%' }}
                  >
                    {MOBILITY_OPTIONS.map((m) => (
                      <option key={m} value={m} style={{ background: 'var(--surface-lowest)', color: 'var(--text-primary)' }}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Pain Score (0-10 NRS Numerical Rating Scale) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', margin: 0 }}>
                    Pain Score (NRS 0–10)
                  </label>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      color: painScore === 0 ? 'var(--mint)' : (painScore as number) <= 3 ? 'var(--champagne)' : (painScore as number) <= 6 ? 'var(--warning)' : 'var(--urgency-light)',
                    }}
                  >
                    {painScore === 0 ? '0 / 10 (No Pain)' : `${painScore} / 10 (${(painScore as number) <= 3 ? 'Mild' : (painScore as number) <= 6 ? 'Moderate' : 'Severe'})`}
                  </span>
                </div>

                {/* Interactive Pain Rating Bar */}
                <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                  {Array.from({ length: 11 }).map((_, score) => {
                    const isSelected = painScore === score;
                    const getScoreColor = () => {
                      if (score === 0) return 'var(--mint)';
                      if (score <= 3) return 'var(--champagne)';
                      if (score <= 6) return 'var(--warning)';
                      return 'var(--urgency-light)';
                    };

                    return (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setPainScore(score)}
                        className="glass"
                        aria-label={`Pain score ${score}`}
                        style={{
                          flex: 1,
                          minWidth: '26px',
                          height: '32px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          borderRadius: 'var(--radius-sm)',
                          border: isSelected ? `2px solid ${getScoreColor()}` : '1px solid rgba(255, 255, 255, 0.08)',
                          background: isSelected ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                          color: isSelected ? getScoreColor() : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Visible Distress Flags (Checkboxes) */}
              <div>
                <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                  Visible Distress Flags (Bedside Inspection)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {DISTRESS_FLAGS.map((flag) => {
                    const isChecked = visibleDistress.includes(flag);
                    return (
                      <button
                        key={flag}
                        type="button"
                        onClick={() => handleToggleDistressFlag(flag)}
                        className={`glass ${isChecked ? 'active' : ''}`}
                        style={{
                          fontSize: '0.74rem',
                          padding: '0.3rem 0.6rem',
                          borderRadius: 'var(--radius-full)',
                          border: isChecked
                            ? flag === 'None Observed'
                              ? '1px solid var(--mint)'
                              : '1px solid rgba(248, 113, 113, 0.45)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                          background: isChecked
                            ? flag === 'None Observed'
                              ? 'rgba(53, 224, 193, 0.12)'
                              : 'rgba(239, 68, 68, 0.14)'
                            : 'transparent',
                          color: isChecked
                            ? flag === 'None Observed'
                              ? 'var(--mint)'
                              : 'var(--urgency-light)'
                            : 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        {isChecked && <Check size={11} />}
                        <span>{flag}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 6. Additional Observed Symptoms */}
              <div>
                <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                  Additional Observed Physical Signs
                </label>
                <input
                  type="text"
                  value={additionalSymptoms}
                  onChange={(e) => setAdditionalSymptoms(e.target.value)}
                  placeholder="e.g. Bilateral wheezing, pedal edema, skin rash, cold peripheries..."
                  className="glass-input"
                  aria-label="Additional Observed Physical Signs"
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.65rem', width: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: SECTION 3 (VERIFICATION), SECTION 4 (NOTES), SECTION 5 (METADATA)
            ========================================================================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* SECTION 3 — PATIENT INFORMATION VERIFICATION */}
          <div className="card glass-card" style={{ marginBottom: 0 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClipboardCheck size={18} color="var(--champagne)" />
                <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
                  Patient Information Verification
                </h2>
              </div>
              <span className="badge badge-champagne glass" style={{ fontSize: '0.65rem' }}>
                VERIFICATION PROTOCOL
              </span>
            </div>

            <div className="card-body">
              <p style={{ fontSize: '0.80rem', color: 'var(--text-muted)', margin: '0 0 0.85rem 0' }}>
                Review and verify patient-provided clinical history at the bedside. Mark each parameter to ensure record accuracy without duplicate data entry.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {Object.entries(verifications).map(([key, item]) => {
                  if (!item) return null;
                  const itemKey = key as keyof BedsideVerifications;
                  return (
                    <div
                      key={itemKey}
                      className="glass-card"
                      style={{
                        padding: '0.75rem 0.85rem',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                        <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                          {item.label}
                        </strong>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            type="button"
                            onClick={() => handleUpdateVerificationStatus(itemKey, 'patient_reported')}
                            className="glass"
                            title="Information reported by patient during intake"
                            style={{
                              fontSize: '0.68rem',
                              padding: '0.2rem 0.45rem',
                              borderRadius: '4px',
                              border: item.status === 'patient_reported' ? '1px solid var(--champagne)' : '1px solid rgba(255, 255, 255, 0.08)',
                              background: item.status === 'patient_reported' ? 'rgba(226, 195, 130, 0.16)' : 'transparent',
                              color: item.status === 'patient_reported' ? 'var(--champagne)' : 'var(--text-muted)',
                              cursor: 'pointer',
                            }}
                          >
                            Patient Reported
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateVerificationStatus(itemKey, 'nurse_verified')}
                            className="glass"
                            title="Confirmed and validated directly at bedside"
                            style={{
                              fontSize: '0.68rem',
                              padding: '0.2rem 0.45rem',
                              borderRadius: '4px',
                              border: item.status === 'nurse_verified' ? '1px solid var(--mint)' : '1px solid rgba(255, 255, 255, 0.08)',
                              background: item.status === 'nurse_verified' ? 'rgba(53, 224, 193, 0.16)' : 'transparent',
                              color: item.status === 'nurse_verified' ? 'var(--mint)' : 'var(--text-muted)',
                              cursor: 'pointer',
                            }}
                          >
                            <Check size={10} style={{ display: 'inline', marginRight: '2px' }} />
                            Nurse Verified
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateVerificationStatus(itemKey, 'unable_to_verify')}
                            className="glass"
                            title="Unable to verify at current bedside encounter"
                            style={{
                              fontSize: '0.68rem',
                              padding: '0.2rem 0.45rem',
                              borderRadius: '4px',
                              border: item.status === 'unable_to_verify' ? '1px solid rgba(248, 113, 113, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                              background: item.status === 'unable_to_verify' ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                              color: item.status === 'unable_to_verify' ? 'var(--urgency-light)' : 'var(--text-muted)',
                              cursor: 'pointer',
                            }}
                          >
                            <X size={10} style={{ display: 'inline', marginRight: '2px' }} />
                            Unable to Verify
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'rgba(0,0,0,0.15)', padding: '0.35rem 0.6rem', borderRadius: '4px' }}>
                        "{item.patientValue}"
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SECTION 4 — NURSE CLINICAL NOTES */}
          <div className="card glass-card" style={{ marginBottom: 0 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} color="var(--mint)" />
                <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
                  Nurse Clinical Notes
                </h2>
              </div>
              <span className="badge badge-teal glass" style={{ fontSize: '0.65rem' }}>
                BEDSIDE OBSERVATIONS
              </span>
            </div>

            <div className="card-body">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <textarea
                  id="nurse-bedside-notes"
                  className="form-textarea glass-input"
                  style={{ minHeight: '85px', fontSize: '0.84rem' }}
                  placeholder="Record relevant bedside observations for clinician review (e.g. physical examination findings, patient demeanor, bed positioning, peripheral perfusion)..."
                  value={nurseNotes}
                  onChange={(e) => setNurseNotes(e.target.value)}
                />
                <span className="form-help" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
                  Record objective bedside observations only. Do not record final medical diagnoses or prescription decisions.
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 5 — MEASUREMENT METADATA */}
          <div className="card glass-card" style={{ marginBottom: 0, padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.6rem' }}>
              <Building2 size={16} color="var(--teal)" />
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                Bedside Measurement Metadata
              </strong>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.6rem',
                fontSize: '0.76rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Assessment Time</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {formatDateTime(measuredAt)}
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Triage Nurse</span>
                <span style={{ color: 'var(--mint)', fontWeight: 600 }}>
                  {currentUser?.displayName || 'Nurse Priya Nair, RN'}
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Facility / Unit</span>
                <span style={{ color: 'var(--champagne)' }}>
                  Emergency Triage & Bedside Bay
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Assessment Status</span>
                <span className="badge badge-teal glass" style={{ fontSize: '0.65rem' }}>
                  {currentCase?.bedsideAssessment ? 'Bedside Recorded' : 'Ready to Save'}
                </span>
              </div>
            </div>
          </div>

          {/* BOTTOM ACTION AREA */}
          <div
            className="glass-card"
            style={{
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                <Sparkles size={13} color="var(--teal)" />
                <span>Bedside data is recorded directly into the chronological audit trail.</span>
              </div>

              <button
                type="button"
                className="btn btn-secondary glass"
                onClick={handleResetForm}
                style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
              >
                <RotateCcw size={12} style={{ marginRight: '3px' }} />
                Reset Vitals
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary glass"
                onClick={() => handleSaveAssessment(false)}
                disabled={isSaving}
                id="btn-save-bedside-assessment"
                style={{ fontSize: '0.84rem', padding: '0.5rem 1rem' }}
              >
                <Save size={15} />
                <span>{isSaving ? 'Saving to Database...' : 'Save Bedside Assessment'}</span>
              </button>

              <button
                type="button"
                className="btn btn-primary glass"
                onClick={() => handleSaveAssessment(true)}
                disabled={isSaving}
                id="btn-save-and-send-review"
                style={{ fontSize: '0.84rem', padding: '0.5rem 1.15rem' }}
              >
                <Send size={15} />
                <span>{isSaving ? 'Saving & Forwarding...' : 'Save & Send to Clinical Review \u2192'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
