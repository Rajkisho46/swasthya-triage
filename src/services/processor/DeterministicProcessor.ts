import type { ITriageProcessor } from './ITriageProcessor';
import type { TriageFormData, TriageCase, ExtractedTimelineItem, UrgencySignal, InputModality } from '../../types/triage';
import { generateCaseId } from '../../utils/caseId';
import { recordAuditEvent } from '../../utils/audit';

interface PatternRule {
  keywords: string[];
  symptomName: string;
  urgency?: {
    level: UrgencySignal['level'];
    reason: string;
  };
  missingQuestions?: {
    missing: string[];
    questions: string[];
  };
}

const CLINICAL_KNOWLEDGE_BASE: PatternRule[] = [
  {
    keywords: [
      'breathing difficulty',
      'difficulty breathing',
      'difficulty in breathing',
      'shortness of breath',
      'breathlessness',
      'dyspnea',
      'dyspneic',
      'breath',
      'breathing',
      'suffocat',
      'gasping',
      'saans lene me',
      'saans me takleef',
      'saans',
      'सांस लेने में तकलीफ',
      'सांस',
      'tachypneic',
      'oxygen',
    ],
    symptomName: 'Breathing Difficulty / Dyspnea',
    urgency: {
      level: 'immediate_attention',
      reason: 'Reported respiratory compromise / breathing difficulty requires urgent clinical evaluation',
    },
    missingQuestions: {
      missing: ['Oxygen Saturation (SpO2)', 'Respiratory Rate', 'Cyanosis presence', 'History of Asthma/COPD'],
      questions: [
        'What is the patient’s current SpO2 on room air?',
        'What is the measured respiratory rate per minute?',
        'Does the patient have a history of asthma, COPD, or cardiac conditions?',
      ],
    },
  },
  {
    keywords: [
      'chest pain',
      'chest tightness',
      'chest pressure',
      'chest heaviness',
      'heavy chest',
      'chest discomfort',
      'heaviness in the chest',
      'heaviness in chest',
      'angina',
      'seene me dard',
      'seene me bhari',
      'chhati me bhari',
      'chhati me bhareepan',
      'chhati me bhaareepan',
      'छाती में भारीपन',
      'सीने में भारीपन',
      'shoulder pain',
    ],
    symptomName: 'Chest Discomfort / Pain',
    urgency: {
      level: 'immediate_attention',
      reason: 'Acute chest discomfort requires immediate vitals and physician assessment to rule out acute events',
    },
    missingQuestions: {
      missing: ['Blood Pressure', 'Pulse / Heart Rate', 'ECG (if available)', 'Radiation to arm/jaw'],
      questions: [
        'What is the current Blood Pressure and Pulse rate?',
        'Does the pain radiate to the left arm, neck, or jaw?',
        'Is there associated sweating, nausea, or dizziness?',
      ],
    },
  },
  {
    keywords: [
      'fever',
      'high fever',
      'temperature',
      'high temperature',
      'febrile',
      'pyrexia',
      'bukhar',
      'tej bukhar',
      'तेज बुखार',
      'बुखार',
      'chills',
      'shivering',
      'hot',
      'leukocytosis',
      '101.',
      '102.',
      '103.',
      '104.',
    ],
    symptomName: 'Fever / Pyrexia',
    urgency: {
      level: 'attention_required',
      reason: 'Fever reported; temperature trajectory and duration require clinical assessment',
    },
    missingQuestions: {
      missing: ['Recorded Body Temperature (°F/°C)', 'Pattern of chills/rigors', 'Hydration status'],
      questions: [
        'What is the highest recorded body temperature today?',
        'Are there accompanying chills, rigors, or body rash?',
        'Is the patient able to maintain oral fluids?',
      ],
    },
  },
  {
    keywords: [
      'cough',
      'dry cough',
      'productive cough',
      'barking cough',
      'khansi',
      'खांसी',
      'phlegm',
      'sputum',
    ],
    symptomName: 'Cough',
    missingQuestions: {
      missing: ['Sputum characteristics (dry vs productive, color)', 'Hemoptysis (blood in cough)'],
      questions: [
        'Is the cough dry or producing phlegm/sputum?',
        'Has there been any blood noted in sputum?',
        'Is the cough worsening at night or after exertion?',
      ],
    },
  },
  {
    keywords: [
      'weakness',
      'generalized weakness',
      'general weakness',
      'fatigue',
      'tired',
      'exhaust',
      'exhaustion',
      'kamzori',
      'कमजोरी',
      'letharg',
      'lethargy',
      'malaise',
    ],
    symptomName: 'Generalized Weakness / Fatigue',
    missingQuestions: {
      missing: ['Blood Sugar level (RBS)', 'Ability to ambulate independently'],
      questions: [
        'Is the patient able to stand and walk unassisted?',
        'What was the last meal intake and random blood sugar (if diabetic)?',
      ],
    },
  },
  {
    keywords: ['headache', 'sir dard', 'migraine', 'head ache'],
    symptomName: 'Headache / Cephalea',
    missingQuestions: {
      missing: ['Blood Pressure', 'Visual disturbances', 'Neck stiffness'],
      questions: [
        'What is the patient’s current Blood Pressure reading?',
        'Are there any visual blurriness, vomiting, or neck stiffness?',
      ],
    },
  },
  {
    keywords: ['dizzy', 'dizziness', 'lightheaded', 'faint', 'chakkar', 'syncope'],
    symptomName: 'Dizziness / Lightheadedness',
    urgency: {
      level: 'attention_required',
      reason: 'Dizziness reported; hemodynamic stability and postural changes should be checked',
    },
    missingQuestions: {
      missing: ['Postural BP / Pulse', 'Recent fluid intake / dehydration markers'],
      questions: [
        'Did the patient lose consciousness or faint at any point?',
        'Is the dizziness aggravated by standing up or head movement?',
      ],
    },
  },
  {
    keywords: ['abdomen', 'stomach', 'belly', 'pet dard', 'abdominal pain', 'cramps', 'nausea', 'vomit', 'loose motion', 'diarrhea'],
    symptomName: 'Abdominal Discomfort / Gastrointestinal Symptoms',
    missingQuestions: {
      missing: ['Exact pain quadrant/location', 'Frequency of vomiting/loose stools', 'Dehydration signs'],
      questions: [
        'Where exactly is the abdominal pain located (upper, lower, right, left)?',
        'How many episodes of vomiting or loose stools have occurred in the last 24 hours?',
        'Is the abdomen soft or tender and rigid on examination?',
      ],
    },
  },
  {
    keywords: ['throat', 'sore throat', 'gala', 'gale', 'gale me dard', 'गले', 'गले में दर्द', 'difficulty swallowing'],
    symptomName: 'Sore Throat / Pharyngeal Irritation',
    missingQuestions: {
      missing: ['Tonsillar exudate presence', 'Difficulty swallowing liquids'],
      questions: [
        'Is there severe difficulty in swallowing saliva or drinking fluids?',
        'Are there swollen cervical glands or visible throat spots?',
      ],
    },
  },
  {
    keywords: [
      'consolidation',
      'infiltrate',
      'infiltrates',
      'opacity',
      'opacities',
      'pulmonary opacity',
      'patchy opacity',
      'patchy consolidation',
      'lower zone consolidation',
      'lung infiltrate',
      'ground glass opacity',
    ],
    symptomName: 'Radiological Infiltrate / Pulmonary Opacity',
    urgency: {
      level: 'attention_required',
      reason: 'Radiology report indicates consolidation/infiltrate; physical chest auscultation required',
    },
    missingQuestions: {
      missing: ['Auscultation findings (crepitations / rhonchi)', 'SpO2 on room air'],
      questions: [
        'Are bilateral lung sounds clear or are there localized crackles/rhonchi?',
        'Is there pleuritic chest pain on deep inspiration?',
      ],
    },
  },
];

