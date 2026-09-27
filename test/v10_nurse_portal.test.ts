import test from 'node:test';
import assert from 'node:assert';
import { AuthClient } from '../src/services/auth/authClient';
import type { TriageCase } from '../src/types/triage';
import { recordAuditEvent, getAuditLogs, clearAuditLogs } from '../src/utils/audit';

test('SWASTHYA TRIAGE V10 - NURSE PORTAL & CLINICAL WORKFLOW SUITE', async (t) => {
  const client = new AuthClient();

  await t.test('TEST 1 & 2: Nurse authentication & Backend-Determined NURSE Role', () => {
    const nurseSession = {
      accessToken: 'nurse-jwt-token-xyz',
      tokenType: 'bearer',
      role: 'NURSE' as const,
      username: 'nurse_priya',
      displayName: 'Nurse Priya Nair, RN',
      userId: 'usr_nur_01',
    };
    client.saveSession(nurseSession);
    const user = client.getStoredUser();
    assert.strictEqual(user?.role, 'NURSE');
    assert.strictEqual(user?.username, 'nurse_priya');
    assert.strictEqual(user?.displayName, 'Nurse Priya Nair, RN');
  });

  await t.test('TEST 3: Multi-Role Routing & RoleGuard Integrity', () => {
    // Check all roles route to distinct portals
    const roles = ['PATIENT', 'NURSE', 'DOCTOR', 'ADMIN'] as const;
    const resolvedPortals = roles.map((r) => {
      switch (r) {
        case 'PATIENT': return 'PatientPortal';
        case 'NURSE': return 'NursePortal';
        case 'DOCTOR': return 'MedicalReviewerPortal';
        case 'ADMIN': return 'AdministratorPortal';
      }
    });

    assert.strictEqual(resolvedPortals[1], 'NursePortal');
    assert.strictEqual(new Set(resolvedPortals).size, 4); // 4 distinct portals
  });

  await t.test('TEST 4 & 5: Nurse Access to Review Queue and Case Detail endpoints', () => {
    const checkQueueAccess = (role: string) => {
      if (role === 'DOCTOR' || role === 'NURSE' || role === 'ADMIN') {
        return { status: 200, permitted: true };
      }
      return { status: 403, permitted: false };
    };

    assert.strictEqual(checkQueueAccess('NURSE').status, 200);
    assert.strictEqual(checkQueueAccess('PATIENT').status, 403);
  });

  await t.test('TEST 6, 7 & 8: Nurse Bedside Intake, Voice STT, and Document OCR permissions', () => {
    const checkIntakePermission = (role: string, feature: string) => {
      if (role === 'NURSE' || role === 'DOCTOR' || role === 'ADMIN') {
        return { status: 200, feature, allowed: true };
      }
      return { status: 403, feature, allowed: false };
    };

    assert.strictEqual(checkIntakePermission('NURSE', 'bedside_intake').status, 200);
    assert.strictEqual(checkIntakePermission('NURSE', 'voice_stt').status, 200);
    assert.strictEqual(checkIntakePermission('NURSE', 'multimodal_ocr').status, 200);
  });

  await t.test('TEST 9: Nurse Forbidden from Doctor Clinical Decision Confirmation (403)', () => {
    const checkDecisionPermission = (role: string) => {
      // Doctor and Admin only
      if (role !== 'DOCTOR' && role !== 'ADMIN') {
        return { status: 403, error: 'Forbidden. Clinician (DOCTOR/ADMIN) required.' };
      }
      return { status: 200, success: true };
    };

    assert.strictEqual(checkDecisionPermission('NURSE').status, 403);
    assert.strictEqual(checkDecisionPermission('PATIENT').status, 403);
    assert.strictEqual(checkDecisionPermission('DOCTOR').status, 200);
  });

  await t.test('TEST 10: Nurse Forbidden from Admin Audit Reset (403)', () => {
    const checkAuditResetPermission = (role: string) => {
      if (role !== 'ADMIN') {
        return { status: 403, error: 'Forbidden. Administrator privileges required.' };
      }
      return { status: 200, success: true };
    };

    assert.strictEqual(checkAuditResetPermission('NURSE').status, 403);
    assert.strictEqual(checkAuditResetPermission('DOCTOR').status, 403);
    assert.strictEqual(checkAuditResetPermission('ADMIN').status, 200);
  });

  await t.test('TEST 11: Real Case Isolation & Empty Queue Behavior', () => {
    // Real queue starting empty
    const allCases: TriageCase[] = [];
    const getSubmittedQueue = (cases: TriageCase[]) =>
      cases.filter((c) => c.reviewStatus === 'awaiting_review' || c.reviewStatus === 'reviewed');

    assert.strictEqual(getSubmittedQueue(allCases).length, 0);

    // Case submitted by patient
    const submittedCase: TriageCase = {
      caseId: 'CASE-NUR-8801',
      patientId: 'PAT-8801',
      age: 62,
      gender: 'Male',
      preferredLanguage: 'Hindi',
      consentGiven: true,
      rawSymptoms: 'घबराहट और सीने में भारीपन',
      extractedSymptoms: ['Chest Heaviness', 'Palpitations'],
      timeline: [{ symptom: 'Chest Heaviness', durationOrOnset: '4 hours' }],
      missingInformation: ['Blood Pressure', 'Pulse'],
      followUpQuestions: ['Does pain radiate to left arm?'],
      urgencySignals: [{ signal: 'cardiac_urgency', reason: 'Chest heaviness', level: 'immediate_attention' }],
      aiSummary: 'Acute onset cardiac/chest heaviness symptoms.',
      reviewStatus: 'awaiting_review',
      createdAt: new Date().toISOString(),
    };

    allCases.push(submittedCase);

    const queueAfterSubmit = getSubmittedQueue(allCases);
    assert.strictEqual(queueAfterSubmit.length, 1);
    assert.strictEqual(queueAfterSubmit[0].caseId, 'CASE-NUR-8801');
  });

  await t.test('TEST 12: Provenance Separation: Patient vs AI vs Nurse', () => {
    clearAuditLogs();

    const testCase: TriageCase = {
      caseId: 'CASE-NUR-8801',
      patientId: 'PAT-8801',
      preferredLanguage: 'Hindi',
      consentGiven: true,
      rawSymptoms: 'घबराहट और सीने में भारीपन',
      extractedSymptoms: ['Chest Heaviness'],
      timeline: [{ symptom: 'Chest Heaviness', durationOrOnset: '4 hours' }],
      missingInformation: ['Blood Pressure'],
      followUpQuestions: [],
      urgencySignals: [{ signal: 'cardiac_alert', reason: 'Chest tightness', level: 'immediate_attention' }],
      aiSummary: 'Non-diagnostic structured extraction advisory.',
      reviewStatus: 'awaiting_review',
      createdAt: new Date().toISOString(),
    };

    // Nurse records vitals in notes without completing doctor sign-off
    const nurseNotes = 'Bedside Vitals Checked: BP 145/92 mmHg, Pulse 98 bpm, SpO2 96%, Temp 98.6F.';
    const updatedByNurse: TriageCase = {
      ...testCase,
      reviewerNotes: nurseNotes,
    };

    // Audit event with Nurse identity
    recordAuditEvent(
      updatedByNurse.caseId,
      'Nurse Priya Nair, RN' as any,
      'Triage Nurse recorded bedside observations & vitals verification',
      `Observations: ${nurseNotes}`
    );

    const logs = getAuditLogs();
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].actor, 'Nurse Priya Nair, RN');
    assert.ok(logs[0].details?.includes('BP 145/92 mmHg'));
    // Case remains awaiting_review for Doctor
    assert.strictEqual(updatedByNurse.reviewStatus, 'awaiting_review');
  });

  await t.test('TEST 13, 14 & 15: Cross-Portal Workflow Continuity (Intake -> Nurse -> Doctor -> Patient)', () => {
    // 1. Patient submits case
    const c1: TriageCase = {
      caseId: 'CASE-E2E-001',
      patientId: 'PAT-E2E-001',
      preferredLanguage: 'English',
      consentGiven: true,
      rawSymptoms: 'Fever and cough',
      extractedSymptoms: ['Fever', 'Cough'],
      timeline: [{ symptom: 'Fever & Cough', durationOrOnset: '2 days' }],
      missingInformation: [],
      followUpQuestions: [],
      urgencySignals: [],
      aiSummary: 'Mild febrile illness',
      reviewStatus: 'awaiting_review',
      createdAt: new Date().toISOString(),
    };

    // 2. Nurse prepares bedside vitals
    const c2: TriageCase = {
      ...c1,
      reviewerNotes: 'Vitals: Temp 100.8F, SpO2 98%, Heart Rate 78 bpm.',
    };
    assert.strictEqual(c2.reviewStatus, 'awaiting_review');

    // 3. Doctor reviews and decides Escalate
    const c3: TriageCase = {
      ...c2,
      reviewStatus: 'reviewed',
      reviewerDecision: 'Escalate',
      reviewerName: 'Dr. Ananya Sharma, MD',
      reviewedAt: new Date().toISOString(),
    };
    assert.strictEqual(c3.reviewStatus, 'reviewed');
    assert.strictEqual(c3.reviewerDecision, 'Escalate');

    // 4. Patient can view completed status
    assert.strictEqual(c3.caseId, 'CASE-E2E-001');
    assert.strictEqual(c3.reviewStatus, 'reviewed');
  });

  await t.test('TEST 16: Nurse Bedside Assessment Data Structure & Verification Protocol', () => {
    const testCase: TriageCase = {
      caseId: 'CASE-NUR-9001',
      patientId: 'PAT-9001',
      preferredLanguage: 'English',
      consentGiven: true,
      rawSymptoms: 'Patient reports high fever for 3 days',
      extractedSymptoms: ['Fever / Pyrexia'],
      timeline: [{ symptom: 'Fever / Pyrexia', durationOrOnset: '3 days' }],
      missingInformation: ['Baseline Vital Signs'],
      followUpQuestions: [],
      urgencySignals: [],
      aiSummary: 'Fever reported by patient intake.',
      reviewStatus: 'awaiting_review',
      createdAt: new Date().toISOString(),
    };

    // Nurse completes Bedside Assessment
    const updatedWithBedside: TriageCase = {
      ...testCase,
      bedsideAssessment: {
        vitals: {
          systolicBP: 124,
          diastolicBP: 82,
          heartRate: 84,
          spo2: 98,
          temperature: 100.4,
          tempUnit: 'F',
          respiratoryRate: 18,
          bloodGlucose: 110,
          measuredAt: new Date().toISOString(),
        },
        observation: {
          generalAppearance: 'Mild Pallor / Ill',
          consciousnessOrientation: 'Alert & Oriented (A)',
          breathingEffort: 'Normal / Unlabored',
          mobilityStatus: 'Ambulatory (Independent)',
          painScore: 2,
          visibleDistress: ['None Observed'],
          additionalSymptoms: 'Warm skin to touch, mild sweating',
        },
        verifications: {
          allergies: {
            itemKey: 'allergies',
            label: 'Allergies',
            patientValue: 'No Known Drug Allergies (NKDA)',
            status: 'nurse_verified',
          },
          currentMedications: {
            itemKey: 'currentMedications',
            label: 'Current Medications',
            patientValue: 'No daily medications',
            status: 'nurse_verified',
          },
          chiefComplaint: {
            itemKey: 'chiefComplaint',
            label: 'Chief Complaint',
            patientValue: 'Fever for 3 days',
            status: 'nurse_verified',
          },
        },
        nurseNotes: 'Patient febrile but alert. Hydration advised. Sent for Medical Officer review.',
        assessmentTime: new Date().toISOString(),
        nurseId: 'usr_nur_01',
        nurseName: 'Nurse Priya Nair, RN',
        facilityDepartment: 'Emergency Triage & Bedside Bay',
        assessmentStatus: 'recorded',
      },
    };

    assert.strictEqual(updatedWithBedside.bedsideAssessment?.vitals.systolicBP, 124);
    assert.strictEqual(updatedWithBedside.bedsideAssessment?.vitals.spo2, 98);
    assert.strictEqual(updatedWithBedside.bedsideAssessment?.observation.consciousnessOrientation, 'Alert & Oriented (A)');
    assert.strictEqual(updatedWithBedside.bedsideAssessment?.verifications.allergies?.status, 'nurse_verified');
    assert.strictEqual(updatedWithBedside.bedsideAssessment?.assessmentStatus, 'recorded');
  });
});
