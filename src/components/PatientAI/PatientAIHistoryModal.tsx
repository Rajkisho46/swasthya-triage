import React from 'react';
import { History, X, Trash2, MessageSquare, Clock, ArrowRight, Plus } from 'lucide-react';
import type { ChatMessageItem } from '../../services/ai/patientChatClient';

export interface SavedChatSession {
  id: string;
  timestamp: string;
  summary: string;
  messages: ChatMessageItem[];
}

interface PatientAIHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedChatSession[];
  onSelectSession: (session: SavedChatSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewSession: () => void;
}

export const PatientAIHistoryModal: React.FC<PatientAIHistoryModalProps> = ({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
  onDeleteSession,
  onNewSession,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conversation History"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="glass-card scroll-reveal"
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '18px',
          background: 'linear-gradient(150deg, #181F22, #101517)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(103, 232, 212, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <History size={16} color="var(--primary-mint, #67E8D4)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Conversation History
              </h3>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #94a3b8)' }}>
                Patient-isolated consultations ({sessions.length})
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                onNewSession();
                onClose();
              }}
              className="btn btn-secondary glass"
              style={{ fontSize: '0.74rem', padding: '0.35rem 0.65rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Plus size={13} />
              <span>New</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              aria-label="Close History"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div
          style={{
            padding: '1rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            flex: 1,
          }}
        >
          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <MessageSquare size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
              <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600, fontSize: '0.90rem' }}>
                No saved conversations yet
              </p>
              <span style={{ fontSize: '0.76rem' }}>
                Your health conversations will appear here for future reference.
              </span>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 0.95rem',
                  borderRadius: '12px',
                  background: '#141A1D',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  gap: '0.75rem',
                  transition: 'background 0.2s, border-color 0.2s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      color: 'var(--text-primary, #ffffff)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginBottom: '0.2rem',
                    }}
                  >
                    {session.summary || 'Health consultation session'}
                  </div>
                  <div
                    style={{
                      fontSize: '0.70rem',
                      color: 'var(--text-muted, #94a3b8)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={11} />
                      {new Date(session.timestamp).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>&bull;</span>
                    <span>{session.messages.length} message{session.messages.length === 1 ? '' : 's'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(session);
                      onClose();
                    }}
                    className="btn btn-secondary glass"
                    style={{ fontSize: '0.74rem', padding: '0.35rem 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  >
                    <span>Load</span>
                    <ArrowRight size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(session.id)}
                    title="Delete session"
                    aria-label="Delete Session"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted, #64748b)',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '6px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
