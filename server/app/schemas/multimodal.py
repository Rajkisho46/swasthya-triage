from typing import Optional, List
from pydantic import BaseModel

class STTRequest(BaseModel):
    audioData: Optional[str] = None
    language: Optional[str] = "Hindi"
    isDemo: Optional[bool] = False

class STTResponse(BaseModel):
    success: bool
    transcript: str
    language: str
    durationSeconds: float
    source: str
    isDemoTranscription: bool
    confidence: float
    status: str

class ExtractedLabValue(BaseModel):
    test_name: str
    value: str
    unit: Optional[str] = None
    reference_range: Optional[str] = None
    is_abnormal: Optional[bool] = False

class OCRResponse(BaseModel):
    success: bool
    id: str
    fileName: str
    fileType: str
    extractedText: str
    structured_values: List[ExtractedLabValue] = []
    confidence: float
    isDemoOCR: bool
    requires_manual_review: bool

class TranslationRequest(BaseModel):
    text: str
    sourceLanguage: str = "Hindi"
    targetLanguage: str = "English"

class TranslationResponse(BaseModel):
    success: bool
    originalText: str
    originalLanguage: str
    translatedText: str
    targetLanguage: str
    provider: str
