from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime
from .database import Base

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class ConsentRecord(Base):
    __tablename__ = "consents"

    id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), index=True, nullable=False)
    patient_id = Column(String(64), index=True, nullable=False)
    consent_given = Column(Boolean, default=False, nullable=False)
    consent_version = Column(String(32), default="v1.0")
    actor = Column(String(64), default="Patient / Guardian")
    timestamp = Column(String(64), default=utc_now_iso)

    def to_dict(self):
        return {
            "id": self.id,
            "caseId": self.case_id,
            "patientId": self.patient_id,
            "consentGiven": self.consent_given,
            "consentVersion": self.consent_version,
            "actor": self.actor,
            "timestamp": self.timestamp
        }
