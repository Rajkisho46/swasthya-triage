import uuid
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ...models.database import get_db
from ...models.health_ai import AIAttachment, AIMessage, AIConversation, utc_now_iso
from ...schemas.auth import UserProfile
from ...schemas.health_ai import (
    CreateConversationRequest,
    ConversationResponse,
    ConversationDetailResponse,
    SendMessageRequest,
    SendMessageResponse,
    HealthContextResponse,
    AttachmentResponse,
    MessageResponse,
    MedicalReportAnalysisResponse
)
from ...services.health_ai_service import HealthAIService
from ...services.ocr_service import OCRService
from ...services.stt_service import SpeechToTextService
from ...services.audit_service import AuditService
from ...api.deps import get_current_user_optional, get_current_active_user
from ...utils.security import check_rate_limit
from ...config import settings

router = APIRouter(prefix="/health-ai", tags=["Swasthya Real Health AI Workspace"])

@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    req: CreateConversationRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """Creates a new persistent Health AI conversation for the authenticated patient."""
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    conv = await HealthAIService.create_conversation(db, effective_user, title=req.title)
    return conv.to_dict()

@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """Returns all conversations belonging strictly to the authenticated patient."""
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    convs = await HealthAIService.get_patient_conversations(db, effective_user, status_filter)
    return [c.to_dict() for c in convs]

