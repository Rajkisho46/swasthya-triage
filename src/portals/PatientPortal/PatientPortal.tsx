import React, { useState } from 'react';
import type { TriageCase } from '../../types/triage';
import { PatientPortalView } from '../../components/PatientPortal/PatientPortalView';
import { PatientIntakeForm } from '../../components/PatientIntake/PatientIntakeForm';
import { TriageNoteView } from '../../components/TriageSummary/TriageNoteView';
import { useAuth } from '../../context/AuthContext';
import { Home, PlusCircle, FolderHeart, FileText, CheckCircle2, Clock } from 'lucide-react';

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
  const [patientTab, setPatientTab] = useState<'home' | 'submit' | 'cases' | 'summary'>('home');
  const [selectedCaseForSummary, setSelectedCaseForSummary] = useState<TriageCase | null>(activeCase);
  const { currentUser } = useAuth();

  const handleStartIntake = () => {
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
      {/* Patient Specific Navigation */}
      <div
        className="glass"
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.4rem 0.6rem',
          borderRadius: '10px',
          width: 'fit-content',
          flexWrap: 'wrap',
        }}
        role="navigation"
        aria-label="Patient Portal Navigation"
      >
        <button
          type="button"
          className={`nav-btn glass ${patientTab === 'home' ? 'active' : ''}`}
          onClick={() => setPatientTab('home')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-patient-home"
        >
          <Home size={14} color="#60a5fa" style={{ marginRight: '4px' }} />
          01 Patient Home
        </button>

        <button
          type="button"
          className={`nav-btn glass ${patientTab === 'submit' ? 'active' : ''}`}
          onClick={() => setPatientTab('submit')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-patient-submit"
        >
          <PlusCircle size={14} color="var(--mint)" style={{ marginRight: '4px' }} />
          02 Submit Symptoms
        </button>

        <button
          type="button"
          className={`nav-btn glass ${patientTab === 'cases' ? 'active' : ''}`}
          onClick={() => setPatientTab('cases')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-patient-cases"
        >
          <FolderHeart size={14} color="var(--champagne)" style={{ marginRight: '4px' }} />
          03 My Cases ({patientCases.length})
        </button>

        {targetCase && (
          <button
            type="button"
            className={`nav-btn glass ${patientTab === 'summary' ? 'active' : ''}`}
            onClick={() => setPatientTab('summary')}
            style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
            id="btn-nav-patient-summary"
          >
            <FileText size={14} color="var(--teal)" style={{ marginRight: '4px' }} />
            04 Case Summary ({targetCase.caseId})
          </button>
        )}
      </div>

      {/* 01 — PATIENT HOME */}
      {patientTab === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <PatientPortalView
            cases={patientCases}
            onStartNewIntake={handleStartIntake}
            onViewSummary={handleView}
          />
        </div>
      )}

      {/* 02 — SUBMIT SYMPTOMS */}
      {patientTab === 'submit' && (
        <div className="patient-submit-symptoms-container">
          <PatientIntakeForm
            key={intakeResetKey}
            defaultPatientId={currentUser?.userId || currentUser?.username}
            onCaseCreated={handleCreated}
          />
        </div>
      )}

      {/* 03 — MY CASES */}
      {patientTab === 'cases' && (
        <div className="glass-card" style={{ padding: '1.75rem', borderRadius: '14px' }}>
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
              <span style={{ fontSize: '0.80rem' }}>Click "Submit New Symptoms" above to submit your information.</span>
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
                      borderRadius: '10px',
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

      {/* 04 — CASE SUMMARY */}
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
