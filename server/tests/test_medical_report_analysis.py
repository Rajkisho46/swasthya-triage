import io
import json
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from server.app.main import app
from server.app.utils.security import create_access_token
from server.app.services.ai_providers.base import AIProviderResponse, AIProviderMessage
from server.app.services.health_ai_service import HealthAIService
from server.app.models.database import AsyncSessionLocal
from server.app.schemas.auth import UserProfile
from server.app.models.health_ai import AIAttachment, AIMessage, AIHealthContext
from sqlalchemy import select

FAKE_CBC_REPORT_TEXT = """SHREE SAI HOSPITAL & DIAGNOSTICS
PATIENT: Ramesh Kumar  AGE: 45  GENDER: Male  DATE: 2026-10-05
HEMATOLOGY / COMPLETE BLOOD COUNT (CBC)
INVESTIGATION          RESULT    UNIT       REFERENCE INTERVAL
Hemoglobin             8.2       g/dL       13.0 - 17.0
RBC Count              3.12      mil/uL     4.5 - 5.5
Hematocrit (PCV)       26.4      %          40.0 - 50.0
MCV                    84.6      fL         80.0 - 100.0
MCH                    26.3      pg         27.0 - 32.0
MCHC                   31.1      g/dL       32.0 - 36.0
RDW                    16.8      %          11.5 - 14.5
Total WBC Count        14,200    /uL        4,000 - 11,000
Neutrophils            78        %          40 - 70
Platelet Count         95,000    /uL        150,000 - 450,000
"""

@pytest.fixture
def patient_a_headers():
    token = create_access_token({"sub": "patient_a", "user_id": "patient_a", "role": "PATIENT"})
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def patient_b_headers():
    token = create_access_token({"sub": "patient_b", "user_id": "patient_b", "role": "PATIENT"})
    return {"Authorization": f"Bearer {token}"}

@pytest.mark.asyncio
async def test_1_upload_report_successfully(patient_a_headers):
    """TEST 1: Upload report successfully."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        files = {
            "file": ("shree_sai_hospital_cbc.txt", FAKE_CBC_REPORT_TEXT.encode("utf-8"), "text/plain")
        }
        res = await ac.post("/api/health-ai/analyze-report", headers=patient_a_headers, files=files)
        assert res.status_code == 200
        data = res.json()
        assert data["filename"] == "shree_sai_hospital_cbc.txt"
        assert "conversation_id" in data
        assert "attachment_id" in data

@pytest.mark.asyncio
async def test_2_ocr_text_is_saved(patient_a_headers):
    """TEST 2: OCR text is saved to database attachment."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        files = {
            "file": ("shree_sai_hospital_cbc.txt", FAKE_CBC_REPORT_TEXT.encode("utf-8"), "text/plain")
        }
        res = await ac.post("/api/health-ai/analyze-report", headers=patient_a_headers, files=files)
        assert res.status_code == 200
        data = res.json()
        att_id = data["attachment_id"]

        async with AsyncSessionLocal() as db:
            stmt = select(AIAttachment).where(AIAttachment.id == att_id)
            db_att = (await db.execute(stmt)).scalars().first()
            assert db_att is not None
            assert db_att.extracted_text is not None
            assert "Hemoglobin" in db_att.extracted_text
            assert "8.2" in db_att.extracted_text
            assert db_att.ocr_status == "completed"

