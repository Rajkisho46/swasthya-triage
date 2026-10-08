import React, { useState } from 'react';
import type { TriageCase } from '../../types/triage';
import { PatientPortalView } from '../../components/PatientPortal/PatientPortalView';
import { PatientIntakeForm } from '../../components/PatientIntake/PatientIntakeForm';
import { TriageNoteView } from '../../components/TriageSummary/TriageNoteView';
import { PatientAIPage } from '../../components/PatientAI/PatientAIPage';
import type { PatientAIHandoffData } from '../../components/PatientAI/PatientAIPage';
import { useAuth } from '../../context/AuthContext';
import { Home, Bot, PlusCircle, FolderHeart, FileText, CheckCircle2, Clock } from 'lucide-react';

interface PatientPortalProps {
  cases: TriageCase[];
  activeCase: TriageCase | null;
  onCaseCreated: (newCase: TriageCase) => void;
  onSendForReview: (updatedCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
  intakeResetKey: number;
}

export const PatientPortal: React.FC<PatientPortalProps> = ({
  cases,
  activeCase,
  onCaseCreated,
  onSendForReview,
  onViewSummary,
  intakeResetKey,
}) => {
  const [patientTab, setPatientTab] = useState<'home' | 'ai' | 'submit' | 'cases' | 'summary'>('home');
  const [selectedCaseForSummary, setSelectedCaseForSummary] = useState<TriageCase | null>(activeCase);
  const [aiHandoffData, setAiHandoffData] = useState<PatientAIHandoffData | null>(null);
  const { currentUser } = useAuth();

  const handleStartIntake = () => {
    setAiHandoffData(null);
    setPatientTab('submit');
  };

  const handleHandoffToIntake = (data: PatientAIHandoffData) => {
    setAiHandoffData(data);
    setPatientTab('submit');
  };

  const handleCreated = (newCase: TriageCase) => {
    onCaseCreated(newCase);
    setSelectedCaseForSummary(newCase);
    setPatientTab('summary');
  };

  const handleView = (c: TriageCase) => {
    setSelectedCaseForSummary(c);
    onViewSummary(c);
    setPatientTab('summary');
  };

  // Filter cases belonging strictly to the current patient
  const patientCases = cases.filter((c) => {
    if (!currentUser) return false;
    return (
      c.patientId === currentUser.userId ||
      c.patientId === currentUser.username
    );
  });

  const targetCase = selectedCaseForSummary || (activeCase && (activeCase.patientId === currentUser?.userId || activeCase.patientId === currentUser?.username) ? activeCase : null);

  return (
    <div className="portal-container patient-portal-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Patient Specific Segmented Navigation Control */}
      <nav
        className="patient-nav-dock glass scroll-reveal"
        role="navigation"
        aria-label="Patient Portal Navigation"
      >
        <button
          type="button"
          className={`patient-nav-btn ${patientTab === 'home' ? 'active' : ''}`}
          onClick={() => setPatientTab('home')}
          id="btn-nav-patient-home"
          aria-current={patientTab === 'home' ? 'page' : undefined}
        >
          <Home size={15} aria-hidden="true" />
          <span>01 Home</span>
        </button>

        <button
          type="button"
          className={`patient-nav-btn ${patientTab === 'ai' ? 'active' : ''}`}
          onClick={() => setPatientTab('ai')}
          id="btn-nav-patient-ai"
          aria-current={patientTab === 'ai' ? 'page' : undefined}
        >
          <Bot size={15} aria-hidden="true" />
          <span>02 Health AI</span>
        </button>

        <button
          type="button"
          className={`patient-nav-btn ${patientTab === 'submit' ? 'active' : ''}`}
          onClick={() => setPatientTab('submit')}
          id="btn-nav-patient-submit"
          aria-current={patientTab === 'submit' ? 'page' : undefined}
        >
          <PlusCircle size={15} aria-hidden="true" />
          <span>03 Intake</span>
        </button>

        <button
          type="button"
          className={`patient-nav-btn ${patientTab === 'cases' ? 'active' : ''}`}
          onClick={() => setPatientTab('cases')}
          id="btn-nav-patient-cases"
          aria-current={patientTab === 'cases' ? 'page' : undefined}
        >
          <FolderHeart size={15} aria-hidden="true" />
          <span>04 Cases ({patientCases.length})</span>
        </button>

        {targetCase && (
          <button
            type="button"
            className={`patient-nav-btn ${patientTab === 'summary' ? 'active' : ''}`}
            onClick={() => setPatientTab('summary')}
            id="btn-nav-patient-summary"
            aria-current={patientTab === 'summary' ? 'page' : undefined}
          >
            <FileText size={15} aria-hidden="true" />
            <span>05 Summary</span>
          </button>
        )}
      </nav>

      {/* 01 — PATIENT HOME */}
      {patientTab === 'home' && (
        <div className="patient-home-stage">
          <PatientPortalView
            cases={patientCases}
            onStartNewIntake={handleStartIntake}
            onViewSummary={handleView}
          />
        </div>
      )}

      {/* 02 — HEALTH AI (DEDICATED HEALTHCARE WORKSPACE) */}
      {patientTab === 'ai' && (
        <div className="patient-health-ai-stage">
          <PatientAIPage
            onHandoffToIntake={handleHandoffToIntake}
            onNavigateToCases={() => setPatientTab('cases')}
            preferredLanguage={aiHandoffData?.preferredLanguage || 'English'}
          />
        </div>
      )}

      {/* 03 — SUBMIT SYMPTOMS */}
      {patientTab === 'submit' && (
        <div className="patient-submit-symptoms-container">
          <PatientIntakeForm
            key={`${intakeResetKey}_${aiHandoffData?.symptoms ? 'prefilled' : 'clean'}`}
            defaultPatientId={currentUser?.userId || currentUser?.username}
            initialSymptoms={aiHandoffData?.symptoms || ''}
            initialLanguage={aiHandoffData?.preferredLanguage || 'English'}
            onCaseCreated={handleCreated}
          />
        </div>
      )}

      {/* 04 — MY CASES */}
      {patientTab === 'cases' && (
        <div className="glass-card" style={{ padding: '1.75rem', borderRadius: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div className="badge glass" style={{ color: '#60a5fa', borderColor: '#60a5fa', fontSize: '0.72rem', marginBottom: '0.35rem' }}>
                PATIENT RECORDS
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                My Clinical Triage Cases
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-primary glass"
              onClick={handleStartIntake}
              style={{ fontSize: '0.82rem', padding: '0.45rem 0.95rem' }}
            >
              + Submit New Symptoms
            </button>
          </div>

          {patientCases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>No clinical cases recorded under your profile.</p>
              <span style={{ fontSize: '0.80rem' }}>Click &ldquo;Submit New Symptoms&rdquo; above to submit your information.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {patientCases.map((c) => {
                const isReviewed = c.reviewStatus === 'reviewed';
                const hasUrgency = Boolean(c.urgencySignals && c.urgencySignals.length > 0);

                return (
                  <div
                    key={c.caseId}
                    className="glass-card"
                    style={{
                      padding: '1.1rem 1.25rem',
                      borderRadius: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      border: isReviewed
                        ? '1px solid rgba(53, 224, 193, 0.3)'
                        : hasUrgency
                        ? '1px solid rgba(248, 113, 113, 0.35)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {c.caseId}
                        </span>
                        {isReviewed ? (
                          <span className="badge badge-teal glass" style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <CheckCircle2 size={12} />
                            Reviewed &bull; {c.reviewerDecision || 'Confirmed'}
                          </span>
                        ) : (
                          <span className="badge glass" style={{ fontSize: '0.68rem', color: 'var(--champagne)', borderColor: 'var(--champagne)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Clock size={12} />
                            Awaiting Clinical Review
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                        {c.rawSymptoms || (c.extractedSymptoms && c.extractedSymptoms.join(', ')) || 'Multimodal submission'}
                      </p>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Submitted: {new Date(c.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleView(c)}
                      className="btn btn-secondary glass"
                      style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
                    >
                      View Case Summary &rarr;
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 05 — CASE SUMMARY */}
      {patientTab === 'summary' && targetCase && (
        <div className="patient-case-summary-container">
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              padding: '0.75rem 1.25rem',
            }}
          >
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Summary for Case: <strong style={{ color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>{targetCase.caseId}</strong>
            </span>
            <button
              type="button"
              className="btn btn-secondary glass"
              onClick={() => setPatientTab('cases')}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
            >
              &larr; Back to My Cases
            </button>
          </div>

          <TriageNoteView
            triageCase={targetCase}
            onSendForReview={(updated) => {
              onSendForReview(updated);
              setPatientTab('cases');
            }}
          />
        </div>
      )}
    </div>
  );
};