@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation_details(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """Returns full details, messages, attachments, and health context for a conversation."""
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    conv = await HealthAIService.get_conversation(db, conversation_id, effective_user)
    
    # Load messages
    msg_stmt = select(AIMessage).where(AIMessage.conversation_id == conversation_id).order_by(AIMessage.created_at)
    msg_res = await db.execute(msg_stmt)
    messages = list(msg_res.scalars().all())

    # Load attachments
    att_stmt = select(AIAttachment).where(AIAttachment.conversation_id == conversation_id).order_by(AIAttachment.created_at)
    att_res = await db.execute(att_stmt)
    attachments = list(att_res.scalars().all())

    # Load health context
    context = await HealthAIService.get_conversation_context(db, conversation_id, effective_user)

    return {
        "conversation": conv.to_dict(),
        "messages": [m.to_dict() for m in messages],
        "attachments": [a.to_dict() for a in attachments],
        "healthContext": context.to_dict() if context else None
    }

@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    req: SendMessageRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    Submits a patient message to the conversation, executes AI inference & safety verification,
    and returns or streams the assistant response.
    """
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    
    # Rate limit check per patient/IP
    rate_key = f"health_ai:{effective_user.user_id}"
    if not check_rate_limit(rate_key, max_requests=settings.AI_RATE_LIMIT, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait a moment before sending another health message."
        )

    # Process message synchronously or return SSE stream
    if req.stream:
        stream_gen = HealthAIService.process_user_message_stream(
            db=db,
            conversation_id=conversation_id,
            content=req.content,
            user=effective_user,
            voice_used=req.voice_used or False,
            preferred_language=req.preferred_language or "English",
            attachments=req.attachments
        )
        return StreamingResponse(stream_gen, media_type="text/event-stream")

    user_msg, asst_msg, ctx = await HealthAIService.process_user_message(
        db=db,
        conversation_id=conversation_id,
        content=req.content,
        user=effective_user,
        voice_used=req.voice_used or False,
        preferred_language=req.preferred_language or "English",
        attachments=req.attachments
    )

    return {
        "user_message": user_msg.to_dict(),
        "assistant_message": asst_msg.to_dict(),
        "health_context": ctx.to_dict()
    }

@router.post("/conversations/{conversation_id}/attachments", response_model=AttachmentResponse)
async def upload_attachment(
    conversation_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    Uploads a medical report (PDF, PNG, JPG, JPEG), runs OCR processing, and attaches to conversation.
    """
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    conv = await HealthAIService.get_conversation(db, conversation_id, effective_user)

    # Validate file format
    allowed_types = ["application/pdf", "image/png", "image/jpeg", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload PDF, PNG, JPG, or JPEG medical documents."
        )

    file_bytes = await file.read()
    max_bytes = settings.FILE_UPLOAD_MAX_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.FILE_UPLOAD_MAX_MB} MB."
        )

    # Run OCR processing
    ocr_result = await OCRService.process_document(file_bytes, file.filename or "report.pdf", file.content_type or "application/pdf")
    ocr_text = getattr(ocr_result, "extractedText", None) or getattr(ocr_result, "extracted_text", "")

    att_id = f"att_{uuid.uuid4().hex[:12]}"
    now = utc_now_iso()
    attachment = AIAttachment(
        id=att_id,
        patient_id=effective_user.user_id,
        conversation_id=conversation_id,
        filename=file.filename or "medical_document.pdf",
        mime_type=file.content_type or "application/pdf",
        file_size_bytes=len(file_bytes),
        ocr_status="completed" if ocr_text else "failed",
        extracted_text=ocr_text,
        structured_values=[v.model_dump() if hasattr(v, "model_dump") else v for v in ocr_result.structured_values] if ocr_result.structured_values else [],
        created_at=now
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    # Log audit event
    await AuditService.log_event(
        db=db,
        case_id=conversation_id,
        actor=effective_user.display_name,
        role=effective_user.role,
        provenance="MULTIMODAL",
        action="AI_FILE_ATTACHED",
        details=f"Attached {file.filename} ({len(file_bytes)} bytes) to conversation {conversation_id}"
    )

    return attachment.to_dict()

@router.post("/conversations/{conversation_id}/voice")
async def transcribe_voice(
    conversation_id: str,
    file: UploadFile = File(...),
    language: Optional[str] = Form("auto"),
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """Transcribes patient microphone speech for the conversation."""
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    await HealthAIService.get_conversation(db, conversation_id, effective_user)

    audio_bytes = await file.read()
    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty audio recording submitted."
        )

    stt_res = await SpeechToTextService.transcribe(
        audio_bytes=audio_bytes,
        filename=file.filename or "recording.webm",
        mime_type=file.content_type or "audio/webm",
        language=language or "auto"
    )

    return {
        "transcript": stt_res.transcription or stt_res.raw_transcription or "",
        "detectedLanguage": stt_res.language,
        "isSimulated": stt_res.is_demo_transcription
    }

@router.get("/conversations/{conversation_id}/context", response_model=HealthContextResponse)
async def get_context(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """Returns live extracted health context for the conversation."""
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    ctx = await HealthAIService.get_conversation_context(db, conversation_id, effective_user)
    return ctx.to_dict()

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """Deletes a conversation belonging to the authenticated patient."""
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    await HealthAIService.delete_conversation(db, conversation_id, effective_user)
    return {"success": True, "message": f"Conversation '{conversation_id}' deleted."}

@router.post("/conversations/{conversation_id}/archive")
async def archive_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """Archives a conversation for the authenticated patient."""
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    conv = await HealthAIService.archive_conversation(db, conversation_id, effective_user)
    return conv.to_dict()

@router.post("/analyze-report", response_model=MedicalReportAnalysisResponse)
async def analyze_medical_report_endpoint(
    file: UploadFile = File(...),
    conversation_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    Instant Medical Report Analysis:
    Extracts text, identifies laboratory parameters & reference ranges, detects abnormalities,
    screens urgency, provides non-diagnostic explanation, and prepares clinical next steps.
    """
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")

    file_bytes = await file.read()
    if not file_bytes or len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file uploaded. Please provide a valid PDF, image, or text report."
        )

    max_bytes = settings.FILE_UPLOAD_MAX_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.FILE_UPLOAD_MAX_MB} MB."
        )

    result = await HealthAIService.analyze_medical_report(
        db=db,
        user=effective_user,
        file_bytes=file_bytes,
        filename=file.filename or "medical_report.pdf",
        mime_type=file.content_type or "application/pdf",
        conversation_id=conversation_id
    )
    return result

@router.post("/conversations/{conversation_id}/analyze-report", response_model=MedicalReportAnalysisResponse)
async def analyze_medical_report_in_conversation(
    conversation_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """Analyzes an uploaded medical report directly inside an existing conversation."""
    return await analyze_medical_report_endpoint(
        file=file,
        conversation_id=conversation_id,
        db=db,
        user=user
    )

@router.post("/conversations/{conversation_id}/attachments/{attachment_id}/analyze", response_model=MedicalReportAnalysisResponse)
async def analyze_existing_attachment_endpoint(
    conversation_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """Analyzes an already-uploaded attachment by ID using the clinical AI pipeline."""
    effective_user = user or UserProfile(user_id=f"PT-ANON-{uuid.uuid4().hex[:6].upper()}", username="anonymous", display_name="Patient", role="PATIENT")
    return await HealthAIService.analyze_existing_attachment(
        db=db,
        conversation_id=conversation_id,
        attachment_id=attachment_id,
        user=effective_user
    )

