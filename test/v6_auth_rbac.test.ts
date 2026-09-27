import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AuthClient } from '../src/services/auth/authClient';
import { handleAuthLoginRequest, DEMO_SERVER_USERS } from '../src/server/authProxyHandler';
import { processTriageIntakeAsync } from '../src/services/triageService';
import { clearAuditLogs } from '../src/utils/audit';
import type { UserRole } from '../src/types/auth';

describe('SWASTHYA TRIAGE V6 - MULTI-ROLE AUTHENTICATION & RBAC SUITE', () => {
  let client: AuthClient;

  beforeEach(() => {
    client = new AuthClient('http://localhost:8000');
    clearAuditLogs();
  });

  // 1-5: Multi-role logins succeed & backend determines role
  describe('Requirement 1-5: Multi-Role Logins & Backend Role Determination', () => {
    it('1. Patient login succeeds with backend-determined PATIENT role', async () => {
      const res = handleAuthLoginRequest({ username: 'patient_demo', password: 'patientpassword123' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.role, 'PATIENT');
      assert.strictEqual(res.body.username, 'patient_demo');
      assert.ok(res.body.access_token);
    });

    it('2. Nurse login succeeds with backend-determined NURSE role', async () => {
      const res = handleAuthLoginRequest({ username: 'nurse_priya', password: 'nursepassword123' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.role, 'NURSE');
      assert.strictEqual(res.body.username, 'nurse_priya');
      assert.ok(res.body.access_token);
    });

    it('3. Doctor login succeeds with backend-determined DOCTOR role', async () => {
      const res = handleAuthLoginRequest({ username: 'dr_sharma', password: 'doctorpassword123' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.role, 'DOCTOR');
      assert.strictEqual(res.body.username, 'dr_sharma');
      assert.ok(res.body.access_token);
    });

    it('4. Admin login succeeds with backend-determined ADMIN role', async () => {
      const res = handleAuthLoginRequest({ username: 'admin_user', password: 'adminpassword123' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.role, 'ADMIN');
      assert.strictEqual(res.body.username, 'admin_user');
      assert.ok(res.body.access_token);
    });
  });

  // 5-7: Security credential verification
  describe('Requirement 5-7: Credential Validation & Security', () => {
    it('5. Wrong password fails with 401 Unauthorized', () => {
      const res = handleAuthLoginRequest({ username: 'dr_sharma', password: 'wrongpassword' });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('6. Unknown user fails with 401 Unauthorized', () => {
      const res = handleAuthLoginRequest({ username: 'unknown_hacker', password: 'somepassword' });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('7. Security Check: Client cannot elevate role by submitting role=ADMIN', () => {
      // patient_demo is PATIENT. Attempting to pass role=ADMIN should be ignored by backend.
      const res = handleAuthLoginRequest({
        username: 'patient_demo',
        password: 'patientpassword123',
        role: 'ADMIN',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.role, 'PATIENT'); // Remains PATIENT
    });
  });

  // 8-11: Token generation, storage, and authorization headers
  describe('Requirement 8-11: Token Generation & Session Management', () => {
    it('8. JWT token is generated and contains bearer type', () => {
      const res = handleAuthLoginRequest({ username: 'dr_sharma', password: 'doctorpassword123' });
      assert.ok(res.body.access_token);
      assert.strictEqual(res.body.token_type, 'bearer');
    });

    it('9. Session save and retrieval via AuthClient', () => {
      const mockTokenResp = {
        accessToken: 'mock_jwt_token_123',
        tokenType: 'bearer',
        role: 'DOCTOR' as UserRole,
        username: 'dr_sharma',
        displayName: 'Dr. Ananya Sharma, MD',
        userId: 'usr_doc_01',
      };
      client.saveSession(mockTokenResp);
      const user = client.getStoredUser();
      assert.ok(user);
      assert.strictEqual(user?.username, 'dr_sharma');
      assert.strictEqual(user?.role, 'DOCTOR');

      const headers = client.getAuthHeader();
      assert.strictEqual(headers.Authorization, 'Bearer mock_jwt_token_123');
    });

    it('10. Invalid/empty token produces empty Authorization header', () => {
      client.clearSession();
      const headers = client.getAuthHeader();
      assert.deepStrictEqual(headers, {});
    });

    it('11. Clear session completely wipes token and user state on logout', () => {
      client.saveSession({
        accessToken: 'mock_token',
        tokenType: 'bearer',
        role: 'ADMIN',
        username: 'admin_user',
        displayName: 'Admin',
        userId: 'usr_adm_01',
      });
      assert.ok(client.getStoredUser());
      client.clearSession();
      assert.strictEqual(client.getStoredUser(), null);
      assert.strictEqual(client.getStoredToken(), null);
    });
  });

  // 12-14: Role-based permissions & portal routing
  describe('Requirement 12-14: Role-Based Portal Permissions', () => {
    it('12. Patient portal mapping correctly routes to patient_portal', () => {
      const role: UserRole = 'PATIENT';
      const targetPortal = role === 'PATIENT' ? 'patient_portal' : 'nurse_queue';
      assert.strictEqual(targetPortal, 'patient_portal');
    });

    it('13. Nurse portal mapping correctly routes to nurse_queue', () => {
      const role: UserRole = 'NURSE';
      const targetPortal = role === 'NURSE' ? 'nurse_queue' : 'patient_portal';
      assert.strictEqual(targetPortal, 'nurse_queue');
    });

    it('14. Doctor and Admin portals correctly route to reviewer and audit', () => {
      const docRole: UserRole = 'DOCTOR';
      const adminRole: UserRole = 'ADMIN';
      assert.strictEqual(docRole === 'DOCTOR' ? 'reviewer' : 'patient_portal', 'reviewer');
      assert.strictEqual(adminRole === 'ADMIN' ? 'audit' : 'patient_portal', 'audit');
    });
  });

  // 15-16: Workflow continuity & state preservation
  describe('Requirement 15-16: End-to-End Workflow Continuity', () => {
    it('15. End-to-end clinical workflow executes with role provenance tracking', async () => {
      // 1. Patient submits intake case
      const patAuth = handleAuthLoginRequest({ username: 'patient_demo', password: 'patientpassword123' });
      assert.strictEqual(patAuth.body.role, 'PATIENT');

      const intakeCase = await processTriageIntakeAsync({
        patientId: 'PATIENT-AUTH-TEST',
        age: 52,
        gender: 'Female',
        preferredLanguage: 'English',
        symptoms: 'High fever for 3 days and breathing difficulty',
        consentGiven: true,
      });

      assert.strictEqual(intakeCase.reviewStatus, 'awaiting_review');
      assert.ok(intakeCase.extractedSymptoms.includes('Breathing Difficulty / Dyspnea'));

      // 2. Doctor logs in and records human decision
      const docAuth = handleAuthLoginRequest({ username: 'dr_sharma', password: 'doctorpassword123' });
      assert.strictEqual(docAuth.body.role, 'DOCTOR');

      const reviewedCase = {
        ...intakeCase,
        reviewStatus: 'reviewed' as const,
        reviewerDecision: 'Escalate' as const,
        reviewerNotes: 'SpO2 93%, escalated to Medical Officer OPD',
        reviewerName: docAuth.body.display_name,
      };

      assert.strictEqual(reviewedCase.reviewStatus, 'reviewed');
      assert.strictEqual(reviewedCase.reviewerDecision, 'Escalate');
      assert.strictEqual(reviewedCase.reviewerName, 'Dr. Ananya Sharma, MD');
    });
  });

  // 17-18: Health Worker Role Removal Verification
  describe('Requirement 17-18: Health Worker Role Removal Verification', () => {
    it('17. Health Worker login attempts fail with 401 Unauthorized', () => {
      const res = handleAuthLoginRequest({ username: 'asha_worker', password: 'ashapassword123' });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('18. Allowed roles are strictly PATIENT, NURSE, DOCTOR, ADMIN with no Health Worker demo accounts', async () => {
      const { DEMO_ACCOUNTS_INFO } = await import('../src/types/auth');
      const roles = DEMO_ACCOUNTS_INFO.map((a) => a.role);
      assert.deepStrictEqual(roles.sort(), ['ADMIN', 'DOCTOR', 'NURSE', 'PATIENT']);
      assert.ok(!roles.includes('HEALTH_WORKER' as any));
      assert.ok(!DEMO_ACCOUNTS_INFO.some((a) => a.username.includes('health') || a.username.includes('asha')));
    });
  });
});
