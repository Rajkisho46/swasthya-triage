import type { ITriageProcessor } from './ITriageProcessor';
import type { TriageFormData, TriageCase, InputModality } from '../../types/triage';
import { generateCaseId } from '../../utils/caseId';
import { DeterministicTriageProcessor } from './DeterministicProcessor';
import { defaultAIClient } from '../ai/aiClient';
import { recordAuditEvent } from '../../utils/audit';

export class AITriageProcessor implements ITriageProcessor {
  public id = 'ai-triage-v3';
  public name = 'AI Clinical Triage Assistant (Gemini / LLM)';
  public description = 'Real AI-powered NLP & Multimodal extractor with automatic graceful fallback';
  public isAIBased = true;

  private fallbackProcessor = new DeterministicTriageProcessor();

  async processTriage(formData: TriageFormData): Promise<TriageCase> {
    const caseId = formData.caseId || generateCaseId();

    // 1. Audit event: AI processing started
    recordAuditEvent(
      caseId,
      'AI Triage Engine',
      'AI triage extraction started',
      `Calling AI extraction engine for ${formData.patientId}`
    );

    // 2. Prepare multimodal text payload
    const ocrReportsText = formData.ocrReports
      ?.map((r) => `[Document: ${r.fileName} (${r.reportCategory || r.fileType})]\n${r.extractedText}`)
      .join('\n\n');

    try {
      const aiResult = await defaultAIClient.extractStructuredTriage({
        patientId: formData.patientId,
        age: typeof formData.age === 'number' ? formData.age : undefined,
        gender: formData.gender || undefined,
        preferredLanguage: formData.preferredLanguage || 'English',
        rawSymptoms: formData.symptoms ? formData.symptoms.trim() : '',
        voiceTranscript: formData.voiceData?.transcript,
        ocrReportsText: ocrReportsText || undefined,
        translatedEnglishText: formData.multilingualData?.translatedText,
      });

      // 3. Audit event: AI processing completed successfully
      recordAuditEvent(
        caseId,
        'AI Triage Engine',
        'AI triage extraction completed',
        `Extracted ${aiResult.extractedSymptoms.length} symptoms | ${aiResult.urgencySignals.length} urgency signals`
      );

      const inputModalities: InputModality[] = [];
      if (formData.symptoms) inputModalities.push('text');
      if (formData.voiceData) inputModalities.push('voice');
      if (formData.ocrReports && formData.ocrReports.some((r) => r.fileType === 'image')) inputModalities.push('ocr_image');
      if (formData.ocrReports && formData.ocrReports.some((r) => r.fileType === 'pdf')) inputModalities.push('ocr_pdf');

      const triageCase: TriageCase = {
        caseId,
        patientId: formData.patientId,
        age: typeof formData.age === 'number' ? formData.age : undefined,
        gender: formData.gender ? formData.gender : undefined,
        preferredLanguage: formData.preferredLanguage || 'English',
        rawSymptoms: formData.symptoms ? formData.symptoms.trim() : '',
        consentGiven: formData.consentGiven,
        createdAt: new Date().toISOString(),

        inputModalities: inputModalities.length > 0 ? inputModalities : ['text'],
        voiceData: formData.voiceData,
        ocrReports: formData.ocrReports,
        multilingualData: formData.multilingualData,
        processorUsed: this.name,
        isFallbackUsed: false,

        extractedSymptoms: aiResult.extractedSymptoms,
        timeline: aiResult.timeline,
        missingInformation: aiResult.missingInformation,
        followUpQuestions: aiResult.followUpQuestions,
        urgencySignals: aiResult.urgencySignals,
        aiSummary: aiResult.aiSummary,

        reviewStatus: 'awaiting_review',
      };

      return triageCase;
    } catch (err: any) {
      // 4. Graceful Fallback Activation
      const sanitizedError = String(err?.message || 'AI service unavailable').slice(0, 150);

      recordAuditEvent(
        caseId,
        'System',
        'AI processing failed - Fallback extraction activated',
        `Reason: ${sanitizedError}`
      );

      // Execute deterministic fallback
      const fallbackCase = this.fallbackProcessor.processTriageSync(formData);

      return {
        ...fallbackCase,
        caseId, // Preserve the generated case ID
        processorUsed: 'Deterministic Fallback (AI Unavailable)',
        isFallbackUsed: true,
        fallbackReason: sanitizedError,
      };
    }
  }
}
