import { CookieJar } from 'tough-cookie';
import type { ISessionStore } from '../adapters/cache/session_store.interface.js';
import { PlumwareHttpClient } from '../adapters/plumware/plumware_http_client.js';
import { PlumwareHtmlParser } from '../adapters/plumware/plumware_html_parser.js';
import type { LoginPayload, SessionInitResponse, LoginSuccessResponse } from '../types/auth.js';
import type { SessionState } from '../types/session.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { generateSignedSessionToken } from '../utils/crypto.js';
import {
  SessionExpiredError,
  InvalidCaptchaError,
  InvalidCredentialsError,
  PlumwareTripwireError,
  SessionAlreadyUsedError,
} from '../utils/errors.js';

export interface SessionEngineDependencies {
  sessionStore: ISessionStore;
  httpClient?: PlumwareHttpClient;
}

/**
 * Core Session Engine orchestrating Plumware ERP handshakes, CAPTCHA binding,
 * credential verification, and ephemeral session isolation.
 */
export class SessionEngineService {
  private readonly sessionStore: ISessionStore;
  private readonly httpClient: PlumwareHttpClient;

  constructor(deps: SessionEngineDependencies) {
    this.sessionStore = deps.sessionStore;
    this.httpClient = deps.httpClient || new PlumwareHttpClient();
  }

  /**
   * Initializes a brand-new, isolated Plumware session lifecycle.
   * Fetches upstream tokens, binds the exact CAPTCHA buffer, and caches session state.
   */
  async initializeSession(): Promise<SessionInitResponse['data']> {
    const sessionToken = generateSignedSessionToken();
    const cookieJar = new CookieJar();
    const createdAt = Date.now();

    logger.info('AUTH', `Initializing session ${sessionToken.slice(0, 8)}...`);

    // 1. Fetch initial login page to acquire upstream PHPSESSID and form tokens
    const { html } = await this.httpClient.fetchLoginPage(cookieJar);

    // 2. Parse form tokens and CAPTCHA path
    const parsedForm = PlumwareHtmlParser.parseLoginForm(html);
    logger.debug('AUTH', `Extracted form tokens: fy=${parsedForm.fy}, captcha=${parsedForm.captchaPath}`);

    // 3. Download the exact CAPTCHA image buffer using the bound cookie jar
    const captchaBuffer = await this.httpClient.fetchCaptchaBuffer(cookieJar, parsedForm.captchaPath);
    const captchaBase64 = `data:image/jpeg;base64,${captchaBuffer.toString('base64')}`;

    // 4. Construct internal session state
    const sessionState: SessionState = {
      sessionToken,
      cookieJar,
      f: parsedForm.f,
      encFy: parsedForm.encFy,
      fy: parsedForm.fy,
      comp: parsedForm.comp,
      t: parsedForm.t,
      hrandNum: parsedForm.hrandNum,
      captchaPath: parsedForm.captchaPath,
      createdAt,
      expiresAt: createdAt + env.SESSION_TTL_SECONDS * 1000,
      isAuthenticated: false,
    };

    // 5. Store session state in ephemeral cache with strict TTL
    await this.sessionStore.set(sessionToken, sessionState, env.SESSION_TTL_SECONDS);

    logger.info(
      'AUTH',
      `Session ${sessionToken.slice(0, 8)}... primed (TTL: ${env.SESSION_TTL_SECONDS}s, CAPTCHA: ${captchaBuffer.length} bytes)`
    );

    return {
      sessionToken,
      captchaBase64,
      academicYear: parsedForm.fy,
      expiresInSeconds: env.SESSION_TTL_SECONDS,
      timestamp: createdAt,
    };
  }

  /**
   * Refreshes the CAPTCHA image for an existing unauthenticated session
   * without requiring re-initialization of the whole session.
   */
  async refreshCaptcha(sessionToken: string): Promise<SessionInitResponse['data']> {
    const session = await this.sessionStore.get(sessionToken);
    if (!session) {
      throw new SessionExpiredError();
    }

    logger.info('AUTH', `Refreshing CAPTCHA challenge for session ${sessionToken.slice(0, 8)}...`);

    // 1. Request upstream CAPTCHA regeneration script
    const scriptText = await this.httpClient.refreshCaptchaScript(session.cookieJar);

    // 2. Parse updated CAPTCHA coordinates
    const { captchaPath } = PlumwareHtmlParser.parseCaptchaRefreshScript(scriptText);

    // 3. Download the fresh image buffer
    const captchaBuffer = await this.httpClient.fetchCaptchaBuffer(session.cookieJar, captchaPath);
    const captchaBase64 = `data:image/jpeg;base64,${captchaBuffer.toString('base64')}`;

    // 4. Update session state
    await this.sessionStore.update(sessionToken, {
      captchaPath,
    });

    return {
      sessionToken,
      captchaBase64,
      academicYear: session.fy,
      expiresInSeconds: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
      timestamp: Date.now(),
    };
  }

