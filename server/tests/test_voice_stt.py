import io
import pytest
from httpx import AsyncClient
from server.app.services.stt_service import SpeechToTextService, MockSpeechToTextService, GeminiSpeechToTextService

@pytest.mark.asyncio
async def test_voice_transcribe_missing_audio(client: AsyncClient):
    """Rejects request when audio file is completely missing."""
    res = await client.post("/api/voice/transcribe")
    assert res.status_code == 400
    data = res.json()
    assert "Missing audio file" in data["detail"] or "required" in data["detail"].lower()

@pytest.mark.asyncio
async def test_voice_transcribe_empty_audio(client: AsyncClient):
    """Rejects empty 0-byte audio file."""
    empty_file = io.BytesIO(b"")
    res = await client.post(
        "/api/voice/transcribe",
        files={"audio": ("empty.webm", empty_file, "audio/webm")}
    )
    assert res.status_code == 400
    data = res.json()
    assert "empty" in data["detail"].lower()

@pytest.mark.asyncio
async def test_voice_transcribe_unsupported_mime(client: AsyncClient):
    """Rejects unsupported MIME types like image/png or text/plain."""
    fake_img = io.BytesIO(b"not-audio-bytes-at-all")
    res = await client.post(
        "/api/voice/transcribe",
        files={"audio": ("test.png", fake_img, "image/png")}
    )
    assert res.status_code == 415
    data = res.json()
    assert "Unsupported audio format" in data["detail"]

@pytest.mark.asyncio
async def test_voice_transcribe_valid_webm_demo(client: AsyncClient):
    """Successfully transcribes WebM audio and returns standardized structure."""
    fake_audio = io.BytesIO(b"RIFFdummywebmaudiocontent12345678")
    res = await client.post(
        "/api/voice/transcribe",
        files={"audio": ("recording.webm", fake_audio, "audio/webm")},
        data={"language": "English", "is_demo": "true"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "transcription" in data
    assert len(data["transcription"]) > 10
    assert data["provenance"] == "Patient-Provided"
    assert data["is_demo_transcription"] is True
    assert "Demo Voice Recognition" in data["provider"]

@pytest.mark.asyncio
async def test_voice_transcribe_hindi_preservation(client: AsyncClient):
    """Transcribes Hindi audio without translating or distorting patient complaint."""
    fake_audio = io.BytesIO(b"dummyhindiaudiobytes1234567890")
    res = await client.post(
        "/api/voice/transcribe",
        files={"audio": ("hindi_fever.webm", fake_audio, "audio/webm;codecs=opus")},
        data={"language": "Hindi", "is_demo": "true"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["language"] == "Hindi"
    assert "बुखार" in data["transcription"] or "सांस" in data["transcription"] or "सीने" in data["transcription"]
    assert data["provenance"] == "Patient-Provided"

@pytest.mark.asyncio
async def test_voice_transcribe_supported_formats(client: AsyncClient):
    """Verifies support for WAV, MP4, and OGG formats."""
    for ext, mime in [("sample.wav", "audio/wav"), ("sample.mp4", "audio/mp4"), ("sample.ogg", "audio/ogg")]:
        audio_buf = io.BytesIO(b"audio-payload-data-stream-bytes")
        res = await client.post(
            "/api/voice/transcribe",
            files={"audio": (ext, audio_buf, mime)},
            data={"language": "auto", "is_demo": "true"}
        )
        assert res.status_code == 200
        assert res.json()["success"] is True

@pytest.mark.asyncio
async def test_stt_service_unit_validation():
    """Unit test for SpeechToTextService audio validation and fallback."""
    valid, err = SpeechToTextService.validate_audio(None)
    assert not valid
    assert "empty" in err.lower()

    valid, err = SpeechToTextService.validate_audio(b"sample", "audio/webm")
    assert valid
    assert err is None

    valid, err = SpeechToTextService.validate_audio(b"sample", "application/pdf")
    assert not valid
    assert "unsupported" in err.lower()
