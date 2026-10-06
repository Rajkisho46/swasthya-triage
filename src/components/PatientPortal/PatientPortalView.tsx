import React from 'react';
import {
  User,
  HeartPulse,
  Clock,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  FileText,
  ChevronRight,
  Activity,
} from 'lucide-react';
import type { TriageCase } from '../../types/triage';
import { SafetyBanner } from '../SafetyDisclaimer/SafetyBanner';
import { useAuth } from '../../context/AuthContext';

interface PatientPortalProps {
  cases: TriageCase[];
  onStartNewIntake: () => void;
  onViewSummary: (triageCase: TriageCase) => void;
  onOpenTrustCenter?: () => void;
}

export const PatientPortalView: React.FC<PatientPortalProps> = ({
  cases,
  onStartNewIntake,
  onViewSummary,
}) => {
  const { currentUser } = useAuth();
  const pendingCount = cases.filter((c) => c.reviewStatus === 'awaiting_review').length;

  return (
    <div className="patient-portal-view-container">
      {/* 1. Triage Support Safety Protocol Banner */}
      <SafetyBanner />

      {/* 2. Welcome Hero Section */}
      <section className="patient-hero-card glass-card" aria-label="Patient Welcome Hub">
        <div className="patient-hero-content">
          <div className="patient-hero-badge-row">
            <span className="patient-portal-badge glass">
              <span className="pulse-indicator-champagne" aria-hidden="true" />
              PATIENT CITIZEN PORTAL
            </span>
          </div>

          <h1 className="patient-hero-title">
            <div className="patient-hero-avatar-icon" aria-hidden="true">
              <User size={26} color="var(--mint)" />
            </div>
            <span>Welcome, {currentUser?.displayName || 'Patient'}</span>
          </h1>

          <p className="patient-hero-description">
            Track your clinical intake submissions, view structured symptom summaries, and review safety guidance.
          </p>
        </div>

        <div className="patient-hero-actions">
          <button
            type="button"
            onClick={onStartNewIntake}
            className="patient-cta-btn"
            id="btn-patient-new-intake"
            aria-label="Start New Symptom Check or Intake"
          >
            <PlusCircle size={20} aria-hidden="true" />
            <span>New Symptom Check / Intake</span>
          </button>
        </div>

        {/* Ambient subtle decorative pulse watermark in hero background */}
        <div className="patient-hero-ambient-pulse" aria-hidden="true">
          <Activity size={120} />
        </div>
      </section>

      {/* 3. Emergency Red-Flag Notice */}
      <section className="patient-emergency-card" role="alert" aria-label="Emergency Red-Flag Notice">
        <div className="patient-emergency-icon-wrapper" aria-hidden="true">
          <AlertCircle size={22} color="#FFB4AB" />
        </div>
        <div className="patient-emergency-text-content">
          <div className="patient-emergency-heading">
            Emergency Red-Flag Notice
          </div>
          <p className="patient-emergency-body">
            This system provides non-diagnostic clinical triage assistance. If you or the patient are experiencing severe chest pain, extreme breathlessness, sudden loss of consciousness, or heavy bleeding, please go immediately to the nearest Emergency Department or call emergency medical services.
          </p>
        </div>
      </section>

      {/* 4. Your Triage Intake Records Section */}
      <section className="patient-records-card glass-card" aria-label="Triage Intake Records">
        <div className="patient-records-header">
          <div>
            <h2 className="patient-records-title">
              Your Triage Intake Records
            </h2>
            <div className="patient-records-stats-row">
              <span className="patient-stat-pill glass">
                <span className="stat-dot stat-dot-teal" aria-hidden="true" />
                Total Records: <strong>{cases.length}</strong>
              </span>
              <span className="patient-stat-pill glass">
                <span className="stat-dot stat-dot-champagne" aria-hidden="true" />
                Clinical Reviews Pending: <strong>{pendingCount}</strong>
              </span>
            </div>
          </div>
        </div>

        {cases.length === 0 ? (
          /* Empty State */
          <div className="patient-records-empty-state">
            <div className="patient-empty-icon-box glass" aria-hidden="true">
              <HeartPulse size={36} color="var(--mint)" className="patient-pulse-anim" />
            </div>
            <h3 className="patient-empty-title">No intake cases recorded yet.</h3>
            <p className="patient-empty-subtitle">
              Click &ldquo;New Symptom Check / Intake&rdquo; above to record symptoms or multimodal evidence.
            </p>
          </div>
        ) : (
          /* Populated Records List */
          <div className="patient-records-list">
            {cases.map((c) => {
              const isReviewed = c.reviewStatus === 'reviewed';
              const hasUrgency = Boolean(c.urgencySignals && c.urgencySignals.length > 0);

              return (
                <article
                  key={c.caseId}
                  className={`patient-record-item glass-card ${isReviewed ? 'item-reviewed' : hasUrgency ? 'item-urgent' : ''}`}
                >
                  <div className="patient-record-info">
                    <div className="patient-record-meta-row">
                      <span className="patient-record-case-id">
                        {c.caseId}
                      </span>
                      <span className="patient-record-patient-id glass">
                        ID: {c.patientId}
                      </span>
                      {isReviewed ? (
                        <span className="badge badge-teal glass patient-status-badge">
                          <CheckCircle2 size={12} aria-hidden="true" />
                          <span>Reviewed by Clinician ({c.reviewerDecision || 'Confirmed'})</span>
                        </span>
                      ) : (
                        <span className="badge badge-champagne glass patient-status-badge">
                          <Clock size={12} aria-hidden="true" />
                          <span>Awaiting Clinical Review</span>
                        </span>
                      )}
                    </div>

                    <p className="patient-record-symptoms">
                      {c.rawSymptoms || (c.extractedSymptoms && c.extractedSymptoms.join(', ')) || 'No narrative text recorded'}
                    </p>

                    <div className="patient-record-date-lang">
                      <span>Language: {c.preferredLanguage || 'English'}</span>
                      <span className="dot-separator">&bull;</span>
                      <span>Date: {new Date(c.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onViewSummary(c)}
                    className="patient-view-summary-btn glass"
                    aria-label={`View Triage Summary for Case ${c.caseId}`}
                  >
                    <FileText size={15} color="var(--teal)" aria-hidden="true" />
                    <span>View Triage Summary</span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

