import React from 'react';
import type { TriageCase } from '../types/triage';
import { useAuth } from '../context/AuthContext';
import { PatientPortal } from './PatientPortal/PatientPortal';
import { NursePortal } from './NursePortal/NursePortal';
import { DoctorPortal } from './DoctorPortal/DoctorPortal';
import { AdminPortal } from './AdminPortal/AdminPortal';
import { AlertOctagon } from 'lucide-react';

interface RoleGuardProps {
  cases: TriageCase[];
  activeCase: TriageCase | null;
  onCaseCreated: (newCase: TriageCase) => void;
  onUpdateCase: (updatedCase: TriageCase) => void;
  onDeleteCase?: (caseId: string) => void;
  onSendForReview: (updatedCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
  onOpenTrustCenter: () => void;
  intakeResetKey: number;
}

/**
 * Centralized Role Guard & Portal Router.
 * Resolves the authenticated user's role determined by backend JWT claims
 * and renders the isolated portal workspace.
 */
export const RoleGuard: React.FC<RoleGuardProps> = ({
  cases,
  activeCase,
  onCaseCreated,
  onUpdateCase,
  onDeleteCase,
  onSendForReview,
  onViewSummary,
  onOpenTrustCenter,
  intakeResetKey,
}) => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return null;
  }

  switch (currentUser.role) {
    case 'PATIENT':
      return (
        <PatientPortal
          cases={cases}
          activeCase={activeCase}
          onCaseCreated={onCaseCreated}
          onSendForReview={onSendForReview}
          onViewSummary={onViewSummary}
          intakeResetKey={intakeResetKey}
        />
      );

    case 'NURSE':
      return (
        <NursePortal
          cases={cases}
          activeCase={activeCase}
          onUpdateCase={onUpdateCase}
          onCaseCreated={onCaseCreated}
          onViewSummary={onViewSummary}
          onSendForReview={onSendForReview}
          intakeResetKey={intakeResetKey}
        />
      );

    case 'DOCTOR':
    case 'MEDICAL_REVIEWER' as any:
      return (
        <DoctorPortal
          cases={cases}
          activeCase={activeCase}
          onUpdateCase={onUpdateCase}
          onDeleteCase={onDeleteCase}
          onCaseCreated={onCaseCreated}
          onViewSummary={onViewSummary}
          onSendForReview={onSendForReview}
          intakeResetKey={intakeResetKey}
        />
      );

    case 'ADMIN':
    case 'ADMINISTRATOR' as any:
      return (
        <AdminPortal
          cases={cases}
          onUpdateCase={onUpdateCase}
          onViewSummary={onViewSummary}
          onOpenTrustCenter={onOpenTrustCenter}
        />
      );

    default:
      return (
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', margin: '2rem auto', maxWidth: '500px' }}>
          <AlertOctagon size={40} color="var(--urgency-light)" style={{ margin: '0 auto 1rem auto' }} />
          <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>Access Denied (403)</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Unrecognized or unauthorized role: {String((currentUser as any)?.role || 'Unknown')}
          </p>
        </div>
      );
  }
};