const HINDI_NUMBER_MAP: Record<string, string> = {
  'एक': '1',
  'दो': '2',
  'तीन': '3',
  'चार': '4',
  'पांच': '5',
  'पाँच': '5',
  'छह': '6',
  'सात': '7',
  'आठ': '8',
  'नौ': '9',
  'दस': '10',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9',
  '१०': '10',
};

function normalizeDurationUnit(rawNumStr: string, rawUnitStr: string): string {
  const num = HINDI_NUMBER_MAP[rawNumStr.trim().toLowerCase()] || rawNumStr.trim();
  const unitLower = rawUnitStr.trim().toLowerCase();

  let unit = 'days';
  if (['दिन', 'दिनों', 'din', 'day', 'days', 'd'].includes(unitLower)) {
    unit = num === '1' ? 'day' : 'days';
  } else if (['घंटे', 'घण्टे', 'ghante', 'ghanta', 'hour', 'hours', 'hrs', 'hr'].includes(unitLower)) {
    unit = num === '1' ? 'hour' : 'hours';
  } else if (['हफ्ते', 'हफ़्ते', 'hafte', 'सप्ताह', 'week', 'weeks', 'wk', 'wks'].includes(unitLower)) {
    unit = num === '1' ? 'week' : 'weeks';
  } else if (['महीने', 'mahine', 'month', 'months', 'mo', 'mos'].includes(unitLower)) {
    unit = num === '1' ? 'month' : 'months';
  }

  return `${num} ${unit}`;
}

