import pytest
from server.app.utils.validation import check_ai_safety_compliance

def test_safety_validator_rejects_diagnostic_claims():
    is_safe, reason = check_ai_safety_compliance("The patient is diagnosed with acute myocardial infarction.")
    assert is_safe is False
    assert "diagnostic" in reason.lower()

def test_safety_validator_rejects_prescriptions():
    is_safe, reason = check_ai_safety_compliance("Prescribe amoxicillin 500mg tablets three times daily.")
    assert is_safe is False
    assert "prescription" in reason.lower()

def test_safety_validator_rejects_autonomous_disposition():
    is_safe, reason = check_ai_safety_compliance("Discharge patient immediately, no clinical follow up is needed.")
    assert is_safe is False

def test_safety_validator_allows_informational_advisory():
    is_safe, _ = check_ai_safety_compliance("Patient reports 3-day history of cough and low-grade fever. Clinician evaluation recommended.")
    assert is_safe is True
