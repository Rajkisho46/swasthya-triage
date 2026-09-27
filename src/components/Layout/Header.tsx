import React from 'react';
import {
  Stethoscope,
  ShieldAlert,
  FileText,
  RotateCcw,
  Building2,
  ShieldCheck,
  LogOut,
  HeartPulse,
  LayoutDashboard,
  User,
} from 'lucide-react';
import type { TrustCenterTab } from '../TrustCenter/PrivacyTrustCenter';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types/auth';

export type ActiveTab = 'intake' | 'summary' | 'reviewer' | 'audit' | 'patient_portal' | 'nurse_queue';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  pendingCount: number;
  hasActiveCase?: boolean;
  onResetToDemo: () => void;
  onOpenTrustCenter?: (tab?: TrustCenterTab) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  pendingCount,
  hasActiveCase: _hasActiveCase,
  onResetToDemo,
  onOpenTrustCenter,
}) => {
  const { currentUser, logout } = useAuth();
  const role: UserRole = currentUser?.role || 'PATIENT';

  const getRoleBadgeStyle = (r: UserRole) => {
    switch (r) {
      case 'DOCTOR':
        return { color: 'var(--teal)', borderColor: 'var(--teal)' };
      case 'NURSE':
        return { color: 'var(--mint)', borderColor: 'var(--mint)' };
      case 'PATIENT':
        return { color: '#60a5fa', borderColor: '#60a5fa' };
      case 'ADMIN':
        return { color: '#c084fc', borderColor: '#c084fc' };
    }
  };

  return (
    <header className="app-header glass-header" role="banner">
      <div className="header-inner">
        {/* Institutional Branding */}
        <div className="header-branding">
          <div className="app-title">
            <div className="title-icon-box glass" aria-hidden="true">
              <Stethoscope size={22} color="var(--teal)" />
            </div>
            <div className="title-text-group">
              <div className="brand-name-row">
                <div className="brand-name">Swasthya Triage</div>
                <span className="facility-pill glass">
                  <Building2 size={11} style={{ display: 'inline', marginRight: '3px', verticalAlign: '-1px' }} />
                  PHC Node
                </span>
              </div>
              <span className="brand-tagline">Multimodal Healthcare Triage Assistant</span>
            </div>
          </div>
        </div>

        {/* Center Authenticated User Status Chip */}
        <div className="header-status-center">
          {currentUser ? (
            <div
              className="system-status-chip glass"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.40rem 0.85rem',
              }}
            >
              <User size={14} color="var(--teal)" aria-hidden="true" />
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {currentUser.displayName}
              </span>
              <span className="status-separator" aria-hidden="true">|</span>
              <span
                className="badge glass"
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  ...getRoleBadgeStyle(currentUser.role),
                }}
              >
                {currentUser.role}
              </span>
            </div>
          ) : (
            <div className="system-status-chip glass">
              <span className="pulse-indicator-teal" aria-hidden="true" />
              <span className="status-label">System Operational</span>
            </div>
          )}
        </div>

        {/* Command Navigation Stages + Utility */}
        <div className="header-actions-group">
          <nav className="header-nav" aria-label="Main Command Navigation">
            {/* PATIENT Portal View */}
            {role === 'PATIENT' && (
              <button
                type="button"
                className={`nav-btn glass ${activeTab === 'patient_portal' ? 'active' : ''}`}
                onClick={() => onSelectTab('patient_portal')}
                id="nav-patient-portal"
                aria-current={activeTab === 'patient_portal' ? 'page' : undefined}
              >
                <LayoutDashboard size={15} aria-hidden="true" />
                <span>Patient Portal</span>
              </button>
            )}

            {/* NURSE Navigation */}
            {role === 'NURSE' && (
              <button
                type="button"
                className={`nav-btn glass ${activeTab === 'nurse_queue' ? 'active' : ''}`}
                onClick={() => onSelectTab('nurse_queue')}
                id="nav-nurse-queue"
                aria-current={activeTab === 'nurse_queue' ? 'page' : undefined}
              >
                <HeartPulse size={15} aria-hidden="true" />
                <span>Nursing Queue</span>
                {pendingCount > 0 && (
                  <span className="badge-count" title={`${pendingCount} cases awaiting review`}>
                    {pendingCount}
                  </span>
                )}
              </button>
            )}

            {/* DOCTOR / MEDICAL REVIEWER Navigation */}
            {(role === 'DOCTOR' || (role as any) === 'MEDICAL_REVIEWER') && (
              <>
                <button
                  type="button"
                  className={`nav-btn glass ${activeTab === 'reviewer' ? 'active' : ''}`}
                  onClick={() => onSelectTab('reviewer')}
                  id="nav-reviewer"
                  aria-current={activeTab === 'reviewer' ? 'page' : undefined}
                >
                  <span className="nav-step-num">01</span>
                  <ShieldAlert size={15} aria-hidden="true" />
                  <span>Review Queue</span>
                  {pendingCount > 0 && (
                    <span className="badge-count" title={`${pendingCount} cases awaiting review`}>
                      {pendingCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className={`nav-btn glass ${activeTab === 'audit' ? 'active' : ''}`}
                  onClick={() => onSelectTab('audit')}
                  id="nav-audit"
                  aria-current={activeTab === 'audit' ? 'page' : undefined}
                >
                  <span className="nav-step-num">02</span>
                  <FileText size={15} aria-hidden="true" />
                  <span>Audit Trail</span>
                </button>
              </>
            )}

            {/* ADMIN Navigation */}
            {(role === 'ADMIN' || (role as any) === 'ADMINISTRATOR') && (
              <button
                type="button"
                className={`nav-btn glass ${activeTab === 'audit' ? 'active' : ''}`}
                onClick={() => onSelectTab('audit')}
                id="nav-audit"
                aria-current={activeTab === 'audit' ? 'page' : undefined}
              >
                <FileText size={15} aria-hidden="true" />
                <span>Admin Governance & Audit</span>
              </button>
            )}
          </nav>

          <div className="header-divider" aria-hidden="true" />

          {/* Privacy & Trust Center Action */}
          {onOpenTrustCenter && (
            <button
              type="button"
              className="nav-btn nav-btn-utility glass"
              onClick={() => onOpenTrustCenter('overview')}
              title="Open Privacy, Consent & Governance Center"
              id="btn-open-trust-center"
              aria-label="Open Privacy, Consent and Governance Center"
            >
              <ShieldCheck size={13} aria-hidden="true" color="var(--mint)" />
              <span>Trust Center</span>
            </button>
          )}

          {/* Reset Demo Secondary Action (Separate from Logout) */}
          <button
            type="button"
            className="nav-btn nav-btn-utility glass"
            onClick={onResetToDemo}
            title="Reload synthetic demonstration cases and reset audit log"
            id="btn-reset-demo"
            aria-label="Reset demonstration cases and audit log"
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>Reset Demo</span>
          </button>

          {/* Clearly Accessible Logout Action */}
          {currentUser && (
            <button
              type="button"
              className="nav-btn nav-btn-utility glass"
              onClick={logout}
              title="Log out of current session"
              id="btn-logout"
              aria-label="Log out"
              style={{
                color: '#fca5a5',
                borderColor: 'rgba(239, 68, 68, 0.35)',
                background: 'rgba(239, 68, 68, 0.08)',
                cursor: 'pointer',
              }}
            >
              <LogOut size={13} aria-hidden="true" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
