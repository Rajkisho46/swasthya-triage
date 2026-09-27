import json
import os
import re
from typing import Dict, Any, Tuple
import httpx
from ..config import settings
from ..schemas.triage import StructuredAdvisoryNote, TimelineItemSchema
from ..utils.validation import check_ai_safety_compliance

AI_TRIAGE_SYSTEM_INSTRUCTION = """You are the AI Advisory Structuring Engine for Swasthya Triage.
Your role is EXCLUSIVELY to extract, organize, and structure patient symptoms, timeline, and missing clinical information.

CRITICAL SAFETY DIRECTIVES:
1. DO NOT diagnose any disease, illness, condition, or medical disorder.
2. DO NOT recommend or prescribe any medication, dosage, or medical treatment.
3. DO NOT advise the patient or medical reviewer to discharge, treat, or make final clinical determinations.
4. DO NOT make statements of clinical certainty.
5. ALWAYS output ONLY a valid JSON object matching the required schema.

Schema:
{
  "chief_complaint": "string - primary patient reported complaint without medical diagnosis",
  "extracted_symptoms": ["string - symptom list verbatim from patient observation"],
  "timeline": [
    {
      "symptom": "string",
      "durationOrOnset": "string",
      "notes": "string"
    }
  ],
  "missing_information": ["string - clinical parameters not reported e.g. temperature, blood pressure"],
  "follow_up_questions": ["string - non-leading questions for healthcare worker intake"],
  "ai_summary": "string - concise neutral structuring of reported evidence"
}"""

