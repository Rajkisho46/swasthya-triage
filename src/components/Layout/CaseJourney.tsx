import React from 'react';
import {
  UserPlus,
  CheckCircle2,
  FileSearch,
  Activity,
  ShieldAlert,
  Circle,
  ArrowRight,
} from 'lucide-react';
import type { TriageCase } from '../../types/triage';

export type WorkflowTab = 'intake' | 'summary' | 'reviewer' | 'audit';

export interface IntakeState {
  hasPatientInfo?: boolean;
  consentGiven?: boolean;
  hasMultimodal?: boolean;
}

interface CaseJourneyProps {
  triageCase?: TriageCase | null;
  currentStep?: WorkflowTab;
  intakeState?: IntakeState;
  compact?: boolean;
}

export const CaseJourney: React.FC<CaseJourneyProps> = ({
  triageCase,
  currentStep = 'summary',
  intakeState,
  compact = false,
}) => {
  const isReviewed = triageCase?.reviewStatus === 'reviewed' || Boolean(triageCase?.reviewerDecision);
  const hasConsent = intakeState?.consentGiven ?? (triageCase ? triageCase.consentGiven : false);
  const hasPatientInfo = intakeState?.hasPatientInfo ?? Boolean(triageCase);
  const hasMultimodal = intakeState?.hasMultimodal ?? Boolean(
    triageCase?.voiceData || (triageCase?.ocrReports && triageCase.ocrReports.length > 0) || ((triageCase?.inputModalities?.length ?? 0) > 1)
  );

  // Single source of truth for the active workflow stage (1 to 5, or null when all completed)
  let activeStage: 1 | 2 | 3 | 4 | 5 | null = 1;

  if (isReviewed) {
    // Clinician confirmed a decision: all stages 01-05 are completed (no active stage)
    activeStage = null;
  } else if (currentStep === 'reviewer') {
    // On Medical Review / review queue: 05 Clinical Review is ACTIVE
    activeStage = 5;
  } else if (currentStep === 'summary') {
    // On Triage Summary: 04 AI Advisory is ACTIVE
    activeStage = 4;
  } else if (currentStep === 'intake') {
    if (hasPatientInfo && hasConsent && hasMultimodal) {
      // After patient info + consent + multimodal processing: 04 AI Advisory is ACTIVE
      activeStage = 4;
    } else if (hasPatientInfo && hasConsent) {
      // After valid patient info + consent: 03 Multimodal Input is ACTIVE
      activeStage = 3;
    } else if (hasPatientInfo) {
      // Patient info entered, consent pending: 02 Informed Consent is ACTIVE
      activeStage = 2;
    } else {
      // Initial Patient Intake: 01 is ACTIVE
      activeStage = 1;
    }
  } else if (currentStep === 'audit') {
    activeStage = triageCase ? (isReviewed ? null : 5) : 4;
  }

  const rawSteps = [
    {
      id: 'intake',
      stepNum: '01',
      stageIndex: 1,
      label: 'Patient Intake',
      sublabel: triageCase ? triageCase.patientId : (intakeState?.hasPatientInfo ? 'Captured' : 'Evidence Capture'),
      icon: UserPlus,
    },
    {
      id: 'consent',
      stepNum: '02',
      stageIndex: 2,
      label: 'Informed Consent',
      sublabel: hasConsent ? 'Consent Confirmed' : 'Mandatory Record',
      icon: CheckCircle2,
    },
    {
      id: 'multimodal',
      stepNum: '03',
      stageIndex: 3,
      label: 'Multimodal Input',
      sublabel: triageCase?.inputModalities ? triageCase.inputModalities.join(' + ') : (hasMultimodal ? 'Voice / OCR Attached' : 'Text / Voice / OCR'),
      icon: FileSearch,
    },
    {
      id: 'ai_extraction',
      stepNum: '04',
      stageIndex: 4,
      label: 'AI Advisory',
      sublabel: triageCase ? `${triageCase.extractedSymptoms.length} Symptoms Extracted` : 'Clinical Structuring',
      icon: Activity,
    },
    {
      id: 'medical_review',
      stepNum: '05',
      stageIndex: 5,
      label: 'Clinical Review',
      sublabel: isReviewed
        ? (triageCase?.reviewerDecision ? `Signed (${triageCase.reviewerDecision})` : 'Verified & Signed')
        : activeStage === 5
        ? 'In Review Queue'
        : 'Clinician Evaluation',
      icon: ShieldAlert,
    },
  ];

  const steps = rawSteps.map((step) => {
    let completed = false;
    let active = false;

    if (activeStage === null) {
      completed = true;
      active = false;
    } else if (step.stageIndex < activeStage) {
      completed = true;
      active = false;
    } else if (step.stageIndex === activeStage) {
      completed = false;
      active = true;
    } else {
      completed = false;
      active = false;
    }

    return {
      ...step,
      completed,
      active,
    };
  });

  return (
    <nav className={`case-journey-container glass-card ${compact ? 'compact' : ''}`} aria-label="Clinical Evidence Chain Stepper">
      <div className="case-journey-header">
        <div className="case-journey-title">
          <span className="pulse-indicator-teal" aria-hidden="true" />
          <span className="chain-badge">CLINICAL EVIDENCE CHAIN</span>
          {triageCase && (
            <span className="case-ref-tag glass">
              CASE: <strong>{triageCase.caseId}</strong>
            </span>
          )}
        </div>
        <div className="case-journey-subtext">
          Traceable Non-Diagnostic Workflow &bull; AI Assists, Human Clinician Decides
        </div>
      </div>

      <div className="case-journey-track">
        {steps.map((step, idx) => {
          const StepIcon = step.icon;
          const isLast = idx === steps.length - 1;

          let statusClass = 'pending';
          if (step.completed) statusClass = 'completed';
          else if (step.active) statusClass = 'active';

          return (
            <React.Fragment key={step.id}>
              <div className={`journey-step glass ${statusClass}`} title={`${step.label}: ${step.sublabel}`}>
                <div className="step-icon-wrapper">
                  {step.completed ? (
                    <CheckCircle2 size={15} className="step-icon completed-icon" aria-hidden="true" />
                  ) : step.active ? (
                    <StepIcon size={15} className="step-icon active-icon" aria-hidden="true" />
                  ) : (
                    <Circle size={13} className="step-icon pending-icon" aria-hidden="true" />
                  )}
                </div>
                <div className="step-content">
                  <div className="step-label-row">
                    <span className="step-num">{step.stepNum}</span>
                    <span className="step-label">{step.label}</span>
                  </div>
                  <span className="step-sublabel">{step.sublabel}</span>
                </div>
              </div>

              {!isLast && (
                <div className={`journey-connector ${step.completed ? 'completed' : ''}`} aria-hidden="true">
                  <ArrowRight size={12} className="connector-arrow" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};

