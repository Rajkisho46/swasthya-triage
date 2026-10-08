import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_UI_LANGUAGES: LanguageOption[] = [
  { code: 'auto', label: 'Auto Detect', nativeLabel: 'Auto Detect' },
  { code: 'English', label: 'English', nativeLabel: 'English' },
  { code: 'Hindi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'Odia', label: 'Odia', nativeLabel: 'ଓଡ଼ିଆ' },
  { code: 'Bengali', label: 'Bengali', nativeLabel: 'বাংলা' },
  { code: 'Telugu', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'Tamil', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'Kannada', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'Malayalam', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'Marathi', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'Gujarati', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  { code: 'Punjabi', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ' },
];

export interface PatientAILanguageSelectorProps {
  selectedLanguage?: string;
  onSelectLanguage?: (langCode: string) => void;
  value?: string;
  onChange?: (langCode: string) => void;
  compact?: boolean;
}

export const PatientAILanguageSelector: React.FC<PatientAILanguageSelectorProps> = ({
  selectedLanguage,
  onSelectLanguage,
  value,
  onChange,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const effectiveLang = selectedLanguage || value || 'auto';
  const handleLanguageSelect = onSelectLanguage || onChange || (() => {});

  const currentOption =
    SUPPORTED_UI_LANGUAGES.find(
      (l) => l.code.toLowerCase() === effectiveLang.toLowerCase()
    ) || SUPPORTED_UI_LANGUAGES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (code: string) => {
    handleLanguageSelect(code);
    setIsOpen(false);
  };

  return (
    <div
      ref={dropdownRef}
      className="patient-ai-lang-selector"
      style={{
        position: 'relative',
        display: 'inline-block',
        zIndex: 50,
      }}
    >
      <button
        type="button"
        id="health-ai-language-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Select AI Chat Language"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: compact ? '0.22rem 0.45rem' : '0.3rem 0.6rem',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: 'var(--text-primary, #F5F7F6)',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.18s ease',
          whiteSpace: 'nowrap',
          maxWidth: compact ? '110px' : '150px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(103, 232, 212, 0.4)';
          e.currentTarget.style.background = 'rgba(103, 232, 212, 0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }}
      >
        <Globe size={13} color="var(--primary-mint, #67E8D4)" style={{ flexShrink: 0 }} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {currentOption.code === 'auto' ? 'Auto' : currentOption.nativeLabel}
        </span>
        <ChevronDown
          size={11}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s',
            flexShrink: 0,
            opacity: 0.7,
          }}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            right: 0,
            width: '180px',
            maxHeight: '220px',
            overflowY: 'auto',
            background: '#141A1D',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '10px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 0 1px 1px rgba(255, 255, 255, 0.05)',
            padding: '0.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            zIndex: 100,
          }}
        >
          {SUPPORTED_UI_LANGUAGES.map((lang) => {
            const isSelected =
              lang.code.toLowerCase() === (selectedLanguage || 'auto').toLowerCase();
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(lang.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.38rem 0.55rem',
                  fontSize: '0.74rem',
                  borderRadius: '6px',
                  background: isSelected ? 'rgba(103, 232, 212, 0.14)' : 'transparent',
                  color: isSelected ? '#67E8D4' : '#E2E8F0',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 700 : 500,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>{lang.nativeLabel}</span>
                  {lang.code !== 'auto' && (
                    <span style={{ fontSize: '0.66rem', opacity: 0.6 }}>({lang.label})</span>
                  )}
                </div>
                {isSelected && <Check size={12} color="#67E8D4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
