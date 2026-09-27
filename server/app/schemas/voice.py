from typing import Optional
from pydantic import BaseModel, Field

class VoiceTranscriptionRequest(BaseModel):
    language: Optional[str] = "auto"
    is_demo: Optional[bool] = False

class VoiceTranscriptionResponse(BaseModel):
    """
    Standardized Voice Transcription Response.
    Preserves exact patient wording without summarization, clinical interpretation, or diagnostic inference.
    """
    success: bool = True
    transcription: str
    raw_transcription: Optional[str] = None
    language: str = "auto"
    provider: str
    is_demo_transcription: bool = False
    provenance: str = "Patient-Provided"
    confidence: Optional[float] = 0.95
    duration_seconds: Optional[float] = None
    status: str = "completed"
    error: Optional[str] = None
