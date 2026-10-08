import React from 'react';
import {
  Bot,
  User,
  AlertTriangle,
  Volume2,
  VolumeX,
  Mic,
  ArrowUpRight,
  FileSearch,
  PlusCircle,
} from 'lucide-react';
import type { ChatMessageItem } from '../../services/ai/patientChatClient';
import { sanitizeHealthAIResponse, sanitizeHealthAIList } from '../../utils/sanitizeHealthAI';
import { PatientAIAttachment } from './PatientAIAttachment';

interface PatientAIMessageProps {
  message: ChatMessageItem;
  isSpeaking: boolean;
  onReadAloud: (msg: ChatMessageItem) => void;
  onSelectFollowUp?: (question: string) => void;
  onExecuteAction?: (action: string, contextMessage?: ChatMessageItem) => void;
}

export const PatientAIMessage: React.FC<PatientAIMessageProps> = ({
  message: msg,
  isSpeaking,
  onReadAloud,
  onSelectFollowUp,
  onExecuteAction,
}) => {
  const isUser = msg.role === 'user';
  const timestampFormatted = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className={`patient-ai-message-row ${isUser ? 'user-row' : 'assistant-row'}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: '0.35rem',
        width: '100%',
        animation: 'fadeInUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Sender Header & Timestamp */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          fontSize: '0.68rem',
          color: 'var(--text-secondary, #B5BFBC)',
          padding: '0 4px',
        }}
      >
        {!isUser ? (
          <>
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'rgba(103, 232, 212, 0.12)',
                border: '1px solid rgba(103, 232, 212, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={13} color="#67E8D4" />
            </div>
            <span style={{ fontWeight: 700, color: 'var(--primary-mint, #67E8D4)' }}>Health AI</span>
            {timestampFormatted && (
              <span style={{ color: 'var(--text-muted, #7F8A87)', fontSize: '0.65rem' }}>• {timestampFormatted}</span>
            )}
          </>
        ) : (
          <>
            {timestampFormatted && (
              <span style={{ color: 'var(--text-muted, #7F8A87)', fontSize: '0.65rem' }}>{timestampFormatted} •</span>
            )}
            <span style={{ fontWeight: 600, color: '#F5F7F6' }}>You</span>
            {msg.voiceUsed && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  color: '#f87171',
                  fontSize: '0.64rem',
                  background: 'rgba(239, 68, 68, 0.12)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontWeight: 600,
                }}
              >
                <Mic size={10} /> Voice
              </span>
            )}
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={13} color="#F5F7F6" />
            </div>
          </>
        )}
      </div>

      {/* Message Bubble Card */}
      <div
        className={`patient-ai-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}
        style={{
          maxWidth: isUser ? '85%' : '92%',
          minWidth: 0,
          padding: isUser ? '0.80rem 1.05rem' : '0.95rem 1.15rem',
          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          background: isUser
            ? 'linear-gradient(135deg, #181F22 0%, #141A1D 100%)'
            : 'linear-gradient(135deg, #101517 0%, #0D1214 100%)',
          border: isUser
            ? '1px solid rgba(255, 255, 255, 0.10)'
            : '1px solid rgba(255, 255, 255, 0.08)',
          color: 'var(--text-primary, #F5F7F6)',
          fontWeight: 400,
          fontSize: '0.86rem',
          lineHeight: 1.55,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          boxShadow: isUser
            ? '0 4px 16px rgba(0, 0, 0, 0.35)'
            : '0 4px 16px rgba(0, 0, 0, 0.30)',
        }}
      >
        {/* Attachments within this message */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.65rem' }}>
            {msg.attachments.map((att) => (
              <PatientAIAttachment key={att.id} attachment={att} />
            ))}
          </div>
        )}

        {/* Message Content */}
        <div style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {isUser ? msg.content : sanitizeHealthAIResponse(msg.content)}
        </div>

        {/* Restrained Urgency Emergency Warning Card */}
        {msg.urgencyDetected && (
          <div
            className="patient-ai-urgency-card"
            style={{
              marginTop: '0.85rem',
              padding: '0.80rem 0.95rem',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(153, 27, 27, 0.24))',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#f87171', fontWeight: 800, fontSize: '0.78rem' }}>
              <AlertTriangle size={15} />
              <span>URGENT MEDICAL ATTENTION</span>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#fee2e2', lineHeight: 1.4 }}>
              Because you&apos;ve described potentially urgent symptoms, this may require immediate clinical evaluation. If symptoms are severe, sudden, or worsening, seek emergency medical care immediately.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onExecuteAction && onExecuteAction('Seek Emergency Care', msg)}
                className="btn btn-primary glass"
                style={{
                  padding: '0.38rem 0.80rem',
                  fontSize: '0.74rem',
                  background: '#ef4444',
                  borderColor: '#ef4444',
                  color: '#ffffff',
                  fontWeight: 700,
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                Seek Emergency Care (108 / 112)
              </button>
              <button
                type="button"
                onClick={() => onExecuteAction && onExecuteAction('Start Symptom Intake', msg)}
                className="btn btn-secondary glass"
                style={{ padding: '0.38rem 0.80rem', fontSize: '0.74rem', borderRadius: '8px', cursor: 'pointer' }}
              >
                Submit for Urgent Triage
              </button>
            </div>
          </div>
        )}

        {/* Interactive Follow-up Question Chips */}
        {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.75rem' }}>
            <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted, #7F8A87)' }}>
              Suggested responses
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {sanitizeHealthAIList(msg.followUpQuestions).map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectFollowUp && onSelectFollowUp(q)}
                  className="quick-action-chip"
                  style={{
                    padding: '0.32rem 0.65rem',
                    borderRadius: '8px',
                    background: 'rgba(103, 232, 212, 0.08)',
                    border: '1px solid rgba(103, 232, 212, 0.22)',
                    color: 'var(--primary-mint, #67E8D4)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    textAlign: 'left',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <span>{q}</span>
                  <ArrowUpRight size={11} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Action Secondary Buttons below AI responses */}
        {!isUser && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <button
              type="button"
              onClick={() => onExecuteAction && onExecuteAction('Start Symptom Intake', msg)}
              className="btn btn-secondary glass"
              style={{ padding: '0.30rem 0.60rem', fontSize: '0.72rem', borderRadius: '7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <PlusCircle size={12} color="var(--primary-mint, #67E8D4)" />
              <span>Start Symptom Intake</span>
            </button>

            <button
              type="button"
              onClick={() => onExecuteAction && onExecuteAction('Speak Instead', msg)}
              className="btn btn-secondary glass"
              style={{ padding: '0.30rem 0.60rem', fontSize: '0.72rem', borderRadius: '7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Mic size={12} color="#f87171" />
              <span>Speak Instead</span>
            </button>

            <button
              type="button"
              onClick={() => onExecuteAction && onExecuteAction('Upload a Report', msg)}
              className="btn btn-secondary glass"
              style={{ padding: '0.30rem 0.60rem', fontSize: '0.72rem', borderRadius: '7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <FileSearch size={12} color="#67E8D4" />
              <span>Upload a Report</span>
            </button>
          </div>
        )}

        {/* TTS Read Aloud Control (Assistant only) */}
        {!isUser && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              marginTop: '0.4rem',
            }}
          >
            <button
              type="button"
              onClick={() => onReadAloud(msg)}
              title={isSpeaking ? 'Stop reading' : 'Read aloud'}
              aria-label={isSpeaking ? 'Stop reading' : 'Read aloud'}
              style={{
                background: 'transparent',
                border: 'none',
                color: isSpeaking ? 'var(--primary-mint, #67E8D4)' : 'var(--text-muted, #7F8A87)',
                fontSize: '0.68rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: '4px',
              }}
            >
              {isSpeaking ? <VolumeX size={12} /> : <Volume2 size={12} />}
              <span>{isSpeaking ? 'Stop' : 'Listen'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
