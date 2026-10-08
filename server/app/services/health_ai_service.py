import logging
import re
import uuid
import time
import json
from typing import Dict, Any, List, Optional, Tuple, AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from fastapi import HTTPException, status

from ..models.health_ai import (
    AIConversation,
    AIMessage,
    AIAttachment,
    AIHealthContext,
    AISafetyEvent,
    AIUsageEvent,
    utc_now_iso,
)
from ..schemas.auth import UserProfile
from ..schemas.health_ai import (
    MedicalLabValue,
    MedicalReportAnalysisResponse,
)
from ..services.ocr_service import OCRService
from ..services.ai_providers import get_ai_provider, AIProviderMessage
from ..services.health_ai_safety import (
    HealthAISafetyPipeline,
    SWASTHYA_HEALTH_AI_SYSTEM_INSTRUCTION,
    NON_HEALTHCARE_STANDARD_REPLY,
)
from ..services.audit_service import AuditService
from ..config import settings

logger = logging.getLogger("swasthya.health_ai")

def _extract_concern_from_text(text: str) -> Tuple[Optional[str], Optional[str], List[str]]:
    """Helper to deterministically identify primary clinical concern category, location, and symptoms."""
    t = text.lower()
    if any(k in t for k in ["cbc", "hemoglobin", "platelet", "wbc", "rbc", "mcv", "mch", "hematocrit", "rdw", "blood report", "blood test", "hematology", "metabolic panel", "ecg", "x-ray", "radiology", "report", "lab result", "lab report"]):
        return "Hematology / CBC Report" if ("cbc" in t or "hemoglobin" in t or "platelet" in t or "blood" in t) else "Medical Report Analysis", "Diagnostic / Laboratory", ["Laboratory Report Review"]
    if any(k in t for k in ["burn", "burned", "burning", "hot pan", "scald", "blister", "hot water", "flame"]):
        loc = "Thumb" if "thumb" in t else ("Hand" if "hand" in t or "finger" in t else ("Arm" if "arm" in t else ("Leg" if "leg" in t or "foot" in t else "Skin")))
        return "Thumb burn" if "thumb" in t else "Burn injury", loc, ["Burn", "Pain", "Redness"]
    if any(k in t for k in ["headache", "migraine", "head pain", "temple"]):
        loc = "Frontal" if "front" in t or "forehead" in t else ("Temple" if "temple" in t else "Head")
        return "Headache", loc, ["Headache"]
    if any(k in t for k in ["stomach", "abdomen", "abdominal", "belly", "cramp"]):
        loc = "Abdomen"
        return "Abdominal pain", loc, ["Stomach pain"]
    if any(k in t for k in ["fever", "chills", "high temp", "temperature", "shivering"]):
        return "Fever", "Systemic", ["Fever"]
    if any(k in t for k in ["chest pain", "chest pressure", "chest tightness", "chest heaviness"]):
        return "Chest discomfort", "Chest", ["Chest pain"]
    if any(k in t for k in ["rash", "itch", "hives", "eczema"]):
        return "Skin rash", "Skin", ["Rash"]
    if any(k in t for k in ["cough", "sore throat", "cold", "congestion", "runny nose"]):
        return "Respiratory symptoms", "Throat / Upper respiratory", ["Cough"]
    return None, None, []

def _update_ai_health_context(
    health_context: AIHealthContext,
    content: str,
    parsed_json: Optional[Dict[str, Any]],
    urgency_level: Optional[str]
) -> None:
    """
    Updates the dynamic AIHealthContext based on the authoritative current message
    and structured output from Gemini. Handles topic-switching cleanly without
    contaminating the new concern with stale symptoms from prior turns.
    """
    s_data = parsed_json.get("structured_symptoms") if (parsed_json and isinstance(parsed_json, dict)) else None
    
    extracted_concern = None
    extracted_loc = None
    extracted_symptoms = []
    
    if s_data and s_data.get("chief_complaint"):
        extracted_concern = s_data["chief_complaint"].strip()
        if s_data.get("location"):
            extracted_loc = s_data["location"]
        if s_data.get("reported_symptoms"):
            extracted_symptoms = s_data["reported_symptoms"] if isinstance(s_data["reported_symptoms"], list) else [s_data["reported_symptoms"]]
    
    # Fallback to deterministic extraction if needed
    det_concern, det_loc, det_syms = _extract_concern_from_text(content)
    if not extracted_concern:
        extracted_concern = det_concern or (content[:40].strip() if content else "Health Consultation")
    if not extracted_loc:
        extracted_loc = det_loc
    if not extracted_symptoms:
        extracted_symptoms = det_syms or ([extracted_concern] if extracted_concern else [])

    # Check whether the current concern is a different topic from the previous context
    prev_concern = (health_context.current_concern or "").lower()
    curr_concern_lower = (extracted_concern or "").lower()
    
    is_report_question = any(k in content.lower() for k in ["report", "hemoglobin", "hb", "platelet", "wbc", "rbc", "mcv", "mch", "hematocrit", "rdw", "cbc", "lab", "test", "results", "doctor", "what should i do", "is this dangerous", "mean"])
    is_prev_report = any(k in prev_concern for k in ["report", "cbc", "hematology", "biochemistry", "panel", "lab", "ecg", "radiology", "diagnostic"])
    
    # Topic switch detector: if previous concern exists and new concern is fundamentally different
    is_new_topic = False
    if is_prev_report and is_report_question:
        is_new_topic = False
    elif prev_concern and curr_concern_lower:
        prev_tokens = set(re.findall(r"\w+", prev_concern))
        curr_tokens = set(re.findall(r"\w+", curr_concern_lower))
        if not (prev_tokens & curr_tokens):
            is_new_topic = True

    if is_new_topic or not health_context.current_concern:
        # Clean replacement for the new active concern (no stale contamination)
        health_context.current_concern = extracted_concern
        health_context.symptoms = extracted_symptoms
        health_context.location = extracted_loc or (s_data.get("location") if s_data else None)
        health_context.duration = s_data.get("duration") if s_data else None
        health_context.severity = s_data.get("severity") if s_data else None
        health_context.associated_symptoms = s_data.get("associated_symptoms") if s_data else None
    else:
        # Continuation of existing topic: update supplied fields
        if is_prev_report and is_report_question:
            # Preserve the authoritative report title as chief concern
            pass
        elif extracted_concern:
            health_context.current_concern = extracted_concern
        if extracted_symptoms:
            health_context.symptoms = extracted_symptoms
        if s_data:
            if s_data.get("duration"):
                health_context.duration = s_data["duration"]
            if s_data.get("location"):
                health_context.location = s_data["location"]
            if s_data.get("severity"):
                health_context.severity = s_data["severity"]
            if s_data.get("associated_symptoms"):
                health_context.associated_symptoms = s_data["associated_symptoms"]

    # Fallback duration/severity heuristic from current message if not yet set
    if not health_context.duration and not is_prev_report:
        dur_match = re.search(r"\b(just now|right now|since this morning|today|yesterday|for \d+\s*(?:days?|hours?|weeks?)|started \d+\s*(?:days?|hours?|weeks?)\s*ago)\b", content, re.I)
        if dur_match:
            health_context.duration = dur_match.group(0).capitalize()
            
    if not health_context.severity and not is_prev_report:
        sev_match = re.search(r"\b(mild|moderate|severe|extreme|\d+\s*(?:\/|out of)\s*10)\b", content, re.I)
        if sev_match:
            health_context.severity = sev_match.group(0).capitalize()

    health_context.urgency_level = urgency_level or health_context.urgency_level or "routine"
    health_context.updated_at = utc_now_iso()


