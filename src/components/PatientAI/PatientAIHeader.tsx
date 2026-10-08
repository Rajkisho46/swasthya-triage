import React from 'react';
import { Bot, RotateCcw, X, ShieldAlert, Sparkles } from 'lucide-react';

interface PatientAIHeaderProps {
  onClose: () => void;
  onResetConversation: () => void;
  onOpenAbout: () => void;
  messageCount: number;
}

export const PatientAIHeader: React.FC<PatientAIHeaderProps> = ({
  onClose,
  onResetConversation,
  onOpenAbout,
  messageCount,
}) => {
  return (
    <header className="patient-ai-header" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.85rem 1.1rem',
      background: 'linear-gradient(180deg, #141A1D, #101517)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      borderTopLeftRadius: '20px',
      borderTopRightRadius: '20px',
      backdropFilter: 'blur(16px)',
      position: 'relative',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: 'radial-gradient(circle at 30% 30%, rgba(103, 232, 212, 0.2), rgba(61, 184, 170, 0.08))',
          border: '1px solid rgba(103, 232, 212, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 12px rgba(103, 232, 212, 0.1)',
        }}>
          <Bot size={20} color="var(--primary-mint, #67E8D4)" />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <h3 style={{
              fontSize: '0.96rem',
              fontWeight: 800,
              color: 'var(--text-primary, #F5F7F6)',
              margin: 0,
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              Swāsthya Health AI
              <Sparkles size={13} color="var(--champagne, #E2C382)" />
            </h3>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '999px',
              background: 'rgba(103, 232, 212, 0.12)',
              color: 'var(--primary-mint, #67E8D4)',
              border: '1px solid rgba(103, 232, 212, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <span style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: '#67E8D4',
                boxShadow: '0 0 6px #67E8D4',
              }} />
              AI Assistant
            </span>
          </div>
          <div style={{
            fontSize: '0.70rem',
            color: 'var(--text-secondary, #94a3b8)',
            marginTop: '1px',
          }}>
            Healthcare guidance • Triage support
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <button
          type="button"
          onClick={onOpenAbout}
          title="About Health AI & Safety Boundary"
          aria-label="About Health AI & Safety Boundary"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary, #94a3b8)',
            padding: '5px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#35e0c1')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
        >
          <ShieldAlert size={16} />
        </button>

        {messageCount > 0 && (
          <button
            type="button"
            onClick={onResetConversation}
            title="Start New Conversation"
            aria-label="Start New Conversation"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              padding: '5px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#35e0c1')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <RotateCcw size={15} />
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          title="Close Health Assistant"
          aria-label="Close Health Assistant"
          id="btn-close-patient-ai"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'var(--text-secondary, #94a3b8)',
            padding: '5px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
};
