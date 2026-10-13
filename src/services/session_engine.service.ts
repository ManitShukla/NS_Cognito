import { CookieJar } from 'tough-cookie';
import type { ISessionStore } from '../adapters/cache/session_store.interface.js';
import { PlumwareHttpClient } from '../adapters/plumware/plumware_http_client.js';
import { PlumwareHtmlParser } from '../adapters/plumware/plumware_html_parser.js';
import type { LoginPayload, SessionInitResponse, LoginSuccessResponse } from '../types/auth.js';
import type { SessionState } from '../types/session.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  encodeStatelessSessionToken,
  decodeStatelessSessionToken,
  encodeAuthenticatedToken,
  decodeAuthenticatedToken,
  type SessionPayload,
  type AuthenticatedSessionPayload,
} from '../utils/crypto.js';
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
 * credential verification, and stateless serverless multi-instance session isolation.
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
   * Fetches upstream tokens, binds the exact CAPTCHA buffer, and generates a self-contained
   * stateless token capable of crossing serverless Lambda container boundaries.
   */
  async initializeSession(): Promise<SessionInitResponse['data']> {
    const cookieJar = new CookieJar();
    const createdAt = Date.now();

    // 1. Fetch initial login page to acquire upstream PHPSESSID and form tokens
    const { html } = await this.httpClient.fetchLoginPage(cookieJar);

    // Extract upstream PHPSESSID from cookie jar
    let phpsessid = '';
    try {
      const cookies = await cookieJar.getCookies(env.PLUMWARE_BASE_URL);
      const found = cookies.find((c) => c.key.toLowerCase() === 'phpsessid');
      if (found) {
        phpsessid = found.value;
      } else {
        const rootCookies = await cookieJar.getCookies('https://www.imsnsit.org');
        const rootFound = rootCookies.find((c) => c.key.toLowerCase() === 'phpsessid');
        if (rootFound) phpsessid = rootFound.value;
      }
    } catch {
      // ignore
    }

    // 2. Parse form tokens and CAPTCHA path
    const parsedForm = PlumwareHtmlParser.parseLoginForm(html);
    logger.debug('AUTH', `Extracted form tokens: fy=${parsedForm.fy}, captcha=${parsedForm.captchaPath}`);

    // 3. Download the exact CAPTCHA image buffer using the bound cookie jar
    const captchaBuffer = await this.httpClient.fetchCaptchaBuffer(cookieJar, parsedForm.captchaPath);
    const captchaBase64 = `data:image/jpeg;base64,${captchaBuffer.toString('base64')}`;

    // 4. Construct self-contained stateless session payload
    const sessionPayload: SessionPayload = {
      phpsessid,
      enc_fy: parsedForm.encFy,
      HRAND_NUM: parsedForm.hrandNum,
      comp: parsedForm.comp,
      fy: parsedForm.fy,
      t: parsedForm.t,
      f: parsedForm.f || '',
      createdAt,
    };

    const sessionToken = encodeStatelessSessionToken(sessionPayload);

    // 5. Construct internal session state for store / cache
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

    // 6. Store session state in ephemeral cache (if Redis / local memory available)
    await this.sessionStore.set(sessionToken, sessionState, env.SESSION_TTL_SECONDS);

    logger.info(
      'AUTH',
      `Session ${sessionToken.slice(0, 10)}... primed (TTL: ${env.SESSION_TTL_SECONDS}s, CAPTCHA: ${captchaBuffer.length} bytes)`
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
   * Refreshes the CAPTCHA image for an existing unauthenticated session.
   * Rehydrates stateless token if store miss occurs across serverless lambdas.
   */
  async refreshCaptcha(sessionToken: string): Promise<SessionInitResponse['data']> {
    let session = await this.sessionStore.get(sessionToken);
    let statelessPayload: SessionPayload | null = null;

    if (!session) {
      statelessPayload = decodeStatelessSessionToken(sessionToken);
      if (statelessPayload) {
        const ageSeconds = (Date.now() - statelessPayload.createdAt) / 1000;
        if (ageSeconds > env.SESSION_TTL_SECONDS) {
          throw new SessionExpiredError();
        }
        const cookieJar = new CookieJar();
        if (statelessPayload.phpsessid) {
          cookieJar.setCookieSync(
            `PHPSESSID=${statelessPayload.phpsessid}; Path=/; Domain=imsnsit.org`,
            env.PLUMWARE_BASE_URL
          );
        }
        session = {
          sessionToken,
          cookieJar,
          f: statelessPayload.f,
          encFy: statelessPayload.enc_fy,
          fy: statelessPayload.fy,
          comp: statelessPayload.comp,
          t: statelessPayload.t,
          hrandNum: statelessPayload.HRAND_NUM,
          createdAt: statelessPayload.createdAt,
          expiresAt: statelessPayload.createdAt + env.SESSION_TTL_SECONDS * 1000,
          isAuthenticated: false,
        };
      }
    }

    if (!session) {
      throw new SessionExpiredError();
    }

    logger.info('AUTH', `Refreshing CAPTCHA challenge for session ${sessionToken.slice(0, 10)}...`);

    // 1. Request upstream CAPTCHA regeneration script
    const scriptText = await this.httpClient.refreshCaptchaScript(session.cookieJar);

    // 2. Parse updated CAPTCHA coordinates
    const { captchaPath } = PlumwareHtmlParser.parseCaptchaRefreshScript(scriptText);

    // 3. Download the fresh image buffer
    const captchaBuffer = await this.httpClient.fetchCaptchaBuffer(session.cookieJar, captchaPath);
    const captchaBase64 = `data:image/jpeg;base64,${captchaBuffer.toString('base64')}`;

    // 4. Update session state in store if available
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
   * Transparently rehydrates from stateless token when cross-lambda routing causes memory store misses.
   */
  async authenticate(payload: LoginPayload): Promise<LoginSuccessResponse['data']> {
    let session = await this.sessionStore.get(payload.sessionToken);
    let statelessPayload: SessionPayload | null = null;

    if (!session) {
      statelessPayload = decodeStatelessSessionToken(payload.sessionToken);
      if (statelessPayload) {
        const ageSeconds = (Date.now() - statelessPayload.createdAt) / 1000;
        if (ageSeconds > env.SESSION_TTL_SECONDS) {
          throw new SessionExpiredError('Session expired after 180s. Please acquire a fresh session.');
        }

        const reconstructedJar = new CookieJar();
        if (statelessPayload.phpsessid) {
          reconstructedJar.setCookieSync(
            `PHPSESSID=${statelessPayload.phpsessid}; Path=/; Domain=imsnsit.org`,
            env.PLUMWARE_BASE_URL
          );
        }

        session = {
          sessionToken: payload.sessionToken,
          cookieJar: reconstructedJar,
          f: statelessPayload.f,
          encFy: statelessPayload.enc_fy,
          fy: statelessPayload.fy,
          comp: statelessPayload.comp,
          t: statelessPayload.t,
          hrandNum: statelessPayload.HRAND_NUM,
          createdAt: statelessPayload.createdAt,
          expiresAt: statelessPayload.createdAt + env.SESSION_TTL_SECONDS * 1000,
          isAuthenticated: false,
          captchaPath: 'stateless_active',
        };
      }
    }

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

    // Burn CAPTCHA challenge immediately on session store to prevent replay attacks
    await this.sessionStore.update(payload.sessionToken, {
      captchaPath: undefined,
    });

    const cleanRoll = payload.rollNo.trim().toUpperCase();
    const cleanPwd = payload.password;
    const cleanCap = payload.captchaText.trim();

    logger.info(
      'AUTH',
      `Submitting authentication handshake for Roll: ${cleanRoll} (Session: ${session.sessionToken.slice(0, 10)}...)`
    );

    // 1. Build form URLSearchParams matching Plumware specifications exactly
    const formParams = new URLSearchParams({
      uid: cleanRoll,
      pwd: cleanPwd,
      cap: cleanCap,
      enc_fy: session.encFy || '',
      HRAND_NUM: session.hrandNum || '',
      comp: session.comp || 'NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY',
      fy: session.fy || '2026-27',
      t: session.t || 'swx',
      f: session.f || '',
      login: 'Login',
    });

    // Extract PHPSESSID to guarantee outbound cookie injection
    let phpsessid = statelessPayload?.phpsessid || '';
    if (!phpsessid) {
      try {
        const cookies = await session.cookieJar.getCookies(env.PLUMWARE_BASE_URL);
        const found = cookies.find((c) => c.key.toLowerCase() === 'phpsessid');
        if (found) phpsessid = found.value;
      } catch {
        // ignore
      }
    }

    let html: string;
    let statusCode: number;
    let location: string | undefined;

    try {
      // 2. Execute POST request against Plumware with maxRedirects: 0 and validateStatus < 400
      const res = await this.httpClient.submitLogin(session.cookieJar, formParams, phpsessid);
      html = res.html;
      statusCode = res.statusCode;
      location = res.location;
    } catch (err: unknown) {
      // Immediate single-use burn on network/gateway error
      await this.sessionStore.update(payload.sessionToken, { captchaPath: undefined });
      throw err;
    }

    // 3. Classify response
    const outcome = PlumwareHtmlParser.classifyLoginResponse(html, statusCode, location);
    logger.debug('AUTH', `Plumware login outcome classification: ${outcome.type}`);

    switch (outcome.type) {
      case 'INVALID_CAPTCHA':
        await this.sessionStore.update(payload.sessionToken, { captchaPath: undefined });
        throw new InvalidCaptchaError(outcome.reason);

      case 'INVALID_CREDENTIALS':
        await this.sessionStore.update(payload.sessionToken, { captchaPath: undefined });
        throw new InvalidCredentialsError(outcome.reason);

      case 'ACCESS_DENIED':
        await this.sessionStore.update(payload.sessionToken, { captchaPath: undefined });
        throw new PlumwareTripwireError(outcome.reason, { location });

      case 'SUCCESS': {
        const authenticatedAt = Date.now();
        const cookies = await session.cookieJar.getCookieString(env.PLUMWARE_BASE_URL);
        const activePhpsessid = phpsessid || (cookies.match(/PHPSESSID=([^;]+)/i)?.[1] || '');

        // Generate an authenticated stateless token so subsequent API requests on any serverless container work
        const authPayload: AuthenticatedSessionPayload = {
          type: 'authenticated',
          rollNo: cleanRoll,
          phpsessid: activePhpsessid,
          academicYear: session.fy,
          createdAt: authenticatedAt,
          expiresAt: authenticatedAt + env.SESSION_TTL_SECONDS * 1000,
        };
        const authenticatedToken = encodeAuthenticatedToken(authPayload);

        // Mark the original session token as authenticated to prevent replay
        await this.sessionStore.update(payload.sessionToken, {
          isAuthenticated: true,
          rollNo: cleanRoll,
          serializedCookies: cookies,
          captchaPath: undefined,
        });

        // Store authenticated session state under both tokens in sessionStore if available
        await this.sessionStore.set(
          authenticatedToken,
          {
            isAuthenticated: true,
            sessionToken: authenticatedToken,
            cookieJar: session.cookieJar,
            rollNo: cleanRoll,
            fy: session.fy,
            serializedCookies: cookies,
            createdAt: authenticatedAt,
            expiresAt: authenticatedAt + env.SESSION_TTL_SECONDS * 1000,
          },
          env.SESSION_TTL_SECONDS
        );

        logger.info(
          'AUTH',
          `Handshake SUCCESS for Roll: ${cleanRoll}. Authenticated session established.`
        );

        return {
          sessionToken: authenticatedToken,
          rollNo: cleanRoll,
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
   * Decodes stateless authenticated tokens if container memory misses.
   */
  async getAuthenticatedSession(sessionToken: string): Promise<SessionState> {
    const session = await this.sessionStore.get(sessionToken);
    if (session && session.isAuthenticated) {
      return session;
    }

    // Stateless fallback: decode authenticated token
    const authPayload = decodeAuthenticatedToken(sessionToken);
    if (authPayload) {
      if (Date.now() > authPayload.expiresAt) {
        throw new SessionExpiredError('Authenticated session has expired. Please log in again.');
      }

      const reconstructedJar = new CookieJar();
      if (authPayload.phpsessid) {
        reconstructedJar.setCookieSync(
          `PHPSESSID=${authPayload.phpsessid}; Path=/; Domain=imsnsit.org`,
          env.PLUMWARE_BASE_URL
        );
      }

      return {
        sessionToken,
        cookieJar: reconstructedJar,
        rollNo: authPayload.rollNo,
        fy: authPayload.academicYear,
        createdAt: authPayload.createdAt,
        expiresAt: authPayload.expiresAt,
        isAuthenticated: true,
      };
    }

    throw new SessionExpiredError('Authenticated session has expired or is invalid.');
  }
}
