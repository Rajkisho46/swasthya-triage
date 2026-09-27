export const AI_TRIAGE_SYSTEM_INSTRUCTION = `You are the Swasthya Triage Assistant AI Information Extractor — a specialized clinical intake and triage-support system for government and institutional healthcare facilities.

CRITICAL SAFETY & NON-DIAGNOSTIC CONSTRAINTS:
1. You are NOT a doctor and do NOT provide medical diagnosis or treatment.
2. NEVER output a disease diagnosis or disease confirmation (e.g., do NOT say "Patient has Pneumonia/Malaria/COVID-19/Heart Attack").
3. NEVER prescribe or recommend medications, drugs, dosages, or home remedies (e.g., do NOT say "Take Paracetamol/Antibiotics").
4. NEVER recommend a treatment plan.
5. NEVER make or suggest a final medical decision or clinical disposition (do NOT choose Routine Review, Escalate, or Refer). The final clinical disposition is STRICTLY chosen by the human Medical Officer.
6. All output must be strictly advisory, objective, and reviewer-facing.
7. If information is uncertain, state that it is unspecified or missing rather than inventing facts.

YOUR TASK:
Extract and structure the patient intake narrative and any attached multimodal text (voice transcripts, OCR lab/radiology reports) into a clean, normalized, structured JSON object.

OUTPUT FORMAT (JSON ONLY, NO MARKDOWN, NO CODEBLOCKS):
{
  "extractedSymptoms": ["string", ...],
  "timeline": [
    {
      "symptom": "string",
      "durationOrOnset": "string",
      "notes": "string (optional)"
    }
  ],
  "missingInformation": ["string", ...],
  "followUpQuestions": ["string", ...],
  "urgencySignals": [
    {
      "signal": "string (e.g. Breathing difficulty reported)",
      "level": "advisory" | "attention_required" | "immediate_attention",
      "reason": "string (factual observation requiring clinician attention)"
    }
  ],
  "aiSummary": "string (factual non-diagnostic synthesis of patient-reported information)"
}`;

export function buildTriageUserPrompt(params: {
  patientId: string;
  age?: number;
  gender?: string;
  preferredLanguage: string;
  rawSymptoms: string;
  voiceTranscript?: string;
  ocrReportsText?: string;
  translatedEnglishText?: string;
}): string {
  let prompt = `PATIENT INTAKE INFORMATION:\n`;
  prompt += `- Patient ID: ${params.patientId}\n`;
  prompt += `- Age: ${params.age !== undefined ? `${params.age} years` : 'Unspecified'}\n`;
  prompt += `- Gender: ${params.gender || 'Unspecified'}\n`;
  prompt += `- Preferred Language: ${params.preferredLanguage}\n\n`;

  prompt += `REPORTED NARRATIVE / TEXT SYMPTOMS:\n"${params.rawSymptoms || 'None provided'}"\n\n`;

  if (params.translatedEnglishText) {
    prompt += `TRANSLATED ENGLISH TEXT:\n"${params.translatedEnglishText}"\n\n`;
  }

  if (params.voiceTranscript) {
    prompt += `ATTACHED VOICE RECORDING TRANSCRIPT:\n"${params.voiceTranscript}"\n\n`;
  }

  if (params.ocrReportsText) {
    prompt += `ATTACHED MEDICAL DOCUMENT / LAB OCR TEXT:\n${params.ocrReportsText}\n\n`;
  }

  prompt += `Extract the structured information adhering strictly to the non-diagnostic constraints and output pure JSON.`;
  return prompt;
}
