import axios, { type AxiosInstance, type AxiosResponse, isAxiosError } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import type { CookieJar } from 'tough-cookie';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { PlumwareDownError, UpstreamTimeoutError } from '../../utils/errors.js';
import { upstreamTrafficGate } from './upstream_traffic_gate.js';

export interface HttpClientOptions {
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Resilient HTTP client adapter for Plumware ERP interaction.
 * Configured with strict browser impersonation headers, per-request cookie jar binding,
 * and exponential backoff retry semantics for fragile network conditions.
 */
export class PlumwareHttpClient {
  private readonly baseURL: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  /** Standard modern Chrome desktop headers to evade bot-filtering heuristics */
  private static readonly DEFAULT_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  };

  constructor(options?: HttpClientOptions) {
    this.baseURL = options?.baseURL || env.PLUMWARE_BASE_URL;
    this.timeoutMs = options?.timeoutMs || env.PLUMWARE_TIMEOUT_MS;
    this.maxRetries = options?.maxRetries ?? env.PLUMWARE_MAX_RETRIES;
  }

  /**
   * Spawns an isolated Axios client instance bound to the caller's CookieJar.
   */
  createSessionClient(jar: CookieJar): AxiosInstance {
    return wrapper(
      axios.create({
        baseURL: this.baseURL,
        timeout: this.timeoutMs,
        headers: { ...PlumwareHttpClient.DEFAULT_HEADERS },
        validateStatus: (status: number) => status >= 200 && status < 400, // Handle 3xx manually or gracefully
        maxRedirects: 5,
        jar,
      })
    );
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
   */
  async fetchLoginPage(jar: CookieJar): Promise<{ html: string; statusCode: number }> {
    const client = this.createSessionClient(jar);

    const response = await this.executeWithRetry<string>('fetchLoginPage', () =>
      client.get('/plum5_fw_login.php', {
        jar,
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
   */
  async fetchCaptchaBuffer(jar: CookieJar, captchaPath: string): Promise<Buffer> {
    const client = this.createSessionClient(jar);
    const cleanPath = captchaPath.startsWith('/') ? captchaPath.slice(1) : captchaPath;

    const response = await this.executeWithRetry<ArrayBuffer>('fetchCaptchaBuffer', () =>
      client.get(`/${cleanPath}`, {
        jar,
        responseType: 'arraybuffer',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: `${this.baseURL}/plum5_fw_login.php`,
        },
      })
    );

    return Buffer.from(response.data);
  }

  /**
   * Triggers a CAPTCHA regeneration script on the portal via AJAX endpoint.
   */
  async refreshCaptchaScript(jar: CookieJar): Promise<string> {
    const client = this.createSessionClient(jar);

    const response = await this.executeWithRetry<string>('refreshCaptchaScript', () =>
      client.get('/plum5_fw_utils.php?rty=captcha&typ=login', {
        jar,
        headers: {
          Referer: `${this.baseURL}/plum5_fw_login.php`,
        },
      })
    );

    return response.data;
  }

  /**
   * Submits authentication credentials and form tokens.
   */
  async submitLogin(
    jar: CookieJar,
    formPayload: Record<string, string>
  ): Promise<{ html: string; statusCode: number; location?: string }> {
    const client = this.createSessionClient(jar);
    const encodedData = new URLSearchParams(formPayload).toString();

    // Do not automatically follow redirect if 302 to inspect Location header
    const response = await this.executeWithRetry<string>('submitLogin', () =>
      client.post('/plum5_fw_login.php', encodedData, {
        jar,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: `${this.baseURL}/plum5_fw_login.php`,
          Origin: new URL(this.baseURL).origin,
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      })
    );

    const location = response.headers['location'] as string | undefined;

    // If 302 Found, fetch the target location to read full error or dashboard DOM
    if (response.status === 302 && location) {
      const redirectUrl = location.startsWith('http') ? location : `/${location}`;
      logger.debug('HTTP', `Following login 302 redirect to: ${redirectUrl}`);

      const followResp = await this.executeWithRetry<string>('followLoginRedirect', () =>
        client.get(redirectUrl, {
          jar,
          headers: {
            Referer: `${this.baseURL}/plum5_fw_login.php`,
          },
        })
      );

      return {
        html: followResp.data,
        statusCode: followResp.status,
        location,
      };
    }

    return {
      html: response.data,
      statusCode: response.status,
      location,
    };
  }

  /**
   * Fetches an authenticated relative URL (such as a dynamic plum_url.php?<token> endpoint)
   * while injecting the mandatory Referer and Origin headers.
   */
  async fetchAuthenticatedPath(
    jar: CookieJar,
    relativePath: string,
    customReferer?: string
  ): Promise<{ html: string; statusCode: number; location?: string }> {
    const client = this.createSessionClient(jar);
    const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    const referer = customReferer || `${this.baseURL}/student.htm`;

    const response = await this.executeWithRetry<string>('fetchAuthenticatedPath', () =>
      client.get(cleanPath, {
        jar,
        headers: {
          Referer: referer,
          Origin: new URL(this.baseURL).origin,
        },
      })
    );

    const location = response.headers['location'] as string | undefined;

    return {
      html: response.data,
      statusCode: response.status,
      location,
    };
  }
}