  /**
   * Verifies credentials against the legacy Plumware portal using the session's bound cookie jar.
   */
  async authenticate(payload: LoginPayload): Promise<LoginSuccessResponse['data']> {
    const session = await this.sessionStore.get(payload.sessionToken);
    if (!session) {
      throw new SessionExpiredError();
    }

    // Replay Protection: Reject if session was already authenticated
    if (session.isAuthenticated) {
      throw new SessionAlreadyUsedError(
        'Session has already been authenticated. Acquire a fresh session token to log in again.'
      );
    }

    // Single-use CAPTCHA protection: Reject if challenge was already consumed
    if (!session.captchaPath) {
      throw new SessionExpiredError('CAPTCHA challenge has already been consumed. Please refresh the CAPTCHA.');
    }

    // Burn CAPTCHA challenge immediately on session state to prevent replay attacks
    await this.sessionStore.update(payload.sessionToken, {
      captchaPath: undefined,
    });

    logger.info(
      'AUTH',
      `Submitting authentication handshake for Roll: ${payload.rollNo} (Session: ${session.sessionToken.slice(0, 8)}...)`
    );

    // 1. Build form URL-encoded payload matching Plumware specifications with dual-key compatibility
    const formPayload: Record<string, string> = {
      uid: payload.rollNo,
      user_id: payload.rollNo,
      pwd: payload.password,
      password: payload.password,
      cap: payload.captchaText,
      security_code: payload.captchaText,
      f: session.f || '',
      enc_fy: session.encFy || '',
      fy: session.fy,
      comp: session.comp || 'NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY',
      t: session.t || 'swx',
      HRAND_NUM: session.hrandNum || '',
      login: 'Login',
      Submit: 'Login',
    };

    let html: string;
    let statusCode: number;
    let location: string | undefined;

    try {
      // 2. Execute POST request against Plumware
      const res = await this.httpClient.submitLogin(session.cookieJar, formPayload);
      html = res.html;
      statusCode = res.statusCode;
      location = res.location;
    } catch (err: unknown) {
      // Immediate single-use purge on network/gateway error
      await this.sessionStore.delete(payload.sessionToken);
      throw err;
    }

    // 3. Classify response
    const outcome = PlumwareHtmlParser.classifyLoginResponse(html, statusCode, location);
    logger.debug('AUTH', `Plumware login outcome classification: ${outcome.type}`);

    switch (outcome.type) {
      case 'INVALID_CAPTCHA':
        await this.sessionStore.delete(payload.sessionToken);
        throw new InvalidCaptchaError(outcome.reason);

      case 'INVALID_CREDENTIALS':
        await this.sessionStore.delete(payload.sessionToken);
        throw new InvalidCredentialsError(outcome.reason);

      case 'ACCESS_DENIED':
        await this.sessionStore.delete(payload.sessionToken);
        throw new PlumwareTripwireError(outcome.reason, { location });

      case 'SUCCESS': {
        const authenticatedAt = Date.now();
        const cookies = await session.cookieJar.getCookieString(env.PLUMWARE_BASE_URL);

        // Update session state as authenticated and evict transient pre-login state to conserve memory
        await this.sessionStore.update(payload.sessionToken, {
          isAuthenticated: true,
          rollNo: payload.rollNo,
          serializedCookies: cookies,
          f: undefined,
          encFy: undefined,
          comp: undefined,
          t: undefined,
          hrandNum: undefined,
          captchaPath: undefined,
        });

        logger.info(
          'AUTH',
          `Handshake SUCCESS for Roll: ${payload.rollNo}. Authenticated session established.`
        );

        return {
          sessionToken: payload.sessionToken,
          rollNo: payload.rollNo,
          academicYear: session.fy,
          authenticatedAt,
          message: 'Authentication successful. Upstream ERP session established.',
        };
      }

      case 'UNKNOWN':
      default:
        await this.sessionStore.delete(payload.sessionToken);
        logger.error('AUTH', 'Unrecognized Plumware response signature', { preview: outcome.rawPreview });
        throw new PlumwareTripwireError(
          'Unrecognized response received from university portal during login.',
          { preview: outcome.rawPreview }
        );
    }
  }

  /**
   * Retrieves an active session state if authenticated.
   */
  async getAuthenticatedSession(sessionToken: string): Promise<SessionState> {
    const session = await this.sessionStore.get(sessionToken);
    if (!session || !session.isAuthenticated) {
      throw new SessionExpiredError('Authenticated session has expired or is invalid.');
    }
    return session;
  }
}
