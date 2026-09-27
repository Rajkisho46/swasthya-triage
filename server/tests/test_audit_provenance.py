import pytest

@pytest.mark.asyncio
async def test_audit_trail_provenance_tracking(client, doctor_auth_header):
    # 1. Create intake case
    res_intake = await client.post("/api/intake", json={
        "patientId": "PAT-AUDIT-01",
        "age": 42,
        "symptoms": "High fever and cough",
        "consentGiven": True
    })
    assert res_intake.status_code == 200
    case_id = res_intake.json()["caseId"]

    # 2. Record Reviewer Decision
    await client.post(f"/api/review/{case_id}/decision", json={
        "decision": "Routine Review",
        "notes": "Paracetamol advised, hydration.",
        "reviewerName": "Dr. Ananya Sharma",
        "reviewerRole": "DOCTOR"
    }, headers=doctor_auth_header)

    # 3. Fetch Case Audit Trail
    res_audit = await client.get(f"/api/audit/{case_id}")
    assert res_audit.status_code == 200
    events = res_audit.json()
    assert len(events) >= 2

    provenances = [e["provenance"] for e in events]
    assert "PATIENT" in provenances
    assert "CLINICIAN" in provenances
