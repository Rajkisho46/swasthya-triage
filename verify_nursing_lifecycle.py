import asyncio
import httpx
import sqlite3
import json

BASE_URL = "http://127.0.0.1:8000"
DB_PATH = "server/swasthya_triage.db"

async def run_verification():
    print("=" * 60)
    print("STARTING END-TO-END NURSING LIFECYCLE VERIFICATION")
    print("=" * 60)

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # Step 1: Login as Nurse and Doctor to obtain valid tokens
        nurse_login = await client.post("/api/auth/login", json={"username": "nurse_priya", "password": "nursepassword123"})
        assert nurse_login.status_code == 200, f"Nurse login failed: {nurse_login.text}"
        nurse_token = nurse_login.json()["access_token"]
        nurse_headers = {"Authorization": f"Bearer {nurse_token}"}

        doc_login = await client.post("/api/auth/login", json={"username": "dr_sharma", "password": "doctorpassword123"})
        assert doc_login.status_code == 200, f"Doctor login failed: {doc_login.text}"
        doc_token = doc_login.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}

        print("[OK] Authentication verified for Nurse and Doctor.")

        # Step 2: Create a real new patient case via POST /api/intake
        intake_payload = {
            "patientId": "PAT-LIFECYCLE-45M",
            "age": 45,
            "gender": "Male",
            "preferredLanguage": "English",
            "symptoms": "I have had a dry cough and sore throat for four days. I also feel tired.",
            "consentGiven": True
        }
        res_intake = await client.post("/api/intake", json=intake_payload)
        assert res_intake.status_code == 200, f"Intake failed: {res_intake.text}"
        case_data = res_intake.json()
        case_id = case_data["caseId"]
        print(f"[OK] Patient intake created case: {case_id} (Initial status: {case_data['status']})")
        assert case_data["status"] == "awaiting_nursing_triage", f"Expected awaiting_nursing_triage, got {case_data['status']}"

        # Step 3: Check Nursing Queue (should be present)
        all_cases = (await client.get("/api/intake")).json()
        nurse_queue = [c for c in all_cases if c.get("reviewStatus") == "awaiting_nursing_triage"]
        assert any((c.get("caseId") or c.get("id")) == case_id for c in nurse_queue), "Case not found in Nursing Queue!"
        print(f"[OK] Case {case_id} is correctly present in Nursing Queue (pending nurse triage).")

        # Step 4: Check Doctor Review Queue (must NOT be present yet)
        doc_q_before = (await client.get("/api/review/queue", headers=doc_headers)).json()
        assert not any(item["caseId"] == case_id for item in doc_q_before), "Case should NOT appear in Doctor queue before bedside triage!"
        print(f"[OK] Case {case_id} is NOT visible in Doctor Review Queue prior to nurse completion.")

        # Step 5: Nurse enters bedside data & submits "Save & Send to Clinical Review"
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

        res_bedside = await client.post(
            f"/api/cases/{case_id}/bedside-assessment",
            json=bedside_payload,
            headers=nurse_headers
        )
        assert res_bedside.status_code in [200, 201], f"Bedside save failed: {res_bedside.text}"
        print(f"[OK] Nurse Bedside Assessment submitted successfully (HTTP {res_bedside.status_code}).")

        # Step 6: Verify Nursing Queue (case MUST HAVE LEFT nursing queue)
        all_cases_after = (await client.get("/api/intake")).json()
        nurse_queue_after = [c for c in all_cases_after if c.get("reviewStatus") == "awaiting_nursing_triage"]
        assert not any((c.get("caseId") or c.get("id")) == case_id for c in nurse_queue_after), "Case still in Nursing Queue after submission!"
        print(f"[OK] Case {case_id} has DISAPPEARED from Nursing Queue / Bedside Intake.")

        # Step 7: Verify Doctor Review Queue (case MUST BE PRESENT now)
        doc_q_after = (await client.get("/api/review/queue", headers=doc_headers)).json()
        matching_doc = [item for item in doc_q_after if item["caseId"] == case_id]
        assert len(matching_doc) == 1, f"Case {case_id} not found in Doctor Review Queue!"
        assert matching_doc[0]["reviewStatus"] == "awaiting_review"
        print(f"[OK] Case {case_id} is NOW PRESENT in Doctor Review Queue with reviewStatus='awaiting_review'.")

        # Step 8: Doctor inspects full case details
        case_detail = (await client.get(f"/api/review/{case_id}", headers=doc_headers)).json()
        assert case_detail["reviewStatus"] == "awaiting_review"
        assert case_detail["bedsideAssessment"] is not None
        assert case_detail["bedsideAssessment"]["vitals"]["systolicBP"] == 120
        assert case_detail["bedsideAssessment"]["vitals"]["heartRate"] == 78
        print(f"[OK] Doctor can inspect all patient + AI + nurse bedside measurements & notes.")

        # Step 9: Verify direct SQLite database persistence
        db_file = "server/swasthya_triage.db"
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        cursor.execute("SELECT id, review_status, reviewer_notes FROM cases WHERE id = ?", (case_id,))
        row = cursor.fetchone()
        assert row is not None, "Case not found in SQLite DB!"
        assert row[1] == "awaiting_review", f"DB review_status expected 'awaiting_review', got '{row[1]}'"
        print(f"[OK] SQLite DB directly verified: Case {row[0]} has review_status='{row[1]}'.")

        cursor.execute("SELECT id, systolic_bp, heart_rate, nurse_notes FROM bedside_assessments WHERE case_id = ?", (case_id,))
        b_row = cursor.fetchone()
        assert b_row is not None, "BedsideAssessment record not found in SQLite DB!"
        assert b_row[1] == 120 and b_row[2] == 78
        print(f"[OK] SQLite DB directly verified: BedsideAssessment {b_row[0]} linked to case with BP={b_row[1]}, HR={b_row[2]}.")

        # Step 10: Doctor records final clinical decision
        decision_res = await client.post(
            f"/api/review/{case_id}/decision",
            json={
                "decision": "Routine Review",
                "notes": "Upper respiratory tract infection. Advised symptomatic treatment and rest.",
                "reviewerName": "Dr. Ananya Sharma, MD",
                "reviewerRole": "DOCTOR"
            },
            headers=doc_headers
        )
        assert decision_res.status_code == 200
        print(f"[OK] Doctor confirmed clinical decision: 'Routine Review'.")

        cursor.execute("SELECT review_status, reviewer_decision FROM cases WHERE id = ?", (case_id,))
        final_row = cursor.fetchone()
        assert final_row[0] == "reviewed" and final_row[1] == "Routine Review"
        print(f"[OK] SQLite DB directly verified: Case {case_id} has final status='reviewed', decision='Routine Review'.")
        conn.close()

    print("=" * 60)
    print("ALL NURSING LIFECYCLE WORKFLOW VERIFICATION CHECKS PASSED!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_verification())
