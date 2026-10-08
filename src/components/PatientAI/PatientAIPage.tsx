import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  RotateCcw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Activity,
  Info,
  X,
  History,
  FileText,
  Upload,
  CheckCircle2,
  MessageSquare,
  FileUp,
} from 'lucide-react';
import { PatientAIConversation } from './PatientAIConversation';
import { PatientAIInput } from './PatientAIInput';
import { PatientAIContextPanel } from './PatientAIContextPanel';
import { PatientAIHistoryModal } from './PatientAIHistoryModal';
import { PatientAIReportDashboard } from './PatientAIReportDashboard';
import { PatientAILanguageSelector } from './PatientAILanguageSelector';
import type { SavedChatSession } from './PatientAIHistoryModal';
import type {
  ChatMessageItem,
  ChatAttachmentItem,
  MedicalReportAnalysisResponse,
} from '../../services/ai/patientChatClient';
import { patientChatClient } from '../../services/ai/patientChatClient';
import { useAuth } from '../../context/AuthContext';

export interface PatientAIHandoffData {
  symptoms: string;
  extractedSymptoms?: string[];
  attachments?: ChatAttachmentItem[];
  preferredLanguage?: string;
  chiefComplaint?: string;
  reportAnalysis?: MedicalReportAnalysisResponse;
}

interface PatientAIPageProps {
  onHandoffToIntake?: (data: PatientAIHandoffData) => void;
  onNavigateToCases?: () => void;
  preferredLanguage?: string;
}

type HealthAIMode = 'report_analysis' | 'conversation';

const ANALYSIS_STEPS = [
  'Uploading Document...',
  'Extracting Text & Tables via OCR...',
  'Reading & Parsing Report Structure...',
  'Identifying Laboratory Findings & Reference Ranges...',
  'Screening Urgency & Red-Flag Indicators...',
  'Preparing Patient-Friendly Clinical Guidance...',
];

