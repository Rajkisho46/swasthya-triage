import json
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text
from .database import Base

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class PatientCase(Base):
    __tablename__ = "cases"

    id = Column(String(64), primary_key=True, index=True)
    patient_id = Column(String(64), index=True, nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(32), nullable=True)
    preferred_language = Column(String(32), default="English")
    raw_symptoms = Column(Text, nullable=False)
    consent_given = Column(Boolean, default=False, nullable=False)
    created_at = Column(String(64), default=utc_now_iso)

    # Modalities (stored as JSON string)
    input_modalities = Column(Text, default="[]")
    voice_data = Column(Text, nullable=True)
    ocr_reports = Column(Text, nullable=True)
    multilingual_data = Column(Text, nullable=True)

    # Engine metadata
    processor_used = Column(String(64), default="AI_Triage_V3")
    is_fallback_used = Column(Boolean, default=False)
    fallback_reason = Column(String(256), nullable=True)

    # AI Advisory extraction (stored as JSON string)
    extracted_symptoms = Column(Text, default="[]")
    timeline = Column(Text, default="[]")
    missing_information = Column(Text, default="[]")
    follow_up_questions = Column(Text, default="[]")
    urgency_signals = Column(Text, default="[]")
    ai_summary = Column(Text, default="")

    # Review status
    review_status = Column(String(32), default="awaiting_nursing_triage", index=True)
    reviewer_notes = Column(Text, nullable=True)
    reviewer_decision = Column(String(64), nullable=True)
    reviewed_at = Column(String(64), nullable=True)
    reviewer_name = Column(String(128), nullable=True)
    reviewer_role = Column(String(64), nullable=True)

    def to_dict(self):
        return {
            "caseId": self.id,
            "patientId": self.patient_id,
            "age": self.age,
            "gender": self.gender,
            "preferredLanguage": self.preferred_language,
            "rawSymptoms": self.raw_symptoms,
            "consentGiven": self.consent_given,
            "createdAt": self.created_at,
            "inputModalities": json.loads(self.input_modalities) if self.input_modalities else [],
            "voiceData": json.loads(self.voice_data) if self.voice_data else None,
            "ocrReports": json.loads(self.ocr_reports) if self.ocr_reports else [],
            "multilingualData": json.loads(self.multilingual_data) if self.multilingual_data else None,
            "processorUsed": self.processor_used,
            "isFallbackUsed": self.is_fallback_used,
            "fallbackReason": self.fallback_reason,
            "extractedSymptoms": json.loads(self.extracted_symptoms) if self.extracted_symptoms else [],
            "timeline": json.loads(self.timeline) if self.timeline else [],
            "missingInformation": json.loads(self.missing_information) if self.missing_information else [],
            "followUpQuestions": json.loads(self.follow_up_questions) if self.follow_up_questions else [],
            "urgencySignals": json.loads(self.urgency_signals) if self.urgency_signals else [],
            "aiSummary": self.ai_summary or "",
            "reviewStatus": self.review_status,
            "reviewerNotes": self.reviewer_notes,
            "reviewerDecision": self.reviewer_decision,
            "reviewedAt": self.reviewed_at,
            "reviewerName": self.reviewer_name
        }
