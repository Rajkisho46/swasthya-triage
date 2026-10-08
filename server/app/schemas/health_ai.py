from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class CreateConversationRequest(BaseModel):
    title: Optional[str] = None

class ConversationResponse(BaseModel):
    id: str
    patientId: str
    title: str
    status: str
    createdAt: str
    updatedAt: str
    lastMessageAt: str
    messageCount: int = 0

class MessageResponse(BaseModel):
    id: str
    conversationId: str
    senderType: str
    role: str
    content: str
    voiceUsed: Optional[bool] = False
    createdAt: str
    timestamp: str
    model: Optional[str] = None
    provider: Optional[str] = None
    inputTokens: Optional[int] = 0
    outputTokens: Optional[int] = 0
    latencyMs: Optional[int] = 0
    safetyStatus: Optional[str] = "passed"
    urgencyDetected: Optional[bool] = False
    urgencyLevel: Optional[str] = None
    structuredSymptoms: Optional[Dict[str, Any]] = None
    followUpQuestions: List[str] = []
    suggestedActions: List[str] = []

class AttachmentResponse(BaseModel):
    id: str
    patientId: str
    conversationId: str
    filename: str
    fileName: str
    mimeType: str
    fileType: str
    fileSizeBytes: int
    ocrStatus: str
    extractedText: Optional[str] = None
    structuredValues: Optional[List[Dict[str, Any]]] = None
    createdAt: str

class HealthContextResponse(BaseModel):
    id: str
    conversationId: str
    currentConcern: Optional[str] = None
    symptoms: List[str] = []
    duration: Optional[str] = None
    location: Optional[str] = None
    severity: Optional[str] = None
    associatedSymptoms: Optional[str] = None
    relevantHistory: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None
    urgencyLevel: str = "routine"
    updatedAt: str

class ConversationDetailResponse(BaseModel):
    conversation: ConversationResponse
    messages: List[MessageResponse]
    attachments: List[AttachmentResponse]
    healthContext: Optional[HealthContextResponse] = None

class SendMessageRequest(BaseModel):
    content: str = Field(..., description="Message text from patient")
    voice_used: Optional[bool] = False
    preferred_language: Optional[str] = "English"
    attachments: Optional[List[Dict[str, Any]]] = None
    stream: Optional[bool] = False

class SendMessageResponse(BaseModel):
    user_message: MessageResponse
    assistant_message: MessageResponse
    health_context: HealthContextResponse

class MedicalLabValue(BaseModel):
    test_name: str
    value: str
    unit: Optional[str] = None
    reference_range: str = "Reference range was not provided in the uploaded report."
    status: str = "normal"  # "normal", "low", "high", "abnormal", "critical"
    is_abnormal: bool = False
    source_location: Optional[str] = "Uploaded Report"
    clinical_significance: Optional[str] = None

class MedicalReportAnalysisResponse(BaseModel):
    report_id: str
    conversation_id: str
    attachment_id: str
    filename: str
    file_type: str
    report_title: str
    report_category: str
    patient_name_in_report: Optional[str] = None
    report_date: Optional[str] = None
    summary: str
    key_findings: List[str] = []
    abnormal_values: List[MedicalLabValue] = []
    normal_values: List[MedicalLabValue] = []
    all_values: List[MedicalLabValue] = []
    what_findings_mean: str
    urgency_level: str = "routine"  # "routine", "priority", "urgent", "emergency"
    urgency_reasons: List[str] = []
    what_to_do_next: List[str] = []
    when_to_seek_urgent_care: List[str] = []
    questions_for_clinician: List[str] = []
    clinical_disclaimer: str = (
        "This analysis is for informational organization and clinical preparation only. "
        "It does not constitute a medical diagnosis or treatment prescription. "
        "All laboratory findings must be reviewed by a licensed healthcare professional alongside physical evaluation."
    )
    provenance: Dict[str, Any] = {
        "patient_provided": "Uploaded Medical Report Document",
        "report_derived": "OCR text extraction and structured parameter identification",
        "ai_generated_guidance": "Swasthya Clinical Health AI interpretation and triage prep"
    }
    raw_text: Optional[str] = None
    created_at: str

