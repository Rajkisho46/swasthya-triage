import pytest

@pytest.mark.asyncio
async def test_intake_consent_mandatory(client):
    """Ensure intake processing is halted and returns 400 when consent is False."""
    res = await client.post("/api/intake", json={
        "patientId": "PAT-NO-CONSENT",
        "age": 45,
        "gender": "Male",
        "preferredLanguage": "English",
        "symptoms": "Mild headache",
        "consentGiven": False
    })
    assert res.status_code == 400
    data = res.json()
    assert "consent is mandatory" in data["detail"].lower()

@pytest.mark.asyncio
async def test_intake_consent_granted_success(client):
    """Intake completes when consent is True."""
    res = await client.post("/api/intake", json={
        "patientId": "PAT-CONSENT-OK",
        "age": 30,
        "gender": "Female",
        "preferredLanguage": "English",
        "symptoms": "Mild cough for two days",
        "consentGiven": True
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["consentGiven"] is True
    assert data["patientId"] == "PAT-CONSENT-OK"
