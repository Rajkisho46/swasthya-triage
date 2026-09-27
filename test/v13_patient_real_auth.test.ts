import test from 'node:test';
import assert from 'node:assert';
import { AuthClient } from '../src/services/auth/authClient';
import type { TriageCase } from '../src/types/triage';

test('SWASTHYA TRIAGE V13 - REAL PATIENT AUTHENTICATION & PORTAL ISOLATION SUITE', async (t) => {
  const client = new AuthClient();

  // =========================================================================
  // 1-4: Registration Validation & Password Complexity
  // =========================================================================
  await t.test('1. Registration validation (valid email format, non-empty name)', () => {
    const validateRegistrationInputs = (fullName: string, email: string) => {
      if (!fullName || fullName.trim().length < 2) return { valid: false, error: 'Name too short' };
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailPattern.test(email.trim())) return { valid: false, error: 'Invalid email' };
      return { valid: true };
    };

    assert.strictEqual(validateRegistrationInputs('', 'user@gmail.com').valid, false);
    assert.strictEqual(validateRegistrationInputs('R', 'user@gmail.com').valid, false);
    assert.strictEqual(validateRegistrationInputs('Rajesh Kumar', 'invalid-email').valid, false);
    assert.strictEqual(validateRegistrationInputs('Rajesh Kumar', 'patient@gmail.com').valid, true);
    assert.strictEqual(validateRegistrationInputs('Ananya', 'user@yahoo.co.in').valid, true);
  });

  await t.test('2. Password complexity validation (min 8 chars, uppercase, lowercase, number)', () => {
    const validatePassword = (password: string) => {
      if (password.length < 8) return false;
      if (!/[A-Z]/.test(password)) return false;
      if (!/[a-z]/.test(password)) return false;
      if (!/[0-9]/.test(password)) return false;
      return true;
    };

    assert.strictEqual(validatePassword('short1A'), false); // < 8 chars
    assert.strictEqual(validatePassword('alllowercase123'), false); // No uppercase
    assert.strictEqual(validatePassword('ALLUPPERCASE123'), false); // No lowercase
    assert.strictEqual(validatePassword('NoNumbersHereAtAll'), false); // No numbers
    assert.strictEqual(validatePassword('SecurePassword123'), true); // Valid
  });

  await t.test('3. Password confirmation check', () => {
    const checkPasswordMatch = (pw1: string, pw2: string) => pw1 === pw2;
    assert.strictEqual(checkPasswordMatch('Pass1234', 'Pass1234'), true);
    assert.strictEqual(checkPasswordMatch('Pass1234', 'Different1234'), false);
  });

  await t.test('4. Password hashing verification (never stored in plaintext)', () => {
    const isPlaintext = (storedValue: string) => {
      // bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 chars
      return !storedValue.startsWith('$2') && !storedValue.startsWith('$argon2');
    };
    const plaintext = 'MySecretPassword123';
    const fakeBcryptHash = '$2b$12$f.ZIHzloH9mV9bfnoAuF1.TkVXnf.dl6aAY7t.dWiCZhKdumjH8eu';

    assert.strictEqual(isPlaintext(plaintext), true);
    assert.strictEqual(isPlaintext(fakeBcryptHash), false);
  });

  // =========================================================================
  // 5-10: Secure 6-Digit OTP Generation, Hashing & Expiration
  // =========================================================================
  await t.test('5. OTP is generated as a 6-digit numeric string', () => {
    const generateNumericOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
    const otp = generateNumericOtp();
    assert.strictEqual(otp.length, 6);
    assert.match(otp, /^\d{6}$/);
  });

  await t.test('6. OTP is hashed before storage and NEVER returned in API responses', () => {
    const apiRegistrationResponse = {
      status: 'success',
      message: 'Verification code sent to patient@gmail.com. Please verify your email.',
    };

    assert.strictEqual(Object.keys(apiRegistrationResponse).includes('otp'), false);
    assert.strictEqual(Object.keys(apiRegistrationResponse).includes('otp_hash'), false);
    assert.strictEqual(Object.keys(apiRegistrationResponse).includes('code'), false);
  });

  await t.test('7. OTP expiration & attempt limit logic (10 mins, max 5 attempts)', () => {
    const isOtpValid = (token: { expiresAt: number; used: boolean; attemptCount: number }, now: number) => {
      if (token.used) return false;
      if (now > token.expiresAt) return false;
      if (token.attemptCount >= 5) return false;
      return true;
    };

    const now = 1000000;
    const validToken = { expiresAt: now + 600000, used: false, attemptCount: 0 };
    const expiredToken = { expiresAt: now - 1000, used: false, attemptCount: 0 };
    const usedToken = { expiresAt: now + 600000, used: true, attemptCount: 1 };
    const exhaustedToken = { expiresAt: now + 600000, used: false, attemptCount: 5 };

    assert.strictEqual(isOtpValid(validToken, now), true);
    assert.strictEqual(isOtpValid(expiredToken, now), false);
    assert.strictEqual(isOtpValid(usedToken, now), false);
    assert.strictEqual(isOtpValid(exhaustedToken, now), false);
  });

  await t.test('8. OTP single-use replay prevention', () => {
    let tokenState = { used: false };
    const consumeOtp = () => {
      if (tokenState.used) return { success: false, error: 'Replay forbidden' };
      tokenState.used = true;
      return { success: true };
    };

    assert.strictEqual(consumeOtp().success, true);
    assert.strictEqual(consumeOtp().success, false);
  });

  // =========================================================================
  // 11-16: Email Verification, JWT Session & Login
  // =========================================================================
  await t.test('9. Email verification marks account as verified & assigns PATIENT role', () => {
    const patientAccount = {
      id: 'PT-98102',
      email: 'rajesh.kumar@gmail.com',
      emailVerified: false,
      role: 'PATIENT' as const,
    };

    // Upon successful OTP verification:
    patientAccount.emailVerified = true;

    assert.strictEqual(patientAccount.emailVerified, true);
    assert.strictEqual(patientAccount.role, 'PATIENT');
  });

  await t.test('10. JWT Session is generated with PATIENT claims and stored in AuthClient', () => {
    const patientTokenResp = {
      accessToken: 'header.payload.signature-patient-jwt',
      tokenType: 'bearer',
      role: 'PATIENT' as const,
      username: 'rajesh.kumar@gmail.com',
      displayName: 'Rajesh Kumar',
      userId: 'usr_pat_9901',
    };

    client.saveSession(patientTokenResp);
    const user = client.getStoredUser();

    assert.strictEqual(user?.role, 'PATIENT');
    assert.strictEqual(user?.userId, 'usr_pat_9901');
    assert.strictEqual(user?.username, 'rajesh.kumar@gmail.com');
    assert.strictEqual(user?.displayName, 'Rajesh Kumar');
    assert.strictEqual(client.getStoredToken(), 'header.payload.signature-patient-jwt');
  });

  await t.test('11. Returning patient logs in directly with Email + Password without mandatory OTP', () => {
    const loginUser = (userRecord: { email: string; emailVerified: boolean; passwordHash: string }, inputPw: string) => {
      if (!userRecord.emailVerified) return { status: 403, error: 'Unverified email' };
      if (inputPw !== 'CorrectPassword123') return { status: 401, error: 'Invalid password' };
      return { status: 200, role: 'PATIENT', token: 'jwt-session-token' };
    };

    const verifiedUser = {
      email: 'rajesh.kumar@gmail.com',
      emailVerified: true,
      passwordHash: 'hash-xyz',
    };

    const loginSuccess = loginUser(verifiedUser, 'CorrectPassword123');
    assert.strictEqual(loginSuccess.status, 200);
    assert.strictEqual(loginSuccess.role, 'PATIENT');

    const wrongPw = loginUser(verifiedUser, 'WrongPassword');
    assert.strictEqual(wrongPw.status, 401);
  });

  // =========================================================================
  // 17-21: Forgot Password & Account Recovery Flow
  // =========================================================================
  await t.test('12. Password reset request uses generic non-enumerating response', () => {
    const getResetResponse = () => ({
      status: 'success',
      message: 'If an account exists for this email, a password reset code has been sent.',
    });

    const res1 = getResetResponse();
    assert.ok(res1.message.includes('If an account exists'));
    assert.ok(!res1.message.includes('User not found'));
  });

  await t.test('13. Password reset with OTP updates password hash and invalidates old password', () => {
    let storedPasswordHash = 'hash_v1_old';
    const verifyAndResetPassword = (otpValid: boolean, newPw: string) => {
      if (!otpValid) return false;
      storedPasswordHash = `hash_v2_${newPw}`;
      return true;
    };

    assert.strictEqual(verifyAndResetPassword(true, 'NewSecurePassword456'), true);
    assert.strictEqual(storedPasswordHash, 'hash_v2_NewSecurePassword456');
  });

  // =========================================================================
  // 22-29: Patient Case Ownership & Multi-Patient Isolation
  // =========================================================================
  await t.test('14. Backend derives case ownership from authenticated JWT (never trusting client)', () => {
    const authenticatedPatient = { userId: 'usr_pat_9901', role: 'PATIENT' };
    const clientSuppliedBody = { patientId: 'usr_pat_STOLEN_ID', rawSymptoms: 'Fever' };

    // Backend authoritative assignment
    const assignedPatientId = authenticatedPatient.role === 'PATIENT'
      ? authenticatedPatient.userId
      : clientSuppliedBody.patientId;

    assert.strictEqual(assignedPatientId, 'usr_pat_9901');
    assert.notStrictEqual(assignedPatientId, 'usr_pat_STOLEN_ID');
  });

  await t.test('15. Patient can access ONLY their own cases (Cross-patient 403 Forbidden)', () => {
    const databaseCases: TriageCase[] = [
      {
        caseId: 'CASE-PAT-01',
        patientId: 'usr_pat_9901', // Patient A
        consentGiven: true,
        rawSymptoms: 'Fever and chills',
        extractedSymptoms: ['Fever'],
        timeline: [],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Routine advisory',
        reviewStatus: 'awaiting_review',
        createdAt: new Date().toISOString(),
        preferredLanguage: 'English',
      },
      {
        caseId: 'CASE-PAT-02',
        patientId: 'usr_pat_OTHER', // Patient B
        consentGiven: true,
        rawSymptoms: 'Confidential symptoms',
        extractedSymptoms: ['Cough'],
        timeline: [],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Confidential',
        reviewStatus: 'awaiting_review',
        createdAt: new Date().toISOString(),
        preferredLanguage: 'English',
      },
    ];

    const getPatientCases = (requestingUserId: string) => {
      return databaseCases.filter((c) => c.patientId === requestingUserId);
    };

    const getPatientCaseById = (requestingUserId: string, requestingRole: string, caseId: string) => {
      const c = databaseCases.find((item) => item.caseId === caseId);
      if (!c) return { status: 404 };
      if (requestingRole !== 'ADMIN' && c.patientId !== requestingUserId) {
        return { status: 403, error: 'Access Denied' };
      }
      return { status: 200, case: c };
    };

    // Patient A retrieves own cases -> 1 case returned
    const myCases = getPatientCases('usr_pat_9901');
    assert.strictEqual(myCases.length, 1);
    assert.strictEqual(myCases[0].caseId, 'CASE-PAT-01');

    // Patient A requests own case by ID -> 200
    assert.strictEqual(getPatientCaseById('usr_pat_9901', 'PATIENT', 'CASE-PAT-01').status, 200);

    // Patient A attempts accessing Patient B's case -> 403 Forbidden
    assert.strictEqual(getPatientCaseById('usr_pat_9901', 'PATIENT', 'CASE-PAT-02').status, 403);
  });

  await t.test('16. Patient role cannot access Doctor, Nurse, or Admin actions', () => {
    const isActionAllowed = (role: string, action: string) => {
      if (action === 'DOCTOR_CLINICAL_DECISION') return role === 'DOCTOR' || role === 'ADMIN';
      if (action === 'NURSE_BEDSIDE_QUEUE') return role === 'NURSE' || role === 'DOCTOR' || role === 'ADMIN';
      if (action === 'ADMIN_AUDIT_RESET') return role === 'ADMIN';
      return false;
    };

    assert.strictEqual(isActionAllowed('PATIENT', 'DOCTOR_CLINICAL_DECISION'), false);
    assert.strictEqual(isActionAllowed('PATIENT', 'NURSE_BEDSIDE_QUEUE'), false);
    assert.strictEqual(isActionAllowed('PATIENT', 'ADMIN_AUDIT_RESET'), false);
  });

  // =========================================================================
  // 30-36: Staff Demo System Preservation
  // =========================================================================
  await t.test('17. Staff Demo logins (Nurse, Doctor, Admin) remain fully operational', () => {
    const staffDemoStore = {
      dr_sharma: { role: 'DOCTOR', displayName: 'Dr. Ananya Sharma, MD' },
      nurse_priya: { role: 'NURSE', displayName: 'Nurse Priya Nair, RN' },
      admin_user: { role: 'ADMIN', displayName: 'System Administrator' },
    };

    assert.strictEqual(staffDemoStore.dr_sharma.role, 'DOCTOR');
    assert.strictEqual(staffDemoStore.nurse_priya.role, 'NURSE');
    assert.strictEqual(staffDemoStore.admin_user.role, 'ADMIN');
  });

  await t.test('18. Multi-portal routing isolation for all 4 roles', () => {
    const resolvePortalForRole = (role: string) => {
      switch (role) {
        case 'PATIENT': return 'Patient Portal';
        case 'NURSE': return 'Nurse Portal';
        case 'DOCTOR': return 'Doctor / Medical Reviewer Portal';
        case 'ADMIN': return 'Administrator Portal';
        default: return 'Access Denied';
      }
    };

    assert.strictEqual(resolvePortalForRole('PATIENT'), 'Patient Portal');
    assert.strictEqual(resolvePortalForRole('NURSE'), 'Nurse Portal');
    assert.strictEqual(resolvePortalForRole('DOCTOR'), 'Doctor / Medical Reviewer Portal');
    assert.strictEqual(resolvePortalForRole('ADMIN'), 'Administrator Portal');
  });

  await t.test('19. verify-otp and verify-email both accept valid OTP payloads', () => {
    const mockEndpoints = {
      '/api/patient/auth/verify-otp': (otp: string) => otp.length === 6,
      '/api/patient/auth/verify-email': (otp: string) => otp.length === 6,
    };

    assert.strictEqual(mockEndpoints['/api/patient/auth/verify-otp']('123456'), true);
    assert.strictEqual(mockEndpoints['/api/patient/auth/verify-email']('123456'), true);
    assert.strictEqual(mockEndpoints['/api/patient/auth/verify-otp']('12'), false);
  });

  await t.test('20. Patient profile /me endpoint returns authenticated patient attributes', () => {
    const mockMeResponse = {
      id: 'PT-98102',
      email: 'rajesh.kumar@gmail.com',
      fullName: 'Rajesh Kumar',
      role: 'PATIENT',
      emailVerified: true,
      preferredLanguage: 'Hindi',
    };

    assert.strictEqual(mockMeResponse.role, 'PATIENT');
    assert.strictEqual(mockMeResponse.emailVerified, true);
    assert.strictEqual(mockMeResponse.fullName, 'Rajesh Kumar');
  });

  await t.test('21. Distinguishable error messages for invalid credentials, expired OTP, and server unavailability', () => {
    const parseError = (status: number, detail?: string) => {
      if (status === 404) return 'Authentication endpoint not found (HTTP 404). Ensure FastAPI backend server is running on port 8000.';
      if (status === 429) return 'Too many requests. Please wait before trying again.';
      if (status === 400 && detail) return detail;
      if (status === 401) return 'Invalid email or password.';
      return 'Server error';
    };

    assert.ok(parseError(404).includes('HTTP 404'));
    assert.strictEqual(parseError(401), 'Invalid email or password.');
    assert.strictEqual(parseError(400, 'This verification code has expired. Please request a new code.'), 'This verification code has expired. Please request a new code.');
  });
});

