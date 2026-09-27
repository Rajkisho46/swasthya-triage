import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Search,
  FileCheck2,
  AlertOctagon,
  Users,
  HeartPulse,
} from 'lucide-react';
import type { TriageCase } from '../../types/triage';
import { formatDateTime } from '../../utils/caseId';
import { recordAuditEvent } from '../../utils/audit';
import { SafetyBanner } from '../SafetyDisclaimer/SafetyBanner';
import { CaseJourney } from '../Layout/CaseJourney';
import { CaseReviewModal } from '../MedicalReviewer/CaseReviewModal';

interface NurseQueueProps {
  cases: TriageCase[];
  onUpdateCase: (updatedCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
  onNavigateToIntake?: () => void;
}

export const NurseQueueView: React.FC<NurseQueueProps> = ({
  cases,
  onUpdateCase,
  onViewSummary,
  onNavigateToIntake,
}) => {
  const [selectedCaseForModal, setSelectedCaseForModal] = useState<TriageCase | null>(null);
  const [statusFilter, setStatusFilter] = useState<'awaiting_nursing_triage' | 'all'>('awaiting_nursing_triage');
  const [urgencyOnlyFilter, setUrgencyOnlyFilter] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleOpenReviewModal = (triageCase: TriageCase) => {
    recordAuditEvent(
      triageCase.caseId,
      'Medical Reviewer',
      'Triage Nurse initiated preliminary case review',
      `Nurse opened case ${triageCase.caseId} in clinical queue`
    );
    setSelectedCaseForModal(triageCase);
  };

  const handleConfirmReview = (updatedCase: TriageCase) => {
    onUpdateCase(updatedCase);
    setSelectedCaseForModal(null);
  };

  // Filtering
  const filteredCases = cases.filter((c) => {
    if (statusFilter !== 'all' && c.reviewStatus !== statusFilter) return false;
    if (urgencyOnlyFilter && (!c.urgencySignals || c.urgencySignals.length === 0)) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchId = c.caseId.toLowerCase().includes(term);
      const matchPatient = c.patientId.toLowerCase().includes(term);
      const matchSymptoms = c.rawSymptoms.toLowerCase().includes(term);
      const matchExtracted = c.extractedSymptoms.some((s) => s.toLowerCase().includes(term));
      if (!matchId && !matchPatient && !matchSymptoms && !matchExtracted) return false;
    }
    return true;
  });

  const pendingCount = cases.filter((c) => c.reviewStatus === 'awaiting_nursing_triage').length;
  const highUrgencyCount = cases.filter(
    (c) => c.urgencySignals && c.urgencySignals.length > 0 && c.reviewStatus === 'awaiting_nursing_triage'
  ).length;

