from typing import Optional, List
from pydantic import BaseModel

class ReferralGenerateRequest(BaseModel):
    clinicianNotes: Optional[str] = None
    referralFacility: Optional[str] = "District Hospital / Specialty Center"
    priority: Optional[str] = "URGENT"

class ReferralDocumentResponse(BaseModel):
    success: bool
    referralId: str
    caseId: str
    patientId: str
    generatedAt: str
    pdfAvailable: bool
    pdfDownloadUrl: str
    summaryText: str
