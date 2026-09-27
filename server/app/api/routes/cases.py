import uuid
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from ...models.database import get_db
from ...models.patient import PatientCase
from ...models.review import ClinicalReview
from ...models.consent import ConsentRecord
from ...models.bedside import BedsideAssessment
from ...services.audit_service import AuditService
from ...api.deps import get_current_user_optional
from ...schemas.auth import UserProfile

router = APIRouter(prefix="/cases", tags=["Cases Management"])

@router.get("", response_model=List[Dict[str, Any]])
async def get_all_cases(
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    stmt = select(PatientCase).order_by(PatientCase.created_at.desc())
    result = await db.execute(stmt)
    cases = result.scalars().all()
    return [c.to_dict() for c in cases]

@router.get("/{case_id}")
async def get_case_by_id(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' was not found."
        )
    return case.to_dict()

@router.delete("/{case_id}")
async def delete_reviewed_case(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    # 1. RBAC Check: Doctor or Admin role required
    if user and user.role not in ["DOCTOR", "ADMIN", "MEDICAL_REVIEWER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Doctor or Admin role required to delete cases, but user has role '{user.role}'."
        )

    # 2. Find case
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' does not exist."
        )

    # 3. Verify case is REVIEWED before deletion
    if case.review_status != "reviewed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete case '{case_id}': Only reviewed cases can be deleted. Current status is '{case.review_status}'."
        )

    actor_name = user.display_name if user else "Clinical Reviewer"
    actor_role = user.role if user else "DOCTOR"

    # 4. Record deletion in audit trail (audit events remain independently persisted)
    await AuditService.log_event(
        db=db,
        case_id=case_id,
        actor=actor_name,
        role=actor_role,
        provenance="CLINICIAN",
        action="CASE_DELETED",
        details=f"Clinician permanently deleted reviewed case {case_id} (Patient Ref: {case.patient_id})."
    )

    # 5. Clean up associated clinical reviews, consents, bedside assessments
    await db.execute(delete(ClinicalReview).where(ClinicalReview.case_id == case_id))
    await db.execute(delete(ConsentRecord).where(ConsentRecord.case_id == case_id))
    await db.execute(delete(BedsideAssessment).where(BedsideAssessment.case_id == case_id))

    # 6. Delete case record
    await db.delete(case)
    await db.commit()

    return {
        "success": True,
        "caseId": case_id,
        "message": f"Case '{case_id}' permanently deleted."
    }

from pydantic import BaseModel

class SendToReviewRequest(BaseModel):
    notes: Optional[str] = None
    submitting_role: Optional[str] = "NURSE"

@router.post("/{case_id}/send-to-review")
async def send_case_to_review(
    case_id: str,
    req: Optional[SendToReviewRequest] = None,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    # 1. RBAC check: NURSE, DOCTOR, ADMIN
    if user and user.role not in ["NURSE", "DOCTOR", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Clinical role required to forward case to medical review, but user has role '{user.role}'."
        )

    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' does not exist."
        )

    actor_name = user.display_name if user else "Triage Nurse"
    actor_role = user.role if user else ((req.submitting_role if req else None) or "NURSE")

    # Idempotent handling if already awaiting review or reviewed
    if case.review_status == "awaiting_review":
        if req and req.notes and req.notes.strip() and req.notes.strip() not in (case.reviewer_notes or ""):
            if case.reviewer_notes:
                case.reviewer_notes = f"{case.reviewer_notes} | Triage Note: {req.notes.strip()}"
            else:
                case.reviewer_notes = req.notes.strip()
            await db.commit()
            await db.refresh(case)
        return {
            "success": True,
            "caseId": case_id,
            "status": "awaiting_review",
            "message": "Case is queued for Clinical Review.",
            "case": case.to_dict()
        }

    if case.review_status == "reviewed":
        return {
            "success": True,
            "caseId": case_id,
            "status": "reviewed",
            "message": "Case has already been reviewed and signed off.",
            "case": case.to_dict()
        }

    prev_status = case.review_status
    case.review_status = "awaiting_review"
    if req and req.notes and req.notes.strip():
        if case.reviewer_notes:
            case.reviewer_notes = f"{case.reviewer_notes} | Triage Note: {req.notes.strip()}"
        else:
            case.reviewer_notes = req.notes.strip()

    # Log audit event
    await AuditService.log_event(
        db=db,
        case_id=case_id,
        actor=actor_name,
        role=actor_role,
        provenance="NURSE" if actor_role == "NURSE" else "CLINICIAN",
        action="CASE_SENT_FOR_MEDICAL_REVIEW",
        details=f"Case {case_id} transitioned from '{prev_status}' to 'awaiting_review' by {actor_name} ({actor_role}) and queued for Doctor Review."
    )
    await AuditService.log_event(
        db=db,
        case_id=case_id,
        actor=actor_name,
        role=actor_role,
        provenance="NURSE" if actor_role == "NURSE" else "CLINICIAN",
        action="CASE_STATUS_CHANGED",
        details=f"Status transition: {prev_status} -> awaiting_review"
    )

    await db.commit()
    await db.refresh(case)

    return {
        "success": True,
        "caseId": case_id,
        "status": case.review_status,
        "message": "Case successfully forwarded to Medical Review queue.",
        "case": case.to_dict()
    }
