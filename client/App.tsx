import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, type ActiveTab } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TimetableSection } from './components/TimetableSection';
import { ForecastSimulator } from './components/ForecastSimulator';
import { ExplorerPage } from './pages/ExplorerPage';
import { apiClient, ApiError } from './api/client';
import { MOCK_STUDENT_PROFILE, MOCK_STUDENT_SCHEDULE } from './api/mockData';
import type {
  StudentAcademicProfile,
  PersonalizedStudentSchedule,
  LoginSuccessData,
} from './types/api';
import { RefreshCw, Zap } from 'lucide-react';
import { BuildTallySidebar } from './components/BuildTallySidebar';

export const App: React.FC = () => {
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return localStorage.getItem('ns_cognito_session_token');
  });
  const [rollNo, setRollNo] = useState<string | null>(() => {
    return localStorage.getItem('ns_cognito_roll_no');
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [profile, setProfile] = useState<StudentAcademicProfile | null>(null);
  const [schedule, setSchedule] = useState<PersonalizedStudentSchedule | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [upstreamHealth, setUpstreamHealth] = useState<{
    state: 'healthy' | 'degraded' | 'offline';
    message: string;
  } | null>(null);

  // Load telemetry data from backend or mock
  const loadTelemetryData = useCallback(async (token: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [fetchedProfile, fetchedSchedule] = await Promise.all([
        apiClient.getDashboardProfile(token),
        apiClient.getSchedule(token),
      ]);
      setProfile(fetchedProfile);
      setSchedule(fetchedSchedule);
      setIsDemoMode(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') {
        setErrorMessage('SESSION_EXPIRED: Plumware session has expired. Please re-authenticate.');
        handleLogout();
      } else if (err instanceof ApiError && (err.code === 'PLUMWARE_TRIPWIRE' || err.code === 'PORTAL_DESYNC_DETECTED')) {
        setErrorMessage('PORTAL_DESYNC_DETECTED: Upstream Plumware navigation desynchronized or access denied.');
      } else {
        // Fall back gracefully to demo preset if server is not directly connected to live ERP
        console.warn(
          'Backend live ERP fetch unavailable, falling back to cached demo profile:',
          err instanceof Error ? err.message : 'Connection fallback'
        );
        setProfile(MOCK_STUDENT_PROFILE);
        setSchedule(MOCK_STUDENT_SCHEDULE);
        setIsDemoMode(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Upstream canary health monitor
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await apiClient.checkUpstreamHealth();
        if (health.state !== 'healthy') {
          setUpstreamHealth(health);
        } else {
          setUpstreamHealth(null);
        }
      } catch {
        // Network or server unreachable
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Initial mount check
  useEffect(() => {
    if (sessionToken) {
      loadTelemetryData(sessionToken);
    } else {
      // Default to high-fidelity mock profile so user can immediately experience the UI
      setProfile(MOCK_STUDENT_PROFILE);
      setSchedule(MOCK_STUDENT_SCHEDULE);
      setIsDemoMode(true);
    }
  }, [sessionToken, loadTelemetryData]);

  const handleLoginSuccess = (loginData: LoginSuccessData) => {
    setSessionToken(loginData.sessionToken);
    setRollNo(loginData.rollNo);
    localStorage.setItem('ns_cognito_session_token', loginData.sessionToken);
    localStorage.setItem('ns_cognito_roll_no', loginData.rollNo);
    setShowLoginModal(false);
    loadTelemetryData(loginData.sessionToken);
  };

  const handleLogout = () => {
    setSessionToken(null);
    setRollNo(null);
    localStorage.removeItem('ns_cognito_session_token');
    localStorage.removeItem('ns_cognito_roll_no');
    setProfile(MOCK_STUDENT_PROFILE);
    setSchedule(MOCK_STUDENT_SCHEDULE);
    setIsDemoMode(true);
  };

  const handleEnableLiveMode = () => {
    setShowLoginModal(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-co-surface text-co-ink">
      {/* Persistent Navigation Header */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sessionToken={sessionToken}
        rollNo={rollNo}
        onLogout={handleLogout}
        onOpenLogin={() => setShowLoginModal(true)}
      />

      {/* Upstream ERP Portal Degraded / Offline Canary Banner */}
      {upstreamHealth && (
        <div
          className={`border-b-2 px-4 py-2 text-xs font-mono flex flex-wrap items-center justify-between gap-2 ${
            upstreamHealth.state === 'offline'
              ? 'bg-red-950/90 border-co-red text-white'
              : 'bg-amber-950/80 border-amber-500 text-amber-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 ${
                upstreamHealth.state === 'offline' ? 'bg-co-red animate-pulse' : 'bg-amber-400'
              }`}
            ></span>
            <span className="font-bold">
              {upstreamHealth.state === 'offline'
                ? 'NOTICE // UPSTREAM_PORTAL_OFFLINE:'
                : 'NOTICE // UPSTREAM_PORTAL_DEGRADED:'}
            </span>
            <span>
              {upstreamHealth.message} (Cached timetables remain queryable; live authentication may fail).
            </span>
          </div>
          <button
            onClick={() => setUpstreamHealth(null)}
            className="px-2 py-0.5 bg-co-night border border-co-dark-rule text-co-dark-copy text-[10px] uppercase cursor-pointer"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* System Error & Desync Action Banner */}
      {errorMessage && (
        <div className="bg-red-950/80 border-b-2 border-co-red text-white px-4 py-3 text-xs font-mono flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 bg-co-red animate-pulse"></span>
            <span className="font-bold text-co-red">ALERT // SYSTEM_EXCEPTION:</span>
            <span>{errorMessage}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setErrorMessage(null);
                setShowLoginModal(true);
              }}
              className="px-3 py-1 bg-co-red text-white font-bold uppercase text-[11px] cursor-pointer"
            >
              RE-AUTHENTICATE NOW
            </button>
            <button
              onClick={() => setErrorMessage(null)}
              className="px-2 py-1 bg-co-night border border-co-dark-rule text-co-dark-copy text-[11px] cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* Demo Mode Notice Banner */}
      {isDemoMode && !showLoginModal && (
        <div className="bg-co-night border-b border-co-dark-rule text-white px-4 py-2 text-xs font-mono flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 bg-amber-400"></span>
            <span className="font-bold text-amber-400">MODE // DEMO_TELEMETRY:</span>
            <span className="text-co-dark-copy">
              Rendering synthetic high-density telemetry for Roll 2024UCB1234.
            </span>
          </div>
          <button
            onClick={handleEnableLiveMode}
            className="px-2.5 py-1 bg-co-red text-white font-bold uppercase tracking-wider text-[11px] border border-co-red hover:-translate-y-0.5 transition-transform flex items-center space-x-1 cursor-pointer"
          >
            <Zap className="w-3 h-3" />
            <span>CONNECT_LIVE_ERP</span>
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {showLoginModal ? (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            onCancel={() => setShowLoginModal(false)}
          />
        ) : isLoading ? (
          <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="w-8 h-8 animate-spin text-co-red" />
            <div className="font-mono text-xs uppercase tracking-widest text-co-muted">
              DE-ENCAPSULATING ACADEMIC TELEMETRY MATRIX...
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && profile && (
              <DashboardPage
                profile={profile}
                onNavigateToSchedule={() => setActiveTab('timetable')}
                onNavigateToSimulator={() => setActiveTab('simulator')}
              />
            )}

            {activeTab === 'timetable' && schedule && (
              <TimetableSection schedule={schedule} />
            )}

            {activeTab === 'simulator' && profile && schedule && (
              <ForecastSimulator
                profile={profile}
                schedule={schedule}
                sessionToken={sessionToken}
              />
            )}

            {activeTab === 'explorer' && <ExplorerPage />}
          </>
        )}
      </main>

      {/* Persistent Swiss Footer */}
      <footer className="bg-co-ink text-white border-t border-co-dark-rule py-8 px-4 sm:px-6 lg:px-8 font-mono text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 bg-co-red"></span>
            <span className="font-bold tracking-wider">NS COGNITO // ACADEMIC COPROCESSOR</span>
            <span className="text-co-muted">|</span>
            <span className="text-co-muted">NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY</span>
          </div>

          <div className="flex items-center space-x-4 text-co-muted">
            <span>SPEC: SWISS_EDITORIAL_V1</span>
            <span>•</span>
            <span>PROXY_ENGINE: ACTIVE</span>
          </div>
        </div>
      </footer>

      {/* Running Build & Telemetry Tally on the side */}
      <BuildTallySidebar />
    </div>
  );
};
