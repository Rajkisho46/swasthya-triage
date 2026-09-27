import pytest

@pytest.mark.asyncio
async def test_stt_transcription_hindi(client):
    res = await client.post("/api/multimodal/stt", data={
        "language": "Hindi",
        "is_demo": "true"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "सीने में" in data["transcript"] or len(data["transcript"]) > 10

@pytest.mark.asyncio
async def test_ocr_extraction_lab_report(client):
    res = await client.post("/api/multimodal/ocr", data={
        "file_type": "pdf",
        "is_demo": "true"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "HEMOGLOBIN" in data["extractedText"]
    assert len(data["structured_values"]) >= 1

@pytest.mark.asyncio
async def test_translation_preserves_original_text(client):
    hindi_text = "मुझे पिछले तीन दिनों से सीने में भारीपन और सांस लेने में बहुत तकलीफ हो रही है।"
    res = await client.post("/api/multimodal/translate", json={
        "text": hindi_text,
        "sourceLanguage": "Hindi",
        "targetLanguage": "English"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["originalText"] == hindi_text
    assert "breathing difficulty" in data["translatedText"].lower()
