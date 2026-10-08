import React, { useState, useRef } from 'react';
import { Send, Mic, Paperclip, Loader2 } from 'lucide-react';
import { PatientAIAttachment } from './PatientAIAttachment';
import { PatientAIVoice } from './PatientAIVoice';
import type { ChatAttachmentItem } from '../../services/ai/patientChatClient';
import { patientChatClient } from '../../services/ai/patientChatClient';

interface PatientAIInputProps {
  onSendMessage: (text: string, attachments?: ChatAttachmentItem[], voiceUsed?: boolean) => void;
  onUploadReportFile?: (file: File) => void;
  isLoading: boolean;
  preferredLanguage?: string;
  onOpenVoiceDirectly?: boolean;
}

export const PatientAIInput: React.FC<PatientAIInputProps> = ({
  onSendMessage,
  onUploadReportFile,
  isLoading,
  preferredLanguage = 'English',
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [stagedAttachment, setStagedAttachment] = useState<ChatAttachmentItem | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSend = () => {
    if ((!inputText.trim() && !stagedAttachment) || isLoading || isProcessingFile) return;

    const attachmentsToSend = stagedAttachment ? [stagedAttachment] : undefined;
    onSendMessage(inputText.trim(), attachmentsToSend, false);
    setInputText('');
    setStagedAttachment(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Direct automatic report analysis flow
    if (onUploadReportFile) {
      onUploadReportFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    let previewUrl: string | undefined;
    if (file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file);
    }

    const tempItem: ChatAttachmentItem = {
      id: `att_${Date.now()}`,
      fileName: file.name,
      fileType: file.type || 'application/pdf',
      fileSizeBytes: file.size,
      previewUrl,
    };

    setStagedAttachment(tempItem);
    setIsProcessingFile(true);

    try {
      const ocrResult = await patientChatClient.processDocument(file);
      setStagedAttachment((prev) =>
        prev
          ? {
            ...prev,
            extractedText: ocrResult.extractedText,
            structuredValues: ocrResult.structuredValues,
          }
          : null
      );
    } catch (err) {
      console.error('[PatientAIInput] OCR extraction error:', err);
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleVoiceTranscribed = (transcript: string) => {
    setIsVoiceActive(false);
    setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div
      className="patient-ai-input-container"
      style={{
        padding: '0.75rem 1rem',
        background: 'linear-gradient(180deg, #141A1D 0%, #101517 100%)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottomLeftRadius: '18px',
        borderBottomRightRadius: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      {/* Voice Mode Panel */}
      {isVoiceActive && (
        <PatientAIVoice
          preferredLanguage={preferredLanguage}
          onTranscriptionComplete={handleVoiceTranscribed}
          onCancel={() => setIsVoiceActive(false)}
        />
      )}

      {/* Staged Compact Attachment Preview */}
      {stagedAttachment && !isVoiceActive && (
        <PatientAIAttachment
          attachment={stagedAttachment}
          onRemove={() => setStagedAttachment(null)}
          isProcessing={isProcessingFile}
        />
      )}

      {/* Unified Input Row: [Attach] [Voice] [ Text input... ] [Send] */}
      {!isVoiceActive && (
        <div
          className="patient-ai-input-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: '#101517',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            borderRadius: '14px',
            padding: '0.35rem 0.55rem',
            minHeight: '48px',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#67E8D4';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(103, 232, 212, 0.08)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.10)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {/* File Input (Hidden) */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            id="patient-ai-file-input"
          />

          {/* Attach Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach Medical Report / Image (PDF, JPG, PNG)"
            aria-label="Attach Medical Report or Image"
            disabled={isLoading || isProcessingFile}
            style={{
              width: '40px',
              height: '40px',
              minWidth: '40px',
              minHeight: '40px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #B5BFBC)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#67E8D4';
              e.currentTarget.style.background = 'rgba(103, 232, 212, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#B5BFBC';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Paperclip size={18} />
          </button>

          {/* Voice Button */}
          <button
            type="button"
            onClick={() => setIsVoiceActive(true)}
            title="Speak using Real Voice STT"
            aria-label="Speak using Voice"
            disabled={isLoading || isProcessingFile}
            style={{
              width: '40px',
              height: '40px',
              minWidth: '40px',
              minHeight: '40px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #B5BFBC)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#f87171';
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#B5BFBC';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Mic size={18} />
          </button>

          {/* Textarea Input */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              preferredLanguage.toLowerCase().includes('hindi')
                ? 'अपने लक्षण या स्वास्थ्य प्रश्न लिखें...'
                : 'Describe your symptoms or ask a health question...'
            }
            rows={1}
            disabled={isLoading}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary, #F5F7F6)',
              fontSize: '0.86rem',
              resize: 'none',
              padding: '8px 4px',
              fontFamily: 'inherit',
              maxHeight: '96px',
              minHeight: '24px',
              lineHeight: 1.45,
            }}
          />

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={(!inputText.trim() && !stagedAttachment) || isLoading || isProcessingFile}
            title="Send Message"
            aria-label="Send Message"
            id="btn-send-patient-ai-message"
            style={{
              width: '38px',
              height: '38px',
              minWidth: '38px',
              minHeight: '38px',
              borderRadius: '10px',
              background:
                (inputText.trim() || stagedAttachment) && !isLoading && !isProcessingFile
                  ? 'linear-gradient(135deg, #5DFDDD 0%, #20CFC0 100%)'
                  : 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color:
                (inputText.trim() || stagedAttachment) && !isLoading && !isProcessingFile
                  ? '#080D10'
                  : 'var(--text-muted, #7F8A87)',
              cursor:
                (inputText.trim() || stagedAttachment) && !isLoading && !isProcessingFile
                  ? 'pointer'
                  : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow:
                (inputText.trim() || stagedAttachment) && !isLoading && !isProcessingFile
                  ? '0 0 14px rgba(93, 253, 221, 0.35)'
                  : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" color="#67E8D4" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>
      )}

      {/* Safety Micro-Indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.66rem',
          color: 'var(--text-muted, #7F8A87)',
          padding: '0 4px',
        }}
      >
        <span>Healthcare guidance • Not a clinical diagnosis</span>
        <span style={{ color: 'var(--text-secondary, #B5BFBC)' }}>Enter to send • Shift+Enter for newline</span>
      </div>
    </div>
  );
};
