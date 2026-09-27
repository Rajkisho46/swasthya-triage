import type { ISpeechToTextService, TranscriptionOptions } from './ISpeechService';
import type { VoiceInputData } from '../../types/triage';

export const PRELOADED_VOICE_SAMPLES = [
  {
    id: 'voice-hindi-fever',
    title: 'Hindi Audio Note: 3-Day Fever & Weakness (32s)',
    language: 'Hindi',
    duration: '0:32',
    durationSeconds: 32,
    sampleTranscript:
      'मुझे तीन दिन से बहुत तेज बुखार आ रहा है और कमजोरी लग रही है। कल से सांस लेने में भी थोड़ी तकलीफ हो रही है।',
  },
  {
    id: 'voice-eng-chest-tightness',
    title: 'English Audio Note: Chest Tightness & Exertion (28s)',
    language: 'English',
    duration: '0:28',
    durationSeconds: 28,
    sampleTranscript:
      'Patient reports onset of heavy chest tightness since morning radiating slightly to the left shoulder, with breathlessness while walking up stairs.',
  },
  {
    id: 'voice-eng-child-cough',
    title: 'English Audio Note: Pediatric Persistent Cough (20s)',
    language: 'English',
    duration: '0:20',
    durationSeconds: 20,
    sampleTranscript:
      'My 5-year-old child has had continuous barking cough and high body temperature for the past 2 days. Not eating properly.',
  },
];

export class MockSpeechToTextService implements ISpeechToTextService {
  public providerName = 'Demo Voice Recognition Provider (Simulated)';
  public isMock = true;

  async transcribeAudio(
    audioSource: Blob | string,
    options?: TranscriptionOptions
  ): Promise<VoiceInputData> {
    // Simulate slight processing latency (300ms)
    await new Promise((resolve) => setTimeout(resolve, 300));

    let transcript = '';
    let durationSeconds = 25;
    const language = options?.language || 'Hindi';

    if (typeof audioSource === 'string') {
      const match = PRELOADED_VOICE_SAMPLES.find((s) => s.id === audioSource);
      if (match) {
        transcript = match.sampleTranscript;
        durationSeconds = match.durationSeconds;
      } else {
        transcript = audioSource;
      }
    } else {
      transcript =
        language === 'Hindi'
          ? 'मुझे कल रात से पेट में दर्द और उल्टी जैसा महसूस हो रहा है।'
          : 'Patient reporting persistent fever for 2 days accompanied by severe body ache and fatigue.';
    }

    let audioBlobUrl: string | undefined = undefined;
    if (typeof audioSource !== 'string' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        audioBlobUrl = URL.createObjectURL(audioSource);
      } catch {
        // ignore in non-browser envs
      }
    }

    return {
      transcript,
      durationSeconds: options?.durationSeconds || durationSeconds,
      originalLanguage: language,
      isDemoTranscription: true,
      recordedAt: new Date().toISOString(),
      ...(audioBlobUrl ? { audioBlobUrl } : {}),
    };
  }

  getPreloadedVoiceScenarios() {
    return PRELOADED_VOICE_SAMPLES;
  }
}

export const defaultSpeechService = new MockSpeechToTextService();