function parseExplicitDuration(text: string): string {
  const lowerText = text.toLowerCase();

  // 1. Check for English explicit durations: "for 3 days", "since 3 days", "past 4 days", "last 2 days"
  const englishDurationRegex =
    /(?:for|past|last|since)\s+(\d+)\s*(days?|hours?|hrs?|weeks?|months?|d)/i;
  const engMatch = lowerText.match(englishDurationRegex);
  if (engMatch && engMatch[1] && engMatch[2]) {
    return normalizeDurationUnit(engMatch[1], engMatch[2]);
  }

  // 2. Check for Hindi / Hinglish durations: e.g. "3 दिन से", "तीन दिन से", "3 days से", "3 days se", "3 din se"
  const hindiDurationRegex =
    /(?:for|since|past|last)?\s*(\d+|एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस|[०-९]+)\s*(दिन|दिनों|din|days?|घंटे|घण्टे|ghante|ghanta|hours?|hrs?|हफ्ते|हफ़्ते|hafte|सप्ताह|weeks?|महीने|mahine|months?|d)\s*(?:से|se)?/i;
  const hinMatch = lowerText.match(hindiDurationRegex);
  if (hinMatch && hinMatch[1] && hinMatch[2]) {
    const fullMatch = hinMatch[0].trim();
    if (
      /(?:for|past|last|since|से|se)/i.test(fullMatch) ||
      /(?:दिन|दिनों|din|घंटे|घण्टे|ghante|हफ्ते|हफ़्ते|hafte|सप्ताह|महीने|mahine)/i.test(hinMatch[2])
    ) {
      return normalizeDurationUnit(hinMatch[1], hinMatch[2]);
    }
  }

  // 3. Check for suffix duration: "3 days duration", "3 days ago"
  const suffixDurationRegex =
    /(\d+)\s*(days?|hours?|weeks?|months?)\s*(?:duration|ago)/i;
  const sufMatch = lowerText.match(suffixDurationRegex);
  if (sufMatch && sufMatch[1] && sufMatch[2]) {
    return normalizeDurationUnit(sufMatch[1], sufMatch[2]);
  }

  // 4. Relative time markers
  if (lowerText.includes('since yesterday') || lowerText.includes('कल से')) {
    return 'Since yesterday';
  }
  if (lowerText.includes('since this morning') || lowerText.includes('since morning') || lowerText.includes('सुबह से')) {
    return 'Since this morning';
  }
  if (lowerText.includes('since last night') || lowerText.includes('कल रात से')) {
    return 'Since last night';
  }
  if (lowerText.includes('started today') || lowerText.includes('आज से') || lowerText.includes('आज')) {
    return 'Started today';
  }
  if (lowerText.includes('yesterday') || lowerText.includes('कल')) {
    return 'Yesterday';
  }

  return 'Unspecified duration';
}

