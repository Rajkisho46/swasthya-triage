import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  User,
  Activity,
  ShieldAlert,
  ArrowUpRight,
  CalendarCheck,
  Mic,
  FileText,
  Languages,
  Clock,
  BrainCircuit,
  Stethoscope,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { TriageCase, ReviewerDecision } from '../../types/triage';
import { recordAuditEvent } from '../../utils/audit';
import { SafetyBanner } from '../SafetyDisclaimer/SafetyBanner';
import { useAuth } from '../../context/AuthContext';
import { bedsideService } from '../../services/bedside/bedsideService';
import { caseService } from '../../services/caseService';
import type { BedsideAssessment } from '../../types/triage';


interface CaseReviewModalProps {
  triageCase: TriageCase;
  onClose: () => void;
  onConfirmReview: (updatedCase: TriageCase) => void;
}

export const CaseReviewModal: React.FC<CaseReviewModalProps> = ({
  triageCase,
  onClose,
  onConfirmReview,
}) => {
  const { currentUser } = useAuth();
  const isNurse = currentUser?.role === 'NURSE';
  const isAdmin = currentUser?.role === 'ADMIN' || (currentUser?.role as any) === 'ADMINISTRATOR';
  const [reviewerNotes, setReviewerNotes] = useState<string>(triageCase.reviewerNotes || '');
  const [selectedDecision, setSelectedDecision] = useState<ReviewerDecision | ''>(
    triageCase.reviewerDecision || ''
  );
  const [error, setError] = useState<string>('');
  const [expandedOCRId, setExpandedOCRId] = useState<string | null>(null);
  const [latestBedside, setLatestBedside] = useState<BedsideAssessment | null>(triageCase.bedsideAssessment || null);

  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const isAlreadyReviewed = triageCase.reviewStatus === 'reviewed';

  useEffect(() => {
    let isMounted = true;
    bedsideService.getLatestBedsideAssessment(triageCase.caseId).then((data) => {
      if (isMounted && data) {
        setLatestBedside(data);
        if (!reviewerNotes && data.nurseNotes) {
          setReviewerNotes(data.nurseNotes);
        }
      }
    }).catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [triageCase.caseId]);

  // Keyboard accessibility: Initial focus, focus trap, escape listener, and focus restoration
  useEffect(() => {
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [onClose]);

  const decisionSectionRef = useRef<HTMLDivElement>(null);

  const handleConfirm = async () => {
    if (isNurse) {
      try {
        const updatedCase: TriageCase = {
          ...triageCase,
          reviewerNotes: reviewerNotes.trim(),
        };

        recordAuditEvent(
          triageCase.caseId,
          'Medical Reviewer',
          'Triage Nurse recorded bedside observations & vitals verification',
          `Nursing observations by ${currentUser?.displayName || 'Nurse'}: ${reviewerNotes.trim() || 'Vitals checked and verified'}`
        );

        onConfirmReview(updatedCase);
      } catch (err: unknown) {
        console.error('Failed to save nursing observations:', err);
        setError('Failed to save observations. Please try again.');
      }
      return;
    }

    if (!selectedDecision) {
      setError('Please select a human clinical decision (Routine Review, Escalate, or Refer) above before confirming.');
      decisionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    try {
      let updatedCase: TriageCase;
      try {
        updatedCase = await caseService.submitClinicalReviewDecision(
          triageCase.caseId,
          selectedDecision as ReviewerDecision,
          reviewerNotes.trim(),
          currentUser?.displayName || 'Medical Officer (On Duty)',
          currentUser?.role || 'DOCTOR'
        );
      } catch (backendErr) {
        console.warn('[CaseReviewModal] Backend decision submit fallback to local state:', backendErr);
        updatedCase = {
          ...triageCase,
          reviewStatus: 'reviewed',
          reviewerNotes: reviewerNotes.trim(),
          reviewerDecision: selectedDecision as ReviewerDecision,
          reviewedAt: new Date().toISOString(),
          reviewerName: currentUser?.displayName || 'Medical Officer (On Duty)',
        };
      }

      recordAuditEvent(
        triageCase.caseId,
        'Medical Reviewer',
        `Clinician decision recorded: ${selectedDecision}`,
        `Reviewer notes: ${reviewerNotes.trim() || 'None'} | Decision: ${selectedDecision} | Reviewer: ${currentUser?.displayName || 'Medical Reviewer'}`
      );

      recordAuditEvent(
        triageCase.caseId,
        'Medical Reviewer',
        'Clinical review sign-off confirmed',
        `Case ${triageCase.caseId} marked reviewed with decision: ${selectedDecision}`
      );

      onConfirmReview(updatedCase);
    } catch (err: unknown) {
      console.error('Failed to confirm clinical review decision:', err);
      setError('Failed to confirm clinical review. Please try again.');
    }

  };

  const hasUrgency = Boolean(triageCase.urgencySignals && triageCase.urgencySignals.length > 0);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-content glass-modal clinical-review-modal" ref={modalRef}>
        {/* 1. Modal Header (Fixed at top) */}
        <div className="modal-header glass clinical-review-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <div className="intake-step-badge" style={{ marginBottom: 0 }}>03 / DECISION COMMAND HUB</div>
              <h2 id="modal-title" style={{ fontSize: '1.20rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.45rem', margin: 0, color: 'var(--text-primary)' }}>
                <Stethoscope size={20} color="var(--teal)" />
                <span>Clinical Review &bull; {triageCase.caseId}</span>
              </h2>
              <span className="badge badge-champagne glass" style={{ fontSize: '0.72rem' }}>
                Ref: {triageCase.patientId}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
              Age: {triageCase.age ? `${triageCase.age} Yrs` : 'Unspecified'} &bull; Gender: {triageCase.gender || 'Unspecified'} &bull; Language: {triageCase.preferredLanguage || 'English'} &bull; Engine: {triageCase.processorUsed || 'Deterministic V1'}
            </div>
          </div>
          <button ref={closeButtonRef} className="close-btn glass" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* 2. Scrollable Modal Body (The ONLY primary scrolling region) */}
        <div className="modal-body clinical-review-body">
          {/* Institutional Safety Banner */}
          <SafetyBanner compact />

          {/* 2. Two-Column Clinical Comparison Grid (Patient Evidence vs AI Advisory) */}
          <div className="reviewer-comparison-grid">
            {/* =========================================================================
                COLUMN 1: PATIENT EVIDENCE
                ========================================================================= */}
            <div className="reviewer-col evidence-col glass-card">
              <div className="reviewer-col-header glass">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <User size={16} color="var(--champagne)" />
                  <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--champagne)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                    Patient Evidence
                  </span>
                </div>
                <span className="provenance-tag patient glass">Source: PATIENT</span>
              </div>

              <div className="reviewer-col-body">
                {/* 1. Patient Narrative */}
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', marginBottom: '0.35rem' }}>
                    Reported Narrative
                  </div>
                  <div
                    className="glass-card"
                    style={{
                      padding: '0.75rem 0.90rem',
                      fontSize: '0.86rem',
                      lineHeight: 1.5,
                      color: 'var(--text-primary)',
                      fontStyle: triageCase.rawSymptoms ? 'normal' : 'italic',
                    }}
                  >
                    {triageCase.rawSymptoms ? (
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>"{triageCase.rawSymptoms}"</p>
                    ) : (
                      <p style={{ margin: 0, color: 'var(--text-muted)' }}>No direct text narrative provided.</p>
                    )}
                  </div>

                  {/* Multilingual Translation */}
                  {triageCase.multilingualData?.isTranslated && (
                    <div
                      className="glass-card"
                      style={{
                        marginTop: '0.65rem',
                        padding: '0.65rem 0.85rem',
                        border: '1px solid rgba(53, 224, 193, 0.25)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.74rem', fontWeight: 700, color: 'var(--teal)' }}>
                          <Languages size={13} />
                          <span>English Translation</span>
                        </div>
                        <span className="badge badge-teal glass" style={{ fontSize: '0.62rem' }}>
                          Original: {triageCase.multilingualData.originalLanguage}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', margin: 0, fontStyle: 'italic', lineHeight: 1.45 }}>
                        "{triageCase.multilingualData.translatedText}"
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Voice Audio Evidence */}
                {triageCase.voiceData && (
                  <div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', marginBottom: '0.35rem' }}>
                      Voice Ingestion Evidence
                    </div>
                    <div
                      className="glass-card"
                      style={{
                        padding: '0.75rem 0.90rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--champagne)', fontWeight: 600, fontSize: '0.80rem' }}>
                          <Mic size={14} />
                          <span>Voice Recording ({triageCase.voiceData.durationSeconds}s)</span>
                        </div>
                        <span className="badge badge-champagne glass" style={{ fontSize: '0.65rem' }}>
                          {triageCase.voiceData.isDemoTranscription ? 'Voice STT' : 'Transcribed'}
                        </span>
                      </div>
                      <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0, lineHeight: 1.45 }}>
                        "{triageCase.voiceData.transcript}"
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. OCR Medical Documents */}
                {triageCase.ocrReports && triageCase.ocrReports.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', marginBottom: '0.35rem' }}>
                      Diagnostic OCR Reports ({triageCase.ocrReports.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {triageCase.ocrReports.map((r) => {
                        const isExpanded = expandedOCRId === r.id;
                        return (
                          <div
                            key={r.id}
                            className="glass-card"
                            style={{
                              padding: '0.65rem 0.85rem',
                            }}
                          >
                            <div
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                              onClick={() => setExpandedOCRId(isExpanded ? null : r.id)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <FileText size={14} color="var(--teal)" />
                                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                  {r.fileName}
                                </span>
                                <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                                  ({r.reportCategory || r.fileType.toUpperCase()})
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span className="badge badge-teal glass" style={{ fontSize: '0.62rem' }}>
                                  {r.isDemoOCR ? 'OCR Document' : 'Extracted'}
                                </span>
                                {isExpanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div
                                className="glass-input"
                                style={{
                                  marginTop: '0.50rem',
                                  padding: '0.65rem',
                                  fontFamily: 'var(--font-mono)',
                                  whiteSpace: 'pre-wrap',
                                  fontSize: '0.74rem',
                                  color: 'var(--text-secondary)',
                                  maxHeight: '110px',
                                  overflowY: 'auto',
                                }}
                              >
                                {r.extractedText}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* =========================================================================
                COLUMN 2: AI ADVISORY
                ========================================================================= */}
            <div className="reviewer-col advisory-col glass-card">
              <div className="reviewer-col-header glass">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <BrainCircuit size={16} color="var(--mint)" />
                  <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--mint)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                    AI Advisory Extraction
                  </span>
                </div>
                <span className="badge badge-teal glass" style={{ fontSize: '0.65rem' }}>NON-DIAGNOSTIC</span>
              </div>

              <div className="reviewer-col-body">
                {/* 1. Urgency Signals */}
                {hasUrgency ? (
                  <div
                    className="glass-card"
                    style={{
                      border: '1px solid rgba(255, 107, 107, 0.35)',
                      padding: '0.70rem 0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--urgency-light)', fontWeight: 700, fontSize: '0.80rem', textTransform: 'uppercase', letterSpacing: '0.03em', fontFamily: 'var(--font-mono)' }}>
                      <ShieldAlert size={15} />
                      <span>Urgent Review Signal Flagged</span>
                    </div>
                    <ul style={{ margin: '0.35rem 0 0 1.15rem', padding: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {triageCase.urgencySignals.map((s, idx) => {
                        const detail = s.signal.includes(':')
                          ? s.signal.split(':').slice(1).join(':').trim()
                          : s.signal;
                        return (
                          <li key={idx} style={{ marginBottom: '0.25rem' }}>
                            <strong style={{ color: 'var(--urgency-light)' }}>{s.reason}</strong>
                            {detail && detail.toLowerCase() !== s.reason.toLowerCase() && (
                              <span style={{ color: 'var(--text-secondary)' }}>: {detail}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <div
                    className="glass-card"
                    style={{
                      border: '1px solid rgba(53, 224, 193, 0.25)',
                      padding: '0.60rem 0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <ShieldCheck size={16} color="var(--teal)" />
                    <span style={{ fontSize: '0.80rem', color: 'var(--text-secondary)' }}>
                      No urgency signals detected &bull; Routine evaluation
                    </span>
                  </div>
                )}

                {/* 2. Extracted Symptoms */}
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Activity size={13} color="var(--teal)" />
                    <span>Extracted Symptoms</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {triageCase.extractedSymptoms.map((s, idx) => (
                      <span
                        key={idx}
                        className="glass"
                        style={{
                          background: 'rgba(53, 224, 193, 0.12)',
                          color: 'var(--mint)',
                          border: '1px solid rgba(53, 224, 193, 0.30)',
                          padding: '0.20rem 0.55rem',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 3. Timeline */}
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={13} color="var(--seafoam)" />
                    <span>Onset Timeline</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {triageCase.timeline.map((t, idx) => (
                      <div
                        key={idx}
                        className="glass"
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-primary)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.30rem 0.55rem',
                          border: '1px solid rgba(59, 74, 69, 0.35)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <strong>{t.symptom}</strong>
                        <span className="badge badge-gray glass" style={{ fontSize: '0.65rem' }}>{t.durationOrOnset}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Missing Information to Verify */}
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--champagne)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AlertTriangle size={13} color="var(--champagne)" />
                    <span>Information Gaps (Bedside Verification)</span>
                  </div>
                  <ul style={{ margin: '0 0 0 1.15rem', padding: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {triageCase.missingInformation.slice(0, 4).map((m, idx) => (
                      <li key={idx} style={{ marginBottom: '0.2rem' }}>{m}</li>
                    ))}
                  </ul>
                </div>

                {/* 5. AI Summary */}
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>
                    Factual Intake Summary
                  </div>
                  <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: 0 }}>
                    {triageCase.aiSummary}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Clinician Observations Area */}
          <div
            className="glass-card"
            style={{
              padding: '1.15rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Stethoscope size={18} color="var(--teal)" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                  Clinician Observations
                </h3>
              </div>
              <span className="provenance-tag reviewer glass">Source: CLINICIAN</span>
            </div>

            {/* If real-time Bedside Assessment exists, display measured vitals badge strip */}
            {latestBedside && (
              <div
                className="glass-card"
                style={{
                  marginBottom: '0.85rem',
                  padding: '0.75rem 0.90rem',
                  border: '1px solid rgba(53, 224, 193, 0.25)',
                  background: 'rgba(53, 224, 193, 0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--mint)' }}>
                    <Activity size={14} />
                    <span>Real-Time Bedside Vitals (Assessed by {latestBedside.nurseName})</span>
                  </div>
                  <span className="badge badge-teal glass" style={{ fontSize: '0.65rem' }}>
                    Source: NURSE MEASURED
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', fontSize: '0.80rem', fontFamily: 'var(--font-mono)' }}>
                  {latestBedside.vitals.systolicBP && latestBedside.vitals.diastolicBP && (
                    <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '8px', color: 'var(--text-primary)' }}>
                      BP: <strong style={{ color: 'var(--mint)' }}>{latestBedside.vitals.systolicBP}/{latestBedside.vitals.diastolicBP}</strong> mmHg
                    </span>
                  )}
                  {latestBedside.vitals.heartRate && (
                    <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '8px', color: 'var(--text-primary)' }}>
                      Pulse: <strong style={{ color: 'var(--champagne)' }}>{latestBedside.vitals.heartRate}</strong> bpm
                    </span>
                  )}
                  {latestBedside.vitals.spo2 && (
                    <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '8px', color: 'var(--text-primary)' }}>
                      SpO2: <strong style={{ color: 'var(--teal)' }}>{latestBedside.vitals.spo2}%</strong>
                    </span>
                  )}
                  {latestBedside.vitals.temperature && (
                    <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '8px', color: 'var(--text-primary)' }}>
                      Temp: <strong style={{ color: 'var(--champagne)' }}>{latestBedside.vitals.temperature}°{latestBedside.vitals.tempUnit || 'F'}</strong>
                    </span>
                  )}
                  {latestBedside.vitals.respiratoryRate && (
                    <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '8px', color: 'var(--text-primary)' }}>
                      RR: <strong style={{ color: 'var(--mint)' }}>{latestBedside.vitals.respiratoryRate}/min</strong>
                    </span>
                  )}
                  {latestBedside.vitals.bloodGlucose && (
                    <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '8px', color: 'var(--text-primary)' }}>
                      RBS: <strong>{latestBedside.vitals.bloodGlucose} mg/dL</strong>
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="reviewer-notes" className="form-label" style={{ fontSize: '0.78rem' }}>
                Objective Clinical Findings & Bedside Measurements (BP, SpO2, Temp, instructions)
              </label>
              <textarea
                id="reviewer-notes"
                className="form-textarea glass-input"
                style={{ minHeight: '75px', fontSize: '0.86rem' }}
                placeholder="Enter objective clinical findings, vitals checked (e.g. BP 120/80, SpO2 98%, Temp 100.2F), or instructions for nursing staff..."
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
              />
              <span className="form-help">Clinical observations are entered by the reviewing clinician.</span>
            </div>
          </div>

          {/* 4. Human Decision Routing Pathway (Doctor Only), Nursing Triage Notice, or Admin Read-Only Notice */}
          {isAdmin ? (
            <div
              className="glass-card"
              style={{
                padding: '1.15rem',
                border: '1px solid rgba(192, 132, 252, 0.30)',
                background: 'rgba(192, 132, 252, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <ShieldCheck size={18} color="#c084fc" />
                <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#c084fc', margin: 0 }}>
                  Administrative Read-Only Queue Oversight
                </h3>
              </div>
              <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                System Administrators have read-only inspection access to triage evidence and provenance logs. Clinical review decisions and disposition authority are strictly reserved for Medical Officers and Doctors.
              </p>
            </div>
          ) : isNurse ? (
            <div
              className="glass-card"
              style={{
                padding: '1.15rem',
                border: '1px solid rgba(53, 224, 193, 0.30)',
                background: 'rgba(53, 224, 193, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <ShieldCheck size={18} color="var(--mint)" />
                <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--mint)', margin: 0 }}>
                  Nursing Triage Preparation
                </h3>
              </div>
              <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                Final clinical disposition authority (Routine / Escalate / Refer) is reserved for the Medical Officer / Doctor. You can record objective vitals and bedside observations above for physician sign-off.
              </p>
            </div>
          ) : (
            <div
              ref={decisionSectionRef}
              className="glass-card"
              style={{
                padding: '1.15rem',
                border: error ? '1px solid rgba(248, 113, 113, 0.45)' : undefined,
                transition: 'border 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    Human Clinical Decision
                  </h3>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    Mandatory human-in-the-loop clinical disposition &bull; AI assists. Human clinician decides.
                  </div>
                </div>
                <span className="provenance-tag reviewer glass">Decision Authority</span>
              </div>

              <div className="decision-pathway-grid">
                {/* Card 1: Routine Review */}
                <button
                  type="button"
                  className={`decision-card glass-card ${selectedDecision === 'Routine Review' ? 'selected-routine' : ''}`}
                  onClick={() => {
                    setSelectedDecision('Routine Review');
                    setError('');
                  }}
                  aria-pressed={selectedDecision === 'Routine Review'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.88rem', color: selectedDecision === 'Routine Review' ? 'var(--champagne)' : 'var(--text-primary)' }}>
                    <CalendarCheck size={18} color="var(--champagne)" aria-hidden="true" />
                    <span>Routine Review</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Standard general OPD queue. No immediate red flag urgency identified.
                  </div>
                </button>

                {/* Card 2: Escalate */}
                <button
                  type="button"
                  className={`decision-card glass-card ${selectedDecision === 'Escalate' ? 'selected-escalate' : ''}`}
                  onClick={() => {
                    setSelectedDecision('Escalate');
                    setError('');
                  }}
                  aria-pressed={selectedDecision === 'Escalate'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.88rem', color: selectedDecision === 'Escalate' ? 'var(--mint)' : 'var(--text-primary)' }}>
                    <ShieldAlert size={18} color="var(--teal)" aria-hidden="true" />
                    <span>Escalate</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Priority internal evaluation, urgent vitals monitoring or immediate MO review.
                  </div>
                </button>

                {/* Card 3: Refer */}
                <button
                  type="button"
                  className={`decision-card glass-card ${selectedDecision === 'Refer' ? 'selected-refer' : ''}`}
                  onClick={() => {
                    setSelectedDecision('Refer');
                    setError('');
                  }}
                  aria-pressed={selectedDecision === 'Refer'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.88rem', color: selectedDecision === 'Refer' ? 'var(--urgency-light)' : 'var(--text-primary)' }}>
                    <ArrowUpRight size={18} color="var(--urgency)" aria-hidden="true" />
                    <span>Refer</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Transfer or refer to secondary/tertiary hospital or emergency center.
                  </div>
                </button>
              </div>

              {error && (
                <div className="form-error" style={{ marginTop: '0.75rem' }}>
                  <AlertTriangle size={15} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. Modal Sign-off Footer (Fixed at bottom of modal) */}
        <div className="modal-footer glass clinical-review-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
          {error && (
            <div className="form-error" style={{ margin: 0, justifyContent: 'center' }}>
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              <Sparkles size={13} color="var(--teal)" />
              <span>{isAdmin ? 'Read-only administrative oversight mode.' : isNurse ? 'Observations recorded to clinical case timeline.' : 'Decision recorded to chronological audit trail.'}</span>
            </div>

            <div style={{ display: 'flex', gap: '0.65rem' }}>
              {isAdmin ? (
                <button
                  type="button"
                  className="btn btn-primary glass"
                  onClick={onClose}
                  id="btn-admin-close-oversight"
                >
                  <ShieldCheck size={15} />
                  <span>Close Oversight</span>
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary glass" onClick={onClose}>
                    Cancel
                  </button>
                  {isNurse ? (
                    <button
                      type="button"
                      className="btn btn-primary glass"
                      onClick={handleConfirm}
                      id="btn-save-nurse-observations"
                    >
                      <CheckCircle2 size={16} />
                      <span>Save Nursing Observations for Doctor &rarr;</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary glass"
                      onClick={handleConfirm}
                      id="btn-confirm-review"
                    >
                      <CheckCircle2 size={16} />
                      <span>{isAlreadyReviewed ? 'Update Review Decision' : 'Confirm Clinical Review \u2192'}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
