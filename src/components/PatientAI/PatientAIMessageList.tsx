import React, { useRef, useEffect, useState } from 'react';
import {
  Bot,
  User,
  AlertTriangle,
  Volume2,
  VolumeX,
  Sparkles,
  ArrowUpRight,
  Mic,
} from 'lucide-react';
import type { ChatMessageItem } from '../../services/ai/patientChatClient';
import { sanitizeHealthAIResponse } from '../../utils/sanitizeHealthAI';
import { PatientAIAttachment } from './PatientAIAttachment';

interface PatientAIMessageListProps {
  messages: ChatMessageItem[];
  isLoading: boolean;
  onSelectFollowUp?: (question: string) => void;
  onExecuteAction: (action: string, contextMessage?: ChatMessageItem) => void;
  preferredLanguage?: string;
}

export const PatientAIMessageList: React.FC<PatientAIMessageListProps> = ({
  messages,
  isLoading,
  onExecuteAction,
  preferredLanguage = 'English',
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleReadAloud = (msg: ChatMessageItem) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingMsgId === msg.id) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(msg.content);
    if (preferredLanguage.toLowerCase().includes('hindi')) {
      utterance.lang = 'hi-IN';
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = 0.95;

    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msg.id);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="patient-ai-message-list" style={{
      flex: 1,
      overflowY: 'auto',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    }}>
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const isSpeaking = speakingMsgId === msg.id;

        return (
          <div
            key={msg.id}
            className={`patient-ai-message-row ${isUser ? 'user-row' : 'assistant-row'}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start',
              gap: '0.35rem',
            }}
          >
            {/* Header with avatar & time */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.68rem',
              color: 'var(--text-secondary, #B5BFBC)',
              padding: '0 4px',
            }}>
              {!isUser ? (
                <>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '5px',
                    background: 'rgba(103, 232, 212, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Bot size={12} color="#67E8D4" />
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--primary-mint, #67E8D4)' }}>Health AI</span>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 600, color: '#F5F7F6' }}>You</span>
                  {msg.voiceUsed && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                      color: '#f87171',
                      fontSize: '0.65rem',
                    }}>
                      <Mic size={10} /> Voice
                    </span>
                  )}
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '5px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <User size={12} color="#F5F7F6" />
                  </div>
                </>
              )}
            </div>

            {/* Message Bubble Card */}
            <div
              className={`patient-ai-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}
              style={{
                maxWidth: '92%',
                padding: '0.85rem 1rem',
                borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                background: isUser
                  ? 'linear-gradient(135deg, #181F22 0%, #141A1D 100%)'
                  : 'linear-gradient(135deg, #101517 0%, #0D1214 100%)',
                border: isUser
                  ? '1px solid rgba(255, 255, 255, 0.10)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-primary, #F5F7F6)',
                fontSize: '0.84rem',
                lineHeight: 1.5,
                boxShadow: isUser
                  ? '0 2px 10px rgba(0, 0, 0, 0.35)'
                  : '0 4px 16px rgba(0, 0, 0, 0.30)',
              }}
            >
              {/* Attachments within this message */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.6rem' }}>
                  {msg.attachments.map((att) => (
                    <PatientAIAttachment key={att.id} attachment={att} />
                  ))}
                </div>
              )}

              {/* Message Content with structured line breaks */}
              <div style={{ whiteSpace: 'pre-line' }}>{isUser ? msg.content : sanitizeHealthAIResponse(msg.content)}</div>

              {/* Urgency Emergency Warning Card */}
              {msg.urgencyDetected && (
                <div
                  className="patient-ai-urgency-card"
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem 0.9rem',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(153, 27, 27, 0.25))',
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
                  <div style={{ fontSize: '0.76rem', color: '#fee2e2' }}>
                    Based on the symptoms described, this may require immediate clinical evaluation. If severe or worsening, please seek emergency care right away.
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => onExecuteAction('Seek Emergency Care', msg)}
                      className="btn btn-primary glass"
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.74rem',
                        background: '#ef4444',
                        borderColor: '#ef4444',
                        color: '#ffffff',
                        fontWeight: 700,
                      }}
                    >
                      Seek Emergency Care (108 / 112)
                    </button>
                    <button
                      type="button"
                      onClick={() => onExecuteAction('Start Symptom Intake', msg)}
                      className="btn btn-secondary glass"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.74rem' }}
                    >
                      Submit for Urgent Triage
                    </button>
                  </div>
                </div>
              )}

              {/* TTS Read Aloud Control (Assistant only) */}
              {!isUser && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  marginTop: '0.5rem',
                  paddingTop: '0.35rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                }}>
                  <button
                    type="button"
                    onClick={() => handleReadAloud(msg)}
                    title={isSpeaking ? 'Stop reading' : 'Read aloud'}
                    aria-label={isSpeaking ? 'Stop reading' : 'Read aloud'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isSpeaking ? 'var(--primary-mint, #67E8D4)' : 'var(--text-muted, #94A3B8)',
                      fontSize: '0.70rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: '4px',
                    }}
                  >
                    {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    <span>{isSpeaking ? 'Stop Audio' : 'Read aloud'}</span>
                  </button>
                </div>
              )}
            </div>


            {/* Smart Suggested Actions */}
            {!isUser && msg.suggestedActions && msg.suggestedActions.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.35rem',
                marginTop: '0.2rem',
                maxWidth: '92%',
              }}>
                {msg.suggestedActions.map((action, idx) => {
                  if (action === 'Seek Emergency Care' && msg.urgencyDetected) return null; // already shown above
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onExecuteAction(action, msg)}
                      className="patient-ai-smart-action-btn"
                      style={{
                        padding: '0.35rem 0.70rem',
                        borderRadius: '999px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: 'var(--text-primary, #F5F7F6)',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(103, 232, 212, 0.35)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                      }}
                    >
                      <span>{action}</span>
                      <ArrowUpRight size={11} color="var(--primary-mint, #67E8D4)" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Loading Indicator */}
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: 'rgba(103, 232, 212, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Bot size={14} color="#67E8D4" />
          </div>
          <div style={{
            padding: '0.6rem 0.9rem',
            borderRadius: '4px 14px 14px 14px',
            background: '#141A1D',
            border: '1px solid rgba(103, 232, 212, 0.2)',
            fontSize: '0.78rem',
            color: 'var(--primary-mint, #67E8D4)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Sparkles size={14} className="animate-spin" />
            <span>Analyzing symptoms & organizing clinical context...</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
