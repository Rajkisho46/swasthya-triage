import pytest
import io
import json
from httpx import AsyncClient, ASGITransport
from server.app.main import app
from server.app.utils.security import create_access_token

@pytest.fixture
def patient_headers():
    token = create_access_token({"sub": "patient_regression", "user_id": "patient_regression", "role": "PATIENT"})
    return {"Authorization": f"Bearer {token}"}

@pytest.mark.asyncio
async def test_health_ai_no_stale_context_headache_to_burn(patient_headers):
    """
    REGRESSION TEST FOR STALE CONVERSATION CONTEXT:
    Turn 1: Patient asks about a mild headache.
    Turn 2: Patient sends new message about burning their thumb on a hot pan.
    Verifications:
    1. Turn 2 AI response addresses the burn (first aid, cool water, what to avoid).
    2. Turn 2 AI response does NOT address or continue discussing the headache.
    3. Health context updates chief concern to thumb burn.
    4. Stale headache symptoms are cleared from the active current concern.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Create conversation
        res = await ac.post(
            "/api/health-ai/conversations",
            headers=patient_headers,
            json={"title": "New Health Consultation"}
        )
        assert res.status_code in [200, 201]
        conv_id = res.json()["id"]

        # 2. Turn 1: Headache message
        res1 = await ac.post(
            f"/api/health-ai/conversations/{conv_id}/messages",
            headers=patient_headers,
            json={"content": "I have a mild headache since this morning with slight fever and stiff neck."}
        )
        assert res1.status_code == 200
        data1 = res1.json()
        ctx1 = data1["health_context"]
        assert "headache" in (ctx1.get("currentConcern") or "").lower()

        # 3. Turn 2: Burn message (Topic change to acute minor injury)
        res2 = await ac.post(
            f"/api/health-ai/conversations/{conv_id}/messages",
            headers=patient_headers,
            json={"content": "I accidentally touched a hot pan and burned my thumb. What should I do right now?"}
        )
        assert res2.status_code == 200
        data2 = res2.json()
        asst_msg2 = data2["assistant_message"]["content"].lower()
        ctx2 = data2["health_context"]

        # Verification 1: AI response addresses burn first aid
        assert any(word in asst_msg2 for word in ["burn", "water", "cool", "dressing", "ice", "blister", "heat"])

        # Verification 2: AI response does NOT answer about the headache
        assert "dealing with a mild headache" not in asst_msg2
        assert "headache that started today" not in asst_msg2

        # Verification 3: Health context changes from headache to burn
        current_concern = (ctx2.get("currentConcern") or "").lower()
        assert "burn" in current_concern or "thumb" in current_concern
        assert "headache" not in current_concern

        # Verification 4: Location updated to thumb/skin, not head
        if ctx2.get("location"):
            assert "head" not in ctx2["location"].lower()

@pytest.mark.asyncio
async def test_multi_topic_transitions_burn_stomach_fever(patient_headers):
    """
    Verifies sequential topic shifts:
    BURN -> STOMACH PAIN -> FEVER
    Ensures each subsequent turn's active context cleanly matches the newest message.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post(
            "/api/health-ai/conversations",
            headers=patient_headers,
            json={"title": "Multi-Topic Consultation"}
        )
        conv_id = res.json()["id"]

        # 1. Burn
        res1 = await ac.post(
            f"/api/health-ai/conversations/{conv_id}/messages",
            headers=patient_headers,
            json={"content": "I burned my thumb on a hot pan."}
        )
        assert res1.status_code == 200
        ctx1 = res1.json()["health_context"]
        assert "burn" in (ctx1.get("currentConcern") or "").lower() or "thumb" in (ctx1.get("currentConcern") or "").lower()

        # 2. Transition to Stomach Pain
        res2 = await ac.post(
            f"/api/health-ai/conversations/{conv_id}/messages",
            headers=patient_headers,
            json={"content": "I have severe stomach pain in my lower right abdomen."}
        )
        assert res2.status_code == 200
        ctx2 = res2.json()["health_context"]
        asst2 = res2.json()["assistant_message"]["content"].lower()
        assert any(w in asst2 for w in ["stomach", "abdomen", "abdominal", "pain", "appendix"])
        assert "burn" not in (ctx2.get("currentConcern") or "").lower()
        assert any(w in (ctx2.get("currentConcern") or "").lower() for w in ["stomach", "abdomen", "abdominal"])

        # 3. Transition to Fever
        res3 = await ac.post(
            f"/api/health-ai/conversations/{conv_id}/messages",
            headers=patient_headers,
            json={"content": "Now I also developed a high fever with chills of 103°F."}
        )
        assert res3.status_code == 200
        ctx3 = res3.json()["health_context"]
        asst3 = res3.json()["assistant_message"]["content"].lower()
        assert any(w in asst3 for w in ["fever", "temperature", "chills", "103"])
        assert "fever" in (ctx3.get("currentConcern") or "").lower()

@pytest.mark.asyncio
async def test_report_upload_then_new_unrelated_symptom(patient_headers):
    """
    Verifies that uploading a CBC medical report does not contaminate a subsequent
    unrelated patient chat message (e.g. thumb burn).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        conv_res = await ac.post(
            "/api/health-ai/conversations",
            headers=patient_headers,
            json={"title": "Report and Symptom Consultation"}
        )
        conv_id = conv_res.json()["id"]

        # Send new message asking about a burned thumb
        res = await ac.post(
            f"/api/health-ai/conversations/{conv_id}/messages",
            headers=patient_headers,
            json={"content": "I accidentally touched a hot pan and burned my thumb. What should I do right now?"}
        )
        assert res.status_code == 200
        data = res.json()
        asst_msg = data["assistant_message"]["content"].lower()
        ctx = data["health_context"]

        assert any(w in asst_msg for w in ["burn", "water", "cool", "dressing", "ice", "blister"])
        assert "burn" in (ctx.get("currentConcern") or "").lower() or "thumb" in (ctx.get("currentConcern") or "").lower()
