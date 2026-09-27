import type { IOCRService } from './IOCRService';
import type { OCRReportData } from '../../types/triage';
import { getSafeRandomUUID } from '../../utils/caseId';

export const PRELOADED_SAMPLE_REPORTS = [
  {
    id: 'report-cbc-lab',
    title: 'Lab Report: Complete Blood Count (CBC) [PDF]',
    fileName: 'CBC_LabReport_Pat1024.pdf',
    fileType: 'pdf' as const,
    category: 'Laboratory - Hematology',
    fileSize: '412 KB',
    sampleExtractedText: `--- CLINICAL PATHOLOGY LABORATORY REPORT ---
Patient Ref: PATIENT-1024 | Age: 48y | Sex: M
TEST: COMPLETE BLOOD COUNT (CBC)
Hemoglobin (Hb): 13.2 g/dL (Normal: 13.0 - 17.0)
Total Leukocyte Count (TLC): 14,800 /cumm (HIGH - Ref: 4,000 - 11,000)
Platelet Count: 185,000 /cumm (Ref: 150,000 - 450,000)
Neutrophils: 82% (HIGH - Ref: 40 - 75%)
Lymphocytes: 14% (LOW - Ref: 20 - 45%)
ESR: 38 mm/1st hr (ELEVATED)
IMPRESSION: Leukocytosis with neutrophilic predominance. Correlation with clinical infection/inflammation advised.`,
  },
  {
    id: 'report-cxr-radiology',
    title: 'Radiology Report: Chest X-Ray PA View [Image/JPG]',
    fileName: 'Chest_XRay_PA_Impression.jpg',
    fileType: 'image' as const,
    category: 'Radiology / Imaging',
    fileSize: '1.2 MB',
    sampleExtractedText: `--- DEPARTMENT OF RADIODIAGNOSIS ---
STUDY: CHEST X-RAY (POSTEROANTERIOR VIEW)
Clinical Indication: 3-day fever, cough, breathlessness on exertion.
FINDINGS:
- Trachea is midline. Cardiothoracic ratio is within normal limits.
- Patchy ill-defined consolidation / opacity noted in right lower zone.
- Costophrenic and cardiophrenic angles are clear.
- Bilateral hila appear normal. Bony thorax intact.
IMPRESSION: Right lower zone consolidation/infiltrate. Clinical correlation and physician evaluation required.`,
  },
  {
    id: 'report-vitals-nursing',
    title: 'Nursing Triage Slip: Vitals & SpO2 Flowsheet [PDF]',
    fileName: 'Triage_Vitals_Slip_0921.pdf',
    fileType: 'pdf' as const,
    category: 'Frontline Nursing Record',
    fileSize: '180 KB',
    sampleExtractedText: `--- PRIMARY HEALTH CENTER TRIAGE SLIP ---
Time Recorded: 10:15 AM
Blood Pressure: 138/88 mmHg
Pulse Rate: 104 bpm (Tachycardia)
SpO2 (Room Air): 91% (LOW - Normal >= 95%)
Respiratory Rate: 26 breaths/min (Tachypneic)
Axillary Temperature: 101.8 °F
Random Blood Sugar (RBS): 142 mg/dL
Remarks: Patient visibly dyspneic while talking. Oxygen concentrator on standby.`,
  },
];

export class MockOCRService implements IOCRService {
  public providerName = 'Demo Document OCR Extractor (Simulated)';
  public isMock = true;

  async extractTextFromDocument(
    file: File | string,
    fileType: 'image' | 'pdf' = 'pdf'
  ): Promise<OCRReportData> {
    // Simulate slight processing delay (350ms)
    await new Promise((resolve) => setTimeout(resolve, 350));

    let extractedText = '';
    let fileName = 'Uploaded_Medical_Document';
    let category = 'General Clinical Report';
    let size = '350 KB';
    const type = fileType;

    if (typeof file === 'string') {
      const match = PRELOADED_SAMPLE_REPORTS.find((r) => r.id === file);
      if (match) {
        extractedText = match.sampleExtractedText;
        fileName = match.fileName;
        category = match.category;
        size = match.fileSize;
      } else {
        extractedText = file;
      }
    } else {
      fileName = file.name;
      size = `${Math.round(file.size / 1024)} KB`;
      extractedText = `--- OCR EXTRACTED TEXT FROM ${file.name} ---
Document Type: ${fileType.toUpperCase()}
Status: Extracted successfully by Demo OCR provider.
Clinical Summary: Document contains numerical lab/vital values or clinical impressions. Reviewer inspection required.`;
    }

    return {
      id: `OCR-${getSafeRandomUUID()}`,
      fileName,
      fileType: type,
      fileSize: size,
      extractedText,
      reportCategory: category,
      isDemoOCR: true,
      uploadedAt: new Date().toISOString(),
    };
  }

  getPreloadedSampleReports() {
    return PRELOADED_SAMPLE_REPORTS;
  }
}

export const defaultOCRService = new MockOCRService();
