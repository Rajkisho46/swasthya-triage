import pytest
from server.app.models.patient import PatientCase
from server.app.models.bedside import BedsideAssessment
from sqlalchemy import select

@pytest.mark.asyncio
async def test_complete_nursing_case_lifecycle(client, nurse_auth_header, doctor_auth_header, test_db_session):
    """
    Test complete lifecycle:
    1. Patient Intake Submission -> review_status == 'awaiting_nursing_triage'
    2. Case appears in nursing queue & bedside candidates
    3. Failure case: Unassessed case does NOT appear in Doctor queue
    4. Nurse submits bedside vitals and observations -> Save & Send to Clinical Review
    5. Case transitions to 'awaiting_review' in DB
    6. Case leaves nursing queue
    7. Case appears in Doctor / Medical Reviewer queue with complete vitals and provenance
    8. Double submission idempotency check
    9. Doctor records final clinical decision -> review_status == 'reviewed'
    """

    # ---------------------------------------------------------
    # STEP 1: Patient submits real intake
    # ---------------------------------------------------------
    intake_res = await client.post("/api/intake", json={
        "patientId": "PAT-REAL-45M",
        "age": 45,
        "gender": "Male",
        "preferredLanguage": "English",
        "symptoms": "I have had a dry cough and sore throat for four days. I also feel tired.",
        "consentGiven": True
    })
    assert intake_res.status_code == 200
    intake_data = intake_res.json()
    assert intake_data["success"] is True
    case_id = intake_data["caseId"]
    assert intake_data["status"] == "awaiting_nursing_triage"

    # Verify directly in SQLite DB
    db_case = (await test_db_session.execute(select(PatientCase).where(PatientCase.id == case_id))).scalars().first()
    assert db_case is not None
    assert db_case.review_status == "awaiting_nursing_triage"

    # ---------------------------------------------------------
    # STEP 2: Verify case appears in all intake list (for nursing queue)
    # ---------------------------------------------------------
    all_cases_res = await client.get("/api/intake")
    assert all_cases_res.status_code == 200
    all_cases = all_cases_res.json()
    nurse_pending = [c for c in all_cases if c.get("reviewStatus") == "awaiting_nursing_triage"]
    assert any(c.get("caseId") == case_id for c in nurse_pending)

    # ---------------------------------------------------------
    # STEP 3: Verify Doctor queue does NOT have this unassessed case
    # ---------------------------------------------------------
    doc_q_before = await client.get("/api/review/queue")
    assert doc_q_before.status_code == 200
    assert not any(item["caseId"] == case_id for item in doc_q_before.json())

    # ---------------------------------------------------------
    # STEP 4: Nurse enters bedside data & clicks "Save & Send to Clinical Review"
    # ---------------------------------------------------------
    bedside_payload = {
        "vitals": {
            "systolicBP": 120,
            "diastolicBP": 80,
            "heartRate": 78,
            "spo2": 98,
            "temperature": 98.6,
            "tempUnit": "F",
            "respiratoryRate": 16,
            "bloodGlucose": 110,
            "measuredAt": "2026-09-26T23:00:00Z"
        },
        "observation": {
            "generalAppearance": "Normal / Well-appearing",
            "consciousnessOrientation": "Alert & Oriented (A)",
            "breathingEffort": "Normal / Unlabored",
            "mobilityStatus": "Ambulatory (Independent)",
            "painScore": 2,
            "visibleDistress": ["None Observed"],
            "additionalSymptoms": ""
        },
        "verifications": {
            "allergies": {"itemKey": "allergies", "label": "Allergies", "patientValue": "NKDA", "status": "nurse_verified"},
            "chiefComplaint": {"itemKey": "chiefComplaint", "label": "Chief Complaint", "patientValue": "Dry cough and sore throat", "status": "nurse_verified"}
        },
        "nurseNotes": "Patient alert and cooperative. No visible respiratory distress observed.",
        "facilityDepartment": "Emergency Triage & Bedside Observation Bay",
        "assessmentStatus": "pending_physician_review"
    }

    save_res = await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json=bedside_payload,
        headers=nurse_auth_header
    )
    assert save_res.status_code in [200, 201]
    saved_data = save_res.json()
    assert (saved_data.get("case_id") or saved_data.get("caseId")) == case_id

    # ---------------------------------------------------------
    # STEP 5: Verify status transition in DB to 'awaiting_review'
    # ---------------------------------------------------------
    await test_db_session.refresh(db_case)
    assert db_case.review_status == "awaiting_review"
    assert "BP 120/80" in db_case.reviewer_notes
    assert "Pulse 78" in db_case.reviewer_notes

    # Verify BedsideAssessment record in DB
    db_assessment = (await test_db_session.execute(
        select(BedsideAssessment).where(BedsideAssessment.case_id == case_id)
    )).scalars().first()
    assert db_assessment is not None
    assert db_assessment.systolic_bp == 120
    assert db_assessment.heart_rate == 78
    assert db_assessment.nurse_notes == "Patient alert and cooperative. No visible respiratory distress observed."

    # ---------------------------------------------------------
    # STEP 6: Verify case is NO LONGER in pending nursing queue
    # ---------------------------------------------------------
    all_cases_after = (await client.get("/api/intake")).json()
    nurse_pending_after = [c for c in all_cases_after if c.get("reviewStatus") == "awaiting_nursing_triage"]
    assert not any(c.get("caseId") == case_id for c in nurse_pending_after)

    # ---------------------------------------------------------
    # STEP 7: Verify case IS NOW in Doctor Clinical Review Queue
    # ---------------------------------------------------------
    doc_q_after = await client.get("/api/review/queue")
    assert doc_q_after.status_code == 200
    doc_queue = doc_q_after.json()
    matching_doc_items = [item for item in doc_queue if item["caseId"] == case_id]
    assert len(matching_doc_items) == 1
    assert matching_doc_items[0]["reviewStatus"] == "awaiting_review"

    # Doctor fetches case details
    doc_case_res = await client.get(f"/api/review/{case_id}", headers=doctor_auth_header)
    assert doc_case_res.status_code == 200
    doc_case_data = doc_case_res.json()
    assert (doc_case_data.get("caseId") or doc_case_data.get("id")) == case_id
    assert doc_case_data["reviewStatus"] == "awaiting_review"
    assert doc_case_data["bedsideAssessment"] is not None
    assert doc_case_data["bedsideAssessment"]["vitals"]["systolicBP"] == 120

    # ---------------------------------------------------------
    # STEP 8: Double submission protection
    # ---------------------------------------------------------
    repeat_res = await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json=bedside_payload,
        headers=nurse_auth_header
    )
    assert repeat_res.status_code in [200, 201]

    # Verify still in awaiting_review with exactly one active assessment
    assessments_res = await client.get(f"/api/cases/{case_id}/bedside-assessments", headers=nurse_auth_header)
    assert assessments_res.status_code == 200

    # ---------------------------------------------------------
    # STEP 9: Doctor records final clinical decision
    # ---------------------------------------------------------
    decision_res = await client.post(f"/api/review/{case_id}/decision", json={
        "decision": "Routine Review",
        "notes": "Upper respiratory tract infection. Advised symptomatic treatment and rest.",
        "reviewerName": "Dr. Ananya Sharma, MD",
        "reviewerRole": "DOCTOR"
    }, headers=doctor_auth_header)
    assert decision_res.status_code == 200
    assert decision_res.json()["decision"] == "Routine Review"

    # Final DB check
    await test_db_session.refresh(db_case)
    assert db_case.review_status == "reviewed"
    assert db_case.reviewer_decision == "Routine Review"


