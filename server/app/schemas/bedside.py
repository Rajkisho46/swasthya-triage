import json
from typing import Optional, List, Union, Any
from pydantic import BaseModel, Field, model_validator

class BedsideVitalsSchema(BaseModel):
    systolic_bp: Optional[int] = Field(None, description="Systolic Blood Pressure in mmHg (40-300)")
    diastolic_bp: Optional[int] = Field(None, description="Diastolic Blood Pressure in mmHg (20-200)")
    heart_rate: Optional[int] = Field(None, description="Heart Rate / Pulse in BPM (20-300)")
    spo2: Optional[int] = Field(None, description="Oxygen Saturation percentage (50-100)")
    temperature: Optional[float] = Field(None, description="Body temperature")
    temperature_unit: Optional[str] = Field("F", description="Temperature unit: 'F' or 'C'")
    respiratory_rate: Optional[int] = Field(None, description="Respiratory rate in breaths/min (4-80)")
    blood_glucose: Optional[int] = Field(None, description="Optional random blood sugar in mg/dL (10-1000)")
    measurement_timestamp: Optional[str] = Field(None, description="Timestamp of measurement")

    @model_validator(mode="before")
    @classmethod
    def handle_camel_case(cls, data: Any) -> Any:
        if isinstance(data, dict):
            mapping = {
                "systolicBP": "systolic_bp",
                "diastolicBP": "diastolic_bp",
                "heartRate": "heart_rate",
                "respiratoryRate": "respiratory_rate",
                "bloodGlucose": "blood_glucose",
                "tempUnit": "temperature_unit",
                "measuredAt": "measurement_timestamp",
            }
            for camel, snake in mapping.items():
                if camel in data and snake not in data:
                    data[snake] = data[camel]
        return data

    @model_validator(mode="after")
    def validate_vitals(self):
        # 1. Blood pressure: systolic and diastolic must be provided together
        if (self.systolic_bp is not None and self.diastolic_bp is None) or (self.systolic_bp is None and self.diastolic_bp is not None):
            raise ValueError("Systolic and diastolic blood pressure must be provided together.")

        if self.systolic_bp is not None:
            if not (40 <= self.systolic_bp <= 300):
                raise ValueError("Systolic blood pressure must be between 40 and 300 mmHg.")
            if not (20 <= self.diastolic_bp <= 200):
                raise ValueError("Diastolic blood pressure must be between 20 and 200 mmHg.")
            if self.systolic_bp < self.diastolic_bp:
                raise ValueError("Systolic blood pressure must be greater than or equal to diastolic blood pressure.")

        # 2. Heart rate
        if self.heart_rate is not None:
            if not (20 <= self.heart_rate <= 300):
                raise ValueError("Heart rate must be between 20 and 300 BPM.")

        # 3. SpO2 percentage
        if self.spo2 is not None:
            if not (50 <= self.spo2 <= 100):
                raise ValueError("SpO2 oxygen saturation must be between 50% and 100%.")

        # 4. Temperature
        if self.temperature is not None:
            unit = (self.temperature_unit or "F").upper()
            if unit == "C":
                if not (26.0 <= self.temperature <= 46.0):
                    raise ValueError("Body temperature in Celsius must be between 26.0°C and 46.0°C.")
            else:
                if not (80.0 <= self.temperature <= 115.0):
                    raise ValueError("Body temperature in Fahrenheit must be between 80.0°F and 115.0°F.")

        # 5. Respiratory rate
        if self.respiratory_rate is not None:
            if not (4 <= self.respiratory_rate <= 80):
                raise ValueError("Respiratory rate must be between 4 and 80 breaths/min.")

        # 6. Blood glucose
        if self.blood_glucose is not None:
            if not (10 <= self.blood_glucose <= 1000):
                raise ValueError("Blood glucose must be between 10 and 1000 mg/dL.")

        return self


