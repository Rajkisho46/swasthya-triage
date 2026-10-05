import React from 'react';
import { HeartPulse, ShieldCheck } from 'lucide-react';

interface PortalToggleProps {
  activeTab: 'patient' | 'staff';
  onTabChange: (tab: 'patient' | 'staff') => void;
}

export const PortalToggle: React.FC<PortalToggleProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="split-portal-toggle-container">
      <div className="split-portal-switcher" role="tablist" aria-label="Portal Selection">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'patient'}
          onClick={() => onTabChange('patient')}
          className={`split-portal-btn ${activeTab === 'patient' ? 'active' : ''}`}
          id="tab-patient-portal"
        >
          <HeartPulse
            size={13}
            color={activeTab === 'patient' ? '#00382e' : '#8fa39b'}
            aria-hidden="true"
          />
          <span>PATIENT PORTAL</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'staff'}
          onClick={() => onTabChange('staff')}
          className={`split-portal-btn ${activeTab === 'staff' ? 'active' : ''}`}
          id="tab-staff-portal"
        >
          <ShieldCheck
            size={13}
            color={activeTab === 'staff' ? '#00382e' : '#8fa39b'}
            aria-hidden="true"
          />
          <span>STAFF DEMO</span>
        </button>
      </div>
    </div>
  );
};
