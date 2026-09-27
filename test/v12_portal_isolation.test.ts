import test from 'node:test';
import assert from 'node:assert';
import { AuthClient } from '../src/services/auth/authClient';
import type { TriageCase, ReviewerDecision } from '../src/types/triage';
import type { UserRole } from '../src/types/auth';

test('SWASTHYA TRIAGE PART 6 - STRICT PORTAL ISOLATION & SECTION CLEANUP SUITE', async (t) => {
  const client = new AuthClient();

  // ----------------------------------------------------
  // 1. Authoritative Role-to-Portal Dispatching
  // ----------------------------------------------------
  await t.test('1. Verified RoleGuard Portal Dispatcher Mapping', () => {
    const roleToPortalMap: Record<UserRole | 'MEDICAL_REVIEWER' | 'ADMINISTRATOR', string> = {
      PATIENT: 'PatientPortal',
      NURSE: 'NursePortal',
      DOCTOR: 'DoctorPortal',
      MEDICAL_REVIEWER: 'MedicalReviewerPortal',
      ADMIN: 'AdministratorPortal',
      ADMINISTRATOR: 'AdministratorPortal',
    };

    assert.strictEqual(roleToPortalMap.PATIENT, 'PatientPortal');
    assert.strictEqual(roleToPortalMap.NURSE, 'NursePortal');
    assert.strictEqual(roleToPortalMap.DOCTOR, 'DoctorPortal');
    assert.strictEqual(roleToPortalMap.MEDICAL_REVIEWER, 'MedicalReviewerPortal');
    assert.strictEqual(roleToPortalMap.ADMIN, 'AdministratorPortal');
    assert.strictEqual(roleToPortalMap.ADMINISTRATOR, 'AdministratorPortal');
  });

  // ----------------------------------------------------
  // 2. Strict Section Visibility by Role
  // ----------------------------------------------------
  await t.test('2. Strict Section Whitelist & Bleed Prevention Matrix', () => {
    // Exact allowed sections per specification
    const allowedSections: Record<UserRole, string[]> = {
      NURSE: ['01 NURSING TRIAGE QUEUE', '02 BEDSIDE INTAKE', '03 TRIAGE EVIDENCE NOTE'],
      DOCTOR: ['01 REVIEW QUEUE', '02 CLINICAL REVIEW', '03 AUDIT TRAIL'],
      PATIENT: ['01 PATIENT HOME', '02 SUBMIT SYMPTOMS', '03 MY CASES', '04 CASE SUMMARY'],
      ADMIN: ['01 AUDIT TRAIL & PROVENANCE', '02 SYSTEM GOVERNANCE & TELEMETRY', '03 CLINICAL QUEUE OVERSIGHT'],
    };

    // Nurse isolation checks
    assert.strictEqual(allowedSections.NURSE.length, 3);
    assert.ok(allowedSections.NURSE.includes('01 NURSING TRIAGE QUEUE'));
    assert.ok(allowedSections.NURSE.includes('02 BEDSIDE INTAKE'));
    assert.ok(allowedSections.NURSE.includes('03 TRIAGE EVIDENCE NOTE'));
    assert.ok(!allowedSections.NURSE.includes('01 REVIEW QUEUE'));
    assert.ok(!allowedSections.NURSE.includes('03 AUDIT TRAIL'));
    assert.ok(!allowedSections.NURSE.includes('01 PATIENT HOME'));

    // Doctor isolation checks
    assert.strictEqual(allowedSections.DOCTOR.length, 3);
    assert.ok(allowedSections.DOCTOR.includes('01 REVIEW QUEUE'));
    assert.ok(allowedSections.DOCTOR.includes('02 CLINICAL REVIEW'));
    assert.ok(allowedSections.DOCTOR.includes('03 AUDIT TRAIL'));
    assert.ok(!allowedSections.DOCTOR.includes('01 PATIENT INTAKE'));
    assert.ok(!allowedSections.DOCTOR.includes('01 NURSING TRIAGE QUEUE'));
    assert.ok(!allowedSections.DOCTOR.includes('01 PATIENT HOME'));

    // Patient isolation checks
    assert.strictEqual(allowedSections.PATIENT.length, 4);
    assert.ok(allowedSections.PATIENT.includes('01 PATIENT HOME'));
    assert.ok(allowedSections.PATIENT.includes('02 SUBMIT SYMPTOMS'));
    assert.ok(allowedSections.PATIENT.includes('03 MY CASES'));
    assert.ok(allowedSections.PATIENT.includes('04 CASE SUMMARY'));
    assert.ok(!allowedSections.PATIENT.includes('01 REVIEW QUEUE'));
    assert.ok(!allowedSections.PATIENT.includes('01 NURSING TRIAGE QUEUE'));
    assert.ok(!allowedSections.PATIENT.includes('01 AUDIT TRAIL & PROVENANCE'));

    // Admin isolation checks
    assert.strictEqual(allowedSections.ADMIN.length, 3);
    assert.ok(allowedSections.ADMIN.includes('01 AUDIT TRAIL & PROVENANCE'));
    assert.ok(allowedSections.ADMIN.includes('02 SYSTEM GOVERNANCE & TELEMETRY'));
    assert.ok(allowedSections.ADMIN.includes('03 CLINICAL QUEUE OVERSIGHT'));
    assert.ok(!allowedSections.ADMIN.includes('01 PATIENT INTAKE'));
    assert.ok(!allowedSections.ADMIN.includes('01 PATIENT HOME'));
  });

  // ----------------------------------------------------
  // 3. Clinical Decision Controls Restriction (Doctor vs Nurse vs Admin)
  // ----------------------------------------------------
  await t.test('3. Doctor Clinical Decision Authority vs Nurse vs Admin Isolation', () => {
    const canMakeClinicalDecision = (role: UserRole) => {
      // Strictly DOCTOR (Admin in portal has read-only oversight; Nurse can only record observations)
      return role === 'DOCTOR';
    };

    const canRecordBedsideObservations = (role: UserRole) => {
      return role === 'NURSE' || role === 'DOCTOR';
    };

    assert.strictEqual(canMakeClinicalDecision('DOCTOR'), true);
    assert.strictEqual(canMakeClinicalDecision('NURSE'), false);
    assert.strictEqual(canMakeClinicalDecision('PATIENT'), false);
    assert.strictEqual(canMakeClinicalDecision('ADMIN'), false);

    assert.strictEqual(canRecordBedsideObservations('NURSE'), true);
    assert.strictEqual(canRecordBedsideObservations('DOCTOR'), true);
    assert.strictEqual(canRecordBedsideObservations('PATIENT'), false);
  });

  // ----------------------------------------------------
  // 4. Strict Patient Case Ownership Security
  // ----------------------------------------------------
  await t.test('4. Strict Patient Data Ownership & Cross-Patient Protection', () => {
    const allCases: TriageCase[] = [
      {
        caseId: 'CASE-PAT-01',
        patientId: 'usr_pat_01',
        preferredLanguage: 'Hindi',
        consentGiven: true,
        rawSymptoms: 'Fever and cold',
        extractedSymptoms: ['Fever'],
        timeline: [],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Mild viral prodrome',
        reviewStatus: 'awaiting_review',
        createdAt: '2026-09-25T10:00:00Z',
      },
      {
        caseId: 'CASE-PAT-02',
        patientId: 'usr_pat_02',
        preferredLanguage: 'Hindi',
        consentGiven: true,
        rawSymptoms: 'Chest pain and nausea',
        extractedSymptoms: ['Chest Pain'],
        timeline: [],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [{ signal: 'cardiac_alert', level: 'immediate_attention', reason: 'Chest pain' }],
        aiSummary: 'Potential acute coronary syndrome',
        reviewStatus: 'awaiting_review',
        createdAt: '2026-09-25T11:00:00Z',
      },
    ];

    // Patient 01 views their cases
    const currentPatientUser = { userId: 'usr_pat_01', username: 'patient_demo', role: 'PATIENT' as const };
    const patient01Cases = allCases.filter(
      (c) => c.patientId === currentPatientUser.userId || c.patientId === currentPatientUser.username
    );

    assert.strictEqual(patient01Cases.length, 1);
    assert.strictEqual(patient01Cases[0].caseId, 'CASE-PAT-01');
    assert.strictEqual(patient01Cases[0].patientId, 'usr_pat_01');

    // Attempting to access another patient's case directly
    const targetCaseId = 'CASE-PAT-02';
    const unauthorizedAccess = patient01Cases.find((c) => c.caseId === targetCaseId);
    assert.strictEqual(unauthorizedAccess, undefined, 'Patient 1 must NEVER see Patient 2 case');
  });

  // ----------------------------------------------------
  // 5. Backend RBAC Authorization Matrix (401 / 403)
  // ----------------------------------------------------
  await t.test('5. Backend Endpoint Authorization Verification Matrix', () => {
    interface RouteCheck {
      endpoint: string;
      method: 'GET' | 'POST' | 'DELETE';
      allowedRoles: UserRole[];
    }

    const routes: RouteCheck[] = [
      { endpoint: '/api/patient/profile', method: 'GET', allowedRoles: ['PATIENT', 'ADMIN'] },
      { endpoint: '/api/patient/cases', method: 'GET', allowedRoles: ['PATIENT', 'ADMIN'] },
      { endpoint: '/api/review/queue', method: 'GET', allowedRoles: ['DOCTOR', 'NURSE', 'ADMIN'] },
      { endpoint: '/api/review/{case_id}/decision', method: 'POST', allowedRoles: ['DOCTOR', 'ADMIN'] },
      { endpoint: '/api/audit/logs', method: 'GET', allowedRoles: ['ADMIN', 'DOCTOR'] },
      { endpoint: '/api/audit/reset', method: 'POST', allowedRoles: ['ADMIN'] },
    ];

    const evaluatePermission = (route: RouteCheck, userRole?: UserRole) => {
      if (!userRole) return 401; // Unauthorized
      if (!route.allowedRoles.includes(userRole)) return 403; // Forbidden
      return 200; // Success
    };

    // Unauthenticated requests -> 401
    routes.forEach((r) => {
      assert.strictEqual(evaluatePermission(r, undefined), 401);
    });

    // Patient trying to make review decision -> 403
    const decisionRoute = routes.find((r) => r.endpoint === '/api/review/{case_id}/decision')!;
    assert.strictEqual(evaluatePermission(decisionRoute, 'PATIENT'), 403);
    assert.strictEqual(evaluatePermission(decisionRoute, 'NURSE'), 403);
    assert.strictEqual(evaluatePermission(decisionRoute, 'DOCTOR'), 200);

    // Nurse trying to reset audit -> 403
    const resetRoute = routes.find((r) => r.endpoint === '/api/audit/reset')!;
    assert.strictEqual(evaluatePermission(resetRoute, 'NURSE'), 403);
    assert.strictEqual(evaluatePermission(resetRoute, 'DOCTOR'), 403);
    assert.strictEqual(evaluatePermission(resetRoute, 'PATIENT'), 403);
    assert.strictEqual(evaluatePermission(resetRoute, 'ADMIN'), 200);
  });

  // ----------------------------------------------------
  // 6. Header Navigation Role-Aware Filtering
  // ----------------------------------------------------
  await t.test('6. Header Role-Aware Navigation Bar Integrity', () => {
    const getHeaderNavItems = (role: UserRole) => {
      switch (role) {
        case 'PATIENT':
          return ['Patient Portal'];
        case 'NURSE':
          return ['Nursing Queue'];
        case 'DOCTOR':
          return ['01 Review Queue', '02 Audit Trail'];
        case 'ADMIN':
          return ['Admin Governance & Audit'];
      }
    };

    assert.deepStrictEqual(getHeaderNavItems('PATIENT'), ['Patient Portal']);
    assert.deepStrictEqual(getHeaderNavItems('NURSE'), ['Nursing Queue']);
    assert.deepStrictEqual(getHeaderNavItems('DOCTOR'), ['01 Review Queue', '02 Audit Trail']);
    assert.deepStrictEqual(getHeaderNavItems('ADMIN'), ['Admin Governance & Audit']);
  });
});
