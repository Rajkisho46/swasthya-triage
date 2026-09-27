import type { MultilingualData } from '../../types/triage';

export interface ITranslationService {
  providerName: string;
  isMock: boolean;
  translateToNormalizedEnglish(
    text: string,
    sourceLanguage: string
  ): Promise<MultilingualData>;
}