function extractTimeline(text: string, symptoms: string[]): ExtractedTimelineItem[] {
  const timeline: ExtractedTimelineItem[] = [];
  const lowerText = text.toLowerCase();
  const generalDuration = parseExplicitDuration(text);

  symptoms.forEach((symptom) => {
    let itemDuration = generalDuration;

    // Check for symptom-specific sub-onsets
    if (symptom.includes('Breathing')) {
      if (lowerText.includes('since yesterday') || lowerText.includes('कल से')) {
        itemDuration = 'Since yesterday';
      } else if (lowerText.includes('since morning') || lowerText.includes('सुबह से')) {
        itemDuration = 'Since this morning';
      } else if (lowerText.includes('today') || lowerText.includes('आज')) {
        itemDuration = 'Started today';
      } else if (lowerText.includes('yesterday') || lowerText.includes('कल')) {
        itemDuration = 'Yesterday';
      }
    } else if (symptom.includes('Fever')) {
      const feverDurationMatch = lowerText.match(
        /(?:fever|bukhar|बुखार)\s*(?:for|since|is|से)?\s*(\d+|एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस)\s*(days?|hrs?|hours?|weeks?|दिन|din)/i
      );
      if (feverDurationMatch && feverDurationMatch[1] && feverDurationMatch[2]) {
        itemDuration = normalizeDurationUnit(feverDurationMatch[1], feverDurationMatch[2]);
      }
    }

    timeline.push({
      symptom,
      durationOrOnset: itemDuration,
      source: 'AI',
    });
  });

  if (timeline.length === 0) {
    timeline.push({
      symptom: 'Reported symptoms',
      durationOrOnset: generalDuration,
      source: 'AI',
    });
  }

  return timeline;
}

export class DeterministicTriageProcessor implements ITriageProcessor {
  public id = 'deterministic-v1';
  public name = 'Deterministic Knowledge Base Engine (V1 / Fallback)';
  public description = 'Rule-based clinical symptom and urgency extractor without external cloud API dependencies';
  public isAIBased = false;

