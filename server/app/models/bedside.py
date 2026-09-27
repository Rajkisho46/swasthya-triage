import json
from datetime import datetime, timezone
from typing import Optional, List, Any
from sqlalchemy import Column, String, Integer, Float, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class BedsideAssessment(Base):
    __tablename__ = "bedside_assessments"

    id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), ForeignKey("cases.id", ondelete="CASCADE"), index=True, nullable=False)
    patient_id = Column(String(64), index=True, nullable=True)
    assessed_by = Column(String(128), nullable=False)
    assessor_id = Column(String(64), nullable=True)
    assessor_role = Column(String(64), default="NURSE")
    assessed_at = Column(String(64), default=utc_now_iso)

    # Vital measurements
    systolic_bp = Column(Integer, nullable=True)
    diastolic_bp = Column(Integer, nullable=True)
    heart_rate = Column(Integer, nullable=True)
    spo2 = Column(Integer, nullable=True)
    temperature = Column(Float, nullable=True)
    temperature_unit = Column(String(16), default="F")
    respiratory_rate = Column(Integer, nullable=True)
    blood_glucose = Column(Integer, nullable=True)
    measurement_timestamp = Column(String(64), nullable=True)

    # Clinical observations
    general_appearance = Column(String(128), nullable=True)
    consciousness = Column(String(128), nullable=True)
    breathing_effort = Column(String(128), nullable=True)
    mobility_status = Column(String(128), nullable=True)
    pain_score = Column(Integer, nullable=True)
    visible_distress = Column(Text, default="[]")  # JSON list of strings
    additional_symptoms = Column(Text, nullable=True)

    # Verification of patient information
    allergies = Column(Text, nullable=True)
    allergies_verification_status = Column(String(64), default="patient_reported")
    current_medications = Column(Text, nullable=True)
    medications_verification_status = Column(String(64), default="patient_reported")
    chief_complaint = Column(Text, nullable=True)
    chief_complaint_verification_status = Column(String(64), default="patient_reported")
    relevant_history = Column(Text, nullable=True)
    relevant_history_verification_status = Column(String(64), default="patient_reported")

    # Nurse notes
    nurse_notes = Column(Text, nullable=True)

    # Metadata
    facility_id = Column(String(64), nullable=True)
    department = Column(String(128), default="Emergency & Triage Unit")
    status = Column(String(64), default="completed")
    created_at = Column(String(64), default=utc_now_iso)
    updated_at = Column(String(64), default=utc_now_iso)

    def get_visible_distress_list(self) -> List[str]:
        if not self.visible_distress:
            return []
        try:
            val = json.loads(self.visible_distress)
            return val if isinstance(val, list) else [str(val)]
        except Exception:
            return [self.visible_distress]

    def to_dict(self):
        return {
            "id": self.id,
            "case_id": self.case_id,
            "patient_id": self.patient_id,
            "assessed_by": self.assessed_by,
            "assessor_id": self.assessor_id,
            "assessor_role": self.assessor_role,
            "assessed_at": self.assessed_at,
            "vitals": {
                "systolic_bp": self.systolic_bp,
                "diastolic_bp": self.diastolic_bp,
                "heart_rate": self.heart_rate,
                "spo2": self.spo2,
                "temperature": self.temperature,
                "temperature_unit": self.temperature_unit or "F",
                "respiratory_rate": self.respiratory_rate,
                "blood_glucose": self.blood_glucose,
                "measurement_timestamp": self.measurement_timestamp or self.assessed_at,
                "systolicBP": self.systolic_bp,
                "diastolicBP": self.diastolic_bp,
                "heartRate": self.heart_rate,
                "tempUnit": self.temperature_unit or "F",
                "respiratoryRate": self.respiratory_rate,
                "bloodGlucose": self.blood_glucose,
                "measuredAt": self.measurement_timestamp or self.assessed_at,
            },
            "observations": {
                "general_appearance": self.general_appearance,
                "consciousness": self.consciousness,
                "breathing_effort": self.breathing_effort,
                "mobility_status": self.mobility_status,
                "pain_score": self.pain_score,
                "visible_distress": self.get_visible_distress_list(),
                "additional_symptoms": self.additional_symptoms,
            },
            "verification": {
                "allergies": self.allergies,
                "allergies_verification_status": self.allergies_verification_status or "patient_reported",
                "current_medications": self.current_medications,
                "medications_verification_status": self.medications_verification_status or "patient_reported",
                "chief_complaint": self.chief_complaint,
                "chief_complaint_verification_status": self.chief_complaint_verification_status or "patient_reported",
                "relevant_history": self.relevant_history,
                "relevant_history_verification_status": self.relevant_history_verification_status or "patient_reported",
            },
            "nurse_notes": self.nurse_notes or "",
            "facility_id": self.facility_id,
            "department": self.department,
            "status": self.status or "completed",
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