class LLMStructuringService:
    @staticmethod
    def generate_deterministic_fallback(
        patient_id: str,
        raw_symptoms: str,
        voice_transcript: str = "",
        ocr_text: str = "",
        translated_text: str = ""
    ) -> StructuredAdvisoryNote:
        """
        Deterministic rule-based structuring fallback when live LLM is unavailable.
        """
        combined = f"{raw_symptoms} {voice_transcript or ''} {ocr_text or ''} {translated_text or ''}".strip()
        combined_lower = combined.lower()

        # Extract symptoms deterministically
        symptoms_map = {
            "chest pain": "Chest pain / discomfort",
            "breathless": "Shortness of breath / dyspnea",
            "breathing difficulty": "Breathing difficulty",
            "fever": "Fever",
            "cough": "Cough",
            "headache": "Headache",
            "weakness": "Generalized weakness / fatigue",
            "dizziness": "Dizziness / lightheadedness",
            "abdominal": "Abdominal discomfort",
            "vomiting": "Nausea / vomiting",
            "sore throat": "Sore throat",
            "stiff neck": "Neck stiffness",
            "bleeding": "Active bleeding"
        }

        extracted = []
        timeline = []
        for kw, sym in symptoms_map.items():
            if kw in combined_lower:
                extracted.append(sym)
                # Look for onset / duration
                onset = "Reported during intake"
                if "days" in combined_lower or "day" in combined_lower:
                    match = re.search(r"(\d+\s*(?:days?|hours?|weeks?))", combined_lower)
                    if match:
                        onset = match.group(1)
                timeline.append(TimelineItemSchema(
                    symptom=sym,
                    durationOrOnset=onset,
                    notes="Extracted via deterministic fallback parser",
                    source="AI"
                ))

        if not extracted:
            extracted = ["Unspecified discomfort as reported by patient"]
            timeline = [TimelineItemSchema(
                symptom="Patient reported symptoms",
                durationOrOnset="Recent",
                notes="Structured from intake narrative",
                source="AI"
            )]

        # Determine missing parameters
        missing = []
        if "temperature" not in combined_lower and "temp" not in combined_lower and "°" not in combined:
            missing.append("Objective body temperature measurement")
        if "blood pressure" not in combined_lower and "bp" not in combined_lower and "/" not in combined:
            missing.append("Blood pressure vital signs")
        if "pulse" not in combined_lower and "heart rate" not in combined_lower and "spo2" not in combined_lower:
            missing.append("Oxygen saturation (SpO2) and pulse rate")

        questions = [
            "What was the exact onset and progression of these symptoms?",
            "Are there any known pre-existing medical conditions or current medications?",
            "Has the patient experienced similar episodes in the past?"
        ]

        chief_complaint = extracted[0] if extracted else "General patient health consultation"

        return StructuredAdvisoryNote(
            chief_complaint=f"{chief_complaint} reported for evaluation",
            extracted_symptoms=extracted,
            timeline=timeline,
            missing_information=missing,
            follow_up_questions=questions,
            ai_summary=f"Deterministic Advisory Summary: Patient {patient_id} reports {', '.join(extracted)}. Vital signs and clinical history require clinician verification."
        )

    @classmethod
    async def structure_intake_narrative(
        cls,
        patient_id: str,
        age: int = None,
        gender: str = None,
        preferred_language: str = "English",
        raw_symptoms: str = "",
        voice_transcript: str = "",
        ocr_text: str = "",
        translated_text: str = ""
    ) -> Tuple[StructuredAdvisoryNote, bool, str]:
        """
        Synthesize intake data into a structured advisory note.
        Returns (StructuredAdvisoryNote, is_fallback_used, fallback_reason).
        """
        api_key = settings.GEMINI_API_KEY
        if not api_key or len(api_key.strip()) < 5:
            fallback = cls.generate_deterministic_fallback(
                patient_id, raw_symptoms, voice_transcript, ocr_text, translated_text
            )
            return fallback, True, "AI Provider not configured (GEMINI_API_KEY unset). Fallback engine activated."

        user_prompt = f"""Patient ID: {patient_id}
Age: {age if age is not None else 'Unspecified'}
Gender: {gender or 'Unspecified'}
Language: {preferred_language}
Narrative Symptoms: {raw_symptoms}
Voice Transcript: {voice_transcript or 'None'}
OCR Lab Reports: {ocr_text or 'None'}
Translated Text: {translated_text or 'None'}

Please organize this information strictly into the requested JSON schema."""

        model_name = settings.AI_MODEL_NAME
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{AI_TRIAGE_SYSTEM_INSTRUCTION}\n\n{user_prompt}"}]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.post(endpoint, json=payload)
                if response.status_code != 200:
                    fallback = cls.generate_deterministic_fallback(
                        patient_id, raw_symptoms, voice_transcript, ocr_text, translated_text
                    )
                    return fallback, True, f"AI Provider returned HTTP {response.status_code}. Deterministic fallback activated."

                data = response.json()
                raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if not raw_text:
                    fallback = cls.generate_deterministic_fallback(
                        patient_id, raw_symptoms, voice_transcript, ocr_text, translated_text
                    )
                    return fallback, True, "Empty response from AI Provider. Fallback activated."

                # Clean markdown blocks if present
                cleaned = raw_text.strip()
                if cleaned.startswith("```json"):
                    cleaned = re.sub(r"^```json\s*", "", cleaned)
                    cleaned = re.sub(r"\s*```$", "", cleaned)
                elif cleaned.startswith("```"):
                    cleaned = re.sub(r"^```\s*", "", cleaned)
                    cleaned = re.sub(r"\s*```$", "", cleaned)

                parsed = json.loads(cleaned)

                # Safety check
                summary_text = parsed.get("ai_summary", "")
                is_safe, violation = check_ai_safety_compliance(summary_text)
                if not is_safe:
                    fallback = cls.generate_deterministic_fallback(
                        patient_id, raw_symptoms, voice_transcript, ocr_text, translated_text
                    )
                    return fallback, True, f"Safety violation rejected: {violation}. Deterministic fallback activated."

                timeline_items = [
                    TimelineItemSchema(
                        symptom=t.get("symptom", "Symptom"),
                        durationOrOnset=t.get("durationOrOnset", "Reported"),
                        notes=t.get("notes"),
                        source="AI"
                    )
                    for t in parsed.get("timeline", [])
                ]

                note = StructuredAdvisoryNote(
                    chief_complaint=parsed.get("chief_complaint", "Patient consultation"),
                    extracted_symptoms=parsed.get("extracted_symptoms", []),
                    timeline=timeline_items,
                    missing_information=parsed.get("missing_information", []),
                    follow_up_questions=parsed.get("follow_up_questions", []),
                    ai_summary=parsed.get("ai_summary", "")
                )
                return note, False, ""

        except Exception as e:
            fallback = cls.generate_deterministic_fallback(
                patient_id, raw_symptoms, voice_transcript, ocr_text, translated_text
            )
            return fallback, True, f"AI generation error ({type(e).__name__}). Fallback activated."