  processTriageSync(formData: TriageFormData): TriageCase {
    // 1. Gather all multimodal inputs into normalized text
    let aggregatedText = formData.symptoms ? formData.symptoms.trim() : '';

    if (formData.multilingualData?.translatedText) {
      aggregatedText += `\n[Translated English: ${formData.multilingualData.translatedText}]`;
    }

    if (formData.voiceData?.transcript) {
      aggregatedText += `\n[Voice Transcript: ${formData.voiceData.transcript}]`;
    }

    if (formData.ocrReports && formData.ocrReports.length > 0) {
      formData.ocrReports.forEach((report) => {
        aggregatedText += `\n[OCR Report (${report.fileName}): ${report.extractedText}]`;
      });
    }

    const lowerText = aggregatedText.toLowerCase();

    const matchedSymptoms: string[] = [];
    const urgencySignals: UrgencySignal[] = [];
    const missingInfoSet: Set<string> = new Set();
    const followUpQuestionsSet: Set<string> = new Set();

    missingInfoSet.add('Baseline Vital Signs (Blood Pressure, Pulse, SpO2, Temperature)');
    missingInfoSet.add('Pre-existing chronic conditions / comorbidities');
    missingInfoSet.add('Current regular medications & drug allergies');

    followUpQuestionsSet.add('Does the patient have known comorbidities (Diabetes, Hypertension, Heart/Kidney disease)?');
    followUpQuestionsSet.add('Is the patient currently taking any prescription medications or over-the-counter drugs?');
    followUpQuestionsSet.add('Are there known drug or food allergies?');

    // Rule-based knowledge base matching
    CLINICAL_KNOWLEDGE_BASE.forEach((rule) => {
      const isMatched = rule.keywords.some((kw) => lowerText.includes(kw));
      if (isMatched) {
        if (!matchedSymptoms.includes(rule.symptomName)) {
          matchedSymptoms.push(rule.symptomName);
        }

        if (rule.urgency) {
          urgencySignals.push({
            signal: `${rule.symptomName}: ${rule.urgency.reason}`,
            level: rule.urgency.level,
            reason: rule.urgency.reason,
            source: 'AI',
          });
        }

        if (rule.missingQuestions) {
          rule.missingQuestions.missing.forEach((m) => missingInfoSet.add(m));
          rule.missingQuestions.questions.forEach((q) => followUpQuestionsSet.add(q));
        }
      }
    });

    if (matchedSymptoms.length === 0) {
      matchedSymptoms.push('General reported discomfort / health concern');
      followUpQuestionsSet.add('Could the patient describe the primary reason for visiting the facility today?');
    }

    const timeline = extractTimeline(aggregatedText, matchedSymptoms);

    const symptomsListStr = matchedSymptoms.join(', ');
    const ageGenderStr = formData.age
      ? `${formData.age}y ${formData.gender || 'patient'}`
      : `Patient`;

    const modalitiesSummary = [];
    if (formData.symptoms) modalitiesSummary.push('Text');
    if (formData.voiceData) modalitiesSummary.push('Voice Audio');
    if (formData.ocrReports && formData.ocrReports.length > 0) {
      modalitiesSummary.push(`OCR Documents (${formData.ocrReports.length})`);
    }

    const aiSummary = `${ageGenderStr} presents with reported ${symptomsListStr}. Integrated input modalities: ${modalitiesSummary.join(', ')}. Objective vital measurements, comorbidity details, and clinician review are required for triage disposition.`;

    const inputModalities: InputModality[] = [];
    if (formData.symptoms) inputModalities.push('text');
    if (formData.voiceData) inputModalities.push('voice');
    if (formData.ocrReports && formData.ocrReports.some((r) => r.fileType === 'image')) inputModalities.push('ocr_image');
    if (formData.ocrReports && formData.ocrReports.some((r) => r.fileType === 'pdf')) inputModalities.push('ocr_pdf');

    const caseId = formData.caseId || generateCaseId();

    const triageCase: TriageCase = {
      caseId,
      patientId: formData.patientId,
      age: typeof formData.age === 'number' ? formData.age : undefined,
      gender: formData.gender ? formData.gender : undefined,
      preferredLanguage: formData.preferredLanguage || 'English',
      rawSymptoms: formData.symptoms ? formData.symptoms.trim() : '',
      consentGiven: formData.consentGiven,
      createdAt: new Date().toISOString(),

      inputModalities: inputModalities.length > 0 ? inputModalities : ['text'],
      voiceData: formData.voiceData,
      ocrReports: formData.ocrReports,
      multilingualData: formData.multilingualData,
      processorUsed: this.name,

      extractedSymptoms: matchedSymptoms,
      timeline,
      missingInformation: Array.from(missingInfoSet),
      followUpQuestions: Array.from(followUpQuestionsSet),
      urgencySignals,
      aiSummary,

      reviewStatus: 'awaiting_review',
    };

    return triageCase;
  }

  async processTriage(formData: TriageFormData): Promise<TriageCase> {
    const caseId = formData.caseId || generateCaseId();

    // 1. Audit event: AI processing started
    recordAuditEvent(
      caseId,
      'AI Triage Engine',
      'AI triage extraction started',
      `Executing deterministic clinical knowledge extraction for ${formData.patientId}`
    );

    const triageCase = this.processTriageSync({ ...formData, caseId });

    // 2. Audit event: AI processing completed
    recordAuditEvent(
      caseId,
      'AI Triage Engine',
      'AI triage extraction completed',
      `Extracted ${triageCase.extractedSymptoms.length} symptoms | ${triageCase.urgencySignals.length} urgency signals`
    );

    return triageCase;
  }
}
