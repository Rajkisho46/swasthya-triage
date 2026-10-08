import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, X, Loader2 } from 'lucide-react';
import { patientChatClient } from '../../services/ai/patientChatClient';

interface PatientAIVoiceProps {
  onTranscriptionComplete: (text: string) => void;
  onCancel: () => void;
  preferredLanguage?: string;
}

export const PatientAIVoice: React.FC<PatientAIVoiceProps> = ({
  onTranscriptionComplete,
  onCancel,
  preferredLanguage = 'English',
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [seconds, setSeconds] = useState<number>(0);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startVoiceRecording();
    return () => {
      cleanupAudioStream();
    };
  }, []);

  const cleanupAudioStream = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startVoiceRecording = async () => {
    setErrorMsg(null);
    audioChunksRef.current = [];
    setSeconds(0);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size === 0) {
          setErrorMsg('No audio data recorded. Please try speaking again.');
          setIsTranscribing(false);
          return;
        }

        setIsTranscribing(true);
        try {
          const lang = preferredLanguage.toLowerCase().includes('hindi') ? 'Hindi' : 'auto';
          const transcript = await patientChatClient.transcribeVoice(audioBlob, lang);
          if (transcript && transcript.trim()) {
            onTranscriptionComplete(transcript.trim());
          } else {
            setErrorMsg('Could not detect clear speech. Please type or speak closer to microphone.');
          }
        } catch (err: any) {
          setErrorMsg(err.message || 'Speech-to-text service error. Please type your message.');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250); // Slice chunks every 250ms
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Microphone permission was denied or unavailable.');
    }
  };

  const handleStop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleCancel = () => {
    cleanupAudioStream();
    onCancel();
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remaining = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  return (
    <div className="patient-ai-voice-panel" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.65rem 0.95rem',
      borderRadius: '14px',
      background: 'linear-gradient(135deg, rgba(20, 26, 29, 0.95), rgba(16, 21, 23, 0.98))',
      border: '1px solid rgba(255, 255, 255, 0.10)',
      gap: '0.75rem',
      animation: 'fadeIn 0.2s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: isTranscribing ? 'rgba(103, 232, 212, 0.15)' : 'rgba(239, 68, 68, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          {isTranscribing ? (
            <Loader2 size={16} color="#67E8D4" className="animate-spin" />
          ) : (
            <>
              <span style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.4)',
                animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
              }} />
              <Mic size={16} color="#f87171" />
            </>
          )}
        </div>

        <div>
          <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isTranscribing ? 'Transcribing audio...' : 'Listening... Speak now'}
            {isRecording && (
              <span style={{
                fontSize: '0.70rem',
                fontFamily: 'var(--font-mono)',
                color: '#f87171',
                fontWeight: 700,
              }}>
                {formatTimer(seconds)}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #94a3b8)' }}>
            {isTranscribing ? 'Converting speech to clinical text' : `Audio capture (${preferredLanguage})`}
          </div>
        </div>
      </div>

      {errorMsg ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.72rem', color: '#f87171', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {errorMsg}
          </span>
          <button
            type="button"
            onClick={handleCancel}
            className="btn btn-secondary glass"
            style={{ padding: '3px 8px', fontSize: '0.70rem' }}
          >
            Close
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {isRecording && (
            <button
              type="button"
              onClick={handleStop}
              className="btn btn-primary glass"
              style={{
                fontSize: '0.74rem',
                padding: '0.35rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(53, 224, 193, 0.2)',
                borderColor: '#35e0c1',
                color: '#35e0c1',
              }}
            >
              <Square size={12} fill="#35e0c1" />
              Done
            </button>
          )}
          <button
            type="button"
            onClick={handleCancel}
            title="Cancel voice recording"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
};
