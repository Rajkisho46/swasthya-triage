import { handleTriageProxyRequest } from '../src/server/triageProxyHandler.ts';
import { AIExtractionClient } from '../src/services/ai/aiClient.ts';
import { AITriageProcessor } from '../src/services/processor/AITriageProcessor.ts';
import fs from 'fs';
import path from 'path';

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    console.log(`  ✓ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runSecurityProxyTestSuite() {
  console.log('=====================================================');
  console.log('SWASTHYA TRIAGE V3.1 - SERVER PROXY & SECURITY TESTS');
  console.log('=====================================================\n');

  // 1. Client Codebase Secret Scan
  console.log('Test Group 1: Client Codebase Zero-Exposure Audit');
  const srcDir = path.resolve(process.cwd(), 'src');
  const allSrcFiles: string[] = [];

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const fullPath = path.join(dir, e.name);
      if (e.isDirectory()) {
        scanDir(fullPath);
      } else if (/\.(ts|tsx|js|html|css)$/.test(e.name)) {
        allSrcFiles.push(fullPath);
      }
    }
  }
  scanDir(srcDir);

  let exposedKeyFound = false;
  for (const f of allSrcFiles) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes('VITE_GEMINI_API_KEY') || content.includes('VITE_AI_API_KEY')) {
      exposedKeyFound = true;
      console.error(`Found client exposed variable in: ${f}`);
    }
  }
  assert(!exposedKeyFound, 'Zero client-exposed VITE_GEMINI_API_KEY / VITE_AI_API_KEY variables in src/');

  // 2. Server Proxy Request Validation
  console.log('\nTest Group 2: Server Proxy Request Validation');
  const resNull = await handleTriageProxyRequest(null as any);
  assert(resNull.status === 400, 'Rejects null payload with 400');
  assert(resNull.body.success === false, 'Returns success: false');

  const resMissingPatient = await handleTriageProxyRequest({ rawSymptoms: 'Fever' });
  assert(resMissingPatient.status === 400, 'Rejects missing patientId with 400');
  assert(resMissingPatient.body.error?.includes('patientId'), 'Explains missing patientId validation error');

  // 3. Server Proxy Key Security (Server-side check)
  console.log('\nTest Group 3: Server Proxy Server-Side Environment Check');
  const resNoKey = await handleTriageProxyRequest({ patientId: 'PATIENT-1024', rawSymptoms: 'Fever' }, '');
  assert(resNoKey.status === 503, 'Returns 503 when server environment key is unset');
  assert(!resNoKey.body.error?.includes('AIza'), 'Error message does not leak API keys');
  assert(resNoKey.body.error?.includes('Fallback'), 'Instructs fallback extraction');

  // 4. Server-Side Safety Validation
  console.log('\nTest Group 4: Server-Side Safety Validation Functionality');
  const { validateAndSanitizeAIOutput } = await import('../src/services/ai/aiValidator.ts');
  const mockUnsafeDiagnosis = {
    extractedSymptoms: ['Fever'],
    timeline: [{ symptom: 'Fever', durationOrOnset: '3 days' }],
    missingInformation: ['BP'],
    followUpQuestions: ['Temperature?'],
    urgencySignals: [{ signal: 'Fever', level: 'advisory', reason: 'Observation' }],
    aiSummary: 'You have pneumonia and must be admitted.',
  };

  let rejectedDiagnostic = false;
  try {
    validateAndSanitizeAIOutput(mockUnsafeDiagnosis);
  } catch (err: any) {
    rejectedDiagnostic = true;
    assert(err.message.includes('Safety violation'), 'Server rejects diagnostic statement');
  }
  assert(rejectedDiagnostic, 'Server-side validator successfully caught diagnostic violation');

  // 5. Client AIExtractionClient Proxy Routing
  console.log('\nTest Group 5: Client AIExtractionClient Proxy Integration');
  const client = new AIExtractionClient();
  assert(
    (client as any).proxyUrl === '/api/triage',
    'Client routes requests strictly through /api/triage'
  );

  // 6. Graceful Fallback on Proxy Failure
  console.log('\nTest Group 6: Graceful Deterministic Fallback on Proxy Failure');
  const processor = new AITriageProcessor();
  const triageCase = await processor.processTriage({
    patientId: 'PATIENT-PROXY-TEST',
    age: 44,
    gender: 'Female',
    preferredLanguage: 'English',
    symptoms: 'Mild cough and sore throat for 3 days.',
    consentGiven: true,
  });

  assert(triageCase.patientId === 'PATIENT-PROXY-TEST', 'Patient ID preserved in fallback');
  assert(triageCase.isFallbackUsed === true, 'isFallbackUsed flag set');
  assert(
    triageCase.processorUsed?.includes('Fallback') || triageCase.processorUsed?.includes('Deterministic'),
    'Indicates fallback processor used'
  );
  assert(triageCase.extractedSymptoms.includes('Cough'), 'Extracted symptoms in fallback');

  console.log('\n=====================================================');
  console.log(`ALL SECURITY PROXY TESTS PASSED: ${passed} / ${total} assertions verified!`);
  console.log('=====================================================');
}

runSecurityProxyTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
