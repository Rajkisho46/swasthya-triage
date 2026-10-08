import React, { useState } from 'react';
import type { TriageCase } from '../../types/triage';
import { AuditLogView } from '../../components/AuditLog/AuditLogView';
import { ReviewerDashboard } from '../../components/MedicalReviewer/ReviewerDashboard';
import { SafetyBanner } from '../../components/SafetyDisclaimer/SafetyBanner';
import { ShieldCheck, ShieldAlert, Cpu, FileText, Database, Shield, Lock, Activity } from 'lucide-react';

interface AdministratorPortalProps {
  cases: TriageCase[];
  onUpdateCase: (updatedCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
  onOpenTrustCenter: () => void;
}

export const AdministratorPortal: React.FC<AdministratorPortalProps> = ({
  cases,
  onUpdateCase,
  onViewSummary,
  onOpenTrustCenter,
}) => {
  const [adminTab, setAdminTab] = useState<'audit' | 'overview' | 'oversight'>('audit');

  const pendingCount = cases.filter((c) => c.reviewStatus === 'awaiting_review').length;
  const reviewedCount = cases.filter((c) => c.reviewStatus === 'reviewed').length;

  return (
    <div className="portal-container admin-portal-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <SafetyBanner />

      {/* Administrator Liquid Glass Navigation */}
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
        aria-label="Administrator Navigation"
      >
        <button
          type="button"
          className={`nav-btn glass ${adminTab === 'audit' ? 'active' : ''}`}
          onClick={() => setAdminTab('audit')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-admin-audit"
        >
          <FileText size={14} color="var(--mint)" style={{ marginRight: '4px' }} />
          01 Audit Log
        </button>

        <button
          type="button"
          className={`nav-btn glass ${adminTab === 'overview' ? 'active' : ''}`}
          onClick={() => setAdminTab('overview')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-admin-overview"
        >
          <Cpu size={14} color="var(--teal)" style={{ marginRight: '4px' }} />
          02 Governance
        </button>

        <button
          type="button"
          className={`nav-btn glass ${adminTab === 'oversight' ? 'active' : ''}`}
          onClick={() => setAdminTab('oversight')}
          style={{ fontSize: '0.82rem', padding: '0.40rem 0.85rem' }}
          id="btn-nav-admin-oversight"
        >
          <ShieldAlert size={14} color="var(--champagne)" style={{ marginRight: '4px' }} />
          03 Queue Oversight ({cases.length})
        </button>
      </div>

      {/* Tab 1: Audit Trail & Provenance */}
      {adminTab === 'audit' && <AuditLogView />}

      {/* Tab 2: System Governance & Telemetry */}
      {adminTab === 'overview' && (
        <div className="glass-card scroll-reveal reveal-delay-1" style={{ padding: '1.75rem', borderRadius: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div className="badge badge-champagne glass" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>
                ADMINISTRATIVE GOVERNANCE
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                System Architecture & Security Posture
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-primary glass"
              onClick={onOpenTrustCenter}
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem' }}
              id="btn-admin-launch-trust-center"
            >
              <ShieldCheck size={16} color="var(--mint)" />
              <span>Trust Center</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="glass-panel" style={{ padding: '1.15rem', borderRadius: '14px' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                <Database size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                Active Cases in DB
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--teal)', marginTop: '0.25rem' }}>
                {cases.length}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {pendingCount} Pending &bull; {reviewedCount} Reviewed
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.15rem', borderRadius: '14px' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                <Lock size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                RBAC Security Posture
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mint)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShieldCheck size={18} />
                <span>Enforced (5 Roles)</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                PyJWT Bearer Auth & Middleware
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.15rem', borderRadius: '14px' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                <Activity size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                Safety Compliance Engine
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--champagne)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Shield size={18} />
                <span>Active Middleware</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Non-Diagnostic Clinical Guardrails
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Clinical Queue Oversight */}
      {adminTab === 'oversight' && (
        <ReviewerDashboard
          cases={cases}
          onUpdateCase={onUpdateCase}
          onViewSummary={onViewSummary}
        />
      )}
    </div>
  );
};

export const AdminPortal = AdministratorPortal;
