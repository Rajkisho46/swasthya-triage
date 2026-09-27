from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from ...schemas.voice import VoiceTranscriptionResponse
from ...services.stt_service import SpeechToTextService, normalize_mime_type, SUPPORTED_MIME_TYPES
from ...config import settings

router = APIRouter(prefix="/voice", tags=["Voice Input & Speech-to-Text"])

@router.post("/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice_audio(
    audio: Optional[UploadFile] = File(None),
    language: Optional[str] = Form("auto"),
    is_demo: Optional[bool] = Form(False)
):
    """
    POST /api/voice/transcribe
    Transcribes browser-recorded audio using real backend Speech-to-Text pipeline.
    Preserves verbatim patient words without diagnosis, symptom inference, or clinical distortion.
    """
    if audio is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing audio file in multipart/form-data. Parameter 'audio' is required."
        )

    # Read audio bytes safely
    audio_bytes = await audio.read()
    
    # Check for empty recording
    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio recording is empty (0 bytes). Please record or provide a valid audio sample."
        )

    # Check maximum file size
    if len(audio_bytes) > settings.MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio file size exceeds maximum limit of {settings.MAX_AUDIO_SIZE_BYTES // (1024 * 1024)}MB."
        )

    # Validate MIME type
    content_type = audio.content_type or ""
    clean_mime = content_type.lower().split(";")[0].strip()
    
    # Check validity
    if content_type and clean_mime not in SUPPORTED_MIME_TYPES and not clean_mime.startswith("audio/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported audio format '{content_type}'. Supported formats: audio/webm, audio/ogg, audio/mp4, audio/wav, audio/mpeg."
        )

    filename = audio.filename or "recording.webm"
    normalized_mime = normalize_mime_type(content_type, filename)

    result = await SpeechToTextService.transcribe(
        audio_bytes=audio_bytes,
        mime_type=normalized_mime,
        language=language or "auto",
        filename=filename,
        is_demo=bool(is_demo)
    )

    if not result.success and result.error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.error
        )

    return result
