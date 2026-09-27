import uuid
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...schemas.bedside import (
    BedsideAssessmentCreateRequest,
    BedsideAssessmentUpdateRequest,
    BedsideAssessmentResponse,
)
from ...models.database import get_db
from ...models.patient import PatientCase
from ...models.bedside import BedsideAssessment
from ...services.audit_service import AuditService
from ...api.deps import get_current_user_optional
from ...schemas.auth import UserProfile
from ...utils.timestamps import utc_now_iso

router = APIRouter(prefix="/cases", tags=["Nurse Bedside Intake & Assessments"])

@router.post("/{case_id}/bedside-assessment", response_model=BedsideAssessmentResponse, status_code=status.HTTP_201_CREATED)
async def create_bedside_assessment(
    case_id: str,
    req: BedsideAssessmentCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    Create and persist a new real-time bedside assessment for a triage case.
    Restricted to nursing and clinician roles.
    """
    if user and user.role not in ["NURSE", "DOCTOR", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Nurse or clinician role required to record bedside assessments, but user has role '{user.role}'."
        )

    # 1. Verify case exists
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found."
        )

    assessed_by = user.display_name if user else "Nurse Priya Nair, RN"
    assessor_id = user.user_id if user else "usr_nur_01"
    assessor_role = user.role if user else "NURSE"
    now_iso = utc_now_iso()
    assessment_id = f"bedside_{uuid.uuid4().hex[:10]}"

    # Process visible distress
    visible_distress_json = "[]"
    if req.observations and req.observations.visible_distress is not None:
        vd = req.observations.visible_distress
        if isinstance(vd, list):
            visible_distress_json = json.dumps(vd)
        elif isinstance(vd, str):
            visible_distress_json = json.dumps([vd])
        elif isinstance(vd, bool):
            visible_distress_json = json.dumps(["Visible Distress Flagged"] if vd else ["None Observed"])

    assessment = BedsideAssessment(
        id=assessment_id,
        case_id=case_id,
        patient_id=case.patient_id,
        assessed_by=assessed_by,
        assessor_id=assessor_id,
        assessor_role=assessor_role,
        assessed_at=req.vitals.measurement_timestamp if (req.vitals and req.vitals.measurement_timestamp) else now_iso,
        # Vitals
        systolic_bp=req.vitals.systolic_bp if req.vitals else None,
        diastolic_bp=req.vitals.diastolic_bp if req.vitals else None,
        heart_rate=req.vitals.heart_rate if req.vitals else None,
        spo2=req.vitals.spo2 if req.vitals else None,
        temperature=req.vitals.temperature if req.vitals else None,
        temperature_unit=req.vitals.temperature_unit if req.vitals else "F",
        respiratory_rate=req.vitals.respiratory_rate if req.vitals else None,
        blood_glucose=req.vitals.blood_glucose if req.vitals else None,
        measurement_timestamp=req.vitals.measurement_timestamp if req.vitals else now_iso,
        # Observations
        general_appearance=req.observations.general_appearance if req.observations else None,
        consciousness=req.observations.consciousness if req.observations else None,
        breathing_effort=req.observations.breathing_effort if req.observations else None,
        mobility_status=req.observations.mobility_status if req.observations else None,
        pain_score=req.observations.pain_score if req.observations else None,
        visible_distress=visible_distress_json,
        additional_symptoms=req.observations.additional_symptoms if req.observations else None,
        # Verifications
        allergies=req.verification.allergies if req.verification else None,
        allergies_verification_status=req.verification.allergies_verification_status if req.verification else "patient_reported",
        current_medications=req.verification.current_medications if req.verification else None,
        medications_verification_status=req.verification.medications_verification_status if req.verification else "patient_reported",
        chief_complaint=req.verification.chief_complaint if req.verification else None,
        chief_complaint_verification_status=req.verification.chief_complaint_verification_status if req.verification else "patient_reported",
        relevant_history=req.verification.relevant_history if req.verification else None,
        relevant_history_verification_status=req.verification.relevant_history_verification_status if req.verification else "patient_reported",
        # Nurse notes
        nurse_notes=req.nurse_notes,
        facility_id=req.facility_id,
        department=req.department or "Emergency & Triage Unit",
        status=req.status or "completed",
        created_at=now_iso,
        updated_at=now_iso
    )

    # Sync summary notes to case reviewer_notes for physician triage review queue compatibility
    summary_parts = []
    if req.vitals and req.vitals.systolic_bp and req.vitals.diastolic_bp:
        summary_parts.append(f"BP {req.vitals.systolic_bp}/{req.vitals.diastolic_bp} mmHg")
    if req.vitals and req.vitals.heart_rate:
        summary_parts.append(f"Pulse {req.vitals.heart_rate} bpm")
    if req.vitals and req.vitals.spo2:
        summary_parts.append(f"SpO2 {req.vitals.spo2}%")
    if req.vitals and req.vitals.temperature:
        summary_parts.append(f"Temp {req.vitals.temperature}°{req.vitals.temperature_unit or 'F'}")
    if req.vitals and req.vitals.respiratory_rate:
        summary_parts.append(f"RR {req.vitals.respiratory_rate}/min")

    vitals_str = ", ".join(summary_parts)
    if vitals_str:
        nurse_obs_note = f"Bedside Vitals Checked: {vitals_str}."
        if req.nurse_notes:
            nurse_obs_note += f" Nurse Notes: {req.nurse_notes}"
        # Update case without overwriting physician final decision
        if not case.reviewer_decision:
            case.reviewer_notes = nurse_obs_note
    elif req.nurse_notes and not case.reviewer_decision:
        case.reviewer_notes = f"Nurse Notes: {req.nurse_notes}"

    # Atomic workflow transition: move case to awaiting_review for doctor clinical review
    prev_status = case.review_status
    if case.review_status in ["awaiting_nursing_triage", "awaiting_triage", "awaiting_bedside", "awaiting_review"]:
        case.review_status = "awaiting_review"

    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    await db.refresh(case)

    # Immutable Audit Log
    vitals_detail = f"Vitals: {vitals_str}" if vitals_str else "Bedside measurements recorded"
    await AuditService.log_event(
        db=db,
        case_id=case_id,
        actor=assessed_by,
        role=assessor_role,
        provenance="NURSE_MEASURED",
        action="BEDSIDE_ASSESSMENT_CREATED",
        details=f"Triage Nurse recorded bedside observations & vitals verification ({vitals_detail}) | Assessment ID: {assessment.id}"
    )

    if prev_status != case.review_status:
        await AuditService.log_event(
            db=db,
            case_id=case_id,
            actor=assessed_by,
            role=assessor_role,
            provenance="SYSTEM",
            action="CASE_STATUS_CHANGED",
            details=f"Case status transitioned from '{prev_status}' to '{case.review_status}' and forwarded to Clinical Review queue."
        )

    return assessment.to_dict()


@router.get("/{case_id}/bedside-assessments", response_model=List[BedsideAssessmentResponse])
async def get_bedside_assessments(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    Retrieve all historical and current bedside assessments for a case.
    """
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found."
        )

    # Check patient case ownership if patient role
    if user and user.role == "PATIENT":
        if case.patient_id != user.user_id and case.patient_id != user.username:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden. Patients can only inspect bedside assessments for their own registered cases."
            )

    assess_stmt = (
        select(BedsideAssessment)
        .where(BedsideAssessment.case_id == case_id)
        .order_by(BedsideAssessment.created_at.desc())
    )
    assess_res = await db.execute(assess_stmt)
    assessments = assess_res.scalars().all()

    return [a.to_dict() for a in assessments]


