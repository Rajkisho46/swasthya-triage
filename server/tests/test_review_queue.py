import pytest

@pytest.mark.asyncio
async def test_review_queue_and_decision_lifecycle(client, doctor_auth_header, nurse_auth_header):
    # 1. Submit two cases: one urgent and one routine
    res_urgent = await client.post("/api/intake", json={
        "patientId": "PAT-URGENT",
        "age": 60,
        "symptoms": "Severe chest pain and difficulty in breathing",
        "consentGiven": True
    })
    assert res_urgent.status_code == 200
    case_id_urgent = res_urgent.json()["caseId"]

    res_routine = await client.post("/api/intake", json={
        "patientId": "PAT-ROUTINE",
        "age": 22,
        "symptoms": "Mild sneezing for 1 day",
        "consentGiven": True
    })
    assert res_routine.status_code == 200
    case_id_routine = res_routine.json()["caseId"]

    # 2. Nurse conducts Bedside Assessment and sends to Clinical Review
    await client.post(f"/api/cases/{case_id_urgent}/bedside-assessment", json={
        "vitals": {"systolicBP": 160, "diastolicBP": 100, "heartRate": 115, "spo2": 90, "temperature": 99.1},
        "observation": {"generalAppearance": "Diaphoretic / Clammy", "breathingEffort": "Moderate Retractions / Wheezing"},
        "nurseNotes": "Patient in acute distress, diaphoresis noted.",
        "assessmentStatus": "pending_physician_review"
    }, headers=nurse_auth_header)

    await client.post(f"/api/cases/{case_id_routine}/bedside-assessment", json={
        "vitals": {"systolicBP": 120, "diastolicBP": 80, "heartRate": 72, "spo2": 99, "temperature": 98.6},
        "observation": {"generalAppearance": "Normal / Well-appearing"},
        "nurseNotes": "Vitals stable.",
        "assessmentStatus": "pending_physician_review"
    }, headers=nurse_auth_header)

    # 3. Check Queue Prioritization (Urgent should be ahead of Routine)
    res_queue = await client.get("/api/review/queue")
    assert res_queue.status_code == 200
    queue = res_queue.json()
    assert len(queue) >= 2
    
    # Urgent case should be at top
    assert queue[0]["caseId"] == case_id_urgent
    assert queue[0]["urgencyLevel"] == "HIGH_URGENCY"
    assert queue[0]["hasImmediateAttention"] is True

    # 3. Clinician reviews and records decision: ESCALATE
    res_dec = await client.post(f"/api/review/{case_id_urgent}/decision", json={
        "decision": "Escalate",
        "notes": "ECG required, immediate cardiology consult requested.",
        "reviewerName": "Dr. Ananya Sharma",
        "reviewerRole": "DOCTOR"
    }, headers=doctor_auth_header)
    assert res_dec.status_code == 200
    dec_data = res_dec.json()
    assert dec_data["success"] is True
    assert dec_data["decision"] == "Escalate"

    # 4. Verify case is now marked reviewed
    res_case = await client.get(f"/api/review/{case_id_urgent}")
    assert res_case.status_code == 200
    case_data = res_case.json()
    assert case_data["reviewStatus"] == "reviewed"
    assert case_data["reviewerDecision"] == "Escalate"