export const PatientAIPage: React.FC<PatientAIPageProps> = ({
  onHandoffToIntake,
  onNavigateToCases,
  preferredLanguage = 'English',
}) => {
  const { currentUser } = useAuth();
  const [activeMode, setActiveMode] = useState<HealthAIMode>('report_analysis');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    try {
      return (typeof window !== 'undefined' && window.localStorage?.getItem('swasthya_patient_ai_lang_pref')) || preferredLanguage || 'auto';
    } catch {
      return preferredLanguage || 'auto';
    }
  });

  const handleLanguageChange = (lang: string) => {
    setSelectedLanguage(lang);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem('swasthya_patient_ai_lang_pref', lang);
      }
    } catch (e) {
      // ignore
    }
  };

  // Report Analysis State
  const [isAnalyzingReport, setIsAnalyzingReport] = useState<boolean>(false);
  const [analysisStepIndex, setAnalysisStepIndex] = useState<number>(0);
  const [activeReportAnalysis, setActiveReportAnalysis] = useState<MedicalReportAnalysisResponse | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [healthContext, setHealthContext] = useState<any>(null);

  // Modals & Drawers
  const [isMobileContextOpen, setIsMobileContextOpen] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [savedSessions, setSavedSessions] = useState<SavedChatSession[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSessionKey = `swasthya_patient_ai_active_${currentUser?.userId || 'anon'}`;

  const getStoredActiveSession = (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage?.getItem(key) || window.sessionStorage?.getItem(key) || null;
    } catch {
      return null;
    }
  };

  const setStoredActiveSession = (key: string, id: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage?.setItem(key, id);
    } catch {
      // ignore
    }
    try {
      window.sessionStorage?.setItem(key, id);
    } catch {
      // ignore
    }
  };

  // Initialize or resume persistent server conversation on mount
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const cachedId = getStoredActiveSession(activeSessionKey);
        if (cachedId) {
          setActiveConversationId(cachedId);
          const details = await patientChatClient.getConversationDetails(cachedId);
          if (isMounted) {
            if (details.messages && details.messages.length > 0) {
              setMessages(details.messages);
            }
            if (details.healthContext) {
              setHealthContext(details.healthContext);
            }
            return;
          }
        }

        const convs = await patientChatClient.listConversations();
        if (isMounted) {
          if (convs && convs.length > 0) {
            const latest = convs[0];
            setActiveConversationId(latest.id);
            setStoredActiveSession(activeSessionKey, latest.id);
            const details = await patientChatClient.getConversationDetails(latest.id);
            if (isMounted) {
              if (details.messages) {
                setMessages(details.messages);
              }
              if (details.healthContext) {
                setHealthContext(details.healthContext);
              }
            }
          } else {
            const created = await patientChatClient.createConversation();
            if (isMounted) {
              setActiveConversationId(created.id);
              setStoredActiveSession(activeSessionKey, created.id);
              setHealthContext(null);
            }
          }
        }
      } catch (err) {
        console.warn('[PatientAIPage] Error during session init:', err);
      }
    }

    initSession();
    return () => {
      isMounted = false;
    };
  }, [activeSessionKey]);

  // Animate progress steps during report analysis
  useEffect(() => {
    let timer: any;
    if (isAnalyzingReport) {
      timer = setInterval(() => {
        setAnalysisStepIndex((prev) => (prev < ANALYSIS_STEPS.length - 1 ? prev + 1 : prev));
      }, 700);
    } else {
      setAnalysisStepIndex(0);
    }
    return () => clearInterval(timer);
  }, [isAnalyzingReport]);

  const handleOpenHistory = async () => {
    setIsHistoryModalOpen(true);
    try {
      const convs = await patientChatClient.listConversations();
      const sessions: SavedChatSession[] = convs.map((c) => ({
        id: c.id,
        timestamp: c.lastMessageAt || c.createdAt,
        summary: c.title || 'Health Consultation',
        messages: [],
      }));
      setSavedSessions(sessions);
    } catch (e) {
      console.warn('[PatientAIPage] Error loading history:', e);
    }
  };

  const handleReset = async () => {
    try {
      setIsLoading(true);
      const created = await patientChatClient.createConversation();
      setActiveConversationId(created.id);
      setStoredActiveSession(activeSessionKey, created.id);
      setMessages([]);
      setHealthContext(null);
      setActiveReportAnalysis(null);
    } catch (e) {
      console.warn('[PatientAIPage] Failed to create new conversation:', e);
      setMessages([]);
      setHealthContext(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSession = async (session: SavedChatSession) => {
    try {
      setIsLoading(true);
      setActiveConversationId(session.id);
      setStoredActiveSession(activeSessionKey, session.id);
      const details = await patientChatClient.getConversationDetails(session.id);
      setMessages(details.messages || []);
      setHealthContext(details.healthContext || null);
      setActiveReportAnalysis(null);
      setActiveMode('conversation');
    } catch (e) {
      console.warn('[PatientAIPage] Failed to load session details:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await patientChatClient.deleteConversation(sessionId);
      setSavedSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeConversationId === sessionId) {
        handleReset();
      }
    } catch (e) {
      console.warn('[PatientAIPage] Failed to delete conversation:', e);
    }
  };

  // ----------------------------------------------------
  // INSTANT REPORT ANALYSIS TRIGGER
  // ----------------------------------------------------
  const handleUploadReportFile = async (file: File) => {
    if (!file) return;

    setIsAnalyzingReport(true);
    setAnalysisStepIndex(0);
    setActiveReportAnalysis(null);

    try {
      let convId = activeConversationId;
      if (!convId) {
        const created = await patientChatClient.createConversation();
        convId = created.id;
        setActiveConversationId(convId);
        setStoredActiveSession(activeSessionKey, convId);
      }

      const result = await patientChatClient.analyzeMedicalReport(file, convId);
      setActiveReportAnalysis(result);
      setActiveMode('report_analysis');

      // Update immediate local health context from analyzed report
      setHealthContext((prev: any) => ({
        ...(prev || {}),
        currentConcern: result.report_title || 'Hematology / CBC Report',
        reportTitle: result.report_title || 'Hematology / CBC Report',
        urgencyLevel: result.urgency_level || 'ROUTINE',
        reportAnalysis: result,
      }));

      // Refresh messages list in background
      try {
        const details = await patientChatClient.getConversationDetails(convId);
        if (details.messages) {
          setMessages(details.messages);
        }
        if (details.healthContext) {
          setHealthContext(details.healthContext);
        }
      } catch {
        // ignore
      }
    } catch (err: any) {
      console.error('[PatientAIPage] Report analysis failed:', err);
    } finally {
      setIsAnalyzingReport(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadReportFile(e.dataTransfer.files[0]);
    }
  };

  // ----------------------------------------------------
  // CONVERSATIONAL MESSAGING
  // ----------------------------------------------------
  const handleSendMessage = async (
    text: string,
    attachments?: ChatAttachmentItem[],
    voiceUsed: boolean = false
  ) => {
    if (!text.trim() && (!attachments || attachments.length === 0)) return;

    let convId = activeConversationId;
    if (!convId) {
      try {
        const created = await patientChatClient.createConversation();
        convId = created.id;
        setActiveConversationId(convId);
        setStoredActiveSession(activeSessionKey, convId);
      } catch {
        convId = `conv_${Date.now()}`;
      }
    }

    const userMsgId = `msg_user_${Date.now()}`;
    const newUserMsg: ChatMessageItem = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      voiceUsed,
      attachments,
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setIsLoading(true);

    try {
      const res = await patientChatClient.sendMessageToConversation(
        convId,
        text,
        attachments,
        voiceUsed,
        selectedLanguage
      );

      setMessages((prev) => [...prev, res.assistantMessage]);
      if (res.healthContext) {
        setHealthContext(res.healthContext);
      }
    } catch (err: any) {
      const errorMsg: ChatMessageItem = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content:
          "Health AI is temporarily unavailable. You can still submit your symptoms directly through the Submit Symptoms tab.",
        timestamp: new Date().toISOString(),
        suggestedActions: ["Start Symptom Intake"],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartTriageIntake = () => {
    const allUserText = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('; ');

    const allAttachments = messages.flatMap((m) => m.attachments || []);
    const latestAiMsg = [...messages].reverse().find((m) => m.role === 'assistant');

    if (onHandoffToIntake) {
      onHandoffToIntake({
        symptoms: activeReportAnalysis
          ? `Report Analysis: ${activeReportAnalysis.report_title}. Summary: ${activeReportAnalysis.summary}. Abnormal values: ${activeReportAnalysis.abnormal_values.map(a => `${a.test_name} (${a.value} ${a.unit || ''})`).join(', ')}`
          : (allUserText || 'Consultation via Swasthya Health AI Workspace'),
        extractedSymptoms: activeReportAnalysis
          ? activeReportAnalysis.abnormal_values.map(a => a.test_name)
          : latestAiMsg?.structuredSymptoms?.reported_symptoms,
        chiefComplaint: activeReportAnalysis?.report_title || latestAiMsg?.structuredSymptoms?.chief_complaint,
        attachments: allAttachments,
        preferredLanguage: selectedLanguage,
        reportAnalysis: activeReportAnalysis || undefined,
      });
    }
  };

  const handleAskInChat = (prefill?: string) => {
    setActiveMode('conversation');
    if (prefill) {
      setTimeout(() => {
        handleSendMessage(prefill);
      }, 100);
    }
  };

  return (
    <div
      className="patient-health-ai-page-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        width: '100%',
        minHeight: 'calc(100vh - 200px)',
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        id="patient-ai-file-input"
        accept=".pdf,.png,.jpg,.jpeg,.txt"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleUploadReportFile(e.target.files[0]);
          }
        }}
      />

      {/* 1. HEALTH AI INSTITUTIONAL HEADER */}
      <header
        className="glass-card patient-ai-page-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.25rem',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #101517 0%, #0A0E10 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          flexWrap: 'wrap',
          gap: '0.75rem',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div className="patient-ai-header-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flexWrap: 'wrap' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'radial-gradient(circle at 30% 30%, rgba(103, 232, 212, 0.18), rgba(61, 184, 170, 0.08))',
              border: '1px solid rgba(103, 232, 212, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(103, 232, 212, 0.08)',
              flexShrink: 0,
            }}
          >
            <Bot size={20} color="var(--primary-mint, #67E8D4)" />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: 'var(--text-primary, #F5F7F6)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                HEALTH AI
              </h1>

              {/* Mode Tabs */}
              <div
                className="patient-ai-mode-tabs"
                style={{
                  display: 'inline-flex',
                  background: 'rgba(0, 0, 0, 0.4)',
                  padding: '2px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  maxWidth: '100%',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveMode('report_analysis')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: activeMode === 'report_analysis' ? 'rgba(103, 232, 212, 0.12)' : 'transparent',
                    color: activeMode === 'report_analysis' ? 'var(--primary-mint, #67E8D4)' : 'var(--text-secondary, #B5BFBC)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                  }}
                  id="tab-health-ai-report-analysis"
                >
                  <FileText size={12} />
                  <span>Report Analysis</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMode('conversation')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: activeMode === 'conversation' ? 'rgba(103, 232, 212, 0.12)' : 'transparent',
                    color: activeMode === 'conversation' ? 'var(--primary-mint, #67E8D4)' : 'var(--text-secondary, #B5BFBC)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                  }}
                  id="tab-health-ai-conversation"
                >
                  <MessageSquare size={12} />
                  <span>Health AI Chat</span>
                </button>
              </div>
            </div>

            <div
              style={{
                fontSize: '0.74rem',
                color: 'var(--text-secondary, #B5BFBC)',
                marginTop: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                flexWrap: 'wrap',
              }}
            >
              <span>Report Analysis &bull; AI Chat</span>
            </div>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="patient-ai-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <PatientAILanguageSelector
            value={selectedLanguage}
            onChange={handleLanguageChange}
            compact={true}
          />

          <button
            type="button"
            onClick={handleReset}
            className="btn btn-secondary glass"
            style={{ fontSize: '0.74rem', padding: '0.38rem 0.70rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Start New Session"
            id="btn-health-ai-new"
          >
            <RotateCcw size={13} />
            <span>New Session</span>
          </button>

          <button
            type="button"
            onClick={handleOpenHistory}
            className="btn btn-secondary glass"
            style={{ fontSize: '0.74rem', padding: '0.38rem 0.70rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="View History"
            id="btn-health-ai-history"
          >
            <History size={13} />
            <span>History</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAboutModalOpen(true)}
            className="btn btn-secondary glass"
            style={{ fontSize: '0.74rem', padding: '0.38rem 0.70rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Safety Boundaries"
          >
            <Info size={13} />
            <span>Safety</span>
          </button>

          {/* Mobile Health Context Toggle */}
          {activeMode === 'conversation' && (
            <button
              type="button"
              onClick={() => setIsMobileContextOpen(!isMobileContextOpen)}
              className="btn btn-secondary glass patient-ai-mobile-context-toggle"
              style={{ fontSize: '0.74rem', padding: '0.38rem 0.70rem', alignItems: 'center', gap: '4px' }}
            >
              <Activity size={14} color="var(--primary-mint, #67E8D4)" />
              <span>Context</span>
              {isMobileContextOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </header>

      {/* 2. MAIN VIEW SWITCHER: REPORT ANALYSIS vs CONVERSATION */}
      {activeMode === 'report_analysis' ? (
        <div
          className="patient-ai-report-analysis-workspace"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            width: '100%',
          }}
        >
          {/* UPLOAD HERO & SAMPLE SELECTOR (IF NO ACTIVE REPORT OR AFTER RESET) */}
          {!activeReportAnalysis && !isAnalyzingReport && (
            <div
              className="glass-card"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              style={{
                padding: '2rem 1.25rem',
                borderRadius: '18px',
                background: isDragOver
                  ? '#141A1D'
                  : 'linear-gradient(150deg, #141A1D 0%, #101517 100%)',
                border: isDragOver ? '2px dashed var(--primary-mint, #67E8D4)' : '1px dashed rgba(255, 255, 255, 0.12)',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.45)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1rem',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'radial-gradient(circle at 30% 30%, rgba(103, 232, 212, 0.18), rgba(61, 184, 170, 0.08))',
                  border: '1px solid rgba(103, 232, 212, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(103, 232, 212, 0.08)',
                }}
              >
                <FileUp size={28} color="var(--primary-mint, #67E8D4)" />
              </div>

              <div style={{ maxWidth: '480px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary, #F5F7F6)' }}>
                  Upload Medical Report
                </h2>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary, #B5BFBC)', marginTop: '0.3rem', lineHeight: 1.4 }}>
                  PDF &bull; Bloodwork &bull; Imaging
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-primary glass"
                  id="btn-upload-medical-report"
                  style={{
                    padding: '0.60rem 1.25rem',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Upload size={16} />
                  <span>Choose Medical Document</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMode('conversation')}
                  className="btn btn-secondary glass"
                  style={{
                    padding: '0.60rem 1.1rem',
                    fontSize: '0.86rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <MessageSquare size={16} />
                  <span>Ask in AI Chat</span>
                </button>
              </div>
            </div>
          )}

          {/* PROGRESS STATE DURING ANALYSIS */}
          {isAnalyzingReport && (
            <div
              className="glass-card"
              style={{
                padding: '2.5rem 1.5rem',
                borderRadius: '18px',
                background: 'linear-gradient(150deg, #141A1D 0%, #101517 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1.25rem',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  border: '3px solid rgba(103, 232, 212, 0.15)',
                  borderTopColor: 'var(--primary-mint, #67E8D4)',
                  animation: 'spin 1s linear infinite',
                }}
              />

              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary, #F5F7F6)' }}>
                  Analyzing report...
                </h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.80rem', color: 'var(--text-secondary, #B5BFBC)' }}>
                  Extracting text and structured clinical values.
                </p>
              </div>

              {/* Progress Steps */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.55rem',
                  width: '100%',
                  maxWidth: '460px',
                  textAlign: 'left',
                }}
              >
                {ANALYSIS_STEPS.map((step, idx) => {
                  const isDone = idx < analysisStepIndex;
                  const isCurrent = idx === analysisStepIndex;
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '0.55rem 0.85rem',
                        borderRadius: '8px',
                        background: isCurrent ? 'rgba(103, 232, 212, 0.10)' : 'rgba(255, 255, 255, 0.03)',
                        border: isCurrent ? '1px solid rgba(103, 232, 212, 0.30)' : '1px solid rgba(255, 255, 255, 0.06)',
                        fontSize: '0.80rem',
                        color: isDone ? 'var(--primary-mint, #67E8D4)' : isCurrent ? 'var(--text-primary, #F5F7F6)' : 'var(--text-secondary, #B5BFBC)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {isDone ? (
                        <CheckCircle2 size={15} color="var(--primary-mint, #67E8D4)" />
                      ) : isCurrent ? (
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#67E8D4', boxShadow: '0 0 8px rgba(103, 232, 212, 0.5)' }} />
                      ) : (
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)' }} />
                      )}
                      <span>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* REPORT RESULTS DASHBOARD */}
          {activeReportAnalysis && !isAnalyzingReport && (
            <PatientAIReportDashboard
              report={activeReportAnalysis}
              onHandoffToIntake={handleStartTriageIntake}
              onAskInChat={handleAskInChat}
              onUploadAnother={() => setActiveReportAnalysis(null)}
            />
          )}
        </div>
      ) : (
        /* CONVERSATION MODE */
        <div className="patient-ai-workspace-grid">
          {/* LEFT / PRIMARY: CONVERSATION AREA + MULTIMODAL INPUT */}
          <main className="glass-card patient-ai-conversation-container">
            <PatientAIConversation
              messages={messages}
              isLoading={isLoading}
              onSelectQuickAction={(prompt, intent) => {
                if (intent === 'upload') {
                  fileInputRef.current?.click();
                } else if (prompt) {
                  handleSendMessage(prompt);
                }
              }}
              onSelectFollowUp={(q) => handleSendMessage(q)}
              onExecuteAction={(action) => {
                if (action === 'Start Symptom Intake' || action === 'Submit This Information') {
                  handleStartTriageIntake();
                } else if (action === 'View My Cases') {
                  if (onNavigateToCases) onNavigateToCases();
                } else if (action === 'Seek Emergency Care') {
                  window.location.href = 'tel:108';
                } else if (action === 'Upload a Report' || action === 'Upload Another Report') {
                  fileInputRef.current?.click();
                }
              }}
              preferredLanguage={selectedLanguage}
            />

            <PatientAIInput
              onSendMessage={handleSendMessage}
              onUploadReportFile={handleUploadReportFile}
              isLoading={isLoading || isAnalyzingReport}
              preferredLanguage={selectedLanguage}
              onLanguageChange={handleLanguageChange}
            />
          </main>

          {/* RIGHT / SECONDARY: HEALTH CONTEXT PANEL (DESKTOP) */}
          <div className="patient-ai-desktop-context-column" style={{ display: 'flex', flexDirection: 'column' }}>
            <PatientAIContextPanel
              messages={messages}
              healthContext={healthContext}
              activeReportAnalysis={activeReportAnalysis}
              attachments={[]}
              onStartTriageIntake={handleStartTriageIntake}
            />
          </div>
        </div>
      )}

      {/* MOBILE COLLAPSIBLE HEALTH CONTEXT DRAWER */}
      {isMobileContextOpen && activeMode === 'conversation' && (
        <div className="patient-ai-mobile-context-drawer">
          <PatientAIContextPanel
            messages={messages}
            healthContext={healthContext}
            activeReportAnalysis={activeReportAnalysis}
            attachments={[]}
            onStartTriageIntake={handleStartTriageIntake}
          />
        </div>
      )}

      {/* CONVERSATION HISTORY MODAL */}
      <PatientAIHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        sessions={savedSessions}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onNewSession={handleReset}
      />

      {/* ABOUT HEALTH AI & SAFETY MODAL */}
      {isAboutModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="About Health AI Safety"
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
          onClick={() => setIsAboutModalOpen(false)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: '500px',
              padding: '1.5rem',
              borderRadius: '18px',
              background: 'linear-gradient(150deg, #181F22 0%, #101517 100%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} color="var(--primary-mint, #67E8D4)" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary, #F5F7F6)' }}>
                  Health AI Safety &amp; Scope
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAboutModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #B5BFBC)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary, #B5BFBC)', lineHeight: 1.5 }}>
              <p style={{ margin: 0 }}>
                Swāsthya Health AI is an institutional healthcare assistant built to help you organize symptoms, interpret medical documents, and prepare information for clinical triage.
              </p>
              <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <strong style={{ color: 'var(--primary-mint, #67E8D4)', display: 'block', marginBottom: '4px' }}>
                  Safety &amp; Clinical Boundaries:
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>Provides health guidance, not a definitive medical diagnosis.</li>
                  <li>Does not prescribe medication or alter dosages.</li>
                  <li>Detects red flags and directs to emergency services (108/112).</li>
                  <li>All triage intake requires explicit patient consent before clinical review.</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setIsAboutModalOpen(false)}
                className="btn btn-primary glass"
                style={{ padding: '0.45rem 1.1rem', fontSize: '0.82rem' }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
