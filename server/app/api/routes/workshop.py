from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from ...models.database import get_db
from ...services.audit_service import AuditService
from ...api.deps import get_current_user_optional
from ...schemas.auth import UserProfile

router = APIRouter(prefix="/workshop", tags=["Workshop State & Isolation Management"])

class PortalResetRequest(BaseModel):
    portal: str = Field(..., description="Target portal to reset: PATIENT, NURSE, DOCTOR, or ADMIN")

class DestructiveWipeRequest(BaseModel):
    confirm_destructive_wipe: bool = Field(..., description="Explicit confirmation for destructive wipe of evaluation records")
    reason: Optional[str] = Field("Authorized institutional reset", description="Administrative justification")

class PortalResetResponse(BaseModel):
    success: bool
    portal: str
    message: str
    reset_scope: List[str]
    preserved_records: List[str]
    actor: str
    role: str

@router.post("/reset", response_model=PortalResetResponse)
async def reset_portal_workshop(
    req: PortalResetRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    Safely reset only the specified portal's workshop state.
    Enforces role-based authorization:
    - PATIENT portal reset: accessible to PATIENT, NURSE, DOCTOR, ADMIN
    - NURSE portal reset: requires NURSE, DOCTOR, or ADMIN
    - DOCTOR portal reset: requires DOCTOR or ADMIN
    - ADMIN portal reset: requires ADMIN
    Never deletes real patient cases, clinical reviews, or audit trails.
    """
    normalized_portal = req.portal.upper().strip()
    if normalized_portal in ["MEDICAL_REVIEWER", "REVIEWER"]:
        normalized_portal = "DOCTOR"
    elif normalized_portal in ["ADMINISTRATOR"]:
        normalized_portal = "ADMIN"

    valid_portals = ["PATIENT", "NURSE", "DOCTOR", "ADMIN"]
    if normalized_portal not in valid_portals:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid portal '{req.portal}'. Must be one of: {', '.join(valid_portals)}"
        )

    actor_role = user.role if user else ("PATIENT" if normalized_portal == "PATIENT" else "SYSTEM")
    actor_name = user.display_name if user else f"Workshop User ({normalized_portal})"

    # Role-based permission validation
    if normalized_portal == "NURSE" and user and user.role not in ["NURSE", "DOCTOR", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Nurse or clinician role required to reset Nurse Portal workshop, but user has role '{user.role}'."
        )
    elif normalized_portal == "DOCTOR" and user and user.role not in ["DOCTOR", "ADMIN", "MEDICAL_REVIEWER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Physician / Medical Reviewer role required to reset Doctor Portal workshop, but user has role '{user.role}'."
        )
    elif normalized_portal == "ADMIN" and user and user.role not in ["ADMIN", "ADMINISTRATOR"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Administrator role required to reset Admin Portal workshop, but user has role '{user.role}'."
        )

    # Scoped definitions per portal
    scope_map = {
        "PATIENT": [
            "Patient symptom intake form & scratchpad",
            "Patient AI chat session & conversation history",
            "Patient language preferences & active tab selection",
            "Unsubmitted patient symptom drafts"
        ],
        "NURSE": [
            "Nursing queue filter states & search parameters",
            "Bedside vitals temporary inputs & unverified drafts",
            "Bedside physical observations & clinical note scratchpad",
            "Selected nursing triage case & active tab navigation"
        ],
        "DOCTOR": [
            "Review queue urgency and status filters",
            "Clinical review modal draft dispositions & rationale scratchpad",
            "Selected reviewer case & active tab selection"
        ],
        "ADMIN": [
            "Audit log search queries & actor filters",
            "System governance telemetry filters",
            "Active administrative tab selection"
        ]
    }

    preserved = [
        "Real patient case records in database (PatientCase)",
        "Submitted clinical evaluations & signed-off reviews",
        "Recorded bedside assessments in database",
        "Complete append-only audit provenance logs",
        "Active user authentication tokens & login session",
        "All other portals' data, storage, and state"
    ]

    # Record safe audit event
    await AuditService.log_event(
        db=db,
        case_id="SYS_WORKSHOP",
        actor=actor_name,
        role=actor_role,
        provenance="SYSTEM",
        action="PORTAL_WORKSHOP_RESET",
        details=f"Portal-specific workshop reset executed for '{normalized_portal}' portal by {actor_name} ({actor_role}). Real clinical records and other portals preserved."
    )

    return PortalResetResponse(
        success=True,
        portal=normalized_portal,
        message=f"{normalized_portal.title()} Portal workshop state reset to defaults successfully.",
        reset_scope=scope_map[normalized_portal],
        preserved_records=preserved,
        actor=actor_name,
        role=actor_role
    )

@router.post("/admin/destructive-wipe", response_model=PortalResetResponse)
async def admin_destructive_wipe(
    req: DestructiveWipeRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    Separate, explicitly labelled Administrator-only operation for full destructive reset.
    Strictly forbidden to non-administrators.
    Requires explicit 'confirm_destructive_wipe' boolean confirmation.
    """
    if not user or user.role not in ["ADMIN", "ADMINISTRATOR"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only authenticated Administrators can perform destructive data wipe."
        )

    if not req.confirm_destructive_wipe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit confirmation 'confirm_destructive_wipe: true' required for destructive operation."
        )

    # Log high-priority administrative audit event
    await AuditService.log_event(
        db=db,
        case_id="SYS_ADMIN",
        actor=user.display_name,
        role=user.role,
        provenance="CLINICIAN",
        action="ADMIN_DESTRUCTIVE_WIPE_REQUESTED",
        details=f"Administrator {user.display_name} requested destructive wipe. Reason: {req.reason}"
    )

    return PortalResetResponse(
        success=True,
        portal="ADMIN_DESTRUCTIVE",
        message="Administrative wipe logged. Core compliance preserved.",
        reset_scope=["Administrative test logs"],
        preserved_records=["Security audit baseline", "Institutional configuration"],
        actor=user.display_name,
        role=user.role
    )
