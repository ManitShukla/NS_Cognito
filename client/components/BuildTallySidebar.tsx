import React, { useState, useEffect } from 'react';
import {
  telemetryTally,
  type TelemetryTallyState,
} from '../api/telemetryTally';
import {
  Activity,
  Cpu,
  GitCommit,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Shield,
  Layers,
  Terminal,
} from 'lucide-react';

export const BuildTallySidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [tallyState, setTallyState] = useState<TelemetryTallyState>(telemetryTally.getState());
  const [isProbing, setIsProbing] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = telemetryTally.subscribe(() => {
      setTallyState({ ...telemetryTally.getState() });
    });

    // Initial probe and periodic health check
    telemetryTally.probeBackendHealth();
    const interval = setInterval(() => {
      telemetryTally.probeBackendHealth();
    }, 15000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleManualProbe = async () => {
    setIsProbing(true);
    await telemetryTally.probeBackendHealth();
    setIsProbing(false);
  };

  const { build, counters, backend, events } = tallyState;
  const isVercelHost = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
  const isBackendError = backend.status === 'DEGRADED' || backend.status === 'OFFLINE';

  return (
    <>
      {/* Collapsed Rail Badge / Floating Handle on Right Edge */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed right-0 top-24 z-50 flex items-center space-x-2 bg-co-night/95 hover:bg-co-night border-l-2 border-y border-co-red text-white py-2 px-3 transition-all hover:pr-4 cursor-pointer font-mono group"
          title="Expand Live Build & Telemetry Tally"
        >
          <span
            className={`w-2.5 h-2.5 ${
              backend.status === 'ONLINE'
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-co-red animate-ping'
            }`}
          />
          <div className="flex flex-col text-left">
            <span className="text-[10px] tracking-widest text-co-muted uppercase font-bold">
              BUILD // #{build.buildNumber}
            </span>
            <span className="text-xs font-bold text-white group-hover:text-co-red transition-colors flex items-center space-x-1">
              <span>rev:{build.commit}</span>
              {backend.pingLatencyMs !== null && (
                <span className="text-[10px] text-co-muted">({backend.pingLatencyMs}ms)</span>
              )}
            </span>
          </div>
          <ChevronLeft className="w-4 h-4 text-co-red ml-1 group-hover:-translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Expanded Telemetry Drawer */}
      {isOpen && (
        <aside className="fixed right-0 top-0 bottom-0 w-80 sm:w-96 z-50 bg-co-night border-l-2 border-co-red flex flex-col font-mono text-xs text-co-ink select-none animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-3 bg-co-ink border-b border-co-dark-rule text-white flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 bg-co-red flex-shrink-0" />
              <div className="leading-tight">
                <div className="font-bold tracking-wider text-[11px] uppercase">
                  NS COGNITO // TELEMETRY TALLY
                </div>
                <div className="text-[9px] text-co-muted uppercase">
                  ACTIVE BUILD & GATEWAY RUNNING MONITOR
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="px-2 py-1 bg-co-night border border-co-dark-rule hover:border-co-red text-co-dark-copy hover:text-white transition-colors cursor-pointer flex items-center space-x-1 text-[10px]"
              title="Collapse Tally Drawer"
            >
              <span>HIDE</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-white">
            {/* Deployment Warning if running on Vercel with mismatched backend */}
            {isVercelHost && isBackendError && (
              <div className="p-3 bg-red-950/80 border border-co-red text-white space-y-1">
                <div className="flex items-center space-x-1.5 text-co-red font-bold text-[11px]">
                  <AlertTriangle className="w-4 h-4 text-co-red flex-shrink-0" />
                  <span>REMOTE DEPLOYMENT NOTICE</span>
                </div>
                <p className="text-[10px] text-zinc-300 leading-relaxed">
                  The upstream remote at <span className="font-mono text-amber-300">nscognito.vercel.app</span> is still serving the unpatched deployment. Push the local Git commit (<code className="text-co-red">{build.commit}</code>) to GitHub to trigger Vercel&apos;s build pipeline.
                </p>
              </div>
            )}

            {/* Build Manifest Block */}
            <div className="border border-co-dark-rule bg-black/40 p-3 space-y-2">
              <div className="text-[10px] text-co-muted uppercase font-bold tracking-widest flex items-center justify-between border-b border-co-dark-rule pb-1.5">
                <span className="flex items-center space-x-1">
                  <Layers className="w-3 h-3 text-co-red" />
                  <span>BUILD_MANIFEST</span>
                </span>
                <span className="px-1.5 py-0.5 bg-co-night border border-co-dark-rule text-[9px] text-co-red">
                  {build.environment.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-[9px] text-co-muted uppercase">VERSION</div>
                  <div className="font-bold text-white">{build.version}</div>
                </div>
                <div>
                  <div className="text-[9px] text-co-muted uppercase">BUILD #</div>
                  <div className="font-bold text-amber-400">#{build.buildNumber}</div>
                </div>
                <div>
                  <div className="text-[9px] text-co-muted uppercase">GIT REVISION</div>
                  <div className="font-mono text-co-red flex items-center space-x-1">
                    <GitCommit className="w-3 h-3 inline" />
                    <span>{build.commit}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-co-muted uppercase">HOST</div>
                  <div className="text-zinc-300 truncate">
                    {isVercelHost ? 'VERCEL_EDGE' : 'LOCAL_NODE'}
                  </div>
                </div>
              </div>

              <div className="pt-1 border-t border-co-dark-rule/60 text-[9px] text-co-muted flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <Clock className="w-2.5 h-2.5 inline" />
                  <span>COMPILED:</span>
                </span>
                <span className="text-zinc-400">
                  {new Date(build.timestamp).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </span>
              </div>
            </div>

            {/* Gateway Health & Node Status */}
            <div className="border border-co-dark-rule bg-black/40 p-3 space-y-2">
              <div className="text-[10px] text-co-muted uppercase font-bold tracking-widest flex items-center justify-between border-b border-co-dark-rule pb-1.5">
                <span className="flex items-center space-x-1">
                  <Cpu className="w-3 h-3 text-emerald-400" />
                  <span>BACKEND_NODE_STATUS</span>
                </span>
                <span
                  className={`px-1.5 py-0.5 text-[9px] border flex items-center space-x-1 ${
                    backend.status === 'ONLINE'
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                      : backend.status === 'CHECKING'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                      : 'bg-red-950/80 border-co-red text-co-red'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 ${
                      backend.status === 'ONLINE'
                        ? 'bg-emerald-400'
                        : backend.status === 'CHECKING'
                        ? 'bg-amber-400 animate-spin'
                        : 'bg-co-red'
                    }`}
                  />
                  <span>{backend.status}</span>
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-co-muted text-[10px]">ROUNDTRIP PING:</span>
                  <span
                    className={`font-bold ${
                      backend.pingLatencyMs !== null && backend.pingLatencyMs < 200
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {backend.pingLatencyMs !== null ? `${backend.pingLatencyMs} ms` : '--'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-co-muted text-[10px]">ENGINE SPEC:</span>
                  <span className="text-zinc-300">{backend.engine || 'NS Cognito Proxy'}</span>
                </div>

                {backend.errorMessage && (
                  <div className="p-1.5 bg-red-950/60 border border-red-800/80 text-[10px] text-red-200">
                    <span className="font-bold">STATUS MSG: </span>
                    {backend.errorMessage}
                  </div>
                )}
              </div>

              <button
                onClick={handleManualProbe}
                disabled={isProbing}
                className="w-full mt-2 py-1.5 px-2 bg-co-night border border-co-dark-rule hover:border-co-red text-white text-[10px] uppercase font-bold tracking-wider flex items-center justify-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isProbing ? 'animate-spin text-co-red' : ''}`} />
                <span>{isProbing ? 'PROBING GATEWAY...' : 'PING /api/health NOW'}</span>
              </button>
            </div>

            {/* Running Gateway Interaction Tally */}
            <div className="border border-co-dark-rule bg-black/40 p-3 space-y-2">
              <div className="text-[10px] text-co-muted uppercase font-bold tracking-widest flex items-center justify-between border-b border-co-dark-rule pb-1.5">
                <span className="flex items-center space-x-1">
                  <Activity className="w-3 h-3 text-amber-400" />
                  <span>RUNNING_TALLY_METRICS</span>
                </span>
                <span className="text-[9px] text-zinc-400">SESSION SCOPE</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 bg-co-night border border-co-dark-rule">
                  <div className="text-co-muted text-[9px] uppercase tracking-wider">
                    HANDSHAKES
                  </div>
                  <div className="text-lg font-bold text-white">{counters.handshakesPrimed}</div>
                </div>

                <div className="p-2 bg-co-night border border-co-dark-rule">
                  <div className="text-co-muted text-[9px] uppercase tracking-wider">
                    CAPTCHAS
                  </div>
                  <div className="text-lg font-bold text-amber-400">{counters.captchasRelayed}</div>
                </div>

                <div className="p-2 bg-co-night border border-co-dark-rule">
                  <div className="text-co-muted text-[9px] uppercase tracking-wider">
                    LOGIN ATTEMPTS
                  </div>
                  <div className="text-lg font-bold text-zinc-300">{counters.loginAttempts}</div>
                </div>

                <div className="p-2 bg-co-night border border-co-dark-rule">
                  <div className="text-co-muted text-[9px] uppercase tracking-wider">
                    AUTH SUCCESS
                  </div>
                  <div
                    className={`text-lg font-bold ${
                      counters.loginSuccesses > 0 ? 'text-emerald-400' : 'text-zinc-500'
                    }`}
                  >
                    {counters.loginSuccesses}
                  </div>
                </div>
              </div>
            </div>

            {/* Wire Telemetry Event Log */}
            <div className="border border-co-dark-rule bg-black/40 p-3 space-y-2">
              <div className="text-[10px] text-co-muted uppercase font-bold tracking-widest flex items-center justify-between border-b border-co-dark-rule pb-1.5">
                <span className="flex items-center space-x-1">
                  <Terminal className="w-3 h-3 text-co-muted" />
                  <span>LIVE_EVENT_STREAM</span>
                </span>
                <button
                  onClick={() => telemetryTally.resetCounters()}
                  className="text-[9px] text-co-muted hover:text-white cursor-pointer uppercase underline"
                >
                  CLEAR
                </button>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
                {events.length === 0 ? (
                  <div className="text-zinc-500 italic py-2 text-center">No wire events logged yet</div>
                ) : (
                  events.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-1 border border-co-dark-rule/50 bg-co-night/80 flex items-start space-x-1.5 text-[9px]"
                    >
                      <span
                        className={`w-1.5 h-1.5 mt-1 flex-shrink-0 ${
                          evt.status === 'SUCCESS'
                            ? 'bg-emerald-400'
                            : evt.status === 'ERROR'
                            ? 'bg-co-red'
                            : 'bg-zinc-400'
                        }`}
                      />
                      <div className="flex-1 truncate">
                        <span className="text-co-muted">[{evt.timestamp}] </span>
                        <span className="font-bold text-white">{evt.label}</span>
                        {evt.detail && (
                          <div className="text-zinc-400 text-[8px] truncate">{evt.detail}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer of Drawer */}
          <div className="p-2.5 bg-co-ink border-t border-co-dark-rule text-[9px] text-co-muted flex items-center justify-between">
            <span className="flex items-center space-x-1">
              <Shield className="w-3 h-3 text-co-red" />
              <span>SWISS_EDITORIAL_V1</span>
            </span>
            <span className="text-zinc-400 font-mono">AUTOPROBE // 15s</span>
          </div>
        </aside>
      )}
    </>
  );
};
