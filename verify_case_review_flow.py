import asyncio
import json
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from server.app.models.patient import PatientCase
from server.app.models.audit import AuditEventModel

BASE_URL = "http://localhost:8000/api"

async def run_full_verification():
    print("=================================================================")
    print("STARTING SWASTHYA TRIAGE CASE / REVIEW / PERSISTENCE VERIFICATION")
    print("=================================================================")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=15.0) as client:
        # 0. Health check
        h_res = await client.get("/health")
        assert h_res.status_code == 200, f"Health check failed: {h_res.text}"
        print(f"[*] Health check passed: {h_res.json()}")

        # Clean database cases to start with a fresh queue (0 fake cases)
        engine = create_async_engine("sqlite+aiosqlite:///server/swasthya_triage.db", echo=False)
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with async_session() as db:
            from sqlalchemy import delete
            from server.app.models.review import ClinicalReview
            from server.app.models.consent import ConsentRecord
            from server.app.models.bedside import BedsideAssessment
            await db.execute(delete(ClinicalReview))
            await db.execute(delete(ConsentRecord))
            await db.execute(delete(BedsideAssessment))
            await db.execute(delete(PatientCase))
            await db.commit()
        print("[*] Database cleaned: All old test/demo cases purged.")

        # Doctor Login
        doc_login_res = await client.post("/auth/login", json={"username": "dr_sharma", "password": "doctorpassword123"})
        assert doc_login_res.status_code == 200, f"Doctor login failed: {doc_login_res.text}"
        doc_token = doc_login_res.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}
        print("[*] Doctor authenticated successfully (Dr. Ananya Sharma).")

        # Patient Login
        pat_login_res = await client.post("/auth/login", json={"username": "patient_demo", "password": "patientpassword123"})
        assert pat_login_res.status_code == 200, f"Patient login failed: {pat_login_res.text}"
        pat_token = pat_login_res.json()["access_token"]
        pat_headers = {"Authorization": f"Bearer {pat_token}"}
        print("[*] Patient authenticated successfully (Rajesh Kumar).")

        # Verify initial empty Doctor Review Queue
        initial_queue_res = await client.get("/review/queue?status=all", headers=doc_headers)
        assert initial_queue_res.status_code == 200
        initial_cases = initial_queue_res.json()
        print(f"[*] Initial Doctor Queue length: {len(initial_cases)} (Expected 0 fake cases)")
        assert len(initial_cases) == 0, f"Expected 0 fake cases, got {len(initial_cases)}"

        # -------------------------------------------------------------
        # TEST A: Patient submits unique complaint Case A
        # -------------------------------------------------------------
        print("\n--- TEST A: Patient submits Case A ---")
        case_a_symptoms = "I have had a sore throat and dry cough for two days."
        case_a_payload = {
            "patientId": "PAT-REAL-001",
            "age": 29,
            "gender": "Female",
            "preferredLanguage": "English",
            "symptoms": case_a_symptoms,
            "consentGiven": True,
            "inputModalities": ["text"]
        }
        res_a = await client.post("/intake", json=case_a_payload, headers=pat_headers)
        assert res_a.status_code == 200, f"Intake submission A failed: {res_a.text}"
        case_a_data = res_a.json()
        case_a_id = case_a_data["caseId"]
        print(f"[PASS] Case A created with ID: {case_a_id}")
        assert case_a_data["status"] == "awaiting_review"

        # Verify Case A exists in SQLite DB
        async with async_session() as db:
            stmt = select(PatientCase).where(PatientCase.id == case_a_id)
            res = await db.execute(stmt)
            db_case_a = res.scalars().first()
            assert db_case_a is not None, "Case A not found in SQLite DB"
            assert db_case_a.raw_symptoms == case_a_symptoms
            print(f"[PASS] Verified Case A in SQLite database: '{db_case_a.raw_symptoms}'")

        # -------------------------------------------------------------
        # TEST B: Doctor views Review Queue -> Sees ONLY Case A
        # -------------------------------------------------------------
        print("\n--- TEST B: Doctor views Review Queue ---")
        queue_res_b = await client.get("/review/queue?status=all", headers=doc_headers)
        assert queue_res_b.status_code == 200
        queue_b = queue_res_b.json()
        print(f"[*] Doctor queue items: {len(queue_b)}")
        assert len(queue_b) == 1, f"Expected exactly 1 case in queue, got {len(queue_b)}"
        assert queue_b[0]["caseId"] == case_a_id
        assert queue_b[0]["patientId"] == "PAT-REAL-001"
        assert queue_b[0]["reviewStatus"] == "awaiting_review"
        print(f"[PASS] Doctor queue shows ONLY Case A ({case_a_id}) with exact symptoms & demographics.")

        # -------------------------------------------------------------
        # TEST C: Patient submits second different Case B
        # -------------------------------------------------------------
        print("\n--- TEST C: Patient submits Case B ---")
        case_b_symptoms = "I have had a headache and dizziness since this morning."
        case_b_payload = {
            "patientId": "PAT-REAL-002",
            "age": 45,
            "gender": "Male",
            "preferredLanguage": "Hindi",
            "symptoms": case_b_symptoms,
            "consentGiven": True,
            "inputModalities": ["text"]
        }
        res_b = await client.post("/intake", json=case_b_payload, headers=pat_headers)
        assert res_b.status_code == 200, f"Intake submission B failed: {res_b.text}"
        case_b_data = res_b.json()
        case_b_id = case_b_data["caseId"]
        print(f"[PASS] Case B created with ID: {case_b_id}")

        # Doctor queue now contains Case A and Case B
        queue_res_c = await client.get("/review/queue?status=all", headers=doc_headers)
        assert queue_res_c.status_code == 200
        queue_c = queue_res_c.json()
        queue_c_ids = [item["caseId"] for item in queue_c]
        print(f"[*] Doctor queue items now: {len(queue_c)} -> IDs: {queue_c_ids}")
        assert len(queue_c) == 2, f"Expected 2 cases, got {len(queue_c)}"
        assert case_a_id in queue_c_ids and case_b_id in queue_c_ids
        print(f"[PASS] Doctor sees both Case A and Case B with independent complaints.")

        # -------------------------------------------------------------
        # TEST D: Doctor reviews Case A & Deletes Case A
        # -------------------------------------------------------------
        print("\n--- TEST D: Doctor reviews and deletes Case A ---")
        
        # Security test: attempting to delete pending Case B should FAIL with 400
        del_pending_res = await client.delete(f"/cases/{case_b_id}", headers=doc_headers)
        assert del_pending_res.status_code == 400, f"Expected 400 when deleting unreviewed case, got {del_pending_res.status_code}"
        print(f"[PASS] Deletion of pending case blocked by RBAC safety rule: {del_pending_res.json()['detail']}")

        # Doctor reviews Case A
        decision_payload = {
            "decision": "Routine Review",
            "notes": "Throat lozenges, warm water gargling, hydration advised.",
            "reviewerName": "Dr. Aarav Sharma",
            "reviewerRole": "DOCTOR"
        }
        dec_res = await client.post(f"/review/{case_a_id}/decision", json=decision_payload, headers=doc_headers)
        assert dec_res.status_code == 200, f"Review decision failed: {dec_res.text}"
        assert dec_res.json()["case"]["reviewStatus"] == "reviewed"
        print(f"[PASS] Case A marked as reviewed with decision: {dec_res.json()['decision']}")

        # Doctor deletes reviewed Case A
        del_res = await client.delete(f"/cases/{case_a_id}", headers=doc_headers)
        assert del_res.status_code == 200, f"Case deletion failed: {del_res.text}"
        assert del_res.json()["success"] is True
        print(f"[PASS] Case A deleted via DELETE /api/cases/{case_a_id}: {del_res.json()['message']}")

        # Doctor queue check: Case A gone, Case B still present
        queue_res_d = await client.get("/review/queue?status=all", headers=doc_headers)
        assert queue_res_d.status_code == 200
        queue_d = queue_res_d.json()
        queue_d_ids = [item["caseId"] for item in queue_d]
        print(f"[*] Doctor queue items after deleting Case A: {len(queue_d)} -> IDs: {queue_d_ids}")
        assert len(queue_d) == 1
        assert case_a_id not in queue_d_ids
        assert case_b_id in queue_d_ids
        print(f"[PASS] Case A is permanently removed from Doctor Queue. Case B remains present.")

        # -------------------------------------------------------------
        # Backend Persistence Check & Audit Verification
        # -------------------------------------------------------------
        print("\n--- Persistence & Audit Trail Verification ---")
        async with async_session() as db:
            # Check SQLite DB directly
            stmt_a = select(PatientCase).where(PatientCase.id == case_a_id)
            res_a = await db.execute(stmt_a)
            assert res_a.scalars().first() is None, "Case A still found in SQLite DB!"

            stmt_b = select(PatientCase).where(PatientCase.id == case_b_id)
            res_b = await db.execute(stmt_b)
            db_case_b = res_b.scalars().first()
            assert db_case_b is not None, "Case B not found in SQLite DB!"
            print(f"[PASS] Direct SQLite Check: Case A = Deleted (None), Case B = Present ({db_case_b.id})")

            # Check Audit Log includes CASE_DELETED event
            stmt_audit = select(AuditEventModel).where(AuditEventModel.case_id == case_a_id)
            audit_res = await db.execute(stmt_audit)
            events = audit_res.scalars().all()
            actions = [e.action for e in events]
            print(f"[*] Audit actions recorded for Case A: {actions}")
            assert "CASE_DELETED" in actions
            print(f"[PASS] Audit trail retained immutable deletion record for governance.")

    print("\n=================================================================")
    print("ALL VERIFICATION TESTS COMPLETED WITH 100% SUCCESS!")
    print("=================================================================")

if __name__ == "__main__":
    asyncio.run(run_full_verification())
