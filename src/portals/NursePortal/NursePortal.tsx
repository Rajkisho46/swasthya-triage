import React, { useState } from 'react';
import type { TriageCase } from '../../types/triage';
import { NurseQueueView } from '../../components/NurseQueue/NurseQueueView';
import { BedsideIntakeView } from '../../components/NurseBedside/BedsideIntakeView';
import { TriageNoteView } from '../../components/TriageSummary/TriageNoteView';
import { HeartPulse, Stethoscope, FileText } from 'lucide-react';

interface NursePortalProps {
  cases: TriageCase[];
  activeCase: TriageCase | null;
  onUpdateCase: (updatedCase: TriageCase) => void;
  onCaseCreated: (newCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
  onSendForReview: (updatedCase: TriageCase) => void;
  intakeResetKey: number;
}

export const NursePortal: React.FC<NursePortalProps> = ({
  cases,
  activeCase,
  onUpdateCase,
  onCaseCreated: _onCaseCreated,
  onViewSummary,
  onSendForReview,
  intakeResetKey: _intakeResetKey,
}) => {
  const [nurseTab, setNurseTab] = useState<'queue' | 'intake' | 'summary'>('queue');
  const [selectedCaseForNote, setSelectedCaseForNote] = useState<TriageCase | null>(activeCase);

  const handleView = (c: TriageCase) => {
    setSelectedCaseForNote(c);
    onViewSummary(c);
    setNurseTab('summary');
  };

  const handleUpdate = (updatedCase: TriageCase) => {
    onUpdateCase(updatedCase);
    setSelectedCaseForNote(updatedCase);
  };

  const handleSendToReview = (updatedCase: TriageCase) => {
    onSendForReview(updatedCase);
    setSelectedCaseForNote(null);
    setNurseTab('queue');
  };

  // Nursing queue pending count reflects cases awaiting nurse triage action
  const pendingNursingCases = cases.filter(
    (c) => c.reviewStatus === 'awaiting_nursing_triage'
  );
  const pendingCount = pendingNursingCases.length;
  const targetCase = (selectedCaseForNote && selectedCaseForNote.reviewStatus === 'awaiting_nursing_triage')
    ? selectedCaseForNote
    : ((activeCase && activeCase.reviewStatus === 'awaiting_nursing_triage') ? activeCase : null);

  return (
    <div className="portal-container nurse-portal-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 3 Primary Navigation Sections */}
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
        aria-label="Nursing Clinical Navigation"
      >
        <button
          type="button"
          className={`nav-btn glass ${nurseTab === 'queue' ? 'active' : ''}`}
          onClick={() => setNurseTab('queue')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-nurse-queue"
        >
          <HeartPulse size={14} color="var(--mint)" style={{ marginRight: '4px' }} />
          01 Nursing Triage Queue {pendingCount > 0 ? `(${pendingCount})` : ''}
        </button>

        <button
          type="button"
          className={`nav-btn glass ${nurseTab === 'intake' ? 'active' : ''}`}
          onClick={() => setNurseTab('intake')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-nurse-intake"
        >
          <Stethoscope size={14} color="var(--teal)" style={{ marginRight: '4px' }} />
          02 Bedside Intake
        </button>

        {targetCase && (
          <button
            type="button"
            className={`nav-btn glass ${nurseTab === 'summary' ? 'active' : ''}`}
            onClick={() => setNurseTab('summary')}
            style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
            id="btn-nav-nurse-summary"
          >
            <FileText size={14} color="var(--champagne)" style={{ marginRight: '4px' }} />
            03 Triage Evidence Note ({targetCase.caseId})
          </button>
        )}
      </div>

      {/* 01 — NURSING TRIAGE QUEUE */}
      {nurseTab === 'queue' && (
        <NurseQueueView
          cases={cases}
          onUpdateCase={handleUpdate}
          onViewSummary={handleView}
          onNavigateToIntake={() => setNurseTab('intake')}
        />
      )}

      {/* 02 — BEDSIDE INTAKE */}
      {nurseTab === 'intake' && (
        <div className="nurse-bedside-intake-container">
          <BedsideIntakeView
            cases={cases}
            activeCase={targetCase}
            onUpdateCase={handleUpdate}
            onSendForReview={handleSendToReview}
            onViewSummary={handleView}
          />
        </div>
      )}

      {/* 03 — TRIAGE EVIDENCE NOTE */}
      {nurseTab === 'summary' && (
        <div className="nurse-triage-summary-container">
          {targetCase ? (
            <>
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
                  Nursing Triage Summary for Case: <strong style={{ color: 'var(--mint)', fontFamily: 'var(--font-mono)' }}>{targetCase.caseId}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-secondary glass"
                  onClick={() => setNurseTab('queue')}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                >
                  &larr; Return to Nursing Queue
                </button>
              </div>

              <TriageNoteView
                triageCase={targetCase}
                onSendForReview={(updated) => {
                  handleSendToReview(updated);
                }}
                onNavigateToReviewer={() => setNurseTab('queue')}
              />
            </>
          ) : (
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
                <HeartPulse size={32} />
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                NO ACTIVE EVIDENCE NOTE PENDING NURSE ACTION
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '520px', margin: 0 }}>
                Evidence note for completed patient cases has been submitted and forwarded to the Doctor / Medical Reviewer Clinical Review Queue.
              </p>
              <button
                type="button"
                className="btn btn-primary glass"
                onClick={() => setNurseTab('queue')}
                style={{ fontSize: '0.84rem', padding: '0.45rem 1rem' }}
              >
                Return to Nursing Queue
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
