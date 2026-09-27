from datetime import datetime, timezone
from sqlalchemy import Column, String, Text
from .database import Base

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class AuditEventModel(Base):
    __tablename__ = "audit_events"

    id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), index=True, nullable=False)
    timestamp = Column(String(64), default=utc_now_iso)
    actor = Column(String(128), nullable=False)
    role = Column(String(64), default="SYSTEM")
    provenance = Column(String(64), nullable=False)  # 'PATIENT' | 'AI_ADVISORY' | 'CLINICIAN' | 'SYSTEM' | 'MULTIMODAL'
    action = Column(String(128), nullable=False)
    details = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "caseId": self.case_id,
            "timestamp": self.timestamp,
            "actor": self.actor,
            "role": self.role,
            "provenance": self.provenance,
            "action": self.action,
            "details": self.details or ""
        }
