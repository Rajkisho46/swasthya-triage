import React from 'react';
import {
  Activity,
  FileText,
  Clock,
  MapPin,
  Flame,
  ShieldCheck,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';
import type {
  ChatMessageItem,
  ChatAttachmentItem,
  MedicalReportAnalysisResponse,
} from '../../services/ai/patientChatClient';

interface PatientAIContextPanelProps {
  messages: ChatMessageItem[];
  healthContext?: any;
  activeReportAnalysis?: MedicalReportAnalysisResponse | null;
  attachments: ChatAttachmentItem[];
  onStartTriageIntake: () => void;
  className?: string;
}

export const PatientAIContextPanel: React.FC<PatientAIContextPanelProps> = ({
  messages,
  healthContext,
  activeReportAnalysis,
  attachments,
  onStartTriageIntake,
  className = '',
}) => {
  // Find the latest assistant message with structured symptoms or urgency
  const latestAiMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const latestUserMsg = [...messages].reverse().find((m) => m.role === 'user');

  // Extract structured values from authoritative healthContext or latest AI structured message
  const structured = latestAiMsg?.structuredSymptoms;
  const rawUrgencyStr = String(
    activeReportAnalysis?.urgency_level ||
    healthContext?.urgencyLevel ||
    latestAiMsg?.urgencyLevel ||
    ''
  ).toUpperCase();

  const isEmergency = rawUrgencyStr.includes('EMERGENCY');
  const isUrgent = rawUrgencyStr.includes('URGENT') && !isEmergency;
  const isPromptFollowup = rawUrgencyStr.includes('PROMPT') || rawUrgencyStr.includes('PRIORITY') || rawUrgencyStr.includes('FOLLOWUP');

  const urgencyDetected = Boolean(
    isEmergency ||
    isUrgent ||
    isPromptFollowup ||
    latestAiMsg?.urgencyDetected ||
    latestUserMsg?.urgencyDetected ||
    messages.some((m) => m.urgencyDetected)
  );

  // 1. Authoritative Chief Concern
  let chiefConcern =
    activeReportAnalysis?.report_title ||
    healthContext?.reportTitle ||
    healthContext?.currentConcern ||
    structured?.chief_complaint;

  // If chiefConcern is a raw prompt like "Please analyze this medical report...", normalize it
  if (chiefConcern) {
    const lower = chiefConcern.toLowerCase();
    if (
      lower.includes('please analyze') ||
      lower.includes('analyze this') ||
      lower.includes('check this report') ||
      lower.includes('read this report') ||
      lower.includes('uploaded medical report')
    ) {
      chiefConcern = activeReportAnalysis?.report_title || 'Hematology / CBC Report';
    }
  }

  if (!chiefConcern && structured?.reported_symptoms && structured.reported_symptoms.length > 0) {
    chiefConcern = structured.reported_symptoms[0];
  }
  if (!chiefConcern && latestUserMsg?.content) {
    const text = latestUserMsg.content.trim();
    const lower = text.toLowerCase();
    if (
      lower.includes('please analyze') ||
      lower.includes('analyze this') ||
      lower.includes('medical report') ||
      lower.includes('blood report') ||
      lower.includes('cbc')
    ) {
      chiefConcern = activeReportAnalysis?.report_title || 'Hematology / CBC Report';
    } else if (text.length > 0 && text.length < 60) {
      chiefConcern = text;
    }
  }

  // 2. Authoritative Duration, Location, Severity, and Associated Symptoms
  const duration =
    healthContext?.duration ||
    structured?.duration ||
    (latestUserMsg
      ? extractPatternFromMessage(
        latestUserMsg,
        /since\s+[a-z0-9]+|for\s+\d+\s*(?:days?|weeks?|hours?|months?)|just now|right now|yesterday|today|\d+\s*(?:days?|weeks?|hours?|months?)\s*ago/i
      )
      : null);
  const location =
    healthContext?.location ||
    structured?.location ||
    (latestUserMsg
      ? extractPatternFromMessage(
        latestUserMsg,
        /thumb|finger|hand|arm|leg|foot|left\s+side|right\s+side|both\s+sides|frontal|temple|forehead|chest|stomach|abdomen|throat|neck|back|lower\s+back|skin/i
      )
      : null);
  const severity =
    healthContext?.severity ||
    structured?.severity ||
    (latestUserMsg ? extractSeverityFromMessage(latestUserMsg) : null);
  const associated =
    healthContext?.associatedSymptoms ||
    (structured?.associated_symptoms
      ? Array.isArray(structured.associated_symptoms)
        ? structured.associated_symptoms.join(', ')
        : structured.associated_symptoms
      : latestUserMsg
        ? extractAssociatedSymptomsFromTurn(latestUserMsg, chiefConcern)
        : null);

  // All attachments collected in the conversation
  const allAttachments: ChatAttachmentItem[] = [
    ...attachments,
    ...(activeReportAnalysis ? [{
      id: activeReportAnalysis.attachment_id || activeReportAnalysis.report_id,
      fileName: activeReportAnalysis.filename,
      fileType: activeReportAnalysis.file_type,
      fileSizeBytes: 0,
      extractedText: activeReportAnalysis.raw_text,
    }] : []),
    ...messages.flatMap((m) => m.attachments || []),
  ].filter((v, i, a) => a.findIndex((t) => t.id === v.id || t.fileName === v.fileName) === i);

  return (
    <aside
      className={`patient-ai-context-panel ${className}`}
      aria-label="Health Context Live Inspector"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        padding: '1.15rem',
        background: '#0B1012',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        color: 'var(--text-primary, #F5F7F6)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '0.65rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: 'rgba(103, 232, 212, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={13} color="var(--primary-mint, #67E8D4)" />
          </div>
          <div>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-primary, #F5F7F6)',
              }}
            >
              HEALTH CONTEXT
            </span>
            <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary, #AAB5B2)' }}>
              Live session synthesis
            </div>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.62rem',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '999px',
            background: urgencyDetected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(103, 232, 212, 0.12)',
            color: urgencyDetected ? '#f87171' : 'var(--primary-mint, #67E8D4)',
            border: urgencyDetected ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(103, 232, 212, 0.3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: urgencyDetected ? '#ef4444' : '#67E8D4',
              boxShadow: urgencyDetected ? '0 0 6px #ef4444' : '0 0 6px #67E8D4',
            }}
          />
          {urgencyDetected ? 'Urgent Alert' : 'Active'}
        </span>
      </div>

      {/* 1. CURRENT CONCERN */}
      <div
        style={{
          background: '#101517',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.65rem 0.75rem',
        }}
      >
        <div
          style={{
            fontSize: '0.66rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted, #7F8A87)',
            marginBottom: '0.25rem',
          }}
        >
          CURRENT CONCERN
        </div>
        <div
          style={{
            fontSize: '0.86rem',
            fontWeight: 700,
            color: chiefConcern ? 'var(--text-primary, #F5F7F6)' : 'var(--text-muted, #7F8A87)',
          }}
        >
          {chiefConcern || 'Awaiting symptom description'}
        </div>
      </div>

      {/* 2. CONVERSATION DETAILS (Duration, Location, Severity, Associated) */}
      <div
        style={{
          background: '#101517',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.65rem 0.75rem',
        }}
      >
        <div
          style={{
            fontSize: '0.66rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted, #7F8A87)',
            marginBottom: '0.45rem',
          }}
        >
          CONVERSATION DETAILS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.76rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary, #AAB5B2)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={11} /> Duration
            </span>
            <span style={{ fontWeight: 600, color: duration ? 'var(--text-primary, #F5F7F6)' : 'var(--text-muted, #7F8A87)' }}>
              {duration || 'Not provided'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary, #AAB5B2)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <MapPin size={11} /> Location
            </span>
            <span style={{ fontWeight: 600, color: location ? 'var(--text-primary, #F5F7F6)' : 'var(--text-muted, #7F8A87)' }}>
              {location || 'Not provided'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary, #AAB5B2)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Flame size={11} /> Severity
            </span>
            <span style={{ fontWeight: 600, color: severity ? 'var(--champagne, #E2C382)' : 'var(--text-muted, #7F8A87)' }}>
              {severity || 'Not provided'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary, #AAB5B2)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <PlusCircle size={11} /> Associated
            </span>
            <span style={{ fontWeight: 600, color: associated ? 'var(--text-primary, #F5F7F6)' : 'var(--text-muted, #7F8A87)' }}>
              {associated || 'Not provided'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. ATTACHED DOCUMENTS */}
      <div
        style={{
          background: '#101517',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.65rem 0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <div
            style={{
              fontSize: '0.66rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted, #7F8A87)',
            }}
          >
            ATTACHED DOCUMENTS
          </div>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted, #7F8A87)' }}>
            {allAttachments.length} file{allAttachments.length === 1 ? '' : 's'}
          </span>
        </div>

        {allAttachments.length === 0 ? (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #7F8A87)', fontStyle: 'italic' }}>
            No medical documents attached yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {allAttachments.map((att) => (
              <div
                key={att.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.55rem',
                  borderRadius: '7px',
                  background: '#141A1D',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.72rem',
                }}
              >
                <FileText size={12} color="var(--primary-mint, #67E8D4)" />
                <span
                  style={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    color: 'var(--text-primary, #F5F7F6)',
                  }}
                >
                  {att.fileName}
                </span>
                {att.extractedText && (
                  <span
                    style={{
                      fontSize: '0.58rem',
                      color: 'var(--primary-mint, #67E8D4)',
                      background: 'rgba(103, 232, 212, 0.12)',
                      padding: '1px 4px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    OCR
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. AI STATUS & NEXT STEP (TRIAGE SHORTCUT) */}
      <div
        style={{
          marginTop: 'auto',
          background: '#101517',
          border: '1px solid rgba(103, 232, 212, 0.20)',
          borderRadius: '12px',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.55rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--primary-mint, #67E8D4)',
            }}
          >
            NEXT STEP
          </span>
          <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary, #AAB5B2)' }}>
            {messages.length > 1 ? 'Ready for triage' : 'Continue conversation'}
          </span>
        </div>

        <button
          type="button"
          onClick={onStartTriageIntake}
          className="btn btn-primary glass"
          id="btn-triage-shortcut-handoff"
          style={{
            width: '100%',
            padding: '0.55rem 0.85rem',
            fontSize: '0.80rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #5DFDDD 0%, #20CFC0 100%)',
            color: '#080D10',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(53, 224, 193, 0.25)',
          }}
        >
          <span>Start Triage Intake</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* 5. SAFETY FOOTER */}
      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted, #7F8A87)', textAlign: 'center', lineHeight: 1.3 }}>
        <ShieldCheck
          size={11}
          style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px', color: 'var(--champagne, #E2C382)' }}
        />
        AI guidance • Not a diagnosis
      </div>
    </aside>
  );
};

// Helper utilities to parse current turn details safely
function extractPatternFromMessage(msg: ChatMessageItem, regex: RegExp): string | null {
  if (!msg || !msg.content) return null;
  const match = msg.content.match(regex);
  return match ? match[0] : null;
}

function extractSeverityFromMessage(msg: ChatMessageItem): string | null {
  if (!msg || !msg.content) return null;
  const match = msg.content.match(/(\b\d{1,2}\s*\/\s*10\b|\b\d{1,2}\s*out\s*of\s*10\b|\b(?:mild|moderate|severe|extreme)\b)/i);
  return match ? match[0] : null;
}

function extractAssociatedSymptomsFromTurn(msg: ChatMessageItem, primaryConcern?: string): string | null {
  if (!msg || !msg.content) return null;
  const common = ['nausea', 'vomiting', 'fever', 'dizziness', 'cough', 'chills', 'sweating', 'fatigue', 'shortness of breath', 'weakness', 'photophobia', 'stiff neck', 'blister', 'swelling', 'redness'];
  const found: string[] = [];

  const text = msg.content.toLowerCase();
  for (const sym of common) {
    if (text.includes(sym) && (!primaryConcern || !primaryConcern.toLowerCase().includes(sym))) {
      const formatted = sym.charAt(0).toUpperCase() + sym.slice(1);
      if (!found.includes(formatted)) {
        found.push(formatted);
      }
    }
  }

  return found.length > 0 ? found.join(', ') : null;
}
