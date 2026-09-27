import type { ITranslationService } from './ITranslationService';
import type { MultilingualData } from '../../types/triage';

const HINDI_PHRASE_DICTIONARY: Record<string, string> = {
  'मुझे 3 दिन से तेज बुखार है और कल से सांस लेने में बहुत तकलीफ हो रही है। छाती में भारीपन महसूस हो रहा है।':
    'Patient reports high fever for 3 days and severe difficulty breathing since yesterday. Experiencing chest heaviness.',
  'मुझे तीन दिन से बहुत तेज बुखार आ रहा है और कमजोरी लग रही है। कल से सांस लेने में भी थोड़ी तकलीफ हो रही है।':
    'Patient reports having high fever for 3 days and feeling weak. Since yesterday, experiencing slight difficulty in breathing.',
  'मुझे कल रात से पेट में दर्द और उल्टी जैसा महसूस हो रहा है।':
    'Patient reports abdominal pain and feeling nauseated since last night.',
  'दो दिन से खांसी और गले में दर्द है।':
    'Cough and sore throat for two days.',
  'सिर में बहुत दर्द है और चक्कर आ रहे हैं।':
    'Severe headache accompanied by dizziness.',
};

export class MockTranslationService implements ITranslationService {
  public providerName = 'Demo Multilingual Translation Engine (Simulated)';
  public isMock = true;

  async translateToNormalizedEnglish(
    text: string,
    sourceLanguage: string
  ): Promise<MultilingualData> {
    const trimmed = text.trim();
    if (sourceLanguage === 'English' || !sourceLanguage) {
      return {
        originalLanguage: 'English',
        originalText: trimmed,
        translatedText: trimmed,
        isTranslated: false,
        translationProvider: 'Direct Native English',
      };
    }

    // Check preloaded dictionary
    if (HINDI_PHRASE_DICTIONARY[trimmed]) {
      return {
        originalLanguage: sourceLanguage,
        originalText: trimmed,
        translatedText: HINDI_PHRASE_DICTIONARY[trimmed],
        isTranslated: true,
        translationProvider: this.providerName,
      };
    }

    // Heuristic translation for keywords in Hindi / Roman Hindi
    let translated = trimmed;
    const lower = trimmed.toLowerCase();

    if (lower.includes('bukhar') || lower.includes('बुखार')) {
      translated = translated.replace(/bukhar|बुखार/gi, 'fever');
    }
    if (lower.includes('saans') || lower.includes('सांस')) {
      translated = translated.replace(/saans|सांस/gi, 'breathing difficulty');
    }
    if (lower.includes('dard') || lower.includes('दर्द')) {
      translated = translated.replace(/dard|दर्द/gi, 'pain');
    }
    if (lower.includes('kamzori') || lower.includes('कमजोरी')) {
      translated = translated.replace(/kamzori|कमजोरी/gi, 'weakness');
    }
    if (lower.includes('khansi') || lower.includes('खांसी')) {
      translated = translated.replace(/khansi|खांसी/gi, 'cough');
    }
    if (lower.includes('bhari') || lower.includes('भारी') || lower.includes('भारीपन')) {
      translated = translated.replace(/chhati me bhari|seene me bhari|छाती में भारीपन|सीने में भारीपन|भारीपन|bhari/gi, 'chest heaviness');
    }

    return {
      originalLanguage: sourceLanguage,
      originalText: trimmed,
      translatedText: translated,
      isTranslated: true,
      translationProvider: this.providerName,
    };
  }
}

export const defaultTranslationService = new MockTranslationService();
