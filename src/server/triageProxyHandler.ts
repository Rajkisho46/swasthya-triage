import { AI_TRIAGE_SYSTEM_INSTRUCTION, buildTriageUserPrompt } from '../services/ai/aiPrompt';
import { validateAndSanitizeAIOutput } from '../services/ai/aiValidator';

export interface ProxyRequestPayload {
  patientId: string;
  age?: number;
  gender?: string;
  preferredLanguage?: string;
  rawSymptoms?: string;
  voiceTranscript?: string;
  ocrReportsText?: string;
  translatedEnglishText?: string;
}

export interface ProxyResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Server-Side Triage Proxy Handler.
 * Executes strictly in a Node.js / Serverless environment.
 * The AI API key is read ONLY from server-side process.env and NEVER sent to the client.
 */
export async function handleTriageProxyRequest(
  payload: unknown,
  serverEnvApiKey?: string
): Promise<{ status: number; body: ProxyResponse }> {
  // 1. Validate payload
  if (!payload || typeof payload !== 'object') {
    return {
      status: 400,
      body: { success: false, error: 'Invalid request body: Expected JSON object' },
    };
  }

  const p = payload as Partial<ProxyRequestPayload>;

  if (!p.patientId || typeof p.patientId !== 'string') {
    return {
      status: 400,
      body: { success: false, error: 'Validation error: patientId is required' },
    };
  }

  // 2. Read API Key strictly from Server Environment
  const apiKey =
    serverEnvApiKey !== undefined
      ? serverEnvApiKey
      : (typeof process !== 'undefined' && (process.env.GEMINI_API_KEY || process.env.AI_API_KEY)) || '';

  if (!apiKey || apiKey.trim().length < 5) {
    return {
      status: 503,
      body: {
        success: false,
        error: 'AI Provider is not configured on server (GEMINI_API_KEY unset). Fallback extraction required.',
      },
    };
  }

  // 3. Build Prompt adhering to non-diagnostic constraints
  const userPrompt = buildTriageUserPrompt({
    patientId: p.patientId,
    age: p.age,
    gender: p.gender,
    preferredLanguage: p.preferredLanguage || 'English',
    rawSymptoms: p.rawSymptoms || '',
    voiceTranscript: p.voiceTranscript,
    ocrReportsText: p.ocrReportsText,
    translatedEnglishText: p.translatedEnglishText,
  });

  const modelName = (typeof process !== 'undefined' && process.env.AI_MODEL_NAME) || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const apiPayload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${AI_TRIAGE_SYSTEM_INSTRUCTION}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        status: 502,
        body: {
          success: false,
          error: `AI Provider returned HTTP ${response.status}: ${errorText.slice(0, 100)}`,
        },
      };
    }

    const data = (await response.json()) as any;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return {
        status: 502,
        body: { success: false, error: 'Empty response returned by AI Provider' },
      };
    }

    // Clean markdown codeblocks
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsedJson = JSON.parse(cleaned);

    // 4. Enforce strict non-diagnostic schema validation on server
    const validatedData = validateAndSanitizeAIOutput(parsedJson);

    return {
      status: 200,
      body: { success: true, data: validatedData },
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        status: 504,
        body: { success: false, error: 'AI Provider request timed out (8s limit)' },
      };
    }

    return {
      status: 500,
      body: { success: false, error: `Server proxy error: ${String(err?.message || 'Unknown error').slice(0, 100)}` },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
