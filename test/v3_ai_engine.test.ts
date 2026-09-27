import { validateAndSanitizeAIOutput } from '../src/services/ai/aiValidator.ts';
import { AI_TRIAGE_SYSTEM_INSTRUCTION, buildTriageUserPrompt } from '../src/services/ai/aiPrompt.ts';
import { AIExtractionClient } from '../src/services/ai/aiClient.ts';
import { AITriageProcessor } from '../src/services/processor/AITriageProcessor.ts';
import { DeterministicTriageProcessor } from '../src/services/processor/DeterministicProcessor.ts';
import { getTriageProcessor, setActiveProcessorMode } from '../src/services/processor/processorFactory.ts';
import { recordAuditEvent, getAuditLogs, clearAuditLogs } from '../src/utils/audit.ts';
import type { TriageFormData, TriageCase } from '../src/types/triage.ts';

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    console.log(`  ✓ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runV3TestSuite() {
  console.log('=====================================================');
  console.log('SWASTHYA TRIAGE V3 - REAL AI ENGINE & FALLBACK TEST SUITE');
  console.log('=====================================================\n');

  // 1. Structured AI Output Validation
  console.log('Test Group 1: AI Output Schema & Safety Validation');
  const validMockAIResponse = {
    extractedSymptoms: ['High Fever', 'Breathlessness', 'Generalized Weakness'],
    timeline: [
      { symptom: 'High Fever', durationOrOnset: '3 days', notes: 'accompanied by chills' },
      { symptom: 'Breathlessness', durationOrOnset: 'Since yesterday', notes: 'worsening on minimal exertion' },
    ],
    missingInformation: [
      'Oxygen Saturation (SpO2)',
      'Blood Pressure and Pulse rate',
      'History of Asthma/COPD or Cardiac disease',
    ],
    followUpQuestions: [
      'What is the measured SpO2 on room air?',
      'Has the patient experienced any chest tightness or bluish discoloration of lips?',
    ],
    urgencySignals: [
      {
        signal: 'Breathlessness: Acute respiratory compromise',
        level: 'immediate_attention',
        reason: 'Reported dyspnea requires urgent vitals monitoring and clinician assessment',
      },
    ],
    aiSummary:
      'Patient reports fever for 3 days with weakness and acute breathlessness beginning yesterday. Urgent vitals and physician bedside evaluation required.',
  };

  const sanitized = validateAndSanitizeAIOutput(validMockAIResponse);
  assert(sanitized.extractedSymptoms.length === 3, 'Extracted 3 symptoms correctly');
  assert(sanitized.timeline.length === 2, 'Parsed timeline items');
  assert(sanitized.urgencySignals[0].level === 'immediate_attention', 'Urgency level assigned');
  assert(!sanitized.aiSummary.toLowerCase().includes('diagnosis'), 'Summary is strictly non-diagnostic');

  // 2. Malformed / Incomplete AI Output Rejection
  console.log('\nTest Group 2: Malformed AI Output Handling');
  let caughtMalformed = false;
  try {
    validateAndSanitizeAIOutput({ extractedSymptoms: [] }); // empty symptoms
  } catch (err: any) {
    caughtMalformed = true;
    assert(err.message.includes('extractedSymptoms'), 'Caught missing symptoms error');
  }
  assert(caughtMalformed, 'Rejected malformed empty AI output');

  let caughtMissingTimeline = false;
  try {
    validateAndSanitizeAIOutput({ extractedSymptoms: ['Fever'] }); // missing timeline/summary
  } catch (err: any) {
    caughtMissingTimeline = true;
    assert(err.message.includes('timeline'), 'Caught missing timeline error');
  }
  assert(caughtMissingTimeline, 'Rejected incomplete AI output');

  // 3. Safety Validator - Rejection of Diagnostic/Prescriptive Phrasing
  console.log('\nTest Group 3: Strict Safety Auditor Rejections');
  let caughtDiagnosticClaim = false;
  try {
    validateAndSanitizeAIOutput({
      ...validMockAIResponse,
      aiSummary: 'Patient is diagnosed with Acute Lobar Pneumonia and requires admission.',
    });
  } catch (err: any) {
    caughtDiagnosticClaim = true;
    assert(err.message.includes('Safety violation'), 'Safety auditor rejected diagnosis claim');
  }
  assert(caughtDiagnosticClaim, 'Blocked diagnostic claim in AI output');

  let caughtPrescription = false;
  try {
    validateAndSanitizeAIOutput({
      ...validMockAIResponse,
      aiSummary: 'Take 500mg Paracetamol thrice daily with meals.',
    });
  } catch (err: any) {
    caughtPrescription = true;
    assert(err.message.includes('Safety violation'), 'Safety auditor rejected prescription phrasing');
  }
  assert(caughtPrescription, 'Blocked prescription language in AI output');

  // 4. Non-Diagnostic Prompt Structure
  console.log('\nTest Group 4: Non-Diagnostic System Prompt & Context Construction');
  assert(
    AI_TRIAGE_SYSTEM_INSTRUCTION.includes('NEVER output a disease diagnosis'),
    'System prompt explicitly forbids disease diagnoses'
  );
  assert(
    AI_TRIAGE_SYSTEM_INSTRUCTION.includes('NEVER prescribe or recommend medications'),
    'System prompt explicitly forbids medication prescriptions'
  );
  assert(
    AI_TRIAGE_SYSTEM_INSTRUCTION.includes('NEVER make or suggest a final medical decision'),
    'System prompt forbids making final medical dispositions'
  );

  const promptBuilt = buildTriageUserPrompt({
    patientId: 'PATIENT-TEST-1024',
    age: 45,
    gender: 'Female',
    preferredLanguage: 'Hindi',
    rawSymptoms: 'Severe chest tightness since morning',
    translatedEnglishText: 'Severe chest tightness since morning',
  });
  assert(promptBuilt.includes('PATIENT-TEST-1024'), 'User prompt contains anonymized Patient ID');
  assert(promptBuilt.includes('Severe chest tightness'), 'User prompt contains symptom text');

  // 5. AITriageProcessor Graceful Deterministic Fallback
  console.log('\nTest Group 5: Automatic Graceful Fallback on API Unavailability');
  const aiProcessor = new AITriageProcessor();
  const testInput: TriageFormData = {
    patientId: 'PATIENT-FALLBACK-001',
    age: 62,
    gender: 'Male',
    preferredLanguage: 'English',
    symptoms: 'Sudden severe breathlessness and high fever for 3 days.',
    consentGiven: true,
  };

  clearAuditLogs();
  const resultCase = await aiProcessor.processTriage(testInput);

  assert(resultCase.patientId === 'PATIENT-FALLBACK-001', 'Retained patient ID');
  assert(resultCase.isFallbackUsed === true, 'Flagged isFallbackUsed: true when live API key is unset');
  assert(
    resultCase.processorUsed?.includes('Fallback') || resultCase.processorUsed?.includes('Deterministic'),
    'Processor indicated fallback engine'
  );
  assert(resultCase.extractedSymptoms.includes('Breathing Difficulty / Dyspnea'), 'Fallback accurately extracted breathing difficulty');
  assert(resultCase.urgencySignals.length > 0, 'Fallback accurately generated urgency signal');

  // 6. Audit Trail for AI Processing & Fallback Activation
  console.log('\nTest Group 6: AI Audit Event Logging');
  const auditLogs = getAuditLogs(resultCase.caseId);
  assert(auditLogs.length >= 2, `Recorded audit logs (found ${auditLogs.length})`);
  assert(auditLogs.some((l) => l.action.includes('AI triage extraction started')), 'Logged AI processing started');
  assert(
    auditLogs.some((l) => l.action.includes('Fallback extraction activated') || l.action.includes('completed')),
    'Logged fallback activation / completion'
  );

  // 7. Factory Switching & V1/V2 Interoperability
  console.log('\nTest Group 7: Processor Factory Interoperability');
  setActiveProcessorMode('deterministic');
  assert(getTriageProcessor() instanceof DeterministicTriageProcessor, 'Returned Deterministic V1 processor');
  setActiveProcessorMode('ai_pluggable');
  assert(getTriageProcessor() instanceof AITriageProcessor, 'Returned AI V3 processor');
  setActiveProcessorMode('deterministic'); // restore default

  // 8. Test 5 Fictional Demo Scenarios in Fallback Engine
  console.log('\nTest Group 8: Five Fictional Demo Scenarios in V3 Engine');
  const scenarios = [
    { name: 'Fever + Weakness + Breathing difficulty', text: 'High fever for 3 days, extreme weakness, and acute difficulty breathing.' },
    { name: 'Cough + Sore throat', text: 'Persistent dry cough and sore throat for 4 days.' },
    { name: 'Headache + Dizziness', text: 'Throbbing headache and dizziness when standing.' },
    { name: 'Abdominal discomfort', text: 'Cramping abdominal pain with nausea since last night.' },
    { name: 'Breathing difficulty + Fever', text: 'Breathing difficulty and high body temperature for 2 days.' },
  ];

  for (const sc of scenarios) {
    const res = await aiProcessor.processTriage({
      patientId: 'PATIENT-DEMO-SYN',
      age: 40,
      gender: 'Female',
      preferredLanguage: 'English',
      symptoms: sc.text,
      consentGiven: true,
    });
    assert(res.extractedSymptoms.length > 0, `Extracted symptoms for scenario: ${sc.name}`);
    assert(res.timeline.length > 0, `Generated timeline for scenario: ${sc.name}`);
    assert(res.missingInformation.length > 0, `Generated missing info for scenario: ${sc.name}`);
    assert(res.followUpQuestions.length > 0, `Generated follow-up questions for scenario: ${sc.name}`);
  }

  console.log('\n=====================================================');
  console.log(`ALL V3 TESTS PASSED: ${passed} / ${total} assertions verified!`);
  console.log('=====================================================');
}

runV3TestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
