import React, { useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  HeartPulse,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PatientAuthForm } from './PatientAuthForm';
import { PortalToggle } from './PortalToggle';
import type { TrustCenterTab } from '../TrustCenter/PrivacyTrustCenter';

interface LoginScreenProps {
  onOpenTrustCenter?: (tab?: TrustCenterTab) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = () => {
  const { login, isLoading } = useAuth();
  const [activePortalTab, setActivePortalTab] = useState<'patient' | 'staff'>('patient');

  // Staff Demo Form State
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

  return (
    <div className="split-login-wrapper">
      {/* Decorative Atmospheric Glow Gradients */}
      <div className="bg-ambient-teal" aria-hidden="true" />
      <div className="bg-ambient-mint" aria-hidden="true" />

      {/* Top Header Bar */}
      <header className="split-login-header">
        <div className="split-brand-logo">
          <div className="split-brand-logo-icon">
            <HeartPulse size={18} color="#5dfddd" />
          </div>
          <span className="split-brand-logo-title">Swasthya Triage</span>
        </div>
      </header>

      {/* Main Split-Screen Content */}
      <main className="split-login-main">
        {/* =========================================================================
            LEFT COLUMN: BRANDING & CLINICAL POSITIONING (DESKTOP ~55%)
            ========================================================================= */}
        <div className="split-brand-column">
          {activePortalTab === 'patient' ? (
            <>
              {/* Badge */}
              <div className="split-brand-pill">
                <span className="mint-pulse-dot" aria-hidden="true" />
                <span>Healthcare Triage Platform</span>
              </div>

              {/* Large Editorial Headline */}
              <h1 className="split-hero-headline">
                Smarter triage<br />
                for better<br />
                <span className="text-mint-accent">patient care.</span>
              </h1>

              {/* Description */}
              <p className="split-hero-desc">
                Organize patient information, surface urgency signals, and connect clinical teams through a secure human-reviewed triage workflow.
              </p>

              {/* 3 Capability Indicators */}
              <div className="split-caps-row">
                <div className="split-cap-item">
                  <span className="split-cap-check">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span>Multimodal Intake</span>
                </div>
                <div className="split-cap-item">
                  <span className="split-cap-check">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span>Human Review</span>
                </div>
                <div className="split-cap-item">
                  <span className="split-cap-check">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span>Audit Ready</span>
                </div>
              </div>

              {/* Trust Callout */}
              <div className="split-compliance-note">
                <ShieldCheck size={15} color="#5dfddd" />
                <span>Institutional Grade Data Protection &bull; ABDM & HIPAA Standards</span>
              </div>
            </>
          ) : (
            <>
              {/* Staff Portal Left Column Messaging */}
              <div className="split-brand-pill">
                <span className="mint-pulse-dot" aria-hidden="true" />
                <span>Clinical Provider Console</span>
              </div>

              <h1 className="split-hero-headline">
                Clinical oversight<br />
                with verified<br />
                <span className="text-mint-accent">human decisions.</span>
              </h1>

              <p className="split-hero-desc">
                Accelerate clinical intake triage queues, review AI advisory signals, and maintain tamper-evident audit trails with verified provider credentials.
              </p>

              <div className="split-caps-row">
                <div className="split-cap-item">
                  <span className="split-cap-check">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span>Triage Queue</span>
                </div>
                <div className="split-cap-item">
                  <span className="split-cap-check">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span>Human Oversight</span>
                </div>
                <div className="split-cap-item">
                  <span className="split-cap-check">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span>Audit Provenance</span>
                </div>
              </div>

              <div className="split-compliance-note">
                <ShieldCheck size={15} color="#5dfddd" />
                <span>Non-Diagnostic Protocol &bull; Clinical Human-In-The-Loop Architecture</span>
              </div>
            </>
          )}
        </div>

        {/* =========================================================================
            RIGHT COLUMN: COMPACT AUTHENTICATION CARD (DESKTOP ~45%)
            ========================================================================= */}
        <div className="split-card-column">
          {activePortalTab === 'patient' && (
            <PatientAuthForm
              activePortalTab={activePortalTab}
              onSwitchPortalTab={setActivePortalTab}
            />
          )}

          {activePortalTab === 'staff' && (
            <div className="stitch-auth-container">
              <div className="stitch-glow-anchor" aria-hidden="true" />
              <div className="stitch-glass-card">
                <div className="stitch-rim-highlight" aria-hidden="true" />

                {/* Centered Portal Switcher at the top of the card */}
                <PortalToggle
                  activeTab={activePortalTab}
                  onTabChange={setActivePortalTab}
                />

                {/* Staff Console Demo Badge */}
                <div className="stitch-brand-chip" style={{ alignSelf: 'center', marginBottom: '2px' }}>
                  <ShieldCheck size={12} color="#5dfddd" />
                  <span className="stitch-brand-chip-text" style={{ color: '#5dfddd' }}>STAFF CONSOLE DEMO</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: '6px', marginBottom: '8px', width: '100%' }}>
                  <h2 className="stitch-header-title">Staff Authentication</h2>
                  <p className="stitch-header-subtitle">
                    Demo access for Nurses, Doctors, and Administrators.
                  </p>
                </div>

                {/* Error Alert */}
                {errorMessage && (
                  <div className="stitch-alert-banner" role="alert">
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>{errorMessage}</div>
                  </div>
                )}

                <form onSubmit={handleStaffSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                        className="stitch-input"
                        autoComplete="username"
                        required
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
                        className="stitch-input stitch-input-pwd"
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
                    className="stitch-btn-primary"
                    id="btn-staff-sign-in"
                    style={{ marginTop: '4px' }}
                  >
                    {isLoading ? 'Authenticating...' : 'Sign In as Staff'}
                  </button>
                </form>

                {/* 1-Click Demo Fill Helpers */}
                <div style={{ marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.10)' }}>
                  <div style={{ fontSize: '11px', color: '#98A6A4', marginBottom: '8px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                    1-Click Demo Role Autofill:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleQuickFillStaff('dr_sharma', 'doctorpassword123')}
                      className="stitch-btn-secondary"
                      style={{ padding: '6px 8px', flexDirection: 'column', height: 'auto', minHeight: '44px', gap: '2px', alignItems: 'center' }}
                    >
                      <strong style={{ color: '#5DFDDD', fontSize: '12px' }}>Doctor</strong>
                      <span style={{ fontSize: '10.5px', color: '#98A6A4' }}>dr_sharma</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickFillStaff('nurse_priya', 'nursepassword123')}
                      className="stitch-btn-secondary"
                      style={{ padding: '6px 8px', flexDirection: 'column', height: 'auto', minHeight: '44px', gap: '2px', alignItems: 'center' }}
                    >
                      <strong style={{ color: '#5DFDDD', fontSize: '12px' }}>Nurse</strong>
                      <span style={{ fontSize: '10.5px', color: '#98A6A4' }}>nurse_priya</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickFillStaff('admin_user', 'adminpassword123')}
                      className="stitch-btn-secondary"
                      style={{ padding: '6px 8px', flexDirection: 'column', height: 'auto', minHeight: '44px', gap: '2px', alignItems: 'center' }}
                    >
                      <strong style={{ color: '#c084fc', fontSize: '12px' }}>Admin</strong>
                      <span style={{ fontSize: '10.5px', color: '#98A6A4' }}>admin_user</span>
                    </button>
                  </div>
                </div>

                {/* Operational Footer Status */}
                <div className="stitch-compliance-footer">
                  <span className="mint-pulse-dot" style={{ width: '6px', height: '6px' }} aria-hidden="true" />
                  <span>System Operational &bull; Non-Diagnostic Protocol</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};




