import React, { useState } from 'react';
import type { TriageCase } from '../../types/triage';
import { ReviewerDashboard } from '../../components/MedicalReviewer/ReviewerDashboard';
import { TriageNoteView } from '../../components/TriageSummary/TriageNoteView';
import { AuditLogView } from '../../components/AuditLog/AuditLogView';
import { ShieldAlert, FileText, ClipboardList, ShieldCheck } from 'lucide-react';

interface MedicalReviewerPortalProps {
  cases: TriageCase[];
  activeCase: TriageCase | null;
  onUpdateCase: (updatedCase: TriageCase) => void;
  onDeleteCase?: (caseId: string) => void;
  onCaseCreated?: (newCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
  onSendForReview?: (updatedCase: TriageCase) => void;
  intakeResetKey?: number;
}

export const MedicalReviewerPortal: React.FC<MedicalReviewerPortalProps> = ({
  cases,
  activeCase,
  onUpdateCase,
  onDeleteCase,
  onViewSummary,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'review_note' | 'audit'>('queue');
  const [selectedCaseForNote, setSelectedCaseForNote] = useState<TriageCase | null>(activeCase);

  const handleViewNote = (triageCase: TriageCase) => {
    setSelectedCaseForNote(triageCase);
    onViewSummary(triageCase);
    setActiveTab('review_note');
  };

  const handleUpdateAndReturn = (updatedCase: TriageCase) => {
    onUpdateCase(updatedCase);
    if (selectedCaseForNote?.caseId === updatedCase.caseId) {
      setSelectedCaseForNote(updatedCase);
    }
  };

  // Only cases submitted to medical review (awaiting_review or reviewed) are visible
  const submittedCases = cases.filter(
    (c) => c.reviewStatus === 'awaiting_review' || c.reviewStatus === 'reviewed'
  );
  const pendingCount = submittedCases.filter((c) => c.reviewStatus === 'awaiting_review').length;

  return (
    <div className="portal-container medical-reviewer-portal-wrapper">
      {/* Reviewer Specific Liquid Glass Navigation Bar */}
      <div
        className="glass scroll-reveal"
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.4rem 0.6rem',
          borderRadius: '12px',
          marginBottom: '1.25rem',
          width: 'fit-content',
          flexWrap: 'wrap',
        }}
        role="navigation"
        aria-label="Medical Reviewer Portal Navigation"
      >
        <button
          type="button"
          className={`nav-btn glass ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-reviewer-queue"
        >
          <ShieldAlert size={14} color="var(--teal)" style={{ marginRight: '4px' }} />
          01 Queue {pendingCount > 0 ? `(${pendingCount})` : ''}
        </button>

        <button
          type="button"
          className={`nav-btn glass ${activeTab === 'review_note' ? 'active' : ''}`}
          onClick={() => setActiveTab('review_note')}
          disabled={!selectedCaseForNote && !activeCase}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-clinical-review"
          title={!selectedCaseForNote && !activeCase ? 'Select a case from the Review Queue first' : 'Inspect clinical evidence and note'}
        >
          <ClipboardList size={14} color="var(--mint)" style={{ marginRight: '4px' }} />
          02 Review Note
        </button>

        <button
          type="button"
          className={`nav-btn glass ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-audit-trail"
        >
          <FileText size={14} color="var(--seafoam)" style={{ marginRight: '4px' }} />
          03 Audit Log
        </button>
      </div>

      {/* 1. Review Queue Workspace */}
      {activeTab === 'queue' && (
        <ReviewerDashboard
          cases={submittedCases}
          onUpdateCase={handleUpdateAndReturn}
          onViewSummary={handleViewNote}
          onDeleteCase={onDeleteCase}
        />
      )}

      {/* 2. Clinical Review Note Workspace */}
      {activeTab === 'review_note' && (selectedCaseForNote || activeCase) && (
        <div className="clinical-review-note-container">
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldCheck size={18} color="var(--mint)" />
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Evidence Note: <strong style={{ color: 'var(--mint)', fontFamily: 'var(--font-mono)' }}>{(selectedCaseForNote || activeCase)?.caseId}</strong>
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secondary glass"
              onClick={() => setActiveTab('queue')}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
            >
              &larr; Back to Queue
            </button>
          </div>

          <TriageNoteView
            triageCase={(selectedCaseForNote || activeCase)!}
            onSendForReview={handleUpdateAndReturn}
            onNavigateToReviewer={() => setActiveTab('queue')}
          />
        </div>
      )}

      {/* 3. Provenance Audit Trail Workspace */}
      {activeTab === 'audit' && (
        <div className="reviewer-audit-container">
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <FileText size={18} color="var(--teal)" />
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Clinical Review & Provenance Audit Trail
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secondary glass"
              onClick={() => setActiveTab('queue')}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
            >
              &larr; Return to Review Queue
            </button>
          </div>
          <AuditLogView />
        </div>
      )}
    </div>
  );
};
