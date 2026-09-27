from typing import Optional, Literal
from pydantic import BaseModel, Field

ReviewDecisionType = Literal["Routine Review", "Escalate", "Refer"]

class ReviewDecisionRequest(BaseModel):
    decision: ReviewDecisionType = Field(..., description="Clinician explicit decision: Routine Review, Escalate, or Refer")
    notes: Optional[str] = Field(None, max_length=2000, description="Optional clinician notes")
    reviewerName: Optional[str] = Field("Dr. Clinical Reviewer", max_length=128)
    reviewerRole: Optional[str] = Field("DOCTOR", max_length=64)

class ReviewDecisionResponse(BaseModel):
    success: bool
    caseId: str
    decision: str
    notes: Optional[str] = None
    reviewedAt: str
    reviewerName: str
    reviewerRole: str
    message: str
    case: Optional[dict] = None

class ReviewQueueItem(BaseModel):
    caseId: str
    patientId: str
    age: Optional[int] = None
    gender: Optional[str] = None
    preferredLanguage: str
    createdAt: str
    urgencyLevel: str
    reviewPriority: str
    safetySignalCount: int
    hasImmediateAttention: bool
    rawSymptomsExcerpt: str
    reviewStatus: str
