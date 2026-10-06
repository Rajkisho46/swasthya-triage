import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Cpu,
  Cookie,
  Accessibility,
  X,
  Building2,
  Mail,
  Scale,
  Mic,
  CheckCircle2,
  Layers,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

export type TrustCenterTab =
  | 'overview'
  | 'privacy'
  | 'terms'
  | 'disclaimer'
  | 'cookies'
  | 'consent'
  | 'multimodal'
  | 'ai-transparency'
  | 'third-party'
  | 'accessibility'
  | 'contact';

interface PrivacyTrustCenterProps {
  isOpen: boolean;
  initialTab?: TrustCenterTab;
  onClose: () => void;
}

export const PrivacyTrustCenter: React.FC<PrivacyTrustCenterProps> = ({
  isOpen,
  initialTab = 'overview',
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TrustCenterTab>(initialTab);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Keyboard accessibility: Focus trap, Escape listener, and focus restoration
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay trust-center-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trust-center-title"
    >
      <div
        className="modal-content glass-card trust-center-modal"
        ref={modalRef}
        style={{
          maxWidth: '1080px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        {/* Modal Top Header Bar */}
        <div
          className="trust-center-header glass-header"
          style={{
            padding: '1.25rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              className="title-icon-box glass"
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-md)',
              }}
              aria-hidden="true"
            >
              <ShieldCheck size={22} color="var(--mint)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2
                  id="trust-center-title"
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    margin: 0,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Privacy, Safety & Trust Center
                </h2>
                <span className="badge badge-teal" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}>
                  Institutional Governance
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.80rem', color: 'var(--text-muted)' }}>
                Swasthya Triage &bull; Transparency, Data Protection & Non-Diagnostic Clinical Safety
              </p>
            </div>
          </div>

          <button
            type="button"
            ref={closeBtnRef}
            className="btn btn-secondary glass"
            onClick={onClose}
            aria-label="Close Privacy & Trust Center"
            style={{
              width: '38px',
              height: '38px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Modal Main Body: Sidebar Tabs + Content Panel */}
        <div
          className="trust-center-body"
          style={{
            display: 'grid',
            gridTemplateColumns: '260px 1fr',
            flex: 1,
            overflow: 'hidden',
            minHeight: '520px',
          }}
        >
          {/* Left Navigation Sidebar */}
          <nav
            className="trust-center-nav glass"
            aria-label="Trust Center Sections"
            style={{
              padding: '1rem 0.75rem',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              background: 'rgba(16, 20, 25, 0.55)',
            }}
          >
            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
              aria-current={activeTab === 'overview' ? 'true' : undefined}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Trust Overview</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setActiveTab('privacy')}
              aria-current={activeTab === 'privacy' ? 'true' : undefined}
            >
              <Lock size={16} aria-hidden="true" />
              <span>Privacy Policy</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'terms' ? 'active' : ''}`}
              onClick={() => setActiveTab('terms')}
              aria-current={activeTab === 'terms' ? 'true' : undefined}
            >
              <Scale size={16} aria-hidden="true" />
              <span>Terms of Service</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'disclaimer' ? 'active' : ''}`}
              onClick={() => setActiveTab('disclaimer')}
              aria-current={activeTab === 'disclaimer' ? 'true' : undefined}
            >
              <ShieldAlert size={16} aria-hidden="true" />
              <span>Clinical Disclaimer</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'cookies' ? 'active' : ''}`}
              onClick={() => setActiveTab('cookies')}
              aria-current={activeTab === 'cookies' ? 'true' : undefined}
            >
              <Cookie size={16} aria-hidden="true" />
              <span>Cookie & Storage</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'consent' ? 'active' : ''}`}
              onClick={() => setActiveTab('consent')}
              aria-current={activeTab === 'consent' ? 'true' : undefined}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>Consent & DPDP Notice</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'multimodal' ? 'active' : ''}`}
              onClick={() => setActiveTab('multimodal')}
              aria-current={activeTab === 'multimodal' ? 'true' : undefined}
            >
              <Mic size={16} aria-hidden="true" />
              <span>Voice & OCR Privacy</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'ai-transparency' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai-transparency')}
              aria-current={activeTab === 'ai-transparency' ? 'true' : undefined}
            >
              <Cpu size={16} aria-hidden="true" />
              <span>AI Transparency</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'third-party' ? 'active' : ''}`}
              onClick={() => setActiveTab('third-party')}
              aria-current={activeTab === 'third-party' ? 'true' : undefined}
            >
              <Layers size={16} aria-hidden="true" />
              <span>Third-Party & Assets</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'accessibility' ? 'active' : ''}`}
              onClick={() => setActiveTab('accessibility')}
              aria-current={activeTab === 'accessibility' ? 'true' : undefined}
            >
              <Accessibility size={16} aria-hidden="true" />
              <span>Accessibility</span>
            </button>

            <button
              type="button"
              className={`trust-nav-btn glass ${activeTab === 'contact' ? 'active' : ''}`}
              onClick={() => setActiveTab('contact')}
              aria-current={activeTab === 'contact' ? 'true' : undefined}
            >
              <Mail size={16} aria-hidden="true" />
              <span>Contact & DPO</span>
            </button>

            <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
              <div
                className="glass-card"
                style={{
                  padding: '0.65rem 0.75rem',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--mint)', marginBottom: '0.2rem' }}>
                  Core Safety Principle
                </div>
                AI ASSISTS &bull; HUMAN CLINICIAN DECIDES
              </div>
            </div>
          </nav>

          {/* Right Scrollable Content Panel */}
          <main
            className="trust-center-content"
            style={{
              padding: '1.5rem 2rem',
              overflowY: 'auto',
              color: 'var(--text-secondary)',
              fontSize: '0.90rem',
              lineHeight: 1.65,
            }}
          >
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="trust-tab-panel">
                <div style={{ marginBottom: '1.5rem' }}>
                  <div className="intake-step-badge">GOVERNANCE & TRUST HUB</div>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.5rem 0' }}>
                    Institutional Privacy, Safety & Trust Architecture
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Swasthya Triage is an institutional healthcare triage decision-support prototype engineered with human-in-the-loop clinical governance, privacy by design, and strict non-diagnostic boundaries.
                  </p>
                </div>

                {/* 4 Pillars of Trust */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  <div className="glass-card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem', color: 'var(--mint)' }}>
                      <Lock size={18} />
                      <strong style={{ color: 'var(--text-primary)' }}>Data Minimization</strong>
                    </div>
                    <p style={{ fontSize: '0.82rem', margin: 0 }}>
                      Collects only necessary triage narrative data with anonymous patient identifiers (<code className="font-mono">PT-xxxx</code>) and zero tracking telemetry.
                    </p>
                  </div>

                  <div className="glass-card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem', color: 'var(--teal)' }}>
                      <Cpu size={18} />
                      <strong style={{ color: 'var(--text-primary)' }}>AI Advisory Guardrails</strong>
                    </div>
                    <p style={{ fontSize: '0.82rem', margin: 0 }}>
                      AI never diagnoses or prescribes autonomously. Outputs are strictly advisory summaries for clinician evaluation.
                    </p>
                  </div>

                  <div className="glass-card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem', color: 'var(--champagne)' }}>
                      <ShieldAlert size={18} />
                      <strong style={{ color: 'var(--text-primary)' }}>Clinician Decision</strong>
                    </div>
                    <p style={{ fontSize: '0.82rem', margin: 0 }}>
                      Every case requires explicit, mandatory qualified Medical Officer review and disposition sign-off before finalization.
                    </p>
                  </div>

                  <div className="glass-card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem', color: 'var(--seafoam)' }}>
                      <CheckCircle2 size={18} />
                      <strong style={{ color: 'var(--text-primary)' }}>Full Auditability</strong>
                    </div>
                    <p style={{ fontSize: '0.82rem', margin: 0 }}>
                      Chronological immutable event ledger tracks intake, multimodal parsing, AI advisory generation, and clinician decisions.
                    </p>
                  </div>
                </div>

                {/* Quick Links / Quick Cards */}
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  Explore Policies & Declarations
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <button
                    type="button"
                    className="glass-card trust-quick-card"
                    onClick={() => setActiveTab('privacy')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1.15rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block' }}>Privacy Policy</strong>
                      <span style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>
                        Learn how patient demographic, voice, document, and triage data is processed and protected.
                      </span>
                    </div>
                    <ChevronRight size={16} color="var(--mint)" />
                  </button>

                  <button
                    type="button"
                    className="glass-card trust-quick-card"
                    onClick={() => setActiveTab('disclaimer')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1.15rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block' }}>Clinical & Emergency Disclaimer</strong>
                      <span style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>
                        Clear notice regarding non-diagnostic decision-support scope and emergency care procedures.
                      </span>
                    </div>
                    <ChevronRight size={16} color="var(--mint)" />
                  </button>

                  <button
                    type="button"
                    className="glass-card trust-quick-card"
                    onClick={() => setActiveTab('ai-transparency')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1.15rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block' }}>AI Transparency & Model Capabilities</strong>
                      <span style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>
                        Detailed documentation of LLM extraction logic, safety constraints, and deterministic fallbacks.
                      </span>
                    </div>
                    <ChevronRight size={16} color="var(--mint)" />
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: PRIVACY POLICY */}
            {activeTab === 'privacy' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">TRANSPARENCY & DATA PRIVACY</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  Privacy Policy
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Effective Date: September 2026 &bull; Version 2.4 (Institutional Clinical Release)
                </p>

                <div className="trust-policy-section">
                  <h4>1. What Swasthya Triage Is</h4>
                  <p>
                    <strong>Swasthya Triage</strong> is a multimodal healthcare triage assistance and clinical decision-support system. It is designed to assist frontline healthcare workers and clinicians in organizing patient-reported symptoms, transcribing voice statements, extracting medical document text, and highlighting urgency signals. It is a clinical decision-support tool, <strong>not an autonomous diagnostic medical device</strong>.
                  </p>

                  <h4>2. Categories of Information Collected</h4>
                  <p>The system collects and processes the following limited categories of information strictly for triage workflow execution:</p>
                  <ul>
                    <li>
                      <strong>Patient Demographic Information:</strong> Age (optional), gender (optional), preferred spoken language, and an anonymized pseudonymous patient identifier (<code className="font-mono">PT-xxxx</code>). No national identity numbers, home addresses, or phone numbers are requested.
                    </li>
                    <li>
                      <strong>Symptoms & Clinical Narrative:</strong> Verbatim patient-reported statements, symptom duration, onset history, and severity descriptions.
                    </li>
                    <li>
                      <strong>Voice Recordings & Transcriptions:</strong> Transient audio recordings captured during active patient intake and their verbatim speech-to-text text transcriptions.
                    </li>
                    <li>
                      <strong>Uploaded Medical Documents & OCR Data:</strong> Extracted text and metadata from user-provided lab reports, discharge summaries, or radiology reports.
                    </li>
                    <li>
                      <strong>Multilingual Translation Data:</strong> Source language text and normalized English representations for cross-language medical review.
                    </li>
                    <li>
                      <strong>Clinical Review & Decision Records:</strong> Human reviewer observations, verified triage categories (Routine Review, Escalate to Senior Medical Officer, Refer to Higher Facility), and review timestamps.
                    </li>
                    <li>
                      <strong>Audit Trail Data:</strong> Immutable chronological logs of system actions, user interactions, AI structuring events, and clinician sign-offs.
                    </li>
                  </ul>

                  <h4>3. Purpose & Legal Basis of Processing</h4>
                  <p>
                    Each category of information is processed solely for the following specified purposes:
                  </p>
                  <ul>
                    <li>Structuring raw multimodal patient intake into an organized triage summary.</li>
                    <li>Identifying objective clinical urgency signals according to configured clinical rules.</li>
                    <li>Facilitating expedited review and sign-off by qualified healthcare officers.</li>
                    <li>Maintaining clinical accountability through an in-memory chronological audit trail.</li>
                  </ul>

                  <h4>4. Storage, Retention & Transient Handling</h4>
                  <p>
                    In this clinical deployment environment:
                  </p>
                  <ul>
                    <li>Patient intake and audit records exist primarily in transient in-memory application state and an optional local SQLite database (<code className="font-mono">swasthya_triage.db</code>) when running in backend server mode.</li>
                    <li>Audio recordings processed via the speech-to-text pipeline are held temporarily in memory for transcription and discarded immediately after processing.</li>
                    <li>Users can clear active session data and restore baseline state at any time using the <strong>Reset Workspace</strong> command.</li>
                  </ul>

                  <h4>5. Third-Party AI & Processing Providers</h4>
                  <p>
                    When configured with live API credentials, the system interfaces with:
                  </p>
                  <ul>
                    <li>
                      <strong>Google Gemini API (Google Cloud):</strong> Used for verbatim speech-to-text transcription and structured triage note summarization via secure, server-side proxies. No client-side API keys are exposed.
                    </li>
                    <li>
                      <strong>Deterministic Rule Engine Fallback:</strong> If third-party AI APIs are unavailable or unconfigured, the system automatically falls back to an entirely local, deterministic rule processor with zero external network transmission.
                    </li>
                  </ul>

                  <h4>6. Security Measures</h4>
                  <p>
                    Security controls implemented include:
                  </p>
                  <ul>
                    <li>Zero client-side API credential exposure (verified via automated security proxy test suites).</li>
                    <li>Pseudonymous identifiers generated client-side and server-side to prevent unnecessary personal identification.</li>
                    <li>Role-based access control (RBAC) and safety validator middleware on backend endpoints.</li>
                    <li>Strict input validation restricting audio formats, document types, and payload sizes.</li>
                  </ul>

                  <h4>7. User Rights & Contact</h4>
                  <p>
                    Users and clinical teams have the right to inspect case records, request data deletion (via Reset Workspace or administrative request), and withdraw consent prior to clinical sign-off. For inquiries:
                  </p>
                  <p style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                    <strong>Organization:</strong> [ORGANIZATION NAME]<br />
                    <strong>Privacy Contact:</strong> [PRIVACY CONTACT EMAIL]<br />
                    <strong>Data Protection Officer:</strong> [DATA PROTECTION OFFICER]<br />
                    <strong>Operational Node:</strong> Primary Health Centre (PHC) Evaluation Node
                  </p>
                </div>
              </div>
            )}

            {/* TAB 3: TERMS OF SERVICE */}
            {activeTab === 'terms' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">TERMS OF USE & SERVICE AGREEMENT</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  Terms & Conditions
                </h3>

                <div className="trust-policy-section">
                  <h4>1. Acceptance of Terms</h4>
                  <p>
                    By accessing or utilizing the Swasthya Triage application, you acknowledge that you have read, understood, and agreed to these Terms & Conditions. If you do not agree, do not use the system.
                  </p>

                  <h4>2. Service Description & Intended Use</h4>
                  <p>
                    Swasthya Triage provides structured clinical decision-support and multimodal intake assistance for healthcare workers and clinicians. The application is intended for institutional evaluation, triage prioritization support, and clinical workflow assistance.
                  </p>

                  <div
                    className="glass-card"
                    style={{
                      padding: '0.85rem 1rem',
                      borderColor: 'var(--champagne)',
                      backgroundColor: 'rgba(226, 195, 130, 0.08)',
                      margin: '1rem 0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--champagne)', fontWeight: 700 }}>
                      <ShieldAlert size={18} />
                      <span>HEALTHCARE & NON-DIAGNOSTIC MANDATE</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: '0.4rem 0 0 0' }}>
                      <strong>Swasthya Triage is NOT a substitute for professional medical judgment, diagnosis, or treatment.</strong> AI extraction outputs are provisional and strictly advisory. <strong>Final clinical decisions and patient dispositions remain the sole responsibility of an authorized, qualified healthcare professional.</strong>
                    </p>
                  </div>

                  <h4>3. Emergency Disclaimer</h4>
                  <p>
                    <strong>Do not rely on this application for emergency medical care.</strong> If a patient is experiencing a life-threatening medical emergency (such as severe acute chest pain, uncontrolled hemorrhage, profound respiratory distress, or loss of consciousness), immediately summon local emergency medical services or transfer the patient to an emergency care department.
                  </p>

                  <h4>4. User Responsibilities</h4>
                  <p>Users of the system agree to:</p>
                  <ul>
                    <li>Obtain informed patient or guardian consent prior to capturing intake information.</li>
                    <li>Verify all AI-generated extractions against raw patient statements and uploaded documents.</li>
                    <li>Refrain from inputting unnecessary high-risk identifying details (e.g. financial data, passwords).</li>
                    <li>Utilize the system in accordance with applicable healthcare facility guidelines and laws.</li>
                  </ul>

                  <h4>5. Intellectual Property & Academic Fair Use</h4>
                  <p>
                    The Swasthya Triage system architecture, user interface components, and documentation are provided for healthcare innovation, hackathon evaluation, and clinical research purposes. Open-source dependencies remain subject to their respective open-source licenses (MIT, Apache 2.0).
                  </p>

                  <h4>6. Limitation of Liability</h4>
                  <p>
                    To the maximum extent permitted by applicable law, the developers and operators of Swasthya Triage shall not be liable for any direct, indirect, incidental, or consequential damages arising from the use or inability to use this decision-support software.
                  </p>

                  <h4>7. Inquiries & Contact</h4>
                  <p>
                    For questions regarding these terms: <code className="font-mono">[PRIVACY CONTACT EMAIL]</code> | <code className="font-mono">[ORGANIZATION NAME]</code>
                  </p>
                </div>
              </div>
            )}

            {/* TAB 4: CLINICAL DISCLAIMER */}
            {activeTab === 'disclaimer' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">CLINICAL SAFETY DECLARATION</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  Healthcare & Emergency Disclaimer
                </h3>

                <div
                  className="glass-card"
                  style={{
                    padding: '1.25rem',
                    borderColor: 'var(--teal)',
                    backgroundColor: 'rgba(53, 224, 193, 0.06)',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--mint)', marginBottom: '0.5rem' }}>
                    <ShieldCheck size={20} />
                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                      Decision-Support Boundary Statement
                    </h4>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.90rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    "Swasthya Triage provides structured clinical decision-support information and AI-generated advisory summaries. It does not provide autonomous diagnosis, prescriptions, or final clinical dispositions. Clinical decisions remain with an authorized healthcare professional."
                  </p>
                </div>

                <div
                  className="glass-card"
                  style={{
                    padding: '1.25rem',
                    borderColor: 'var(--urgency-high)',
                    backgroundColor: 'rgba(255, 99, 132, 0.08)',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--urgency-high)', marginBottom: '0.5rem' }}>
                    <AlertTriangle size={20} />
                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                      Emergency Medical Care Warning
                    </h4>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.90rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    "Do not rely on this application for emergency care. Contact appropriate emergency medical services immediately."
                  </p>
                </div>

                <div className="trust-policy-section">
                  <h4>Human-in-the-Loop Clinical Governance</h4>
                  <p>
                    Every automated calculation and natural language summary in Swasthya Triage is architected around the fundamental tenet:
                  </p>
                  <p style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', color: 'var(--mint)', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)' }}>
                    AI ASSISTS. HUMAN CLINICIAN DECIDES.
                  </p>
                  <p>
                    Frontline workers and medical officers should always correlate software-suggested urgency signals with direct physical assessment, vital signs, and bedside clinical judgment.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 5: COOKIE & STORAGE */}
            {activeTab === 'cookies' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">STORAGE & TRACKING DISCLOSURE</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  Cookie & Storage Policy
                </h3>

                <div className="trust-policy-section">
                  <h4>1. Zero Non-Essential Tracking Cookies</h4>
                  <div
                    className="glass-card"
                    style={{
                      padding: '1rem',
                      borderColor: 'var(--mint)',
                      backgroundColor: 'rgba(53, 224, 193, 0.05)',
                      marginBottom: '1rem',
                    }}
                  >
                    <strong style={{ color: 'var(--mint)' }}>Honest Disclosure:</strong>
                    <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                      This application does not use advertising cookies, marketing pixels, social trackers, third-party profiling scripts, or persistent cross-site tracking identifiers.
                    </p>
                  </div>

                  <h4>2. Client Storage & Ephemeral State</h4>
                  <p>
                    The application uses only strictly technically necessary, ephemeral in-memory state:
                  </p>
                  <ul>
                    <li>
                      <strong>React Application State (RAM):</strong> Holds active case data, patient symptoms, and in-memory audit logs during the active browser session. This data is cleared whenever the page is reloaded or the Reset Workspace button is clicked.
                    </li>
                    <li>
                      <strong>Local SQLite Storage (Backend Mode):</strong> In full-stack deployment, case records and audit trails are persisted locally in <code className="font-mono">swasthya_triage.db</code> solely to fulfill clinical record-keeping requirements.
                    </li>
                    <li>
                      <strong>Browser Local Storage / Session Storage:</strong> No advertising or profiling data is stored in <code className="font-mono">localStorage</code> or <code className="font-mono">sessionStorage</code>.
                    </li>
                  </ul>

                  <h4>3. Why No Cookie Banner Is Displayed</h4>
                  <p>
                    Because Swasthya Triage does not utilize any non-essential cookies or tracking technologies, displaying a generic, decorative cookie consent banner would be misleading. We believe in genuine transparency rather than visual compliance illusions.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 6: CONSENT & DPDP */}
            {activeTab === 'consent' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">DPDP TRANSPARENCY & CONSENT LAYER</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  Informed Consent & DPDP-Oriented Transparency
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Informed by India's Digital Personal Data Protection (DPDP) principles for clear, standalone, and itemized data notices.
                </p>

                <div className="trust-policy-section">
                  <h4>1. Itemized Personal Data Notice</h4>
                  <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
                    <table
                      className="glass-table"
                      style={{
                        width: '100%',
                        fontSize: '0.82rem',
                        borderCollapse: 'collapse',
                        background: 'rgba(0,0,0,0.2)',
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                          <th style={{ padding: '0.6rem 0.8rem', color: 'var(--mint)' }}>Data Category</th>
                          <th style={{ padding: '0.6rem 0.8rem', color: 'var(--mint)' }}>Itemized Data</th>
                          <th style={{ padding: '0.6rem 0.8rem', color: 'var(--mint)' }}>Specific Purpose</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Demographic</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Age, Gender, Language, ID (<code className="font-mono">PT-xxxx</code>)</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Contextual age-specific triage rules (e.g. pediatric/geriatric)</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Clinical Narrative</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Reported symptoms, duration, history</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Extract structured symptoms, timelines, missing information</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Voice Audio</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Microphone audio recording</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Convert speech to verbatim text transcript</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Medical Documents</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Lab & radiology report files</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Extract clinical test results & radiographic impressions</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Reviewer Records</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Clinician notes, triage decision, timestamp</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Human review sign-off, referral generation & clinical audit</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4>2. Explicit Unbundled Consent</h4>
                  <p>
                    Consent is mandatory before creating a triage case. In accordance with best privacy practices:
                  </p>
                  <ul>
                    <li>The consent checkbox is <strong>never pre-checked</strong>.</li>
                    <li>Clinical triage consent is not bundled with unrelated marketing or promotional permissions.</li>
                    <li>Every consent confirmation is logged in the chronological in-memory audit trail.</li>
                  </ul>

                  <h4>3. Right to Withdraw Consent</h4>
                  <p>
                    Patients or healthcare workers can withdraw consent or discard a pending intake at any point prior to clinical review sign-off by clicking <strong>Clear Form</strong> or <strong>Reset Workspace</strong>.
                  </p>

                  <h4>4. Grievance Redressal & Requests</h4>
                  <p>
                    For inquiries, corrections, or grievance redressal regarding personal data processing:
                  </p>
                  <p style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                    <strong>Data Protection Officer / Grievance Officer:</strong> [DATA PROTECTION OFFICER]<br />
                    <strong>Email:</strong> [PRIVACY CONTACT EMAIL]<br />
                    <strong>Organization:</strong> [ORGANIZATION NAME]
                  </p>
                </div>
              </div>
            )}

            {/* TAB 7: VOICE & OCR */}
            {activeTab === 'multimodal' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">MULTIMODAL DATA PRIVACY</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  Voice Recording & Document OCR Processing
                </h3>

                <div className="trust-policy-section">
                  <h4>1. Voice Recording & Speech-to-Text Pipeline</h4>
                  <p>
                    When you use the microphone input or select a clinical voice scenario:
                  </p>
                  <ul>
                    <li>
                      <strong>Clear Pre-Recording Notice:</strong> A concise notice is displayed prior to recording: <em>"Voice recording will be processed to create a text transcription for this triage workflow."</em>
                    </li>
                    <li>
                      <strong>Purpose:</strong> Audio is converted into a verbatim text transcript. It is not analyzed for voice biometric identification or acoustic profiling.
                    </li>
                    <li>
                      <strong>Retention:</strong> Audio streams are processed in transient memory. Temporary audio buffers are deleted after transcription is complete.
                    </li>
                    <li>
                      <strong>Provenance Tagging:</strong> Transcriptions are explicitly tagged with their source provenance (<code className="font-mono">Patient-Provided</code>) to distinguish them from clinician notes.
                    </li>
                  </ul>

                  <h4>2. Medical Document Uploads & OCR Extraction</h4>
                  <p>
                    When attaching radiology reports or laboratory documents:
                  </p>
                  <ul>
                    <li>
                      <strong>Pre-Upload Notice:</strong> <em>"Uploaded medical documents may be processed to extract text and structured information for this triage workflow."</em>
                    </li>
                    <li>
                      <strong>Provisional Nature:</strong> OCR extractions are treated as provisional, unverified text until inspected and verified by the attending Medical Officer.
                    </li>
                    <li>
                      <strong>Distinction of Source:</strong> Original patient documents are clearly distinguished from AI-generated structured summaries in the user interface.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB 8: AI TRANSPARENCY */}
            {activeTab === 'ai-transparency' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">AI TRANSPARENCY & CAPABILITIES</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  How AI Is Used & Model Governance
                </h3>

                <div className="trust-policy-section">
                  <h4>1. What the AI Does</h4>
                  <p>The AI structuring engine assists healthcare personnel by:</p>
                  <ul>
                    <li>Extracting symptom terms and anatomical mentions from verbatim narratives.</li>
                    <li>Organizing a structured chronological timeline (onset, progression, duration).</li>
                    <li>Identifying potentially missing clinical information (e.g. onset duration, fever quantification).</li>
                    <li>Suggesting non-diagnostic follow-up questions for nursing staff.</li>
                    <li>Summarizing multimodal evidence (voice transcripts, OCR text) into a consolidated triage note.</li>
                    <li>Highlighting objective urgency signals according to configured clinical triage protocols.</li>
                  </ul>

                  <h4>2. What the AI Does NOT Do</h4>
                  <div
                    className="glass-card"
                    style={{
                      padding: '0.85rem 1rem',
                      borderColor: 'var(--urgency-high)',
                      backgroundColor: 'rgba(255, 99, 132, 0.08)',
                      margin: '0.75rem 0',
                    }}
                  >
                    <strong style={{ color: 'var(--urgency-high)' }}>Hard AI Safety Boundaries:</strong>
                    <ul style={{ margin: '0.35rem 0 0 0', paddingLeft: '1.25rem', fontSize: '0.86rem' }}>
                      <li>The AI <strong>does NOT autonomously diagnose medical diseases</strong>.</li>
                      <li>The AI <strong>does NOT prescribe medications, dosages, or pharmaceutical treatments</strong>.</li>
                      <li>The AI <strong>does NOT make the final patient triage disposition decision</strong>.</li>
                      <li>The AI <strong>never replaces bedside clinician review and judgment</strong>.</li>
                    </ul>
                  </div>

                  <h4>3. AI Architecture & Safety Middleware</h4>
                  <p>
                    Swasthya Triage employs a dual-layer safety architecture:
                  </p>
                  <ul>
                    <li>
                      <strong>AI Extraction Prompt Engineering:</strong> Strict system prompts enforce non-diagnostic output, requiring objective summarization without speculative diagnoses.
                    </li>
                    <li>
                      <strong>Safety Validator Middleware:</strong> Every AI response is validated on the backend before display to guarantee no diagnostic assertions or prescription commands have been generated.
                    </li>
                    <li>
                      <strong>Deterministic Rule Processor Fallback:</strong> If the AI service is unreachable, the system automatically uses a deterministic keyword/regex rules engine to generate triage notes locally.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB 9: THIRD PARTY & ASSETS */}
            {activeTab === 'third-party' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">THIRD-PARTY INTEGRATION AUDIT</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  Third-Party Services & Asset Licensing Audit
                </h3>

                <div className="trust-policy-section">
                  <h4>1. Active External Services</h4>
                  <p>
                    Swasthya Triage connects only to the following specific third-party services:
                  </p>
                  <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table
                      className="glass-table"
                      style={{
                        width: '100%',
                        fontSize: '0.82rem',
                        borderCollapse: 'collapse',
                        background: 'rgba(0,0,0,0.2)',
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                          <th style={{ padding: '0.6rem 0.8rem', color: 'var(--mint)' }}>Service</th>
                          <th style={{ padding: '0.6rem 0.8rem', color: 'var(--mint)' }}>Data Sent</th>
                          <th style={{ padding: '0.6rem 0.8rem', color: 'var(--mint)' }}>Execution</th>
                          <th style={{ padding: '0.6rem 0.8rem', color: 'var(--mint)' }}>Necessity</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.6rem 0.8rem' }}><strong>Google Gemini API</strong></td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Audio buffer / triage text payload</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Server-side proxy only (Zero client key exposure)</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Optional (Falls back to deterministic engine)</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.6rem 0.8rem' }}><strong>Google Fonts</strong></td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Standard HTTP font request (Inter, JetBrains Mono)</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Browser static CDN load</td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>Typography styling</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4>2. Software Libraries & Asset Licensing</h4>
                  <ul>
                    <li>
                      <strong>Lucide Icons:</strong> <code className="font-mono">lucide-react</code> icons &bull; ISC / MIT License.
                    </li>
                    <li>
                      <strong>Fonts (Inter, JetBrains Mono):</strong> SIL Open Font License / Apache 2.0.
                    </li>
                    <li>
                      <strong>Audio Samples:</strong> Synthetic audio recorded for clinical simulation &bull; MIT License.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB 10: ACCESSIBILITY */}
            {activeTab === 'accessibility' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">UNIVERSAL DESIGN & ACCESSIBILITY</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  Accessibility Statement
                </h3>

                <div className="trust-policy-section">
                  <h4>1. Accessibility Commitment</h4>
                  <p>
                    Swasthya Triage is committed to digital accessibility in accordance with WCAG 2.1 Level AA principles. The application is designed to be accessible to healthcare professionals and frontline workers of diverse abilities and environments.
                  </p>

                  <h4>2. Implemented Accessibility Features</h4>
                  <ul>
                    <li>
                      <strong>Full Keyboard Navigation:</strong> All forms, buttons, tabs, modal dialogs, and filters are operable via standard keyboard controls (<kbd>Tab</kbd>, <kbd>Shift+Tab</kbd>, <kbd>Enter</kbd>, <kbd>Space</kbd>, <kbd>Escape</kbd>).
                    </li>
                    <li>
                      <strong>Visible Focus Indicators:</strong> High-contrast focus rings (<code className="font-mono">:focus-visible</code>) are rendered on all interactive elements.
                    </li>
                    <li>
                      <strong>Semantic HTML & ARIA:</strong> Semantic elements (<code className="font-mono">&lt;header&gt;</code>, <code className="font-mono">&lt;main&gt;</code>, <code className="font-mono">&lt;nav&gt;</code>, <code className="font-mono">&lt;footer&gt;</code>, <code className="font-mono">&lt;dialog&gt;</code>) and appropriate ARIA attributes (<code className="font-mono">aria-label</code>, <code className="font-mono">aria-modal</code>, <code className="font-mono">role="region"</code>) ensure screen reader compatibility.
                    </li>
                    <li>
                      <strong>Touch Target Sizes:</strong> All primary buttons, chip controls, and navigation elements meet or exceed the minimum recommended 44px &times; 44px touch target dimensions.
                    </li>
                    <li>
                      <strong>Contrast & Legibility:</strong> High-contrast typography on Liquid Glass surfaces maintains comfortable contrast against dark graphite backgrounds.
                    </li>
                    <li>
                      <strong>Descriptive Form & Button Labels:</strong> Context-specific action names (e.g. "Start Voice Recording", "Create Triage Case", "Confirm Clinical Decision") replace ambiguous labels.
                    </li>
                  </ul>

                  <h4>3. Accessibility Feedback</h4>
                  <p>
                    If you experience any accessibility barriers while using Swasthya Triage, please contact our accessibility coordinator: <code className="font-mono">[PRIVACY CONTACT EMAIL]</code>.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 11: CONTACT & DPO */}
            {activeTab === 'contact' && (
              <div className="trust-tab-panel">
                <div className="intake-step-badge">GOVERNANCE & CONTACT DETAILS</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0 0.85rem 0' }}>
                  Contact, Privacy Requests & Grievance Redressal
                </h3>

                <div className="trust-policy-section">
                  <p>
                    For inquiries regarding this prototype, clinical validation, privacy rights, or data protection:
                  </p>

                  <div
                    className="glass-card"
                    style={{
                      padding: '1.25rem',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                      gap: '1.25rem',
                      marginTop: '1rem',
                      marginBottom: '1.5rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--mint)', marginBottom: '0.35rem' }}>
                        <Building2 size={16} />
                        <strong>Operating Entity</strong>
                      </div>
                      <div style={{ fontSize: '0.85rem' }}>
                        [ORGANIZATION NAME]<br />
                        Healthcare AI & Clinical Systems Division<br />
                        Primary Health Centre (PHC) Evaluation Node
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--teal)', marginBottom: '0.35rem' }}>
                        <Mail size={16} />
                        <strong>Privacy & Grievance Inquiries</strong>
                      </div>
                      <div style={{ fontSize: '0.85rem' }}>
                        Privacy Desk: <code className="font-mono">[PRIVACY CONTACT EMAIL]</code><br />
                        Data Protection Officer: <code className="font-mono">[DATA PROTECTION OFFICER]</code><br />
                        Response Window: 72 business hours
                      </div>
                    </div>
                  </div>

                  <h4>Submitting a Privacy or Data Erasure Request</h4>
                  <p>
                    If you wish to request the deletion or export of records created during an evaluation session, please submit your request to <code className="font-mono">[PRIVACY CONTACT EMAIL]</code> referencing your session date and anonymized patient ID (<code className="font-mono">PT-xxxx</code>).
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Modal Bottom Action Bar */}
        <div
          className="trust-center-footer glass-panel"
          style={{
            padding: '0.85rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(16, 20, 25, 0.90)',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--mint)', fontWeight: 600 }}>Swasthya Triage v2.4</span> &bull; Educational & Institutional Evaluation Environment
          </div>

          <button
            type="button"
            className="btn btn-primary glass"
            onClick={onClose}
            style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', minHeight: '40px' }}
          >
            Close Trust Center
          </button>
        </div>
      </div>
    </div>
  );
};
