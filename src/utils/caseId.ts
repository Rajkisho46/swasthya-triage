/**
 * Collision-safe UUID helper for frontend runtime & test environments.
 */
export function getSafeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generatePatientId(): string {
  const uniqueSegment = getSafeRandomUUID().split('-')[0].toUpperCase();
  return `PATIENT-${uniqueSegment}`;
}

export function generateCaseId(): string {
  const uniqueSegment = getSafeRandomUUID().split('-')[0].toUpperCase();
  return `CASE-${uniqueSegment}`;
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(dateString?: string): string {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