@pytest.mark.asyncio
async def test_3_report_analysis_automatically_starts(patient_a_headers):
    """TEST 3: Report analysis automatically starts and returns complete analysis on file upload."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        files = {
            "file": ("cbc_auto_start.txt", FAKE_CBC_REPORT_TEXT.encode("utf-8"), "text/plain")
        }
        res = await ac.post("/api/health-ai/analyze-report", headers=patient_a_headers, files=files)
        assert res.status_code == 200
        data = res.json()
        assert data["report_title"]
        assert len(data["key_findings"]) > 0
        assert len(data["abnormal_values"]) > 0
        assert data["urgency_level"] in ["ROUTINE", "PROMPT_FOLLOWUP", "URGENT", "EMERGENCY"]

@pytest.mark.asyncio
async def test_4_gemini_receives_report_content(patient_a_headers):
    """TEST 4: Gemini receives extracted report content in its prompt."""
    captured_messages = []
    captured_system = []

    async def mock_generate_response(messages, system_instruction=None, temperature=0.2, max_tokens=2048, json_mode=False):
        captured_messages.extend(messages)
        captured_system.append(system_instruction)
        return AIProviderResponse(
            content=json.dumps({
                "report_title": "Complete Blood Count (CBC)",
                "report_category": "Hematology",
                "summary": "CBC showing low hemoglobin and high WBC count.",
                "key_findings": ["Low hemoglobin (8.2 g/dL)", "High WBC (14,200 /uL)"],
                "abnormal_values": [
                    {
                        "test_name": "Hemoglobin",
                        "value": "8.2",
                        "unit": "g/dL",
                        "reference_range": "13.0 - 17.0",
                        "status": "low",
                        "is_abnormal": True,
                        "source_location": "Hematology Table",
                        "clinical_significance": "Lower oxygen capacity."
                    }
                ],
                "normal_values": [],
                "what_findings_mean": "May indicate mild anemia.",
                "urgency_level": "PROMPT_FOLLOWUP",
                "urgency_reasons": ["Hemoglobin is below normal reference range."],
                "what_to_do_next": ["Bring report to doctor."],
                "when_to_seek_urgent_care": ["Seek emergency care if severe shortness of breath."],
                "questions_for_clinician": ["What is causing the low hemoglobin?"]
            }),
            provider="gemini",
            model="gemini-3.1-flash-lite",
            input_tokens=100,
            output_tokens=150,
            latency_ms=300
        )

    with patch("server.app.services.health_ai_service.get_ai_provider") as mock_get_provider:
        mock_provider = AsyncMock()
        mock_provider.generate_response = mock_generate_response
        mock_provider.model_name = "gemini-3.1-flash-lite"
        mock_provider.provider_name = "gemini"
        mock_get_provider.return_value = mock_provider

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            files = {
                "file": ("cbc_test.txt", FAKE_CBC_REPORT_TEXT.encode("utf-8"), "text/plain")
            }
            res = await ac.post("/api/health-ai/analyze-report", headers=patient_a_headers, files=files)
            assert res.status_code == 200

        # Verify prompt received report text
        assert len(captured_messages) > 0
        user_content = captured_messages[0].content
        assert "Hemoglobin" in user_content
        assert "8.2" in user_content
        assert "14,200" in user_content
        assert "95,000" in user_content

@pytest.mark.asyncio
async def test_5_gemini_structured_response_is_validated(patient_a_headers):
    """TEST 5: Gemini structured response is validated against schema."""
    user = UserProfile(user_id="PT-VAL-1", username="val_test", display_name="Val Patient", role="PATIENT")
    async with AsyncSessionLocal() as db:
        res = await HealthAIService.analyze_medical_report(
            db=db,
            user=user,
            file_bytes=FAKE_CBC_REPORT_TEXT.encode("utf-8"),
            filename="cbc_validate.txt",
            mime_type="text/plain"
        )
        assert res.report_title
        assert res.report_category
        assert isinstance(res.key_findings, list)
        assert isinstance(res.abnormal_values, list)
        assert isinstance(res.normal_values, list)
        assert res.urgency_level in ["ROUTINE", "PROMPT_FOLLOWUP", "URGENT", "EMERGENCY"]
        assert len(res.what_to_do_next) > 0
        assert len(res.questions_for_clinician) > 0

@pytest.mark.asyncio
async def test_6_analysis_is_saved_to_database(patient_a_headers):
    """TEST 6: Analysis messages, attachment, and health context are persisted in DB."""
    user = UserProfile(user_id="PT-DB-1", username="db_test", display_name="DB Patient", role="PATIENT")
    async with AsyncSessionLocal() as db:
        res = await HealthAIService.analyze_medical_report(
            db=db,
            user=user,
            file_bytes=FAKE_CBC_REPORT_TEXT.encode("utf-8"),
            filename="cbc_persisted.txt",
            mime_type="text/plain"
        )
        conv_id = res.conversation_id

        # Verify messages persisted
        msg_stmt = select(AIMessage).where(AIMessage.conversation_id == conv_id)
        messages = list((await db.execute(msg_stmt)).scalars().all())
        assert len(messages) >= 2
        asst_msg = next((m for m in messages if m.sender_type == "assistant"), None)
        assert asst_msg is not None
        assert "Report Analyzed" in asst_msg.content

        # Verify health context persisted
        ctx_stmt = select(AIHealthContext).where(AIHealthContext.conversation_id == conv_id)
        ctx = (await db.execute(ctx_stmt)).scalars().first()
        assert ctx is not None
        assert ctx.current_concern is not None
        assert "CBC" in ctx.current_concern or "Report" in ctx.current_concern

@pytest.mark.asyncio
async def test_7_frontend_api_receives_actual_analysis(patient_a_headers):
    """TEST 7: API endpoint returns complete MedicalReportAnalysisResponse."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        files = {
            "file": ("shree_sai_hospital_cbc.txt", FAKE_CBC_REPORT_TEXT.encode("utf-8"), "text/plain")
        }
        res = await ac.post("/api/health-ai/analyze-report", headers=patient_a_headers, files=files)
        assert res.status_code == 200
        data = res.json()
        assert "report_id" in data
        assert "key_findings" in data
        assert "abnormal_values" in data
        assert "what_findings_mean" in data
        assert "questions_for_clinician" in data
        assert data["urgency_level"] in ["ROUTINE", "PROMPT_FOLLOWUP", "URGENT", "EMERGENCY"]

