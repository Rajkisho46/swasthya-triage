import type { ExtractedTimelineItem, UrgencySignal } from '../../types/triage';

export interface StructuredAIOutput {
  extractedSymptoms: string[];
  timeline: ExtractedTimelineItem[];
  missingInformation: string[];
  followUpQuestions: string[];
  urgencySignals: UrgencySignal[];
  aiSummary: string;
}

const FORBIDDEN_DIAGNOSTIC_PATTERNS = [
  /\b(?:diagnos(?:ed|is|ing)|you have (?:pneumonia|malaria|dengue|covid|typhoid|tuberculosis|asthma|diabetes|heart attack|angina))\b/i,
  /\b(?:prescrib(?:e|ed|ing|tion)|take \d+\s*(?:mg|ml|tablets?|capsules?))\b/i,
  /\b(?:recommended treatment|treatment plan:|curative regimen)\b/i,
  /\b(?:decision is (?:routine|escalate|refer)|disposition: (?:routine|escalate|refer))\b/i,
];

export function validateAndSanitizeAIOutput(rawJson: unknown): StructuredAIOutput {
  if (!rawJson || typeof rawJson !== 'object') {
    throw new Error('AI output is not a valid JSON object');
  }

  const obj = rawJson as Record<string, unknown>;

  // 1. Validate extractedSymptoms
  if (!Array.isArray(obj.extractedSymptoms) || obj.extractedSymptoms.length === 0) {
    throw new Error('AI output missing or empty "extractedSymptoms" array');
  }
  const extractedSymptoms = obj.extractedSymptoms.map((s) => String(s).trim()).filter(Boolean);

  // 2. Validate timeline
  if (!Array.isArray(obj.timeline)) {
    throw new Error('AI output missing "timeline" array');
  }
  const timeline: ExtractedTimelineItem[] = obj.timeline.map((item: any) => ({
    symptom: String(item?.symptom || 'Reported symptom').trim(),
    durationOrOnset: String(item?.durationOrOnset || 'Unspecified').trim(),
    notes: item?.notes ? String(item.notes).trim() : undefined,
    source: 'AI',
  }));

  // 3. Validate missingInformation
  if (!Array.isArray(obj.missingInformation)) {
    throw new Error('AI output missing "missingInformation" array');
  }
  const missingInformation = obj.missingInformation.map((m) => String(m).trim()).filter(Boolean);

  // 4. Validate followUpQuestions
  if (!Array.isArray(obj.followUpQuestions)) {
    throw new Error('AI output missing "followUpQuestions" array');
  }
  const followUpQuestions = obj.followUpQuestions.map((q) => String(q).trim()).filter(Boolean);

  // 5. Validate urgencySignals
  if (!Array.isArray(obj.urgencySignals)) {
    throw new Error('AI output missing "urgencySignals" array');
  }
  const urgencySignals: UrgencySignal[] = obj.urgencySignals.map((u: any) => {
    let level: UrgencySignal['level'] = 'advisory';
    if (u?.level === 'immediate_attention' || u?.level === 'attention_required') {
      level = u.level;
    }
    return {
      signal: String(u?.signal || 'Urgency Signal Detected').trim(),
      level,
      reason: String(u?.reason || 'Requires clinician evaluation').trim(),
      source: 'AI',
    };
  });

  // 6. Validate aiSummary
  if (typeof obj.aiSummary !== 'string' || !obj.aiSummary.trim()) {
    throw new Error('AI output missing or empty "aiSummary" string');
  }
  const aiSummary = obj.aiSummary.trim();

  // 7. Safety check against diagnostic / prescriptive violations
  const fullTextToScan = [
    aiSummary,
    ...extractedSymptoms,
    ...urgencySignals.map((u) => `${u.signal} ${u.reason}`),
  ].join(' ');

  for (const pattern of FORBIDDEN_DIAGNOSTIC_PATTERNS) {
    if (pattern.test(fullTextToScan)) {
      throw new Error(`Safety violation: AI output contained forbidden diagnostic/prescriptive phrasing matching ${pattern}`);
    }
  }

  return {
    extractedSymptoms,
    timeline,
    missingInformation,
    followUpQuestions,
    urgencySignals,
    aiSummary,
  };
}
