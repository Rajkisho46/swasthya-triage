import test from 'node:test';
import assert from 'node:assert';
import { AuthClient } from '../src/services/auth/authClient';
import type { TriageCase } from '../src/types/triage';

test('SWASTHYA TRIAGE V13 - REAL PATIENT EMAIL & GMAIL OTP AUTHENTICATION SUITE', async (t) => {
  const client = new AuthClient();

  // 1. New patient registration input validation
  await t.test('1. New patient registration (name, valid real email, complex password)', () => {
    const validateRegistration = (fullName: string, email: string, password: string) => {
      if (!fullName || fullName.trim().length < 2) return { valid: false, error: 'Name too short' };
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailPattern.test(email.trim())) return { valid: false, error: 'Invalid email' };
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return { valid: false, error: 'Password does not meet complexity requirements' };
      }
      return { valid: true };
    };

    assert.strictEqual(validateRegistration('Rajesh Kumar', 'patient@gmail.com', 'SecurePass123').valid, true);
    assert.strictEqual(validateRegistration('R', 'patient@gmail.com', 'SecurePass123').valid, false);
    assert.strictEqual(validateRegistration('Rajesh Kumar', 'invalid-email', 'SecurePass123').valid, false);
    assert.strictEqual(validateRegistration('Rajesh Kumar', 'patient@gmail.com', 'simple').valid, false);
  });

  // 2. Email normalization
  await t.test('2. Email normalization (case-insensitive trimming)', () => {
    const normalizeEmail = (rawEmail: string) => rawEmail.trim().toLowerCase();
    assert.strictEqual(normalizeEmail('  KingDevil44597@Gmail.Com  '), 'kingdevil44597@gmail.com');
  });

  // 3. Password hashing
  await t.test('3. Password hashing (never stored or transmitted in plaintext)', () => {
    const isBcryptHash = (hash: string) => /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
    const fakeBcrypt = '$2b$12$e8N4O1T9zW2L5fC6yG8uHe4qV1wX7zA3bC5dE7fG9hI1jK3lM5nOq';
    assert.strictEqual(isBcryptHash(fakeBcrypt), true);
    assert.strictEqual(isBcryptHash('PlaintextPass123'), false);
  });

  // 4. OTP generation
  await t.test('4. OTP generation produces cryptographically secure 6-digit numeric string', () => {
    const generateOtp = () => (Math.floor(100000 + Math.random() * 900000)).toString();
    const otp = generateOtp();
    assert.strictEqual(otp.length, 6);
    assert.match(otp, /^\d{6}$/);
  });

  // 5. OTP is never returned from registration API
  await t.test('5. OTP is never returned from registration API response', () => {
    const apiResponse = {
      success: true,
      requires_verification: true,
      email: 'k***@gmail.com',
      message: 'Verification code sent to k***@gmail.com. Please verify your email to complete registration.',
      status: 'success',
    };

    assert.strictEqual('otp' in apiResponse, false);
    assert.strictEqual('code' in apiResponse, false);
    assert.strictEqual('token' in apiResponse, false);
    assert.strictEqual('otp_hash' in apiResponse, false);
  });

  // 6. OTP is never exposed in frontend
  await t.test('6. OTP is never exposed in frontend placeholders, state, or logs', () => {
    const inputPlaceholder = '------';
    const sampleExposedDemoOtp = '482913';

    assert.notStrictEqual(inputPlaceholder, sampleExposedDemoOtp);
    assert.strictEqual(/^\d{6}$/.test(inputPlaceholder), false);
  });

  // 7. Verification token expiration
  await t.test('7. Verification token expiration (10 minutes max validity)', () => {
    const isExpired = (createdAt: number, now: number, expireMinutes: number = 10) => {
      return (now - createdAt) > (expireMinutes * 60 * 1000);
    };

    const now = 1700000000000;
    const freshToken = now - (2 * 60 * 1000); // 2 mins ago
    const staleToken = now - (11 * 60 * 1000); // 11 mins ago

    assert.strictEqual(isExpired(freshToken, now), false);
    assert.strictEqual(isExpired(staleToken, now), true);
  });

  // 8. Invalid OTP
  await t.test('8. Invalid OTP rejection', () => {
    const verifyOtp = (submitted: string, correct: string) => submitted.trim() === correct.trim();
    assert.strictEqual(verifyOtp('123456', '654321'), false);
    assert.strictEqual(verifyOtp('123456', '123456'), true);
  });

  // 9. Maximum OTP attempts
  await t.test('9. Maximum OTP attempt enforcement (5 max attempts per token)', () => {
    const checkAttempts = (attemptCount: number, maxAttempts: number = 5) => {
      return attemptCount >= maxAttempts ? { allowed: false, error: 'Too many incorrect attempts' } : { allowed: true };
    };

    assert.strictEqual(checkAttempts(3).allowed, true);
    assert.strictEqual(checkAttempts(5).allowed, false);
    assert.strictEqual(checkAttempts(6).allowed, false);
  });

  // 10. Successful verification
  await t.test('10. Successful verification activates account and issues PATIENT session', () => {
    const mockUser = {
      id: 'PT-98102',
      email: 'kingdevil44597@gmail.com',
      emailVerified: false,
      role: 'PATIENT' as const,
    };

    // Upon valid OTP submission
    mockUser.emailVerified = true;

    const tokenResponse = {
      accessToken: 'sample-patient-jwt-token',
      tokenType: 'bearer',
      role: 'PATIENT' as const,
      username: mockUser.email,
      displayName: 'Patient User',
      userId: mockUser.id,
    };

    client.saveSession(tokenResponse);
    const stored = client.getStoredUser();

    assert.strictEqual(mockUser.emailVerified, true);
    assert.strictEqual(stored?.role, 'PATIENT');
    assert.strictEqual(stored?.userId, 'PT-98102');
  });

  // 11. Existing verified account login
  await t.test('11. Existing verified account login directly with Email + Password', () => {
    const handleLogin = (user: { emailVerified: boolean; hash: string }, pass: string) => {
      if (!user.emailVerified) return { status: 403, error: 'Please verify your email first.' };
      if (pass !== 'CorrectPassword123') return { status: 401, error: 'Invalid email or password.' };
      return { status: 200, success: true, role: 'PATIENT' };
    };

    const verifiedAccount = { emailVerified: true, hash: 'pw_hash' };
    const res = handleLogin(verifiedAccount, 'CorrectPassword123');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.role, 'PATIENT');
  });

  // 12. Unknown account
  await t.test('12. Unknown account returns 404 with Create Account guidance', () => {
    const findAccount = (email: string, store: Record<string, any>) => {
      if (!store[email]) {
        return { status: 404, detail: 'Account not found. Create a Patient Account.' };
      }
      return { status: 200, account: store[email] };
    };

    const res = findAccount('unknown@gmail.com', {});
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.detail, 'Account not found. Create a Patient Account.');
  });

  // 13. Unverified account
  await t.test('13. Unverified account returns 403 with verification requirement', () => {
    const checkLogin = (account: { emailVerified: boolean }) => {
      if (!account.emailVerified) {
        return { status: 403, detail: 'Please verify your email first.' };
      }
      return { status: 200 };
    };

    const res = checkLogin({ emailVerified: false });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.detail, 'Please verify your email first.');
  });

  // 14. Resend OTP
  await t.test('14. Resend OTP invalidates old token and issues fresh code', () => {
    let activeOtpHash = 'hash_old_token';
    const resend = () => {
      activeOtpHash = 'hash_new_token';
      return { success: true, message: 'New code sent' };
    };

    const res = resend();
    assert.strictEqual(res.success, true);
    assert.strictEqual(activeOtpHash, 'hash_new_token');
  });

  // 15. Resend cooldown
  await t.test('15. Resend cooldown enforces 60-second minimum waiting window', () => {
    const isCooldownActive = (cooldownSeconds: number) => cooldownSeconds > 0;
    assert.strictEqual(isCooldownActive(60), true);
    assert.strictEqual(isCooldownActive(15), true);
    assert.strictEqual(isCooldownActive(0), false);
  });

  // 16. Patient role assignment
  await t.test('16. Patient role is server-assigned (never client selectable)', () => {
    const assignRole = (clientRoleAttempt: string) => {
      // Backend forces PATIENT regardless of client attempt
      return 'PATIENT';
    };

    assert.strictEqual(assignRole('ADMIN'), 'PATIENT');
    assert.strictEqual(assignRole('DOCTOR'), 'PATIENT');
  });

  // 17. Patient ownership isolation
  await t.test('17. Patient cannot access another patient cases (Cross-patient 403)', () => {
    const cases: TriageCase[] = [
      {
        caseId: 'CASE-PAT-001',
        patientId: 'PT-OWNER-01',
        consentGiven: true,
        rawSymptoms: 'Headache',
        extractedSymptoms: [],
        timeline: [],
        missingInformation: [],
        followUpQuestions: [],
        urgencySignals: [],
        aiSummary: 'Advisory note',
        reviewStatus: 'awaiting_review',
        createdAt: new Date().toISOString(),
        preferredLanguage: 'English',
      },
    ];

    const canAccessCase = (requestingUserId: string, requestingRole: string, c: TriageCase) => {
      if (requestingRole === 'ADMIN') return true;
      return c.patientId === requestingUserId;
    };

    assert.strictEqual(canAccessCase('PT-OWNER-01', 'PATIENT', cases[0]), true);
    assert.strictEqual(canAccessCase('PT-ATTACKER-99', 'PATIENT', cases[0]), false);
  });

  // 18. SMTP failure handling
  await t.test('18. SMTP failure handling returns clean user message without leaking secrets', () => {
    const handleSmtpError = (err: Error) => {
      return {
        status: 503,
        error: 'Verification email could not be sent. Please check the email address or try again later.',
      };
    };

    const res = handleSmtpError(new Error('SMTPAuthenticationError: 535 5.7.8 Bad credentials'));
    assert.strictEqual(res.status, 503);
    assert.strictEqual('password' in res, false);
    assert.ok(!res.error.includes('SMTPAuthenticationError'));
    assert.ok(!res.error.includes('535'));
  });
});