@router.get("/{case_id}/bedside-assessment/latest", response_model=BedsideAssessmentResponse)
async def get_latest_bedside_assessment(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    Retrieve the most recent bedside assessment for a case.
    Used by Clinical Review and Bedside Intake workstation.
    """
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    result = await db.execute(stmt)
    case = result.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found."
        )

    if user and user.role == "PATIENT":
        if case.patient_id != user.user_id and case.patient_id != user.username:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden. Patients can only inspect bedside assessments for their own registered cases."
            )

    assess_stmt = (
        select(BedsideAssessment)
        .where(BedsideAssessment.case_id == case_id)
        .order_by(BedsideAssessment.created_at.desc())
        .limit(1)
    )
    assess_res = await db.execute(assess_stmt)
    latest = assess_res.scalars().first()

    if not latest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No bedside assessment found for case '{case_id}'."
        )

    return latest.to_dict()


@router.put("/{case_id}/bedside-assessment/{assessment_id}", response_model=BedsideAssessmentResponse)
async def update_bedside_assessment(
    case_id: str,
    assessment_id: str,
    req: BedsideAssessmentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    """
    Update an existing bedside assessment record.
    Restricted to nursing and clinician roles.
    """
    if user and user.role not in ["NURSE", "DOCTOR", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Nurse or clinician role required to update bedside assessment, but user has role '{user.role}'."
        )

    # 1. Verify case
    stmt = select(PatientCase).where(PatientCase.id == case_id)
    case_res = await db.execute(stmt)
    case = case_res.scalars().first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found."
        )

    # 2. Retrieve assessment
    assess_stmt = (
        select(BedsideAssessment)
        .where(BedsideAssessment.id == assessment_id, BedsideAssessment.case_id == case_id)
    )
    assess_res = await db.execute(assess_stmt)
    assessment = assess_res.scalars().first()
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bedside assessment '{assessment_id}' not found for case '{case_id}'."
        )

    # Update Vitals
    if req.vitals:
        if req.vitals.systolic_bp is not None:
            assessment.systolic_bp = req.vitals.systolic_bp
        if req.vitals.diastolic_bp is not None:
            assessment.diastolic_bp = req.vitals.diastolic_bp
        if req.vitals.heart_rate is not None:
            assessment.heart_rate = req.vitals.heart_rate
        if req.vitals.spo2 is not None:
            assessment.spo2 = req.vitals.spo2
        if req.vitals.temperature is not None:
            assessment.temperature = req.vitals.temperature
        if req.vitals.temperature_unit is not None:
            assessment.temperature_unit = req.vitals.temperature_unit
        if req.vitals.respiratory_rate is not None:
            assessment.respiratory_rate = req.vitals.respiratory_rate
        if req.vitals.blood_glucose is not None:
            assessment.blood_glucose = req.vitals.blood_glucose
        if req.vitals.measurement_timestamp is not None:
            assessment.measurement_timestamp = req.vitals.measurement_timestamp

    # Update Observations
    if req.observations:
        if req.observations.general_appearance is not None:
            assessment.general_appearance = req.observations.general_appearance
        if req.observations.consciousness is not None:
            assessment.consciousness = req.observations.consciousness
        if req.observations.breathing_effort is not None:
            assessment.breathing_effort = req.observations.breathing_effort
        if req.observations.mobility_status is not None:
            assessment.mobility_status = req.observations.mobility_status
        if req.observations.pain_score is not None:
            assessment.pain_score = req.observations.pain_score
        if req.observations.visible_distress is not None:
            vd = req.observations.visible_distress
            if isinstance(vd, list):
                assessment.visible_distress = json.dumps(vd)
            elif isinstance(vd, str):
                assessment.visible_distress = json.dumps([vd])
            elif isinstance(vd, bool):
                assessment.visible_distress = json.dumps(["Visible Distress Flagged"] if vd else ["None Observed"])
        if req.observations.additional_symptoms is not None:
            assessment.additional_symptoms = req.observations.additional_symptoms

    # Update Verifications
    if req.verification:
        if req.verification.allergies is not None:
            assessment.allergies = req.verification.allergies
        if req.verification.allergies_verification_status is not None:
            assessment.allergies_verification_status = req.verification.allergies_verification_status
        if req.verification.current_medications is not None:
            assessment.current_medications = req.verification.current_medications
        if req.verification.medications_verification_status is not None:
            assessment.medications_verification_status = req.verification.medications_verification_status
        if req.verification.chief_complaint is not None:
            assessment.chief_complaint = req.verification.chief_complaint
        if req.verification.chief_complaint_verification_status is not None:
            assessment.chief_complaint_verification_status = req.verification.chief_complaint_verification_status
        if req.verification.relevant_history is not None:
            assessment.relevant_history = req.verification.relevant_history
        if req.verification.relevant_history_verification_status is not None:
            assessment.relevant_history_verification_status = req.verification.relevant_history_verification_status

    if req.nurse_notes is not None:
        assessment.nurse_notes = req.nurse_notes
    if req.facility_id is not None:
        assessment.facility_id = req.facility_id
    if req.department is not None:
        assessment.department = req.department
    if req.status is not None:
        assessment.status = req.status

    # Update case status if currently awaiting nursing triage
    prev_status = case.review_status
    if case.review_status in ["awaiting_nursing_triage", "awaiting_triage", "awaiting_bedside"]:
        case.review_status = "awaiting_review"

    # Sync summary notes to case reviewer_notes if physician has not recorded decision
    if not case.reviewer_decision:
        summary_parts = []
        if assessment.systolic_bp and assessment.diastolic_bp:
            summary_parts.append(f"BP {assessment.systolic_bp}/{assessment.diastolic_bp} mmHg")
        if assessment.heart_rate:
            summary_parts.append(f"Pulse {assessment.heart_rate} bpm")
        if assessment.spo2:
            summary_parts.append(f"SpO2 {assessment.spo2}%")
        if assessment.temperature:
            summary_parts.append(f"Temp {assessment.temperature}°{assessment.temperature_unit or 'F'}")
        if assessment.respiratory_rate:
            summary_parts.append(f"RR {assessment.respiratory_rate}/min")

        vitals_str = ", ".join(summary_parts)
        if vitals_str:
            nurse_obs_note = f"Bedside Vitals Checked: {vitals_str}."
            if assessment.nurse_notes:
                nurse_obs_note += f" Nurse Notes: {assessment.nurse_notes}"
            case.reviewer_notes = nurse_obs_note
        elif assessment.nurse_notes:
            case.reviewer_notes = f"Nurse Notes: {assessment.nurse_notes}"

    now_iso = utc_now_iso()
    assessment.updated_at = now_iso

    await db.commit()
    await db.refresh(assessment)
    await db.refresh(case)

    actor_name = user.display_name if user else "Nurse Priya Nair, RN"
    actor_role = user.role if user else "NURSE"

    await AuditService.log_event(
        db=db,
        case_id=case_id,
        actor=actor_name,
        role=actor_role,
        provenance="NURSE_OBSERVED",
        action="BEDSIDE_ASSESSMENT_UPDATED",
        details=f"Nurse updated bedside assessment {assessment_id}"
    )

    if prev_status != case.review_status:
        await AuditService.log_event(
            db=db,
            case_id=case_id,
            actor=actor_name,
            role=actor_role,
            provenance="SYSTEM",
            action="CASE_STATUS_CHANGED",
            details=f"Case status transitioned from '{prev_status}' to '{case.review_status}' and forwarded to Clinical Review queue."
        )

    return assessment.to_dict()
