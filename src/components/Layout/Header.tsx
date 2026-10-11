import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { workshopResetService } from '../../services/workshop/workshopResetService';

export type ActiveTab = 'intake' | 'summary' | 'reviewer' | 'audit' | 'patient_portal' | 'nurse_queue';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  pendingCount: number;
  hasActiveCase?: boolean;
  onResetToDemo: (specificRole?: UserRole) => Promise<void> | void;
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
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const role: UserRole = currentUser?.role || 'PATIENT';

  const portalSummary = workshopResetService.getPortalResetSummary(role);
  const getPortalDisplayName = (r: UserRole): string => workshopResetService.getPortalDisplayName(workshopResetService.normalizePortalScope(r));

  // Close mobile menu on Escape key press or outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isResetting) {
        if (showResetConfirm) setShowResetConfirm(false);
        if (mobileMenuOpen) setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, showResetConfirm, isResetting]);

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
    setResetError(null);
    setShowResetConfirm(true);
    setMobileMenuOpen(false);
  };

  const handleConfirmReset = async () => {
    setIsResetting(true);
    setResetError(null);
    try {
      await onResetToDemo(role);
      setShowResetConfirm(false);
      setResetSuccessMessage(`${portalSummary.displayName} workshop has been reset to defaults successfully.`);
      setTimeout(() => {
        setResetSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error('[Header] Failed to reset portal workshop:', err);
      setResetError(err.message || 'Failed to complete portal reset. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleCancelReset = () => {
    if (isResetting) return;
    setResetError(null);
    setShowResetConfirm(false);
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
                  <span className="badge-count" title={`${pendingCount} cases awaiting nursing triage`}>
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

          {/* Reset Workshop Action */}
          <button
            type="button"
            className="nav-btn nav-btn-utility glass"
            onClick={handleResetDemoClick}
            title={`Reset ${getPortalDisplayName(role)} workshop state`}
            id="btn-reset-demo"
            aria-label={`Reset ${getPortalDisplayName(role)} workshop`}
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>Reset Workshop</span>
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
                    <span className="mobile-nav-desc">Symptom check & cases</span>
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
                    <span className="mobile-nav-desc">Bedside triage & vitals</span>
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
                      <span className="mobile-nav-desc">Clinical evaluation</span>
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
                      <span className="mobile-nav-desc">Traceable provenance</span>
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
                    <span className="mobile-nav-title">Admin Governance</span>
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
                id="btn-mobile-reset-demo"
              >
                <RotateCcw size={16} color="var(--champagne)" aria-hidden="true" />
                <span>Reset Workshop ({getPortalDisplayName(role)})</span>
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

      {/* Portal-Specific Reset Workshop Confirmation Modal (Rendered to document.body to avoid parent clipping) */}
      {showResetConfirm &&
        (typeof document !== 'undefined' && document.body
          ? createPortal(
              <div
                className="modal-overlay reset-workshop-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reset-modal-title"
                id="reset-workshop-confirmation-modal"
                onClick={(e) => {
                  if (e.target === e.currentTarget) handleCancelReset();
                }}
              >
                <div
                  className="modal-content glass-modal reset-workshop-dialog"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: 'rgba(226, 195, 130, 0.16)',
                        border: '1px solid rgba(226, 195, 130, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <RotateCcw size={20} color="var(--champagne)" />
                    </div>
                    <div>
                      <h3 id="reset-modal-title" style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                        Reset {getPortalDisplayName(role)} Workshop?
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Portal-specific workspace reset
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '1.25rem' }}>
                    <p style={{ margin: '0 0 0.75rem 0' }}>
                      This will reset active forms, unsaved entries, filters, selected cases, and open tabs in <strong>{getPortalDisplayName(role)}</strong> back to their initial defaults.
                    </p>
                    <div
                      style={{
                        background: 'rgba(53, 224, 193, 0.08)',
                        border: '1px solid rgba(53, 224, 193, 0.25)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.75rem 0.85rem',
                        fontSize: '0.80rem',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <strong style={{ color: 'var(--mint)' }}>Safety Guarantee:</strong> Saved patient cases, database records, clinical assessments, audit logs, login sessions, and other portals will remain completely unchanged and preserved.
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary glass"
                      onClick={handleCancelReset}
                      id="btn-cancel-reset-workshop"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary glass"
                      onClick={handleConfirmReset}
                      id="btn-confirm-reset-workshop"
                    >
                      <RotateCcw size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      Confirm Reset
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null)}

      {/* Success Notification Toast (Rendered to document.body to avoid parent clipping) */}
      {resetSuccessMessage &&
        (typeof document !== 'undefined' && document.body
          ? createPortal(
              <div
                className="glass reset-workshop-toast"
                id="reset-workshop-success-toast"
                role="status"
                aria-live="polite"
              >
                <ShieldCheck size={18} color="var(--mint)" style={{ flexShrink: 0 }} />
                <span>{resetSuccessMessage}</span>
                <button
                  type="button"
                  onClick={() => setResetSuccessMessage(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    marginLeft: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                  }}
                  aria-label="Dismiss notice"
                >
                  <X size={14} />
                </button>
              </div>,
              document.body
            )
          : null)}
    </header>
  );
};
