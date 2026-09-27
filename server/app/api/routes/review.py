import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...schemas.review import ReviewDecisionRequest, ReviewDecisionResponse, ReviewQueueItem
from ...models.database import get_db
from ...models.patient import PatientCase
from ...models.bedside import BedsideAssessment
from ...models.review import ClinicalReview
from ...services.queue_service import QueueService
from ...services.audit_service import AuditService
from ...api.deps import get_current_user_optional
from ...schemas.auth import UserProfile
from ...utils.timestamps import utc_now_iso

router = APIRouter(prefix="/review", tags=["Medical Reviewer & Decisions"])

@router.get("/queue", response_model=List[ReviewQueueItem])
async def get_clinical_review_queue(
    status: str = Query("awaiting_review", description="Filter by review status or 'all'"),
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if user and user.role not in ["DOCTOR", "NURSE", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Clinician role (DOCTOR, NURSE, ADMIN) required, but user has role '{user.role}'."
        )
    return await QueueService.get_prioritized_queue(db=db, status_filter=status)

@router.get("/{case_id}")
async def get_case_for_review(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if user and user.role not in ["DOCTOR", "NURSE", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Clinician role required to access case review, but user has role '{user.role}'."
        )
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found for review."
        )

    case_dict = case.to_dict()

    # Query latest bedside assessment for complete clinical review provenance
    bedside_stmt = select(BedsideAssessment).where(BedsideAssessment.case_id == case_id).order_by(BedsideAssessment.created_at.desc())
    bedside_res = await db.execute(bedside_stmt)
    latest_bedside = bedside_res.scalars().first()
    if latest_bedside:
        case_dict["bedsideAssessment"] = latest_bedside.to_dict()
    else:
        case_dict["bedsideAssessment"] = None

    return case_dict

@router.post("/{case_id}/decision", response_model=ReviewDecisionResponse)
async def submit_review_decision(
    case_id: str,
    req: ReviewDecisionRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if user and user.role not in ["DOCTOR", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Doctor or Admin role required to confirm final clinical decisions, but user has role '{user.role}'."
        )

    # Retrieve case
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cannot record review decision: Case '{case_id}' does not exist."
        )

    reviewer_name = user.display_name if user else (req.reviewerName or "Dr. Clinical Reviewer")
    reviewer_role = user.role if user else (req.reviewerRole or "DOCTOR")
    reviewer_id = user.user_id if user else "usr_reviewer_01"
    now_iso = utc_now_iso()

    # Update case status
    case.review_status = "reviewed"
    case.reviewer_decision = req.decision
    case.reviewer_notes = req.notes
    case.reviewed_at = now_iso
    case.reviewer_name = reviewer_name
    case.reviewer_role = reviewer_role

    # Record review entity
    review_record = ClinicalReview(
        id=f"rev_{uuid.uuid4().hex[:8]}",
        case_id=case_id,
        reviewer_id=reviewer_id,
        reviewer_name=reviewer_name,
        reviewer_role=reviewer_role,
        decision=req.decision,
        notes=req.notes,
        timestamp=now_iso
    )
    db.add(review_record)
    await db.commit()
    await db.refresh(case)

    # Record Audit Event
    await AuditService.log_event(
        db=db,
        case_id=case_id,
        actor=reviewer_name,
        role=reviewer_role,
        provenance="CLINICIAN",
        action="DECISION_CONFIRMED",
        details=f"Clinician recorded triage decision '{req.decision}'. Notes: {req.notes or 'None'}"
    )

    return ReviewDecisionResponse(
        success=True,
        caseId=case_id,
        decision=req.decision,
        notes=req.notes,
        reviewedAt=now_iso,
        reviewerName=reviewer_name,
        reviewerRole=reviewer_role,
        message=f"Review decision '{req.decision}' confirmed and logged to audit trail.",
        case=case.to_dict()
    )

@router.delete("/{case_id}")
async def delete_reviewed_case_review_route(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if user and user.role not in ["DOCTOR", "ADMIN", "MEDICAL_REVIEWER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Doctor or Admin role required to delete cases, but user has role '{user.role}'."
        )

    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' does not exist."
        )

    if case.review_status != "reviewed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete case '{case_id}': Only reviewed cases can be deleted. Current status is '{case.review_status}'."
        )

    actor_name = user.display_name if user else "Clinical Reviewer"
    actor_role = user.role if user else "DOCTOR"

    await AuditService.log_event(
        db=db,
        case_id=case_id,
        actor=actor_name,
        role=actor_role,
        provenance="CLINICIAN",
        action="CASE_DELETED",
        details=f"Clinician permanently deleted reviewed case {case_id} (Patient Ref: {case.patient_id})."
    )

    await db.delete(case)
    await db.commit()

    return {
        "success": True,
        "caseId": case_id,
        "message": f"Case '{case_id}' permanently deleted."
    }

