import React, { useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  HeartPulse,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PatientAuthForm, type AuthMode } from './PatientAuthForm';
import { PortalToggle } from './PortalToggle';
import type { TrustCenterTab } from '../TrustCenter/PrivacyTrustCenter';

interface LoginScreenProps {
  onOpenTrustCenter?: (tab?: TrustCenterTab) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onOpenTrustCenter }) => {
  const { login, isLoading } = useAuth();
  const [activePortalTab, setActivePortalTab] = useState<'patient' | 'staff'>('patient');
  const [patientMode, setPatientMode] = useState<AuthMode>('login');

  // Staff Form State
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      return;
    }
    try {
      await login(username.trim(), password.trim());
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid credentials. Please check your username and password.');
    }
  };

  const handleQuickFillStaff = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setErrorMessage('');
  };

  // Welcome panel headline & copy calculation
  const getWelcomeContent = () => {
    if (activePortalTab === 'staff') {
      return {
        tag: 'CLINICAL COMMAND',
        headline: (
          <>
            CLINICAL<br />
            PROVIDER
          </>
        ),
        description:
          'Authorized clinical provider gateway for real-time triage queues, medical reviewer decisions, and tamper-evident governance.',
        buttonText: 'Patient Portal',
        buttonAction: () => {
          setActivePortalTab('patient');
          setPatientMode('login');
        },
      };
    }

    if (patientMode === 'register') {
      return {
        tag: 'CLINICAL INTAKE',
        headline: (
          <>
            WELCOME<br />
            BACK!
          </>
        ),
        description:
          'Already registered with Swasthya Triage? Sign in to view your ongoing clinical triage cases and medical records.',
        buttonText: 'Sign In',
        buttonAction: () => setPatientMode('login'),
      };
    }

    if (patientMode === 'verify-otp' || patientMode === 'forgot-password' || patientMode === 'reset-password') {
      return {
        tag: 'DATA PROTECTION',
        headline: (
          <>
            SECURE<br />
            ACCESS
          </>
        ),
        description:
          'Your health records are encrypted under ABDM and HIPAA standards with multi-factor identity verification.',
        buttonText: 'Back to Login',
        buttonAction: () => setPatientMode('login'),
      };
    }

    // Default: Patient Login
    return {
      tag: 'HEALTHCARE ACCESS',
      headline: (
        <>
          HELLO,<br />
          FRIEND!
        </>
      ),
      description:
        'Welcome to Swasthya Triage. Secure healthcare access designed for patients and clinical teams.',
      buttonText: 'Create Account',
      buttonAction: () => setPatientMode('register'),
    };
  };

  const welcomeContent = getWelcomeContent();

  return (
    <div className="split-login-wrapper">
      {/* Decorative Atmospheric Glow Gradients (Preserving Existing Swasthya Triage Ambient Lighting) */}
      <div className="bg-ambient-teal" aria-hidden="true" />
      <div className="bg-ambient-mint" aria-hidden="true" />

      {/* Top Header Bar */}
      <header className="split-login-header">
        <div className="split-brand-logo">
          <div className="split-brand-logo-icon">
            <HeartPulse size={18} color="#67E8D4" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
            <span className="split-brand-logo-title">Swasthya Triage</span>
            <span style={{ fontSize: '11px', color: '#A3AEAC', letterSpacing: '0.02em' }}>
              Multimodal Healthcare Triage Assistant
            </span>
          </div>
        </div>

        {onOpenTrustCenter && (
          <button
            type="button"
            onClick={() => onOpenTrustCenter('overview')}
            style={{
              marginLeft: 'auto',
              background: 'rgba(18, 24, 29, 0.60)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
              borderRadius: '9999px',
              padding: '6px 14px',
              color: '#A3AEAC',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backdropFilter: 'blur(12px)',
            }}
          >
            <ShieldCheck size={13} color="#67E8D4" />
            <span>Trust Center</span>
          </button>
        )}
      </header>

      {/* Main Centered Glassmorphism Container */}
      <main className="glass-login-main-wrapper">
        <div className="glass-login-container">
          {/* Subtle Top Rim Highlight */}
          <div className="glass-login-rim-light" aria-hidden="true" />

          {/* =========================================================================
              LEFT PANEL: LOGIN / AUTH FORM
              ========================================================================= */}
          <section className="glass-login-panel" aria-label="Authentication Form">
            {/* Centered Portal Switcher at the top of the form panel */}
            <PortalToggle
              activeTab={activePortalTab}
              onTabChange={setActivePortalTab}
            />

            {activePortalTab === 'patient' && (
              <PatientAuthForm
                activePortalTab={activePortalTab}
                onSwitchPortalTab={setActivePortalTab}
                mode={patientMode}
                onModeChange={setPatientMode}
                hidePortalToggle={true}
              />
            )}

            {activePortalTab === 'staff' && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Staff Console Badge & Title */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: '4px', width: '100%' }}>
                  <div className="glass-welcome-pill" style={{ marginBottom: '2px' }}>
                    <ShieldCheck size={11} color="#67E8D4" />
                    <span>STAFF CONSOLE &bull; CLINICAL GATEWAY</span>
                  </div>
                  <h1 className="glass-form-title">STAFF LOGIN</h1>
                  <p className="glass-form-subtitle">
                    Demo access for Nurses, Medical Reviewers, and Administrators.
                  </p>
                </div>

                {/* Error Alert */}
                {errorMessage && (
                  <div className="stitch-alert-banner" role="alert">
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: '12.5px' }}>{errorMessage}</div>
                  </div>
                )}

                <form onSubmit={handleStaffSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                  <div className="stitch-form-group">
                    <label className="stitch-label" htmlFor="staff-username">
                      Staff Username
                    </label>
                    <div className="stitch-input-container">
                      <span className="stitch-input-icon">
                        <User size={16} />
                      </span>
                      <input
                        id="staff-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. dr_sharma"
                        className="stitch-input glass-translucent-input"
                        autoComplete="username"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="stitch-form-group">
                    <label className="stitch-label" htmlFor="staff-password">
                      Password
                    </label>
                    <div className="stitch-input-container">
                      <span className="stitch-input-icon">
                        <Lock size={16} />
                      </span>
                      <input
                        id="staff-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="stitch-input glass-translucent-input stitch-input-pwd"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="stitch-eye-toggle"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="glass-btn-primary"
                    id="btn-staff-sign-in"
                    style={{ marginTop: '4px' }}
                  >
                    {isLoading ? 'Authenticating...' : 'Sign In as Staff'}
                  </button>
                </form>

                {/* 1-Click Demo Fill Helpers */}
                <div style={{ marginTop: '2px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '11px', color: '#A3AEAC', marginBottom: '8px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                    1-Click Demo Role Autofill:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleQuickFillStaff('dr_sharma', 'doctorpassword123')}
                      className="stitch-btn-secondary"
                      style={{ padding: '6px 8px', flexDirection: 'column', height: 'auto', minHeight: '44px', gap: '2px', alignItems: 'center' }}
                    >
                      <strong style={{ color: '#67E8D4', fontSize: '12px' }}>Doctor</strong>
                      <span style={{ fontSize: '10.5px', color: '#A3AEAC' }}>dr_sharma</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickFillStaff('nurse_priya', 'nursepassword123')}
                      className="stitch-btn-secondary"
                      style={{ padding: '6px 8px', flexDirection: 'column', height: 'auto', minHeight: '44px', gap: '2px', alignItems: 'center' }}
                    >
                      <strong style={{ color: '#67E8D4', fontSize: '12px' }}>Nurse</strong>
                      <span style={{ fontSize: '10.5px', color: '#A3AEAC' }}>nurse_priya</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickFillStaff('admin_user', 'adminpassword123')}
                      className="stitch-btn-secondary"
                      style={{ padding: '6px 8px', flexDirection: 'column', height: 'auto', minHeight: '44px', gap: '2px', alignItems: 'center' }}
                    >
                      <strong style={{ color: '#E2C382', fontSize: '12px' }}>Admin</strong>
                      <span style={{ fontSize: '10.5px', color: '#A3AEAC' }}>admin_user</span>
                    </button>
                  </div>
                </div>

                {/* Operational Footer Status */}
                <div className="stitch-compliance-footer">
                  <span className="mint-pulse-dot" style={{ width: '6px', height: '6px' }} aria-hidden="true" />
                  <span>System Operational &bull; Non-Diagnostic Protocol</span>
                </div>
              </div>
            )}
          </section>

          {/* =========================================================================
              GLASS DIVIDER (Vertical on Desktop, Horizontal on Mobile)
              ========================================================================= */}
          <div className="glass-login-divider" aria-hidden="true" />

          {/* =========================================================================
              RIGHT PANEL: HELLO FRIEND / WELCOME SECTION
              ========================================================================= */}
          <section className="glass-welcome-panel" aria-label="Welcome Overview">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'flex-start' }}>
              {/* Institutional Healthcare Tag */}
              <div className="glass-welcome-pill">
                <HeartPulse size={12} color="#67E8D4" />
                <span>{welcomeContent.tag}</span>
              </div>

              {/* High Impact Headline */}
              <h2 className="glass-welcome-headline">
                {welcomeContent.headline}
              </h2>

              {/* Supporting Copy */}
              <p className="glass-welcome-desc">
                {welcomeContent.description}
              </p>

              {/* Action CTA Button */}
              <button
                type="button"
                onClick={welcomeContent.buttonAction}
                className="glass-btn-welcome-cta"
                id="btn-welcome-panel-action"
              >
                <span>{welcomeContent.buttonText}</span>
                <ArrowRight size={16} />
              </button>
            </div>

            {/* Bottom Institutional Trust & Provenance Footer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={14} color="#67E8D4" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#F5F5F2' }}>
                  Swasthya Triage Command
                </span>
              </div>
              <div className="glass-welcome-compliance">
                <ShieldCheck size={13} color="#67E8D4" style={{ flexShrink: 0 }} />
                <span>Institutional Grade Data Protection &bull; ABDM & HIPAA Standards</span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
