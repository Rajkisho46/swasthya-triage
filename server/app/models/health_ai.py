import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from .database import Base

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(String(64), primary_key=True, index=True)
    patient_id = Column(String(64), index=True, nullable=False)
    title = Column(String(255), default="New Health Consultation", nullable=False)
    status = Column(String(32), default="active", nullable=False)  # "active", "archived", "closed"
    created_at = Column(String(64), default=utc_now_iso, nullable=False)
    updated_at = Column(String(64), default=utc_now_iso, nullable=False)
    last_message_at = Column(String(64), default=utc_now_iso, nullable=False)

    # Relationships
    messages = relationship("AIMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="AIMessage.created_at", lazy="selectin")
    attachments = relationship("AIAttachment", back_populates="conversation", cascade="all, delete-orphan", lazy="selectin")
    health_context = relationship("AIHealthContext", back_populates="conversation", uselist=False, cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self) -> Dict[str, Any]:
        msg_count = 0
        if "messages" in self.__dict__ and self.messages is not None:
            msg_count = len(self.messages)
        return {
            "id": self.id,
            "patientId": self.patient_id,
            "title": self.title,
            "status": self.status,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "lastMessageAt": self.last_message_at,
            "messageCount": msg_count
        }

class AIMessage(Base):
    __tablename__ = "ai_messages"

    id = Column(String(64), primary_key=True, index=True)
    conversation_id = Column(String(64), ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_type = Column(String(32), nullable=False)  # "patient", "assistant", "system"
    content = Column(Text, nullable=False)
    voice_used = Column(Boolean, default=False)
    created_at = Column(String(64), default=utc_now_iso, nullable=False)
    
    # Model & Token Performance Tracking
    model = Column(String(64), nullable=True)
    provider = Column(String(64), nullable=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)

    # Safety & Urgency Classification
    safety_status = Column(String(32), default="passed")  # "passed", "flagged", "sanitized"
    urgency_detected = Column(Boolean, default=False)
    urgency_level = Column(String(32), nullable=True)  # "emergency", "urgent", "routine"
    
    # Structured Clinical Extras
    structured_symptoms = Column(JSON, nullable=True)
    follow_up_questions = Column(JSON, nullable=True)
    suggested_actions = Column(JSON, nullable=True)

    conversation = relationship("AIConversation", back_populates="messages")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "senderType": self.sender_type,
            "role": "user" if self.sender_type == "patient" else ("assistant" if self.sender_type == "assistant" else "system"),
            "content": self.content,
            "voiceUsed": self.voice_used,
            "createdAt": self.created_at,
            "timestamp": self.created_at,
            "model": self.model,
            "provider": self.provider,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "latencyMs": self.latency_ms,
            "safetyStatus": self.safety_status,
            "urgencyDetected": self.urgency_detected,
            "urgencyLevel": self.urgency_level,
            "structuredSymptoms": self.structured_symptoms,
            "followUpQuestions": self.follow_up_questions or [],
            "suggestedActions": self.suggested_actions or []
        }

class AIAttachment(Base):
    __tablename__ = "ai_attachments"

    id = Column(String(64), primary_key=True, index=True)
    patient_id = Column(String(64), index=True, nullable=False)
    conversation_id = Column(String(64), ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    filename = Column(String(255), nullable=False)
    mime_type = Column(String(128), nullable=False)
    file_size_bytes = Column(Integer, default=0)
    storage_reference = Column(String(512), nullable=True)
    ocr_status = Column(String(32), default="pending")  # "pending", "completed", "failed"
    extracted_text = Column(Text, nullable=True)
    structured_values = Column(JSON, nullable=True)
    created_at = Column(String(64), default=utc_now_iso, nullable=False)

    conversation = relationship("AIConversation", back_populates="attachments")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "patientId": self.patient_id,
            "conversationId": self.conversation_id,
            "filename": self.filename,
            "fileName": self.filename,
            "mimeType": self.mime_type,
            "fileType": self.mime_type,
            "fileSizeBytes": self.file_size_bytes,
            "ocrStatus": self.ocr_status,
            "extractedText": self.extracted_text,
            "structuredValues": self.structured_values,
            "createdAt": self.created_at
        }

class AIHealthContext(Base):
    __tablename__ = "ai_health_contexts"

    id = Column(String(64), primary_key=True, index=True)
    conversation_id = Column(String(64), ForeignKey("ai_conversations.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    current_concern = Column(String(255), nullable=True)
    symptoms = Column(JSON, nullable=True)  # List of extracted symptoms
    duration = Column(String(128), nullable=True)
    location = Column(String(128), nullable=True)
    severity = Column(String(64), nullable=True)
    associated_symptoms = Column(String(255), nullable=True)
    relevant_history = Column(Text, nullable=True)
    medications_if_patient_provided = Column(Text, nullable=True)
    allergies_if_patient_provided = Column(Text, nullable=True)
    urgency_level = Column(String(32), default="routine")
    updated_at = Column(String(64), default=utc_now_iso, nullable=False)

    conversation = relationship("AIConversation", back_populates="health_context")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "currentConcern": self.current_concern,
            "symptoms": self.symptoms or [],
            "duration": self.duration,
            "location": self.location,
            "severity": self.severity,
            "associatedSymptoms": self.associated_symptoms,
            "relevantHistory": self.relevant_history,
            "medications": self.medications_if_patient_provided,
            "allergies": self.allergies_if_patient_provided,
            "urgencyLevel": self.urgency_level,
            "updatedAt": self.updated_at
        }

class AISafetyEvent(Base):
    __tablename__ = "ai_safety_events"

    id = Column(String(64), primary_key=True, index=True)
    conversation_id = Column(String(64), index=True, nullable=True)
    patient_id = Column(String(64), index=True, nullable=False)
    event_type = Column(String(64), nullable=False)  # "prompt_injection", "off_topic", "urgency_flag", "output_sanitized"
    severity = Column(String(32), default="info")  # "info", "warning", "critical"
    details = Column(JSON, nullable=True)
    created_at = Column(String(64), default=utc_now_iso, nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "patientId": self.patient_id,
            "eventType": self.event_type,
            "severity": self.severity,
            "details": self.details,
            "createdAt": self.created_at
        }

class AIUsageEvent(Base):
    __tablename__ = "ai_usage_events"

    id = Column(String(64), primary_key=True, index=True)
    conversation_id = Column(String(64), index=True, nullable=True)
    patient_id = Column(String(64), index=True, nullable=False)
    provider = Column(String(64), nullable=False)
    model = Column(String(64), nullable=False)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    created_at = Column(String(64), default=utc_now_iso, nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "patientId": self.patient_id,
            "provider": self.provider,
            "model": self.model,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "latencyMs": self.latency_ms,
            "createdAt": self.created_at
        }

class AIFeedback(Base):
    __tablename__ = "ai_feedback"

    id = Column(String(64), primary_key=True, index=True)
    conversation_id = Column(String(64), index=True, nullable=False)
    message_id = Column(String(64), index=True, nullable=False)
    patient_id = Column(String(64), index=True, nullable=False)
    rating = Column(Integer, nullable=False)  # 1 to 5
    feedback_text = Column(Text, nullable=True)
    created_at = Column(String(64), default=utc_now_iso, nullable=False)