  return (
    <div className="nurse-queue-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Safety Banner */}
      <SafetyBanner />

      {/* 2. Global Journey Bar */}
      <CaseJourney currentStep="reviewer" compact />

      {/* 3. Header Command Panel */}
      <div className="triage-case-header-bar glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="intake-step-badge" style={{ borderColor: 'var(--mint)', color: 'var(--mint)' }}>
              NURSING TRIAGE & VITALS COMMAND
            </div>
            <h1 className="intake-title" style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <HeartPulse size={24} color="var(--mint)" />
              <span>Nursing Clinical Queue</span>
            </h1>
            <p className="intake-subtitle">
              Prioritize patient urgency, verify bedside vitals & prepare clinical notes for Doctor sign-off
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div className="intake-status-pill glass" style={{ borderColor: 'rgba(53, 224, 193, 0.35)' }}>
              <Users size={14} color="var(--mint)" />
              <span>{pendingCount} Awaiting Triage</span>
            </div>
            {highUrgencyCount > 0 && (
              <div className="intake-status-pill glass" style={{ borderColor: 'rgba(248, 113, 113, 0.4)', background: 'rgba(239, 68, 68, 0.12)' }}>
                <AlertOctagon size={14} color="var(--urgency-light)" />
                <span style={{ color: 'var(--urgency-light)', fontWeight: 700 }}>
                  {highUrgencyCount} High Urgency
                </span>
              </div>
            )}
            {onNavigateToIntake && (
              <button
                type="button"
                onClick={onNavigateToIntake}
                className="btn btn-secondary glass"
                style={{ fontSize: '0.80rem', padding: '0.45rem 0.85rem' }}
              >
                + New Patient Intake
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div
          style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div className="search-box glass" style={{ minWidth: 'min(100%, 220px)', flex: '1 1 auto' }}>
              <Search size={14} color="var(--text-muted)" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by Case, Patient, or Symptom..."
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', width: '100%' }}
              />
            </div>

            <button
              type="button"
              className={`filter-btn glass ${statusFilter === 'awaiting_nursing_triage' ? 'active' : ''}`}
              onClick={() => setStatusFilter('awaiting_nursing_triage')}
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
            >
              Awaiting Triage ({pendingCount})
            </button>
            <button
              type="button"
              className={`filter-btn glass ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
            >
              All Cases ({cases.length})
            </button>
          </div>

          <button
            type="button"
            className={`filter-btn glass ${urgencyOnlyFilter ? 'active' : ''}`}
            onClick={() => setUrgencyOnlyFilter(!urgencyOnlyFilter)}
            style={{
              fontSize: '0.78rem',
              padding: '0.4rem 0.75rem',
              borderColor: urgencyOnlyFilter ? 'var(--urgency-light)' : undefined,
              color: urgencyOnlyFilter ? 'var(--urgency-light)' : undefined,
            }}
          >
            <AlertOctagon size={13} style={{ display: 'inline', marginRight: '4px' }} />
            Urgency Signals Only
          </button>
        </div>
      </div>

      {/* Queue Case List */}
      <div className="reviewer-case-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {filteredCases.length === 0 ? (
          <div className="glass-card" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <HeartPulse size={36} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5, color: 'var(--mint)' }} />
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
              NO CASES AWAITING NURSING TRIAGE
            </p>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.35rem' }}>
              New patient cases submitted via Patient Intake will appear here for bedside assessment.
            </span>
          </div>
        ) : (
          filteredCases.map((c) => {
            const isReviewed = c.reviewStatus === 'reviewed';
            const hasUrgency = Boolean(c.urgencySignals && c.urgencySignals.length > 0);

            return (
              <div
                key={c.caseId}
                className="case-queue-item glass-card"
                style={{
                  padding: '1.25rem',
                  borderRadius: '12px',
                  border: hasUrgency
                    ? '1px solid rgba(248, 113, 113, 0.4)'
                    : isReviewed
                    ? '1px solid rgba(53, 224, 193, 0.25)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                        {c.caseId}
                      </span>
                      <span className="badge badge-champagne glass" style={{ fontSize: '0.70rem' }}>
                        Ref: {c.patientId}
                      </span>
                      {hasUrgency && (
                        <span className="badge glass" style={{ fontSize: '0.68rem', color: 'var(--urgency-light)', borderColor: 'rgba(248, 113, 113, 0.4)', background: 'rgba(239, 68, 68, 0.12)' }}>
                          <AlertOctagon size={11} style={{ display: 'inline', marginRight: '3px' }} />
                          {c.urgencySignals.length} Urgency Signal(s)
                        </span>
                      )}
                      {isReviewed && (
                        <span className="badge badge-teal glass" style={{ fontSize: '0.68rem' }}>
                          <CheckCircle2 size={11} style={{ display: 'inline', marginRight: '3px' }} />
                          Reviewed: {c.reviewerDecision}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Age: {c.age ? `${c.age} Yrs` : 'Unspecified'} &bull; Gender: {c.gender || 'Unspecified'} &bull; Created: {formatDateTime(c.createdAt)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary glass"
                      onClick={() => onViewSummary(c)}
                      style={{ fontSize: '0.80rem', padding: '0.45rem 0.85rem' }}
                    >
                      <Eye size={14} />
                      <span>View Note</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary glass"
                      onClick={() => handleOpenReviewModal(c)}
                      style={{ fontSize: '0.80rem', padding: '0.45rem 0.85rem' }}
                    >
                      <FileCheck2 size={14} />
                      <span>{isReviewed ? 'Re-Evaluate Vitals' : 'Process Nursing Triage'}</span>
                    </button>
                  </div>
                </div>

                {/* Extracted Symptoms Tags */}
                <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {c.extractedSymptoms.map((s, idx) => (
                    <span key={idx} className="badge badge-teal glass" style={{ fontSize: '0.70rem' }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Case Review Modal for Nursing Sign-Off / Vitals Review */}
      {selectedCaseForModal && (
        <CaseReviewModal
          triageCase={selectedCaseForModal}
          onClose={() => setSelectedCaseForModal(null)}
          onConfirmReview={handleConfirmReview}
        />
      )}
    </div>
  );
};
