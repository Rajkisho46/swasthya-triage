from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from .multimodal import ExtractedLabValue

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' | 'assistant' | 'system'")
    content: str = Field(..., description="Text content of the message")
    timestamp: Optional[str] = None
    voice_used: Optional[bool] = False

class ChatDocumentAttachment(BaseModel):
    file_name: str
    file_type: str
    extracted_text: Optional[str] = None
    structured_values: Optional[List[ExtractedLabValue]] = None
    file_size_bytes: Optional[int] = None

class PatientChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="Conversation history")
    preferred_language: Optional[str] = "English"
    patient_id: Optional[str] = None
    attachments: Optional[List[ChatDocumentAttachment]] = None
    session_id: Optional[str] = None

class PatientChatResponse(BaseModel):
    reply: str
    is_healthcare_related: bool = True
    urgency_detected: bool = False
    urgency_level: Optional[str] = None  # "emergency", "urgent", "routine"
    urgency_reasons: List[str] = []
    follow_up_questions: List[str] = []
    structured_symptoms: Optional[Dict[str, Any]] = None
    suggested_actions: List[str] = []
    fallback_used: bool = False
    model_name: Optional[str] = None
