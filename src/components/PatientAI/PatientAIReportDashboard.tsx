import React, { useState } from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  MessageSquare,
  Copy,
  Check,
  Clock,
  Layers,
  Activity,
  HeartPulse,
  Send,
} from 'lucide-react';
import type { MedicalReportAnalysisResponse } from '../../services/ai/patientChatClient';
import { sanitizeHealthAIResponse, sanitizeHealthAIList } from '../../utils/sanitizeHealthAI';

interface PatientAIReportDashboardProps {
  report: MedicalReportAnalysisResponse;
  onHandoffToIntake?: () => void;
  onAskInChat?: (prefillQuestion?: string) => void;
  onUploadAnother?: () => void;
}

export const PatientAIReportDashboard: React.FC<PatientAIReportDashboardProps> = ({
  report,
  onHandoffToIntake,
  onAskInChat,
  onUploadAnother,
}) => {
  const [copiedQuestion, setCopiedQuestion] = useState<string | null>(null);
  const [showNormalValues, setShowNormalValues] = useState<boolean>(true);

  const handleCopyQuestion = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedQuestion(text);
    setTimeout(() => setCopiedQuestion(null), 2000);
  };

  const getUrgencyBadge = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'emergency':
        return {
          label: 'EMERGENCY ATTENTION REQUIRED',
          color: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.45)',
          icon: <AlertCircle size={15} color="#ef4444" />,
        };
      case 'urgent':
        return {
          label: 'URGENT CLINICAL EVALUATION',
          color: '#f97316',
          bg: 'rgba(249, 115, 22, 0.15)',
          border: '1px solid rgba(249, 115, 22, 0.45)',
          icon: <AlertTriangle size={15} color="#f97316" />,
        };
      case 'priority':
        return {
          label: 'PRIORITY CLINICAL REVIEW',
          color: 'var(--champagne, #E2C382)',
          bg: 'rgba(226, 195, 130, 0.12)',
          border: '1px solid rgba(226, 195, 130, 0.35)',
          icon: <Activity size={15} color="var(--champagne, #E2C382)" />,
        };
      default:
        return {
          label: 'ROUTINE BASELINE',
          color: 'var(--primary-mint, #67E8D4)',
          bg: 'rgba(103, 232, 212, 0.12)',
          border: '1px solid rgba(103, 232, 212, 0.35)',
          icon: <CheckCircle2 size={15} color="var(--primary-mint, #67E8D4)" />,
        };
    }
  };

  const urgency = getUrgencyBadge(report.urgency_level);
  const cleanTitle = sanitizeHealthAIResponse(report.report_title);
  const cleanSummary = sanitizeHealthAIResponse(report.summary);
  const cleanKeyFindings = sanitizeHealthAIList(report.key_findings);
  const cleanWhatFindingsMean = sanitizeHealthAIResponse(report.what_findings_mean);
  const cleanWhatToDoNext = sanitizeHealthAIList(report.what_to_do_next);
  const cleanQuestions = sanitizeHealthAIList(report.questions_for_clinician);
  const cleanUrgentCare = sanitizeHealthAIList(report.when_to_seek_urgent_care);

  return (
    <div
      className="patient-ai-report-dashboard"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        width: '100%',
        color: 'var(--text-primary, #F5F7F6)',
      }}
    >
      {/* 1. REPORT HEADER & URGENCY STATUS */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem 1.5rem',
          borderRadius: '16px',
          background: 'linear-gradient(145deg, #141A1D 0%, #101517 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'radial-gradient(circle at 30% 30%, rgba(103, 232, 212, 0.18), rgba(61, 184, 170, 0.08))',
                border: '1px solid rgba(103, 232, 212, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={24} color="var(--primary-mint, #67E8D4)" />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text-primary, #F5F7F6)' }}>
                  {cleanTitle}
                </h2>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: 'var(--text-secondary, #B5BFBC)',
                  }}
                >
                  {report.report_category}
                </span>
              </div>

              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary, #B5BFBC)',
                  marginTop: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                }}
              >
                <span>File: <strong>{report.filename}</strong></span>
                {report.report_date && (
                  <>
                    <span>•</span>
                    <span>Date: {report.report_date}</span>
                  </>
                )}
                <span>•</span>
                <span>Analyzed via Real Swasthya Clinical AI</span>
              </div>
            </div>
          </div>

          {/* Urgency Badge */}
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              background: urgency.bg,
              border: urgency.border,
              color: urgency.color,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.76rem',
              fontWeight: 800,
              letterSpacing: '0.02em',
            }}
          >
            {urgency.icon}
            <span>{urgency.label}</span>
          </div>
        </div>

        {/* Clinical Summary */}
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: '10px',
            background: '#101517',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '0.86rem',
            color: 'var(--text-secondary, #B5BFBC)',
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: 'var(--primary-mint, #67E8D4)', display: 'block', marginBottom: '3px', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Report Overview
          </strong>
          {cleanSummary}
        </div>
      </div>

      {/* 2. KEY FINDINGS */}
      {cleanKeyFindings && cleanKeyFindings.length > 0 && (
        <div
          className="glass-card"
          style={{
            padding: '1.15rem 1.35rem',
            borderRadius: '14px',
            background: 'linear-gradient(160deg, #141A1D 0%, #101517 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Sparkles size={17} color="var(--champagne, #E2C382)" />
            <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-primary, #F5F7F6)' }}>
              Key Clinical Findings
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '0.65rem', width: '100%', maxWidth: '100%' }}>
            {cleanKeyFindings.map((finding, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: '#101517',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '0.84rem',
                  color: 'var(--text-primary, #F5F7F6)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <span>{finding}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. ABNORMAL VALUES (RED/AMBER ACCENTS) */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem 1.35rem',
          borderRadius: '14px',
          background: 'linear-gradient(160deg, #141A1D 0%, #101517 100%)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={17} color="#ef4444" />
            <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#fca5a5' }}>
              Abnormal &amp; Notable Values ({report.abnormal_values?.length || 0})
            </h3>
          </div>
        </div>

        {(!report.abnormal_values || report.abnormal_values.length === 0) ? (
          <div
            style={{
              padding: '1rem',
              borderRadius: '8px',
              background: 'rgba(103, 232, 212, 0.08)',
              border: '1px solid rgba(103, 232, 212, 0.2)',
              fontSize: '0.84rem',
              color: 'var(--primary-mint, #67E8D4)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>No laboratory parameters were flagged outside expected reference ranges on this document.</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxWidth: '100%', width: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-secondary, #B5BFBC)' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Test / Parameter</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Patient Value</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Reference Range</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Document Location</th>
                </tr>
              </thead>
              <tbody>
                {report.abnormal_values.map((v, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      background: idx % 2 === 0 ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 10px', fontWeight: 700, color: 'var(--text-primary, #F5F7F6)' }}>
                      {v.test_name}
                      {v.clinical_significance && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #B5BFBC)', fontWeight: 400, marginTop: '2px' }}>
                          {v.clinical_significance}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 10px', fontWeight: 800, color: '#fca5a5' }}>
                      {v.value} {v.unit || ''}
                    </td>
                    <td style={{ padding: '10px 10px', color: 'var(--text-secondary, #B5BFBC)' }}>
                      {v.reference_range}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.70rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          background: v.status === 'high' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(249, 115, 22, 0.2)',
                          color: v.status === 'high' ? '#f87171' : '#fb923c',
                          border: `1px solid ${v.status === 'high' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(249, 115, 22, 0.4)'}`,
                        }}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 10px', color: 'var(--text-secondary, #B5BFBC)', fontSize: '0.75rem' }}>
                      {v.source_location || 'Uploaded Report'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. VALUES WITHIN RANGE (COLLAPSIBLE / CLEAN TABLE) */}
      {report.normal_values && report.normal_values.length > 0 && (
        <div
          className="glass-card"
          style={{
            padding: '1rem 1.35rem',
            borderRadius: '14px',
            background: 'linear-gradient(160deg, #141A1D 0%, #101517 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setShowNormalValues(!showNormalValues)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={16} color="var(--primary-mint, #67E8D4)" />
              <h3 style={{ margin: 0, fontSize: '0.90rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--primary-mint, #67E8D4)' }}>
                Values Within Normal Baseline ({report.normal_values.length})
              </h3>
            </div>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #B5BFBC)' }}>
              {showNormalValues ? 'Click to collapse' : 'Click to expand'}
            </span>
          </div>

          {showNormalValues && (
            <div style={{ marginTop: '0.85rem', overflowX: 'auto', maxWidth: '100%', width: '100%', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-secondary, #B5BFBC)' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Test / Parameter</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Patient Value</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Reference Range</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.normal_values.map((v, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '8px 8px', color: 'var(--text-primary, #F5F7F6)' }}>{v.test_name}</td>
                      <td style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--primary-mint, #67E8D4)' }}>
                        {v.value} {v.unit || ''}
                      </td>
                      <td style={{ padding: '8px 8px', color: 'var(--text-secondary, #B5BFBC)' }}>{v.reference_range}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--primary-mint, #67E8D4)', fontWeight: 700 }}>
                          NORMAL
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. WHAT THESE FINDINGS MAY MEAN (CLINICAL INTERPRETATION) */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem 1.35rem',
          borderRadius: '14px',
          background: 'linear-gradient(160deg, #141A1D 0%, #101517 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <HeartPulse size={17} color="var(--primary-mint, #67E8D4)" />
          <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-primary, #F5F7F6)' }}>
            What These Findings May Mean
          </h3>
        </div>

        <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.6, color: 'var(--text-secondary, #B5BFBC)' }}>
          {cleanWhatFindingsMean}
        </p>

        <div
          style={{
            marginTop: '0.85rem',
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            background: 'rgba(226, 195, 130, 0.08)',
            border: '1px solid rgba(226, 195, 130, 0.25)',
            fontSize: '0.78rem',
            color: 'var(--champagne, #E2C382)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ShieldCheck size={16} />
          <span>
            <strong>Clinical Boundary:</strong> Interpretation depends on your personal symptoms, medical history, medications, and clinical exam. This guidance organizes your data for discussion with your doctor.
          </span>
        </div>
      </div>

      {/* 6. WHAT TO DO NEXT & QUESTIONS TO DISCUSS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
          gap: '1rem',
          width: '100%',
          maxWidth: '100%',
        }}
      >
        {/* Recommended Next Steps */}
        <div
          className="glass-card"
          style={{
            padding: '1.25rem',
            borderRadius: '14px',
            background: 'linear-gradient(160deg, #141A1D 0%, #101517 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} color="var(--primary-mint, #67E8D4)" />
            <h4 style={{ margin: 0, fontSize: '0.90rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-primary, #F5F7F6)' }}>
              What To Do Next
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {cleanWhatToDoNext?.map((step, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  background: '#101517',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary, #B5BFBC)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'rgba(103, 232, 212, 0.12)',
                    color: 'var(--primary-mint, #67E8D4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.70rem',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Questions for Clinician */}
        <div
          className="glass-card"
          style={{
            padding: '1.25rem',
            borderRadius: '14px',
            background: 'linear-gradient(160deg, #141A1D 0%, #101517 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HelpCircle size={16} color="var(--champagne, #E2C382)" />
            <h4 style={{ margin: 0, fontSize: '0.90rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-primary, #F5F7F6)' }}>
              Questions for Your Doctor
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {cleanQuestions?.map((q, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  background: '#101517',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary, #B5BFBC)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span>&ldquo;{q}&rdquo;</span>
                <button
                  type="button"
                  onClick={() => handleCopyQuestion(q)}
                  title="Copy question"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: copiedQuestion === q ? 'var(--primary-mint, #67E8D4)' : 'var(--text-secondary, #B5BFBC)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {copiedQuestion === q ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7. WHEN TO SEEK URGENT CARE */}
      {cleanUrgentCare && cleanUrgentCare.length > 0 && (
        <div
          className="glass-card"
          style={{
            padding: '1.15rem 1.35rem',
            borderRadius: '14px',
            background: 'linear-gradient(160deg, rgba(239, 68, 68, 0.08), #101517)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <AlertCircle size={17} color="#ef4444" />
            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#fca5a5' }}>
              When To Seek Immediate / Urgent Care
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {cleanUrgentCare.map((flag, idx) => (
              <div key={idx} style={{ fontSize: '0.82rem', color: '#fecaca', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span>{flag}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. ACTION BAR (HANDOFF, ASK IN CHAT, UPLOAD ANOTHER) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.85rem',
          padding: '1.25rem',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #141A1D 0%, #101517 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {onHandoffToIntake && (
            <button
              type="button"
              onClick={onHandoffToIntake}
              className="btn btn-primary glass"
              id="btn-report-handoff-triage"
              style={{
                padding: '0.55rem 1.15rem',
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 800,
              }}
            >
              <Send size={15} />
              <span>Submit for Triage</span>
              <ArrowRight size={14} />
            </button>
          )}

          {onAskInChat && (
            <button
              type="button"
              onClick={() => onAskInChat(`I have questions about my uploaded ${report.report_title}. Could you explain the findings in more detail?`)}
              className="btn btn-secondary glass"
              id="btn-report-ask-chat"
              style={{
                padding: '0.55rem 1.15rem',
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <MessageSquare size={15} />
              <span>Ask in AI Chat</span>
            </button>
          )}
        </div>

        {onUploadAnother && (
          <button
            type="button"
            onClick={onUploadAnother}
            className="btn btn-secondary glass"
            style={{
              padding: '0.55rem 1rem',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RotateCcw size={14} />
            <span>Upload Another</span>
          </button>
        )}
      </div>

      {/* 9. PROVENANCE FOOTER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
          fontSize: '0.72rem',
          color: 'var(--text-secondary, #B5BFBC)',
          padding: '0.5rem',
          flexWrap: 'wrap',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Layers size={12} color="var(--primary-mint, #67E8D4)" />
          <strong>Provenance:</strong> Patient Uploaded Document
        </span>
        <span>•</span>
        <span>Report-Derived OCR Extraction</span>
        <span>•</span>
        <span>AI-Generated Clinical Guidance</span>
      </div>
    </div>
  );
};
