import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface SafetyBannerProps {
  compact?: boolean;
}

export const SafetyBanner: React.FC<SafetyBannerProps> = ({ compact = false }) => {
  return (
    <aside
      className={`safety-banner glass-card ${compact ? 'compact' : ''}`}
      role="alert"
      aria-label="Institutional safety disclaimer"
    >
      <div className="safety-banner-header">
        <div className="safety-header-left">
          <span className="pulse-indicator-champagne" aria-hidden="true" />
          <ShieldAlert size={16} aria-hidden="true" style={{ color: 'var(--champagne)' }} />
          <span className="safety-tag">TRIAGE SUPPORT ONLY</span>
          <span className="safety-separator">/</span>
          <span className="safety-sub">Educational & Institutional Evaluation Environment</span>
        </div>
        <div className="safety-node-tag">
          <span className="node-id glass">PHC FACILITY PROTOCOL</span>
        </div>
      </div>
      <div className="safety-banner-body">
        This system <strong>does not provide medical diagnoses, treatment prescriptions, or autonomous clinical decisions</strong>. AI extraction is strictly advisory and <strong>all patient dispositions require mandatory qualified human clinician evaluation and sign-off</strong>.
      </div>
    </aside>
  );
};

