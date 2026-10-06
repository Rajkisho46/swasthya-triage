import { useState, useEffect, useCallback } from 'react';
import type { TriageCase } from './types/triage';
import { caseService } from './services/caseService';
import { clearAuditLogs } from './utils/audit';
import { initScrollRevealObserver, refreshScrollReveal } from './utils/scrollReveal';
import { Header } from './components/Layout/Header';
import type { ActiveTab } from './components/Layout/Header';
import { Footer } from './components/Layout/Footer';
import { PrivacyTrustCenter } from './components/TrustCenter/PrivacyTrustCenter';
import type { TrustCenterTab } from './components/TrustCenter/PrivacyTrustCenter';
import { LoginScreen } from './components/Auth/LoginScreen';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RoleGuard } from './portals/RoleGuard';

function MainWorkspace() {
  const { currentUser, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('intake');
  const [cases, setCases] = useState<TriageCase[]>([]);
  const [activeCase, setActiveCase] = useState<TriageCase | null>(null);
  const [intakeResetKey, setIntakeResetKey] = useState<number>(0);

  // Initialize global scroll reveal observer
  useEffect(() => {
    const cleanup = initScrollRevealObserver();
    return cleanup;
  }, []);

  // Refresh reveal observer whenever activeTab or auth state updates
  useEffect(() => {
    refreshScrollReveal();
  }, [activeTab, isAuthenticated]);

  // Privacy, Consent & Trust Center State
  const [isTrustCenterOpen, setIsTrustCenterOpen] = useState<boolean>(false);
  const [trustCenterTab, setTrustCenterTab] = useState<TrustCenterTab>('overview');

  // Load real persisted cases from backend database
  const loadCases = useCallback(async () => {
    try {
      const fetched = await caseService.fetchCases();
      setCases(fetched);
    } catch (err) {
      console.error('[App] Failed to load cases from backend:', err);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases, currentUser?.role]);

  // Automatically update active tab when role changes
  useEffect(() => {
    if (!currentUser) return;
    switch (currentUser.role) {
      case 'PATIENT':
        setActiveTab('patient_portal');
        break;
      case 'NURSE':
        setActiveTab('nurse_queue');
        break;
      case 'DOCTOR':
        setActiveTab('reviewer');
        break;
      case 'ADMIN':
        setActiveTab('audit');
        break;
      default:
        setActiveTab('patient_portal');
        break;
    }
  }, [currentUser?.role]);

  const handleOpenTrustCenter = (tab: TrustCenterTab = 'overview') => {
    setTrustCenterTab(tab);
    setIsTrustCenterOpen(true);
  };

  const handleCaseCreated = (newCase: TriageCase) => {
    setCases((prev) => {
      const exists = prev.some((c) => c.caseId === newCase.caseId);
      if (exists) {
        return prev.map((c) => (c.caseId === newCase.caseId ? newCase : c));
      }
      return [newCase, ...prev];
    });
    setActiveCase(newCase);
    setActiveTab('summary');
  };

  const handleSendForReview = (updatedCase: TriageCase) => {
    setCases((prev) =>
      prev.map((c) => (c.caseId === updatedCase.caseId ? updatedCase : c))
    );
    if (activeCase && activeCase.caseId === updatedCase.caseId) {
      setActiveCase(null);
    }
    loadCases();
  };

  const handleUpdateCase = (updatedCase: TriageCase) => {
    setCases((prev) =>
      prev.map((c) => (c.caseId === updatedCase.caseId ? updatedCase : c))
    );
    if (activeCase && activeCase.caseId === updatedCase.caseId) {
      setActiveCase(updatedCase);
    }
  };

  const handleDeleteCase = (deletedCaseId: string) => {
    setCases((prev) => prev.filter((c) => c.caseId !== deletedCaseId));
    if (activeCase && activeCase.caseId === deletedCaseId) {
      setActiveCase(null);
    }
  };

  const handleViewSummary = (c: TriageCase) => {
    setActiveCase(c);
    setActiveTab('summary');
  };

  const handleResetToDemo = () => {
    clearAuditLogs();
    loadCases();
    setActiveCase(null);
    setIntakeResetKey((k) => k + 1);
    if (currentUser?.role === 'PATIENT') setActiveTab('patient_portal');
    else if (currentUser?.role === 'NURSE') setActiveTab('nurse_queue');
    else if (currentUser?.role === 'DOCTOR') setActiveTab('reviewer');
    else if (currentUser?.role === 'ADMIN') setActiveTab('audit');
    else setActiveTab('patient_portal');
  };


  // If not authenticated, display Institutional Multi-Role Login Screen
  if (!isAuthenticated) {
    return (
      <div className="app-container">
        <LoginScreen onOpenTrustCenter={handleOpenTrustCenter} />
        <PrivacyTrustCenter
          isOpen={isTrustCenterOpen}
          initialTab={trustCenterTab}
          onClose={() => setIsTrustCenterOpen(false)}
        />
      </div>
    );
  }

  const pendingCount = cases.filter((c) => c.reviewStatus === 'awaiting_review').length;

  return (
    <div className="app-container">
      {/* Ambient background light fields */}
      <div className="ambient-glow-teal" style={{ top: '-100px', left: '15%' }} aria-hidden="true" />
      <div className="ambient-glow-champagne" style={{ top: '25%', right: '10%' }} aria-hidden="true" />
      <div className="ambient-glow-teal" style={{ bottom: '10%', left: '35%' }} aria-hidden="true" />

      {/* Institutional Command Header with Role Access */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingCount={pendingCount}
        hasActiveCase={activeCase !== null}
        onResetToDemo={handleResetToDemo}
        onOpenTrustCenter={handleOpenTrustCenter}
      />

      {/* Main Command Workspace rendered via RoleGuard */}
      <main className="main-content" id="main-content">
        <RoleGuard
          cases={cases}
          activeCase={activeCase}
          onCaseCreated={handleCaseCreated}
          onUpdateCase={handleUpdateCase}
          onDeleteCase={handleDeleteCase}
          onSendForReview={handleSendForReview}
          onViewSummary={handleViewSummary}
          onOpenTrustCenter={() => handleOpenTrustCenter('overview')}
          intakeResetKey={intakeResetKey}
        />
      </main>

      {/* Institutional Footer */}
      <Footer onOpenTrustCenter={handleOpenTrustCenter} />

      {/* Privacy, Consent & Governance Trust Center Modal */}
      <PrivacyTrustCenter
        isOpen={isTrustCenterOpen}
        initialTab={trustCenterTab}
        onClose={() => setIsTrustCenterOpen(false)}
      />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainWorkspace />
    </AuthProvider>
  );
}

export default App;
