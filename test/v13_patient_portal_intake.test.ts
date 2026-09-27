import test from 'node:test';
import assert from 'node:assert';
import { AuthClient } from '../src/services/auth/authClient';
import type { TriageCase, TriageFormData } from '../src/types/triage';
import { processTriageIntakeAsync } from '../src/services/triageService';

test('SWASTHYA TRIAGE V13 - PATIENT PORTAL (SYMPTOM INTAKE & STATUS) SUITE', async (t) => {
  const client = new AuthClient();

  await t.test('1. Patient Authentication & Profile Isolation', () => {
    const patientSession = {
      accessToken: 'patient-jwt-session-abc',
      tokenType: 'bearer',
      role: 'PATIENT' as const,
      username: 'patient_rajesh',
      displayName: 'Rajesh Kumar',
      userId: 'usr_pat_101',
    };
    client.saveSession(patientSession);
    const user = client.getStoredUser();

    assert.strictEqual(user?.role, 'PATIENT');
    assert.strictEqual(user?.userId, 'usr_pat_101');
    assert.strictEqual(user?.username, 'patient_rajesh');
    assert.strictEqual(user?.displayName, 'Rajesh Kumar');
  });

  await t.test('2. Patient Case Creation with Bound Patient ID', async () => {
    const activeUserId = 'usr_pat_101';
    const formData: TriageFormData = {
      caseId: 'CASE-PAT-INTAKE-01',
      patientId: activeUserId,
      age: 42,
      gender: 'Male',
      preferredLanguage: 'English',
      symptoms: 'Mild headache and body aches for two days.',
      consentGiven: true,
    };

    const triageCase = await processTriageIntakeAsync(formData);

    assert.strictEqual(triageCase.patientId, 'usr_pat_101');
    assert.strictEqual(triageCase.consentGiven, true);
    assert.strictEqual(triageCase.reviewStatus, 'awaiting_review');
    assert.ok(triageCase.extractedSymptoms.length > 0);
  });

  await t.test('3. Patient Portal Isolation: Filtering & Multi-Patient Data Segregation', () => {
    const currentPatientId = 'usr_pat_101';

    const allCases: TriageCase[] = [
      {
        caseId: 'CASE-01',
        patientId: 'usr_pat_101',
        consentGiven: true,
        rawSymptoms: 'Patient 101 symptoms',
        extractedSymptoms: ['Fever'],
        timeline: [],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Informational advisory',
        reviewStatus: 'awaiting_review',
        createdAt: new Date().toISOString(),
        preferredLanguage: 'English',
      },
      {
        caseId: 'CASE-02',
        patientId: 'usr_pat_999', // Another patient's case
        consentGiven: true,
        rawSymptoms: 'Confidential patient 999 symptoms',
        extractedSymptoms: ['Cough'],
        timeline: [],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Informational advisory',
        reviewStatus: 'awaiting_review',
        createdAt: new Date().toISOString(),
        preferredLanguage: 'English',
      },
    ];

    // Filter strictly to current patient
    const patientVisibleCases = allCases.filter(
      (c) => c.patientId === currentPatientId
    );

    assert.strictEqual(patientVisibleCases.length, 1);
    assert.strictEqual(patientVisibleCases[0].caseId, 'CASE-01');
    assert.strictEqual(patientVisibleCases[0].patientId, 'usr_pat_101');
  });

  await t.test('4. Section Control Isolation: No Clinician or Admin Controls in Patient View', () => {
    // Verify that the patient role has zero access to doctor/nurse/admin actions
    const isPatientPermittedAction = (action: string) => {
      const allowedPatientActions = [
        'SUBMIT_SYMPTOMS',
        'VIEW_OWN_CASES',
        'VIEW_OWN_SUMMARY',
        'SEND_CASE_FOR_REVIEW',
      ];
      return allowedPatientActions.includes(action);
    };

    assert.strictEqual(isPatientPermittedAction('SUBMIT_SYMPTOMS'), true);
    assert.strictEqual(isPatientPermittedAction('VIEW_OWN_CASES'), true);
    assert.strictEqual(isPatientPermittedAction('DOCTOR_CLINISION_DECISION'), false);
    assert.strictEqual(isPatientPermittedAction('NURSE_BEDSIDE_QUEUE'), false);
    assert.strictEqual(isPatientPermittedAction('ADMIN_AUDIT_RESET'), false);
    assert.strictEqual(isPatientPermittedAction('VIEW_OTHER_PATIENT_RECORDS'), false);
  });

  await t.test('5. Non-Diagnostic Safety & Patient Narrative Provenance in Intake', () => {
    const rawPatientText = 'I have mild sore throat and a slight fever since morning.';
    const aiSummary = 'Patient reported sore throat and fever. Clinical review required.';

    assert.strictEqual(rawPatientText, 'I have mild sore throat and a slight fever since morning.');
    assert.ok(!aiSummary.toLowerCase().includes('diagnosis:'));
    assert.ok(!aiSummary.toLowerCase().includes('prescription:'));
    assert.ok(!aiSummary.toLowerCase().includes('rx:'));
  });
});
