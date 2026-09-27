import React from 'react';
import type { TriageCase } from '../../types/triage';
import { MedicalReviewerPortal } from '../MedicalReviewerPortal/MedicalReviewerPortal';

interface DoctorPortalProps {
  cases: TriageCase[];
  activeCase: TriageCase | null;
  onUpdateCase: (updatedCase: TriageCase) => void;
  onDeleteCase?: (caseId: string) => void;
  onCaseCreated?: (newCase: TriageCase) => void;
  onViewSummary: (triageCase: TriageCase) => void;
  onSendForReview?: (updatedCase: TriageCase) => void;
  intakeResetKey?: number;
}

/**
 * DoctorPortal re-exports MedicalReviewerPortal for architectural consistency.
 */
export const DoctorPortal: React.FC<DoctorPortalProps> = (props) => {
  return <MedicalReviewerPortal {...props} />;
};

export { MedicalReviewerPortal };
