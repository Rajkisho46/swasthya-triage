import React, { useState } from 'react';
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  Filter,
  Eye,
  Search,
  ExternalLink,
  Mic,
  Upload,
  FileCheck2,
  ShieldCheck,
  AlertOctagon,
  Users,
  Layers,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type { TriageCase } from '../../types/triage';
import { formatDateTime } from '../../utils/caseId';
import { recordAuditEvent } from '../../utils/audit';
import { caseService } from '../../services/caseService';
import { CaseReviewModal } from './CaseReviewModal';
import { SafetyBanner } from '../SafetyDisclaimer/SafetyBanner';
import { CaseJourney } from '../Layout/CaseJourney';

interface ReviewerDashboardProps {
  cases: TriageCase[];
  onUpdateCase: (updatedCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
  onDeleteCase?: (caseId: string) => void;
}

export const ReviewerDashboard: React.FC<ReviewerDashboardProps> = ({
  cases,
  onUpdateCase,
  onViewSummary,
  onDeleteCase,
}) => {
  const [selectedCaseForModal, setSelectedCaseForModal] = useState<TriageCase | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'awaiting_review' | 'reviewed'>('all');
  const [urgencyOnlyFilter, setUrgencyOnlyFilter] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [deleteConfirmCase, setDeleteConfirmCase] = useState<TriageCase | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handlePromptDelete = (triageCase: TriageCase) => {
    setDeleteError(null);
    setDeleteConfirmCase(triageCase);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmCase) return;
    const caseIdToDelete = deleteConfirmCase.caseId;
    setDeletingCaseId(caseIdToDelete);
    setDeleteError(null);
    try {
      await caseService.deleteCase(caseIdToDelete);
      recordAuditEvent(
        caseIdToDelete,
        'Medical Reviewer',
        'Clinician permanently deleted reviewed case',
        `Case ${caseIdToDelete} was deleted from backend database persistence after clinical review sign-off.`
      );
      if (onDeleteCase) {
        onDeleteCase(caseIdToDelete);
      }
      setDeleteConfirmCase(null);
    } catch (err: any) {
      console.error('Failed to delete case:', err);
      setDeleteError(err?.message || 'Failed to delete case from persistent database.');
    } finally {
      setDeletingCaseId(null);
    }
  };

  const handleOpenReviewModal = (triageCase: TriageCase) => {
    recordAuditEvent(
      triageCase.caseId,
      'Medical Reviewer',
      'Reviewer opened case for clinical evaluation',
      `Reviewer initiated review workflow for ${triageCase.caseId}`
    );
    setSelectedCaseForModal(triageCase);
  };

  const handleConfirmReview = (updatedCase: TriageCase) => {
    onUpdateCase(updatedCase);
    setSelectedCaseForModal(null);
  };

  // Filtering logic
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

  const pendingCount = cases.filter((c) => c.reviewStatus === 'awaiting_review').length;
  const reviewedCount = cases.filter((c) => c.reviewStatus === 'reviewed').length;
  const highUrgencyCount = cases.filter(
    (c) => c.urgencySignals && c.urgencySignals.length > 0 && c.reviewStatus === 'awaiting_review'
  ).length;

  return (
    <div className="reviewer-dashboard-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Institutional Safety Banner */}
      <SafetyBanner />

      {/* 2. Global Case Journey Bar */}
      <CaseJourney currentStep="reviewer" compact />

      {/* 3. Header Command Panel */}
      <div className="triage-case-header-bar glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="intake-step-badge">03 / MEDICAL REVIEW</div>
            <h1 className="intake-title" style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldAlert size={24} color="var(--teal)" />
              <span>Clinical Review Command Center</span>
            </h1>
            <p className="intake-subtitle">
              Human verification, evidence inspection & final clinical sign-off &bull; AI assists, clinician decides
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div className="intake-status-pill glass">
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--mint)', boxShadow: '0 0 8px var(--mint)' }} />
              <span>Review Queue Operational</span>
            </div>
            <span className="provenance-tag reviewer glass">Role: CLINICAL REVIEWER</span>
          </div>
        </div>
      </div>