class NurseObservationSchema(BaseModel):
    general_appearance: Optional[str] = Field(None, description="General physical appearance")
    consciousness: Optional[str] = Field(None, description="Consciousness / AVPU scale")
    breathing_effort: Optional[str] = Field(None, description="Breathing effort observation")
    mobility_status: Optional[str] = Field(None, description="Mobility status")
    pain_score: Optional[int] = Field(None, description="NRS Pain Score (0-10)")
    visible_distress: Optional[Union[List[str], str, bool]] = Field(default_factory=list, description="Observed distress markers")
    additional_symptoms: Optional[str] = Field(None, description="Additional bedside signs")

    @model_validator(mode="before")
    @classmethod
    def handle_camel_case(cls, data: Any) -> Any:
        if isinstance(data, dict):
            mapping = {
                "generalAppearance": "general_appearance",
                "consciousnessOrientation": "consciousness",
                "breathingEffort": "breathing_effort",
                "mobilityStatus": "mobility_status",
                "painScore": "pain_score",
                "visibleDistress": "visible_distress",
                "additionalSymptoms": "additional_symptoms",
            }
            for camel, snake in mapping.items():
                if camel in data and snake not in data:
                    data[snake] = data[camel]
        return data

    @model_validator(mode="after")
    def validate_pain_score(self):
        if self.pain_score is not None:
            if not (0 <= self.pain_score <= 10):
                raise ValueError("Pain score must be an integer between 0 and 10.")
        return self


class BedsideVerificationSchema(BaseModel):
    allergies: Optional[str] = Field(None, description="Allergies information")
    allergies_verification_status: Optional[str] = Field("patient_reported", description="Status: patient_reported, nurse_verified, unable_to_verify")
    current_medications: Optional[str] = Field(None, description="Current medications")
    medications_verification_status: Optional[str] = Field("patient_reported", description="Status: patient_reported, nurse_verified, unable_to_verify")
    chief_complaint: Optional[str] = Field(None, description="Chief complaint")
    chief_complaint_verification_status: Optional[str] = Field("patient_reported", description="Status: patient_reported, nurse_verified, unable_to_verify")
    relevant_history: Optional[str] = Field(None, description="Relevant clinical history")
    relevant_history_verification_status: Optional[str] = Field("patient_reported", description="Status: patient_reported, nurse_verified, unable_to_verify")

    @model_validator(mode="before")
    @classmethod
    def handle_nested_verification(cls, data: Any) -> Any:
        if isinstance(data, dict):
            camel_keys = {
                "currentMedications": "current_medications",
                "chiefComplaint": "chief_complaint",
                "relevantHistory": "relevant_history"
            }
            for c_k, s_k in camel_keys.items():
                if c_k in data and s_k not in data:
                    data[s_k] = data[c_k]

            keys = ["allergies", "current_medications", "chief_complaint", "relevant_history"]
            for k in keys:
                val = data.get(k)
                if isinstance(val, dict):
                    data[k] = val.get("patientValue") or val.get("value")
                    status_val = val.get("status") or "patient_reported"
                    data[f"{k}_verification_status"] = status_val
        return data


class BedsideAssessmentCreateRequest(BaseModel):
    vitals: Optional[BedsideVitalsSchema] = None
    observations: Optional[NurseObservationSchema] = None
    verification: Optional[BedsideVerificationSchema] = None
    nurse_notes: Optional[str] = Field(None, description="Concise objective bedside notes")
    facility_id: Optional[str] = Field(None, description="Facility ID if available")
    department: Optional[str] = Field("Emergency & Triage Unit", description="Department / Bay")
    status: Optional[str] = Field("completed", description="Assessment status")

    @model_validator(mode="before")
    @classmethod
    def handle_field_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "observation" in data and "observations" not in data:
                data["observations"] = data["observation"]
            if "verifications" in data and "verification" not in data:
                data["verification"] = data["verifications"]
            if "nurseNotes" in data and "nurse_notes" not in data:
                data["nurse_notes"] = data["nurseNotes"]
            if "assessmentStatus" in data and "status" not in data:
                data["status"] = data["assessmentStatus"]
            if "facilityDepartment" in data and "department" not in data:
                data["department"] = data["facilityDepartment"]
        return data


class BedsideAssessmentUpdateRequest(BaseModel):
    vitals: Optional[BedsideVitalsSchema] = None
    observations: Optional[NurseObservationSchema] = None
    verification: Optional[BedsideVerificationSchema] = None
    nurse_notes: Optional[str] = None
    facility_id: Optional[str] = None
    department: Optional[str] = None
    status: Optional[str] = None


class BedsideAssessmentResponse(BaseModel):
    id: str
    case_id: str
    patient_id: Optional[str] = None
    assessed_by: str
    assessor_id: Optional[str] = None
    assessor_role: Optional[str] = "NURSE"
    assessed_at: str
    vitals: BedsideVitalsSchema
    observations: NurseObservationSchema
    verification: BedsideVerificationSchema
    nurse_notes: Optional[str] = None
    facility_id: Optional[str] = None
    department: Optional[str] = None
    status: str
    created_at: str
    updated_at: str
