import React from 'react';
import {
  ShieldCheck,
  Lock,
  Scale,
  Cookie,
  Accessibility,
  Cpu,
  Mail,
} from 'lucide-react';
import type { TrustCenterTab } from '../TrustCenter/PrivacyTrustCenter';

interface FooterProps {
  onOpenTrustCenter?: (tab: TrustCenterTab) => void;
}

export const Footer: React.FC<FooterProps> = () => {
  return (
    <footer className="app-footer" role="contentinfo" aria-label="Institutional Footer & Governance">
      <div className="footer-inner">
        <div className="footer-left">
          &copy; 2026 [ORGANIZATION NAME] &bull; Swasthya Triage v2.4 &bull; PHC Evaluation Environment
        </div>

        <div className="footer-links" aria-label="Privacy and Legal Information">
          <span className="footer-nav-item">
            <Lock size={12} aria-hidden="true" />
            <span>Privacy Policy</span>
          </span>

          <span className="footer-nav-item">
            <Scale size={12} aria-hidden="true" />
            <span>Terms</span>
          </span>

          <span className="footer-nav-item">
            <Cookie size={12} aria-hidden="true" />
            <span>Cookies & Storage</span>
          </span>

          <span className="footer-nav-item">
            <Cpu size={12} aria-hidden="true" />
            <span>AI Transparency</span>
          </span>

          <span className="footer-nav-item">
            <Accessibility size={12} aria-hidden="true" />
            <span>Accessibility</span>
          </span>

          <span className="footer-nav-item">
            <Mail size={12} aria-hidden="true" />
            <span>Contact & DPO</span>
          </span>

          <span className="footer-nav-item">
            <ShieldCheck size={12} aria-hidden="true" />
            <span>Privacy & Trust Center</span>
          </span>
        </div>
      </div>
    </footer>
  );
};
