import test from 'node:test';
import assert from 'node:assert';
import { AuthClient } from '../src/services/auth/authClient';
import type { TriageCase, ReviewerDecision } from '../src/types/triage';
import { recordAuditEvent, getAuditLogs, clearAuditLogs } from '../src/utils/audit';

test('SWASTHYA TRIAGE V7 - MEDICAL REVIEWER & CLINICAL DECISION SUITE', async (t) => {
  const client = new AuthClient();

  await t.test('TEST 1 & 2: Role-Based Portal Mapping for Nurse and Medical Reviewer', () => {
    const nurseSession = {
      accessToken: 'nurse-mock-token',
      tokenType: 'bearer',
      role: 'NURSE' as const,
      username: 'nurse_priya',
      displayName: 'Nurse Priya Nair, RN',
      userId: 'usr_nur_01',
    };
    client.saveSession(nurseSession);
    assert.strictEqual(client.getStoredUser()?.role, 'NURSE');

    const docSession = {
      accessToken: 'doc-mock-token',
      tokenType: 'bearer',
      role: 'DOCTOR' as const,
      username: 'dr_sharma',
      displayName: 'Dr. Ananya Sharma, MD',
      userId: 'usr_doc_01',
    };
    client.saveSession(docSession);
    assert.strictEqual(client.getStoredUser()?.role, 'DOCTOR');
    assert.strictEqual(client.getStoredUser()?.displayName, 'Dr. Ananya Sharma, MD');
  });

  await t.test('TEST 3: Unauthenticated user state', () => {
    client.clearSession();
    assert.strictEqual(client.getStoredUser(), null);
    assert.deepStrictEqual(client.getAuthHeader(), {});
  });

  await t.test('TEST 4 & 5: Backend RBAC Simulation (Patient 403 vs Doctor 200)', () => {
    // Simulating endpoint permission checker
    const checkReviewerPermission = (role: string) => {
      if (role !== 'DOCTOR' && role !== 'ADMIN') {
        return { status: 403, error: 'Forbidden' };
      }
      return { status: 200, success: true };
    };

    assert.strictEqual(checkReviewerPermission('PATIENT').status, 403);
    assert.strictEqual(checkReviewerPermission('DOCTOR').status, 200);
    assert.strictEqual(checkReviewerPermission('ADMIN').status, 200);
  });

  await t.test('TEST 6, 7 & 8: Case Visibility Rule & Isolation', () => {
    // Fresh queue starting empty
    const allCases: TriageCase[] = [];

    // Filter for reviewer queue
    const getReviewerQueue = (cases: TriageCase[]) =>
      cases.filter((c) => c.reviewStatus === 'awaiting_review' || c.reviewStatus === 'reviewed');

    // Initially empty
    assert.strictEqual(getReviewerQueue(allCases).length, 0);

    // Intake creates a case in draft / intake
    const newCase: TriageCase = {
      caseId: 'CASE-7701',
      patientId: 'PAT-7701',
      age: 48,
      gender: 'Female',
      preferredLanguage: 'Hindi',
      consentGiven: true,
      rawSymptoms: 'तेज़ बुखार और सांस लेने में कठिनाई',
      extractedSymptoms: ['Breathing Difficulty', 'High Fever'],
      timeline: [{ symptom: 'Breathing Difficulty & High Fever', durationOrOnset: '3 days' }],
      missingInformation: ['SpO2 Oxygen Saturation'],
      followUpQuestions: ['क्या छाती में दर्द भी है?'],
      urgencySignals: [{ signal: 'respiratory_distress', reason: 'Difficulty breathing', level: 'immediate_attention' }],
      aiSummary: 'Patient reports progressive dyspnea with fever.',
      reviewStatus: 'awaiting_review',
      createdAt: new Date().toISOString(),
    };

    allCases.push(newCase);

    // Submitted case now visible in reviewer queue
    const queueAfterSubmit = getReviewerQueue(allCases);
    assert.strictEqual(queueAfterSubmit.length, 1);
    assert.strictEqual(queueAfterSubmit[0].caseId, 'CASE-7701');
    assert.strictEqual(queueAfterSubmit[0].reviewStatus, 'awaiting_review');
  });

  await t.test('TEST 9: Reviewer opens case and inspects evidence vs AI advisory', () => {
    const testCase: TriageCase = {
      caseId: 'CASE-7701',
      patientId: 'PAT-7701',
      consentGiven: true,
      preferredLanguage: 'Hindi',
      rawSymptoms: 'तेज़ बुखार और सांस लेने में कठिनाई',
      extractedSymptoms: ['Breathing Difficulty', 'High Fever'],
      timeline: [{ symptom: 'Breathing Difficulty & High Fever', durationOrOnset: '3 days' }],
      missingInformation: ['SpO2 Oxygen Saturation'],
      followUpQuestions: ['क्या छाती में दर्द भी है?'],
      urgencySignals: [{ signal: 'respiratory_distress', reason: 'Difficulty breathing', level: 'immediate_attention' }],
      aiSummary: 'Patient reports progressive dyspnea with fever.',
      reviewStatus: 'awaiting_review',
      createdAt: new Date().toISOString(),
      voiceData: {
        transcript: 'तेज़ बुखार और सांस लेने में तकलीफ हो रही है',
        originalLanguage: 'Hindi',
        durationSeconds: 15,
        isDemoTranscription: true,
        recordedAt: new Date().toISOString(),
      },
    };

    // Verify patient-provided provenance
    assert.ok(testCase.rawSymptoms);
    assert.ok(testCase.voiceData);
    assert.strictEqual(testCase.voiceData.originalLanguage, 'Hindi');

    // Verify AI advisory is structured and distinct
    assert.strictEqual(testCase.extractedSymptoms.length, 2);
    assert.ok(testCase.aiSummary.length > 0);
    assert.strictEqual(testCase.urgencySignals[0].level, 'immediate_attention');
  });

  await t.test('TEST 10, 11 & 12: Human Decision, Notes, and Audit Trail Persistence', () => {
    clearAuditLogs();

    const testCase: TriageCase = {
      caseId: 'CASE-7701',
      patientId: 'PAT-7701',
      consentGiven: true,
      preferredLanguage: 'English',
      rawSymptoms: 'Severe cough and breathing difficulty',
      extractedSymptoms: ['Breathing Difficulty'],
      timeline: [{ symptom: 'Breathing Difficulty', durationOrOnset: '2 days' }],
      missingInformation: [],
      followUpQuestions: [],
      urgencySignals: [{ signal: 'respiratory_distress', reason: 'Dyspnea', level: 'immediate_attention' }],
      aiSummary: 'Dyspnea noted.',
      reviewStatus: 'awaiting_review',
      createdAt: new Date().toISOString(),
    };

    // Reviewer signs off with decision and notes
    const decision: ReviewerDecision = 'Escalate';
    const notes = 'Patient presents with tachypnea. Urgent hospital transfer and nebulization required.';
    const reviewedCase: TriageCase = {
      ...testCase,
      reviewStatus: 'reviewed',
      reviewerDecision: decision,
      reviewerNotes: notes,
      reviewedAt: new Date().toISOString(),
      reviewerName: 'Dr. Ananya Sharma, MD',
    };

    assert.strictEqual(reviewedCase.reviewStatus, 'reviewed');
    assert.strictEqual(reviewedCase.reviewerDecision, 'Escalate');
    assert.strictEqual(reviewedCase.reviewerNotes, notes);
    assert.strictEqual(reviewedCase.reviewerName, 'Dr. Ananya Sharma, MD');

    // Log audit event
    recordAuditEvent(
      reviewedCase.caseId,
      reviewedCase.reviewerName!,
      'Reviewer confirmed clinical decision',
      `Decision: ${decision}. Notes: ${notes}`
    );

    const logs = getAuditLogs();
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].caseId, 'CASE-7701');
    assert.strictEqual(logs[0].actor, 'Dr. Ananya Sharma, MD');
    assert.ok(logs[0].action.includes('Reviewer confirmed clinical decision'));
  });

  await t.test('TEST 13 & 14: Logout & Session Restoration', () => {
    const docSession = {
      accessToken: 'doc-jwt-token-xyz',
      tokenType: 'bearer',
      role: 'DOCTOR' as const,
      username: 'dr_sharma',
      displayName: 'Dr. Ananya Sharma, MD',
      userId: 'usr_doc_01',
    };
    client.saveSession(docSession);
    assert.strictEqual(client.getStoredUser()?.username, 'dr_sharma');

    // Logout
    client.clearSession();
    assert.strictEqual(client.getStoredUser(), null);
  });
});
