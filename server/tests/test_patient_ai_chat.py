import pytest
from httpx import AsyncClient, ASGITransport
from server.app.main import app
from server.app.services.patient_ai_chat_service import PatientAIChatService, NON_HEALTHCARE_STANDARD_REPLY

@pytest.mark.asyncio
async def test_scenario_1_natural_headache_opening():
    """Scenario 1: Natural opening response to headache with 1-2 questions, not a checklist."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        req = {
            "messages": [{"role": "user", "content": "I've had a headache since yesterday."}],
            "preferred_language": "English"
        }
        res = await ac.post("/api/patient/chat", json=req)
        assert res.status_code == 200
        data = res.json()
        assert data["is_healthcare_related"] is True
        assert any(term in data["reply"].lower() for term in ["where", "narrow this down", "headache", "pain", "sorry", "started", "feel"])
        # Verify it does NOT contain robotic bullet lists or checklist text
        assert "to help structure your" not in data["reply"].lower()
        assert "for clinical review:" not in data["reply"].lower()

@pytest.mark.asyncio
async def test_scenario_2_context_aware_headache_turn2():
    """Scenario 2: Multi-turn memory - remembers onset and asks next logical question without repeating."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        history = [
            {"role": "user", "content": "I've had a headache since yesterday."},
            {"role": "assistant", "content": "I can help you narrow this down. Where exactly does the headache hurt, and did it start suddenly or build up gradually?"},
            {"role": "user", "content": "It's on the right side and started gradually."}
        ]
        res = await ac.post("/api/patient/chat", json={"messages": history, "preferred_language": "English"})
        assert res.status_code == 200
        data = res.json()
        assert "when did it start" not in data["reply"].lower(), "Must NOT re-ask when it started"
        assert any(term in data["reply"].lower() for term in ["scale", "severe", "different", "experienced", "symptom", "nausea", "light", "vision", "feel", "pain", "uncomfortable"])

@pytest.mark.asyncio
async def test_scenario_3_headache_associated_nausea():
    """Scenario 3: Nausea connects to headache context."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        history = [
            {"role": "user", "content": "I've had a headache since yesterday."},
            {"role": "assistant", "content": "I can help you narrow this down. Where exactly does the headache hurt, and did it start suddenly or build up gradually?"},
            {"role": "user", "content": "It's on the right side and started gradually."},
            {"role": "assistant", "content": "Thanks. How severe is it right now on a scale of 0–10?"},
            {"role": "user", "content": "I also feel nauseous."}
        ]
        res = await ac.post("/api/patient/chat", json={"messages": history, "preferred_language": "English"})
        assert res.status_code == 200
        data = res.json()
        assert "nausea" in data["reply"].lower() or "migraine" in data["reply"].lower() or "light" in data["reply"].lower()

@pytest.mark.asyncio
async def test_scenario_4_worst_headache_urgency():
    """Scenario 4: Sudden worst headache triggers urgency detection immediately."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        history = [
            {"role": "user", "content": "Actually it's the worst headache I've ever had and it came suddenly."}
        ]
        res = await ac.post("/api/patient/chat", json={"messages": history, "preferred_language": "English"})
        assert res.status_code == 200
        data = res.json()
        assert data["urgency_detected"] is True
        assert data["urgency_level"] == "emergency"
        assert "Seek Emergency Care" in data["suggested_actions"]

@pytest.mark.asyncio
async def test_scenario_5_healthcare_only_restriction():
    """Scenario 5: Non-healthcare coding query is politely redirected."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        req = {
            "messages": [{"role": "user", "content": "Write Python code to scrape data."}],
            "preferred_language": "English"
        }
        res = await ac.post("/api/patient/chat", json=req)
        assert res.status_code == 200
        data = res.json()
        assert data["is_healthcare_related"] is False
        assert NON_HEALTHCARE_STANDARD_REPLY in data["reply"]

@pytest.mark.asyncio
async def test_scenario_6_natural_fever_conversation():
    """Scenario 6: Fever follow-up asks duration/temperature naturally."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        req = {
            "messages": [{"role": "user", "content": "I have fever."}],
            "preferred_language": "English"
        }
        res = await ac.post("/api/patient/chat", json=req)
        assert res.status_code == 200
        data = res.json()
        assert "how long" in data["reply"].lower() or "temperature" in data["reply"].lower()

@pytest.mark.asyncio
async def test_scenario_7_conversational_report_analysis():
    """Scenario 7: Medical report discussed conversationally without dumping raw forms."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        req = {
            "messages": [{"role": "user", "content": "Please review this lab report."}],
            "attachments": [
                {
                    "file_name": "cbc.pdf",
                    "file_type": "application/pdf",
                    "extracted_text": "HEMOGLOBIN: 10.2 g/dL (Ref: 13.0 - 17.0)",
                    "structured_values": [
                        {"test_name": "Hemoglobin", "value": "10.2", "unit": "g/dL", "reference_range": "13.0 - 17.0", "is_abnormal": True}
                    ]
                }
            ],
            "preferred_language": "English"
        }
        res = await ac.post("/api/patient/chat", json=req)
        assert res.status_code == 200
        data = res.json()
        assert "hemoglobin" in data["reply"].lower()
        assert "explain" in data["reply"].lower() or "reference" in data["reply"].lower()

@pytest.mark.asyncio
async def test_scenario_8_voice_contextual_query():
    """Scenario 8: Voice input dizziness & weakness answered contextually."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        req = {
            "messages": [{"role": "user", "content": "I've been feeling weak and dizzy since yesterday.", "voice_used": True}],
            "preferred_language": "English"
        }
        res = await ac.post("/api/patient/chat", json=req)
        assert res.status_code == 200
        data = res.json()
        assert any(term in data["reply"].lower() for term in ["constant", "stand up", "move", "dizzy", "weak", "heart", "breath", "symptom", "lightheaded", "feel", "started"])
