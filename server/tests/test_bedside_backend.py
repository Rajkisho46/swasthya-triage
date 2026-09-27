import pytest
import pytest_asyncio
import uuid
from httpx import AsyncClient
from server.app.models.patient import PatientCase
from server.app.models.audit import AuditEventModel
from server.app.models.bedside import BedsideAssessment
from sqlalchemy import select

@pytest.mark.asyncio
async def test_1_create_bedside_assessment(client: AsyncClient, test_db_session, nurse_auth_header):
    """1. Create and persist a new real-time bedside assessment."""
    case_id = "CASE-BEDSIDE-001"
    case = PatientCase(
        id=case_id,
        patient_id="usr_pat_01",
        preferred_language="English",
        raw_symptoms="Fever for 3 days",
        consent_given=True,
        review_status="awaiting_review"
    )
    test_db_session.add(case)
    await test_db_session.commit()

    payload = {
        "vitals": {
            "systolic_bp": 128,
            "diastolic_bp": 84,
            "heart_rate": 82,
            "spo2": 98,
            "temperature": 100.6,
            "temperature_unit": "F",
            "respiratory_rate": 18,
            "blood_glucose": 115,
            "measurement_timestamp": "2026-09-26T10:00:00Z"
        },
        "observations": {
            "general_appearance": "Mild Pallor / Ill",
            "consciousness": "Alert & Oriented (A)",
            "breathing_effort": "Normal / Unlabored",
            "mobility_status": "Ambulatory (Independent)",
            "pain_score": 2,
            "visible_distress": ["None Observed"],
            "additional_symptoms": "Skin warm to touch"
        },
        "verification": {
            "allergies": "No Known Drug Allergies (NKDA)",
            "allergies_verification_status": "nurse_verified",
            "current_medications": "Paracetamol 500mg SOS",
            "medications_verification_status": "nurse_verified",
            "chief_complaint": "Fever for 3 days",
            "chief_complaint_verification_status": "nurse_verified",
            "relevant_history": "No major chronic illnesses",
            "relevant_history_verification_status": "nurse_verified"
        },
        "nurse_notes": "Patient alert, oral hydration advised. Vitals checked and verified.",
        "facility_id": "FAC-01",
        "department": "Emergency Triage Unit",
        "status": "completed"
    }

    res = await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json=payload,
        headers=nurse_auth_header
    )
    assert res.status_code == 201
    data = res.json()
    assert data["case_id"] == case_id
    assert data["patient_id"] == "usr_pat_01"
    assert data["assessed_by"] == "Nurse Priya Nair, RN"
    assert data["vitals"]["systolic_bp"] == 128
    assert data["vitals"]["diastolic_bp"] == 84
    assert data["vitals"]["spo2"] == 98
    assert data["vitals"]["temperature"] == 100.6
    assert data["observations"]["consciousness"] == "Alert & Oriented (A)"
    assert data["observations"]["pain_score"] == 2
    assert data["verification"]["allergies_verification_status"] == "nurse_verified"
    assert data["nurse_notes"] == "Patient alert, oral hydration advised. Vitals checked and verified."


@pytest.mark.asyncio
async def test_2_retrieve_bedside_assessments(client: AsyncClient, test_db_session, nurse_auth_header):
    """2. Retrieve all saved bedside assessments for a case."""
    case_id = "CASE-BEDSIDE-002"
    case = PatientCase(
        id=case_id,
        patient_id="usr_pat_02",
        preferred_language="English",
        raw_symptoms="Headache",
        consent_given=True,
        review_status="awaiting_review"
    )
    test_db_session.add(case)
    await test_db_session.commit()

    # Create 2 assessments
    payload1 = {
        "vitals": {"systolic_bp": 130, "diastolic_bp": 85, "heart_rate": 80},
        "nurse_notes": "Initial bedside reading"
    }
    payload2 = {
        "vitals": {"systolic_bp": 125, "diastolic_bp": 80, "heart_rate": 74},
        "nurse_notes": "Follow-up bedside reading"
    }

    await client.post(f"/api/cases/{case_id}/bedside-assessment", json=payload1, headers=nurse_auth_header)
    await client.post(f"/api/cases/{case_id}/bedside-assessment", json=payload2, headers=nurse_auth_header)

    res = await client.get(f"/api/cases/{case_id}/bedside-assessments", headers=nurse_auth_header)
    assert res.status_code == 200
    assessments = res.json()
    assert len(assessments) == 2
    assert assessments[0]["case_id"] == case_id


