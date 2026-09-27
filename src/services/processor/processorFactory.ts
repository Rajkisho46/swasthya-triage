import type { ITriageProcessor } from './ITriageProcessor';
import { DeterministicTriageProcessor } from './DeterministicProcessor';
import { AITriageProcessor } from './AITriageProcessor';

export type ProcessorMode = 'deterministic' | 'ai_pluggable';

const deterministicInstance = new DeterministicTriageProcessor();
const aiInstance = new AITriageProcessor();

let activeProcessorMode: ProcessorMode = 'deterministic';

export function getTriageProcessor(mode?: ProcessorMode): ITriageProcessor {
  const selectedMode = mode || activeProcessorMode;
  return selectedMode === 'ai_pluggable' ? aiInstance : deterministicInstance;
}

export function setActiveProcessorMode(mode: ProcessorMode): void {
  activeProcessorMode = mode;
}

export function getActiveProcessorMode(): ProcessorMode {
  return activeProcessorMode;
}

export function getAllAvailableProcessors(): ITriageProcessor[] {
  return [deterministicInstance, aiInstance];
}
