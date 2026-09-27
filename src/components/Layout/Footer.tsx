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
  onOpenTrustCenter: (tab: TrustCenterTab) => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenTrustCenter }) => {
  return (
    <footer className="app-footer" role="contentinfo" aria-label="Institutional Footer & Governance">
      <div className="footer-inner">
        <div className="footer-left">
          &copy; 2026 [ORGANIZATION NAME] &bull; Swasthya Triage v2.4 &bull; PHC Evaluation Environment
        </div>

        <nav className="footer-links" aria-label="Privacy and Legal Links">
          <button
            type="button"
            className="footer-nav-link"
            onClick={() => onOpenTrustCenter('privacy')}
          >
            <Lock size={12} aria-hidden="true" />
            <span>Privacy Policy</span>
          </button>

          <button
            type="button"
            className="footer-nav-link"
            onClick={() => onOpenTrustCenter('terms')}
          >
            <Scale size={12} aria-hidden="true" />
            <span>Terms</span>
          </button>

          <button
            type="button"
            className="footer-nav-link"
            onClick={() => onOpenTrustCenter('cookies')}
          >
            <Cookie size={12} aria-hidden="true" />
            <span>Cookies & Storage</span>
          </button>

          <button
            type="button"
            className="footer-nav-link"
            onClick={() => onOpenTrustCenter('ai-transparency')}
          >
            <Cpu size={12} aria-hidden="true" />
            <span>AI Transparency</span>
          </button>

          <button
            type="button"
            className="footer-nav-link"
            onClick={() => onOpenTrustCenter('accessibility')}
          >
            <Accessibility size={12} aria-hidden="true" />
            <span>Accessibility</span>
          </button>

          <button
            type="button"
            className="footer-nav-link"
            onClick={() => onOpenTrustCenter('contact')}
          >
            <Mail size={12} aria-hidden="true" />
            <span>Contact & DPO</span>
          </button>

          <button
            type="button"
            className="footer-nav-link"
            onClick={() => onOpenTrustCenter('overview')}
          >
            <ShieldCheck size={12} aria-hidden="true" />
            <span>Privacy & Trust Center</span>
          </button>
        </nav>
      </div>
    </footer>
  );
};

