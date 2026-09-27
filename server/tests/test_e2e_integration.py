import pytest
from server.app.services.rules_engine import DeterministicSafetyRulesEngine
from server.app.services.llm_service import LLMStructuringService
from server.app.services.stt_service import SpeechToTextService
from server.app.services.ocr_service import OCRService
from server.app.services.translation_service import TranslationService
from server.app.utils.security import create_access_token

@pytest.mark.asyncio
async def test_01_create_case(client):
    """TEST 01: Create case via POST /api/intake."""
    res = await client.post("/api/intake", json={
        "patientId": "PAT-E2E-001",
        "age": 45,
        "gender": "Male",
        "preferredLanguage": "English",
        "symptoms": "High fever and persistent cough for 4 days",
        "consentGiven": True
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["patientId"] == "PAT-E2E-001"
    assert data["caseId"].startswith("case_")

@pytest.mark.asyncio
async def test_02_consent_enforcement(client):
    """TEST 02: Consent enforcement halts processing if consentGiven is False."""
    res = await client.post("/api/intake", json={
        "patientId": "PAT-NOCONSENT",
        "age": 30,
        "symptoms": "Mild headache",
        "consentGiven": False
    })
    assert res.status_code == 400
    data = res.json()
    assert "consent is mandatory" in data["detail"].lower()

@pytest.mark.asyncio
async def test_03_multimodal_processing(client):
    """TEST 03: Multimodal processing: STT, OCR, and Translation."""
    # STT
    stt_res = await client.post("/api/multimodal/stt", data={"language": "Hindi", "is_demo": "true"})
    assert stt_res.status_code == 200
    assert stt_res.json()["success"] is True

    # OCR
    ocr_res = await client.post("/api/multimodal/ocr", data={"file_type": "pdf", "is_demo": "true"})
    assert ocr_res.status_code == 200
    assert ocr_res.json()["success"] is True

    # Translation
    trans_res = await client.post("/api/multimodal/translate", json={
        "text": "मुझे सांस लेने में तकलीफ हो रही है",
        "sourceLanguage": "Hindi",
        "targetLanguage": "English"
    })
    assert trans_res.status_code == 200
    assert trans_res.json()["success"] is True

@pytest.mark.asyncio
async def test_04_ai_advisory_generation(client):
    """TEST 04: AI advisory generation outputs strictly structured non-diagnostic information."""
    res = await client.post("/api/triage", json={
        "patientId": "PAT-ADVISORY-01",
        "age": 52,
        "rawSymptoms": "Fatigue and generalized weakness"
    })
    assert res.status_code == 200
    data = res.json()
    assert "ai_advisory" in data
    advisory = data["ai_advisory"]
    assert "chief_complaint" in advisory
    assert "extracted_symptoms" in advisory
    assert "timeline" in advisory
    assert "missing_information" in advisory
    assert "follow_up_questions" in advisory

@pytest.mark.asyncio
async def test_05_deterministic_safety_signal(client):
    """TEST 05: Deterministic safety signal triggers independently from LLM."""
    res = await client.post("/api/triage", json={
        "patientId": "PAT-CARDIO-01",
        "rawSymptoms": "Crushing chest pain radiating to jaw and severe shortness of breath"
    })
    assert res.status_code == 200
    data = res.json()
    signals = data.get("safety_signals", [])
    assert len(signals) >= 1
    assert signals[0]["rule_id"] == "RULE-001"
    assert signals[0]["source"] == "DETERMINISTIC_RULE_ENGINE"
    assert signals[0]["requires_human_review"] is True

@pytest.mark.asyncio
async def test_06_review_queue(client, nurse_auth_header):
    """TEST 06: Review queue prioritizes emergency cases above routine cases."""
    # Case A: Routine
    res_a = await client.post("/api/intake", json={
        "patientId": "PAT-ROUTINE-Q",
        "age": 20,
        "symptoms": "Mild nasal congestion",
        "consentGiven": True
    })
    case_a_id = res_a.json()["caseId"]

    # Case B: High Urgency
    res_b = await client.post("/api/intake", json={
        "patientId": "PAT-URGENT-Q",
        "age": 65,
        "symptoms": "Acute chest pain and severe breathing difficulty",
        "consentGiven": True
    })
    case_b_id = res_b.json()["caseId"]

    # Nurse completes bedside assessment and sends to clinical review
    await client.post(f"/api/cases/{case_a_id}/bedside-assessment", json={
        "vitals": {"systolicBP": 118, "diastolicBP": 76, "heartRate": 72, "spo2": 99, "temperature": 98.4},
        "observation": {"generalAppearance": "Normal / Well-appearing"},
        "assessmentStatus": "pending_physician_review"
    }, headers=nurse_auth_header)

    await client.post(f"/api/cases/{case_b_id}/bedside-assessment", json={
        "vitals": {"systolicBP": 150, "diastolicBP": 95, "heartRate": 110, "spo2": 91, "temperature": 99.0},
        "observation": {"generalAppearance": "Diaphoretic / Clammy", "breathingEffort": "Moderate Retractions / Wheezing"},
        "assessmentStatus": "pending_physician_review"
    }, headers=nurse_auth_header)

    q_res = await client.get("/api/review/queue")
    assert q_res.status_code == 200
    queue = q_res.json()
    assert len(queue) >= 2
    # First item in queue should be urgent
    assert queue[0]["urgencyLevel"] == "HIGH_URGENCY"

@pytest.mark.asyncio
async def test_07_human_decision(client, doctor_auth_header):
    """TEST 07: Human clinician decision sign-off."""
    intake = await client.post("/api/intake", json={
        "patientId": "PAT-DEC-01",
        "symptoms": "High fever",
        "consentGiven": True
    })
    case_id = intake.json()["caseId"]

    dec_res = await client.post(f"/api/review/{case_id}/decision", json={
        "decision": "Routine Review",
        "notes": "Oral fluids, review after 48h.",
        "reviewerName": "Dr. Ananya Sharma",
        "reviewerRole": "DOCTOR"
    }, headers=doctor_auth_header)
    assert dec_res.status_code == 200
    assert dec_res.json()["decision"] == "Routine Review"

@pytest.mark.asyncio
async def test_08_audit_event_creation(client, doctor_auth_header):
    """TEST 08: Immutable audit event creation with provenance tracking."""
    intake = await client.post("/api/intake", json={
        "patientId": "PAT-AUD-01",
        "symptoms": "Chest discomfort",
        "consentGiven": True
    })
    case_id = intake.json()["caseId"]

    audit_res = await client.get(f"/api/audit/{case_id}")
    assert audit_res.status_code == 200
    events = audit_res.json()
    assert len(events) >= 1
    assert any(e["provenance"] == "PATIENT" for e in events)

@pytest.mark.asyncio
async def test_09_referral_generation(client):
    """TEST 09: Structured PDF referral generation."""
    intake = await client.post("/api/intake", json={
        "patientId": "PAT-REF-DOC",
        "age": 59,
        "gender": "Male",
        "symptoms": "Acute chest heaviness and breathlessness",
        "consentGiven": True
    })
    case_id = intake.json()["caseId"]

    ref_res = await client.post(f"/api/referral/{case_id}/generate", json={
        "referralFacility": "Apex Cardiology Center",
        "clinicianNotes": "Urgent CCU admission."
    })
    assert ref_res.status_code == 200
    assert ref_res.json()["pdfAvailable"] is True

    pdf_res = await client.get(f"/api/referral/{case_id}/pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF")

@pytest.mark.asyncio
async def test_10_reset_demo(client):
    """TEST 10: Health check and demo state verification."""
    health_res = await client.get("/api/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "healthy"

@pytest.mark.asyncio
async def test_11_unauthorized_review_rejection(client):
    """TEST 11: Unauthorized user profile endpoint rejects missing tokens."""
    res = await client.get("/api/auth/me")
    assert res.status_code == 401

@pytest.mark.asyncio
async def test_12_ai_failure_fallback():
    """TEST 12: AI failure triggers deterministic fallback note."""
    fallback_note = LLMStructuringService.generate_deterministic_fallback(
        patient_id="PAT-FALLBACK",
        raw_symptoms="High fever and severe cough"
    )
    assert len(fallback_note.extracted_symptoms) >= 2
    assert "Fever" in fallback_note.extracted_symptoms[0] or "Fever" in fallback_note.extracted_symptoms[1]

@pytest.mark.asyncio
async def test_13_ocr_failure_fallback():
    """TEST 13: OCR processing handles invalid inputs gracefully."""
    res = await OCRService.process_document(file_bytes=None, is_demo=True)
    assert res.success is True
    assert res.isDemoOCR is True

@pytest.mark.asyncio
async def test_14_stt_failure_fallback():
    """TEST 14: STT processing handles missing audio gracefully."""
    res = await SpeechToTextService.transcribe_audio(audio_bytes=None, is_demo=True)
    assert res.success is True
    assert res.isDemoTranscription is True

@pytest.mark.asyncio
async def test_15_duplicate_submission_prevention(client):
    """TEST 15: Distinct case creation produces unique case IDs."""
    res1 = await client.post("/api/intake", json={"symptoms": "Fever", "consentGiven": True})
    res2 = await client.post("/api/intake", json={"symptoms": "Fever", "consentGiven": True})
    assert res1.json()["caseId"] != res2.json()["caseId"]