      {/* 4. Quick Stats Command Grid */}
      <div className="reviewer-stats-grid">
        {/* Stat 1: Pending Review */}
        <div className="stat-card-glass glass-card">
          <div className="stat-card-label">
            <Clock size={14} color="var(--champagne)" />
            <span>Pending Review</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--champagne)' }}>
            {pendingCount.toString().padStart(2, '0')}
          </div>
          <div className="stat-card-sub">Awaiting qualified clinician review</div>
        </div>

        {/* Stat 2: Urgency Signals */}
        <div className={`stat-card-glass glass-card ${highUrgencyCount > 0 ? 'urgency' : ''}`}>
          <div className="stat-card-label">
            <AlertOctagon size={14} color={highUrgencyCount > 0 ? 'var(--urgency-light)' : 'var(--teal)'} />
            <span style={{ color: highUrgencyCount > 0 ? 'var(--urgency-light)' : 'var(--text-muted)' }}>Urgency Signals</span>
          </div>
          <div className="stat-card-value" style={{ color: highUrgencyCount > 0 ? 'var(--urgency-light)' : 'var(--mint)' }}>
            {highUrgencyCount.toString().padStart(2, '0')}
          </div>
          <div className="stat-card-sub">
            {highUrgencyCount > 0 ? 'High priority review required' : 'No urgent pending cases'}
          </div>
        </div>

        {/* Stat 3: Reviewed Cases */}
        <div className="stat-card-glass glass-card">
          <div className="stat-card-label">
            <CheckCircle2 size={14} color="var(--teal)" />
            <span>Reviewed Cases</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--mint)' }}>
            {reviewedCount.toString().padStart(2, '0')}
          </div>
          <div className="stat-card-sub">Human clinical sign-off recorded</div>
        </div>

        {/* Stat 4: Total Cases */}
        <div className="stat-card-glass glass-card">
          <div className="stat-card-label">
            <Layers size={14} color="var(--seafoam)" />
            <span>Total Cases</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--seafoam)' }}>
            {cases.length.toString().padStart(2, '0')}
          </div>
          <div className="stat-card-sub">Total active queue inventory</div>
        </div>
      </div>

      {/* 5. Filter & Search Command Console */}
      <div className="reviewer-filter-bar glass-panel">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.50rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
            <Filter size={14} /> Filter:
          </span>

          <button
            type="button"
            className={`sample-chip-btn glass ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({cases.length})
          </button>
          <button
            type="button"
            className={`sample-chip-btn glass ${statusFilter === 'awaiting_review' ? 'active' : ''}`}
            onClick={() => setStatusFilter('awaiting_review')}
          >
            Awaiting Review ({pendingCount})
          </button>
          <button
            type="button"
            className={`sample-chip-btn glass ${statusFilter === 'reviewed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('reviewed')}
          >
            Reviewed ({reviewedCount})
          </button>

          <label
            className="glass"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.82rem',
              cursor: 'pointer',
              marginLeft: '0.5rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              background: urgencyOnlyFilter ? 'rgba(255, 107, 107, 0.15)' : 'rgba(28, 32, 37, 0.60)',
              border: urgencyOnlyFilter ? '1px solid var(--urgency-border)' : '1px solid rgba(59, 74, 69, 0.40)',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="checkbox"
              checked={urgencyOnlyFilter}
              onChange={(e) => setUrgencyOnlyFilter(e.target.checked)}
              style={{ accentColor: 'var(--urgency)', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 600, color: urgencyOnlyFilter ? 'var(--urgency-light)' : 'var(--text-secondary)' }}>
              Urgency Signals Only
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '240px', flex: '1 1 240px', maxWidth: '380px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-input glass-input"
              placeholder="Search case ID, patient ref, symptoms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.25rem', fontSize: '0.84rem' }}
            />
          </div>
        </div>
      </div>

      {/* 6. Case Queue Workspace */}
      <div className="card glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(59, 74, 69, 0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={16} color="var(--teal)" />
            <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)', letterSpacing: '0.02em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Clinical Review Queue ({filteredCases.length} Cases)
            </strong>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Showing {filteredCases.length} of {cases.length} entries
          </span>
        </div>

        {filteredCases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--text-muted)' }}>
            <FileCheck2 size={44} style={{ opacity: 0.3, marginBottom: '0.75rem', color: 'var(--teal)' }} />
            <p style={{ fontSize: '0.95rem', margin: 0, fontWeight: 600, letterSpacing: '0.03em', color: 'var(--text-primary)' }}>
              NO PATIENT CASES PENDING REVIEW
            </p>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.35rem' }}>
              Cases submitted through the Patient Portal will appear here.
            </span>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="reviewer-desktop-table" style={{ overflowX: 'auto' }}>
              <table className="audit-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: '14%' }}>Case Identifier</th>
                    <th style={{ width: '15%' }}>Patient Demographics</th>
                    <th style={{ width: '28%' }}>Extracted Symptoms & Narrative</th>
                    <th style={{ width: '15%' }}>Urgency Signal</th>
                    <th style={{ width: '14%' }}>Review Status</th>
                    <th style={{ width: '14%', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((c) => {
                    const hasUrgency = Boolean(c.urgencySignals && c.urgencySignals.length > 0);
                    const isReviewed = c.reviewStatus === 'reviewed';

                    return (
                      <tr key={c.caseId}>
                        {/* 1. Case Identifier */}
                        <td>
                          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--mint)', fontSize: '0.88rem' }}>
                            {c.caseId}
                          </strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                            {formatDateTime(c.createdAt)}
                          </div>
                          {c.inputModalities && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                              {c.voiceData && (
                                <span title="Contains Voice Audio Recording" style={{ color: 'var(--champagne)' }}>
                                  <Mic size={13} />
                                </span>
                              )}
                              {c.ocrReports && c.ocrReports.length > 0 && (
                                <span title={`Contains ${c.ocrReports.length} OCR Documents`} style={{ color: 'var(--teal)' }}>
                                  <Upload size={13} />
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 2. Patient Demographics */}
                        <td>
                          <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--champagne)', fontSize: '0.84rem' }}>
                            {c.patientId}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                            {c.age ? `${c.age} Yrs` : 'Age N/A'} &bull; {c.gender || 'N/A'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--seafoam)', fontFamily: 'var(--font-mono)' }}>
                            {c.preferredLanguage}
                          </div>
                        </td>

                        {/* 3. Extracted Symptoms & Narrative */}
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
                            {c.extractedSymptoms.map((s, idx) => (
                              <span
                                key={idx}
                                className="glass"
                                style={{
                                  background: 'rgba(53, 224, 193, 0.10)',
                                  color: 'var(--mint)',
                                  border: '1px solid rgba(53, 224, 193, 0.25)',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 'var(--radius-full)',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                }}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                          <div
                            style={{
                              fontSize: '0.78rem',
                              color: 'var(--text-secondary)',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              fontStyle: 'italic',
                              lineHeight: 1.4,
                            }}
                          >
                            "{c.rawSymptoms || (c.voiceData ? `[Voice Note: ${c.voiceData.transcript}]` : 'Multimodal document attached')}"
                          </div>
                        </td>

                        {/* 4. Urgency Signal */}
                        <td>
                          {hasUrgency ? (
                            <span className="badge badge-red glass" title={c.urgencySignals[0].reason}>
                              <ShieldAlert size={12} />
                              Attention Required
                            </span>
                          ) : (
                            <span className="badge badge-teal glass" style={{ opacity: 0.85 }}>
                              <ShieldCheck size={12} />
                              Routine
                            </span>
                          )}
                        </td>

                        {/* 5. Status & Decision */}
                        <td>
                          {isReviewed ? (
                            <div>
                              <span className="badge badge-teal glass">
                                <CheckCircle2 size={12} /> Reviewed
                              </span>
                              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--mint)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                                {c.reviewerDecision}
                              </div>
                            </div>
                          ) : (
                            <span className="badge badge-amber glass">
                              <Clock size={12} /> Awaiting Review
                            </span>
                          )}
                        </td>

                        {/* 6. Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.45rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-secondary glass"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                              onClick={() => onViewSummary(c)}
                              title="View structured evidence triage note"
                            >
                              <Eye size={13} />
                              <span>Note</span>
                            </button>
                            <button
                              type="button"
                              className={`btn glass ${isReviewed ? 'btn-secondary' : 'btn-primary'}`}
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                              onClick={() => handleOpenReviewModal(c)}
                              id={`btn-review-${c.caseId}`}
                            >
                              <span>{isReviewed ? 'Edit' : 'Review Case'}</span>
                              <ExternalLink size={13} aria-hidden="true" />
                            </button>
                            {isReviewed && (
                              <button
                                type="button"
                                className="btn btn-secondary glass"
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.78rem',
                                  color: 'var(--urgency-light)',
                                  borderColor: 'rgba(255, 107, 107, 0.40)',
                                }}
                                onClick={() => handlePromptDelete(c)}
                                title="Delete this reviewed case permanently"
                                id={`btn-delete-${c.caseId}`}
                              >
                                <Trash2 size={13} />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (<= 768px) */}
            <div className="reviewer-mobile-cards" style={{ padding: '0.75rem' }}>
              {filteredCases.map((c) => {
                const hasUrgency = Boolean(c.urgencySignals && c.urgencySignals.length > 0);
                const isReviewed = c.reviewStatus === 'reviewed';

                return (
                  <div key={`m-${c.caseId}`} className={`reviewer-case-card glass-card ${hasUrgency ? 'urgent' : ''}`}>
                    <div className="reviewer-case-card-header">
                      <div>
                        <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--mint)', fontSize: '0.92rem' }}>
                          {c.caseId}
                        </strong>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.1rem' }}>
                          {formatDateTime(c.createdAt)}
                        </div>
                      </div>

                      <div>
                        {hasUrgency ? (
                          <span className="badge badge-red glass" style={{ fontSize: '0.68rem' }}>
                            <ShieldAlert size={11} /> Urgent
                          </span>
                        ) : (
                          <span className="badge badge-teal glass" style={{ fontSize: '0.68rem' }}>
                            <ShieldCheck size={11} /> Routine
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="reviewer-case-card-body">
                      <div className="glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', background: 'rgba(10, 14, 19, 0.50)', padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)' }}>
                        <span style={{ color: 'var(--champagne)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          {c.patientId}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {c.age ? `${c.age} Yrs` : 'Age N/A'} &bull; {c.gender || 'N/A'} &bull; {c.preferredLanguage}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {c.extractedSymptoms.map((s, idx) => (
                          <span
                            key={idx}
                            className="glass"
                            style={{
                              background: 'rgba(53, 224, 193, 0.10)',
                              color: 'var(--mint)',
                              border: '1px solid rgba(53, 224, 193, 0.25)',
                              padding: '0.15rem 0.45rem',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>

                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.4 }}>
                        "{c.rawSymptoms || (c.voiceData ? `[Voice: ${c.voiceData.transcript}]` : 'Multimodal document attached')}"
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Review Status:</span>
                        {isReviewed ? (
                          <span className="badge badge-teal glass" style={{ fontSize: '0.70rem' }}>
                            <CheckCircle2 size={11} /> Reviewed: {c.reviewerDecision}
                          </span>
                        ) : (
                          <span className="badge badge-amber glass" style={{ fontSize: '0.70rem' }}>
                            <Clock size={11} /> Awaiting Review
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="reviewer-case-card-actions" style={{ flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary glass"
                        onClick={() => onViewSummary(c)}
                        title="View structured evidence triage note"
                      >
                        <Eye size={14} />
                        <span>View Note</span>
                      </button>
                      <button
                        type="button"
                        className={`btn glass ${isReviewed ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => handleOpenReviewModal(c)}
                        id={`btn-review-mobile-${c.caseId}`}
                      >
                        <span>{isReviewed ? 'Edit Decision' : 'Clinical Review'}</span>
                        <ExternalLink size={14} />
                      </button>
                      {isReviewed && (
                        <button
                          type="button"
                          className="btn btn-secondary glass"
                          style={{
                            color: 'var(--urgency-light)',
                            borderColor: 'rgba(255, 107, 107, 0.40)',
                          }}
                          onClick={() => handlePromptDelete(c)}
                          id={`btn-delete-mobile-${c.caseId}`}
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 7. Case Review Modal Workspace */}
      {selectedCaseForModal && (
        <CaseReviewModal
          triageCase={selectedCaseForModal}
          onClose={() => setSelectedCaseForModal(null)}
          onConfirmReview={handleConfirmReview}
        />
      )}

      {/* 8. Delete Confirmation Modal */}
      {deleteConfirmCase && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 8, 12, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            className="glass-card"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '1.75rem',
              textAlign: 'center',
              border: '1px solid rgba(255, 107, 107, 0.45)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ color: 'var(--urgency-light)', marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>
              <AlertTriangle size={42} />
            </div>
            <h3 id="delete-modal-title" style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '0.65rem', fontWeight: 800 }}>
              Delete Reviewed Case
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.5rem' }}>
              Delete this reviewed case permanently?
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--urgency-light)', fontWeight: 600, marginBottom: '1.25rem' }}>
              This action cannot be undone.
            </p>
            <div
              className="glass"
              style={{
                background: 'rgba(10, 14, 19, 0.60)',
                padding: '0.5rem',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                marginBottom: '1.25rem',
                color: 'var(--mint)',
              }}
            >
              Case ID: {deleteConfirmCase.caseId} &bull; Patient: {deleteConfirmCase.patientId}
            </div>
            {deleteError && (
              <div style={{ color: 'var(--urgency-light)', fontSize: '0.80rem', marginBottom: '1rem', background: 'rgba(255,107,107,0.15)', padding: '0.5rem', borderRadius: '4px' }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary glass"
                onClick={() => { setDeleteConfirmCase(null); setDeleteError(null); }}
                disabled={deletingCaseId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn glass"
                style={{
                  color: '#fff',
                  backgroundColor: 'rgba(255, 75, 75, 0.85)',
                  border: '1px solid var(--urgency)',
                  fontWeight: 700,
                  padding: '0.45rem 1.25rem',
                }}
                onClick={handleConfirmDelete}
                disabled={deletingCaseId !== null}
                id="btn-confirm-delete-case"
              >
                {deletingCaseId ? 'Deleting...' : 'Delete Case'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
