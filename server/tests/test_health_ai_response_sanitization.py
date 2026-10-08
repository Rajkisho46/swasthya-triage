import pytest
from server.app.services.health_ai_safety import HealthAISafetyPipeline


def test_sanitize_markdown_bold_and_italic():
    raw = "**Hemoglobin:** 8.2 g/dL - Low\n*White Blood Cells:* 14,200 /uL - High\n__Platelets:__ 95,000 /uL - Low"
    result = HealthAISafetyPipeline.sanitize_output_text(raw)
    assert result == "Hemoglobin: 8.2 g/dL - Low\nWhite Blood Cells: 14,200 /uL - High\nPlatelets: 95,000 /uL - Low"


def test_sanitize_bullet_leak():
    raw = (
        "- **Hemoglobin/Hematocrit:** Often checked for anemia.\n"
        "- **White Blood Cell (WBC) Count:** Can be elevated.\n"
        "- **Platelets:** Important for clotting."
    )
    result = HealthAISafetyPipeline.sanitize_output_text(raw)
    expected = (
        "Hemoglobin/Hematocrit: Often checked for anemia.\n"
        "White Blood Cell (WBC) Count: Can be elevated.\n"
        "Platelets: Important for clotting."
    )
    assert result == expected


def test_sanitize_decorative_symbols():
    raw = (
        "### 📋 What this means\n"
        "⚠ Seek urgent medical attention if symptoms worsen.\n"
        "→ Follow up with your doctor."
    )
    result = HealthAISafetyPipeline.sanitize_output_text(raw)
    expected = (
        "What this means\n"
        "Seek urgent medical attention if symptoms worsen.\n"
        "Follow up with your doctor."
    )
    assert result == expected


def test_preserve_medical_hyphens_and_units():
    raw = "**Status:** Follow-up for COVID-19 required.\n**Scale:** Pain is 4-6 on a 0-10 scale.\n**Reference:** 13.0-17.0 g/dL."
    result = HealthAISafetyPipeline.sanitize_output_text(raw)
    assert "Follow-up" in result
    assert "COVID-19" in result
    assert "4-6" in result
    assert "0-10" in result
    assert "13.0-17.0 g/dL" in result
    assert "**" not in result
