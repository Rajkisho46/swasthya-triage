from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...schemas.intake import IntakeCreateRequest, IntakeResponse
from ...models.database import get_db
from ...models.patient import PatientCase
from ...services.intake_service import IntakeService
from ...api.deps import get_current_user_optional
from ...schemas.auth import UserProfile

router = APIRouter(prefix="/intake", tags=["Patient Intake"])

@router.get("", response_model=List[Dict[str, Any]])
async def get_all_intake_cases(
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    stmt = select(PatientCase).order_by(PatientCase.created_at.desc())
    result = await db.execute(stmt)
    cases = result.scalars().all()
    return [c.to_dict() for c in cases]

@router.post("", response_model=IntakeResponse)
async def submit_patient_intake(
    req: IntakeCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: UserProfile = Depends(get_current_user_optional)
):
    # 1. Strict Consent Check
    if not req.consentGiven:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient/Guardian consent is mandatory before intake processing. Processing halted."
        )

    actor = user.display_name if user else "Patient"
    role = user.role if user else "PATIENT"

    case = await IntakeService.create_intake_case(db=db, req=req, actor=actor, role=role)

    return IntakeResponse(
        success=True,
        caseId=case.id,
        patientId=case.patient_id,
        consentGiven=case.consent_given,
        status=case.review_status,
        message="Patient intake submitted successfully and queued for clinical review.",
        createdAt=case.created_at,
        case=case.to_dict()
    )

@router.get("/{case_id}")
async def get_case_by_id(case_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Triage case with ID '{case_id}' not found."
        )
    return case.to_dict()

