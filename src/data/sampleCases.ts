import type { TriageCase } from '../types/triage';

/**
 * Production-ready Clean State:
 * Initialized as empty so the Doctor & Clinical Review queues only display
 * real, persisted patient cases submitted through the backend.
 */
export const SYNTHETIC_SAMPLE_CASES: TriageCase[] = [];
