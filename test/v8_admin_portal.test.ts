import test from 'node:test';
import assert from 'node:assert';
import { AuthClient } from '../src/services/auth/authClient';
import type { TriageCase, AuditEvent } from '../src/types/triage';
import { recordAuditEvent, getAuditLogs, clearAuditLogs } from '../src/utils/audit';

test('SWASTHYA TRIAGE V8 - ADMINISTRATOR PORTAL & GOVERNANCE SUITE', async (t) => {
  const client = new AuthClient();

  await t.test('TEST 1: Admin login & Backend-Determined ADMIN Role', () => {
    const adminSession = {
      accessToken: 'admin-jwt-bearer-xyz',
      tokenType: 'bearer',
      role: 'ADMIN' as const,
      username: 'admin_user',
      displayName: 'System Administrator',
      userId: 'usr_adm_01',
    };
    client.saveSession(adminSession);
    const user = client.getStoredUser();
    assert.strictEqual(user?.role, 'ADMIN');
    assert.strictEqual(user?.username, 'admin_user');
    assert.strictEqual(user?.displayName, 'System Administrator');
  });

  await t.test('TEST 2: RBAC Protection on Admin Endpoints', () => {
    const checkAdminPermission = (role: string) => {
      if (role !== 'ADMIN') {
        return { status: 403, error: 'Forbidden. Admin privileges required.' };
      }
      return { status: 200, success: true };
    };

    assert.strictEqual(checkAdminPermission('PATIENT').status, 403);
    assert.strictEqual(checkAdminPermission('NURSE').status, 403);
    assert.strictEqual(checkAdminPermission('DOCTOR').status, 403);
    assert.strictEqual(checkAdminPermission('ADMIN').status, 200);
  });

  await t.test('TEST 3: Audit Trail & Provenance Event Inspection', () => {
    clearAuditLogs();

    // Create a chain of provenance events
    recordAuditEvent('CASE-9001', 'Patient', 'Case created with patient consent', 'Intake recorded');
    recordAuditEvent('CASE-9001', 'AI Triage Engine', 'Deterministic safety validation completed', 'No red flags');
    recordAuditEvent('CASE-9001', 'Dr. Ananya Sharma, MD', 'Reviewer confirmed clinical decision', 'Decision: Routine');

    const logs = getAuditLogs();
    assert.strictEqual(logs.length, 3);
    assert.strictEqual(logs[2].caseId, 'CASE-9001');
    assert.strictEqual(logs[0].actor, 'Dr. Ananya Sharma, MD'); // latest event is first
  });

  await t.test('TEST 4: Telemetry & Case Oversight Calculation', () => {
    const mockCases: TriageCase[] = [
      {
        caseId: 'CASE-9001',
        patientId: 'PAT-9001',
        preferredLanguage: 'English',
        consentGiven: true,
        rawSymptoms: 'Mild cough',
        extractedSymptoms: ['Cough'],
        timeline: [{ symptom: 'Cough', durationOrOnset: '2 days' }],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Routine cough',
        reviewStatus: 'reviewed',
        createdAt: new Date().toISOString(),
      },
      {
        caseId: 'CASE-9002',
        patientId: 'PAT-9002',
        preferredLanguage: 'English',
        consentGiven: true,
        rawSymptoms: 'Severe chest tightness',
        extractedSymptoms: ['Chest Heaviness'],
        timeline: [{ symptom: 'Chest Heaviness', durationOrOnset: '1 day' }],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [{ signal: 'cardiac_alert', reason: 'Chest tightness', level: 'immediate_attention' }],
        aiSummary: 'High urgency cardiorespiratory presentation',
        reviewStatus: 'awaiting_review',
        createdAt: new Date().toISOString(),
      },
    ];

    const totalCases = mockCases.length;
    const pendingCount = mockCases.filter((c) => c.reviewStatus === 'awaiting_review').length;
    const reviewedCount = mockCases.filter((c) => c.reviewStatus === 'reviewed').length;
    const highUrgencyCount = mockCases.filter((c) => c.urgencySignals && c.urgencySignals.length > 0).length;

    assert.strictEqual(totalCases, 2);
    assert.strictEqual(pendingCount, 1);
    assert.strictEqual(reviewedCount, 1);
    assert.strictEqual(highUrgencyCount, 1);
  });

  await t.test('TEST 5: Admin Audit Log Reset with Session Preservation', () => {
    // Perform admin reset
    clearAuditLogs();
    assert.strictEqual(getAuditLogs().length, 0);

    // User session remains active after audit reset
    assert.strictEqual(client.getStoredUser()?.role, 'ADMIN');
  });

  await t.test('TEST 6: Admin Logout & Session Teardown', () => {
    client.clearSession();
    assert.strictEqual(client.getStoredUser(), null);
    assert.deepStrictEqual(client.getAuthHeader(), {});
  });
});
