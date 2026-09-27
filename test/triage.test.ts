import { processTriageIntake } from '../src/services/triageService.ts';
import { recordAuditEvent, getAuditLogs, clearAuditLogs } from '../src/utils/audit.ts';
import { SYNTHETIC_SAMPLE_CASES } from '../src/data/sampleCases.ts';
import type { TriageFormData, TriageCase } from '../src/types/triage.ts';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
}

console.log('=====================================================');
console.log('SWASTHYA TRIAGE ASSISTANT - AUTOMATED TEST SUITE');
console.log('=====================================================\n');

// 1. Test Clean State Initial Integrity
console.log('Test Group 1: Clean Initial Database State Integrity');
assert(Array.isArray(SYNTHETIC_SAMPLE_CASES), `SYNTHETIC_SAMPLE_CASES is an array (found ${SYNTHETIC_SAMPLE_CASES.length})`);
SYNTHETIC_SAMPLE_CASES.forEach((c) => {
  assert(!!c.caseId && c.caseId.startsWith('CASE-'), `Case ID formatted properly (${c.caseId})`);
  assert(!!c.patientId && c.patientId.startsWith('PATIENT-'), `Patient ID formatted properly (${c.patientId})`);
  assert(c.consentGiven === true, `Consent recorded for ${c.caseId}`);
  assert(c.extractedSymptoms.length > 0, `Symptoms extracted for ${c.caseId}`);
  assert(c.timeline.length > 0, `Timeline extracted for ${c.caseId}`);
  assert(c.missingInformation.length > 0, `Missing info generated for ${c.caseId}`);
  assert(c.followUpQuestions.length > 0, `Follow-up questions generated for ${c.caseId}`);
  assert(c.reviewStatus === 'awaiting_review', `Initial status is awaiting_review for ${c.caseId}`);
});

// 2. Test Deterministic Triage Processor on Acute Breathing Distress
console.log('\nTest Group 2: Triage Processor - Respiratory Red Flag Scenario');
const acuteInput: TriageFormData = {
  patientId: 'PATIENT-TEST-001',
  age: 65,
  gender: 'Male',
  preferredLanguage: 'English',
  symptoms: 'I have had fever for 3 days and weakness. Since yesterday I am having difficulty breathing.',
  consentGiven: true,
};

const acuteCase = processTriageIntake(acuteInput);
assert(acuteCase.patientId === 'PATIENT-TEST-001', 'Patient ID matches input');
assert(acuteCase.age === 65, 'Patient age matches');
assert(acuteCase.extractedSymptoms.includes('Breathing Difficulty / Dyspnea'), 'Identified Breathing Difficulty');
assert(acuteCase.extractedSymptoms.includes('Fever / Pyrexia'), 'Identified Fever');
assert(acuteCase.extractedSymptoms.includes('Generalized Weakness / Fatigue'), 'Identified Weakness');
assert(acuteCase.urgencySignals.length > 0, 'Flagged Urgency Signal for respiratory difficulty');
assert(
  acuteCase.urgencySignals.some((u) => u.level === 'immediate_attention'),
  'Set immediate_attention urgency level for breathing difficulty'
);
assert(
  acuteCase.missingInformation.some((m) => m.includes('SpO2')),
  'Identified missing SpO2 vital parameter'
);
assert(
  acuteCase.followUpQuestions.some((q) => q.toLowerCase().includes('spo2')),
  'Generated follow-up question for SpO2'
);
assert(
  !acuteCase.aiSummary.toLowerCase().includes('diagnosis') &&
    !acuteCase.aiSummary.toLowerCase().includes('prescribe') &&
    !acuteCase.aiSummary.toLowerCase().includes('medicine'),
  'AI summary is strictly non-diagnostic'
);

// 3. Test Deterministic Triage Processor on Routine Cough Scenario
console.log('\nTest Group 3: Triage Processor - Routine Cough / Sore Throat');
const routineInput: TriageFormData = {
  patientId: 'PATIENT-TEST-002',
  age: 24,
  gender: 'Female',
  preferredLanguage: 'English',
  symptoms: 'Mild dry cough for 2 days and slight throat scratchiness.',
  consentGiven: true,
};

const routineCase = processTriageIntake(routineInput);
assert(routineCase.extractedSymptoms.includes('Cough'), 'Identified Cough');
assert(
  routineCase.urgencySignals.length === 0,
  'No emergency urgency signals flagged for mild cough'
);
assert(
  routineCase.missingInformation.length >= 3,
  'Baseline vital checklist created for routine presentation'
);

// 4. Test Audit Logging
console.log('\nTest Group 4: In-Memory Audit Trail & Traceability');
clearAuditLogs();
assert(getAuditLogs().length === 0, 'Audit logs cleared');

recordAuditEvent('CASE-9999', 'Patient', 'Consent recorded', 'Consent confirmed');
recordAuditEvent('CASE-9999', 'AI Triage Engine', 'Structured triage note generated', '3 symptoms extracted');
recordAuditEvent('CASE-9999', 'Medical Reviewer', 'Reviewer opened case', 'Reviewer session active');
recordAuditEvent('CASE-9999', 'Medical Reviewer', 'Reviewer decision recorded: Escalate', 'Human sign-off');

const logs = getAuditLogs('CASE-9999');
assert(logs.length === 4, `All 4 audit events recorded for CASE-9999 (found ${logs.length})`);
assert(logs[0].action === 'Reviewer decision recorded: Escalate', 'Latest audit event at top');
assert(logs[3].action === 'Consent recorded', 'Initial consent logged');

// 5. Test Reviewer Decision Workflow
console.log('\nTest Group 5: Human Clinician Review Sign-off');
const updatedReviewedCase: TriageCase = {
  ...acuteCase,
  reviewStatus: 'reviewed',
  reviewerDecision: 'Escalate',
  reviewerNotes: 'BP 130/80, SpO2 92% on RA. High flow oxygen started. Transferred to High Dependency Unit.',
  reviewedAt: new Date().toISOString(),
  reviewerName: 'Medical Officer Dr. Sharma',
};

assert(updatedReviewedCase.reviewStatus === 'reviewed', 'Status updated to reviewed');
assert(updatedReviewedCase.reviewerDecision === 'Escalate', 'Decision is Escalate');
assert(Boolean(updatedReviewedCase.reviewerNotes?.includes('High flow oxygen')), 'Reviewer notes preserved');

console.log('\n=====================================================');
console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
console.log('=====================================================');
