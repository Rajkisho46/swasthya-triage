from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator

GenderType = Literal["Male", "Female", "Other", "Prefer not to say"]
InputModalityType = Literal["text", "voice", "ocr_image", "ocr_pdf"]

class VoiceInputSchema(BaseModel):
    audioBlobUrl: Optional[str] = None
    durationSeconds: Optional[float] = 0.0
    transcript: str = ""
    originalLanguage: str = "English"
    isDemoTranscription: bool = False
    recordedAt: str = ""

class OCRReportSchema(BaseModel):
    id: str
    fileName: str
    fileType: Literal["image", "pdf"]
    fileSize: Optional[str] = None
    extractedText: str
    reportCategory: Optional[str] = "Clinical Document"
    isDemoOCR: bool = False
    uploadedAt: str

class MultilingualSchema(BaseModel):
    originalLanguage: str = "English"
    originalText: str = ""
    translatedText: Optional[str] = ""
    isTranslated: bool = False
    translationProvider: Optional[str] = None

class IntakeCreateRequest(BaseModel):
    patientId: Optional[str] = Field(None, description="Pseudonymous patient identifier (generated if omitted)")
    age: Optional[int] = Field(None, ge=0, le=125, description="Patient age in years (0-125)")
    gender: Optional[GenderType] = None
    preferredLanguage: str = Field("English", max_length=64)
    symptoms: str = Field(..., min_length=1, max_length=5000, description="Raw narrative symptoms")
    consentGiven: bool = Field(..., description="Mandatory patient/guardian consent")

    # Modalities
    inputModalities: Optional[List[InputModalityType]] = Field(default_factory=list)
    voiceData: Optional[VoiceInputSchema] = None
    ocrReports: Optional[List[OCRReportSchema]] = None
    multilingualData: Optional[MultilingualSchema] = None

    @field_validator("symptoms")
    @classmethod
    def validate_symptoms_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("symptoms cannot be empty or pure whitespace")
        return v.strip()

class IntakeResponse(BaseModel):
    success: bool
    caseId: str
    patientId: str
    consentGiven: bool
    status: str
    message: str
    createdAt: str
    case: Optional[dict] = None