@pytest.mark.asyncio
async def test_3_retrieve_latest_bedside_assessment(client: AsyncClient, test_db_session, doctor_auth_header):
    """3. Retrieve the latest saved bedside assessment."""
    case_id = "CASE-BEDSIDE-003"
    case = PatientCase(
        id=case_id,
        patient_id="usr_pat_03",
        preferred_language="English",
        raw_symptoms="Cough",
        consent_given=True,
        review_status="awaiting_review"
    )
    test_db_session.add(case)
    await test_db_session.commit()

    payload1 = {"vitals": {"systolic_bp": 120, "diastolic_bp": 80}, "nurse_notes": "First measurement"}
    payload2 = {"vitals": {"systolic_bp": 118, "diastolic_bp": 78}, "nurse_notes": "Latest measurement"}

    await client.post(f"/api/cases/{case_id}/bedside-assessment", json=payload1, headers=doctor_auth_header)
    await client.post(f"/api/cases/{case_id}/bedside-assessment", json=payload2, headers=doctor_auth_header)

    res = await client.get(f"/api/cases/{case_id}/bedside-assessment/latest", headers=doctor_auth_header)
    assert res.status_code == 200
    data = res.json()
    assert data["nurse_notes"] == "Latest measurement"
    assert data["vitals"]["systolic_bp"] == 118


@pytest.mark.asyncio
async def test_4_update_bedside_assessment(client: AsyncClient, test_db_session, nurse_auth_header):
    """4. Update an existing bedside assessment record."""
    case_id = "CASE-BEDSIDE-004"
    case = PatientCase(
        id=case_id,
        patient_id="usr_pat_04",
        preferred_language="English",
        raw_symptoms="Dizziness",
        consent_given=True,
        review_status="awaiting_review"
    )
    test_db_session.add(case)
    await test_db_session.commit()

    payload = {
        "vitals": {"systolic_bp": 140, "diastolic_bp": 90, "heart_rate": 95},
        "observations": {"general_appearance": "Normal / Well-appearing"},
        "nurse_notes": "Draft observation"
    }

    create_res = await client.post(f"/api/cases/{case_id}/bedside-assessment", json=payload, headers=nurse_auth_header)
    assessment_id = create_res.json()["id"]

    update_payload = {
        "vitals": {"systolic_bp": 135, "diastolic_bp": 86, "heart_rate": 88},
        "observations": {"general_appearance": "Mild Pallor / Ill"},
        "nurse_notes": "Updated post-hydration observation"
    }

    put_res = await client.put(
        f"/api/cases/{case_id}/bedside-assessment/{assessment_id}",
        json=update_payload,
        headers=nurse_auth_header
    )
    assert put_res.status_code == 200
    updated_data = put_res.json()
    assert updated_data["vitals"]["systolic_bp"] == 135
    assert updated_data["observations"]["general_appearance"] == "Mild Pallor / Ill"
    assert updated_data["nurse_notes"] == "Updated post-hydration observation"


@pytest.mark.asyncio
async def test_5_case_not_found_handling(client: AsyncClient, nurse_auth_header):
    """5. Returns 404 cleanly when case does not exist."""
    res = await client.post(
        "/api/cases/NON_EXISTENT_CASE_999/bedside-assessment",
        json={"vitals": {"systolic_bp": 120, "diastolic_bp": 80}},
        headers=nurse_auth_header
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_6_invalid_vital_input_validation(client: AsyncClient, test_db_session, nurse_auth_header):
    """6. Request validation rejects malformed vitals (e.g. systolic < diastolic, SpO2 > 100, pain > 10)."""
    case_id = "CASE-BEDSIDE-006"
    case = PatientCase(
        id=case_id,
        patient_id="usr_pat_06",
        preferred_language="English",
        raw_symptoms="Abdominal discomfort",
        consent_given=True,
        review_status="awaiting_review"
    )
    test_db_session.add(case)
    await test_db_session.commit()

    # Case A: Systolic provided without Diastolic
    res_a = await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json={"vitals": {"systolic_bp": 120}},
        headers=nurse_auth_header
    )
    assert res_a.status_code == 422

    # Case B: Systolic < Diastolic (impossible hemodynamics)
    res_b = await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json={"vitals": {"systolic_bp": 70, "diastolic_bp": 110}},
        headers=nurse_auth_header
    )
    assert res_b.status_code == 422

    # Case C: Invalid pain score > 10
    res_c = await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json={"observations": {"pain_score": 15}},
        headers=nurse_auth_header
    )
    assert res_c.status_code == 422


