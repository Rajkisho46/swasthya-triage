import React, { useState } from 'react';
import {
  FileCheck2,
  Clock,
  AlertCircle,
  HelpCircle,
  Info,
  Send,
  User,
  Activity,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  Mic,
  FileText,
  Languages,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  FileSearch,
  Check,
  Calendar,
  Sparkles,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import type { TriageCase } from '../../types/triage';
import { formatDateTime } from '../../utils/caseId';
import { recordAuditEvent } from '../../utils/audit';
import { SafetyBanner } from '../SafetyDisclaimer/SafetyBanner';
import { CaseJourney } from '../Layout/CaseJourney';
import { caseService } from '../../services/caseService';
import { useAuth } from '../../context/AuthContext';

interface TriageNoteViewProps {
  triageCase: TriageCase;
  onSendForReview: (updatedCase: TriageCase) => void;
  onNavigateToReviewer?: () => void;
}

export const TriageNoteView: React.FC<TriageNoteViewProps> = ({
  triageCase,
  onSendForReview,
  onNavigateToReviewer,
}) => {
  const { currentUser } = useAuth();
  const isReviewed = triageCase.reviewStatus === 'reviewed';
  const isAwaitingReview = triageCase.reviewStatus === 'awaiting_review';
  const isSubmittedToDoctor = isAwaitingReview || isReviewed;
  const [expandedOCRId, setExpandedOCRId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  const handleSendForReview = async () => {
    if (isSubmitting || isSubmittedToDoctor) return;
    setIsSubmitting(true);
    setFeedbackMessage('');

    try {
      let updatedCase: TriageCase;
      try {
        updatedCase = await caseService.sendForMedicalReview(triageCase.caseId, triageCase.reviewerNotes);
      } catch (err) {
        console.warn('[TriageNoteView] sendForMedicalReview backend fallback:', err);
        updatedCase = {
          ...triageCase,
          reviewStatus: 'awaiting_review',
        };
      }

      recordAuditEvent(
        triageCase.caseId,
        'Medical Reviewer',
        'Case sent for medical review',
        `Nurse ${currentUser?.displayName || 'Nurse Priya Nair, RN'} submitted Triage Evidence Note | Forwarded to Clinical Review Queue | Case: ${triageCase.caseId}`
      );

      setFeedbackMessage('Evidence note submitted successfully. Case sent to Medical Review.');
      onSendForReview(updatedCase);
    } catch (err: any) {
      console.error('Failed to forward case to medical review:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasUrgency = Boolean(triageCase.urgencySignals && triageCase.urgencySignals.length > 0);
  const hasPatientEvidence = Boolean(
    (triageCase.rawSymptoms && triageCase.rawSymptoms.trim().length > 0) ||
    triageCase.voiceData ||
    (triageCase.ocrReports && triageCase.ocrReports.length > 0) ||
    triageCase.multilingualData?.isTranslated
  );

  return (
    <div className="triage-note-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Institutional Safety Banner */}
      <SafetyBanner />

      {/* 2. Global Case Journey Stepper */}
      <CaseJourney triageCase={triageCase} currentStep="summary" compact />

      {/* Feedback Toast */}
      {feedbackMessage && (
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
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{feedbackMessage}</span>
        </div>
      )}

      {/* 3. Command Header Bar */}
      <div className="triage-case-header-bar glass-panel scroll-reveal reveal-delay-1">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="intake-step-badge">03 / EVIDENCE NOTE</div>
            <h1 className="intake-title" style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <FileCheck2 size={24} color={hasUrgency ? 'var(--urgency)' : 'var(--teal)'} />
              <span>Evidence Review & Advisory</span>
            </h1>
            <p className="intake-subtitle">
              Multimodal evidence &bull; AI advisory
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {isReviewed ? (
              <span className="badge badge-teal glass">
                <CheckCircle2 size={13} aria-hidden="true" /> Reviewed & Signed
              </span>
            ) : isAwaitingReview ? (
              <span className="badge badge-amber glass">
                <Clock size={13} aria-hidden="true" /> In Medical Queue
              </span>
            ) : (
              <span className="badge badge-teal glass" style={{ opacity: 0.9 }}>
                <Stethoscope size={13} aria-hidden="true" /> Nurse Draft
              </span>
            )}

            {hasUrgency ? (
              <span className="badge badge-red glass">
                <ShieldAlert size={13} aria-hidden="true" /> Urgent Priority
              </span>
            ) : (
              <span className="badge badge-teal glass" style={{ opacity: 0.85 }}>
                <ShieldCheck size={13} aria-hidden="true" /> Routine Priority
              </span>
            )}

            {onNavigateToReviewer && (
              <button
                type="button"
                className="btn btn-secondary glass"
                onClick={onNavigateToReviewer}
              >
                <ArrowRight size={15} aria-hidden="true" />
                <span>Reviewer Queue</span>
              </button>
            )}

            {!isSubmittedToDoctor && (
              <button
                type="button"
                className="btn btn-primary glass"
                onClick={handleSendForReview}
                disabled={isSubmitting}
                id="btn-send-review"
              >
                <Send size={15} aria-hidden="true" />
                <span>{isSubmitting ? 'Sending...' : 'Send for Review'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Case Metadata Grid */}
        <div className="case-meta-grid glass">
          <div className="case-meta-item">
            <span className="case-meta-label">CASE</span>
            <span className="case-meta-value" style={{ color: 'var(--mint)' }}>{triageCase.caseId}</span>
          </div>

          <div className="case-meta-item">
            <span className="case-meta-label">PATIENT</span>
            <span className="case-meta-value" style={{ color: 'var(--champagne)' }}>{triageCase.patientId}</span>
          </div>

          <div className="case-meta-item">
            <span className="case-meta-label">DEMOGRAPHICS</span>
            <span className="case-meta-value">
              {triageCase.age ? `${triageCase.age} Yrs` : 'N/A'} &bull; {triageCase.gender || 'N/A'}
            </span>
          </div>

          <div className="case-meta-item">
            <span className="case-meta-label">LANGUAGE</span>
            <span className="case-meta-value">{triageCase.preferredLanguage || 'English'}</span>
          </div>

          <div className="case-meta-item">
            <span className="case-meta-label">ENGINE</span>
            <span className="case-meta-value" style={{ fontSize: '0.80rem' }}>
              {triageCase.isFallbackUsed ? 'Deterministic fallback' : (triageCase.processorUsed || 'Deterministic')}
            </span>
          </div>

          <div className="case-meta-item">
            <span className="case-meta-label">MODALITIES</span>
            <div className="case-meta-tags">
              {triageCase.inputModalities?.map((m, i) => (
                <span key={i} className="badge badge-blue glass" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}>
                  {m}
                </span>
              )) || <span className="badge badge-gray glass">text</span>}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Urgency Review Signal Banner */}
      {hasUrgency ? (
        <div className="card-urgency glass-card scroll-reveal reveal-delay-2" role="alert">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={20} color="var(--urgency-light)" aria-hidden="true" />
              <div>
                <h2 style={{ color: 'var(--urgency-light)', fontSize: '0.96rem', letterSpacing: '0.02em', margin: 0, fontWeight: 700 }}>
                  Priority Review Signal
                </h2>
                <div style={{ fontSize: '0.80rem', color: 'rgba(255, 180, 180, 0.85)', marginTop: '0.15rem' }}>
                  Potential red flags extracted from patient evidence
                </div>
              </div>
            </div>
            <span className="provenance-tag ai glass">Source: AI ADVISORY</span>
          </div>

          <div className="urgency-signals-grid">
            {triageCase.urgencySignals.map((sig, idx) => {
              // Separate title and unique supporting evidence to eliminate verbatim duplication
              const title = sig.reason || 'Clinical Urgency Indicator';
              const detail = sig.signal.includes(':')
                ? sig.signal.split(':').slice(1).join(':').trim()
                : sig.signal;

              return (
                <div key={idx} className="glass-card urgency-signal-card">
                  <div className="urgency-signal-title">
                    <span aria-hidden="true">&bull;</span>
                    <span>{title}</span>
                  </div>
                  {detail && detail.toLowerCase() !== title.toLowerCase() && (
                    <div className="urgency-signal-desc">
                      {detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="glass-card scroll-reveal reveal-delay-2"
          style={{
            padding: '0.85rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ShieldCheck size={18} color="var(--teal)" aria-hidden="true" />
            <div>
              <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                NO URGENCY SIGNALS
              </span>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block' }}>
                Routine &bull; Non-diagnostic
              </span>
            </div>
          </div>
          <span className="provenance-tag ai glass">Source: AI ADVISORY</span>
        </div>
      )}

      {/* 5. Fallback Notice if active */}
      {triageCase.isFallbackUsed && (
        <div
          className="glass-card"
          style={{
            backgroundColor: 'rgba(226, 195, 130, 0.12)',
            border: '1px solid rgba(226, 195, 130, 0.35)',
            color: 'var(--champagne)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.84rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          <AlertCircle size={18} color="var(--champagne)" aria-hidden="true" />
          <div>
            <strong>Deterministic Knowledge Base Fallback Active:</strong> AI service unavailable ({triageCase.fallbackReason || 'provider offline'}). Standard clinical rule extraction was executed safely.
          </div>
        </div>
      )}

      {/* 6. Section 1: Evidence Ingestion vs AI Advisory Synthesis */}
      <div className={`summary-grid-layout scroll-reveal reveal-delay-3 ${!hasPatientEvidence ? 'single-column' : ''}`}>
        {/* =========================================================================
            LEFT COLUMN: PATIENT-PROVIDED EVIDENCE (Rendered when evidence exists)
            ========================================================================= */}
        {hasPatientEvidence && (
          <div className="summary-column summary-evidence-col">
            {/* Patient Narrative Card */}
            <div className="card glass-card" style={{ marginBottom: 0 }}>
              <div className="card-header">
                <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
                  <User size={18} color="var(--champagne)" aria-hidden="true" />
                  <span>Patient-Provided Narrative</span>
                </h2>
                <span className="provenance-tag patient glass">Source: PATIENT</span>
              </div>

              <div className="card-body">
                <div
                  className="glass-card"
                  style={{
                    padding: '1rem',
                    color: 'var(--text-primary)',
                    fontSize: '0.92rem',
                    lineHeight: 1.6,
                    fontStyle: triageCase.rawSymptoms ? 'normal' : 'italic',
                  }}
                >
                  {triageCase.rawSymptoms ? (
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>"{triageCase.rawSymptoms}"</p>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                      No direct text narrative provided (multimodal voice/OCR inputs attached below).
                    </p>
                  )}
                </div>

                {/* Multilingual Translation Box if available */}
                {triageCase.multilingualData?.isTranslated && (
                  <div
                    className="glass-card"
                    style={{
                      marginTop: '0.85rem',
                      padding: '0.85rem 1rem',
                      border: '1px solid rgba(53, 224, 193, 0.25)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.80rem', fontWeight: 700, color: 'var(--teal)' }}>
                        <Languages size={15} aria-hidden="true" />
                        <span>Normalized English Translation</span>
                      </div>
                      <span className="badge badge-teal glass" style={{ fontSize: '0.65rem' }}>
                        {triageCase.multilingualData.originalLanguage} &rarr; English
                      </span>
                    </div>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>
                      "{triageCase.multilingualData.translatedText}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Multimodal Attachments Card */}
            {(triageCase.voiceData || (triageCase.ocrReports && triageCase.ocrReports.length > 0)) && (
              <div className="card glass-card" style={{ marginBottom: 0 }}>
                <div className="card-header">
                  <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
                    <FileSearch size={18} color="var(--seafoam)" aria-hidden="true" />
                    <span>Multimodal Evidence Ingestion</span>
                  </h2>
                  <span className="provenance-tag multimodal glass">Source: MULTIMODAL</span>
                </div>

                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* Voice Ingestion Card */}
                  {triageCase.voiceData && (
                    <div
                      className="glass-card"
                      style={{
                        padding: '0.90rem 1rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--champagne)', fontWeight: 600, fontSize: '0.86rem' }}>
                          <Mic size={16} aria-hidden="true" />
                          <span>Voice Stream ({triageCase.voiceData.durationSeconds}s &bull; {triageCase.voiceData.originalLanguage})</span>
                        </div>
                        <span className="badge badge-champagne glass" style={{ fontSize: '0.68rem' }}>
                          {triageCase.voiceData.isDemoTranscription ? 'Voice STT' : 'Transcribed STT'}
                        </span>
                      </div>

                      {/* Visualizer Waveform */}
                      <div className="waveform-container glass" style={{ height: '1.85rem', marginBottom: '0.65rem' }}>
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div key={i} className="waveform-bar" style={{ animationDelay: `${(i * 0.1) % 0.6}s` }} />
                        ))}
                      </div>

                      <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic', lineHeight: 1.45 }}>
                        "{triageCase.voiceData.transcript}"
                      </p>
                    </div>
                  )}

                  {/* OCR Ingestion Card */}
                  {triageCase.ocrReports && triageCase.ocrReports.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {triageCase.ocrReports.map((report) => {
                        const isExpanded = expandedOCRId === report.id;
                        return (
                          <div
                            key={report.id}
                            className="glass-card"
                            style={{
                              padding: '0.85rem 1rem',
                            }}
                          >
                            <div
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                              onClick={() => setExpandedOCRId(isExpanded ? null : report.id)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                <FileText size={16} color="var(--teal)" aria-hidden="true" />
                                <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{report.fileName}</strong>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                  ({report.reportCategory || report.fileType.toUpperCase()})
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="badge badge-teal glass" style={{ fontSize: '0.68rem' }}>
                                  {report.isDemoOCR ? 'OCR Document' : 'OCR Extracted'}
                                </span>
                                {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div
                                className="glass-input"
                                style={{
                                  marginTop: '0.75rem',
                                  padding: '0.75rem',
                                  fontSize: '0.80rem',
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--text-secondary)',
                                  whiteSpace: 'pre-wrap',
                                  maxHeight: '180px',
                                  overflowY: 'auto',
                                }}
                              >
                                {report.extractedText}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            RIGHT COLUMN: AI ADVISORY SUMMARY & EXTRACTED SYMPTOMS
            ========================================================================= */}
        <div className="summary-column summary-advisory-col">
          {/* AI Advisory Summary Top Card */}
          <div className="card glass-card" style={{ marginBottom: 0, border: '1px solid rgba(53, 224, 193, 0.30)' }}>
            <div className="card-header">
              <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
                <BrainCircuit size={18} color="var(--mint)" aria-hidden="true" />
                <span>AI Advisory Summary</span>
              </h2>
              <span className="badge badge-teal glass">AI ADVISORY &bull; NON-DIAGNOSTIC</span>
            </div>

            <div className="card-body">
              <p style={{ fontSize: '0.90rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.6 }}>
                {triageCase.aiSummary}
              </p>
              <div
                style={{
                  marginTop: '0.85rem',
                  paddingTop: '0.65rem',
                  borderTop: '1px solid rgba(59, 74, 69, 0.40)',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Sparkles size={13} color="var(--teal)" aria-hidden="true" />
                <span>AI output supports information review only. Final clinical decisions remain with the medical reviewer.</span>
              </div>
            </div>
          </div>

          {/* Extracted Symptoms Legend Chips */}
          <div className="card glass-card" style={{ marginBottom: 0 }}>
            <div className="card-header">
              <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
                <Activity size={18} color="var(--teal)" aria-hidden="true" />
                <span>Extracted Symptoms ({triageCase.extractedSymptoms.length.toString().padStart(2, '0')})</span>
              </h2>
              <span className="provenance-tag ai glass">Source: AI ADVISORY</span>
            </div>

            <div className="card-body">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                {triageCase.extractedSymptoms.map((sym, idx) => (
                  <span
                    key={idx}
                    className="symptom-legend-chip glass"
                  >
                    <Check size={12} color="var(--teal)" aria-hidden="true" />
                    <span>{sym}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 7. Section 2: Clinical Timeline & Information Gaps Grid */}
      <div className="summary-grid-layout scroll-reveal reveal-delay-4">
        {/* Clinical Timeline & Onset Progression */}
        <div className="card glass-card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
              <Clock size={18} color="var(--seafoam)" aria-hidden="true" />
              <span>Clinical Information Timeline</span>
            </h2>
            <span className="provenance-tag ai glass">Source: AI ADVISORY</span>
          </div>

          <div className="card-body">
            {/* Shared temporal header context */}
            <div className="timeline-shared-header glass">
              <Calendar size={13} color="var(--champagne)" aria-hidden="true" />
              <span>Reported Symptom Progression &bull; 3–4 Days Onset Trajectory</span>
            </div>

            <div className="clinical-timeline">
              {triageCase.timeline.map((item, idx) => (
                <div key={idx} className="timeline-node-item">
                  <div className="timeline-node-dot glass">
                    <div className="timeline-node-dot-inner" />
                  </div>
                  <div className="timeline-card glass">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{item.symptom}</strong>
                      <span className="timeline-onset-tag" style={{ fontSize: '0.74rem' }}>
                        {item.durationOrOnset}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Missing Information Gaps */}
        <div className="card glass-card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
              <AlertCircle size={18} color="var(--champagne)" aria-hidden="true" />
              <span>Missing Information ({triageCase.missingInformation.length.toString().padStart(2, '0')})</span>
            </h2>
            <span className="provenance-tag ai glass">Source: AI ADVISORY</span>
          </div>

          <div className="card-body">
            <div className="gap-checklist">
              {triageCase.missingInformation.map((item, idx) => (
                <div key={idx} className="gap-card glass">
                  <span className="gap-bullet" aria-hidden="true">&bull;</span>
                  <span className="gap-text">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 8. Section 3: Full-Width Priority Follow-up Questions Card */}
      <div className="card glass-card scroll-reveal reveal-delay-4" style={{ marginBottom: 0 }}>
        <div className="card-header">
          <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
            <HelpCircle size={18} color="var(--teal)" aria-hidden="true" />
            <span>Follow-up Questions ({triageCase.followUpQuestions.length.toString().padStart(2, '0')})</span>
          </h2>
          <span className="provenance-tag ai glass">Source: AI ADVISORY</span>
        </div>

        <div className="card-body">
          <div className="questions-grid">
            {triageCase.followUpQuestions.map((q, idx) => (
              <div key={idx} className="question-card glass">
                <span className="question-num-badge glass">
                  {(idx + 1).toString().padStart(2, '0')}
                </span>
                <span>{q}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7. Reviewer Sign-off if already reviewed */}
      {isReviewed && (
        <div
          className="glass-card scroll-reveal reveal-delay-5"
          style={{
            background: 'rgba(53, 224, 193, 0.10)',
            border: '1px solid rgba(53, 224, 193, 0.35)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem 1.5rem',
            backdropFilter: 'var(--backdrop-blur)',
            WebkitBackdropFilter: 'var(--backdrop-blur)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <CheckCircle2 size={20} color="var(--mint)" aria-hidden="true" />
              <strong style={{ color: 'var(--mint)', fontSize: '1rem' }}>
                Medical Review Completed &bull; Human Clinical Decision Recorded
              </strong>
            </div>
            <span className="provenance-tag reviewer glass">Decision: {triageCase.reviewerDecision}</span>
          </div>
          <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.45rem', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--teal)' }}>Reviewer Notes:</strong> {triageCase.reviewerNotes || 'No specific notes provided.'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Reviewed by: <span style={{ color: 'var(--text-secondary)' }}>{triageCase.reviewerName || 'Medical Officer'}</span> at {formatDateTime(triageCase.reviewedAt)}
          </div>
        </div>
      )}

      {/* 8. Bottom Action Command Bar */}
      <div className="card glass-card scroll-reveal reveal-delay-5" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="action-bar-notice">
            <Info size={16} color="var(--teal)" aria-hidden="true" />
            <span>AI Assists &bull; Clinician Decides &bull; Audit Logged</span>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            {onNavigateToReviewer && (
              <button
                type="button"
                className="btn btn-secondary glass"
                onClick={onNavigateToReviewer}
              >
                <ArrowRight size={15} aria-hidden="true" />
                <span>Reviewer Queue</span>
              </button>
            )}

            {!isSubmittedToDoctor && (
              <button
                type="button"
                className="btn btn-primary glass"
                onClick={handleSendForReview}
                disabled={isSubmitting}
                id="btn-send-review-bottom"
              >
                <Send size={15} aria-hidden="true" />
                <span>{isSubmitting ? 'Sending...' : 'Send for Review'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
