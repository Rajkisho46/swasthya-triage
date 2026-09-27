from typing import Optional, List, Literal
from pydantic import BaseModel, Field

UrgencyLevelType = Literal["ROUTINE", "ELEVATED", "HIGH_URGENCY"]
SignalLevelType = Literal["advisory", "attention_required", "immediate_attention"]
ProvenanceType = Literal["PATIENT", "AI", "REVIEWER", "SYSTEM", "MULTIMODAL", "DETERMINISTIC_RULE_ENGINE"]

class TimelineItemSchema(BaseModel):
    symptom: str
    durationOrOnset: str
    notes: Optional[str] = None
    source: Optional[str] = "AI"

class UrgencySignalSchema(BaseModel):
    signal: str
    level: SignalLevelType
    reason: str
    source: Optional[str] = "DETERMINISTIC_RULE_ENGINE"
    rule_id: Optional[str] = None
    requires_human_review: bool = True

class StructuredAdvisoryNote(BaseModel):
    chief_complaint: str
    extracted_symptoms: List[str]
    timeline: List[TimelineItemSchema]
    missing_information: List[str]
    follow_up_questions: List[str]
    ai_summary: str = ""

class TriageProcessRequest(BaseModel):
    patientId: str
    age: Optional[int] = None
    gender: Optional[str] = None
    preferredLanguage: Optional[str] = "English"
    rawSymptoms: Optional[str] = ""
    voiceTranscript: Optional[str] = None
    ocrReportsText: Optional[str] = None
    translatedEnglishText: Optional[str] = None
    consentGiven: Optional[bool] = True

class TriageProcessResponse(BaseModel):
    success: bool
    data: Optional[dict] = None
    ai_advisory: Optional[StructuredAdvisoryNote] = None
    safety_signals: Optional[List[UrgencySignalSchema]] = None
    is_fallback_used: bool = False
    fallback_reason: Optional[str] = None
    error: Optional[str] = None
