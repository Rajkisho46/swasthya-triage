import React, { useState, useEffect } from 'react';
import { Bot, X, ShieldCheck, HeartPulse } from 'lucide-react';
import { PatientAIHeader } from './PatientAIHeader';
import { PatientAIQuickActions } from './PatientAIQuickActions';
import { PatientAIMessageList } from './PatientAIMessageList';
import { PatientAIInput } from './PatientAIInput';
import type { ChatMessageItem, ChatAttachmentItem } from '../../services/ai/patientChatClient';
import { patientChatClient } from '../../services/ai/patientChatClient';
import { useAuth } from '../../context/AuthContext';

export interface PatientAIHandoffData {
  symptoms: string;
  extractedSymptoms?: string[];
  attachments?: ChatAttachmentItem[];
  preferredLanguage?: string;
  chiefComplaint?: string;
}

interface PatientAIChatProps {
  onHandoffToIntake?: (data: PatientAIHandoffData) => void;
  onNavigateToCases?: () => void;
  preferredLanguage?: string;
}

export const PatientAIChat: React.FC<PatientAIChatProps> = ({
  onHandoffToIntake,
  onNavigateToCases,
  preferredLanguage = 'English',
}) => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);

  // Storage key isolated per patient user
  const storageKey = `swasthya_patient_ai_chat_${currentUser?.userId || 'anon'}`;

  // Load conversation on mount
  useEffect(() => {
    try {
      const saved = (typeof window !== 'undefined' && window.localStorage?.getItem(storageKey)) ||
        (typeof window !== 'undefined' && window.sessionStorage?.getItem(storageKey));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      }
    } catch (e) {
      console.warn('[PatientAIChat] Failed to load session messages:', e);
    }
  }, [storageKey]);

  // Save conversation on update
  useEffect(() => {
    try {
      if (messages.length > 0) {
        const serialized = JSON.stringify(messages);
        if (typeof window !== 'undefined') {
          window.localStorage?.setItem(storageKey, serialized);
          window.sessionStorage?.setItem(storageKey, serialized);
        }
      } else {
        if (typeof window !== 'undefined') {
          window.localStorage?.removeItem(storageKey);
          window.sessionStorage?.removeItem(storageKey);
        }
      }
    } catch (e) {
      console.warn('[PatientAIChat] Failed to save session messages:', e);
    }
  }, [messages, storageKey]);

  const handleReset = () => {
    setMessages([]);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage?.removeItem(storageKey);
        window.sessionStorage?.removeItem(storageKey);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleSendMessage = async (
    text: string,
    attachments?: ChatAttachmentItem[],
    voiceUsed: boolean = false
  ) => {
    if (!text.trim() && (!attachments || attachments.length === 0)) return;

    const userMsgId = `msg_user_${Date.now()}`;
    const newUserMsg: ChatMessageItem = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      voiceUsed,
      attachments,
    };

    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      // Prepare backend payload
      const historyPayload = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        voice_used: m.voiceUsed,
      }));

      const attachmentPayload = attachments?.map((att) => ({
        file_name: att.fileName,
        file_type: att.fileType,
        extracted_text: att.extractedText,
        structured_values: att.structuredValues,
        file_size_bytes: att.fileSizeBytes,
      }));

      const res = await patientChatClient.sendMessage({
        messages: historyPayload,
        preferredLanguage,
        patientId: currentUser?.userId || currentUser?.username,
        attachments: attachmentPayload,
      });

      const assistantMsg: ChatMessageItem = {
        id: `msg_ai_${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        timestamp: new Date().toISOString(),
        urgencyDetected: res.urgency_detected,
        urgencyLevel: res.urgency_level,
        urgencyReasons: res.urgency_reasons,
        followUpQuestions: res.follow_up_questions,
        suggestedActions: res.suggested_actions,
        structuredSymptoms: res.structured_symptoms as any,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessageItem = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content:
          "The Health AI is temporarily unavailable. You can still submit your symptoms through the normal Patient Intake workflow.",
        timestamp: new Date().toISOString(),
        suggestedActions: ["Start Symptom Intake"],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectQuickAction = (prompt: string, intent?: 'voice' | 'upload' | 'default') => {
    if (intent === 'upload') {
      const fileInput = document.getElementById('patient-ai-file-input') as HTMLInputElement | null;
      if (fileInput) fileInput.click();
      return;
    }
    if (prompt) {
      handleSendMessage(prompt);
    }
  };

  const handleExecuteAction = (action: string, contextMessage?: ChatMessageItem) => {
    if (action === 'Start Symptom Intake' || action === 'Submit This Information') {
      // Gather all user messages and extracted text
      const allUserText = messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join('; ');

      const allAttachments = messages.flatMap((m) => m.attachments || []);

      if (onHandoffToIntake) {
        onHandoffToIntake({
          symptoms: allUserText || contextMessage?.content || 'Consultation via Swasthya Health AI',
          extractedSymptoms: contextMessage?.structuredSymptoms?.reported_symptoms,
          chiefComplaint: contextMessage?.structuredSymptoms?.chief_complaint,
          attachments: allAttachments,
          preferredLanguage,
        });
      }
      setIsOpen(false);
    } else if (action === 'View My Cases') {
      if (onNavigateToCases) {
        onNavigateToCases();
      }
      setIsOpen(false);
    } else if (action === 'Seek Emergency Care') {
      window.location.href = 'tel:108';
    } else if (action === 'Upload Another Report' || action === 'Upload a Report') {
      const fileInput = document.getElementById('patient-ai-file-input') as HTMLInputElement | null;
      if (fileInput) fileInput.click();
    } else if (action === 'Speak Instead') {
      // Handled in input
    }
  };

  return (
    <>
      {/* Floating AI Assistant Launcher Button */}
      {!isOpen && (
        <aside aria-label="AI Assistant Launcher">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            id="btn-open-patient-ai"
            className="patient-ai-floating-launcher glass"
            aria-label="Ask Health AI Assistant"
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              zIndex: 990,
              padding: '0.65rem 1.15rem',
              borderRadius: '999px',
              background: 'linear-gradient(135deg, #181F22, #101517)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(103, 232, 212, 0.08)',
              color: 'var(--text-primary, #F5F7F6)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.86rem',
              backdropFilter: 'blur(16px)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
              e.currentTarget.style.boxShadow =
                '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 28px rgba(103, 232, 212, 0.14)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow =
                '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(103, 232, 212, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(103, 232, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={17} color="#67E8D4" />
            </div>
            <span>Ask Health AI</span>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#67E8D4',
                boxShadow: '0 0 8px #67E8D4',
              }}
            />
          </button>
        </aside>
      )}

      {/* Floating Chat Panel */}
      {isOpen && (
        <aside aria-label="Swāsthya Health AI Chat Panel">
          <div
            className="patient-ai-chat-panel glass-panel"
            id="patient-ai-chat-modal"
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              width: '420px',
              maxWidth: 'calc(100vw - 24px)',
              height: '640px',
              maxHeight: 'calc(100vh - 40px)',
              borderRadius: '20px',
              background: 'linear-gradient(150deg, #181F22, #101517)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 35px rgba(103, 232, 212, 0.08)',
              backdropFilter: 'blur(20px)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1000,
              overflow: 'hidden',
              animation: 'slideUpFade 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Header */}
            <PatientAIHeader
              onClose={() => setIsOpen(false)}
              onResetConversation={handleReset}
              onOpenAbout={() => setIsAboutModalOpen(true)}
              messageCount={messages.length}
            />

            {/* Conversation Body */}
            {messages.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  padding: '1.25rem',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: '16px',
                    background: '#141A1D',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.4rem',
                    }}
                  >
                    <HeartPulse size={18} color="var(--primary-mint, #67E8D4)" />
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '0.88rem',
                        fontWeight: 800,
                        color: 'var(--text-primary, #F5F7F6)',
                      }}
                    >
                      Namaste! I am your Health AI Assistant.
                    </h4>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.78rem',
                      lineHeight: 1.5,
                      color: 'var(--text-secondary, #B5BFBC)',
                    }}
                  >
                    I can help you describe your symptoms, explain medical reports, prepare for a
                    doctor consultation, or guide you through the Swasthya Triage intake process.
                  </p>
                </div>

                <PatientAIQuickActions onSelectAction={handleSelectQuickAction} />
              </div>
            ) : (
              <PatientAIMessageList
                messages={messages}
                isLoading={isLoading}
                preferredLanguage={preferredLanguage}
                onSelectFollowUp={(q) => handleSendMessage(q)}
                onExecuteAction={handleExecuteAction}
              />
            )}

            {/* Input Footer */}
            <PatientAIInput
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              preferredLanguage={preferredLanguage}
            />
          </div>
        </aside>
      )}

      {/* About Health AI Safety & Privacy Modal */}
      {isAboutModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem',
          }}
          onClick={() => setIsAboutModalOpen(false)}
        >
          <div
            className="glass-card"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '1.5rem',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#181F22',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={22} color="#67E8D4" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#F5F7F6' }}>
                  About Swāsthya Health AI
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAboutModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary, #CBD5E1)',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                fontSize: '0.82rem',
                color: '#B5BFBC',
                lineHeight: 1.55,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div>
                <strong style={{ color: '#67E8D4' }}>1. Guidance, Not a Final Diagnosis:</strong> The
                Health AI assistant structures reported symptoms and provides educational healthcare
                information. It does not replace a licensed medical clinician.
              </div>
              <div>
                <strong style={{ color: '#E2C382' }}>2. Emergency Notice:</strong> If you or someone
                around you is experiencing severe chest pain, extreme shortness of breath, sudden
                numbness/paralysis, or heavy bleeding, call national emergency services (108 / 112)
                immediately.
              </div>
              <div>
                <strong style={{ color: '#3DB8AA' }}>3. Privacy & Governance:</strong> Conversations
                and uploaded documents are processed securely through institutional backend proxies
                under patient ownership. Data is never sold or used for public training.
              </div>
              <div>
                <strong style={{ color: '#67E8D4' }}>4. Clinical Triage Integration:</strong> When
                you choose to submit your symptoms, your structured data is transferred to the
                official Patient Intake queue for verification by human Nursing Staff and Medical
                Officers.
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-primary glass"
                onClick={() => setIsAboutModalOpen(false)}
                style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