@pytest.mark.asyncio
async def test_8_no_generic_symptom_fallback_when_report_exists(patient_a_headers):
    """TEST 8: The assistant does NOT return generic symptom fallback when a valid report exists."""
    user = UserProfile(user_id="PT-NO-FALLBACK", username="no_fb", display_name="No FB Patient", role="PATIENT")
    async with AsyncSessionLocal() as db:
        # Create conversation with report
        analysis = await HealthAIService.analyze_medical_report(
            db=db,
            user=user,
            file_bytes=FAKE_CBC_REPORT_TEXT.encode("utf-8"),
            filename="cbc_report.txt",
            mime_type="text/plain"
        )
        conv_id = analysis.conversation_id

        # Ask question about the report
        user_msg, asst_msg, ctx = await HealthAIService.process_user_message(
            db=db,
            conversation_id=conv_id,
            content="What does the low hemoglobin mean?",
            user=user
        )

        # Must not say "Could you clarify where the discomfort is located"
        assert "clarify where the discomfort is located" not in asst_msg.content.lower()
        # Must address hemoglobin
        assert "hemoglobin" in asst_msg.content.lower()

@pytest.mark.asyncio
async def test_9_follow_up_question_references_uploaded_report(patient_a_headers):
    """TEST 9: Follow-up questions in chat reference the uploaded report parameters."""
    user = UserProfile(user_id="PT-FOLLOWUP", username="followup_pt", display_name="Followup Patient", role="PATIENT")
    async with AsyncSessionLocal() as db:
        analysis = await HealthAIService.analyze_medical_report(
            db=db,
            user=user,
            file_bytes=FAKE_CBC_REPORT_TEXT.encode("utf-8"),
            filename="cbc_report.txt",
            mime_type="text/plain"
        )
        conv_id = analysis.conversation_id

        # Turn 1: Low hemoglobin
        _, asst_1, _ = await HealthAIService.process_user_message(
            db=db,
            conversation_id=conv_id,
            content="What does my low hemoglobin mean?",
            user=user
        )
        assert "hemoglobin" in asst_1.content.lower()

        # Turn 2: Next steps
        _, asst_2, _ = await HealthAIService.process_user_message(
            db=db,
            conversation_id=conv_id,
            content="What should I discuss with my doctor?",
            user=user
        )
        assert len(asst_2.content) > 30
        assert "clarify where the discomfort is located" not in asst_2.content.lower()

@pytest.mark.asyncio
async def test_10_patient_a_cannot_access_patient_b_report(patient_a_headers, patient_b_headers):
    """TEST 10: Patient A cannot access Patient B's conversation or report."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Patient A creates a conversation with a report
        files = {
            "file": ("patient_a_cbc.txt", FAKE_CBC_REPORT_TEXT.encode("utf-8"), "text/plain")
        }
        res = await ac.post("/api/health-ai/analyze-report", headers=patient_a_headers, files=files)
        assert res.status_code == 200
        conv_id = res.json()["conversation_id"]

        # Patient B attempts to access Patient A's conversation
        res_b = await ac.get(f"/api/health-ai/conversations/{conv_id}", headers=patient_b_headers)
        assert res_b.status_code == 403

@pytest.mark.asyncio
async def test_11_malformed_gemini_response_is_handled_safely(patient_a_headers):
    """TEST 11: Malformed Gemini response is handled safely via structured recovery."""
    async def mock_malformed_response(*args, **kwargs):
        return AIProviderResponse(
            content="NOT VALID JSON AT ALL",
            provider="gemini",
            model="gemini-3.1-flash-lite",
            input_tokens=50,
            output_tokens=10,
            latency_ms=100
        )

    with patch("server.app.services.health_ai_service.get_ai_provider") as mock_get_provider:
        mock_provider = AsyncMock()
        mock_provider.generate_response = mock_malformed_response
        mock_provider.model_name = "gemini-3.1-flash-lite"
        mock_provider.provider_name = "gemini"
        mock_get_provider.return_value = mock_provider

        user = UserProfile(user_id="PT-MALFORMED", username="malformed", display_name="Malformed Test", role="PATIENT")
        async with AsyncSessionLocal() as db:
            res = await HealthAIService.analyze_medical_report(
                db=db,
                user=user,
                file_bytes=FAKE_CBC_REPORT_TEXT.encode("utf-8"),
                filename="cbc_malformed.txt",
                mime_type="text/plain"
            )
            # Safe recovery should still parse the lab values from OCR
            assert res.report_title
            assert len(res.abnormal_values) > 0
            assert res.urgency_level in ["ROUTINE", "PROMPT_FOLLOWUP", "URGENT", "EMERGENCY"]

@pytest.mark.asyncio
async def test_12_missing_ocr_text_does_not_cause_hallucinated_findings(patient_a_headers):
    """TEST 12: Missing OCR text does not cause hallucinated findings."""
    user = UserProfile(user_id="PT-EMPTY", username="empty_ocr", display_name="Empty OCR Patient", role="PATIENT")
    async with AsyncSessionLocal() as db:
        res = await HealthAIService.analyze_medical_report(
            db=db,
            user=user,
            file_bytes=b"   \n   ",
            filename="blank_image.png",
            mime_type="image/png"
        )
        # Should not invent fake abnormal laboratory numbers
        assert "could not reliably extract text" in res.summary.lower() or len(res.abnormal_values) == 0
        assert res.urgency_level == "ROUTINE"