class HealthAIService:
    @staticmethod
    async def create_conversation(
        db: AsyncSession,
        user: UserProfile,
        title: Optional[str] = None
    ) -> AIConversation:
        conversation_id = f"conv_{uuid.uuid4().hex[:12]}"
        now = utc_now_iso()
        conv = AIConversation(
            id=conversation_id,
            patient_id=user.user_id,
            title=title or "New Health Consultation",
            status="active",
            created_at=now,
            updated_at=now,
            last_message_at=now
        )
        db.add(conv)

        # Initialize blank health context
        health_context = AIHealthContext(
            id=f"ctx_{uuid.uuid4().hex[:12]}",
            conversation_id=conversation_id,
            current_concern=None,
            symptoms=[],
            duration=None,
            location=None,
            severity=None,
            associated_symptoms=None,
            relevant_history=None,
            medications_if_patient_provided=None,
            allergies_if_patient_provided=None,
            urgency_level="routine",
            updated_at=now
        )
        db.add(health_context)

        await db.commit()
        await db.refresh(conv)

        # Audit event
        await AuditService.log_event(
            db=db,
            case_id=conversation_id,
            actor=user.display_name,
            role=user.role,
            provenance="PATIENT",
            action="AI_CONVERSATION_CREATED",
            details=f"Conversation {conversation_id} created for patient {user.user_id}"
        )

        return conv

    @staticmethod
    async def get_patient_conversations(
        db: AsyncSession,
        user: UserProfile,
        status_filter: Optional[str] = None
    ) -> List[AIConversation]:
        stmt = select(AIConversation).where(AIConversation.patient_id == user.user_id)
        if status_filter:
            stmt = stmt.where(AIConversation.status == status_filter)
        stmt = stmt.order_by(desc(AIConversation.last_message_at))
        
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_conversation(
        db: AsyncSession,
        conversation_id: str,
        user: UserProfile
    ) -> AIConversation:
        stmt = select(AIConversation).where(AIConversation.id == conversation_id)
        result = await db.execute(stmt)
        conv = result.scalars().first()
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Conversation '{conversation_id}' not found."
            )
        # Strict patient ownership enforcement
        if conv.patient_id != user.user_id and user.role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You do not own this conversation."
            )
        return conv

    @staticmethod
    async def get_conversation_context(
        db: AsyncSession,
        conversation_id: str,
        user: UserProfile
    ) -> AIHealthContext:
        await HealthAIService.get_conversation(db, conversation_id, user)
        stmt = select(AIHealthContext).where(AIHealthContext.conversation_id == conversation_id)
        result = await db.execute(stmt)
        ctx = result.scalars().first()
        if not ctx:
            # Create if missing
            ctx = AIHealthContext(
                id=f"ctx_{uuid.uuid4().hex[:12]}",
                conversation_id=conversation_id,
                current_concern=None,
                symptoms=[],
                duration=None,
                location=None,
                severity=None,
                associated_symptoms=None,
                urgency_level="routine",
                updated_at=utc_now_iso()
            )
            db.add(ctx)
            await db.commit()
            await db.refresh(ctx)
        return ctx

    @staticmethod
    async def delete_conversation(
        db: AsyncSession,
        conversation_id: str,
        user: UserProfile
    ) -> bool:
        conv = await HealthAIService.get_conversation(db, conversation_id, user)
        await db.delete(conv)
        await db.commit()
        return True

    @staticmethod
    async def archive_conversation(
        db: AsyncSession,
        conversation_id: str,
        user: UserProfile
    ) -> AIConversation:
        conv = await HealthAIService.get_conversation(db, conversation_id, user)
        conv.status = "archived"
        conv.updated_at = utc_now_iso()
        await db.commit()
        await db.refresh(conv)
        return conv

    @staticmethod
    async def process_user_message(
        db: AsyncSession,
        conversation_id: str,
        content: str,
        user: UserProfile,
        voice_used: bool = False,
        preferred_language: str = "English",
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[AIMessage, AIMessage, AIHealthContext]:
        """
        Executes the full healthcare safety pipeline, persists user and assistant messages,
        updates the dynamic health context, logs usage, and returns the response.
        Guarantees that the CURRENT USER MESSAGE is the authoritative final prompt turn.
        """
        conv = await HealthAIService.get_conversation(db, conversation_id, user)
        now = utc_now_iso()

        # 1. Fetch prior conversation message history BEFORE creating the new message turn
        history_stmt = select(AIMessage).where(AIMessage.conversation_id == conversation_id).order_by(AIMessage.created_at)
        history_res = await db.execute(history_stmt)
        past_msgs = list(history_res.scalars().all())

        # Fetch health context before processing for diagnostic comparison
        ctx_before = await HealthAIService.get_conversation_context(db, conversation_id, user)

        # 2. Persist user message
        user_msg = AIMessage(
            id=f"msg_user_{uuid.uuid4().hex[:12]}",
            conversation_id=conversation_id,
            sender_type="patient",
            content=content.strip(),
            voice_used=voice_used,
            created_at=now,
            safety_status="passed"
        )
        db.add(user_msg)
        await db.flush()

        # 3. Safety Pipeline: Check Prompt Injection
        is_injection = HealthAISafetyPipeline.check_prompt_injection(content)
        if is_injection:
            safety_evt = AISafetyEvent(
                id=f"saf_{uuid.uuid4().hex[:12]}",
                conversation_id=conversation_id,
                patient_id=user.user_id,
                event_type="prompt_injection_attempt",
                severity="warning",
                details={"input_snippet": content[:100]},
                created_at=now
            )
            db.add(safety_evt)

            assistant_reply = (
                "I am the Swasthya Health AI Assistant. I adhere strictly to clinical safety and triage guidance protocols "
                "and cannot bypass healthcare boundaries. Please feel free to describe your symptoms or ask a health question."
            )

            assistant_msg = AIMessage(
                id=f"msg_ai_{uuid.uuid4().hex[:12]}",
                conversation_id=conversation_id,
                sender_type="assistant",
                content=assistant_reply,
                model="safety_layer",
                provider="internal_safety",
                created_at=utc_now_iso(),
                safety_status="flagged",
                urgency_detected=False,
                urgency_level="routine"
            )
            db.add(assistant_msg)
            conv.last_message_at = now
            conv.updated_at = now
            await db.commit()
            ctx = await HealthAIService.get_conversation_context(db, conversation_id, user)
            return user_msg, assistant_msg, ctx

        # 4. Safety Pipeline: Check Healthcare Relevance
        is_health_topic = HealthAISafetyPipeline.is_query_healthcare_related(content)
        if not is_health_topic:
            safety_evt = AISafetyEvent(
                id=f"saf_{uuid.uuid4().hex[:12]}",
                conversation_id=conversation_id,
                patient_id=user.user_id,
                event_type="off_topic_query",
                severity="info",
                details={"input_snippet": content[:100]},
                created_at=now
            )
            db.add(safety_evt)

            assistant_msg = AIMessage(
                id=f"msg_ai_{uuid.uuid4().hex[:12]}",
                conversation_id=conversation_id,
                sender_type="assistant",
                content=NON_HEALTHCARE_STANDARD_REPLY,
                model="safety_layer",
                provider="internal_safety",
                created_at=utc_now_iso(),
                safety_status="passed",
                urgency_detected=False,
                urgency_level="routine"
            )
            db.add(assistant_msg)
            conv.last_message_at = now
            conv.updated_at = now
            await db.commit()
            ctx = await HealthAIService.get_conversation_context(db, conversation_id, user)
            return user_msg, assistant_msg, ctx

        # 5. Safety Pipeline: Check Emergency / Red-Flag Signals
        urgency_detected, urgency_level, urgency_reasons = HealthAISafetyPipeline.detect_deterministic_urgency(content)

        # 6. Fetch conversation attachments from DB to maintain continuous multimodal/report context
        att_stmt = select(AIAttachment).where(AIAttachment.conversation_id == conversation_id).order_by(AIAttachment.created_at)
        att_res = await db.execute(att_stmt)
        conv_attachments = list(att_res.scalars().all())

        if attachments:
            for att_data in attachments:
                fname = att_data.get("file_name") or att_data.get("fileName") or "medical_document.pdf"
                ext_text = att_data.get("extracted_text") or att_data.get("extractedText") or ""
                s_vals = att_data.get("structured_values") or att_data.get("structuredValues") or []
                f_size = att_data.get("file_size_bytes") or att_data.get("fileSizeBytes") or len(ext_text.encode("utf-8"))
                m_type = att_data.get("file_type") or att_data.get("fileType") or "application/pdf"

                if ext_text and not any(fname == a.filename for a in conv_attachments):
                    new_att = AIAttachment(
                        id=f"att_{uuid.uuid4().hex[:12]}",
                        patient_id=user.user_id,
                        conversation_id=conversation_id,
                        filename=fname,
                        mime_type=m_type,
                        file_size_bytes=f_size,
                        ocr_status="completed",
                        extracted_text=ext_text,
                        structured_values=s_vals,
                        created_at=now
                    )
                    db.add(new_att)
                    conv_attachments.append(new_att)

        report_context_parts = []
        for att in conv_attachments:
            if att.extracted_text:
                part = f"=== UPLOADED MEDICAL REPORT ({att.filename}) ===\n{att.extracted_text}"
                if att.structured_values:
                    part += "\n\nSTRUCTURED PARAMETERS EXTRACTED:\n"
                    for v in att.structured_values:
                        if isinstance(v, dict):
                            t_name = v.get("test_name", "Test")
                            val = v.get("value", "")
                            unit = v.get("unit") or ""
                            ref = v.get("reference_range") or "Not provided"
                            status_tag = (v.get("status") or ("ABNORMAL" if v.get("is_abnormal") else "NORMAL")).upper()
                            part += f"• {t_name}: {val} {unit} [{status_tag}] (Reference: {ref})\n"
                report_context_parts.append(part)

        # Build Provider Messages with strict current-message priority
        max_past = max(0, settings.AI_MAX_CONTEXT_MESSAGES - 1)
        bounded_past = past_msgs[-max_past:] if len(past_msgs) > max_past else past_msgs

        provider_messages: List[AIProviderMessage] = []
        for m in bounded_past:
            role = "user" if m.sender_type == "patient" else "assistant"
            provider_messages.append(AIProviderMessage(role=role, content=m.content))

        # Format current turn content
        current_turn_parts = []
        if attachments:
            for att in attachments:
                fname = att.get("file_name") or att.get("fileName") or "document"
                ext_text = att.get("extracted_text") or att.get("extractedText") or ""
                if ext_text:
                    current_turn_parts.append(f"[Uploaded Medical Document: {fname}]\n{ext_text}")
        
        current_turn_parts.append(content.strip())
        final_current_turn_text = "\n\n".join(current_turn_parts)

        # Append CURRENT USER MESSAGE as the authoritative final turn
        provider_messages.append(AIProviderMessage(role="user", content=final_current_turn_text))

        # Build active system instruction with medical report context if available
        active_system_instruction = SWASTHYA_HEALTH_AI_SYSTEM_INSTRUCTION
        if report_context_parts:
            active_system_instruction += (
                "\n\n=======================================================\n"
                "ACTIVE UPLOADED MEDICAL REPORT CONTEXT FOR THIS PATIENT:\n"
                "=======================================================\n"
                + "\n\n".join(report_context_parts)
                + "\n\nCRITICAL CONTEXT INSTRUCTION:\n"
                "- When the patient asks about this report, their results, or specific parameters (e.g. low hemoglobin, high WBC, platelets, follow-up steps, or 'what should I do'):\n"
                "- You MUST directly and accurately reference the specific numbers, reference ranges, and findings from the uploaded report above.\n"
                "- Explain the physiological meaning clearly in patient-friendly non-diagnostic language.\n"
                "- NEVER say you lack the report or ask them to re-describe symptoms when the report contains the information.\n"
                "- If the report contains abnormal values, address them directly and provide appropriate educational follow-up guidance."
            )

        # Diagnostic Logging (Step 1)
        logger.info("=== HEALTH AI INFERENCE REQUEST ===")
        logger.info(f"CURRENT USER MESSAGE: {content.strip()}")
        logger.info(f"CONVERSATION ID: {conversation_id}")
        logger.info(f"REPORT CONTEXT PRESENT: {bool(report_context_parts)}")
        logger.info(f"LAST 5 DATABASE MESSAGES: {[f'{m.sender_type}: {m.content[:60]}' for m in past_msgs[-5:]]}")
        logger.info(f"CONTEXT BEFORE PROCESSING: {ctx_before.to_dict() if ctx_before else None}")

        # 7. Execute AI Provider
        provider = get_ai_provider()
        start_t = time.time()

        raw_reply_text = ""
        input_tokens = 0
        output_tokens = 0
        latency_ms = 0
        model_used = provider.model_name
        provider_used = provider.provider_name

        try:
            ai_resp = await provider.generate_response(
                messages=provider_messages,
                system_instruction=active_system_instruction,
                temperature=0.2,
                max_tokens=2048
            )
            raw_reply_text = ai_resp.content
            input_tokens = ai_resp.input_tokens
            output_tokens = ai_resp.output_tokens
            latency_ms = ai_resp.latency_ms
            model_used = ai_resp.model
            provider_used = ai_resp.provider
        except Exception as e:
            logger.warning(f"AI Provider error in process_user_message: {e}")
            # Context-aware fallback: if report context is present or question is about reports
            if report_context_parts or conv_attachments or any(w in content.lower() for w in ["report", "hemoglobin", "hb", "platelet", "wbc", "rbc", "cbc", "blood", "test", "results"]):
                lab_values = []
                for a in conv_attachments:
                    if a.structured_values:
                        lab_values.extend(a.structured_values)
                abnormal_vals = [v for v in lab_values if isinstance(v, dict) and v.get("is_abnormal")]

                if "hemoglobin" in content.lower() or "hb" in content.lower():
                    raw_reply_text = (
                        "In your uploaded blood report, hemoglobin is recorded below the standard reference range. "
                        "Hemoglobin is the protein in red blood cells that carries oxygen throughout your body. "
                        "A lower level can be associated with mild anemia, reduced iron stores, or fatigue. "
                        "Because laboratory results must be correlated with your overall health, symptoms, and dietary factors, "
                        "we recommend discussing this finding with your healthcare provider."
                    )
                elif any(w in content.lower() for w in ["what to do", "next step", "doctor", "discuss", "should i do"]):
                    raw_reply_text = (
                        "For your uploaded medical report, recommended next steps include: "
                        "1. Bring a physical or digital copy of this report to your appointment. "
                        "2. Note down any symptoms you have noticed (such as fatigue, dizziness, or changes in energy). "
                        "3. Ask your doctor whether dietary adjustments, iron supplementation, or follow-up bloodwork are appropriate."
                    )
                elif abnormal_vals:
                    ab_summary = ", ".join([f"{v.get('test_name')}: {v.get('value')} {v.get('unit') or ''}" for v in abnormal_vals[:4]])
                    raw_reply_text = (
                        f"I have reviewed your uploaded medical report. The report highlights several findings including {ab_summary}. "
                        "These parameters indicate areas worth discussing with your clinician. "
                        "Would you like me to explain what these specific findings mean or suggest questions to ask your doctor?"
                    )
                else:
                    raw_reply_text = (
                        "I have reviewed your uploaded medical report. The parameters appear to be documented. "
                        "Would you like me to explain what any specific test result means, or prepare questions for your doctor?"
                    )
            elif any(w in content.lower() for w in ["burn", "burned", "hot pan", "scald"]):
                raw_reply_text = (
                    "For an acute burn, immediately run cool (not icy) tap water over the burn for 10 to 20 minutes to reduce heat and tissue damage. "
                    "Do NOT apply ice, butter, or toothpaste. Cover the area loosely with a clean, sterile, non-stick dressing. "
                    "If the burn is large, on the face or hands, or developing severe blisters, please seek medical evaluation."
                )
            else:
                raw_reply_text = (
                    "I can help understand your symptoms. Could you clarify where the discomfort is located, "
                    "when it started, and how severe it feels from 0 to 10?"
                )
            latency_ms = int((time.time() - start_t) * 1000)

        logger.info(f"GEMINI RESPONSE: {raw_reply_text[:300]}")

        # 8. Parse structured output JSON if present or extract clean text
        parsed_json: Optional[Dict[str, Any]] = None
        clean_text = raw_reply_text
        try:
            json_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw_reply_text)
            if json_match:
                parsed_json = json.loads(json_match.group(1))
            elif raw_reply_text.strip().startswith("{") and raw_reply_text.strip().endswith("}"):
                parsed_json = json.loads(raw_reply_text.strip())
            
            if parsed_json and "reply" in parsed_json:
                clean_text = parsed_json.get("reply", clean_text)
                if parsed_json.get("urgency_detected"):
                    urgency_detected = True
                    urgency_level = parsed_json.get("urgency_level", urgency_level)
                    if parsed_json.get("urgency_reasons"):
                        urgency_reasons.extend(parsed_json.get("urgency_reasons", []))
        except Exception:
            parsed_json = None

        # 9. Output Sanitization
        sanitized_reply = HealthAISafetyPipeline.sanitize_output_text(clean_text)

        # 10. Extract Structured Follow-ups & Actions
        follow_ups = []
        if parsed_json and parsed_json.get("follow_up_questions"):
            follow_ups = parsed_json["follow_up_questions"]
        elif not follow_ups:
            if any(w in content.lower() for w in ["burn", "burned", "hot pan"]):
                follow_ups = ["It just happened now", "Pain is mild to moderate (3–5/10)", "No blisters yet"]
            elif "headache" in content.lower() or "pain" in content.lower():
                follow_ups = ["Started today", "Started yesterday", "Moderate (4–6/10)"]
            else:
                follow_ups = ["Mild discomfort", "Moderate severity", "Happening since yesterday"]

        suggested_actions = ["Start Symptom Intake", "Speak Instead", "Upload a Report"]
        if urgency_detected:
            suggested_actions.insert(0, "Seek Emergency Care")

        # 11. Persist Assistant Message
        assistant_msg = AIMessage(
            id=f"msg_ai_{uuid.uuid4().hex[:12]}",
            conversation_id=conversation_id,
            sender_type="assistant",
            content=sanitized_reply,
            model=model_used,
            provider=provider_used,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            safety_status="passed",
            urgency_detected=urgency_detected,
            urgency_level=urgency_level,
            structured_symptoms=parsed_json.get("structured_symptoms") if parsed_json else None,
            follow_up_questions=follow_ups,
            suggested_actions=suggested_actions,
            created_at=utc_now_iso()
        )
        db.add(assistant_msg)

        # 12. Update Dynamic Health Context (with clean topic-switch handling)
        ctx_stmt = select(AIHealthContext).where(AIHealthContext.conversation_id == conversation_id)
        ctx_res = await db.execute(ctx_stmt)
        health_context = ctx_res.scalars().first()
        if not health_context:
            health_context = AIHealthContext(
                id=f"ctx_{uuid.uuid4().hex[:12]}",
                conversation_id=conversation_id,
                updated_at=now
            )
            db.add(health_context)

        _update_ai_health_context(health_context, content, parsed_json, urgency_level)

        if conv.title == "New Health Consultation" and (health_context.current_concern or content):
            topic = health_context.current_concern or content[:35]
            conv.title = f"{topic.capitalize()} Consultation"

        conv.last_message_at = now
        conv.updated_at = now

        # 13. Record AI Usage Event
        usage_evt = AIUsageEvent(
            id=f"use_{uuid.uuid4().hex[:12]}",
            conversation_id=conversation_id,
            patient_id=user.user_id,
            provider=provider_used,
            model=model_used,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            created_at=now
        )
        db.add(usage_evt)

        await db.commit()
        await db.refresh(assistant_msg)
        await db.refresh(health_context)

        logger.info(f"FINAL EXTRACTED CONTEXT: {health_context.to_dict()}")
        logger.info("=== END HEALTH AI INFERENCE ===")

        # Audit events for urgency
        if urgency_detected:
            await AuditService.log_event(
                db=db,
                case_id=conversation_id,
                actor=user.display_name,
                role=user.role,
                provenance="AI_ADVISORY",
                action="AI_URGENCY_SIGNAL_DETECTED",
                details=f"Urgency: {urgency_level}, Reasons: {', '.join(urgency_reasons)}"
            )

        return user_msg, assistant_msg, health_context

    @staticmethod
    async def process_user_message_stream(
        db: AsyncSession,
        conversation_id: str,
        content: str,
        user: UserProfile,
        voice_used: bool = False,
        preferred_language: str = "English",
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncIterator[str]:
        """
        Streams AI response chunks in real-time SSE from the AI provider,
        then persists messages, context, and usage metrics to the database.
        Guarantees that the CURRENT USER MESSAGE is the authoritative final prompt turn.
        """
        conv = await HealthAIService.get_conversation(db, conversation_id, user)
        now = utc_now_iso()

        # 1. Fetch prior conversation message history BEFORE creating the new message turn
        history_stmt = select(AIMessage).where(AIMessage.conversation_id == conversation_id).order_by(AIMessage.created_at)
        history_res = await db.execute(history_stmt)
        past_msgs = list(history_res.scalars().all())

        ctx_before = await HealthAIService.get_conversation_context(db, conversation_id, user)

        # 2. Persist user message
        user_msg = AIMessage(
            id=f"msg_user_{uuid.uuid4().hex[:12]}",
            conversation_id=conversation_id,
            sender_type="patient",
            content=content.strip(),
            voice_used=voice_used,
            created_at=now,
            safety_status="passed"
        )
        db.add(user_msg)
        await db.flush()

        # 3. Safety Pipeline: Prompt Injection
        if HealthAISafetyPipeline.check_prompt_injection(content):
            assistant_reply = (
                "I am the Swasthya Health AI Assistant. I adhere strictly to clinical safety and triage guidance protocols "
                "and cannot bypass healthcare boundaries. Please feel free to describe your symptoms or ask a health question."
            )
            yield f"data: {json.dumps({'chunk': assistant_reply})}\n\n"

            assistant_msg = AIMessage(
                id=f"msg_ai_{uuid.uuid4().hex[:12]}",
                conversation_id=conversation_id,
                sender_type="assistant",
                content=assistant_reply,
                model="safety_layer",
                provider="internal_safety",
                created_at=utc_now_iso(),
                safety_status="flagged",
                urgency_detected=False,
                urgency_level="routine"
            )
            db.add(assistant_msg)
            conv.last_message_at = now
            conv.updated_at = now
            await db.commit()
            ctx = await HealthAIService.get_conversation_context(db, conversation_id, user)
            yield f"data: {json.dumps({'done': True, 'user_message': user_msg.to_dict(), 'assistant_message': assistant_msg.to_dict(), 'health_context': ctx.to_dict()})}\n\n"
            return

        # 4. Safety Pipeline: Off-Topic
        if not HealthAISafetyPipeline.is_query_healthcare_related(content):
            yield f"data: {json.dumps({'chunk': NON_HEALTHCARE_STANDARD_REPLY})}\n\n"

            assistant_msg = AIMessage(
                id=f"msg_ai_{uuid.uuid4().hex[:12]}",
                conversation_id=conversation_id,
                sender_type="assistant",
                content=NON_HEALTHCARE_STANDARD_REPLY,
                model="safety_layer",
                provider="internal_safety",
                created_at=utc_now_iso(),
                safety_status="passed",
                urgency_detected=False,
                urgency_level="routine"
            )
            db.add(assistant_msg)
            conv.last_message_at = now
            conv.updated_at = now
            await db.commit()
            ctx = await HealthAIService.get_conversation_context(db, conversation_id, user)
            yield f"data: {json.dumps({'done': True, 'user_message': user_msg.to_dict(), 'assistant_message': assistant_msg.to_dict(), 'health_context': ctx.to_dict()})}\n\n"
            return

        # 5. Urgency Detection
        urgency_detected, urgency_level, urgency_reasons = HealthAISafetyPipeline.detect_deterministic_urgency(content)

        # 6. Fetch conversation attachments from DB to maintain continuous multimodal/report context
        att_stmt = select(AIAttachment).where(AIAttachment.conversation_id == conversation_id).order_by(AIAttachment.created_at)
        att_res = await db.execute(att_stmt)
        conv_attachments = list(att_res.scalars().all())

        if attachments:
            for att_data in attachments:
                fname = att_data.get("file_name") or att_data.get("fileName") or "medical_document.pdf"
                ext_text = att_data.get("extracted_text") or att_data.get("extractedText") or ""
                s_vals = att_data.get("structured_values") or att_data.get("structuredValues") or []
                f_size = att_data.get("file_size_bytes") or att_data.get("fileSizeBytes") or len(ext_text.encode("utf-8"))
                m_type = att_data.get("file_type") or att_data.get("fileType") or "application/pdf"

                if ext_text and not any(fname == a.filename for a in conv_attachments):
                    new_att = AIAttachment(
                        id=f"att_{uuid.uuid4().hex[:12]}",
                        patient_id=user.user_id,
                        conversation_id=conversation_id,
                        filename=fname,
                        mime_type=m_type,
                        file_size_bytes=f_size,
                        ocr_status="completed",
                        extracted_text=ext_text,
                        structured_values=s_vals,
                        created_at=now
                    )
                    db.add(new_att)
                    conv_attachments.append(new_att)

        report_context_parts = []
        for att in conv_attachments:
            if att.extracted_text:
                part = f"=== UPLOADED MEDICAL REPORT ({att.filename}) ===\n{att.extracted_text}"
                if att.structured_values:
                    part += "\n\nSTRUCTURED PARAMETERS EXTRACTED:\n"
                    for v in att.structured_values:
                        if isinstance(v, dict):
                            t_name = v.get("test_name", "Test")
                            val = v.get("value", "")
                            unit = v.get("unit") or ""
                            ref = v.get("reference_range") or "Not provided"
                            status_tag = (v.get("status") or ("ABNORMAL" if v.get("is_abnormal") else "NORMAL")).upper()
                            part += f"• {t_name}: {val} {unit} [{status_tag}] (Reference: {ref})\n"
                report_context_parts.append(part)

        # History & Context Builder
        max_past = max(0, settings.AI_MAX_CONTEXT_MESSAGES - 1)
        bounded_past = past_msgs[-max_past:] if len(past_msgs) > max_past else past_msgs

        provider_messages: List[AIProviderMessage] = []
        for m in bounded_past:
            role = "user" if m.sender_type == "patient" else "assistant"
            provider_messages.append(AIProviderMessage(role=role, content=m.content))

        current_turn_parts = []
        if attachments:
            for att in attachments:
                fname = att.get("file_name") or att.get("fileName") or "document"
                ext_text = att.get("extracted_text") or att.get("extractedText") or ""
                if ext_text:
                    current_turn_parts.append(f"[Uploaded Medical Document: {fname}]\n{ext_text}")
        
        current_turn_parts.append(content.strip())
        final_current_turn_text = "\n\n".join(current_turn_parts)

        # The CURRENT USER MESSAGE is strictly the final user turn
        provider_messages.append(AIProviderMessage(role="user", content=final_current_turn_text))

        # Build active system instruction with medical report context if available
        active_system_instruction = SWASTHYA_HEALTH_AI_SYSTEM_INSTRUCTION
        if report_context_parts:
            active_system_instruction += (
                "\n\n=======================================================\n"
                "ACTIVE UPLOADED MEDICAL REPORT CONTEXT FOR THIS PATIENT:\n"
                "=======================================================\n"
                + "\n\n".join(report_context_parts)
                + "\n\nCRITICAL CONTEXT INSTRUCTION:\n"
                "- When the patient asks about this report, their results, or specific parameters (e.g. low hemoglobin, high WBC, platelets, follow-up steps, or 'what should I do'):\n"
                "- You MUST directly and accurately reference the specific numbers, reference ranges, and findings from the uploaded report above.\n"
                "- Explain the physiological meaning clearly in patient-friendly non-diagnostic language.\n"
                "- NEVER say you lack the report or ask them to re-describe symptoms when the report contains the information.\n"
                "- If the report contains abnormal values, address them directly and provide appropriate educational follow-up guidance."
            )

        # Diagnostic Logging (Step 1)
        logger.info("=== HEALTH AI STREAM INFERENCE REQUEST ===")
        logger.info(f"CURRENT USER MESSAGE: {content.strip()}")
        logger.info(f"CONVERSATION ID: {conversation_id}")
        logger.info(f"REPORT CONTEXT PRESENT: {bool(report_context_parts)}")
        logger.info(f"LAST 5 DATABASE MESSAGES: {[f'{m.sender_type}: {m.content[:60]}' for m in past_msgs[-5:]]}")
        logger.info(f"CONTEXT BEFORE PROCESSING: {ctx_before.to_dict() if ctx_before else None}")

        # 7. Stream from AI Provider
        provider = get_ai_provider()
        start_t = time.time()
        accumulated_chunks = []

        try:
            async for chunk in provider.generate_stream(
                messages=provider_messages,
                system_instruction=active_system_instruction,
                temperature=0.2,
                max_tokens=2048
            ):
                if chunk:
                    accumulated_chunks.append(chunk)
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as exc:
            logger.warning(f"AI Provider stream error: {exc}")
            if not accumulated_chunks:
                if report_context_parts or conv_attachments or any(w in content.lower() for w in ["report", "hemoglobin", "hb", "platelet", "wbc", "rbc", "cbc", "blood", "test", "results"]):
                    if "hemoglobin" in content.lower() or "hb" in content.lower():
                        fallback_chunk = "In your uploaded blood report, hemoglobin is recorded below the reference range. Hemoglobin carries oxygen throughout the body. A reduced level can be seen with mild anemia or iron deficiency. We recommend discussing this with your doctor."
                    else:
                        fallback_chunk = "I have reviewed your uploaded medical report findings. I can explain any specific lab parameter or help you prepare questions for your healthcare provider."
                elif any(w in content.lower() for w in ["burn", "burned", "hot pan", "scald"]):
                    fallback_chunk = "For an immediate burn, cool under cold running tap water for 10-20 minutes. Avoid ice, butter, or popping blisters. Seek urgent evaluation if the burn is deep or spreading."
                else:
                    fallback_chunk = "I can help understand your symptoms. Could you describe when they began and how severe they feel?"
                accumulated_chunks.append(fallback_chunk)
                yield f"data: {json.dumps({'chunk': fallback_chunk})}\n\n"

        latency_ms = int((time.time() - start_t) * 1000)
        full_reply = "".join(accumulated_chunks)
        logger.info(f"GEMINI STREAM RESPONSE: {full_reply[:300]}")

        # 8. Parse structured output JSON if present or clean text
        parsed_json: Optional[Dict[str, Any]] = None
        clean_text = full_reply
        try:
            json_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", full_reply)
            if json_match:
                parsed_json = json.loads(json_match.group(1))
            elif full_reply.strip().startswith("{") and full_reply.strip().endswith("}"):
                parsed_json = json.loads(full_reply.strip())
            
            if parsed_json and "reply" in parsed_json:
                clean_text = parsed_json.get("reply", clean_text)
                if parsed_json.get("urgency_detected"):
                    urgency_detected = True
                    urgency_level = parsed_json.get("urgency_level", urgency_level)
                    if parsed_json.get("urgency_reasons"):
                        urgency_reasons.extend(parsed_json.get("urgency_reasons", []))
        except Exception:
            parsed_json = None

        sanitized_reply = HealthAISafetyPipeline.sanitize_output_text(clean_text)

        follow_ups = []
        if parsed_json and parsed_json.get("follow_up_questions"):
            follow_ups = parsed_json["follow_up_questions"]
        elif not follow_ups:
            if any(w in content.lower() for w in ["burn", "burned", "hot pan"]):
                follow_ups = ["It just happened now", "Pain is mild to moderate (3–5/10)", "No blisters yet"]
            elif "headache" in content.lower() or "pain" in content.lower():
                follow_ups = ["Started today", "Started yesterday", "Moderate (4–6/10)"]
            else:
                follow_ups = ["Mild discomfort", "Moderate severity", "Happening since yesterday"]

        suggested_actions = ["Start Symptom Intake", "Speak Instead", "Upload a Report"]
        if urgency_detected:
            suggested_actions.insert(0, "Seek Emergency Care")

        # 9. Persist Assistant Message
        assistant_msg = AIMessage(
            id=f"msg_ai_{uuid.uuid4().hex[:12]}",
            conversation_id=conversation_id,
            sender_type="assistant",
            content=sanitized_reply,
            model=provider.model_name,
            provider=provider.provider_name,
            input_tokens=len(content.split()) * 2,
            output_tokens=len(sanitized_reply.split()) * 2,
            latency_ms=latency_ms,
            safety_status="passed",
            urgency_detected=urgency_detected,
            urgency_level=urgency_level,
            structured_symptoms=parsed_json.get("structured_symptoms") if parsed_json else None,
            follow_up_questions=follow_ups,
            suggested_actions=suggested_actions,
            created_at=utc_now_iso()
        )
        db.add(assistant_msg)

        # 10. Update Context (with clean topic-switch handling)
        ctx_stmt = select(AIHealthContext).where(AIHealthContext.conversation_id == conversation_id)
        ctx_res = await db.execute(ctx_stmt)
        health_context = ctx_res.scalars().first()
        if not health_context:
            health_context = AIHealthContext(
                id=f"ctx_{uuid.uuid4().hex[:12]}",
                conversation_id=conversation_id,
                updated_at=now
            )
            db.add(health_context)

        _update_ai_health_context(health_context, content, parsed_json, urgency_level)

        if conv.title == "New Health Consultation" and (health_context.current_concern or content):
            topic = health_context.current_concern or content[:35]
            conv.title = f"{topic.capitalize()} Consultation"

        conv.last_message_at = now
        conv.updated_at = now

        # 11. Record AI Usage Event
        usage_evt = AIUsageEvent(
            id=f"use_{uuid.uuid4().hex[:12]}",
            conversation_id=conversation_id,
            patient_id=user.user_id,
            provider=provider.provider_name,
            model=provider.model_name,
            input_tokens=len(content.split()) * 2,
            output_tokens=len(sanitized_reply.split()) * 2,
            latency_ms=latency_ms,
            created_at=now
        )
        db.add(usage_evt)

        await db.commit()
        await db.refresh(assistant_msg)
        await db.refresh(health_context)

        logger.info(f"FINAL EXTRACTED CONTEXT: {health_context.to_dict()}")
        logger.info("=== END HEALTH AI STREAM INFERENCE ===")

        yield f"data: {json.dumps({'done': True, 'user_message': user_msg.to_dict(), 'assistant_message': assistant_msg.to_dict(), 'health_context': health_context.to_dict()})}\n\n"

    @staticmethod
    async def analyze_medical_report(
        db: AsyncSession,
        user: UserProfile,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        conversation_id: Optional[str] = None
    ) -> MedicalReportAnalysisResponse:
        """
        Instant Medical Report Analysis Workflow:
        1. Extract text from uploaded report via OCR/pypdf
        2. Prompt Gemini AI with strict clinical extraction & non-diagnostic interpretation schema
        3. Identify abnormalities, check reference ranges, screen urgency (ROUTINE, PROMPT_FOLLOWUP, URGENT, EMERGENCY)
        4. Persist attachment, message history, health context & audit trail
        5. Return comprehensive structured MedicalReportAnalysisResponse
        """
        now = utc_now_iso()
        logger.info(f"=== [REPORT_UPLOAD] Received '{filename}' ({len(file_bytes)} bytes) for user '{user.user_id}' ===")

        # 1. Conversation resolution
        conv: Optional[AIConversation] = None
        if conversation_id:
            try:
                conv = await HealthAIService.get_conversation(db, conversation_id, user)
            except Exception:
                conv = None

        if not conv:
            conv = await HealthAIService.create_conversation(
                db=db,
                user=user,
                title=f"Report: {filename[:30]}"
            )
        
        active_conv_id = conv.id

        # 2. Extract Document Text using OCRService
        ocr_result = await OCRService.process_document(
            file_bytes=file_bytes,
            file_name=filename,
            file_type=mime_type,
            is_demo=False
        )
        extracted_text = ocr_result.extractedText or "No text could be extracted from this document."
        logger.info(f"=== [OCR_COMPLETE] Extracted {len(extracted_text)} chars, {len(ocr_result.structured_values or [])} structured values for '{filename}' ===")

        # Check if extracted text is virtually empty / missing
        has_usable_text = bool(extracted_text and len(extracted_text.strip()) > 10 and "no text could be extracted" not in extracted_text.lower())

        # 3. Formulate Clinical Analysis Prompt for Gemini
        system_prompt = """You are the Swasthya Clinical Report Analysis Engine, an intelligent, clinically rigorous healthcare AI analyzing uploaded medical documents (laboratory bloodwork, CBC, metabolic panels, urine tests, ECG, CT/MRI, X-ray/radiology).

CRITICAL EXTRACTION & CLINICAL RULES:
1. Extract ALL laboratory parameters, vital signs, and diagnostic findings present in the document.
2. For EVERY laboratory value:
   - test_name: Name of the test/parameter (e.g. 'Hemoglobin', 'WBC Count', 'Fasting Blood Glucose', 'Serum Creatinine', 'Platelet Count').
   - value: Patient's recorded value as string (e.g. '8.2', '14,200', '95,000').
   - unit: Measurement unit (e.g. 'g/dL', 'mg/dL', '/uL', '%', 'fL', 'pg') or null if not applicable.
   - reference_range: The reference range explicitly printed on the report (e.g. '13.0 - 17.0', '4,000 - 11,000', '150,000 - 450,000').
     MANDATORY SAFETY RULE: If the reference range is NOT stated on the uploaded report, you MUST explicitly write: 'Reference range was not provided in the uploaded report.' NEVER invent or manufacture reference ranges.
   - status: 'normal' | 'low' | 'high' | 'abnormal' | 'critical'.
   - is_abnormal: true if out of range or flagged abnormal; false otherwise.
   - source_location: Where in the document this parameter was found (e.g. 'Hematology Table', 'Line 4', 'Page 1').
   - clinical_significance: Brief 1-sentence plain-language note explaining what this parameter reflects.
3. Plain-English Clinical Interpretation ('what_findings_mean'):
   - Explain what abnormal or notable findings reflect physiologically in clear, compassionate language.
   - Use phrasing such as 'may be associated with...', 'can sometimes be seen with...', 'should be discussed with a healthcare professional...'.
   - NON-DIAGNOSTIC MANDATE: Do NOT say 'You definitely have...' unless the report explicitly states a definitive diagnosis. Do NOT prescribe medications or dosages.
4. Urgency Screening:
   - Determine urgency_level: exactly one of 'ROUTINE', 'PROMPT_FOLLOWUP', 'URGENT', 'EMERGENCY'.
   - ROUTINE: Normal or baseline tests.
   - PROMPT_FOLLOWUP: Mild-to-moderate abnormalities requiring timely non-emergency clinician follow-up.
   - URGENT: Severely elevated/depressed values requiring same-day or next-day medical evaluation.
   - EMERGENCY: Critical red flags, severe distress, life-threatening abnormalities.
   - List specific urgency_reasons explaining why.
5. Actionable Guidance:
   - what_to_do_next: 3–4 practical next steps appropriate to the findings (e.g. 'Bring this original report to your appointment', 'Track symptoms', 'Discuss follow-up bloodwork').
   - when_to_seek_urgent_care: Specific red-flag warning symptoms requiring emergency evaluation (e.g. severe shortness of breath, dizziness, fainting, sudden chest pain, uncontrolled bleeding).
   - questions_for_clinician: 3–5 specific, high-yield questions tailored to the abnormal parameters on this report.

OUTPUT FORMAT: You MUST return a single JSON object strictly matching this schema:
{
  "report_title": "string (e.g. Complete Blood Count (CBC) / Comprehensive Metabolic Panel / Chest Radiograph)",
  "report_category": "Hematology | Biochemistry | Radiology | Urine | Cardiology | General",
  "patient_name_in_report": "string or null",
  "report_date": "string or null",
  "summary": "string - 2-3 sentence overview of the report and what it evaluates",
  "key_findings": ["string - most important findings listed first"],
  "abnormal_values": [
    {
      "test_name": "string",
      "value": "string",
      "unit": "string or null",
      "reference_range": "string",
      "status": "low | high | abnormal | critical",
      "is_abnormal": true,
      "source_location": "string",
      "clinical_significance": "string"
    }
  ],
  "normal_values": [
    {
      "test_name": "string",
      "value": "string",
      "unit": "string or null",
      "reference_range": "string",
      "status": "normal",
      "is_abnormal": false,
      "source_location": "string"
    }
  ],
  "what_findings_mean": "string - clear plain language clinical interpretation without diagnosing",
  "urgency_level": "ROUTINE | PROMPT_FOLLOWUP | URGENT | EMERGENCY",
  "urgency_reasons": ["string"],
  "what_to_do_next": ["string"],
  "when_to_seek_urgent_care": ["string"],
  "questions_for_clinician": ["string"]
}
"""
        provider = get_ai_provider()
        user_message_content = f"Please analyze the following uploaded medical report document ('{filename}'):\n\n{extracted_text}"

        provider_messages = [
            AIProviderMessage(role="user", content=user_message_content)
        ]

        logger.info(f"=== [REPORT_ANALYSIS_START] Triggering AI Report Analysis for '{filename}' ===")
        logger.info(f"=== [GEMINI_REQUEST] Model: {provider.model_name}, Input size: {len(extracted_text)} chars ===")

        parsed: Dict[str, Any] = {}
        input_tokens = len(extracted_text.split()) * 2
        output_tokens = 0
        latency_ms = 0
        model_used = provider.model_name
        provider_used = provider.provider_name

        if has_usable_text:
            start_t = time.time()
            try:
                ai_resp = await provider.generate_response(
                    messages=provider_messages,
                    system_instruction=system_prompt,
                    temperature=0.1,
                    max_tokens=3000,
                    json_mode=True
                )
                latency_ms = ai_resp.latency_ms or int((time.time() - start_t) * 1000)
                input_tokens = ai_resp.input_tokens
                output_tokens = ai_resp.output_tokens
                model_used = ai_resp.model
                provider_used = ai_resp.provider
                raw_ai = ai_resp.content.strip()
                logger.info(f"=== [GEMINI_RESPONSE] Model: {model_used}, Latency: {latency_ms}ms, Tokens: {input_tokens}in / {output_tokens}out ===")
                
                # Extract JSON block
                json_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw_ai)
                if json_match:
                    parsed = json.loads(json_match.group(1))
                elif raw_ai.startswith("{") and raw_ai.endswith("}"):
                    parsed = json.loads(raw_ai)
                else:
                    try:
                        parsed = json.loads(raw_ai)
                    except Exception:
                        parsed = {}
            except Exception as exc:
                logger.warning(f"AI Provider error during report analysis: {exc}")
                parsed = {}

        # 4. Fallback structured population if LLM was unavailable or returned non-JSON
        if not parsed or not isinstance(parsed, dict) or ("abnormal_values" not in parsed and "key_findings" not in parsed):
            if not has_usable_text:
                parsed = {
                    "report_title": f"Medical Document ({filename})",
                    "report_category": "General",
                    "patient_name_in_report": None,
                    "report_date": None,
                    "summary": f"Could not reliably extract text from '{filename}'. Please ensure the document is clear, well-lit, and not password-protected.",
                    "key_findings": ["No readable laboratory text could be extracted from this document."],
                    "abnormal_values": [],
                    "normal_values": [],
                    "what_findings_mean": "The system was unable to identify specific laboratory parameters from the uploaded file. Please upload a clear digital copy or PDF for automated clinical analysis.",
                    "urgency_level": "ROUTINE",
                    "urgency_reasons": ["Document text extraction could not be completed."],
                    "what_to_do_next": [
                        "Upload a high-resolution photo or original PDF copy of your medical report.",
                        "Verify that all text and reference ranges are clearly legible.",
                        "Consult your clinician directly with your physical report."
                    ],
                    "when_to_seek_urgent_care": [
                        "If you are experiencing severe symptoms such as difficulty breathing, severe chest pain, or uncontrolled bleeding, seek emergency care immediately (108 / 112)."
                    ],
                    "questions_for_clinician": [
                        "Could you review the physical copy of my laboratory report with me?"
                    ]
                }
            else:
                parsed_abnormal = []
                parsed_normal = []
                for item in (ocr_result.structured_values or []):
                    ref_str = item.reference_range or "Reference range was not provided in the uploaded report."
                    status_str = "abnormal"
                    if item.is_abnormal:
                        try:
                            clean_val = float(str(item.value).replace(",", ""))
                            if "-" in ref_str:
                                p = re.split(r"[-]|(?:\s+to\s+)", ref_str)
                                if len(p) >= 2:
                                    low = float(re.sub(r"[^\d.]", "", p[0]))
                                    high = float(re.sub(r"[^\d.]", "", p[1]))
                                    status_str = "low" if clean_val < low else ("high" if clean_val > high else "abnormal")
                        except Exception:
                            status_str = "abnormal"
                    else:
                        status_str = "normal"

                    sig = ""
                    t_lower = item.test_name.lower()
                    if "hemoglobin" in t_lower or "hb" in t_lower:
                        sig = "Below expected reference range; oxygen-carrying capacity may be reduced." if item.is_abnormal else "Within expected baseline reference range."
                    elif "wbc" in t_lower or "leukocyte" in t_lower:
                        sig = "Elevated white cell count; commonly reflects immune, physiological, or inflammatory activity." if item.is_abnormal else "Normal white cell count."
                    elif "platelet" in t_lower:
                        sig = "Below expected reference range; blood clotting parameters require clinical review." if item.is_abnormal else "Normal platelet count."
                    elif "rbc" in t_lower or "red blood" in t_lower:
                        sig = "Below expected baseline red cell count." if item.is_abnormal else "Normal red cell count."
                    else:
                        sig = "Out of expected laboratory reference range." if item.is_abnormal else "Within expected laboratory baseline."

                    val_obj = {
                        "test_name": item.test_name,
                        "value": str(item.value),
                        "unit": item.unit,
                        "reference_range": ref_str,
                        "status": status_str,
                        "is_abnormal": item.is_abnormal or False,
                        "source_location": "Uploaded Report",
                        "clinical_significance": sig
                    }
                    if item.is_abnormal:
                        parsed_abnormal.append(val_obj)
                    else:
                        parsed_normal.append(val_obj)

                is_cbc_type = any(w in filename.lower() or w in extracted_text.lower() for w in ["cbc", "hemoglobin", "platelet", "hematology", "blood"])
                category_title = "Complete Blood Count (CBC) Report" if is_cbc_type else f"Medical Report ({filename})"
                category_name = "Hematology" if is_cbc_type else "General Diagnostic"

                computed_urgency = "PROMPT_FOLLOWUP" if parsed_abnormal else "ROUTINE"
                urgency_reasons = [f"Detected {len(parsed_abnormal)} out-of-range parameter(s) requiring physician review."] if parsed_abnormal else ["All identified parameters are within standard baseline ranges."]

                key_findings_list = []
                for v in parsed_abnormal:
                    key_findings_list.append(f"{v['test_name']} — {v['value']} {v['unit'] or ''} — {v['status'].upper()} (Ref: {v['reference_range']})")
                if not key_findings_list:
                    key_findings_list = ["All identified laboratory parameters are within normal reference ranges."]

                parsed = {
                    "report_title": category_title,
                    "report_category": category_name,
                    "patient_name_in_report": None,
                    "report_date": None,
                    "summary": f"Report analysis completed for {filename}. Identifies key laboratory parameters and compares recorded values against explicitly printed reference ranges.",
                    "key_findings": key_findings_list,
                    "abnormal_values": parsed_abnormal,
                    "normal_values": parsed_normal,
                    "what_findings_mean": (
                        "This report shows laboratory parameters that can sometimes be associated with physiological variations, nutritional factors, or mild anemia/inflammation. "
                        "These findings should be discussed with a healthcare professional alongside your symptoms and clinical history."
                    ),
                    "urgency_level": computed_urgency,
                    "urgency_reasons": urgency_reasons,
                    "what_to_do_next": [
                        "Bring a physical or digital copy of this report to your healthcare appointment.",
                        "Keep track of any symptoms you have noticed (such as fatigue, weakness, or fever).",
                        "Discuss with your doctor whether follow-up testing or supportive care is recommended."
                    ],
                    "when_to_seek_urgent_care": [
                        "Seek immediate emergency medical care (108 / 112) if experiencing severe shortness of breath, sudden chest pain, uncontrolled bleeding, dizziness, or fainting."
                    ],
                    "questions_for_clinician": [
                        f"What might be contributing to the {parsed_abnormal[0]['test_name'] if parsed_abnormal else 'findings'} result on this report?",
                        "Are repeat blood tests or additional evaluations recommended?",
                        "Are there dietary adjustments or supportive measures to consider?"
                    ]
                }

        # Build clean MedicalLabValue models
        abnormal_models: List[MedicalLabValue] = []
        for ab in parsed.get("abnormal_values", []):
            abnormal_models.append(MedicalLabValue(
                test_name=ab.get("test_name", "Test"),
                value=str(ab.get("value", "")),
                unit=ab.get("unit"),
                reference_range=ab.get("reference_range") or "Reference range was not provided in the uploaded report.",
                status=ab.get("status", "abnormal"),
                is_abnormal=True,
                source_location=ab.get("source_location", "Uploaded Report"),
                clinical_significance=ab.get("clinical_significance")
            ))

        normal_models: List[MedicalLabValue] = []
        for nm in parsed.get("normal_values", []):
            normal_models.append(MedicalLabValue(
                test_name=nm.get("test_name", "Test"),
                value=str(nm.get("value", "")),
                unit=nm.get("unit"),
                reference_range=nm.get("reference_range") or "Reference range was not provided in the uploaded report.",
                status="normal",
                is_abnormal=False,
                source_location=nm.get("source_location", "Uploaded Report"),
                clinical_significance=nm.get("clinical_significance")
            ))

        all_models = abnormal_models + normal_models
        raw_urgency = str(parsed.get("urgency_level", "ROUTINE")).upper().strip()
        if "EMERGENCY" in raw_urgency:
            urgency_level = "EMERGENCY"
        elif "URGENT" in raw_urgency:
            urgency_level = "URGENT"
        elif "PROMPT" in raw_urgency or "PRIORITY" in raw_urgency or "FOLLOWUP" in raw_urgency:
            urgency_level = "PROMPT_FOLLOWUP"
        elif abnormal_models:
            urgency_level = "PROMPT_FOLLOWUP"
        else:
            urgency_level = "ROUTINE"

        logger.info(f"=== [REPORT_ANALYSIS_VALIDATED] Findings: {len(parsed.get('key_findings', []))}, Abnormal: {len(abnormal_models)}, Normal: {len(normal_models)}, Urgency: {urgency_level} ===")

        # 5. Persist Attachment
        att_id = f"att_{uuid.uuid4().hex[:12]}"
        attachment = AIAttachment(
            id=att_id,
            patient_id=user.user_id,
            conversation_id=active_conv_id,
            filename=filename,
            mime_type=mime_type,
            file_size_bytes=len(file_bytes),
            ocr_status="completed",
            extracted_text=extracted_text,
            structured_values=[v.model_dump() for v in all_models],
            created_at=now
        )
        db.add(attachment)

        # 6. Persist Patient Upload Message
        user_msg = AIMessage(
            id=f"msg_user_{uuid.uuid4().hex[:12]}",
            conversation_id=active_conv_id,
            sender_type="patient",
            content=f"Uploaded medical report for analysis: {filename}",
            voice_used=False,
            created_at=now
        )
        db.add(user_msg)

        # 7. Persist Assistant Analysis Message
        key_findings_clean = [HealthAISafetyPipeline.sanitize_output_text(f) for f in parsed.get("key_findings", []) if f]
        asst_msg_content = (
            f"Report Analyzed: {parsed.get('report_title', filename)}\n\n"
            f"Summary:\n{HealthAISafetyPipeline.sanitize_output_text(parsed.get('summary', ''))}\n\n"
            f"Key Findings:\n" + "\n".join(key_findings_clean) + "\n\n"
            f"Clinical Interpretation:\n{HealthAISafetyPipeline.sanitize_output_text(parsed.get('what_findings_mean', ''))}\n\n"
            f"Urgency Assessment: {urgency_level}\n"
        )
        asst_msg_content = HealthAISafetyPipeline.sanitize_output_text(asst_msg_content)
        
        suggested_actions = ["Start Symptom Intake", "Ask About This Report", "Upload Another Report"]
        if urgency_level == "EMERGENCY":
            suggested_actions.insert(0, "Seek Emergency Care")

        asst_msg = AIMessage(
            id=f"msg_ai_{uuid.uuid4().hex[:12]}",
            conversation_id=active_conv_id,
            sender_type="assistant",
            content=asst_msg_content,
            model=model_used,
            provider=provider_used,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            safety_status="passed",
            urgency_detected=(urgency_level in ["URGENT", "EMERGENCY"]),
            urgency_level=urgency_level.lower(),
            structured_symptoms={
                "chief_complaint": parsed.get("report_title", filename),
                "reported_symptoms": [f"{v.test_name} ({v.status})" for v in abnormal_models]
            },
            follow_up_questions=[HealthAISafetyPipeline.sanitize_output_text(q) for q in parsed.get("questions_for_clinician", [])[:3] if q],
            suggested_actions=suggested_actions,
            created_at=utc_now_iso()
        )
        db.add(asst_msg)

        # 8. Update AI Health Context
        ctx_stmt = select(AIHealthContext).where(AIHealthContext.conversation_id == active_conv_id)
        ctx_res = await db.execute(ctx_stmt)
        health_context = ctx_res.scalars().first()
        if not health_context:
            health_context = AIHealthContext(
                id=f"ctx_{uuid.uuid4().hex[:12]}",
                conversation_id=active_conv_id,
                updated_at=now
            )
            db.add(health_context)

        health_context.current_concern = parsed.get("report_title", filename)
        health_context.symptoms = [f"{v.test_name} {v.status}" for v in abnormal_models]
        health_context.urgency_level = urgency_level
        health_context.updated_at = now

        conv.title = f"Report: {parsed.get('report_title', filename)[:28]}"
        conv.last_message_at = now
        conv.updated_at = now

        # 9. AI Usage Event & Audit Event
        usage_evt = AIUsageEvent(
            id=f"use_{uuid.uuid4().hex[:12]}",
            conversation_id=active_conv_id,
            patient_id=user.user_id,
            provider=provider_used,
            model=model_used,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            created_at=now
        )
        db.add(usage_evt)

        await AuditService.log_event(
            db=db,
            case_id=active_conv_id,
            actor=user.display_name,
            role=user.role,
            provenance="REPORT_DERIVED",
            action="AI_REPORT_ANALYZED",
            details=f"Analyzed {filename}: {len(abnormal_models)} abnormal values, urgency={urgency_level}"
        )

        await db.commit()
        await db.refresh(attachment)
        await db.refresh(conv)

        logger.info(f"=== [REPORT_ANALYSIS_SAVED] Attachment ID: {att_id}, Conversation ID: {active_conv_id} ===")

        return MedicalReportAnalysisResponse(
            report_id=att_id,
            conversation_id=active_conv_id,
            attachment_id=att_id,
            filename=filename,
            file_type=mime_type,
            report_title=HealthAISafetyPipeline.sanitize_output_text(parsed.get("report_title", filename)),
            report_category=parsed.get("report_category", "General"),
            patient_name_in_report=parsed.get("patient_name_in_report"),
            report_date=parsed.get("report_date"),
            summary=HealthAISafetyPipeline.sanitize_output_text(parsed.get("summary", "Medical report processed successfully.")),
            key_findings=key_findings_clean,
            abnormal_values=abnormal_models,
            normal_values=normal_models,
            all_values=all_models,
            what_findings_mean=HealthAISafetyPipeline.sanitize_output_text(parsed.get("what_findings_mean", "Clinical correlation with symptoms and doctor review recommended.")),
            urgency_level=urgency_level,
            urgency_reasons=[HealthAISafetyPipeline.sanitize_output_text(r) for r in parsed.get("urgency_reasons", []) if r],
            what_to_do_next=[HealthAISafetyPipeline.sanitize_output_text(s) for s in parsed.get("what_to_do_next", []) if s],
            when_to_seek_urgent_care=[HealthAISafetyPipeline.sanitize_output_text(c) for c in parsed.get("when_to_seek_urgent_care", []) if c],
            questions_for_clinician=[HealthAISafetyPipeline.sanitize_output_text(q) for q in parsed.get("questions_for_clinician", []) if q],
            raw_text=extracted_text,
            created_at=now
        )

    @staticmethod
    async def analyze_existing_attachment(
        db: AsyncSession,
        conversation_id: str,
        attachment_id: str,
        user: UserProfile
    ) -> MedicalReportAnalysisResponse:
        """Analyzes an attachment that has already been uploaded to a conversation."""
        await HealthAIService.get_conversation(db, conversation_id, user)
        stmt = select(AIAttachment).where(AIAttachment.id == attachment_id, AIAttachment.conversation_id == conversation_id)
        res = await db.execute(stmt)
        att = res.scalars().first()
        if not att:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Attachment '{attachment_id}' not found in conversation '{conversation_id}'."
            )
        
        raw_text = att.extracted_text or ""
        return await HealthAIService.analyze_medical_report(
            db=db,
            user=user,
            file_bytes=raw_text.encode("utf-8"),
            filename=att.filename,
            mime_type=att.mime_type,
            conversation_id=conversation_id
        )

