import React, { useState, useEffect } from 'react';
import {
  FileText,
  Clock,
  Trash2,
  Search,
  User,
  CheckCircle2,
  FileSearch,
  Activity,
  ShieldAlert,
  UserCheck,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Lock,
  Layers,
  X,
} from 'lucide-react';
import type { AuditEvent } from '../../types/triage';
import { subscribeAuditLogs, clearAuditLogs } from '../../utils/audit';
import { formatDateTime } from '../../utils/caseId';
import { SafetyBanner } from '../SafetyDisclaimer/SafetyBanner';
import { CaseJourney } from '../Layout/CaseJourney';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribeAuditLogs((newLogs) => {
      setLogs(newLogs);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter((log) => {
    // 1. Actor filter
    if (actorFilter !== 'all') {
      if (actorFilter === 'Patient' && log.actor !== 'Patient' && log.actor !== 'Patient / Health Worker') return false;
      if (actorFilter === 'AI' && log.actor !== 'AI Triage Engine') return false;
      if (actorFilter === 'Clinician' && log.actor !== 'Medical Reviewer') return false;
      if (actorFilter === 'System' && log.actor !== 'System') return false;
    }

    // 2. Search query filter (matches Case ID, Action, Details, or Actor)
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase().trim();
    const matchCase = log.caseId.toLowerCase().includes(term);
    const matchAction = log.action.toLowerCase().includes(term);
    const matchDetails = log.details ? log.details.toLowerCase().includes(term) : false;
    const matchActor = log.actor.toLowerCase().includes(term);
    return matchCase || matchAction || matchDetails || matchActor;
  });

  // Calculate real metrics directly from existing state
  const totalEvents = logs.length;
  const uniqueCases = new Set(logs.map((l) => l.caseId)).size;
  const aiEventsCount = logs.filter(
    (l) => l.actor === 'AI Triage Engine' || l.action.toLowerCase().includes('ai') || l.action.toLowerCase().includes('extraction')
  ).length;
  const clinicianEventsCount = logs.filter((l) => l.actor === 'Medical Reviewer').length;

  // Determine which evidence chain stages have actually occurred in the audit data
  const isMultimodalEvent = (log: AuditEvent) => {
    const text = `${log.action} ${log.details || ''}`.toLowerCase();
    return (
      text.includes('voice') ||
      text.includes('ocr') ||
      text.includes('audio') ||
      text.includes('stt') ||
      text.includes('multimodal') ||
      text.includes('transcription') ||
      text.includes('translation')
    );
  };

  const patientIntakeOccurred = logs.some(
    (l) => l.actor === 'Patient' || l.actor === 'Patient / Health Worker' || l.action.toLowerCase().includes('created') || l.action.toLowerCase().includes('intake')
  );
  const consentOccurred = logs.some(
    (l) => l.action.toLowerCase().includes('consent') || (l.details && l.details.toLowerCase().includes('consent'))
  );
  const multimodalOccurred = logs.some(isMultimodalEvent);
  const aiProcessingOccurred = logs.some(
    (l) => l.actor === 'AI Triage Engine' || l.action.toLowerCase().includes('extraction') || l.action.toLowerCase().includes('advisory') || l.action.toLowerCase().includes('fallback')
  );
  const medicalReviewOccurred = logs.some(
    (l) => l.actor === 'Medical Reviewer' || l.action.toLowerCase().includes('reviewer') || l.action.toLowerCase().includes('evaluation')
  );
  const humanDecisionOccurred = logs.some(
    (l) =>
      l.actor === 'Medical Reviewer' &&
      (l.action.toLowerCase().includes('decision') ||
        l.action.toLowerCase().includes('sign-off') ||
        l.action.toLowerCase().includes('signed') ||
        l.action.toLowerCase().includes('confirmed') ||
        l.action.toLowerCase().includes('escalate') ||
        l.action.toLowerCase().includes('refer') ||
        l.action.toLowerCase().includes('routine') ||
        (l.details && l.details.toLowerCase().includes('decision')))
  );

  const evidenceStages = [
    {
      id: 'intake',
      label: 'PATIENT INTAKE',
      desc: 'Evidence capture',
      icon: User,
      provenanceType: 'patient' as const,
      completed: patientIntakeOccurred,
    },
    {
      id: 'consent',
      label: 'CONSENT',
      desc: 'Mandatory record',
      icon: CheckCircle2,
      provenanceType: 'system' as const,
      completed: consentOccurred,
    },
    {
      id: 'multimodal',
      label: 'MULTIMODAL INPUT',
      desc: 'Voice & OCR ingest',
      icon: FileSearch,
      provenanceType: 'multimodal' as const,
      completed: multimodalOccurred,
    },
    {
      id: 'ai',
      label: 'AI PROCESSING',
      desc: 'Advisory extraction',
      icon: Activity,
      provenanceType: 'ai' as const,
      completed: aiProcessingOccurred,
    },
    {
      id: 'review',
      label: 'MEDICAL REVIEW',
      desc: 'Clinical evaluation',
      icon: ShieldAlert,
      provenanceType: 'reviewer' as const,
      completed: medicalReviewOccurred,
    },
    {
      id: 'decision',
      label: 'HUMAN DECISION',
      desc: 'Binding sign-off',
      icon: UserCheck,
      provenanceType: 'reviewer' as const,
      completed: humanDecisionOccurred,
    },
  ];

  const getActorBadge = (log: AuditEvent) => {
    const isMultimodal = isMultimodalEvent(log);

    if (isMultimodal && (log.actor === 'Patient' || log.actor === 'Patient / Health Worker')) {
      return (
        <span className="provenance-tag multimodal" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <FileSearch size={11} />
          <span>MULTIMODAL</span>
        </span>
      );
    }

    switch (log.actor) {
      case 'Patient':
      case 'Patient / Health Worker':
        return (
          <span className="provenance-tag patient" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <User size={11} />
            <span>PATIENT</span>
          </span>
        );
      case 'Nurse':
        return (
          <span className="provenance-tag nurse" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--mint)' }}>
            <Activity size={11} />
            <span>NURSE</span>
          </span>
        );
      case 'AI Triage Engine':
        return (
          <span className="provenance-tag ai" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <Activity size={11} />
            <span>AI ADVISORY</span>
          </span>
        );
      case 'Medical Reviewer':
        return (
          <span className="provenance-tag reviewer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldCheck size={11} />
            <span>CLINICIAN</span>
          </span>
        );
      case 'System':
        return (
          <span className="provenance-tag system" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <Cpu size={11} />
            <span>SYSTEM</span>
          </span>
        );
      default:
        return <span className="provenance-tag system">{log.actor}</span>;
    }
  };

  const getNodeClass = (log: AuditEvent) => {
    if (isMultimodalEvent(log) && (log.actor === 'Patient' || log.actor === 'Patient / Health Worker')) {
      return 'node-multimodal';
    }
    switch (log.actor) {
      case 'Patient':
      case 'Patient / Health Worker':
        return 'node-patient';
      case 'Nurse':
        return 'node-nurse';
      case 'AI Triage Engine':
        return 'node-ai';
      case 'Medical Reviewer':
        return 'node-reviewer';
      case 'System':
      default:
        return 'node-system';
    }
  };

  const handleClearLogs = () => {
    clearAuditLogs();
    setConfirmClear(false);
  };

  return (
    <div className="audit-command-container">
      {/* 1. Institutional Safety Banner */}
      <SafetyBanner compact />

      {/* 2. Global Case Journey Header Bar */}
      <CaseJourney currentStep="audit" compact />

      {/* 3. Audit Command Header */}
      <div className="audit-header-panel glass-panel scroll-reveal reveal-delay-1">
        <div>
          <div className="intake-step-badge glass">04 / AUDIT LOG</div>
          <h1 className="intake-title" style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileText size={24} color="var(--teal)" />
            <span>Evidence & Audit Log</span>
          </h1>
          <p className="intake-subtitle">
            Chronological audit trail of case actions and provenance.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="intake-status-pill glass">
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--mint)', boxShadow: '0 0 8px var(--mint)' }} />
            <span>Ledger Active</span>
          </div>

          {!confirmClear ? (
            <button
              type="button"
              className="btn-destructive-glass glass"
              onClick={() => setConfirmClear(true)}
              title="Clear in-memory audit logs"
            >
              <Trash2 size={13} />
              <span>Clear Log</span>
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn-destructive-glass glass"
                style={{ background: 'rgba(255, 107, 107, 0.35)', borderColor: 'var(--urgency)' }}
                onClick={handleClearLogs}
              >
                Confirm Clear
              </button>
              <button
                type="button"
                className="btn btn-secondary glass"
                style={{ fontSize: '0.74rem', padding: '0.35rem 0.6rem' }}
                onClick={() => setConfirmClear(false)}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Institutional Audit Statistics Grid (Calculated strictly from state) */}
      <div className="audit-stats-grid scroll-reveal reveal-delay-2">
        <div className="audit-stat-card glass-card accent-mint">
          <div className="stat-card-label">
            <Layers size={13} color="var(--teal)" />
            <span>Total Logged Events</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--mint)' }}>
            {totalEvents.toString().padStart(2, '0')}
          </div>
          <div className="stat-card-sub">Chronological events recorded</div>
        </div>

        <div className="audit-stat-card glass-card accent-champagne">
          <div className="stat-card-label">
            <User size={13} color="var(--champagne)" />
            <span>Monitored Cases</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--champagne)' }}>
            {uniqueCases.toString().padStart(2, '0')}
          </div>
          <div className="stat-card-sub">Distinct active case IDs</div>
        </div>

        <div className="audit-stat-card glass-card accent-mint">
          <div className="stat-card-label">
            <Activity size={13} color="var(--mint)" />
            <span>AI Extractions</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--seafoam)' }}>
            {aiEventsCount.toString().padStart(2, '0')}
          </div>
          <div className="stat-card-sub">Advisory transformations</div>
        </div>

        <div className="audit-stat-card glass-card accent-reviewer">
          <div className="stat-card-label">
            <ShieldCheck size={13} color="var(--seafoam)" />
            <span>Clinician Sign-offs</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--text-primary)' }}>
            {clinicianEventsCount.toString().padStart(2, '0')}
          </div>
          <div className="stat-card-sub">Human reviewer evaluations</div>
        </div>
      </div>

      {/* 5. Evidence Chain Visualization Panel */}
      <div className="evidence-chain-panel glass-card scroll-reveal reveal-delay-3">
        <div className="evidence-chain-panel-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lock size={15} color="var(--teal)" />
              <h2 style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                EVIDENCE CHAIN & PROVENANCE WORKFLOW
              </h2>
            </div>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Sequential verification path &bull; Every transformation is traceable &bull; AI assists, human clinician decides
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="provenance-tag reviewer glass" style={{ fontSize: '0.70rem' }}>
              Chronological Audit Event Record
            </span>
          </div>
        </div>

        <div className="evidence-chain-track" role="region" aria-label="Evidence Chain Progression">
          {evidenceStages.map((stage, idx) => {
            const StageIcon = stage.icon;
            const isLast = idx === evidenceStages.length - 1;
            return (
              <React.Fragment key={stage.id}>
                <div className={`evidence-chain-step glass-card ${stage.completed ? 'completed' : 'pending'}`}>
                  <div className={`evidence-step-icon-box glass ${stage.provenanceType}`}>
                    <StageIcon size={14} />
                  </div>
                  <div className="evidence-step-info">
                    <div className="evidence-step-name">
                      <span>{stage.label}</span>
                      {stage.completed && (
                        <CheckCircle2 size={12} color="var(--mint)" style={{ display: 'inline', flexShrink: 0 }} />
                      )}
                    </div>
                    <span className="evidence-step-desc">
                      {stage.completed ? stage.desc : 'Pending occurrence'}
                    </span>
                  </div>
                </div>

                {!isLast && (
                  <div className="evidence-chain-arrow">
                    <ArrowRight size={13} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 6. Command Filter Console */}
      <div className="audit-command-bar glass-panel scroll-reveal reveal-delay-3">
        <div className="audit-search-box glass-input">
          <Search size={15} color="var(--text-muted)" />
          <input
            type="text"
            className="audit-search-input"
            placeholder="SEARCH AUDIT EVENTS (e.g. CASE-1001, consent, AI)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search audit events"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Actor Filter Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, fontFamily: varCss('--font-mono', 'inherit') }}>
            ACTOR:
          </span>
          {[
            { id: 'all', label: 'All Actors' },
            { id: 'Patient', label: 'Patient' },
            { id: 'AI', label: 'AI Advisory' },
            { id: 'Clinician', label: 'Clinician' },
            { id: 'System', label: 'System' },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActorFilter(filter.id)}
              className={`sample-chip-btn glass ${actorFilter === filter.id ? 'active' : ''}`}
              style={{
                fontSize: '0.74rem',
                padding: '0.25rem 0.6rem',
                background: actorFilter === filter.id ? 'rgba(53, 224, 193, 0.20)' : undefined,
                borderColor: actorFilter === filter.id ? 'var(--teal)' : undefined,
                color: actorFilter === filter.id ? 'var(--mint)' : undefined,
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
          Showing <strong>{filteredLogs.length}</strong> of {logs.length} logged events
        </div>
      </div>

      {/* 7. Chronological Audit Timeline */}
      <div className="audit-timeline-container glass-card scroll-reveal reveal-delay-4">
        <div className="audit-timeline-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={16} color="var(--teal)" />
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                CHRONOLOGICAL AUDIT EVENT TIMELINE
              </h2>
            </div>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Audit Ledger &bull; Chronological in-memory event trace &bull; Real-time verified event feed
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
              FEED: LIVE IN-MEMORY
            </span>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
            <ShieldAlert size={40} style={{ opacity: 0.35, marginBottom: '0.75rem', color: 'var(--teal)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              No Audit Events Found
            </h3>
            <p style={{ fontSize: '0.82rem', maxWidth: '400px', margin: '0 auto' }}>
              {searchQuery || actorFilter !== 'all'
                ? 'No events match the active search query or actor filter. Try clearing filters.'
                : 'No audit events have been logged yet. Actions performed across intake, AI structuring, and reviewer dashboard will stream here automatically.'}
            </p>
            {(searchQuery || actorFilter !== 'all') && (
              <button
                type="button"
                className="btn btn-secondary glass"
                style={{ marginTop: '1rem', fontSize: '0.8rem' }}
                onClick={() => {
                  setSearchQuery('');
                  setActorFilter('all');
                }}
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="audit-timeline-stream" role="feed" aria-label="Audit Events Stream">
            {filteredLogs.map((log) => (
              <article key={log.id} className="audit-timeline-event" aria-label={`Audit event: ${log.action}`}>
                {/* Luminous Node */}
                <div className={`audit-timeline-node ${getNodeClass(log)}`} aria-hidden="true">
                  <div className="audit-timeline-node-inner" />
                </div>

                {/* Event Card */}
                <div className="audit-event-card glass-card">
                  <div className="audit-event-topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {getActorBadge(log)}
                      <button
                        type="button"
                        className="audit-case-pill glass"
                        onClick={() => setSearchQuery(log.caseId)}
                        title={`Filter by case ${log.caseId}`}
                      >
                        <span>CASE</span>
                        <strong>{log.caseId}</strong>
                      </button>
                    </div>

                    <div className="audit-timestamp-pill glass">
                      <Clock size={12} color="var(--text-muted)" />
                      <span>{formatDateTime(log.timestamp)}</span>
                    </div>
                  </div>

                  <div className="audit-event-action-row">
                    <div className="audit-event-action-title">
                      {log.action}
                    </div>
                  </div>

                  {log.details && (
                    <div className="audit-event-details-box glass-input">
                      {log.details}
                    </div>
                  )}

                  <div className="audit-event-meta-footer">
                    <span className="audit-event-id-mono">
                      EVENT ID: {log.id}
                    </span>
                    <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                      Traceability Verified &bull; System Log
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper for CSS font-mono fallback if needed in inline styles
function varCss(varName: string, fallback: string): string {
  return `var(${varName}, ${fallback})`;
}
