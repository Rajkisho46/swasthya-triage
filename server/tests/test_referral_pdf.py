import pytest

@pytest.mark.asyncio
async def test_referral_generation_and_pdf_download(client):
    # 1. Create intake case
    res_intake = await client.post("/api/intake", json={
        "patientId": "PAT-REF-01",
        "age": 67,
        "gender": "Male",
        "symptoms": "Severe chest pain and shortness of breath",
        "consentGiven": True
    })
    assert res_intake.status_code == 200
    case_id = res_intake.json()["caseId"]

    # 2. Trigger referral document generation
    res_ref = await client.post(f"/api/referral/{case_id}/generate", json={
        "referralFacility": "District Specialty Hospital",
        "clinicianNotes": "Urgent coronary angiogram requested."
    })
    assert res_ref.status_code == 200
    ref_data = res_ref.json()
    assert ref_data["success"] is True
    assert ref_data["pdfAvailable"] is True

    # 3. Download Referral PDF
    res_pdf = await client.get(f"/api/referral/{case_id}/pdf")
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert len(res_pdf.content) > 500  # Valid PDF binary
    assert res_pdf.content.startswith(b"%PDF")
