import type { OCRReportData } from '../../types/triage';

export interface IOCRService {
  providerName: string;
  isMock: boolean;
  extractTextFromDocument(file: File | string, fileType?: 'image' | 'pdf'): Promise<OCRReportData>;
  getPreloadedSampleReports(): Array<{
    id: string;
    title: string;
    fileType: 'image' | 'pdf';
    category: string;
    fileName: string;
    sampleExtractedText: string;
  }>;
}
