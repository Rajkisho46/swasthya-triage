import React, { useRef, useEffect, useState } from 'react';
import {
  HeartPulse,
  Activity,
  FileSearch,
  ShieldCheck,
  Mic,
  UploadCloud,
  Loader2,
} from 'lucide-react';
import type { ChatMessageItem } from '../../services/ai/patientChatClient';
import { PatientAIMessage } from './PatientAIMessage';

interface PatientAIConversationProps {
  messages: ChatMessageItem[];
  isLoading: boolean;
  onSelectQuickAction: (prompt: string, intent?: 'voice' | 'upload' | 'default') => void;
  onSelectFollowUp: (question: string) => void;
  onExecuteAction: (action: string, contextMessage?: ChatMessageItem) => void;
  preferredLanguage?: string;
}

export const PatientAIConversation: React.FC<PatientAIConversationProps> = ({
  messages,
  isLoading,
  onSelectQuickAction,
  onSelectFollowUp,
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
    <div
      className="patient-ai-conversation-stream"
      role="log"
      aria-live="polite"
      aria-label="Health AI Conversation History"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      {/* 1. INITIAL EMPTY STATE */}
      {messages.length === 0 && (
        <div
          className="patient-ai-empty-state"
          style={{
            margin: 'auto',
            maxWidth: '620px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
            padding: '2rem 1rem',
          }}
        >
          {/* Abstract Healthcare AI Visual */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'radial-gradient(circle at 30% 30%, rgba(103, 232, 212, 0.2), rgba(61, 184, 170, 0.08))',
              border: '1px solid rgba(103, 232, 212, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(103, 232, 212, 0.1)',
            }}
          >
            <HeartPulse size={34} color="var(--primary-mint, #67E8D4)" />
          </div>

          <div>
            <h2
              style={{
                fontSize: '1.45rem',
                fontWeight: 800,
                color: 'var(--text-primary, #F5F7F6)',
                margin: '0 0 0.5rem 0',
                letterSpacing: '-0.01em',
              }}
            >
              How can I help with your health today?
            </h2>
            <p
              style={{
                fontSize: '0.88rem',
                color: 'var(--text-secondary, #B5BFBC)',
                margin: 0,
                lineHeight: 1.55,
                maxWidth: '520px',
              }}
            >
              Describe your symptoms, ask a health question, or upload a medical document. I&apos;ll help you understand the information and identify what may need attention.
            </p>
          </div>

          {/* 5 Quick Action Buttons */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.65rem',
              width: '100%',
              marginTop: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={() =>
                onSelectQuickAction(
                  'I want to describe the symptoms I have been experiencing so you can help organize them.'
                )
              }
              className="quick-action-button glass-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.75rem 0.95rem',
                borderRadius: '12px',
                background: '#141A1D',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-primary, #F5F7F6)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <Activity size={16} color="#67E8D4" />
              <span>Describe Symptoms</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onSelectQuickAction(
                  'I have a medical report or lab test. Can you help me understand the terms and results?',
                  'upload'
                )
              }
              className="quick-action-button glass-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.75rem 0.95rem',
                borderRadius: '12px',
                background: '#141A1D',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-primary, #F5F7F6)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <FileSearch size={16} color="#3DB8AA" />
              <span>Understand a Report</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onSelectQuickAction(
                  'What critical information, timing, and symptoms should I organize before starting clinical triage?'
                )
              }
              className="quick-action-button glass-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.75rem 0.95rem',
                borderRadius: '12px',
                background: '#141A1D',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-primary, #F5F7F6)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <ShieldCheck size={16} color="var(--champagne, #E2C382)" />
              <span>Prepare for Triage</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectQuickAction('', 'voice')}
              className="quick-action-button glass-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.75rem 0.95rem',
                borderRadius: '12px',
                background: '#141A1D',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-primary, #F5F7F6)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <Mic size={16} color="#67E8D4" />
              <span>Use Voice</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectQuickAction('', 'upload')}
              className="quick-action-button glass-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.75rem 0.95rem',
                borderRadius: '12px',
                background: '#141A1D',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-primary, #F5F7F6)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <UploadCloud size={16} color="#3DB8AA" />
              <span>Upload Document</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. CONVERSATION MESSAGES */}
      {messages.length > 0 &&
        messages.map((msg) => (
          <PatientAIMessage
            key={msg.id}
            message={msg}
            isSpeaking={speakingMsgId === msg.id}
            onReadAloud={handleReadAloud}
            onSelectFollowUp={onSelectFollowUp}
            onExecuteAction={onExecuteAction}
          />
        ))}

      {/* 3. LOADING / ANALYSIS INDICATOR */}
      {isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.75rem 1rem',
            borderRadius: '14px',
            background: 'rgba(20, 26, 29, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--primary-mint, #67E8D4)',
            fontSize: '0.80rem',
            fontWeight: 600,
            width: 'fit-content',
          }}
        >
          <Loader2 size={16} className="animate-spin" />
          <span>Health AI analyzing symptoms &amp; clinical context...</span>
        </div>
      )}

      <div ref={bottomRef} style={{ height: '1px' }} />
    </div>
  );
};
