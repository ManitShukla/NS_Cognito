import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../api/client';
import { RefreshCw, Lock, User, KeyRound, AlertTriangle, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import type { SessionInitData, LoginSuccessData } from '../types/api';

interface LoginPageProps {
  onLoginSuccess: (data: LoginSuccessData) => void;
  onCancel?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onCancel }) => {
  const [sessionData, setSessionData] = useState<SessionInitData | null>(null);
  const [rollNo, setRollNo] = useState('');
  const [password, setPassword] = useState('');
  const [captchaText, setCaptchaText] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState(180);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<{ code: string; message: string } | null>(null);

  // Initialize session and fetch CAPTCHA
  const initHandshake = useCallback(async () => {
    setIsLoadingSession(true);
    setErrorMessage(null);
    try {
      const data = await apiClient.initSession();
      setSessionData(data);
      setTtlSeconds(data.expiresInSeconds || 180);
      setCaptchaText('');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage({ code: err.code, message: err.message });
      } else {
        const msg = err instanceof Error ? err.message : 'Unable to establish secure handshake with Plumware proxy gateway.';
        setErrorMessage({
          code: 'HANDSHAKE_ERROR',
          message: msg,
        });
      }
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  // Refresh CAPTCHA challenge
  const handleRefreshCaptcha = async () => {
    if (!sessionData?.sessionToken) {
      await initHandshake();
      return;
    }
    setIsLoadingSession(true);
    setErrorMessage(null);
    try {
      const refreshed = await apiClient.refreshCaptcha(sessionData.sessionToken);
      setSessionData(refreshed);
      setTtlSeconds(refreshed.expiresInSeconds || 180);
      setCaptchaText('');
    } catch {
      // If refresh fails due to session expiration, re-initialize
      await initHandshake();
    } finally {
      setIsLoadingSession(false);
    }
  };

  useEffect(() => {
    initHandshake();
  }, [initHandshake]);

  // TTL Countdown Timer (stable single interval per session)
  useEffect(() => {
    if (!sessionData?.sessionToken) return;

    const timer = setInterval(() => {
      setTtlSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMessage({
            code: 'SESSION_EXPIRED',
            message: 'Ephemeral CAPTCHA session expired after 180s. Refreshing gateway credentials...',
          });
          initHandshake();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionData?.sessionToken, initHandshake]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionData?.sessionToken) {
      setErrorMessage({ code: 'SESSION_MISSING', message: 'Session handshake not initialized.' });
      return;
    }

    if (!rollNo.trim()) {
      setErrorMessage({ code: 'VALIDATION_ERROR', message: 'Roll Number is required.' });
      return;
    }
    if (!password) {
      setErrorMessage({ code: 'VALIDATION_ERROR', message: 'Password is required.' });
      return;
    }
    if (!captchaText.trim()) {
      setErrorMessage({ code: 'VALIDATION_ERROR', message: 'CAPTCHA security code is required.' });
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const loginData = await apiClient.login({
        sessionToken: sessionData.sessionToken,
        rollNo: rollNo.trim().toUpperCase(),
        password,
        captchaText: captchaText.trim(),
      });
      onLoginSuccess(loginData);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage({ code: err.code, message: err.message });
      } else {
        setErrorMessage({
          code: 'AUTH_GATEWAY_ERROR',
          message: 'Authentication failed due to upstream proxy or network error.',
        });
      }
      // Clear CAPTCHA text and reload challenge, keeping rollNo and password intact
      setCaptchaText('');
      handleRefreshCaptcha();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format TTL into MM:SS
  const formatTtl = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Demo auto-fill helper
  const handleLoadDemo = () => {
    setRollNo('2024UCB1234');
    setPassword('••••••••••••');
    setCaptchaText('NSUT26');
  };

  return (
    <div className="min-h-screen cinematic-backdrop flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Viewfinder Enclosure Container - Strict flat 0px geometry */}
      <div className="w-full max-w-xl bg-co-night border border-co-dark-rule p-8 relative viewfinder-card">
        {/* Viewfinder reticle corner brackets */}
        <div className="viewfinder-corner-tl text-co-red"></div>
        <div className="viewfinder-corner-tr text-co-red"></div>
        <div className="viewfinder-corner-bl text-co-red"></div>
        <div className="viewfinder-corner-br text-co-red"></div>

        {/* Monospace Metadata Header */}
        <div className="flex items-center justify-between border-b border-co-dark-rule pb-4 mb-6">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs text-co-red font-bold">SEC // 01.AUTH_HANDSHAKE</span>
            <span className="text-co-dark-rule">|</span>
            {errorMessage ? (
              <span className="font-mono text-[10px] px-2 py-0.5 bg-red-950 border border-co-red text-co-red font-bold uppercase tracking-wider">
                STATUS :: RETRY_REQUIRED
              </span>
            ) : (
              <span className="font-mono text-[10px] px-2 py-0.5 bg-co-black border border-co-dark-rule text-co-dark-copy uppercase tracking-wider">
                STATUS :: NOMINAL
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <Clock className={`w-3.5 h-3.5 ${ttlSeconds < 30 ? 'text-co-red animate-pulse' : 'text-co-muted'}`} />
            <span className={ttlSeconds < 30 ? 'text-co-red font-bold' : 'text-co-dark-copy'}>
              TTL :: {formatTtl(ttlSeconds)}
            </span>
          </div>
        </div>

        {/* Display Typography */}
        <div className="mb-6">
          <h1 className="font-sans font-bold text-3xl sm:text-4xl text-white tracking-tighter leading-none mb-2">
            ACADEMIC SESSION LOGIN
          </h1>
          <p className="font-mono text-xs text-co-muted uppercase tracking-wider">
            Zero-friction reverse proxy to Plumware ERP with isolated cookie jars.
          </p>
        </div>

        {/* Error Notification Banner */}
        {errorMessage && (
          <div className="mb-6 p-3 bg-red-950/40 border-l-2 border-co-red text-red-200 flex items-start space-x-3">
            <AlertTriangle className="w-4 h-4 text-co-red shrink-0 mt-0.5" />
            <div className="font-mono text-xs">
              <span className="text-co-red font-bold tracking-wider mr-2">[{errorMessage.code}]</span>
              <span>{errorMessage.message}</span>
            </div>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Roll Number Input */}
          <div>
            <label className="block font-mono text-xs text-co-dark-copy uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>INPUT // ROLL_NUMBER</span>
              <span className="text-[10px] text-co-muted">FORMAT: 2024UCB1234</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-co-muted">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={rollNo}
                onChange={(e) => setRollNo(e.target.value)}
                placeholder="2024UCB1234"
                disabled={isSubmitting}
                className="w-full pl-9 pr-3 py-2.5 bg-co-black border border-co-dark-rule text-white font-mono text-sm uppercase tracking-wider placeholder:text-co-disabled input-swiss"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block font-mono text-xs text-co-dark-copy uppercase tracking-wider mb-1.5">
              INPUT // ERP_PASSWORD
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-co-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={isSubmitting}
                className="w-full pl-9 pr-3 py-2.5 bg-co-black border border-co-dark-rule text-white font-mono text-sm placeholder:text-co-disabled input-swiss"
              />
            </div>
          </div>

          {/* CAPTCHA Challenge Frame */}
          <div>
            <label className="block font-mono text-xs text-co-dark-copy uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>SECURITY // RELAYED_CAPTCHA</span>
              <span className="text-[10px] text-co-muted">AUTO-SCALED RELAY</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              {/* CAPTCHA Preview Image */}
              <div className="h-12 bg-white flex items-center justify-center border border-co-dark-rule relative overflow-hidden">
                {isLoadingSession ? (
                  <div className="flex items-center space-x-2 text-co-ink font-mono text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin text-co-red" />
                    <span>FETCHING_CHALLENGE...</span>
                  </div>
                ) : sessionData?.captchaBase64 ? (
                  <img
                    src={`data:image/jpeg;base64,${sessionData.captchaBase64}`}
                    alt="Plumware CAPTCHA Challenge"
                    className="h-10 object-contain select-none filter contrast-125"
                  />
                ) : (
                  <span className="font-mono text-xs text-co-muted">CHALLENGE_UNAVAILABLE</span>
                )}

                {/* Refresh CAPTCHA overlay trigger - 44px min hit target */}
                <button
                  type="button"
                  onClick={handleRefreshCaptcha}
                  disabled={isLoadingSession || isSubmitting}
                  title="Reload CAPTCHA Challenge"
                  className="absolute right-0.5 top-0.5 bottom-0.5 min-w-[44px] min-h-[44px] bg-co-surface border border-co-rule text-co-ink hover:text-co-red transition-colors flex items-center justify-center cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSession ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* CAPTCHA Input Box */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-co-muted">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={captchaText}
                  onChange={(e) => setCaptchaText(e.target.value)}
                  placeholder="SECURITY_CODE"
                  maxLength={10}
                  disabled={isSubmitting}
                  className="w-full pl-9 pr-3 py-2.5 bg-co-black border border-co-dark-rule text-white font-mono text-sm uppercase tracking-widest placeholder:text-co-disabled input-swiss"
                />
              </div>
            </div>
          </div>

          {/* Action Button: Red Authority Block */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || isLoadingSession}
              className="w-full py-3.5 bg-co-red border border-co-red text-white font-sans font-bold text-sm tracking-wider uppercase flex items-center justify-center space-x-2 hover:-translate-y-0.5 transition-transform cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>NEGOTIATING_SESSION_TOKEN...</span>
                </>
              ) : (
                <>
                  <span>INITIALIZE ACADEMIC SESSION</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer Audit Stamp & Quick Auto-fill */}
        <div className="mt-8 pt-4 border-t border-co-dark-rule flex flex-col sm:flex-row items-center justify-between text-co-muted font-mono text-[11px] space-y-2 sm:space-y-0">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-co-blue" />
            <span>SESSION_ISOLATION // CRYPTO_HMAC_SHA256</span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleLoadDemo}
              className="text-co-dark-copy hover:text-white underline cursor-pointer"
            >
              PRESET_DEMO_CREDENTIALS
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="text-co-muted hover:text-white cursor-pointer"
              >
                RETURN_TO_VIEW
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
