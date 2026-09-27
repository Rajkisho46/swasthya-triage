import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...models.database import get_db
from ...models.patient import PatientCase
from ...schemas.intake import IntakeCreateRequest, IntakeResponse
from ...services.audit_service import AuditService
from ...api.deps import get_current_user_optional
from ...schemas.auth import UserProfile
from ...utils.timestamps import utc_now_iso

router = APIRouter(prefix="/patient", tags=["Patient Portal & Cases"])

@router.get("/profile")
async def get_patient_profile(
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required."
        )
    if user.role not in ["PATIENT", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Patient role required, but user has role '{user.role}'."
        )
    return {
        "userId": user.user_id,
        "username": user.username,
        "displayName": user.display_name,
        "role": user.role
    }

@router.get("/cases")
async def get_patient_cases(
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to view patient cases."
        )
    if user.role not in ["PATIENT", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Patient role required, but user has role '{user.role}'."
        )

    # For ADMIN, all cases can be returned; for PATIENT, strictly enforce ownership
    if user.role == "ADMIN":
        stmt = select(PatientCase).order_by(PatientCase.created_at.desc())
    else:
        stmt = select(PatientCase).where(
            (PatientCase.patient_id == user.user_id) | (PatientCase.patient_id == user.username)
        ).order_by(PatientCase.created_at.desc())

    result = await db.execute(stmt)
    cases = result.scalars().all()
    return [c.to_dict() for c in cases]

@router.get("/cases/{case_id}")
async def get_patient_case_by_id(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to view patient case."
        )
    if user.role not in ["PATIENT", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Patient role required, but user has role '{user.role}'."
        )

    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()

    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' was not found."
        )

    # Ownership check: Patient can only view their own case
    if user.role != "ADMIN" and case.patient_id not in [user.user_id, user.username]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have permission to access another patient's clinical case."
        )

    return case.to_dict()

@router.post("/cases", response_model=IntakeResponse)
async def create_patient_self_case(
    req: IntakeCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to submit patient intake."
        )
    if user.role not in ["PATIENT", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Patient role required, but user has role '{user.role}'."
        )

    if not req.consentGiven:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient/Guardian consent is mandatory before intake submission."
        )

    case_id = f"CASE-{uuid.uuid4().hex[:6].upper()}"
    # Patient role ownership strictly derives from authenticated JWT user_id
    patient_id = user.user_id if user.role == "PATIENT" else (req.patientId or user.user_id)
    now_iso = utc_now_iso()

    patient_case = PatientCase(
        id=case_id,
        patient_id=patient_id,
        age=req.age,
        gender=req.gender,
        preferred_language=req.preferredLanguage,
        raw_symptoms=req.symptoms,
        consent_given=True,
        created_at=now_iso,
        review_status="awaiting_nursing_triage"
    )
    db.add(patient_case)
    await db.commit()

    await AuditService.log_event(
        db=db,
        case_id=case_id,
        actor=user.display_name or "Patient",
        role=user.role,
        provenance="PATIENT",
        action="PATIENT_SELF_INTAKE_SUBMITTED",
        details=f"Patient self-submitted intake case with consent."
    )

    return IntakeResponse(
        success=True,
        caseId=case_id,
        patientId=patient_id,
        consentGiven=True,
        status="awaiting_review",
        message="Patient intake submitted successfully and queued for clinical review.",
        createdAt=now_iso
    )
