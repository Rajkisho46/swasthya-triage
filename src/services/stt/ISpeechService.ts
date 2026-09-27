import type { VoiceInputData } from '../../types/triage';

export interface TranscriptionOptions {
  language?: string;
  isMockOnly?: boolean;
  durationSeconds?: number;
}

export interface ISpeechToTextService {
  providerName: string;
  isMock: boolean;
  transcribeAudio(audioSource: Blob | string, options?: TranscriptionOptions): Promise<VoiceInputData>;
  getPreloadedVoiceScenarios(): Array<{
    id: string;
    title: string;
    language: string;
    duration: string;
    sampleTranscript: string;
  }>;
}
