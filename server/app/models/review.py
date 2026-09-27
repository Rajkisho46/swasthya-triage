from datetime import datetime, timezone
from sqlalchemy import Column, String, Text
from .database import Base

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class ClinicalReview(Base):
    __tablename__ = "clinical_reviews"

    id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), index=True, nullable=False)
    reviewer_id = Column(String(64), nullable=False)
    reviewer_name = Column(String(128), nullable=False)
    reviewer_role = Column(String(64), nullable=False)
    decision = Column(String(64), nullable=False)  # 'Routine Review', 'Escalate', 'Refer'
    notes = Column(Text, nullable=True)
    timestamp = Column(String(64), default=utc_now_iso)

    def to_dict(self):
        return {
            "id": self.id,
            "caseId": self.case_id,
            "reviewerId": self.reviewer_id,
            "reviewerName": self.reviewer_name,
            "reviewerRole": self.reviewer_role,
            "decision": self.decision,
            "notes": self.notes,
            "timestamp": self.timestamp
        }
