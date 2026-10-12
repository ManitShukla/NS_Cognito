import axios, { type AxiosInstance, type AxiosResponse, isAxiosError } from 'axios';
import { HttpsCookieAgent, createCookieAgent } from 'http-cookie-agent/http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { CookieJar } from 'tough-cookie';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { PlumwareDownError, UpstreamTimeoutError, PlumwareTripwireError } from '../../utils/errors.js';
import { upstreamTrafficGate } from './upstream_traffic_gate.js';

export interface HttpClientOptions {
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
  proxyUrl?: string;
}

/**
 * Resilient HTTP client adapter for Plumware ERP interaction.
 * Configured with strict browser impersonation headers, per-request cookie jar binding,
 * legacy institutional TLS cipher fallback, optional egress proxy hook, and exponential backoff.
 */
export class PlumwareHttpClient {
  private readonly baseURL: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly proxyUrl?: string;

  /** Standard options applied to HTTPS agents for legacy educational portal support */
  public readonly httpsAgentOptions = {
    rejectUnauthorized: false, // Required for legacy educational institutional certificates
    keepAlive: true,
    ciphers: 'DEFAULT:@SECLEVEL=1', // Support legacy TLS ciphers
  };

  /** Standard modern Chrome desktop headers to evade bot-filtering heuristics */
  private static readonly DEFAULT_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  };

  constructor(options?: HttpClientOptions) {
    this.baseURL = options?.baseURL || env.PLUMWARE_BASE_URL;
    this.timeoutMs = options?.timeoutMs || env.PLUMWARE_TIMEOUT_MS;
    this.maxRetries = options?.maxRetries ?? env.PLUMWARE_MAX_RETRIES;
    this.proxyUrl = options?.proxyUrl || process.env.UPSTREAM_PROXY_URL || env.UPSTREAM_PROXY_URL;

    if (this.proxyUrl) {
      logger.info(
        'HTTP',
        `Configured Plumware HTTP client with upstream egress proxy: ${this.proxyUrl.replace(/:\/\/.*@/, '://***@')}`
      );
    }
  }

  /**
   * Spawns an isolated Axios client instance bound to the caller's CookieJar
   * using an HttpsCookieAgent configured with legacy institutional TLS support.
   */
  createSessionClient(jar: CookieJar, customTimeoutMs?: number): AxiosInstance {
    let httpsAgent: any;

    if (this.proxyUrl) {
      const HttpsProxyCookieAgent = createCookieAgent(HttpsProxyAgent);
      httpsAgent = new HttpsProxyCookieAgent(this.proxyUrl, {
        cookies: { jar: jar as any },
        ...this.httpsAgentOptions,
      });
    } else {
      httpsAgent = new HttpsCookieAgent({
        cookies: { jar: jar as any },
        ...this.httpsAgentOptions,
      });
    }

    return axios.create({
      baseURL: this.baseURL,
      timeout: customTimeoutMs || this.timeoutMs,
      headers: { ...PlumwareHttpClient.DEFAULT_HEADERS },
      validateStatus: (status: number) => status >= 200 && status < 400, // Handle 3xx manually or gracefully
      maxRedirects: 5,
      httpsAgent,
    });
  }

  /**
   * Executes an HTTP request with exponential backoff and jitter on network dropouts.
   */
  private async executeWithRetry<T>(
    operationName: string,
    fn: () => Promise<AxiosResponse<T>>
  ): Promise<AxiosResponse<T>> {
    let attempt = 0;
    let delay = 300;

    while (attempt <= this.maxRetries) {
      try {
        return await upstreamTrafficGate.execute(operationName, fn);
      } catch (err: unknown) {
        attempt++;
        const isTimeout =
          isAxiosError(err) &&
          (err.code === 'ECONNABORTED' ||
            err.code === 'ETIMEDOUT' ||
            (err.message && err.message.toLowerCase().includes('timeout')));

        if (isTimeout) {
          logger.warn(
            'HTTP',
            `Upstream timeout reached during "${operationName}" (${this.timeoutMs}ms). Aborting cleanly to avoid platform 504.`
          );
          throw new UpstreamTimeoutError(
            'University portal took too long to respond. Please retry.',
            { operation: operationName, attempts: attempt, timeoutMs: this.timeoutMs }
          );
        }

        const isNetworkOrTimeout =
          isAxiosError(err) &&
          (!err.response || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED');

        if (attempt > this.maxRetries || !isNetworkOrTimeout) {
          logger.error(
            'HTTP',
            `Failed operation "${operationName}" after ${attempt} attempt(s): ${err instanceof Error ? err.message : String(err)}`
          );
          throw new PlumwareDownError(
            `Plumware gateway error during "${operationName}": ${err instanceof Error ? err.message : 'Network failure'}`,
            { operation: operationName, attempts: attempt }
          );
        }

        const jitter = Math.floor(Math.random() * 150);
        const sleepMs = delay + jitter;
        logger.warn(
          'HTTP',
          `Transient failure on "${operationName}" (attempt ${attempt}/${this.maxRetries}). Retrying in ${sleepMs}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
        delay *= 2;
      }
    }

    throw new PlumwareDownError(`Exceeded maximum retries for "${operationName}"`);
  }

  /**
   * Fetches the Plumware login page to initialize cookie state and extract tokens.
   * Clamped to min(timeoutMs, 7000ms) to guarantee rapid failure/resilience in serverless environments.
   */
  async fetchLoginPage(jar: CookieJar): Promise<{ html: string; statusCode: number }> {
    const timeout = Math.min(this.timeoutMs, 7000);
    const client = this.createSessionClient(jar, timeout);

    const response = await this.executeWithRetry<string>('fetchLoginPage', () =>
      client.get('/plum5_fw_login.php', {
        headers: {
          Referer: `${this.baseURL}/student.htm`,
        },
      })
    );

    return {
      html: response.data,
      statusCode: response.status,
    };
  }

  /**
   * Downloads the binary JPEG CAPTCHA image using the exact session cookie jar.
   * Clamped to min(timeoutMs, 7000ms).
   */
  async fetchCaptchaBuffer(jar: CookieJar, captchaPath: string): Promise<Buffer> {
    const timeout = Math.min(this.timeoutMs, 7000);
    const client = this.createSessionClient(jar, timeout);
    const cleanPath = captchaPath.startsWith('/') ? captchaPath.slice(1) : captchaPath;

    const response = await this.executeWithRetry<ArrayBuffer>('fetchCaptchaBuffer', () =>
      client.get(`/${cleanPath}`, {
        responseType: 'arraybuffer',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: `${this.baseURL}/plum5_fw_login.php`,
        },
      })
    );

    const buffer = Buffer.from(response.data);

    // Validate binary buffer against known image magic headers (JPEG, PNG, GIF)
    const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isGif = buffer.length > 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;

    if (!isJpeg && !isPng && !isGif) {
      const preview = buffer.toString('utf8', 0, 120).replace(/\s+/g, ' ').trim();
      logger.error('HTTP', `Upstream returned invalid non-image payload for CAPTCHA challenge: "${preview}"`);
      throw new PlumwareTripwireError(
        'Upstream gateway returned non-image payload for CAPTCHA challenge.',
        { preview, bufferLength: buffer.length }
      );
    }

    return buffer;
  }

  /**
   * Triggers a CAPTCHA regeneration script on the portal via AJAX endpoint.
   * Clamped to min(timeoutMs, 7000ms).
   */
  async refreshCaptchaScript(jar: CookieJar): Promise<string> {
    const timeout = Math.min(this.timeoutMs, 7000);
    const client = this.createSessionClient(jar, timeout);

    const response = await this.executeWithRetry<string>('refreshCaptchaScript', () =>
      client.get('/plum5_fw_utils.php?rty=captcha&typ=login', {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `${this.baseURL}/plum5_fw_login.php`,
        },
      })
    );

    return response.data;
  }

  /**
   * Submits student login credentials and CAPTCHA challenge via form POST.
   */
  async submitLogin(
    jar: CookieJar,
    formData: Record<string, string>
  ): Promise<{ html: string; statusCode: number; location?: string }> {
    const client = this.createSessionClient(jar);
    const formParams = new URLSearchParams(formData).toString();

    const response = await this.executeWithRetry<string>('submitLogin', () =>
      client.post('/plum5_fw_login.php', formParams, {
        maxRedirects: 0,
        validateStatus: (status: number) => status >= 200 && status < 400,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: `${this.baseURL}/plum5_fw_login.php`,
        },
      })
    );

    return {
      html: typeof response.data === 'string' ? response.data : '',
      statusCode: response.status,
      location: response.headers['location'],
    };
  }

  /**
   * Executes an authenticated GET request against a protected portal route.
   */
  async fetchAuthenticatedPath(
    jar: CookieJar,
    pathName: string,
    referer = 'student_index.htm'
  ): Promise<{ html: string; statusCode: number; location?: string }> {
    const client = this.createSessionClient(jar);
    const cleanPath = pathName.startsWith('/') ? pathName.slice(1) : pathName;

    const response = await this.executeWithRetry<string>(`fetchAuthPath:${cleanPath}`, () =>
      client.get(`/${cleanPath}`, {
        maxRedirects: 0,
        validateStatus: (status: number) => status >= 200 && status < 400,
        headers: {
          Referer: `${this.baseURL}/${referer}`,
        },
      })
    );

    return {
      html: typeof response.data === 'string' ? response.data : '',
      statusCode: response.status,
      location: response.headers['location'],
    };
  }
}
