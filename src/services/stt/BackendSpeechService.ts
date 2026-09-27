import type { ISpeechToTextService, TranscriptionOptions } from './ISpeechService';
import type { VoiceInputData } from '../../types/triage';
import { PRELOADED_VOICE_SAMPLES } from './MockSpeechService';

export interface BackendSTTResponse {
  success: boolean;
  transcription: string;
  raw_transcription?: string;
  language: string;
  provider: string;
  is_demo_transcription: boolean;
  provenance: string;
  confidence?: number;
  duration_seconds?: number;
  status: string;
  error?: string;
}

export class BackendSpeechToTextService implements ISpeechToTextService {
  public providerName = 'Real Backend Speech-to-Text Pipeline';
  public isMock = false;
  private endpointUrl: string;

  constructor(endpointUrl?: string) {
    const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
    this.endpointUrl = endpointUrl || (baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/voice/transcribe` : '/api/voice/transcribe');
  }

  async transcribeAudio(
    audioSource: Blob | string,
    options?: TranscriptionOptions
  ): Promise<VoiceInputData> {
    const language = options?.language || 'auto';

    // 1. Handle preloaded string IDs (e.g. from demo selector)
    if (typeof audioSource === 'string') {
      const match = PRELOADED_VOICE_SAMPLES.find((s) => s.id === audioSource);
      if (match) {
        return {
          transcript: match.sampleTranscript,
          rawTranscription: match.sampleTranscript,
          durationSeconds: match.durationSeconds,
          originalLanguage: match.language,
          isDemoTranscription: true,
          provider: 'Demo Voice Recognition Provider (Simulated)',
          provenance: 'Patient-Provided',
          recordedAt: new Date().toISOString(),
        };
      }

      // If raw text passed as string
      return {
        transcript: audioSource,
        rawTranscription: audioSource,
        durationSeconds: options?.durationSeconds || 5,
        originalLanguage: language === 'auto' ? 'English' : language,
        isDemoTranscription: true,
        provider: 'Demo Voice Recognition Provider (Simulated)',
        provenance: 'Patient-Provided',
        recordedAt: new Date().toISOString(),
      };
    }

    // 2. Handle live recorded Audio Blob
    const audioBlob = audioSource;
    let audioBlobUrl: string | undefined = undefined;
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        audioBlobUrl = URL.createObjectURL(audioBlob);
      } catch {
        // Ignore non-browser environments
      }
    }

    const formData = new FormData();
    const fileName = audioBlob.type.includes('ogg')
      ? 'recording.ogg'
      : audioBlob.type.includes('mp4')
      ? 'recording.mp4'
      : audioBlob.type.includes('wav')
      ? 'recording.wav'
      : 'recording.webm';

    formData.append('audio', audioBlob, fileName);
    formData.append('language', language);
    if (options?.isMockOnly) {
      formData.append('is_demo', 'true');
    }

    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errMessage = `Server transcription error (HTTP ${response.status})`;
        try {
          const errData = await response.json();
          if (errData.detail) {
            errMessage = errData.detail;
          } else if (errData.error) {
            errMessage = errData.error;
          }
        } catch {
          // ignore parse failure
        }
        throw new Error(errMessage);
      }

      const data: BackendSTTResponse = await response.json();

      if (!data.success && data.error) {
        throw new Error(data.error);
      }

      const rawTranscript = data.transcription || data.raw_transcription || '';

      return {
        transcript: rawTranscript,
        rawTranscription: rawTranscript,
        durationSeconds: data.duration_seconds || options?.durationSeconds || 5,
        originalLanguage: data.language || (language === 'auto' ? 'English' : language),
        isDemoTranscription: Boolean(data.is_demo_transcription),
        provider: data.provider || 'Gemini Speech-to-Text',
        provenance: data.provenance || 'Patient-Provided',
        recordedAt: new Date().toISOString(),
        ...(audioBlobUrl ? { audioBlobUrl } : {}),
      };
    } catch (err: any) {
      // In test/offline environments without backend server, handle graceful demo fallback if mock allowed
      if (options?.isMockOnly) {
        const fallbackText =
          language.toLowerCase().includes('hin')
            ? 'मुझे तीन दिन से बहुत तेज बुखार आ रहा है और कमजोरी लग रही है।'
            : 'Patient reporting persistent chest heaviness and breathlessness on exertion.';

        return {
          transcript: fallbackText,
          rawTranscription: fallbackText,
          durationSeconds: options?.durationSeconds || 5,
          originalLanguage: language === 'auto' ? 'English' : language,
          isDemoTranscription: true,
          provider: 'Demo Voice Recognition Provider (Simulated)',
          provenance: 'Patient-Provided',
          recordedAt: new Date().toISOString(),
          ...(audioBlobUrl ? { audioBlobUrl } : {}),
        };
      }
      throw err;
    }
  }

  getPreloadedVoiceScenarios() {
    return PRELOADED_VOICE_SAMPLES;
  }
}

export const backendSpeechService = new BackendSpeechToTextService();
