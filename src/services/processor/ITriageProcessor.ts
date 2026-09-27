import type { TriageCase, TriageFormData } from '../../types/triage';

export interface ITriageProcessor {
  id: string;
  name: string;
  description: string;
  isAIBased: boolean;
  processTriage(formData: TriageFormData): Promise<TriageCase>;
}
