from fastapi import APIRouter, HTTPException, status
from ...schemas.triage import TriageProcessRequest, TriageProcessResponse, UrgencySignalSchema
from ...services.llm_service import LLMStructuringService
from ...services.rules_engine import DeterministicSafetyRulesEngine

router = APIRouter(prefix="/triage", tags=["AI Structuring & Safety Engine"])

@router.post("", response_model=TriageProcessResponse)
async def process_triage(req: TriageProcessRequest):
    if not req.patientId or not req.patientId.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Validation error: patientId is required"
        )

    combined_text = f"{req.rawSymptoms or ''} {req.voiceTranscript or ''} {req.ocrReportsText or ''} {req.translatedEnglishText or ''}".strip()

    # 1. Deterministic safety signals evaluated independently from LLM
    safety_signals = DeterministicSafetyRulesEngine.evaluate(combined_text)

    # 2. LLM / Fallback structuring
    advisory_note, is_fallback, fallback_reason = await LLMStructuringService.structure_intake_narrative(
        patient_id=req.patientId,
        age=req.age,
        gender=req.gender,
        preferred_language=req.preferredLanguage or "English",
        raw_symptoms=req.rawSymptoms or "",
        voice_transcript=req.voiceTranscript or "",
        ocr_text=req.ocrReportsText or "",
        translated_text=req.translatedEnglishText or ""
    )

    # Return structured response compatible with existing frontend data shape
    formatted_data = {
        "chiefComplaint": advisory_note.chief_complaint,
        "extractedSymptoms": advisory_note.extracted_symptoms,
        "timeline": [t.model_dump() for t in advisory_note.timeline],
        "missingInformation": advisory_note.missing_information,
        "followUpQuestions": advisory_note.follow_up_questions,
        "urgencySignals": [s.model_dump() for s in safety_signals],
        "aiSummary": advisory_note.ai_summary,
        "isFallbackUsed": is_fallback,
        "fallbackReason": fallback_reason if is_fallback else None
    }

    return TriageProcessResponse(
        success=True,
        data=formatted_data,
        ai_advisory=advisory_note,
        safety_signals=safety_signals,
        is_fallback_used=is_fallback,
        fallback_reason=fallback_reason if is_fallback else None
    )