@pytest.mark.asyncio
async def test_7_8_role_restriction_and_security(client: AsyncClient, test_db_session, patient_auth_header, nurse_auth_header):
    """7 & 8. Patient role cannot create bedside assessments (403 Forbidden)."""
    case_id = "CASE-BEDSIDE-007"
    case = PatientCase(
        id=case_id,
        patient_id="usr_pat_07",
        preferred_language="English",
        raw_symptoms="Sore throat",
        consent_given=True,
        review_status="awaiting_review"
    )
    test_db_session.add(case)
    await test_db_session.commit()

    # Patient attempt to post bedside assessment -> 403 Forbidden
    res = await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json={"vitals": {"systolic_bp": 120, "diastolic_bp": 80}},
        headers=patient_auth_header
    )
    assert res.status_code == 403

    # Nurse attempt -> 201 Created
    nurse_res = await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json={"vitals": {"systolic_bp": 120, "diastolic_bp": 80}},
        headers=nurse_auth_header
    )
    assert nurse_res.status_code == 201


@pytest.mark.asyncio
async def test_9_audit_event_creation(client: AsyncClient, test_db_session, nurse_auth_header):
    """9. Verifies immutable Audit Event was created with NURSE_MEASURED provenance."""
    case_id = "CASE-BEDSIDE-009"
    case = PatientCase(
        id=case_id,
        patient_id="usr_pat_09",
        preferred_language="English",
        raw_symptoms="High fever",
        consent_given=True,
        review_status="awaiting_review"
    )
    test_db_session.add(case)
    await test_db_session.commit()

    payload = {
        "vitals": {"systolic_bp": 122, "diastolic_bp": 80, "heart_rate": 78, "spo2": 99},
        "nurse_notes": "Triage vitals recorded"
    }

    res = await client.post(f"/api/cases/{case_id}/bedside-assessment", json=payload, headers=nurse_auth_header)
    assert res.status_code == 201

    # Query audit events table
    stmt = select(AuditEventModel).where(AuditEventModel.case_id == case_id)
    audit_res = await test_db_session.execute(stmt)
    events = audit_res.scalars().all()

    assert len(events) >= 1
    bedside_event = [e for e in events if e.action == "BEDSIDE_ASSESSMENT_CREATED"][0]
    assert bedside_event.actor == "Nurse Priya Nair, RN"
    assert bedside_event.provenance == "NURSE_MEASURED"
    assert "BP 122/80" in bedside_event.details


@pytest.mark.asyncio
async def test_10_persistence_and_no_decision_overwrite(client: AsyncClient, test_db_session, nurse_auth_header, doctor_auth_header):
    """10. Multiple assessments persist chronologically without overwriting clinical decisions."""
    case_id = "CASE-BEDSIDE-010"
    case = PatientCase(
        id=case_id,
        patient_id="usr_pat_10",
        preferred_language="English",
        raw_symptoms="Chest heaviness",
        consent_given=True,
        review_status="awaiting_review"
    )
    test_db_session.add(case)
    await test_db_session.commit()

    # 1. Nurse adds assessment
    await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json={"vitals": {"systolic_bp": 145, "diastolic_bp": 92, "heart_rate": 96}, "nurse_notes": "Urgent vitals"},
        headers=nurse_auth_header
    )

    # 2. Doctor confirms decision 'Escalate'
    decision_payload = {
        "decision": "Escalate",
        "notes": "Hypoxia and tachycardia noted. Priority physician evaluation."
    }
    review_res = await client.post(f"/api/review/{case_id}/decision", json=decision_payload, headers=doctor_auth_header)
    assert review_res.status_code == 200

    # 3. Nurse records follow-up bedside measurement
    await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json={"vitals": {"systolic_bp": 138, "diastolic_bp": 88, "heart_rate": 88}, "nurse_notes": "Re-check after oxygen"},
        headers=nurse_auth_header
    )

    # 4. Check case still has reviewed status and reviewer decision intact
    refreshed_case = (await test_db_session.execute(select(PatientCase).where(PatientCase.id == case_id))).scalars().first()
    assert refreshed_case.review_status == "reviewed"
    assert refreshed_case.reviewer_decision == "Escalate"

    # 5. Check both bedside assessments are preserved in the DB
    stmt = select(BedsideAssessment).where(BedsideAssessment.case_id == case_id).order_by(BedsideAssessment.created_at.asc())
    all_bedside = (await test_db_session.execute(stmt)).scalars().all()
    assert len(all_bedside) == 2
    assert all_bedside[0].systolic_bp == 145
    assert all_bedside[1].systolic_bp == 138
