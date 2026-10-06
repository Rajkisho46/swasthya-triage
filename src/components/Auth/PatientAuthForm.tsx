import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Hourglass,
  Check,
  X,
  Shield,
  Languages,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PortalToggle } from './PortalToggle';

type AuthMode =
  | 'login'
  | 'register'
  | 'verify-otp'
  | 'forgot-password'
  | 'reset-password'
  | 'register-success';

interface PatientAuthFormProps {
  activePortalTab?: 'patient' | 'staff';
  onSwitchPortalTab?: (tab: 'patient' | 'staff') => void;
}

export const PatientAuthForm: React.FC<PatientAuthFormProps> = ({
  activePortalTab = 'patient',
  onSwitchPortalTab,
}) => {
  const {
    patientLogin,
    patientRegister,
    patientVerifyEmail,
    patientResendOtp,
    patientRequestReset,
    patientVerifyReset,
    isLoading,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');

  // Form Fields
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [preferredLanguage, setPreferredLanguage] = useState<string>('English');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);

  // Password Reset Fields
  const [resetEmail, setResetEmail] = useState<string>('');
  const [resetOtpDigits, setResetOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');

  // UI state
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [rememberDevice, setRememberDevice] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // OTP 6-box input refs
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const resetOtpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend OTP countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const clearFeedback = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  // Password requirements calculation
  const hasMinLength = password.length >= 8;
  const isPasswordValid = hasMinLength;

  // New Password requirements calculation for reset
  const hasResetMinLength = newPassword.length >= 8;
  const isResetPasswordValid = hasResetMinLength;

  const getCombinedOtp = (digits: string[]) => digits.join('');

  // Handle Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    try {
      await patientLogin(email.trim(), password);
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid email or password.');
    }
  };

  // Handle Registration Step 1
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      setErrorMessage('Please enter a valid real email address (e.g. name@gmail.com).');
      return;
    }

    if (!isPasswordValid) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    try {
      const resp = await patientRegister(
        fullName.trim(),
        email.trim(),
        password,
        preferredLanguage
      );
      setSuccessMessage(resp.message || 'Verification code sent to your email.');
      setResendCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      setMode('verify-otp');
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please try again.');
    }
  };

  // Handle OTP Verification Step 2
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    const fullOtp = getCombinedOtp(otpDigits);
    if (fullOtp.length !== 6) {
      setErrorMessage('Please enter the full 6-digit verification code.');
      return;
    }

    try {
      await patientVerifyEmail(email.trim(), fullOtp);
      setSuccessMessage('Email verified successfully! Opening Patient Portal...');
      setMode('register-success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid or expired verification code.');
    }
  };

  // Handle Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    clearFeedback();
    try {
      const targetEmail = mode === 'reset-password' ? resetEmail : email;
      const purpose = mode === 'reset-password' ? 'PASSWORD_RESET' : 'EMAIL_VERIFICATION';
      const resp = await patientResendOtp(targetEmail.trim(), purpose);
      setSuccessMessage(resp.message || 'A new verification code has been dispatched to your email.');
      setResendCooldown(60);
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to resend verification code. Please wait before trying again.');
    }
  };

  // Handle Forgot Password Step 1
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!resetEmail.trim()) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }

    try {
      const resp = await patientRequestReset(resetEmail.trim());
      setSuccessMessage(resp.message || 'If an account exists, a reset code has been dispatched.');
      setResendCooldown(30);
      setResetOtpDigits(['', '', '', '', '', '']);
      setMode('reset-password');
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to request password reset.');
    }
  };

  // Handle Password Reset Step 2
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    const fullResetOtp = getCombinedOtp(resetOtpDigits);
    if (fullResetOtp.length !== 6) {
      setErrorMessage('Please enter the 6-digit reset code.');
      return;
    }

    if (!isResetPasswordValid) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('New passwords do not match.');
      return;
    }

    try {
      const resp = await patientVerifyReset(resetEmail.trim(), fullResetOtp, newPassword);
      setSuccessMessage(resp.message || 'Password successfully reset. You can now log in.');
      setEmail(resetEmail);
      setPassword('');
      setMode('login');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset password. Check the code and try again.');
    }
  };

  // Masked email formatter matching Stitch design
  const formatMaskedEmail = (mailStr: string) => {
    if (!mailStr || !mailStr.includes('@')) return mailStr;
    const [userPart, domainPart] = mailStr.split('@');
    if (userPart.length <= 2) return `${userPart}••••••@${domainPart}`;
    return `${userPart.charAt(0)}•••••••@${domainPart}`;
  };

  // Helper for 6-pin input interactions
  const handleOtpDigitChange = (
    index: number,
    value: string,
    isReset: boolean = false
  ) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    const currentDigits = isReset ? [...resetOtpDigits] : [...otpDigits];
    const setDigits = isReset ? setResetOtpDigits : setOtpDigits;
    const refs = isReset ? resetOtpInputRefs : otpInputRefs;

    if (cleaned.length > 0) {
      currentDigits[index] = cleaned[cleaned.length - 1];
      setDigits(currentDigits);
      if (index < 5 && refs.current[index + 1]) {
        refs.current[index + 1]?.focus();
      }
    } else {
      currentDigits[index] = '';
      setDigits(currentDigits);
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
    isReset: boolean = false
  ) => {
    const currentDigits = isReset ? resetOtpDigits : otpDigits;
    const refs = isReset ? resetOtpInputRefs : otpInputRefs;

    if (e.key === 'Backspace' && !currentDigits[index] && index > 0) {
      if (refs.current[index - 1]) {
        refs.current[index - 1]?.focus();
      }
    }
  };

  const handleOtpPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    isReset: boolean = false
  ) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
    if (!pasted) return;

    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < 6 && i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    const setDigits = isReset ? setResetOtpDigits : setOtpDigits;
    const refs = isReset ? resetOtpInputRefs : otpInputRefs;

    setDigits(newDigits);
    const nextEmpty = newDigits.findIndex((d) => !d);
    if (nextEmpty !== -1 && refs.current[nextEmpty]) {
      refs.current[nextEmpty]?.focus();
    } else if (refs.current[5]) {
      refs.current[5]?.focus();
    }
  };

  const isOtpComplete = getCombinedOtp(otpDigits).length === 6;
  const isResetOtpComplete = getCombinedOtp(resetOtpDigits).length === 6;

  return (
    <div className="stitch-auth-container">
      {/* Ambient background glow anchor */}
      <div className="stitch-glow-anchor" aria-hidden="true" />

      {/* Main Stitch Clinical Glass Container */}
      <div className="stitch-glass-card">
        {/* Top Radiant Edge Accent */}
        <div className="stitch-rim-highlight" aria-hidden="true" />

        {/* =====================================================================
            VIEW 1: PATIENT LOGIN (compact_patient_login)
            ===================================================================== */}
        {mode === 'login' && (
          <>
            {/* Centered Portal Switcher at the top of the card */}
            {onSwitchPortalTab && (
              <PortalToggle
                activeTab={activePortalTab}
                onTabChange={onSwitchPortalTab}
              />
            )}

            {/* Patient Portal / Secure Access Badge */}
            <div className="stitch-brand-chip" style={{ alignSelf: 'center', marginBottom: '2px' }}>
              <Shield size={12} color="#5DFDDD" />
              <span className="stitch-brand-chip-text" style={{ color: '#5DFDDD' }}>
                PATIENT PORTAL &bull; SECURE ACCESS
              </span>
            </div>

            {/* Header Block */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: '6px', marginBottom: '8px', width: '100%' }}>
              <h1 className="stitch-header-title">Welcome back</h1>
              <p className="stitch-header-subtitle">Secure access to your Swasthya Triage patient portal.</p>
            </div>

            {/* Error Alert Banner */}
            {errorMessage && (
              <div className="stitch-alert-banner" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: '12.5px' }}>
                  <strong>Error:</strong> {errorMessage}
                </div>
                <button
                  type="button"
                  onClick={clearFeedback}
                  style={{ background: 'none', border: 'none', color: '#ffb4ab', cursor: 'pointer', padding: 0 }}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Success Alert Banner */}
            {successMessage && (
              <div className="stitch-success-banner" role="status">
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '12.5px' }}>{successMessage}</span>
              </div>
            )}

            {/* Unverified Email or Missing Account Recovery Prompts */}
            {errorMessage.toLowerCase().includes('verify your email') && (
              <button
                type="button"
                onClick={async () => {
                  clearFeedback();
                  setMode('verify-otp');
                  try {
                    await patientResendOtp(email.trim(), 'EMAIL_VERIFICATION');
                    setSuccessMessage(`Verification code sent to ${formatMaskedEmail(email)}.`);
                    setResendCooldown(60);
                  } catch {
                    // Handled in verify view
                  }
                }}
                className="stitch-btn-secondary"
                style={{ fontSize: '12px', color: '#5DFDDD', height: '40px' }}
              >
                <span>Resend verification code & verify now &rarr;</span>
              </button>
            )}

            {/* Login Form */}
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Email Field */}
              <div className="stitch-form-group">
                <label className="stitch-label" htmlFor="patient-login-email">
                  EMAIL ADDRESS
                </label>
                <div className="stitch-input-container">
                  <span className="stitch-input-icon">
                    <Mail size={18} />
                  </span>
                  <input
                    id="patient-login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your registered email"
                    className="stitch-input"
                    autoComplete="email"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="stitch-form-group">
                <div className="stitch-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="patient-login-password">PASSWORD</label>
                  <button
                    type="button"
                    onClick={() => {
                      clearFeedback();
                      setResetEmail(email);
                      setMode('forgot-password');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#5DFDDD',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 500,
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="stitch-input-container">
                  <span className="stitch-input-icon">
                    <Lock size={18} />
                  </span>
                  <input
                    id="patient-login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
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
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Trust & Remember Device Row */}
              <div className="stitch-trust-row" style={{ marginTop: '2px', marginBottom: '2px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    style={{
                      accentColor: '#5DFDDD',
                      width: '15px',
                      height: '15px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#98A6A4' }}>Remember this device</span>
                </label>
                <span style={{ fontSize: '11.5px', color: '#5DFDDD', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '9999px',
                      backgroundColor: '#5DFDDD',
                      boxShadow: '0 0 8px #5DFDDD',
                      display: 'inline-block',
                    }}
                  />
                  Gateway Active
                </span>
              </div>

              {/* Primary Sign In CTA */}
              <button
                type="submit"
                disabled={isLoading}
                className="stitch-btn-primary"
                id="btn-patient-login"
                style={{ marginTop: '6px' }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              {/* Register row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '8px', fontSize: '13px', color: '#98A6A4' }}>
                <span>Don't have an account?</span>
                <button
                  type="button"
                  onClick={() => {
                    clearFeedback();
                    setMode('register');
                  }}
                  id="btn-go-to-create-account"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#5DFDDD',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Create Patient Account
                </button>
              </div>
            </form>
          </>
        )}

        {/* =====================================================================
            VIEW 2: CREATE PATIENT ACCOUNT (compact_create_patient_account)
            ===================================================================== */}
        {mode === 'register' && (
          <>
            {/* Header Block */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
              <div className="stitch-brand-chip">
                <Shield size={12} color="#5DFDDD" />
                <span className="stitch-brand-chip-text" style={{ color: '#5DFDDD' }}>
                  PATIENT REGISTRATION
                </span>
              </div>
              <h1 className="stitch-header-title">Create your account</h1>
              <p className="stitch-header-subtitle">Register to access your clinical triage records.</p>
            </div>

            {/* Error Alert Banner */}
            {errorMessage && (
              <div className="stitch-alert-banner" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: '12.5px' }}>{errorMessage}</div>
                <button
                  type="button"
                  onClick={clearFeedback}
                  style={{ background: 'none', border: 'none', color: '#ffb4ab', cursor: 'pointer', padding: 0 }}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Registration Form */}
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {/* Full Name */}
              <div className="stitch-form-group">
                <label className="stitch-label" htmlFor="patient-reg-name">
                  Full Name
                </label>
                <div className="stitch-input-container">
                  <span className="stitch-input-icon">
                    <User size={16} />
                  </span>
                  <input
                    id="patient-reg-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="stitch-input"
                    autoComplete="name"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Gmail / Real Email */}
              <div className="stitch-form-group">
                <label className="stitch-label" htmlFor="patient-reg-email">
                  Gmail Address
                </label>
                <div className="stitch-input-container">
                  <span className="stitch-input-icon">
                    <Mail size={16} />
                  </span>
                  <input
                    id="patient-reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    className="stitch-input"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {/* Password Fields Grid */}
              <div className="stitch-reg-password-grid">
                {/* Password */}
                <div className="stitch-form-group">
                  <div className="stitch-label">
                    <label htmlFor="patient-reg-password">Password</label>
                    <span style={{ fontSize: '9.5px', color: '#98A6A4' }}>(8+ chars)</span>
                  </div>
                  <div className="stitch-input-container">
                    <input
                      id="patient-reg-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="stitch-input stitch-input-no-icon stitch-input-pwd"
                      style={{ fontSize: '12.5px', height: '40px' }}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="stitch-eye-toggle"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="stitch-form-group">
                  <label className="stitch-label" htmlFor="patient-reg-confirm">
                    Confirm
                  </label>
                  <div className="stitch-input-container">
                    <input
                      id="patient-reg-confirm"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter"
                      className="stitch-input stitch-input-no-icon stitch-input-pwd"
                      style={{ fontSize: '12.5px', height: '40px' }}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="stitch-eye-toggle"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Preferred Language Selector */}
              <div className="stitch-form-group">
                <label className="stitch-label" htmlFor="patient-reg-lang">
                  <span>Preferred Language</span>
                  <Languages size={12} color="#98A6A4" />
                </label>
                <select
                  id="patient-reg-lang"
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  className="stitch-input stitch-input-no-icon"
                  style={{
                    height: '38px',
                    fontSize: '13px',
                    backgroundColor: '#141C1E',
                    color: '#F4F7F6',
                    border: '1px solid rgba(255, 255, 255, 0.10)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="English">English</option>
                  <option value="Hindi">Hindi (हिंदी)</option>
                  <option value="Bengali">Bengali (বাংলা)</option>
                  <option value="Telugu">Telugu (తెలుగు)</option>
                  <option value="Marathi">Marathi (मराठी)</option>
                  <option value="Tamil">Tamil (தமிழ்)</option>
                </select>
              </div>

              {/* Password Requirements */}
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: '10px',
                  background: '#0B1214',
                  border: '1px solid rgba(255, 255, 255, 0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: hasMinLength ? '#5DFDDD' : '#98A6A4',
                }}
              >
                {hasMinLength ? <Check size={12} /> : <X size={12} />}
                <span>Password must be at least 8 characters.</span>
              </div>

              {/* Security Callout Note */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  borderRadius: '10px',
                  background: '#141C1E',
                  border: '1px solid rgba(255, 255, 255, 0.10)',
                }}
              >
                <ShieldCheck size={14} color="#5DFDDD" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: '#98A6A4', lineHeight: 1.2 }}>
                  Your email will be verified with a 6-digit one-time password (OTP).
                </span>
              </div>

              {/* Primary Submit CTA */}
              <button
                type="submit"
                disabled={isLoading || !isPasswordValid || password !== confirmPassword}
                className="stitch-btn-primary"
                id="btn-submit-registration"
                style={{ marginTop: '2px' }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {/* Bottom Nav to Sign In */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <div style={{ fontSize: '12.5px', color: '#98A6A4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>Already have an account?</span>
                <button
                  type="button"
                  onClick={() => {
                    clearFeedback();
                    setMode('login');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#5DFDDD',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Sign In
                </button>
              </div>

              <div className="stitch-compliance-footer">
                <ShieldCheck size={12} color="#5DFDDD" />
                <span>ABDM & National Health Authority Standards</span>
              </div>
            </div>
          </>
        )}

        {/* =====================================================================
            VIEW 3: EMAIL OTP VERIFICATION (compact_email_otp_verification)
            ===================================================================== */}
        {mode === 'verify-otp' && (
          <>
            {/* Header Block */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '3px' }}>
              <div className="stitch-brand-chip">
                <Shield size={12} color="#5DFDDD" />
                <span className="stitch-brand-chip-text" style={{ color: '#5DFDDD' }}>
                  IDENTITY VERIFICATION
                </span>
              </div>
              <h1 className="stitch-header-title">Verify your email</h1>
              <p className="stitch-header-subtitle">
                Enter the 6-digit clinical intake code dispatched to your registered address.
              </p>

              {/* Masked Email Chip */}
              <div className="stitch-email-chip">
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Mail size={13} color="#5DFDDD" />
                  <span className="stitch-email-chip-text">{formatMaskedEmail(email)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearFeedback();
                    setMode('register');
                  }}
                  className="stitch-email-chip-action"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Error Alert Banner */}
            {errorMessage && (
              <div className="stitch-alert-banner" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: '12.5px' }}>{errorMessage}</div>
                <button
                  type="button"
                  onClick={clearFeedback}
                  style={{ background: 'none', border: 'none', color: '#ffb4ab', cursor: 'pointer', padding: 0 }}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Success Alert Banner */}
            {successMessage && (
              <div className="stitch-success-banner" role="status">
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '12.5px' }}>{successMessage}</span>
              </div>
            )}

            {/* OTP Form Matrix */}
            <form onSubmit={handleVerifyOtpSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '10px' }}>
              {/* 6-Pin Input Segment */}
              <div className="stitch-otp-grid" id="otp-inputs-container">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputRefs.current[idx] = el;
                    }}
                    id={`otp-box-${idx}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(idx, e.target.value, false)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e, false)}
                    onPaste={(e) => handleOtpPaste(e, false)}
                    className={`stitch-otp-box ${errorMessage ? 'stitch-otp-error' : ''}`}
                    autoFocus={idx === 0}
                    autoComplete="one-time-code"
                    aria-label={`Verification Digit ${idx + 1}`}
                  />
                ))}
              </div>

              {/* Dynamic Feedback Notification Anchor */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '18px' }}>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '9999px',
                    backgroundColor: '#5DFDDD',
                    boxShadow: '0 0 8px #5DFDDD',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '11.5px', color: '#98A6A4', fontWeight: 500 }}>
                  {isOtpComplete ? 'Complete code entered. Ready to confirm.' : 'Ready for code entry'}
                </span>
              </div>

              {/* Timer / Resend Row */}
              <div className="stitch-timer-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#98A6A4' }}>
                  <Hourglass size={13} color="#5DFDDD" />
                  <span>
                    Resend in <strong style={{ color: '#F4F7F6' }}>00:{resendCooldown < 10 ? `0${resendCooldown}` : resendCooldown}</strong>
                  </span>
                </div>

                <button
                  type="button"
                  disabled={resendCooldown > 0 || isLoading}
                  onClick={handleResendOtp}
                  id="btn-resend-otp"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: resendCooldown > 0 ? '#98A6A4' : '#5DFDDD',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: resendCooldown > 0 ? 0.5 : 1,
                  }}
                >
                  <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
                  <span>Resend OTP</span>
                </button>
              </div>

              {/* Primary Verification CTA */}
              <button
                type="submit"
                disabled={isLoading || !isOtpComplete}
                className="stitch-btn-primary"
                id="btn-verify-otp"
                style={{ marginTop: '4px' }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Verifying Email...</span>
                  </>
                ) : (
                  <>
                    <span>Verify Email</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {/* Security Callout */}
            <div className="stitch-compliance-footer">
              <ShieldCheck size={13} color="#5DFDDD" />
              <span>Never share your triage verification code with anyone.</span>
            </div>
          </>
        )}

        {/* =====================================================================
            VIEW 4: FORGOT PASSWORD REQUEST
            ===================================================================== */}
        {mode === 'forgot-password' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
              <div className="stitch-brand-chip">
                <Shield size={12} color="#5DFDDD" />
                <span className="stitch-brand-chip-text" style={{ color: '#5DFDDD' }}>
                  ACCOUNT RECOVERY
                </span>
              </div>
              <h1 className="stitch-header-title">Reset password</h1>
              <p className="stitch-header-subtitle">
                Enter your registered Gmail address to receive a 6-digit recovery code.
              </p>
            </div>

            {errorMessage && (
              <div className="stitch-alert-banner" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: '12.5px' }}>{errorMessage}</div>
                <button
                  type="button"
                  onClick={clearFeedback}
                  style={{ background: 'none', border: 'none', color: '#ffb4ab', cursor: 'pointer', padding: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {successMessage && (
              <div className="stitch-success-banner" role="status">
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '12.5px' }}>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="stitch-form-group">
                <label className="stitch-label" htmlFor="forgot-email">
                  Registered Email Address
                </label>
                <div className="stitch-input-container">
                  <span className="stitch-input-icon">
                    <Mail size={16} />
                  </span>
                  <input
                    id="forgot-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="patient@gmail.com"
                    className="stitch-input"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !resetEmail.trim()}
                className="stitch-btn-primary"
                id="btn-send-reset-otp"
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Sending Code...</span>
                  </>
                ) : (
                  <>
                    <span>Send Reset Code</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setMode('login');
                }}
                className="stitch-btn-secondary"
              >
                <span>&larr; Back to Patient Login</span>
              </button>
            </form>
          </>
        )}

        {/* =====================================================================
            VIEW 5: SET NEW PASSWORD WITH OTP
            ===================================================================== */}
        {mode === 'reset-password' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
              <div className="stitch-brand-chip">
                <Shield size={12} color="#5DFDDD" />
                <span className="stitch-brand-chip-text" style={{ color: '#5DFDDD' }}>
                  SET NEW PASSWORD
                </span>
              </div>
              <h1 className="stitch-header-title">Enter recovery code</h1>
              <p className="stitch-header-subtitle">
                Enter the 6-digit code sent to {formatMaskedEmail(resetEmail)} and create a new password.
              </p>
            </div>

            {errorMessage && (
              <div className="stitch-alert-banner" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: '12.5px' }}>{errorMessage}</div>
                <button
                  type="button"
                  onClick={clearFeedback}
                  style={{ background: 'none', border: 'none', color: '#ffb4ab', cursor: 'pointer', padding: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* 6-Pin Reset OTP Grid */}
              <div className="stitch-form-group">
                <label className="stitch-label" style={{ textAlign: 'center', justifyContent: 'center' }}>
                  6-Digit Recovery Code
                </label>
                <div className="stitch-otp-grid">
                  {resetOtpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        resetOtpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(idx, e.target.value, true)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e, true)}
                      onPaste={(e) => handleOtpPaste(e, true)}
                      className="stitch-otp-box"
                      autoFocus={idx === 0}
                      aria-label={`Reset Digit ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>

              {/* New Password */}
              <div className="stitch-form-group">
                <label className="stitch-label" htmlFor="reset-new-password">
                  New Password (8+ chars)
                </label>
                <div className="stitch-input-container">
                  <span className="stitch-input-icon">
                    <Lock size={16} />
                  </span>
                  <input
                    id="reset-new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="stitch-input stitch-input-pwd"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="stitch-eye-toggle"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div className="stitch-form-group">
                <label className="stitch-label" htmlFor="reset-confirm-password">
                  Confirm New Password
                </label>
                <div className="stitch-input-container">
                  <span className="stitch-input-icon">
                    <Lock size={16} />
                  </span>
                  <input
                    id="reset-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="stitch-input stitch-input-pwd"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="stitch-eye-toggle"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Password Requirement */}
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: '10px',
                  background: '#0B1214',
                  border: '1px solid rgba(255, 255, 255, 0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: hasResetMinLength ? '#5DFDDD' : '#98A6A4',
                }}
              >
                {hasResetMinLength ? <Check size={12} /> : <X size={12} />}
                <span>Password must be at least 8 characters.</span>
              </div>

              <button
                type="submit"
                disabled={isLoading || !isResetOtpComplete || !isResetPasswordValid || newPassword !== confirmNewPassword}
                className="stitch-btn-primary"
                id="btn-submit-reset-password"
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Resetting Password...</span>
                  </>
                ) : (
                  <>
                    <span>Reset Password</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                <button
                  type="button"
                  onClick={() => {
                    clearFeedback();
                    setMode('login');
                  }}
                  style={{ background: 'none', border: 'none', color: '#98A6A4', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  &larr; Cancel
                </button>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || isLoading}
                  onClick={handleResendOtp}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: resendCooldown > 0 ? '#98A6A4' : '#5DFDDD',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend Code'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
