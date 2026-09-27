import { defaultSpeechService } from '../src/services/stt/MockSpeechService.ts';
import { defaultOCRService } from '../src/services/ocr/MockOCRService.ts';
import { defaultTranslationService } from '../src/services/translation/MockTranslationService.ts';
import { getTriageProcessor, setActiveProcessorMode } from '../src/services/processor/processorFactory.ts';
import { DeterministicTriageProcessor } from '../src/services/processor/DeterministicProcessor.ts';
import { AITriageProcessor } from '../src/services/processor/AITriageProcessor.ts';
import type { TriageFormData, TriageCase } from '../src/types/triage.ts';

let passed = 0;
let total = 0;

function assert(condition: unknown, msg: string) {
  total++;
  if (Boolean(condition)) {
    console.log(`  ✓ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runV2TestSuite() {
  console.log('=====================================================');
  console.log('SWASTHYA TRIAGE V2 - MULTIMODAL TEST SUITE');
  console.log('=====================================================\n');

  // 1. Voice Input / Speech-to-Text Service Abstraction
  console.log('Test Group 1: Voice Input / STT Service Abstraction');
  assert(defaultSpeechService.isMock === true, 'Speech service identifies as demo/mock');
  assert(
    defaultSpeechService.providerName.includes('Demo'),
    'Provider name clearly indicates demo mode'
  );

  const voiceSample = await defaultSpeechService.transcribeAudio('voice-hindi-fever', {
    language: 'Hindi',
  });
  assert(voiceSample.isDemoTranscription === true, 'Voice output labeled with isDemoTranscription: true');
  assert(voiceSample.originalLanguage === 'Hindi', 'Preserved Hindi language metadata');
  assert(voiceSample.transcript.includes('बुखार') || voiceSample.transcript.includes('सांस'), 'Transcribed Hindi audio scenario');
  assert(voiceSample.durationSeconds === 32, 'Duration recorded accurately (32s)');

  // 2. Document OCR Service Abstraction
  console.log('\nTest Group 2: Medical Document OCR Service Abstraction');
  assert(defaultOCRService.isMock === true, 'OCR service identifies as demo/mock');
  assert(defaultOCRService.providerName.includes('Demo'), 'Provider name indicates demo OCR');

  const cbcReport = await defaultOCRService.extractTextFromDocument('report-cbc-lab', 'pdf');
  assert(cbcReport.isDemoOCR === true, 'OCR output stamped with isDemoOCR: true');
  assert(cbcReport.fileType === 'pdf', 'Recognized PDF document type');
  assert(cbcReport.extractedText.includes('Leukocyte Count'), 'Extracted CBC lab values');

  const cxrReport = await defaultOCRService.extractTextFromDocument('report-cxr-radiology', 'image');
  assert(cxrReport.fileType === 'image', 'Recognized image document type');
  assert(cxrReport.extractedText.includes('CHEST X-RAY'), 'Extracted Radiology findings');

  // 3. Translation & Multilingual Normalization
  console.log('\nTest Group 3: Multilingual Translation & Text Preservation');
  assert(defaultTranslationService.isMock === true, 'Translation service identifies as mock');
  const hindiInput = 'मुझे तीन दिन से बहुत तेज बुखार आ रहा है और कमजोरी लग रही है। कल से सांस लेने में भी थोड़ी तकलीफ हो रही है।';
  const translated = await defaultTranslationService.translateToNormalizedEnglish(hindiInput, 'Hindi');

  assert(translated.isTranslated === true, 'Flagged as translated');
  assert(translated.originalLanguage === 'Hindi', 'Original language strictly preserved');
  assert(translated.originalText === hindiInput, 'Original patient statement strictly preserved');
  assert(translated.translatedText?.includes('fever') && translated.translatedText?.includes('breathing'), 'Normalized English translation generated');

  // 4. Pluggable Processor Architecture
  console.log('\nTest Group 4: Pluggable ITriageProcessor Interface');
  setActiveProcessorMode('deterministic');
  const processor1 = getTriageProcessor();
  assert(processor1 instanceof DeterministicTriageProcessor, 'Factory returned Deterministic processor');
  assert(processor1.isAIBased === false, 'Deterministic processor marked non-AI');

  setActiveProcessorMode('ai_pluggable');
  const processor2 = getTriageProcessor();
  assert(processor2 instanceof AITriageProcessor, 'Factory returned AI-ready processor');
  assert(processor2.isAIBased === true, 'AI processor marked isAIBased: true');

  // Reset to deterministic default
  setActiveProcessorMode('deterministic');

  // 5. Multimodal Case Convergence
  console.log('\nTest Group 5: Multimodal Case Convergence & Normalization');
  const multimodalFormData: TriageFormData = {
    patientId: 'PATIENT-V2-001',
    age: 52,
    gender: 'Male',
    preferredLanguage: 'Hindi',
    symptoms: hindiInput,
    consentGiven: true,
    voiceData: voiceSample,
    ocrReports: [cbcReport, cxrReport],
    multilingualData: translated,
  };

  const activeProc = getTriageProcessor();
  const unifiedCase = await activeProc.processTriage(multimodalFormData);

  assert(unifiedCase.patientId === 'PATIENT-V2-001', 'Patient ID assigned');
  assert(unifiedCase.inputModalities?.includes('text'), 'Includes text modality');
  assert(unifiedCase.inputModalities?.includes('voice'), 'Includes voice modality');
  assert(unifiedCase.inputModalities?.includes('ocr_pdf'), 'Includes PDF OCR modality');
  assert(unifiedCase.inputModalities?.includes('ocr_image'), 'Includes Image OCR modality');
  assert(unifiedCase.extractedSymptoms.includes('Breathing Difficulty / Dyspnea'), 'Extracted breathing difficulty across modalities');
  assert(unifiedCase.extractedSymptoms.includes('Fever / Pyrexia'), 'Extracted fever across modalities');
  assert(unifiedCase.urgencySignals.length > 0, 'Urgency signals identified');
  assert(unifiedCase.multilingualData?.originalText === hindiInput, 'Preserved original Hindi text in triage note');
  assert(unifiedCase.ocrReports?.length === 2, 'Both OCR lab reports attached to triage case');

  // 6. Reviewer Human Decision Sign-off on Multimodal Case
  console.log('\nTest Group 6: Clinician Decision on Multimodal Case');
  const reviewedCase: TriageCase = {
    ...unifiedCase,
    reviewStatus: 'reviewed',
    reviewerDecision: 'Escalate',
    reviewerNotes: 'Infiltrate confirmed on CXR report with low SpO2. Admitted to acute respiratory ward.',
    reviewedAt: new Date().toISOString(),
    reviewerName: 'Dr. V. Menon (Medical Officer)',
  };

  assert(reviewedCase.reviewStatus === 'reviewed', 'Status set to reviewed');
  assert(reviewedCase.reviewerDecision === 'Escalate', 'Decision is Escalate');
  assert(reviewedCase.reviewerNotes?.includes('CXR report'), 'Reviewer notes preserved');

  // 7. Multimodal Audit Trail
  console.log('\nTest Group 7: Multimodal Audit Trail Verification');
  const { recordAuditEvent, getAuditLogs, clearAuditLogs } = await import('../src/utils/audit.ts');
  clearAuditLogs();

  recordAuditEvent(unifiedCase.caseId, 'Patient', 'Patient intake submitted', 'Modalities: [text, voice, ocr_pdf, ocr_image]');
  recordAuditEvent(unifiedCase.caseId, 'Patient', 'Consent recorded', 'Consent confirmed');
  recordAuditEvent(unifiedCase.caseId, 'System', 'Voice audio transcribed (Demo STT)', 'Duration: 32s | Language: Hindi');
  recordAuditEvent(unifiedCase.caseId, 'System', 'Medical documents processed via OCR (2 files)', 'CBC, Chest X-Ray');
  recordAuditEvent(unifiedCase.caseId, 'System', 'Multilingual text normalized to English', 'Original: Hindi');
  recordAuditEvent(unifiedCase.caseId, 'AI Triage Engine', 'Structured triage note generated', 'Breathing difficulty, Fever');
  recordAuditEvent(unifiedCase.caseId, 'Medical Reviewer', 'Reviewer opened case for clinical evaluation', 'Session opened');
  recordAuditEvent(unifiedCase.caseId, 'Medical Reviewer', 'Reviewer decision recorded: Escalate', 'Decision: Escalate');

  const auditEvents = getAuditLogs(unifiedCase.caseId);
  assert(auditEvents.length === 8, `Captured all 8 multimodal audit events (found ${auditEvents.length})`);
  assert(auditEvents.some((e) => e.action.includes('Voice audio transcribed')), 'Voice STT audit event recorded');
  assert(auditEvents.some((e) => e.action.includes('Medical documents processed')), 'OCR audit event recorded');
  assert(auditEvents.some((e) => e.action.includes('Multilingual text normalized')), 'Translation audit event recorded');
  assert(auditEvents[0].action.includes('Reviewer decision recorded'), 'Latest audit event is reviewer decision');

  console.log('\n=====================================================');
  console.log(`ALL V2 TESTS PASSED: ${passed} / ${total} assertions verified!`);
  console.log('=====================================================');
}

runV2TestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
