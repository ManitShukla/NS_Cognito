export interface TallyEvent {
  id: string;
  timestamp: string;
  label: string;
  status: 'SUCCESS' | 'ERROR' | 'INFO';
  detail?: string;
}

export interface TelemetryTallyState {
  build: {
    version: string;
    commit: string;
    buildNumber: string;
    timestamp: string;
    environment: string;
  };
  counters: {
    handshakesPrimed: number;
    captchasRelayed: number;
    loginAttempts: number;
    loginSuccesses: number;
    loginFailures: number;
  };
  backend: {
    status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'CHECKING';
    statusCode: number | null;
    pingLatencyMs: number | null;
    commit: string | null;
    engine: string | null;
    lastChecked: string | null;
    errorMessage: string | null;
    rawResponseText: string | null;
  };
  events: TallyEvent[];
}

const safeBuildInfo = typeof __APP_BUILD_INFO__ !== 'undefined'
  ? __APP_BUILD_INFO__
  : {
      version: '1.0.1',
      commit: 'local',
      buildNumber: '1',
      timestamp: new Date().toISOString(),
      environment: 'local',
    };

class TelemetryTallyManager {
  private state: TelemetryTallyState = {
    build: { ...safeBuildInfo },
    counters: {
      handshakesPrimed: 0,
      captchasRelayed: 0,
      loginAttempts: 0,
      loginSuccesses: 0,
      loginFailures: 0,
    },
    backend: {
      status: 'CHECKING',
      statusCode: null,
      pingLatencyMs: null,
      commit: null,
      engine: null,
      lastChecked: null,
      errorMessage: null,
      rawResponseText: null,
    },
    events: [],
  };

  private listeners = new Set<() => void>();

  constructor() {
    this.addEvent('SYSTEM_INIT', 'INFO', `Build ${safeBuildInfo.version} (${safeBuildInfo.commit}) initialized`);
  }

  getState(): TelemetryTallyState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('Tally listener error:', err);
      }
    });
  }

  addEvent(label: string, status: 'SUCCESS' | 'ERROR' | 'INFO', detail?: string): void {
    const event: TallyEvent = {
      id: Math.random().toString(36).slice(2, 9),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      label,
      status,
      detail,
    };
    this.state.events = [event, ...this.state.events.slice(0, 24)]; // Keep last 25 events
    this.notify();
  }

  recordHandshake(success: boolean, detail?: string): void {
    this.state.counters.handshakesPrimed += 1;
    this.addEvent('HANDSHAKE_INIT', success ? 'SUCCESS' : 'ERROR', detail);
    this.notify();
  }

  recordCaptcha(success: boolean, detail?: string): void {
    this.state.counters.captchasRelayed += 1;
    this.addEvent('CAPTCHA_RELAY', success ? 'SUCCESS' : 'ERROR', detail);
    this.notify();
  }

  recordLogin(success: boolean, detail?: string): void {
    this.state.counters.loginAttempts += 1;
    if (success) {
      this.state.counters.loginSuccesses += 1;
      this.addEvent('AUTH_VERIFIED', 'SUCCESS', detail);
    } else {
      this.state.counters.loginFailures += 1;
      this.addEvent('AUTH_REJECTED', 'ERROR', detail);
    }
    this.notify();
  }

  async probeBackendHealth(): Promise<void> {
    const startTime = performance.now();
    try {
      const res = await fetch('/api/health');
      const latencyMs = Math.round(performance.now() - startTime);
      const isJson = res.headers.get('content-type')?.includes('application/json');

      if (res.ok && isJson) {
        const body = await res.json();
        this.state.backend = {
          status: 'ONLINE',
          statusCode: res.status,
          pingLatencyMs: latencyMs,
          commit: body.build?.commit || body.version || 'v1.0.1',
          engine: body.engine || 'NS Cognito Core Proxy',
          lastChecked: new Date().toLocaleTimeString(),
          errorMessage: null,
          rawResponseText: JSON.stringify(body, null, 2),
        };
        this.addEvent('BACKEND_PING', 'SUCCESS', `HTTP ${res.status} [${latencyMs}ms]`);
      } else {
        const text = await res.text();
        const isHtml = text.trim().startsWith('<');
        this.state.backend = {
          status: 'DEGRADED',
          statusCode: res.status,
          pingLatencyMs: latencyMs,
          commit: null,
          engine: null,
          lastChecked: new Date().toLocaleTimeString(),
          errorMessage: isHtml ? `HTTP ${res.status} (Returned non-JSON HTML)` : `HTTP ${res.status}`,
          rawResponseText: text,
        };
        this.addEvent('BACKEND_PING', 'ERROR', `HTTP ${res.status} non-JSON response`);
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      this.state.backend = {
        status: 'OFFLINE',
        statusCode: null,
        pingLatencyMs: latencyMs,
        commit: null,
        engine: null,
        lastChecked: new Date().toLocaleTimeString(),
        errorMessage: err instanceof Error ? err.message : 'Network unreachable',
        rawResponseText: err instanceof Error ? err.stack || err.message : String(err),
      };
      this.addEvent('BACKEND_PING', 'ERROR', `Network failure: ${err instanceof Error ? err.message : 'offline'}`);
    }
    this.notify();
  }

  resetCounters(): void {
    this.state.counters = {
      handshakesPrimed: 0,
      captchasRelayed: 0,
      loginAttempts: 0,
      loginSuccesses: 0,
      loginFailures: 0,
    };
    this.addEvent('COUNTERS_RESET', 'INFO', 'Tally cleared by user');
    this.notify();
  }
}

export const telemetryTally = new TelemetryTallyManager();
