import React, { useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  HeartPulse,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PatientAuthForm } from './PatientAuthForm';


export const LoginScreen: React.FC = () => {
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
    <div
      className="login-screen-container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Decorative ambient background glows matching Swasthya Triage theme */}
      <div className="ambient-glow-teal" style={{ top: '10%', left: '20%' }} aria-hidden="true" />
      <div className="ambient-glow-champagne" style={{ bottom: '15%', right: '20%' }} aria-hidden="true" />

      {/* Top Portal Switcher (Compact Navigation) */}
      <div
        style={{
          width: '100%',
          maxWidth: '416px',
          marginBottom: '0.85rem',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            padding: '3px',
            borderRadius: '9999px',
            background: 'rgba(16, 20, 25, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            backdropFilter: 'blur(16px)',
            width: '100%',
          }}
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activePortalTab === 'patient'}
            onClick={() => setActivePortalTab('patient')}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '9999px',
              border: 'none',
              background: activePortalTab === 'patient' ? '#5bfbdb' : 'transparent',
              color: activePortalTab === 'patient' ? '#00382e' : '#bacac4',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              boxShadow: activePortalTab === 'patient' ? '0 2px 10px rgba(91, 251, 219, 0.3)' : 'none',
            }}
            id="tab-patient-portal"
          >
            <HeartPulse size={14} color={activePortalTab === 'patient' ? '#00382e' : '#47dbd5'} />
            <span>PATIENT PORTAL</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activePortalTab === 'staff'}
            onClick={() => setActivePortalTab('staff')}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '9999px',
              border: 'none',
              background: activePortalTab === 'staff' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
              color: activePortalTab === 'staff' ? '#ffffff' : '#bacac4',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
            id="tab-staff-portal"
          >
            <ShieldCheck size={14} color={activePortalTab === 'staff' ? '#5bfbdb' : '#85948f'} />
            <span>STAFF DEMO</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          PORTAL 1: REAL PATIENT ACCOUNT AUTHENTICATION (STITCH DESIGN)
          ========================================================================= */}
      {activePortalTab === 'patient' && (
        <PatientAuthForm onSwitchToStaffLogin={() => setActivePortalTab('staff')} />
      )}

      {/* =========================================================================
          PORTAL 2: STAFF & CLINICAL DEMO LOGIN (NURSE, DOCTOR, ADMIN)
          ========================================================================= */}
      {activePortalTab === 'staff' && (
        <div
          className="glass-card login-card"
          style={{
            width: '100%',
            maxWidth: '416px',
            borderRadius: '20px',
            padding: '1.75rem 1.65rem',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            background: 'rgba(255, 255, 255, 0.045)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '1.15rem' }}>
            <div className="badge badge-teal glass" style={{ fontSize: '0.70rem', marginBottom: '0.35rem' }}>
              STAFF CLINICAL EVALUATION CONSOLE
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Staff Authentication
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              Demo access for Nurses, Doctors, and Administrators.
            </p>
          </div>

            {/* Error Alert */}
            {errorMessage && (
              <div
                className="glass-card"
                style={{
                  padding: '0.75rem 0.90rem',
                  marginBottom: '1.25rem',
                  border: '1px solid rgba(248, 113, 113, 0.4)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: '#fca5a5',
                  fontSize: '0.84rem',
                }}
                role="alert"
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleStaffSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label
                  htmlFor="staff-username"
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Staff Username
                </label>
                <div style={{ position: 'relative' }}>
                  <User
                    size={16}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
                    aria-hidden="true"
                  />
                  <input
                    id="staff-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. dr_sharma"
                    className="glass-input"
                    style={{
                      width: '100%',
                      paddingLeft: '40px',
                      paddingRight: '14px',
                      minHeight: '44px',
                      fontSize: '0.90rem',
                    }}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="staff-password"
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={16}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
                    aria-hidden="true"
                  />
                  <input
                    id="staff-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="glass-input"
                    style={{
                      width: '100%',
                      paddingLeft: '40px',
                      paddingRight: '44px',
                      minHeight: '44px',
                      fontSize: '0.90rem',
                    }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '6px',
                    }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary glass"
                style={{
                  marginTop: '0.35rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '46px',
                  fontSize: '0.90rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: isLoading ? 'wait' : 'pointer',
                  width: '100%',
                }}
                id="btn-staff-sign-in"
              >
                {isLoading ? 'Authenticating...' : 'SIGN IN AS STAFF'}
              </button>
            </form>

            {/* 1-Click Demo Fill Helpers */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                1-Click Demo Role Autofill:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => handleQuickFillStaff('dr_sharma', 'doctorpassword123')}
                  className="btn btn-secondary glass"
                  style={{ fontSize: '0.72rem', padding: '0.35rem 0.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column' }}
                >
                  <strong style={{ color: 'var(--teal)' }}>Doctor</strong>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>dr_sharma</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFillStaff('nurse_priya', 'nursepassword123')}
                  className="btn btn-secondary glass"
                  style={{ fontSize: '0.72rem', padding: '0.35rem 0.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column' }}
                >
                  <strong style={{ color: 'var(--mint)' }}>Nurse</strong>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>nurse_priya</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFillStaff('admin_user', 'adminpassword123')}
                  className="btn btn-secondary glass"
                  style={{ fontSize: '0.72rem', padding: '0.35rem 0.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column' }}
                >
                  <strong style={{ color: '#c084fc' }}>Admin</strong>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>admin_user</span>
                </button>
              </div>
            </div>

            {/* Operational Footer Status */}
            <div
              style={{
                marginTop: '1.25rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                fontSize: '0.74rem',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="pulse-indicator-teal" aria-hidden="true" />
              <span style={{ fontWeight: 600 }}>System Operational</span>
              <span style={{ color: 'var(--text-muted)' }}>&bull;</span>
              <ShieldCheck size={13} color="var(--mint)" aria-hidden="true" />
              <span>Non-Diagnostic Protocol</span>
            </div>
          </div>
        )}
      </div>
    );
  };



