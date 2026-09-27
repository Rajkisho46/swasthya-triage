import type { AuditEvent } from '../types/triage';
import { getSafeRandomUUID } from './caseId';

/**
 * Chronological In-Memory Audit Trail
 *
 * Provides a reactive, in-memory event log for tracking the clinical evidence chain
 * and workflow actions during a frontend demo session.
 */
let auditLogs: AuditEvent[] = [];
type AuditSubscriber = (logs: AuditEvent[]) => void;
const subscribers: Set<AuditSubscriber> = new Set();

export function recordAuditEvent(
  caseId: string,
  actor: AuditEvent['actor'],
  action: string,
  details?: string
): AuditEvent {
  const event: AuditEvent = {
    id: `AUDIT-${getSafeRandomUUID()}`,
    caseId,
    timestamp: new Date().toISOString(),
    actor,
    action,
    details,
  };

  auditLogs = [event, ...auditLogs]; // latest first
  subscribers.forEach((fn) => fn([...auditLogs]));
  return event;
}

export function getAuditLogs(caseId?: string): AuditEvent[] {
  if (caseId) {
    return auditLogs.filter((log) => log.caseId === caseId);
  }
  return [...auditLogs];
}

export function subscribeAuditLogs(callback: AuditSubscriber): () => void {
  subscribers.add(callback);
  callback([...auditLogs]);
  return () => {
    subscribers.delete(callback);
  };
}

export function clearAuditLogs(): void {
  auditLogs = [];
  subscribers.forEach((fn) => fn([]));
}
