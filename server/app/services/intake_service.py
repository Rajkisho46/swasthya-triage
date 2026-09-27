import json
import uuid
from typing import Tuple, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.patient import PatientCase
from ..schemas.intake import IntakeCreateRequest
from ..services.rules_engine import DeterministicSafetyRulesEngine
from ..services.llm_service import LLMStructuringService
from ..services.consent_service import ConsentService
from ..services.audit_service import AuditService
from ..utils.timestamps import utc_now_iso

class IntakeService:
    @staticmethod
    async def create_intake_case(
        db: AsyncSession,
        req: IntakeCreateRequest,
        actor: str = "Patient",
        role: str = "PATIENT"
    ) -> PatientCase:
        # Generate pseudonymous IDs
        case_id = f"case_{uuid.uuid4().hex[:8]}"
        patient_id = req.patientId if req.patientId and req.patientId.strip() else f"PAT-{uuid.uuid4().hex[:4].upper()}"

        # 1. Mandatory consent recording
        await ConsentService.record_consent(
            db=db,
            case_id=case_id,
            patient_id=patient_id,
            consent_given=req.consentGiven,
            actor=actor
        )

        # 2. Gather combined text for analysis
        voice_text = req.voiceData.transcript if req.voiceData else ""
        ocr_text = "\n".join([r.extractedText for r in (req.ocrReports or [])])
        translated_text = req.multilingualData.translatedText if req.multilingualData else ""
        combined_text = f"{req.symptoms} {voice_text} {ocr_text} {translated_text}".strip()

        # 3. Deterministic Safety Rules Engine Evaluation
        safety_signals = DeterministicSafetyRulesEngine.evaluate(combined_text)

        # 4. LLM / Fallback Structuring
        advisory_note, is_fallback, fallback_reason = await LLMStructuringService.structure_intake_narrative(
            patient_id=patient_id,
            age=req.age,
            gender=req.gender,
            preferred_language=req.preferredLanguage,
            raw_symptoms=req.symptoms,
            voice_transcript=voice_text,
            ocr_text=ocr_text,
            translated_text=translated_text
        )

        # 5. Build PatientCase model
        modalities = req.inputModalities or ["text"]
        if req.voiceData and "voice" not in modalities:
            modalities.append("voice")
        if req.ocrReports:
            for r in req.ocrReports:
                mod = "ocr_pdf" if r.fileType == "pdf" else "ocr_image"
                if mod not in modalities:
                    modalities.append(mod)

        case = PatientCase(
            id=case_id,
            patient_id=patient_id,
            age=req.age,
            gender=req.gender,
            preferred_language=req.preferredLanguage,
            raw_symptoms=req.symptoms,
            consent_given=req.consentGiven,
            created_at=utc_now_iso(),
            input_modalities=json.dumps(modalities),
            voice_data=json.dumps(req.voiceData.model_dump()) if req.voiceData else None,
            ocr_reports=json.dumps([r.model_dump() for r in req.ocrReports]) if req.ocrReports else None,
            multilingual_data=json.dumps(req.multilingualData.model_dump()) if req.multilingualData else None,
            processor_used="Fallback_Deterministic_Processor" if is_fallback else "AI_Triage_V3",
            is_fallback_used=is_fallback,
            fallback_reason=fallback_reason if is_fallback else None,
            extracted_symptoms=json.dumps(advisory_note.extracted_symptoms),
            timeline=json.dumps([t.model_dump() for t in advisory_note.timeline]),
            missing_information=json.dumps(advisory_note.missing_information),
            follow_up_questions=json.dumps(advisory_note.follow_up_questions),
            urgency_signals=json.dumps([s.model_dump() for s in safety_signals]),
            ai_summary=advisory_note.ai_summary,
            review_status="awaiting_nursing_triage"
        )

        db.add(case)
        await db.commit()
        await db.refresh(case)

        # 6. Audit Trail Logging
        await AuditService.log_event(
            db=db,
            case_id=case_id,
            actor=actor,
            role=role,
            provenance="PATIENT",
            action="CASE_CREATED",
            details=f"Intake registered for patient {patient_id} with {len(modalities)} input modalities."
        )

        if is_fallback:
            await AuditService.log_event(
                db=db,
                case_id=case_id,
                actor="Deterministic Fallback Engine",
                role="SYSTEM",
                provenance="SYSTEM",
                action="FALLBACK_ACTIVATED",
                details=f"Fallback structuring activated: {fallback_reason}"
            )
        else:
            await AuditService.log_event(
                db=db,
                case_id=case_id,
                actor="AI Structuring Engine",
                role="SYSTEM",
                provenance="AI_ADVISORY",
                action="STRUCTURED_NOTE_GENERATED",
                details="Synthesized non-diagnostic structured advisory note."
            )

        if safety_signals:
            await AuditService.log_event(
                db=db,
                case_id=case_id,
                actor="Deterministic Safety Rules Engine",
                role="SYSTEM",
                provenance="SYSTEM",
                action="SAFETY_SIGNALS_FLAGGED",
                details=f"Identified {len(safety_signals)} deterministic review signals."
            )

        return case
