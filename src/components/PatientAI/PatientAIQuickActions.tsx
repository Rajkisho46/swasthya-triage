import React from 'react';
import { Activity, FileSearch, ShieldCheck, Stethoscope, Mic, UploadCloud, ChevronRight } from 'lucide-react';

interface PatientAIQuickActionsProps {
  onSelectAction: (text: string, intent?: 'voice' | 'upload' | 'default') => void;
}

const QUICK_ACTIONS = [
  {
    id: 'symptoms',
    icon: Activity,
    label: 'Describe my symptoms',
    prompt: 'I want to describe the symptoms I have been experiencing so you can help organize them.',
    color: '#67E8D4',
  },
  {
    id: 'report',
    icon: FileSearch,
    label: 'Understand a report',
    prompt: 'I have a medical/lab report. Can you explain what the test results and terms mean?',
    intent: 'upload' as const,
    color: '#3DB8AA',
  },
  {
    id: 'triage_status',
    icon: ShieldCheck,
    label: 'Check my triage status',
    prompt: 'How can I check the status of my clinical cases and what happens during medical review?',
    color: '#E2C382',
  },
  {
    id: 'prepare_doctor',
    icon: Stethoscope,
    label: 'Help me prepare for a doctor',
    prompt: 'What important information, timeline, and questions should I organize before speaking with a doctor?',
    color: '#B5BFBC',
  },
  {
    id: 'voice',
    icon: Mic,
    label: 'Use voice to speak',
    prompt: '',
    intent: 'voice' as const,
    color: '#67E8D4',
  },
  {
    id: 'upload',
    icon: UploadCloud,
    label: 'Upload a report',
    prompt: '',
    intent: 'upload' as const,
    color: '#3DB8AA',
  },
];

export const PatientAIQuickActions: React.FC<PatientAIQuickActionsProps> = ({
  onSelectAction,
}) => {
  return (
    <div className="patient-ai-quick-actions" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      padding: '0.75rem 0',
    }}>
      <div style={{
        fontSize: '0.72rem',
        fontWeight: 700,
        color: 'var(--text-secondary, #B5BFBC)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '0.2rem',
      }}>
        How can I help you right now?
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.45rem',
      }}>
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onSelectAction(action.prompt, action.intent)}
              className="quick-action-chip"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 0.75rem',
                borderRadius: '12px',
                background: '#141A1D',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-primary, #F5F7F6)',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#181F22';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#141A1D';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '7px',
                background: 'rgba(255, 255, 255, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={14} color={action.color} />
              </div>
              <span style={{ flex: 1, lineHeight: 1.25 }}>{action.label}</span>
              <ChevronRight size={12} color="var(--text-secondary, #7F8A87)" style={{ opacity: 0.6 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
