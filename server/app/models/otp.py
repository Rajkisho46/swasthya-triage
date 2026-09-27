from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime
from .database import Base

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id = Column(String(64), primary_key=True, index=True)
    email_normalized = Column(String(256), index=True, nullable=False)
    otp_hash = Column(String(256), nullable=False)
    purpose = Column(String(32), nullable=False)  # "EMAIL_VERIFICATION", "PASSWORD_RESET"
    expires_at = Column(DateTime(timezone=True), nullable=False)
    attempt_count = Column(Integer, default=0, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_sent_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def is_expired(self) -> bool:
        exp = self.expires_at
        if isinstance(exp, str):
            exp = datetime.fromisoformat(exp)
        if exp.tzinfo is None:
            return datetime.now(timezone.utc).replace(tzinfo=None) > exp
        return datetime.now(timezone.utc) > exp

    def is_valid(self) -> bool:
        return not self.used and not self.is_expired() and self.attempt_count < 5
