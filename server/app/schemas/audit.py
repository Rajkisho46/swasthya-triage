from typing import Optional, Literal
from pydantic import BaseModel

ProvenanceType = Literal["PATIENT", "AI_ADVISORY", "CLINICIAN", "SYSTEM", "MULTIMODAL"]

class AuditEventCreate(BaseModel):
    caseId: str
    actor: str
    role: Optional[str] = "SYSTEM"
    provenance: ProvenanceType
    action: str
    details: Optional[str] = ""

class AuditEventResponse(BaseModel):
    id: str
    caseId: str
    timestamp: str
    actor: str
    role: str
    provenance: str
    action: str
    details: Optional[str] = ""
