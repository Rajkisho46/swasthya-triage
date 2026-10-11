import React, { useState, useEffect } from 'react';
import type { TriageCase } from '../../types/triage';
import { NurseQueueView } from '../../components/NurseQueue/NurseQueueView';
import { BedsideIntakeView } from '../../components/NurseBedside/BedsideIntakeView';
import { TriageNoteView } from '../../components/TriageSummary/TriageNoteView';
import { HeartPulse, Stethoscope, FileText, ShieldAlert } from 'lucide-react';

interface NursePortalProps {
  cases: TriageCase[];
  activeCase: TriageCase | null;
  onUpdateCase: (updatedCase: TriageCase) => void;
  onCaseCreated?: (newCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
  onSendForReview: (updatedCase: TriageCase) => void;
  intakeResetKey?: number;
  portalResetKey?: number;
}

export const NursePortal: React.FC<NursePortalProps> = ({
  cases,
  activeCase,
  onUpdateCase,
  onCaseCreated: _onCaseCreated,
  onViewSummary,
  onSendForReview,
  intakeResetKey: _intakeResetKey,
  portalResetKey,
}) => {
  const [nurseTab, setNurseTab] = useState<'queue' | 'intake' | 'summary'>('queue');
  const [selectedCase, setSelectedCase] = useState<TriageCase | null>(activeCase);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  // Reset portal state whenever portal-specific reset is triggered
  useEffect(() => {
    if (portalResetKey !== undefined && portalResetKey > 0) {
      setNurseTab('queue');
      setSelectedCase(null);
      setPermissionNotice(null);
    }
  }, [portalResetKey]);

  const handleView = (c: TriageCase) => {
    setSelectedCase(c);
    onViewSummary(c);
    setNurseTab('summary');
  };

  const handleStartTriage = (c: TriageCase) => {
    setSelectedCase(c);
    setNurseTab('intake');
  };

  const handleUpdate = (updatedCase: TriageCase) => {
    onUpdateCase(updatedCase);
    setSelectedCase(updatedCase);
  };

  const handleSendToReview = (updatedCase: TriageCase) => {
    onSendForReview(updatedCase);
    setSelectedCase(updatedCase);
    setNurseTab('queue');
  };

  // Nursing queue pending count reflects cases awaiting nurse triage action
  const pendingNursingCases = cases.filter(
    (c) => c.reviewStatus === 'awaiting_nursing_triage'
  );
  const pendingCount = pendingNursingCases.length;

  // Selected case is decoupled from awaiting_nursing_triage so nurses can inspect evidence
  // and manage bedside vitals for any accessible patient case
  const targetCase = selectedCase || activeCase || (pendingNursingCases.length > 0 ? pendingNursingCases[0] : (cases.length > 0 ? cases[0] : null));

  return (
    <div className="portal-container nurse-portal-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Permission Notice Banner */}
      {permissionNotice && (
        <div
          className="glass-card"
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(248, 113, 113, 0.4)',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            color: 'var(--text-primary)',
          }}
          role="alert"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ShieldAlert size={18} color="var(--urgency-light)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{permissionNotice}</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary glass"
            onClick={() => setPermissionNotice(null)}
            style={{ fontSize: '0.74rem', padding: '0.25rem 0.60rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary Navigation Sections */}
      <div
        className="glass scroll-reveal"
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.4rem 0.6rem',
          borderRadius: '12px',
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
          01 Triage Queue {pendingCount > 0 ? `(${pendingCount})` : ''}
        </button>

        <button
          type="button"
          className={`nav-btn glass ${nurseTab === 'intake' ? 'active' : ''}`}
          onClick={() => setNurseTab('intake')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-nurse-intake"
        >
          <Stethoscope size={14} color="var(--teal)" style={{ marginRight: '4px' }} />
          02 Bedside Vitals {targetCase ? `(${targetCase.caseId})` : ''}
        </button>

        <button
          type="button"
          className={`nav-btn glass ${nurseTab === 'summary' ? 'active' : ''}`}
          onClick={() => setNurseTab('summary')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-nurse-summary"
        >
          <FileText size={14} color="var(--champagne)" style={{ marginRight: '4px' }} />
          03 Evidence Note {targetCase ? `(${targetCase.caseId})` : ''}
        </button>
      </div>

      {/* 01 — NURSING TRIAGE QUEUE */}
      {nurseTab === 'queue' && (
        <NurseQueueView
          key={`nurse_queue_${portalResetKey || 0}`}
          cases={cases}
          onUpdateCase={handleUpdate}
          onViewSummary={handleView}
          onStartTriage={handleStartTriage}
        />
      )}

      {/* 02 — BEDSIDE INTAKE */}
      {nurseTab === 'intake' && (
        <div className="nurse-bedside-intake-container">
          <BedsideIntakeView
            key={`nurse_bedside_${portalResetKey || 0}_${targetCase?.caseId || 'none'}`}
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
                  id="btn-return-nurse-queue"
                >
                  &larr; Return to Nursing Queue
                </button>
              </div>

              <TriageNoteView
                triageCase={targetCase}
                onSendForReview={(updated) => {
                  handleSendToReview(updated);
                }}
                onNavigateToReviewer={() => {
                  setPermissionNotice('Access Restricted: Medical Reviewer Queue requires Physician (Doctor) role. Nurses manage cases in the Nursing Queue.');
                  setTimeout(() => setPermissionNotice(null), 8000);
                }}
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
                NO ACTIVE EVIDENCE NOTE
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '520px', margin: 0 }}>
                No active patient case selected. Please select a case from the Nursing Queue to inspect the clinical evidence note.
              </p>
              <button
                type="button"
                className="btn btn-secondary glass"
                onClick={() => setNurseTab('queue')}
                style={{ fontSize: '0.84rem', padding: '0.45rem 1rem' }}
                id="btn-return-nurse-queue-empty"
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

