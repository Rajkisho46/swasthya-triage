import pytest

@pytest.mark.asyncio
async def test_intake_validation_invalid_age(client):
    """Age > 125 or < 0 should be rejected by Pydantic validation."""
    res = await client.post("/api/intake", json={
        "patientId": "PAT-TEST",
        "age": 150,
        "gender": "Male",
        "symptoms": "Fever",
        "consentGiven": True
    })
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_intake_validation_empty_symptoms(client):
    """Empty symptoms should be rejected."""
    res = await client.post("/api/intake", json={
        "patientId": "PAT-TEST",
        "age": 40,
        "symptoms": "   ",
        "consentGiven": True
    })
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_intake_creates_pseudonymous_id_when_omitted(client):
    res = await client.post("/api/intake", json={
        "age": 28,
        "gender": "Female",
        "preferredLanguage": "Hindi",
        "symptoms": "पेट में दर्द और उल्टी",
        "consentGiven": True
    })
    assert res.status_code == 200
    data = res.json()
    assert data["patientId"].startswith("PAT-")
    assert data["caseId"].startswith("case_")
