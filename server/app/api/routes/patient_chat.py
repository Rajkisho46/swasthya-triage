import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.database import get_db
from ...schemas.chat import PatientChatRequest, PatientChatResponse
from ...services.patient_ai_chat_service import PatientAIChatService
from ...services.audit_service import AuditService
from ...api.deps import get_current_user_optional
from ...schemas.auth import UserProfile
from ...utils.security import check_rate_limit
from ...config import settings

router = APIRouter(prefix="/patient/chat", tags=["Real Patient Healthcare AI Assistant"])

@router.post("", response_model=PatientChatResponse)
async def chat_with_healthcare_ai(
    req: PatientChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    POST /api/patient/chat
    Conversational AI Assistant for Patient Portal.
    Restricted strictly to healthcare, triage guidance, symptom clarification, and document explanation.
    """
    # Rate limit check per IP or authenticated user
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"chat:{user.user_id if user else client_ip}"
    if not check_rate_limit(rate_key, max_requests=settings.AI_RATE_LIMIT, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many AI chat requests. Please slow down to allow the clinical engine to process."
        )

    # Patient ID strictly derived from JWT when authenticated
    patient_id = user.user_id if user else (req.patient_id or f"PT-ANON-{uuid.uuid4().hex[:6].upper()}")
    req.patient_id = patient_id

    response = await PatientAIChatService.chat(req)

    # Audit log if new conversation or urgency detected
    try:
        if len(req.messages) == 1:
            await AuditService.log_event(
                db=db,
                case_id="CHAT_SESSION",
                actor=user.display_name if user else "Patient",
                role=user.role if user else "PATIENT",
                provenance="PATIENT",
                action="AI_CHAT_CONVERSATION_STARTED",
                details=f"Language: {req.preferred_language}, Urgency: {response.urgency_detected}"
            )
        elif response.urgency_detected:
            await AuditService.log_event(
                db=db,
                case_id="CHAT_SESSION",
                actor=user.display_name if user else "Patient",
                role=user.role if user else "PATIENT",
                provenance="AI_ADVISORY",
                action="AI_URGENCY_SIGNAL_DETECTED",
                details=f"Reasons: {', '.join(response.urgency_reasons)}"
            )
    except Exception:
        # Non-blocking audit resilience
        pass

    return response
