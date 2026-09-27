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

  return (
    <div className="patient-portal-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Safety Banner */}
      <SafetyBanner />

      {/* 2. Patient Header Command Hub */}
      <div
        className="glass-panel"
        style={{
          padding: '1.5rem',
          borderRadius: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          border: '1px solid rgba(96, 165, 250, 0.25)',
        }}
      >
        <div>
          <div className="badge badge-champagne glass" style={{ marginBottom: '0.45rem', fontSize: '0.72rem' }}>
            PATIENT CITIZEN PORTAL
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={24} color="#60a5fa" />
            <span>Welcome, {currentUser?.displayName || 'Patient'}</span>
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>
            Track your clinical intake submissions, view structured symptom summaries, and review safety guidance.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartNewIntake}
          className="btn btn-primary glass"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            fontWeight: 700,
            fontSize: '0.90rem',
            background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.3), rgba(53, 224, 193, 0.25))',
            borderColor: '#60a5fa',
          }}
        >
          <PlusCircle size={18} />
          <span>New Symptom Check / Intake</span>
        </button>
      </div>

      {/* 3. Red-Flag Emergency Advisory Card */}
      <div
        className="glass-card"
        style={{
          padding: '1.15rem 1.35rem',
          borderRadius: '12px',
          border: '1px solid rgba(248, 113, 113, 0.35)',
          background: 'rgba(239, 68, 68, 0.08)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem',
        }}
      >
        <AlertCircle size={22} color="var(--urgency-light)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#fca5a5', marginBottom: '0.2rem' }}>
            Emergency Red-Flag Notice
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            This system provides non-diagnostic clinical triage assistance. If you or the patient are experiencing severe chest pain, extreme breathlessness, sudden loss of consciousness, or heavy bleeding, please go immediately to the nearest Emergency Department or call emergency medical services.
          </div>
        </div>
      </div>

      {/* 4. Active Submissions & Case History */}
      <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Your Triage Intake Records
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Total Records: {cases.length} &bull; Clinical Reviews Pending: {cases.filter((c) => c.reviewStatus === 'awaiting_review').length}
            </div>
          </div>
        </div>

        {cases.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: 'var(--text-muted)',
              fontSize: '0.90rem',
            }}
          >
            <HeartPulse size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>No intake cases recorded yet.</p>
            <p style={{ fontSize: '0.80rem', marginTop: '0.35rem' }}>
              Click "New Symptom Check / Intake" above to record symptoms or multimodal evidence.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {cases.map((c) => {
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
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {c.caseId}
                      </span>
                      <span className="badge badge-champagne glass" style={{ fontSize: '0.68rem' }}>
                        ID: {c.patientId}
                      </span>
                      {isReviewed ? (
                        <span className="badge badge-teal glass" style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <CheckCircle2 size={12} />
                          Reviewed by Clinician ({c.reviewerDecision || 'Confirmed'})
                        </span>
                      ) : (
                        <span className="badge glass" style={{ fontSize: '0.68rem', color: 'var(--champagne)', borderColor: 'var(--champagne)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={12} />
                          Awaiting Clinical Review
                        </span>
                      )}
                    </div>

                    <p style={{ margin: '0 0 0.45rem 0', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {c.rawSymptoms || (c.extractedSymptoms && c.extractedSymptoms.join(', ')) || 'No narrative text'}
                    </p>

                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Language: {c.preferredLanguage || 'English'} &bull; Date: {new Date(c.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onViewSummary(c)}
                    className="btn btn-secondary glass"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.55rem 0.95rem',
                      fontSize: '0.82rem',
                    }}
                  >
                    <FileText size={15} color="var(--teal)" />
                    <span>View Triage Summary</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
