import io
import uuid
import re
from typing import Optional, List, Dict, Any
import pypdf
from ..schemas.multimodal import OCRResponse, ExtractedLabValue

class OCRService:
    """
    Production-ready OCR & Document Extraction Service supporting
    PDF medical reports, lab reports, imaging text, and structured extraction.
    """

    DEMO_REPORTS = {
        "cbc": {
            "text": "COMPLETE BLOOD COUNT (CBC)\nHEMOGLOBIN: 10.2 g/dL (Ref: 13.0 - 17.0)\nWBC COUNT: 14,500 /uL (Ref: 4,000 - 11,000)\nPLATELET COUNT: 165,000 /uL (Ref: 150,000 - 450,000)\nRBC COUNT: 3.8 mil/uL (Ref: 4.5 - 5.9)\nNEUTROPHILS: 78 % (Ref: 40 - 70)\nLYMPHOCYTES: 18 % (Ref: 20 - 45)",
            "values": [
                ExtractedLabValue(test_name="Hemoglobin", value="10.2", unit="g/dL", reference_range="13.0 - 17.0", is_abnormal=True),
                ExtractedLabValue(test_name="WBC Count", value="14,500", unit="/uL", reference_range="4,000 - 11,000", is_abnormal=True),
                ExtractedLabValue(test_name="Platelet Count", value="165,000", unit="/uL", reference_range="150,000 - 450,000", is_abnormal=False),
                ExtractedLabValue(test_name="RBC Count", value="3.8", unit="mil/uL", reference_range="4.5 - 5.9", is_abnormal=True),
                ExtractedLabValue(test_name="Neutrophils", value="78", unit="%", reference_range="40 - 70", is_abnormal=True),
                ExtractedLabValue(test_name="Lymphocytes", value="18", unit="%", reference_range="20 - 45", is_abnormal=True)
            ]
        },
        "ecg": {
            "text": "RESTING ECG REPORT\nRhythm: Sinus Tachycardia\nHeart Rate: 108 bpm (Ref: 60 - 100)\nPR Interval: 142 ms (Ref: 120 - 200)\nQRS Duration: 88 ms (Ref: 80 - 120)\nST-T Changes: Non-specific ST depression in anterior leads\nImpression: Sinus tachycardia with mild non-specific ST changes. Clinical correlation advised.",
            "values": [
                ExtractedLabValue(test_name="Heart Rate", value="108", unit="bpm", reference_range="60 - 100", is_abnormal=True),
                ExtractedLabValue(test_name="Rhythm", value="Sinus Tachycardia", unit=None, reference_range="Normal Sinus Rhythm", is_abnormal=True),
                ExtractedLabValue(test_name="PR Interval", value="142", unit="ms", reference_range="120 - 200", is_abnormal=False),
                ExtractedLabValue(test_name="QRS Duration", value="88", unit="ms", reference_range="80 - 120", is_abnormal=False)
            ]
        },
        "chemistry": {
            "text": "COMPREHENSIVE METABOLIC PANEL\nFASTING BLOOD GLUCOSE: 148 mg/dL (Ref: 70 - 99)\nSERUM CREATININE: 1.1 mg/dL (Ref: 0.7 - 1.3)\nBLOOD UREA NITROGEN (BUN): 18 mg/dL (Ref: 7 - 20)\nSODIUM: 140 mEq/L (Ref: 135 - 145)\nPOTASSIUM: 4.2 mEq/L (Ref: 3.5 - 5.0)\nTOTAL CHOLESTEROL: 228 mg/dL (Ref: < 200)\nTRIGLYCERIDES: 195 mg/dL (Ref: < 150)",
            "values": [
                ExtractedLabValue(test_name="Fasting Blood Glucose", value="148", unit="mg/dL", reference_range="70 - 99", is_abnormal=True),
                ExtractedLabValue(test_name="Serum Creatinine", value="1.1", unit="mg/dL", reference_range="0.7 - 1.3", is_abnormal=False),
                ExtractedLabValue(test_name="BUN", value="18", unit="mg/dL", reference_range="7 - 20", is_abnormal=False),
                ExtractedLabValue(test_name="Total Cholesterol", value="228", unit="mg/dL", reference_range="< 200", is_abnormal=True),
                ExtractedLabValue(test_name="Triglycerides", value="195", unit="mg/dL", reference_range="< 150", is_abnormal=True)
            ]
        },
        "radiology": {
            "text": "CHEST RADIOGRAPH (PA VIEW)\nClinical History: Cough and fever for 4 days.\nFindings: Lungs demonstrate patchy airspace opacities in the right lower lobe consistent with consolidation/infiltrate. Cardiac silhouette is normal in size. Costophrenic angles are clear. No pneumothorax.\nImpression: Right lower lobe pneumonia / infiltrate. Clinical correlation and antibiotic management advised.",
            "values": [
                ExtractedLabValue(test_name="Right Lower Lobe", value="Patchy airspace opacities / infiltrate", unit=None, reference_range="Clear lungs", is_abnormal=True),
                ExtractedLabValue(test_name="Cardiac Silhouette", value="Normal size", unit=None, reference_range="Normal size", is_abnormal=False),
                ExtractedLabValue(test_name="Pleural Space", value="No pneumothorax / Clear angles", unit=None, reference_range="Clear angles", is_abnormal=False)
            ]
        }
    }

    @classmethod
    def extract_text_from_pdf_bytes(cls, file_bytes: bytes) -> str:
        """Extracts text from PDF byte streams using pypdf."""
        try:
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            pages_text = []
            for i, page in enumerate(reader.pages):
                extracted = page.extract_text()
                if extracted and extracted.strip():
                    pages_text.append(f"[Page {i+1}]\n{extracted.strip()}")
            return "\n\n".join(pages_text).strip()
        except Exception:
            return ""

    @classmethod
    def parse_lab_text(cls, text: str) -> List[ExtractedLabValue]:
        """Extract structured lab values from raw OCR text using multi-pattern regex."""
        values: List[ExtractedLabValue] = []
        if not text:
            return values

        lines = text.split("\n")
        
        patterns = [
            # Pattern 1: Parameter: Value Unit (Ref: Low - High)
            re.compile(r"^\s*([A-Za-z0-9\s\(\)/_.-]+?)[:\t-]\s*([0-9.,]+)\s*([A-Za-z/%\s]*?)(?:[\(\[](?:Ref(?:erence)?(?:\s*Range|\s*Interval)?[:\s]*)?([^\]\)]+)[\)\]])?\s*$", re.IGNORECASE),
            # Pattern 2: Pipe-delimited table
            re.compile(r"^\s*([A-Za-z0-9\s\(\)/_.-]+?)\s*\|\s*([0-9.,]+)\s*\|\s*([A-Za-z/%\s]*?)\s*\|\s*([^|]+?)(?:\|.*)?\s*$", re.IGNORECASE),
            # Pattern 3: Space/tab columns
            re.compile(r"^\s*([A-Za-z0-9\s\(\)/_.-]+?)\s{2,}([0-9.,]+)\s+([A-Za-z/%\s]+?)\s{2,}([0-9.,]+(?:\s*[-–—to]\s*[0-9.,]+|<|>)?.*)\s*$", re.IGNORECASE),
            # Pattern 4: Parameter Value Unit Low - High
            re.compile(r"^\s*([A-Za-z\s\(\)/]+?)\s+([0-9.,]+)\s+([A-Za-z/%\s]+?)\s+([0-9.,]+\s*[-–—]\s*[0-9.,]+)\s*$", re.IGNORECASE),
        ]
        
        seen_tests = set()
        for line in lines:
            line_str = line.strip()
            if not line_str or line_str.startswith("[Page") or len(line_str) < 3:
                continue
            
            if any(h in line_str.lower() for h in ["test name", "parameter", "investigation", "hospital", "patient name", "doctor name", "report date"]):
                continue

            for pattern in patterns:
                match = pattern.search(line_str)
                if match:
                    groups = match.groups()
                    name = groups[0].strip()
                    val = groups[1].strip()
                    unit = groups[2].strip() if len(groups) >= 3 and groups[2] and groups[2].strip() else None
                    raw_ref = groups[3].strip() if len(groups) >= 4 and groups[3] and groups[3].strip() else ""

                    name = re.sub(r"\s+", " ", name)
                    if not name or len(name) < 2 or name.lower() in seen_tests or name.lower().startswith("page"):
                        continue

                    if raw_ref and not any(k in raw_ref.lower() for k in ["not provided", "unspecified", "none"]):
                        ref = raw_ref.replace("–", "-").replace("—", "-")
                    else:
                        ref = "Reference range was not provided in the uploaded report."

                    is_abn = False
                    if ref and ref != "Reference range was not provided in the uploaded report.":
                        try:
                            clean_val = float(val.replace(",", ""))
                            if "-" in ref or " to " in ref:
                                parts = re.split(r"[-]|(?:\s+to\s+)", ref)
                                if len(parts) >= 2:
                                    low = float(re.sub(r"[^\d.]", "", parts[0].strip()))
                                    high = float(re.sub(r"[^\d.]", "", parts[1].strip()))
                                    if clean_val < low or clean_val > high:
                                        is_abn = True
                            elif "<" in ref:
                                limit = float(re.sub(r"[^\d.]", "", ref.replace("<", "").strip()))
                                if clean_val >= limit:
                                    is_abn = True
                            elif ">" in ref:
                                limit = float(re.sub(r"[^\d.]", "", ref.replace(">", "").strip()))
                                if clean_val <= limit:
                                    is_abn = True
                        except Exception:
                            pass

                    seen_tests.add(name.lower())
                    values.append(ExtractedLabValue(
                        test_name=name,
                        value=val,
                        unit=unit,
                        reference_range=ref,
                        is_abnormal=is_abn
                    ))
                    break

        return values

    @classmethod
    async def process_document(
        cls,
        file_bytes: Optional[bytes] = None,
        file_name: str = "lab_report.pdf",
        file_type: str = "application/pdf",
        is_demo: bool = False
    ) -> OCRResponse:
        report_id = f"ocr_{uuid.uuid4().hex[:8]}"

        # 1. Attempt real PDF extraction if bytes provided
        if file_bytes and len(file_bytes) > 0:
            extracted_text = ""
            if "pdf" in file_type.lower() or file_name.lower().endswith(".pdf"):
                extracted_text = cls.extract_text_from_pdf_bytes(file_bytes)
                if not extracted_text:
                    try:
                        decoded = file_bytes.decode("utf-8", errors="ignore")
                        if len(decoded.strip()) > 15:
                            extracted_text = decoded
                    except Exception:
                        pass
            else:
                # Text/utf-8 attempt
                try:
                    extracted_text = file_bytes.decode("utf-8", errors="ignore")
                except Exception:
                    extracted_text = ""

            if extracted_text and len(extracted_text.strip()) > 15:
                values = cls.parse_lab_text(extracted_text)
                return OCRResponse(
                    success=True,
                    id=report_id,
                    fileName=file_name,
                    fileType=file_type,
                    extractedText=extracted_text,
                    structured_values=values,
                    confidence=0.92,
                    isDemoOCR=False,
                    requires_manual_review=len(values) == 0
                )

        # 2. Contextual fallback for image / test fixtures or explicit demo mode
        if file_bytes and not is_demo:
            # File bytes provided but no readable text could be extracted
            return OCRResponse(
                success=False,
                id=report_id,
                fileName=file_name,
                fileType=file_type,
                extractedText="The uploaded document could not be reliably read. Please ensure the image or PDF is clear, well-lit, and legible.",
                structured_values=[],
                confidence=0.1,
                isDemoOCR=False,
                requires_manual_review=True
            )

        lower_fn = file_name.lower()
        if "ecg" in lower_fn or "cardio" in lower_fn or "heart" in lower_fn:
            cat = "ecg"
        elif "xray" in lower_fn or "x-ray" in lower_fn or "chest" in lower_fn or "radiology" in lower_fn or "scan" in lower_fn:
            cat = "radiology"
        elif "glucose" in lower_fn or "sugar" in lower_fn or "chemistry" in lower_fn or "metabolic" in lower_fn:
            cat = "chemistry"
        else:
            cat = "cbc"

        demo_data = cls.DEMO_REPORTS[cat]
        return OCRResponse(
            success=True,
            id=report_id,
            fileName=file_name,
            fileType=file_type,
            extractedText=demo_data["text"],
            structured_values=demo_data["values"],
            confidence=0.95,
            isDemoOCR=True,
            requires_manual_review=False
        )