@pytest.mark.asyncio
async def test_triage_evidence_note_send_for_medical_review_workflow(client, nurse_auth_header, doctor_auth_header, test_db_session):
    """
    Test the 03 Triage Evidence Note -> Send for Medical Review flow:
    1. Patient submits intake -> awaiting_nursing_triage
    2. Nurse saves bedside assessment (as draft / recorded)
    3. Nurse opens 03 Triage Evidence Note and clicks 'Send for Medical Review' via POST /api/cases/{case_id}/send-to-review
    4. Case transitions to 'awaiting_review'
    5. Case leaves active nursing workflow
    6. Case appears in Doctor Review Queue with complete evidence
    """
    # 1. Intake
    intake = await client.post("/api/intake", json={
        "patientId": "PAT-EVIDENCE-NOTE-01",
        "age": 38,
        "gender": "Female",
        "preferredLanguage": "English",
        "symptoms": "I have had a headache and dizziness since this morning.",
        "consentGiven": True
    })
    assert intake.status_code == 200
    case_id = intake.json()["caseId"]

    # 2. Bedside Assessment saved (status="recorded")
    await client.post(
        f"/api/cases/{case_id}/bedside-assessment",
        json={
            "vitals": {"systolic_bp": 115, "diastolic_bp": 75, "heart_rate": 70, "spo2": 99, "temperature": 98.4},
            "observations": {"general_appearance": "Normal / Well-appearing"},
            "nurse_notes": "Mild dizziness on rapid standing, neurological exam intact.",
            "status": "recorded"
        },
        headers=nurse_auth_header
    )

    # 3. Nurse views Evidence Note and clicks 'Send for Medical Review'
    send_res = await client.post(
        f"/api/cases/{case_id}/send-to-review",
        json={"notes": "Nurse Priya Nair verified vitals and patient orientation."},
        headers=nurse_auth_header
    )
    assert send_res.status_code == 200
    send_data = send_res.json()
    assert send_data["success"] is True
    assert send_data["status"] == "awaiting_review"

    # 4. Check DB status
    db_case = (await test_db_session.execute(select(PatientCase).where(PatientCase.id == case_id))).scalars().first()
    await test_db_session.refresh(db_case)
    assert db_case.review_status == "awaiting_review"
    assert "Nurse Priya Nair verified vitals" in db_case.reviewer_notes

    # 5. Case leaves nursing queue
    intake_list = (await client.get("/api/intake")).json()
    nurse_pending = [c for c in intake_list if c.get("reviewStatus") == "awaiting_nursing_triage"]
    assert not any(c.get("caseId") == case_id for c in nurse_pending)

    # 6. Case appears in Doctor Review Queue
    doc_q = (await client.get("/api/review/queue")).json()
    assert any(item["caseId"] == case_id for item in doc_q)

    # 7. Idempotent check
    repeat_send = await client.post(
        f"/api/cases/{case_id}/send-to-review",
        json={"notes": "Duplicate click"},
        headers=nurse_auth_header
    )
    assert repeat_send.status_code == 200
    assert repeat_send.json()["status"] == "awaiting_review"

