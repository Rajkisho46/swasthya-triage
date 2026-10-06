import React, { useState, useEffect, useRef } from 'react';
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
  Menu,
  X,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const role: UserRole = currentUser?.role || 'PATIENT';

  // Close mobile menu on Escape key press or outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const handleNavClick = (tab: ActiveTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  const handleTrustCenterClick = (tab?: TrustCenterTab) => {
    if (onOpenTrustCenter) {
      onOpenTrustCenter(tab);
    }
    setMobileMenuOpen(false);
  };

  const handleResetDemoClick = () => {
    onResetToDemo();
    setMobileMenuOpen(false);
  };

  const handleLogoutClick = () => {
    setMobileMenuOpen(false);
    logout();
  };

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

        {/* Center Authenticated User Status Chip (Desktop / Tablet) */}
        <div className="header-status-center header-status-desktop">
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

        {/* Mobile Hamburger Toggle Button (Mobile Viewport Only) */}
        <div className="header-mobile-toggle-wrapper">
          {currentUser && (
            <span
              className="badge glass header-mobile-role-badge"
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                ...getRoleBadgeStyle(currentUser.role),
              }}
            >
              {currentUser.role}
            </span>
          )}
          <button
            type="button"
            className="mobile-menu-toggle-btn glass"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
            id="btn-mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X size={20} color="var(--mint)" /> : <Menu size={20} color="var(--mint)" />}
          </button>
        </div>

        {/* Desktop Command Navigation Stages + Utility (Desktop/Tablet) */}
        <div className="header-actions-group header-actions-desktop">
          <nav className="header-nav" aria-label="Main Command Navigation">
            {/* PATIENT Portal View */}
            {role === 'PATIENT' && (
              <button
                type="button"
                className={`nav-btn glass ${activeTab === 'patient_portal' ? 'active' : ''}`}
                onClick={() => handleNavClick('patient_portal')}
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
                onClick={() => handleNavClick('nurse_queue')}
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
                  onClick={() => handleNavClick('reviewer')}
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
                  onClick={() => handleNavClick('audit')}
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
                onClick={() => handleNavClick('audit')}
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
              onClick={() => handleTrustCenterClick('overview')}
              title="Open Privacy, Consent & Governance Center"
              id="btn-open-trust-center"
              aria-label="Open Privacy, Consent and Governance Center"
            >
              <ShieldCheck size={13} aria-hidden="true" color="var(--mint)" />
              <span>Trust Center</span>
            </button>
          )}

          {/* Reset Workspace Secondary Action (Separate from Logout) */}
          <button
            type="button"
            className="nav-btn nav-btn-utility glass"
            onClick={handleResetDemoClick}
            title="Reload cases and reset audit log"
            id="btn-reset-demo"
            aria-label="Reset workspace and audit log"
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>Reset Workspace</span>
          </button>

          {/* Clearly Accessible Logout Action */}
          {currentUser && (
            <button
              type="button"
              className="nav-btn nav-btn-utility glass"
              onClick={handleLogoutClick}
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

      {/* Mobile Drawer Navigation Menu (Rendered on mobile viewport) */}
      {mobileMenuOpen && (
        <div
          className="header-mobile-menu-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        >
          <div
            className="header-mobile-drawer glass-card"
            ref={mobileMenuRef}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Mobile Navigation Menu"
          >
            {/* Drawer Header with User Profile */}
            <div className="mobile-drawer-user-info">
              {currentUser ? (
                <div className="mobile-user-profile-strip">
                  <div className="mobile-user-avatar glass" aria-hidden="true">
                    <User size={18} color="var(--mint)" />
                  </div>
                  <div className="mobile-user-text">
                    <div className="mobile-user-name">{currentUser.displayName}</div>
                    <div className="mobile-user-sub">
                      <span className="badge glass" style={{ fontSize: '0.66rem', ...getRoleBadgeStyle(currentUser.role) }}>
                        {currentUser.role}
                      </span>
                      <span className="mobile-user-phc">PHC Node &bull; Logged In</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="system-status-chip glass" style={{ width: '100%', justifyContent: 'center' }}>
                  <span className="pulse-indicator-teal" aria-hidden="true" />
                  <span className="status-label">System Operational</span>
                </div>
              )}
            </div>

            {/* Mobile Navigation List */}
            <nav className="mobile-drawer-nav" aria-label="Mobile Primary Navigation">
              {role === 'PATIENT' && (
                <button
                  type="button"
                  className={`mobile-drawer-nav-btn glass ${activeTab === 'patient_portal' ? 'active' : ''}`}
                  onClick={() => handleNavClick('patient_portal')}
                  aria-current={activeTab === 'patient_portal' ? 'page' : undefined}
                >
                  <LayoutDashboard size={18} color="var(--mint)" aria-hidden="true" />
                  <div className="mobile-nav-btn-text">
                    <span className="mobile-nav-title">Patient Portal</span>
                    <span className="mobile-nav-desc">Check symptoms & view cases</span>
                  </div>
                </button>
              )}

              {role === 'NURSE' && (
                <button
                  type="button"
                  className={`mobile-drawer-nav-btn glass ${activeTab === 'nurse_queue' ? 'active' : ''}`}
                  onClick={() => handleNavClick('nurse_queue')}
                  aria-current={activeTab === 'nurse_queue' ? 'page' : undefined}
                >
                  <HeartPulse size={18} color="var(--mint)" aria-hidden="true" />
                  <div className="mobile-nav-btn-text">
                    <span className="mobile-nav-title">Nursing Queue</span>
                    <span className="mobile-nav-desc">Bedside triage & vitals assessment</span>
                  </div>
                  {pendingCount > 0 && (
                    <span className="badge-count" style={{ marginLeft: 'auto' }}>
                      {pendingCount}
                    </span>
                  )}
                </button>
              )}

              {(role === 'DOCTOR' || (role as any) === 'MEDICAL_REVIEWER') && (
                <>
                  <button
                    type="button"
                    className={`mobile-drawer-nav-btn glass ${activeTab === 'reviewer' ? 'active' : ''}`}
                    onClick={() => handleNavClick('reviewer')}
                    aria-current={activeTab === 'reviewer' ? 'page' : undefined}
                  >
                    <ShieldAlert size={18} color="var(--teal)" aria-hidden="true" />
                    <div className="mobile-nav-btn-text">
                      <span className="mobile-nav-title">Review Queue</span>
                      <span className="mobile-nav-desc">Clinical evaluation & decision</span>
                    </div>
                    {pendingCount > 0 && (
                      <span className="badge-count" style={{ marginLeft: 'auto' }}>
                        {pendingCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    className={`mobile-drawer-nav-btn glass ${activeTab === 'audit' ? 'active' : ''}`}
                    onClick={() => handleNavClick('audit')}
                    aria-current={activeTab === 'audit' ? 'page' : undefined}
                  >
                    <FileText size={18} color="var(--seafoam)" aria-hidden="true" />
                    <div className="mobile-nav-btn-text">
                      <span className="mobile-nav-title">Audit Trail</span>
                      <span className="mobile-nav-desc">Traceable provenance logs</span>
                    </div>
                  </button>
                </>
              )}

              {(role === 'ADMIN' || (role as any) === 'ADMINISTRATOR') && (
                <button
                  type="button"
                  className={`mobile-drawer-nav-btn glass ${activeTab === 'audit' ? 'active' : ''}`}
                  onClick={() => handleNavClick('audit')}
                  aria-current={activeTab === 'audit' ? 'page' : undefined}
                >
                  <FileText size={18} color="var(--mint)" aria-hidden="true" />
                  <div className="mobile-nav-btn-text">
                    <span className="mobile-nav-title">Admin Governance & Audit</span>
                    <span className="mobile-nav-desc">System logs & oversight</span>
                  </div>
                </button>
              )}
            </nav>

            <div className="mobile-drawer-divider" />

            {/* Mobile Utility Actions */}
            <div className="mobile-drawer-utilities">
              {onOpenTrustCenter && (
                <button
                  type="button"
                  className="mobile-drawer-util-btn glass"
                  onClick={() => handleTrustCenterClick('overview')}
                >
                  <ShieldCheck size={16} color="var(--mint)" aria-hidden="true" />
                  <span>Privacy & Trust Center</span>
                </button>
              )}

              <button
                type="button"
                className="mobile-drawer-util-btn glass"
                onClick={handleResetDemoClick}
              >
                <RotateCcw size={16} color="var(--champagne)" aria-hidden="true" />
                <span>Reset Workspace State</span>
              </button>

              {currentUser && (
                <button
                  type="button"
                  className="mobile-drawer-util-btn mobile-logout-btn glass"
                  onClick={handleLogoutClick}
                >
                  <LogOut size={16} color="#fca5a5" aria-hidden="true" />
                  <span>Logout Session ({currentUser.displayName})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
