from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, Text
from .database import Base

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class PatientUser(Base):
    __tablename__ = "patient_users"

    id = Column(String(64), primary_key=True, index=True)
    email = Column(String(256), nullable=False)
    email_normalized = Column(String(256), unique=True, index=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    full_name = Column(String(128), nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    status = Column(String(32), default="active", nullable=False)
    preferred_language = Column(String(32), default="English")
    created_at = Column(String(64), default=utc_now_iso)
    updated_at = Column(String(64), default=utc_now_iso)
    last_login_at = Column(String(64), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "fullName": self.full_name,
            "emailVerified": self.email_verified,
            "status": self.status,
            "preferredLanguage": self.preferred_language,
            "createdAt": self.created_at,
            "lastLoginAt": self.last_login_at
        }
