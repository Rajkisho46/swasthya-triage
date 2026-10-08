import React from 'react';
import { FileText, Image as ImageIcon, X, Loader2, CheckCircle2 } from 'lucide-react';
import type { ChatAttachmentItem } from '../../services/ai/patientChatClient';

interface PatientAIAttachmentProps {
  attachment: ChatAttachmentItem;
  onRemove?: () => void;
  isProcessing?: boolean;
}

export const PatientAIAttachment: React.FC<PatientAIAttachmentProps> = ({
  attachment,
  onRemove,
  isProcessing = false,
}) => {
  const isPdf = attachment.fileType.toLowerCase().includes('pdf') || attachment.fileName.toLowerCase().endsWith('.pdf');
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="patient-ai-attachment-card" style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.6rem',
      padding: '0.45rem 0.75rem',
      borderRadius: '12px',
      background: 'rgba(20, 26, 29, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      maxWidth: '100%',
      position: 'relative',
      margin: '0.25rem 0',
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        background: isPdf ? 'rgba(239, 68, 68, 0.15)' : 'rgba(103, 232, 212, 0.12)',
        border: `1px solid ${isPdf ? 'rgba(239, 68, 68, 0.3)' : 'rgba(103, 232, 212, 0.25)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {attachment.previewUrl ? (
          <img
            src={attachment.previewUrl}
            alt="Preview"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : isPdf ? (
          <FileText size={16} color="#f87171" />
        ) : (
          <ImageIcon size={16} color="#67E8D4" />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.76rem',
          fontWeight: 700,
          color: 'var(--text-primary, #ffffff)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '180px',
        }}>
          {attachment.fileName}
        </div>
        <div style={{
          fontSize: '0.68rem',
          color: 'var(--text-secondary, #94a3b8)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span>{formatSize(attachment.fileSizeBytes)}</span>
          {isProcessing ? (
            <span style={{ color: 'var(--champagne, #f6d58d)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <Loader2 size={10} className="animate-spin" /> Analyzing...
            </span>
          ) : attachment.extractedText ? (
            <span style={{ color: 'var(--primary-mint, #35e0c1)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              <CheckCircle2 size={10} /> OCR Analyzed
            </span>
          ) : null}
        </div>
      </div>

      {onRemove && !isProcessing && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove attachment"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary, #94a3b8)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
