import { describe, it } from 'node:test';
import assert from 'node:assert';
import { backendSpeechService, BackendSpeechToTextService } from '../src/services/stt/BackendSpeechService';
import { handleVoiceProxyRequest } from '../src/server/voiceProxyHandler';

describe('SWASTHYA TRIAGE - REAL SPEECH-TO-TEXT SUITE', () => {
  // Test Group 1: Audio Validation
  describe('Test Group 1: Audio Validation & Safety', () => {
    it('should reject empty 0-byte audio buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const res = await handleVoiceProxyRequest(emptyBuffer, 'audio/webm', 'English');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error?.includes('empty'));
    });

    it('should reject unsupported MIME formats (e.g. image/png)', async () => {
      const fakeBuffer = Buffer.from('non-audio-data');
      const res = await handleVoiceProxyRequest(fakeBuffer, 'image/png', 'English');
      assert.strictEqual(res.status, 415);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error?.includes('Unsupported audio format'));
    });

    it('should reject payloads exceeding 25MB limit', async () => {
      // Fake buffer larger than 25MB
      const hugeBuffer = { length: 26 * 1024 * 1024 } as unknown as Buffer;
      const res = await handleVoiceProxyRequest(hugeBuffer, 'audio/webm', 'English');
      assert.strictEqual(res.status, 413);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error?.includes('exceeds maximum size limit'));
    });
  });

  // Test Group 2: Demo Fallback & Attribution
  describe('Test Group 2: Demo Mode & Fallback Handling', () => {
    it('should accurately tag simulated demo transcription', async () => {
      const sampleAudio = Buffer.from('mock-audio-bytes-12345678');
      const res = await handleVoiceProxyRequest(sampleAudio, 'audio/webm', 'English', true);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.is_demo_transcription, true);
      assert.ok(res.body.provider.includes('Demo Voice Recognition Provider'));
      assert.strictEqual(res.body.provenance, 'Patient-Provided');
      assert.ok(res.body.transcription.length > 10);
    });

    it('should preserve Hindi text verbatim without translation in demo mode', async () => {
      const sampleAudio = Buffer.from('mock-hindi-audio-bytes');
      const res = await handleVoiceProxyRequest(sampleAudio, 'audio/webm;codecs=opus', 'Hindi', true);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.language, 'Hindi');
      assert.ok(/[\u0900-\u097F]/.test(res.body.transcription), 'Contains Devanagari characters');
      assert.strictEqual(res.body.provenance, 'Patient-Provided');
    });
  });

  // Test Group 3: Preloaded Scenarios & Service Interface
  describe('Test Group 3: Service Interface & Scenarios', () => {
    it('should retrieve preloaded clinical voice scenarios', () => {
      const scenarios = backendSpeechService.getPreloadedVoiceScenarios();
      assert.ok(Array.isArray(scenarios));
      assert.ok(scenarios.length >= 3);
      assert.ok(scenarios.some((s) => s.id === 'voice-hindi-fever'));
      assert.ok(scenarios.some((s) => s.id === 'voice-eng-chest-tightness'));
    });

    it('should transcribe preloaded scenario string identifier accurately', async () => {
      const result = await backendSpeechService.transcribeAudio('voice-hindi-fever', {
        language: 'Hindi',
      });
      assert.strictEqual(result.isDemoTranscription, true);
      assert.strictEqual(result.originalLanguage, 'Hindi');
      assert.strictEqual(result.provenance, 'Patient-Provided');
      assert.ok(result.transcript.includes('बुखार'));
    });

    it('should preserve patient-provided provenance across all modalities', async () => {
      const result = await backendSpeechService.transcribeAudio('voice-eng-chest-tightness', {
        language: 'English',
      });
      assert.strictEqual(result.provenance, 'Patient-Provided');
      assert.ok(result.transcript.includes('chest tightness'));
    });
  });

  // Test Group 4: Multilingual & Verbatim Constraints
  describe('Test Group 4: Non-Diagnostic & Verbatim Integrity', () => {
    it('should not contain diagnostic conclusions in speech output', async () => {
      const sampleAudio = Buffer.from('dummy-speech-sample-1234');
      const res = await handleVoiceProxyRequest(sampleAudio, 'audio/webm', 'English', true);
      const text = res.body.transcription.toLowerCase();

      // Prohibited diagnostic terms in raw STT
      const prohibitedDiagnoses = ['acute myocardial infarction', 'pneumonia diagnosed', 'prescribe antibiotic'];
      for (const diag of prohibitedDiagnoses) {
        assert.ok(!text.includes(diag), `Speech transcription must not inject diagnostic claim: ${diag}`);
      }
    });

    it('should support audio/wav and audio/mp4 formats safely', async () => {
      const wavBuffer = Buffer.from('dummy-wav-content');
      const resWav = await handleVoiceProxyRequest(wavBuffer, 'audio/wav', 'auto', true);
      assert.strictEqual(resWav.status, 200);

      const mp4Buffer = Buffer.from('dummy-mp4-content');
      const resMp4 = await handleVoiceProxyRequest(mp4Buffer, 'audio/mp4', 'auto', true);
      assert.strictEqual(resMp4.status, 200);
    });
  });
});
