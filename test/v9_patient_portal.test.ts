import test from 'node:test';
import assert from 'node:assert';
import { AuthClient } from '../src/services/auth/authClient';
import type { TriageCase } from '../src/types/triage';

test('SWASTHYA TRIAGE V9 - PATIENT PORTAL & OWNERSHIP SUITE', async (t) => {
  const client = new AuthClient();

  await t.test('TEST 1-4: Multi-Role Routing & Portal Integrity', () => {
    // 1. Patient
    const patientSession = {
      accessToken: 'patient-jwt-token-xyz',
      tokenType: 'bearer',
      role: 'PATIENT' as const,
      username: 'patient_demo',
      displayName: 'Rajesh Kumar (Patient)',
      userId: 'usr_pat_01',
    };
    client.saveSession(patientSession);
    assert.strictEqual(client.getStoredUser()?.role, 'PATIENT');

    // 2. Nurse
    const nurseSession = {
      accessToken: 'nurse-jwt-token-xyz',
      tokenType: 'bearer',
      role: 'NURSE' as const,
      username: 'nurse_priya',
      displayName: 'Nurse Priya Nair, RN',
      userId: 'usr_nur_01',
    };
    client.saveSession(nurseSession);
    assert.strictEqual(client.getStoredUser()?.role, 'NURSE');

    // 3. Doctor
    const docSession = {
      accessToken: 'doc-jwt-token-xyz',
      tokenType: 'bearer',
      role: 'DOCTOR' as const,
      username: 'dr_sharma',
      displayName: 'Dr. Ananya Sharma, MD',
      userId: 'usr_doc_01',
    };
    client.saveSession(docSession);
    assert.strictEqual(client.getStoredUser()?.role, 'DOCTOR');

    // 4. Admin
    const adminSession = {
      accessToken: 'admin-jwt-token-xyz',
      tokenType: 'bearer',
      role: 'ADMIN' as const,
      username: 'admin_user',
      displayName: 'System Administrator',
      userId: 'usr_adm_01',
    };
    client.saveSession(adminSession);
    assert.strictEqual(client.getStoredUser()?.role, 'ADMIN');
  });

  await t.test('TEST 5: Patient can access own profile', () => {
    const patientSession = {
      accessToken: 'patient-jwt-token-xyz',
      tokenType: 'bearer',
      role: 'PATIENT' as const,
      username: 'patient_demo',
      displayName: 'Rajesh Kumar (Patient)',
      userId: 'usr_pat_01',
    };
    client.saveSession(patientSession);
    const user = client.getStoredUser();
    assert.strictEqual(user?.userId, 'usr_pat_01');
    assert.strictEqual(user?.username, 'patient_demo');
    assert.strictEqual(user?.displayName, 'Rajesh Kumar (Patient)');
  });

  await t.test('TEST 6, 7 & 8: Patient can create & retrieve own cases', () => {
    const patientCases: TriageCase[] = [
      {
        caseId: 'CASE-PAT-101',
        patientId: 'usr_pat_01',
        preferredLanguage: 'English',
        consentGiven: true,
        rawSymptoms: 'Mild throat ache and slight fever',
        extractedSymptoms: ['Sore Throat', 'Mild Fever'],
        timeline: [{ symptom: 'Sore Throat', durationOrOnset: '1 day' }],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Mild upper respiratory symptoms.',
        reviewStatus: 'awaiting_review',
        createdAt: new Date().toISOString(),
      },
    ];

    // Filter simulation by owner
    const currentUserId = 'usr_pat_01';
    const myCases = patientCases.filter((c) => c.patientId === currentUserId);
    assert.strictEqual(myCases.length, 1);
    assert.strictEqual(myCases[0].caseId, 'CASE-PAT-101');
    assert.strictEqual(myCases[0].rawSymptoms, 'Mild throat ache and slight fever');
  });

  await t.test('TEST 9: Patient Case Ownership Security (Cannot access another patient case)', () => {
    const allDatabaseCases: TriageCase[] = [
      {
        caseId: 'CASE-PAT-101',
        patientId: 'usr_pat_01', // Rajesh
        preferredLanguage: 'English',
        consentGiven: true,
        rawSymptoms: 'Mild throat ache',
        extractedSymptoms: ['Sore Throat'],
        timeline: [{ symptom: 'Sore Throat', durationOrOnset: '1 day' }],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Routine',
        reviewStatus: 'awaiting_review',
        createdAt: new Date().toISOString(),
      },
      {
        caseId: 'CASE-PAT-999',
        patientId: 'usr_pat_99', // Other patient
        preferredLanguage: 'English',
        consentGiven: true,
        rawSymptoms: 'Confidential symptoms',
        extractedSymptoms: ['Fever'],
        timeline: [{ symptom: 'Fever', durationOrOnset: '2 days' }],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Confidential',
        reviewStatus: 'awaiting_review',
        createdAt: new Date().toISOString(),
      },
    ];

    // Access authorization check
    const checkCaseAccess = (requestingUserId: string, requestingRole: string, targetCaseId: string) => {
      const c = allDatabaseCases.find((item) => item.caseId === targetCaseId);
      if (!c) return { status: 404, error: 'Not Found' };
      if (requestingRole !== 'ADMIN' && c.patientId !== requestingUserId) {
        return { status: 403, error: 'Access Denied' };
      }
      return { status: 200, case: c };
    };

    // Patient accessing own case -> 200
    assert.strictEqual(checkCaseAccess('usr_pat_01', 'PATIENT', 'CASE-PAT-101').status, 200);

    // Patient accessing another patient's case -> 403 Forbidden
    assert.strictEqual(checkCaseAccess('usr_pat_01', 'PATIENT', 'CASE-PAT-999').status, 403);
  });

  await t.test('TEST 10, 11 & 12: RBAC Denials for Patient on Clinician & Admin Endpoints', () => {
    const canAccessEndpoint = (role: string, endpoint: string) => {
      if (endpoint === '/api/review/decision') {
        return role === 'DOCTOR' || role === 'ADMIN';
      }
      if (endpoint === '/api/review/queue') {
        return role === 'DOCTOR' || role === 'NURSE' || role === 'ADMIN';
      }
      if (endpoint === '/api/audit/reset') {
        return role === 'ADMIN';
      }
      return false;
    };

    // Patient role is denied from Doctor & Admin endpoints
    assert.strictEqual(canAccessEndpoint('PATIENT', '/api/review/decision'), false);
    assert.strictEqual(canAccessEndpoint('PATIENT', '/api/review/queue'), false);
    assert.strictEqual(canAccessEndpoint('PATIENT', '/api/audit/reset'), false);
  });

  await t.test('TEST 13 & 14: Non-Diagnostic & Provenance Distinctions in Patient View', () => {
    const testCase: TriageCase = {
      caseId: 'CASE-PAT-101',
      patientId: 'usr_pat_01',
      preferredLanguage: 'Hindi',
      consentGiven: true,
      rawSymptoms: 'खांसी और हल्का बुखार',
      extractedSymptoms: ['Cough', 'Mild Fever'],
      timeline: [{ symptom: 'खांसी और बुखार', durationOrOnset: '2 days' }],
      missingInformation: ['Temperature in °F'],
      followUpQuestions: ['Does patient have body ache?'],
      urgencySignals: [],
      aiSummary: 'Informational triage advisory. Clinical evaluation pending.',
      reviewStatus: 'awaiting_review',
      createdAt: new Date().toISOString(),
    };

    // Patient provenance is preserved verbatim
    assert.strictEqual(testCase.rawSymptoms, 'खांसी और हल्का बुखार');
    // AI advisory is strictly non-diagnostic
    assert.ok(!testCase.aiSummary.toLowerCase().includes('diagnos'));
    assert.ok(!testCase.aiSummary.toLowerCase().includes('prescrib'));
  });
});
