import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...schemas.referral import ReferralGenerateRequest, ReferralDocumentResponse
from ...models.database import get_db
from ...models.patient import PatientCase
from ...services.referral_service import ReferralService
from ...services.audit_service import AuditService
from ...utils.timestamps import utc_now_iso

from ...api.deps import get_current_user_optional
from ...schemas.auth import UserProfile

router = APIRouter(prefix="/referral", tags=["Referral Preparation"])

@router.post("/{case_id}/generate", response_model=ReferralDocumentResponse)
async def generate_referral_document(
    case_id: str,
    req: ReferralGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if user and user.role not in ["DOCTOR", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Doctor or Admin role required to generate clinical referral, but user has role '{user.role}'."
        )
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found for referral generation."
        )

    referral_id = f"ref_{uuid.uuid4().hex[:8]}"
    
    # Audit log
    await AuditService.log_event(
        db=db,
        case_id=case_id,
        actor="Medical Reviewer / Clinician",
        role="DOCTOR",
        provenance="CLINICIAN",
        action="REFERRAL_GENERATED",
        details=f"Prepared structured clinical referral document for transfer to {req.referralFacility}."
    )

    return ReferralDocumentResponse(
        success=True,
        referralId=referral_id,
        caseId=case.id,
        patientId=case.patient_id,
        generatedAt=utc_now_iso(),
        pdfAvailable=True,
        pdfDownloadUrl=f"/api/referral/{case.id}/pdf",
        summaryText=f"Clinical referral generated for patient {case.patient_id} ({case.age} yrs, {case.gender}) to {req.referralFacility}."
    )

@router.get("/{case_id}/pdf")
async def download_referral_pdf(
    case_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found for PDF download."
        )

    pdf_bytes = ReferralService.generate_referral_pdf(
        case_dict=case.to_dict(),
        clinician_notes=case.reviewer_notes or "",
        destination="Regional Referral Hospital"
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=swasthya_referral_{case.patient_id}.pdf"
        }
    )
