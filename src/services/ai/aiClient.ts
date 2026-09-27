import type { StructuredAIOutput } from './aiValidator';

export interface AIClientOptions {
  proxyUrl?: string;
  timeoutMs?: number;
}

/**
 * Client-Side AI Extraction Client.
 *
 * SECURITY:
 * All calls are routed through the secure server-side proxy (`POST /api/triage`).
 * No API keys or technical credentials exist in or are exposed to client-side code.
 */
export class AIExtractionClient {
  private proxyUrl: string;
  private timeoutMs: number;

  constructor(options?: AIClientOptions) {
    const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
    this.proxyUrl = options?.proxyUrl || (baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/triage` : '/api/triage');
    this.timeoutMs = options?.timeoutMs || 8000;
  }

  /**
   * Invokes the secure server-side proxy endpoint.
   * On failure or timeout, throws an error triggering deterministic fallback.
   */
  async extractStructuredTriage(params: {
    patientId: string;
    age?: number;
    gender?: string;
    preferredLanguage: string;
    rawSymptoms: string;
    voiceTranscript?: string;
    ocrReportsText?: string;
    translatedEnglishText?: string;
  }): Promise<StructuredAIOutput> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorJson.error || `Proxy returned HTTP ${response.status}`);
      }

      const resBody = await response.json();

      if (!resBody.success || !resBody.data) {
        throw new Error(resBody.error || 'Server proxy returned unvalidated payload');
      }

      return resBody.data as StructuredAIOutput;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`AI proxy request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const defaultAIClient = new AIExtractionClient();
