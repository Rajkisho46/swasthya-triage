import pytest
from server.app.services.llm_service import LLMStructuringService

@pytest.mark.asyncio
async def test_triage_deterministic_fallback():
    """Ensure deterministic fallback extracts structured note when no live API key is set."""
    note = LLMStructuringService.generate_deterministic_fallback(
        patient_id="PAT-TEST-01",
        raw_symptoms="Patient has fever and cough for 3 days with weakness."
    )
    assert len(note.extracted_symptoms) >= 2
    assert any("Fever" in s for s in note.extracted_symptoms)
    assert any("Cough" in s for s in note.extracted_symptoms)
    assert len(note.timeline) >= 2
    assert len(note.missing_information) >= 1
    assert len(note.follow_up_questions) >= 1
    assert "diagnos" not in note.ai_summary.lower()

@pytest.mark.asyncio
async def test_triage_api_endpoint(client):
    res = await client.post("/api/triage", json={
        "patientId": "PAT-999",
        "age": 55,
        "gender": "Male",
        "rawSymptoms": "Severe chest pain and shortness of breath"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "ai_advisory" in data
    assert "safety_signals" in data
    assert len(data["safety_signals"]) >= 1
    assert data["safety_signals"][0]["rule_id"] == "RULE-001"
