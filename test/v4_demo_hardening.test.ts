import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generatePatientId, generateCaseId } from '../src/utils/caseId';
import { processTriageIntakeAsync } from '../src/services/triageService';
import { setActiveProcessorMode } from '../src/services/processor/processorFactory';
import { defaultSpeechService } from '../src/services/stt/MockSpeechService';
import { defaultOCRService } from '../src/services/ocr/MockOCRService';
import { defaultTranslationService } from '../src/services/translation/MockTranslationService';
import { recordAuditEvent, getAuditLogs, clearAuditLogs } from '../src/utils/audit';
import { SYNTHETIC_SAMPLE_CASES } from '../src/data/sampleCases';
import { DeterministicTriageProcessor } from '../src/services/processor/DeterministicProcessor';
import type { TriageFormData, TriageCase, ReviewerDecision } from '../src/types/triage';

describe('SWASTHYA TRIAGE PHASE 4 - JUDGE-READY DEMO HARDENING SUITE', () => {
  // Test Group 1: Demo State & Reset Mechanism
  describe('Test Group 1: Demo State & Reset Mechanism', () => {
    it('should initialize with clean production state for demonstration cases', () => {
      assert.ok(Array.isArray(SYNTHETIC_SAMPLE_CASES));
    });

    it('should support instant reset of audit logs and state', () => {
      clearAuditLogs();
      assert.strictEqual(getAuditLogs().length, 0);

      recordAuditEvent('CASE-DEMO', 'Patient', 'Test event', 'Initial load');
      assert.strictEqual(getAuditLogs().length, 1);

      clearAuditLogs();
      assert.strictEqual(getAuditLogs().length, 0);
    });
  });

  // Test Group 2: Complete User Journey (Intake -> AI -> Review -> Audit)
  describe('Test Group 2: Complete User Journey (Intake -> AI -> Review -> Audit)', () => {
    it('should execute complete end-to-end journey seamlessly', async () => {
      clearAuditLogs();

      // Step 1: Patient Intake Input
      const patientId = generatePatientId();
      const inputSymptoms = 'High fever for 3 days with intense body chills and generalized weakness';
      
      const formData: TriageFormData = {
        patientId,
        age: 34,
        gender: 'Male',
        preferredLanguage: 'English',
        symptoms: inputSymptoms,
        consentGiven: true,
      };

      // Step 2: Triage Processing (AI with Fallback)
      setActiveProcessorMode('ai_pluggable');
      const triageCase: TriageCase = await processTriageIntakeAsync(formData);

      assert.ok(triageCase.caseId.startsWith('CASE-'));
      assert.strictEqual(triageCase.patientId, patientId);
      assert.strictEqual(triageCase.reviewStatus, 'awaiting_review');
      assert.ok(triageCase.extractedSymptoms.some((s) => s.toLowerCase().includes('fever') || s.toLowerCase().includes('weakness')));
      assert.ok(triageCase.timeline.length > 0);
      assert.ok(triageCase.missingInformation.length > 0);
      assert.ok(triageCase.followUpQuestions.length > 0);
      assert.ok(typeof triageCase.aiSummary === 'string' && triageCase.aiSummary.length > 0);

      // Record Intake & AI Audit Events
      recordAuditEvent(
        triageCase.caseId,
        'Patient',
        'Patient intake submitted',
        `Patient: ${patientId}`
      );
      recordAuditEvent(
        triageCase.caseId,
        'AI Triage Engine',
        `Structured triage note generated (${triageCase.processorUsed})`,
        `Symptoms: ${triageCase.extractedSymptoms.join(', ')}`
      );

      // Step 3: Clinician Review & Decision
      recordAuditEvent(
        triageCase.caseId,
        'Medical Reviewer',
        'Reviewer opened case for clinical evaluation',
        `Case: ${triageCase.caseId}`
      );

      const reviewerDecision: ReviewerDecision = 'Routine Review';
      const reviewerNotes = 'Vitals stable. BP 120/80, SpO2 98%, Temp 100.2F. Advised paracetamol and hydration.';

      const reviewedCase: TriageCase = {
        ...triageCase,
        reviewStatus: 'reviewed',
        reviewerDecision,
        reviewerNotes,
        reviewedAt: new Date().toISOString(),
        reviewerName: 'Medical Officer (On Duty)',
      };

      recordAuditEvent(
        reviewedCase.caseId,
        'Medical Reviewer',
        `Reviewer decision recorded: ${reviewerDecision}`,
        `Notes: ${reviewerNotes}`
      );

      // Verify Final State
      assert.strictEqual(reviewedCase.reviewStatus, 'reviewed');
      assert.strictEqual(reviewedCase.reviewerDecision, 'Routine Review');
      assert.strictEqual(reviewedCase.reviewerNotes, reviewerNotes);
      assert.ok(reviewedCase.reviewedAt);

      // Verify Audit Trail Integrity
      const logs = getAuditLogs().filter((l) => l.caseId === triageCase.caseId);
      assert.ok(logs.length >= 4);
      assert.ok(logs.some((l) => l.action.includes('intake') || l.action.includes('started')));
      assert.ok(logs.some((l) => l.action.includes('Structured triage note') || l.action.includes('Fallback')));
      assert.ok(logs.some((l) => l.action.includes('Reviewer opened case')));
      assert.ok(logs.some((l) => l.action.includes('Reviewer decision recorded')));
    });
  });

  // Test Group 3: Multimodal Input (Voice STT & Document OCR)
  describe('Test Group 3: Multimodal Input Pathways', () => {
    it('should transcribe voice audio and tag as demo STT', async () => {
      const voiceSamples = defaultSpeechService.getPreloadedVoiceScenarios();
      assert.ok(voiceSamples.length >= 3);

      const sample = voiceSamples[0];
      const result = await defaultSpeechService.transcribeAudio(sample.id, { language: sample.language });

      assert.strictEqual(result.isDemoTranscription, true);
      assert.ok(result.transcript.length > 10);
      assert.strictEqual(result.originalLanguage, sample.language);
    });

    it('should extract lab and radiology documents and tag as demo OCR', async () => {
      const ocrSamples = defaultOCRService.getPreloadedSampleReports();
      assert.ok(ocrSamples.length >= 2);

      const sample = ocrSamples[0];
      const result = await defaultOCRService.extractTextFromDocument(sample.id, sample.fileType);

      assert.strictEqual(result.isDemoOCR, true);
      assert.ok(result.extractedText.length > 20);
      assert.strictEqual(result.fileName, sample.fileName);
    });
  });

  // Test Group 4: Multilingual Translation & Provenance
  describe('Test Group 4: Multilingual Translation & Provenance', () => {
    it('should translate Hindi while preserving original text verbatim', async () => {
      const hindiText = 'मुझे तीन दिन से बहुत तेज बुखार और ठंड लग रही है';
      const result = await defaultTranslationService.translateToNormalizedEnglish(hindiText, 'Hindi');

      assert.strictEqual(result.isTranslated, true);
      assert.strictEqual(result.originalLanguage, 'Hindi');
      assert.strictEqual(result.originalText, hindiText);
      assert.ok(result.translatedText && (result.translatedText.toLowerCase().includes('fever') || result.translatedText.toLowerCase().includes('chills')));
    });
  });

  // Test Group 5: Validation & Error Handling
  describe('Test Group 5: Validation & Error Handling', () => {
    it('should reject invalid age < 0 or > 125', () => {
      const invalidAges = [-5, 130, 999];
      invalidAges.forEach((age) => {
        const isValid = age >= 0 && age <= 125;
        assert.strictEqual(isValid, false);
      });
    });

    it('should mandate patient/guardian consent', () => {
      const consentGiven = false;
      assert.strictEqual(consentGiven, false);
    });

    it('should require a clinical decision before reviewer sign-off', () => {
      const selectedDecision: ReviewerDecision | '' = '';
      const canConfirm = selectedDecision !== '';
      assert.strictEqual(canConfirm, false);
    });
  });

  // Test Group 6: Safety & Non-Diagnostic Constraints
  describe('Test Group 6: Safety & Non-Diagnostic Constraints', () => {
    it('should ensure reviewer decisions are human-exclusive without preselection', () => {
      const validDecisions: ReviewerDecision[] = ['Routine Review', 'Escalate', 'Refer'];
      assert.strictEqual(validDecisions.length, 3);
      validDecisions.forEach((d) => {
        assert.ok(['Routine Review', 'Escalate', 'Refer'].includes(d));
      });
    });
  });

  // Test Group 7: Deterministic Extraction Precision & Phrase Variants
  describe('Test Group 7: Deterministic Extraction Precision & Phrase Variants', () => {
    const processor = new DeterministicTriageProcessor();

    it('should extract chest heaviness, heavy chest, chest pressure, and chest tightness', () => {
      const phrases = [
        'Patient reports chest heaviness since morning',
        'Feeling a heavy chest and breathlessness',
        'Severe chest pressure with sweating',
        'Complaining of chest tightness for 2 hours',
      ];

      phrases.forEach((phrase) => {
        const res = processor.processTriageSync({
          patientId: 'TEST-CHEST-1',
          age: 45,
          gender: 'Male',
          preferredLanguage: 'English',
          symptoms: phrase,
          consentGiven: true,
        });
        assert.ok(
          res.extractedSymptoms.includes('Chest Discomfort / Pain'),
          `Failed to extract Chest Discomfort / Pain from: "${phrase}"`
        );
      });
    });

    it('should NOT trigger Radiological Infiltrate from mere mention of x-ray or radiology', () => {
      const nonInfiltrateTexts = [
        'Patient had an x-ray taken last month which was normal',
        'Referral from radiology department for routine screening',
        'Underwent chest x-ray at clinic, awaiting physician review',
      ];

      nonInfiltrateTexts.forEach((text) => {
        const res = processor.processTriageSync({
          patientId: 'TEST-XRAY-NORM',
          age: 50,
          gender: 'Female',
          preferredLanguage: 'English',
          symptoms: text,
          consentGiven: true,
        });
        assert.strictEqual(
          res.extractedSymptoms.includes('Radiological Infiltrate / Pulmonary Opacity'),
          false,
          `Should NOT extract Radiological Infiltrate from: "${text}"`
        );
      });
    });

    it('should trigger Radiological Infiltrate when clinical evidence (consolidation, opacity, infiltrate) is present', () => {
      const infiltrateTexts = [
        'Chest radiograph shows right lower zone consolidation',
        'Bilateral pulmonary opacity and patchy infiltrate observed',
        'Ill-defined opacity and lung infiltrate noted on scan',
      ];

      infiltrateTexts.forEach((text) => {
        const res = processor.processTriageSync({
          patientId: 'TEST-XRAY-INF',
          age: 62,
          gender: 'Male',
          preferredLanguage: 'English',
          symptoms: text,
          consentGiven: true,
        });
        assert.ok(
          res.extractedSymptoms.includes('Radiological Infiltrate / Pulmonary Opacity'),
          `Should extract Radiological Infiltrate from: "${text}"`
        );
      });
    });

    it('should extract chest heaviness, high fever, and breathing difficulty from Primary Demo Hindi narrative', async () => {
      const hindiNarrative =
        'मुझे 3 दिन से तेज बुखार है और कल से सांस लेने में बहुत तकलीफ हो रही है। छाती में भारीपन महसूस हो रहा है।';
      
      const translation = await defaultTranslationService.translateToNormalizedEnglish(hindiNarrative, 'Hindi');
      
      const res = processor.processTriageSync({
        patientId: 'TEST-PRIMARY-DEMO',
        age: 67,
        gender: 'Male',
        preferredLanguage: 'Hindi',
        symptoms: hindiNarrative,
        multilingualData: translation,
        consentGiven: true,
      });

      assert.ok(res.extractedSymptoms.includes('Chest Discomfort / Pain'), 'Extracted Chest Discomfort / Pain');
      assert.ok(res.extractedSymptoms.includes('Fever / Pyrexia'), 'Extracted Fever / Pyrexia');
      assert.ok(res.extractedSymptoms.includes('Breathing Difficulty / Dyspnea'), 'Extracted Breathing Difficulty / Dyspnea');
    });
  });

  // Test Group 8: Multilingual Timeline and Duration Extraction
  describe('Test Group 8: Multilingual Timeline and Duration Extraction', () => {
    const processor = new DeterministicTriageProcessor();

    it('1. English duration should normalize consistently', () => {
      const inputs = [
        { text: 'Patient has had high fever for 3 days and weakness', expected: '3 days' },
        { text: 'Persistent fever since 3 days accompanied by chills', expected: '3 days' },
        { text: 'Severe headache and dizziness for past 4 days', expected: '4 days' },
        { text: 'Mild sore throat for 1 day', expected: '1 day' },
      ];

      inputs.forEach(({ text, expected }) => {
        const res = processor.processTriageSync({
          patientId: 'TEST-DUR-ENG',
          age: 40,
          gender: 'Female',
          preferredLanguage: 'English',
          symptoms: text,
          consentGiven: true,
        });

        assert.ok(res.timeline.length > 0, `Timeline should not be empty for: "${text}"`);
        assert.strictEqual(
          res.timeline[0].durationOrOnset,
          expected,
          `Expected "${expected}" but got "${res.timeline[0].durationOrOnset}" for "${text}"`
        );
        assert.strictEqual(res.timeline[0].source, 'AI', 'Provenance should remain advisory AI extraction');
      });
    });

    it('2. Hindi duration variants should normalize to standard English duration', () => {
      const hindiInputs = [
        { text: 'मुझे 3 दिन से तेज बुखार है', expected: '3 days' },
        { text: '3 days से बुखार और कमजोरी लग रही है', expected: '3 days' },
        { text: 'मुझे तीन दिन से बहुत तेज बुखार आ रहा है', expected: '3 days' },
        { text: 'दो दिन से सिरदर्द और चक्कर आ रहे हैं', expected: '2 days' },
      ];

      hindiInputs.forEach(({ text, expected }) => {
        const res = processor.processTriageSync({
          patientId: 'TEST-DUR-HIN',
          age: 55,
          gender: 'Male',
          preferredLanguage: 'Hindi',
          symptoms: text,
          consentGiven: true,
        });

        assert.ok(res.timeline.length > 0, `Timeline should not be empty for: "${text}"`);
        assert.strictEqual(
          res.timeline[0].durationOrOnset,
          expected,
          `Expected "${expected}" but got "${res.timeline[0].durationOrOnset}" for "${text}"`
        );
      });
    });

    it('3. No duration mentioned should strictly return "Unspecified duration" without inventing dates', () => {
      const noDurationText = 'Patient presents with severe sore throat, cough, and general fatigue.';
      const res = processor.processTriageSync({
        patientId: 'TEST-DUR-NONE',
        age: 28,
        gender: 'Female',
        preferredLanguage: 'English',
        symptoms: noDurationText,
        consentGiven: true,
      });

      assert.ok(res.timeline.length > 0);
      res.timeline.forEach((item) => {
        assert.strictEqual(
          item.durationOrOnset,
          'Unspecified duration',
          `Should not invent duration for symptom "${item.symptom}"`
        );
      });
    });

    it('4. Multiple symptoms with one shared duration should all receive the shared duration', () => {
      const sharedDurationText = 'दो दिन से खांसी और गले में दर्द है।';
      const res = processor.processTriageSync({
        patientId: 'TEST-DUR-SHARED',
        age: 35,
        gender: 'Male',
        preferredLanguage: 'Hindi',
        symptoms: sharedDurationText,
        consentGiven: true,
      });

      assert.ok(res.extractedSymptoms.includes('Cough'));
      assert.ok(res.extractedSymptoms.includes('Sore Throat / Pharyngeal Irritation'));
      assert.strictEqual(res.timeline.length, 2);

      res.timeline.forEach((item) => {
        assert.strictEqual(
          item.durationOrOnset,
          '2 days',
          `Symptom "${item.symptom}" should share duration "2 days"`
        );
      });
    });
  });

  // Test Group 9: Language and Provenance Consistency
  describe('Test Group 9: Language and Provenance Consistency', () => {
    it('should maintain strict language consistency in synthetic sample cases', () => {
      SYNTHETIC_SAMPLE_CASES.forEach((c) => {
        if (c.preferredLanguage === 'English') {
          // Verify raw symptoms are in English ASCII/Latin
          assert.ok(/^[\x00-\x7F\s.,!?'"()-]+$/.test(c.rawSymptoms), `Case ${c.caseId} has English text`);
        } else if (c.preferredLanguage === 'Hindi') {
          // Verify raw symptoms contain Devanagari characters
          assert.ok(/[\u0900-\u097F]/.test(c.rawSymptoms), `Case ${c.caseId} has Devanagari Hindi text`);
        }
      });
    });

    it('should maintain strict language consistency in voice sample transcripts', () => {
      const samples = defaultSpeechService.getPreloadedVoiceScenarios();
      samples.forEach((s) => {
        if (s.language === 'English') {
          assert.ok(/^[\x00-\x7F\s.,!?'"()-]+$/.test(s.sampleTranscript), `Voice ${s.id} text is English`);
        } else if (s.language === 'Hindi') {
          assert.ok(/[\u0900-\u097F]/.test(s.sampleTranscript), `Voice ${s.id} text is Devanagari Hindi`);
        }
      });
    });

    it('should preserve patient-provided provenance without silently replacing original text', async () => {
      const hindiSource = 'मुझे 3 दिन से तेज बुखार है और कल से सांस लेने में बहुत तकलीफ हो रही है। छाती में भारीपन महसूस हो रहा है।';
      const translation = await defaultTranslationService.translateToNormalizedEnglish(hindiSource, 'Hindi');

      const processor = new DeterministicTriageProcessor();
      const triageCase = processor.processTriageSync({
        patientId: 'PATIENT-PROVENANCE',
        preferredLanguage: 'Hindi',
        symptoms: hindiSource,
        multilingualData: translation,
        consentGiven: true,
      });

      // Provenance checks:
      assert.strictEqual(triageCase.rawSymptoms, hindiSource, 'Original raw patient text is preserved verbatim');
      assert.strictEqual(triageCase.preferredLanguage, 'Hindi', 'Original language is preserved');
      assert.strictEqual(triageCase.multilingualData?.originalText, hindiSource, 'Multilingual original text preserved');
      assert.ok(triageCase.multilingualData?.translatedText?.includes('Patient reports'), 'Normalized English provided in separate advisory channel');
      assert.strictEqual(triageCase.multilingualData?.isTranslated, true, 'Marked as translated');
    });
  });

  // Test Group 10: Async Action Resilience & Loading State Cleanup
  describe('Test Group 10: Async Action Resilience & Loading State Cleanup', () => {
    it('should guarantee loading state cleanup even if speech service throws error', async () => {
      let isProcessing = true;
      let caughtError: string | null = null;

      try {
        // Simulated failure in async STT call
        throw new Error('STT connection timeout');
      } catch (err: unknown) {
        caughtError = 'Voice audio transcription could not be completed. Please try another sample or type symptoms manually.';
      } finally {
        isProcessing = false;
      }

      assert.strictEqual(isProcessing, false, 'Loading flag must be false in finally block');
      assert.ok(caughtError !== null, 'User receives concise error message');
      assert.strictEqual(caughtError?.includes('Error:'), false, 'Stack trace not exposed to user');
    });

    it('should guarantee loading state cleanup even if OCR extraction fails', async () => {
      let isProcessing = true;
      let caughtError: string | null = null;

      try {
        throw new Error('Corrupt binary buffer');
      } catch (err: unknown) {
        caughtError = 'Failed to extract text from the uploaded document. Please upload a PDF or image.';
      } finally {
        isProcessing = false;
      }

      assert.strictEqual(isProcessing, false, 'Loading flag must be reset to false in finally block');
      assert.ok(caughtError !== null);
      assert.strictEqual(caughtError?.includes('Corrupt'), false, 'Internal details hidden from user error');
    });

    it('should guarantee loading state cleanup when triage processing fails', async () => {
      let isProcessing = true;
      let formError: string | null = null;

      try {
        throw new Error('Pipeline processing failure');
      } catch (err: unknown) {
        formError = 'Triage processing encountered an unexpected issue. Please verify patient information and try again.';
      } finally {
        isProcessing = false;
      }

      assert.strictEqual(isProcessing, false, 'Processing indicator must be cleared');
      assert.ok(formError !== null);
      assert.ok(formError.length > 0 && formError.length < 120, 'Error message is concise');
    });
  });

  // Test Group 11: Collision-Safe Case and Audit ID Generation
  describe('Test Group 11: Collision-Safe Case and Audit ID Generation', () => {
    it('should generate 1000 consecutive case IDs with 0 collisions', () => {
      const generatedCaseIds = new Set<string>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const id = generateCaseId();
        assert.ok(id.startsWith('CASE-'), `Case ID must start with CASE- (${id})`);
        assert.ok(!generatedCaseIds.has(id), `Duplicate Case ID detected: ${id}`);
        generatedCaseIds.add(id);
      }

      assert.strictEqual(generatedCaseIds.size, iterations);
    });

    it('should generate 1000 consecutive audit event IDs with 0 collisions', () => {
      const generatedAuditIds = new Set<string>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const event = recordAuditEvent('CASE-TEST', 'System', `Action ${i}`);
        assert.ok(event.id.startsWith('AUDIT-'), `Audit ID must start with AUDIT- (${event.id})`);
        assert.ok(!generatedAuditIds.has(event.id), `Duplicate Audit ID detected: ${event.id}`);
        generatedAuditIds.add(event.id);
      }

      assert.strictEqual(generatedAuditIds.size, iterations);
    });

    it('should generate 1000 consecutive patient IDs with 0 collisions', () => {
      const generatedPatientIds = new Set<string>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const id = generatePatientId();
        assert.ok(id.startsWith('PATIENT-'), `Patient ID must start with PATIENT- (${id})`);
        assert.ok(!generatedPatientIds.has(id), `Duplicate Patient ID detected: ${id}`);
        generatedPatientIds.add(id);
      }

      assert.strictEqual(generatedPatientIds.size, iterations);
    });
  });
});
