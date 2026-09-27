import type { TriageFormData, TriageCase } from '../types/triage';
import { getTriageProcessor } from './processor/processorFactory';
import { DeterministicTriageProcessor } from './processor/DeterministicProcessor';

const deterministicInstance = new DeterministicTriageProcessor();

/**
 * Main Triage Processing entrypoint.
 * Delegates through the ITriageProcessor interface.
 */
export async function processTriageIntakeAsync(formData: TriageFormData): Promise<TriageCase> {
  const processor = getTriageProcessor();
  return processor.processTriage(formData);
}

/**
 * Synchronous backward-compatible wrapper for V1 callers.
 */
export function processTriageIntake(formData: TriageFormData): TriageCase {
  return deterministicInstance.processTriageSync(formData);
}
