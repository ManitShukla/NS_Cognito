import type {
  SessionInitData,
  LoginSuccessData,
  StudentAcademicProfile,
  PersonalizedStudentSchedule,
  ProjectedAttendanceForecast,
  MasterSectionTimetable,
  StudentAcademicInference,
  ApiResponse,
  ForecastAction,
  DayOfWeek,
} from '../types/api';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json: ApiResponse<T> = await response.json();

  if (!response.ok || json.status === 'error') {
    throw new ApiError(
      json.code || `HTTP_${response.status}`,
      json.message || 'An unexpected telemetry gateway error occurred.',
      json.details
    );
  }

  if (json.data === undefined) {
    throw new ApiError('EMPTY_RESPONSE', 'Gateway returned empty data payload.');
  }

  return json.data;
}

export const apiClient = {
  /**
   * Initializes a fresh Plumware session and retrieves the bound CAPTCHA.
   */
  async initSession(): Promise<SessionInitData> {
    const res = await fetch(`${API_BASE}/auth/session`);
    return handleResponse<SessionInitData>(res);
  },

  /**
   * Submits student credentials and CAPTCHA challenge.
   */
  async login(payload: {
    sessionToken: string;
    rollNo: string;
    password: string;
    captchaText: string;
  }): Promise<LoginSuccessData> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<LoginSuccessData>(res);
  },

  /**
   * Refreshes the CAPTCHA image for an active session.
   */
  async refreshCaptcha(sessionToken: string): Promise<SessionInitData> {
    const res = await fetch(`${API_BASE}/auth/refresh-captcha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    });
    return handleResponse<SessionInitData>(res);
  },

  /**
   * Retrieves unified student academic telemetry profile.
   */
  async getDashboardProfile(sessionToken: string): Promise<StudentAcademicProfile> {
    const res = await fetch(`${API_BASE}/student/dashboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': sessionToken,
      },
      body: JSON.stringify({ sessionToken }),
    });
    return handleResponse<StudentAcademicProfile>(res);
  },

  /**
   * Retrieves personalized student timetable with sub-batch conflict resolution.
   */
  async getSchedule(sessionToken: string): Promise<PersonalizedStudentSchedule> {
    const res = await fetch(`${API_BASE}/student/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': sessionToken,
      },
      body: JSON.stringify({ sessionToken }),
    });
    return handleResponse<PersonalizedStudentSchedule>(res);
  },

  /**
   * Runs forward-looking attendance simulations with multi-hour lab weighting.
   */
  async simulateForecast(
    sessionToken: string,
    payload?: {
      targetDay?: DayOfWeek;
      customActions?: Record<string, ForecastAction>;
      defaultAction?: ForecastAction;
    }
  ): Promise<ProjectedAttendanceForecast> {
    const res = await fetch(`${API_BASE}/student/forecast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': sessionToken,
      },
      body: JSON.stringify({ sessionToken, ...payload }),
    });
    return handleResponse<ProjectedAttendanceForecast>(res);
  },

  /**
   * Auto-infers academic standing, branch, semester, and section from roll number.
   */
  async inferAcademicStanding(rollNo: string): Promise<StudentAcademicInference> {
    const params = new URLSearchParams({ rollNo });
    const res = await fetch(`${API_BASE}/timetable/infer?${params.toString()}`);
    return handleResponse<StudentAcademicInference>(res);
  },

  /**
   * Public universal timetable query for any branch/section.
   */
  async queryTimetable(params: {
    program?: string;
    branch: string;
    semester?: number;
    section?: string;
    group?: string;
  }): Promise<MasterSectionTimetable> {
    const searchParams = new URLSearchParams();
    if (params.program) searchParams.set('program', params.program);
    searchParams.set('branch', params.branch);
    if (params.semester !== undefined) searchParams.set('semester', String(params.semester));
    if (params.section) searchParams.set('section', params.section);
    if (params.group) searchParams.set('group', params.group);

    const res = await fetch(`${API_BASE}/timetable/query?${searchParams.toString()}`);
    const data = await handleResponse<{ timetable: MasterSectionTimetable }>(res);
    return data.timetable;
  },

  /**
   * Force re-syncs master timetable and warms server cache.
   */
  async syncTimetable(payload: {
    academicYear?: string;
    program: string;
    branch: string;
    semester: number;
    section: string;
  }): Promise<MasterSectionTimetable> {
    const res = await fetch(`${API_BASE}/timetable/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ timetable: MasterSectionTimetable }>(res);
    return data.timetable;
  },

  /**
   * Retrieves upstream university portal health and responsiveness.
   */
  async checkUpstreamHealth(): Promise<{
    state: 'healthy' | 'degraded' | 'offline';
    latencyMs: number;
    message: string;
    lastError: string | null;
  }> {
    const res = await fetch('/api/health/upstream');
    return handleResponse<{
      state: 'healthy' | 'degraded' | 'offline';
      latencyMs: number;
      message: string;
      lastError: string | null;
    }>(res);
  },
};
