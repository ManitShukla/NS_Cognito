var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils/errors.ts
var AppError, SessionExpiredError, InvalidCaptchaError, InvalidCredentialsError, PlumwareTripwireError, PortalDesyncError, PlumwareDownError, UpstreamTimeoutError, RequestValidationError, UnrecognizedRollError, SessionAlreadyUsedError;
var init_errors = __esm({
  "src/utils/errors.ts"() {
    "use strict";
    AppError = class extends Error {
      constructor(message, details) {
        super(message);
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
      }
      details;
      toJSON() {
        return {
          status: "error",
          code: this.code,
          message: this.message,
          ...this.details ? { details: this.details } : {}
        };
      }
    };
    SessionExpiredError = class extends AppError {
      statusCode = 410;
      // Gone
      code = "SESSION_EXPIRED";
      constructor(message = "Session token has expired or is invalid. Please fetch a fresh CAPTCHA.") {
        super(message);
      }
    };
    InvalidCaptchaError = class extends AppError {
      statusCode = 400;
      // Bad Request
      code = "INVALID_CAPTCHA";
      constructor(message = "The security code entered did not match the CAPTCHA challenge.") {
        super(message);
      }
    };
    InvalidCredentialsError = class extends AppError {
      statusCode = 401;
      // Unauthorized
      code = "INVALID_CREDENTIALS";
      constructor(message = "Invalid student Roll Number or Password.") {
        super(message);
      }
    };
    PlumwareTripwireError = class extends AppError {
      statusCode = 502;
      // Bad Gateway
      code = "PLUMWARE_TRIPWIRE";
      constructor(message = "Plumware ERP rejected the request state or tripped a navigation security rule.", details) {
        super(message, details);
      }
    };
    PortalDesyncError = class extends PlumwareTripwireError {
      code = "PORTAL_DESYNC_DETECTED";
      constructor(message = "Plumware ERP navigation desynchronized or access denied. Session self-healing recommended.", details) {
        super(message, details);
      }
    };
    PlumwareDownError = class extends AppError {
      statusCode = 503;
      // Service Unavailable
      code = "PLUMWARE_UNAVAILABLE";
      constructor(message = "The university ERP portal (imsnsit.org) is currently unreachable or timing out.", details) {
        super(message, details);
      }
    };
    UpstreamTimeoutError = class extends AppError {
      statusCode = 504;
      // Gateway Timeout
      code = "UPSTREAM_TIMEOUT";
      constructor(message = "University portal took too long to respond. Please retry.", details) {
        super(message, details);
      }
      toJSON() {
        return {
          status: "error",
          code: this.code,
          message: this.message,
          success: false,
          error: this.code,
          ...this.details ? { details: this.details } : {}
        };
      }
    };
    RequestValidationError = class extends AppError {
      statusCode = 422;
      // Unprocessable Entity
      code = "VALIDATION_ERROR";
      constructor(message = "Request validation failed", details) {
        super(message, details);
      }
    };
    UnrecognizedRollError = class extends AppError {
      statusCode = 422;
      // Unprocessable Entity
      code = "UNRECOGNIZED_ROLL_FORMAT";
      constructor(message = "Unrecognized student roll number format or unknown department code.", details) {
        super(message, details);
      }
    };
    SessionAlreadyUsedError = class extends AppError {
      statusCode = 409;
      // Conflict
      code = "SESSION_ALREADY_USED";
      constructor(message = "Session token has already been authenticated or consumed. Please acquire a fresh session.") {
        super(message);
      }
    };
  }
});

// src/config/env.ts
import dotenv from "dotenv";
import { z } from "zod";
var envSchema, parsed, env;
var init_env = __esm({
  "src/config/env.ts"() {
    "use strict";
    dotenv.config();
    envSchema = z.object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      PORT: z.coerce.number().int().positive().default(3e3),
      // Plumware ERP upstream configuration (bounded to 8500ms for serverless platform compatibility)
      PLUMWARE_BASE_URL: z.string().url().default("https://www.imsnsit.org/imsnsit"),
      PLUMWARE_TIMEOUT_MS: z.coerce.number().int().positive().default(8500),
      PLUMWARE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
      UPSTREAM_PROXY_URL: z.string().optional(),
      // Session lifecycle parameters (strict 180s / 3-minute ephemeral TTL)
      SESSION_TTL_SECONDS: z.coerce.number().int().min(30).max(1800).default(180),
      SESSION_STORE_TYPE: z.enum(["memory", "redis"]).default("memory"),
      REDIS_URL: z.string().default("redis://localhost:6379"),
      REDIS_TLS_REJECT_UNAUTHORIZED: z.string().optional().default("true"),
      // CORS and domain configuration
      CORS_ORIGIN: z.string().optional(),
      APP_URL: z.string().optional().default("https://nscognito.vercel.app"),
      VERCEL: z.string().optional(),
      // Logging and telemetry
      LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
    });
    parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error("FATAL: Environment configuration validation failed:");
      console.error(JSON.stringify(parsed.error.format(), null, 2));
      process.exit(1);
    }
    env = parsed.data;
  }
});

// src/middleware/payload_sanitizer.ts
function maskRollNumber(rollNo) {
  if (!rollNo || typeof rollNo !== "string") return "";
  const trimmed = rollNo.trim();
  if (trimmed.length >= 8) {
    return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
  }
  return "***";
}
function maskSessionToken(token) {
  if (!token || typeof token !== "string") return "";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 8)}...`;
}
function sanitizeLogPayload(data, depth = 0) {
  if (depth > 5) return "[MAX_DEPTH_REACHED]";
  if (data === null || data === void 0) return data;
  if (typeof data === "string") {
    if (data.includes("PHPSESSID=")) {
      return data.replace(/PHPSESSID=[a-zA-Z0-9_-]+/g, "PHPSESSID=[REDACTED]");
    }
    return data;
  }
  if (typeof data !== "object") {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogPayload(item, depth + 1));
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = REDACTED;
    } else if (lowerKey === "rollno" || lowerKey === "roll_no" || lowerKey === "roll") {
      sanitized[key] = typeof value === "string" ? maskRollNumber(value) : REDACTED;
    } else if (lowerKey === "sessiontoken" || lowerKey === "session_token" || lowerKey === "x-session-token") {
      sanitized[key] = typeof value === "string" ? maskSessionToken(value) : REDACTED;
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeLogPayload(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
var REDACTED, SENSITIVE_KEYS;
var init_payload_sanitizer = __esm({
  "src/middleware/payload_sanitizer.ts"() {
    "use strict";
    REDACTED = "[REDACTED]";
    SENSITIVE_KEYS = /* @__PURE__ */ new Set([
      "password",
      "passwd",
      "secret",
      "captchatext",
      "captcha_text",
      "cookie",
      "cookies",
      "phpsessid",
      "authorization",
      "auth_token",
      "authtoken",
      "token",
      "sessionsecret",
      "session_secret"
    ]);
  }
});

// src/utils/logger.ts
function formatTimestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var LEVEL_SEVERITY, currentLevelSeverity, logger;
var init_logger = __esm({
  "src/utils/logger.ts"() {
    "use strict";
    init_env();
    init_payload_sanitizer();
    LEVEL_SEVERITY = {
      debug: 10,
      info: 20,
      warn: 30,
      error: 40
    };
    currentLevelSeverity = LEVEL_SEVERITY[env.LOG_LEVEL] || 20;
    logger = {
      debug(tag, message, meta) {
        if (LEVEL_SEVERITY.debug >= currentLevelSeverity) {
          const sanitizedMeta = meta !== void 0 ? sanitizeLogPayload(meta) : "";
          console.debug(`[${formatTimestamp()}] [DEBUG // ${tag}] ${message}`, sanitizedMeta);
        }
      },
      info(tag, message, meta) {
        if (LEVEL_SEVERITY.info >= currentLevelSeverity) {
          const sanitizedMeta = meta !== void 0 ? sanitizeLogPayload(meta) : "";
          console.log(`[${formatTimestamp()}] [TEL // ${tag}] ${message}`, sanitizedMeta);
        }
      },
      warn(tag, message, meta) {
        if (LEVEL_SEVERITY.warn >= currentLevelSeverity) {
          const sanitizedMeta = meta !== void 0 ? sanitizeLogPayload(meta) : "";
          console.warn(`[${formatTimestamp()}] [WARN // ${tag}] ${message}`, sanitizedMeta);
        }
      },
      error(tag, message, meta) {
        if (LEVEL_SEVERITY.error >= currentLevelSeverity) {
          const sanitizedMeta = meta !== void 0 ? sanitizeLogPayload(meta) : "";
          console.error(`[${formatTimestamp()}] [ERR // ${tag}] ${message}`, sanitizedMeta);
        }
      }
    };
  }
});

// src/adapters/plumware/upstream_traffic_gate.ts
var UpstreamTrafficGate, upstreamTrafficGate;
var init_upstream_traffic_gate = __esm({
  "src/adapters/plumware/upstream_traffic_gate.ts"() {
    "use strict";
    init_logger();
    UpstreamTrafficGate = class {
      maxConcurrent;
      minJitterMs;
      maxJitterMs;
      currentActive = 0;
      waitQueue = [];
      constructor(config) {
        this.maxConcurrent = config?.maxConcurrent ?? 6;
        this.minJitterMs = config?.minJitterMs ?? 150;
        this.maxJitterMs = config?.maxJitterMs ?? 350;
      }
      /**
       * Acquires a concurrency token and applies randomized anti-ban jitter.
       */
      async acquire() {
        if (this.currentActive >= this.maxConcurrent) {
          await new Promise((resolve) => {
            this.waitQueue.push(resolve);
          });
        }
        this.currentActive++;
        const jitter = Math.floor(Math.random() * (this.maxJitterMs - this.minJitterMs + 1)) + this.minJitterMs;
        if (jitter > 0) {
          await new Promise((resolve) => setTimeout(resolve, jitter));
        }
      }
      /**
       * Releases concurrency slot and dispatches next queued request if any.
       */
      release() {
        this.currentActive = Math.max(0, this.currentActive - 1);
        if (this.waitQueue.length > 0) {
          const next = this.waitQueue.shift();
          if (next) {
            next();
          }
        }
      }
      /**
       * Executes an asynchronous operation through the traffic gate.
       */
      async execute(operationName, fn) {
        if (this.currentActive >= this.maxConcurrent) {
          logger.debug(
            "TRAFFIC_GATE",
            `Throttling "${operationName}": concurrency limit reached (${this.currentActive}/${this.maxConcurrent}, queue: ${this.waitQueue.length})`
          );
        }
        await this.acquire();
        try {
          return await fn();
        } finally {
          this.release();
        }
      }
      /**
       * Current active concurrency count.
       */
      getActiveCount() {
        return this.currentActive;
      }
      /**
       * Current pending queue length.
       */
      getQueueLength() {
        return this.waitQueue.length;
      }
    };
    upstreamTrafficGate = new UpstreamTrafficGate();
  }
});

// src/types/timetable.ts
import { z as z3 } from "zod";
var DAYS_OF_WEEK, TimetableQuerySchema, InferenceQuerySchema, TimetableSyncPayloadSchema;
var init_timetable = __esm({
  "src/types/timetable.ts"() {
    "use strict";
    DAYS_OF_WEEK = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday"
    ];
    TimetableQuerySchema = z3.object({
      program: z3.string().default("B.Tech"),
      branch: z3.string().min(2, { message: "Branch code is required." }).max(15).transform((val) => val.trim().toUpperCase()),
      semester: z3.coerce.number().int().min(1).max(8).optional(),
      section: z3.string().default("1").transform((val) => val.trim()),
      group: z3.string().optional().default("All").transform((val) => val?.trim() || "All")
    });
    InferenceQuerySchema = z3.object({
      rollNo: z3.string().min(3, { message: "Roll number must be at least 3 characters." }).max(30).transform((val) => val.trim().toUpperCase())
    });
    TimetableSyncPayloadSchema = z3.object({
      academicYear: z3.string().optional(),
      program: z3.string().default("B.Tech"),
      branch: z3.string().min(2).max(15).transform((val) => val.trim().toUpperCase()),
      semester: z3.number().int().min(1).max(8),
      section: z3.string().default("1").transform((val) => val.trim())
    });
  }
});

// src/adapters/plumware/plumware_http_client.ts
import axios2, { isAxiosError } from "axios";
import { HttpsCookieAgent, createCookieAgent } from "http-cookie-agent/http";
import { HttpsProxyAgent } from "https-proxy-agent";
var PlumwareHttpClient;
var init_plumware_http_client = __esm({
  "src/adapters/plumware/plumware_http_client.ts"() {
    "use strict";
    init_env();
    init_logger();
    init_errors();
    init_upstream_traffic_gate();
    PlumwareHttpClient = class _PlumwareHttpClient {
      baseURL;
      timeoutMs;
      maxRetries;
      proxyUrl;
      /** Standard options applied to HTTPS agents for legacy educational portal support */
      httpsAgentOptions = {
        rejectUnauthorized: false,
        // Required for legacy educational institutional certificates
        keepAlive: true,
        ciphers: "DEFAULT:@SECLEVEL=1"
        // Support legacy TLS ciphers
      };
      /** Standard modern Chrome desktop headers to evade bot-filtering heuristics */
      static DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Upgrade-Insecure-Requests": "1"
      };
      constructor(options) {
        this.baseURL = options?.baseURL || env.PLUMWARE_BASE_URL;
        this.timeoutMs = options?.timeoutMs || env.PLUMWARE_TIMEOUT_MS;
        this.maxRetries = options?.maxRetries ?? env.PLUMWARE_MAX_RETRIES;
        this.proxyUrl = options?.proxyUrl || process.env.UPSTREAM_PROXY_URL || env.UPSTREAM_PROXY_URL;
        if (this.proxyUrl) {
          logger.info(
            "HTTP",
            `Configured Plumware HTTP client with upstream egress proxy: ${this.proxyUrl.replace(/:\/\/.*@/, "://***@")}`
          );
        }
      }
      /**
       * Spawns an isolated Axios client instance bound to the caller's CookieJar
       * using an HttpsCookieAgent configured with legacy institutional TLS support.
       */
      createSessionClient(jar, customTimeoutMs) {
        let httpsAgent;
        if (this.proxyUrl) {
          const HttpsProxyCookieAgent = createCookieAgent(HttpsProxyAgent);
          httpsAgent = new HttpsProxyCookieAgent(this.proxyUrl, {
            cookies: { jar },
            ...this.httpsAgentOptions
          });
        } else {
          httpsAgent = new HttpsCookieAgent({
            cookies: { jar },
            ...this.httpsAgentOptions
          });
        }
        return axios2.create({
          baseURL: this.baseURL,
          timeout: customTimeoutMs || this.timeoutMs,
          headers: { ..._PlumwareHttpClient.DEFAULT_HEADERS },
          validateStatus: (status) => status >= 200 && status < 400,
          // Handle 3xx manually or gracefully
          maxRedirects: 5,
          httpsAgent
        });
      }
      /**
       * Executes an HTTP request with exponential backoff and jitter on network dropouts.
       */
      async executeWithRetry(operationName, fn) {
        let attempt = 0;
        let delay = 300;
        while (attempt <= this.maxRetries) {
          try {
            return await upstreamTrafficGate.execute(operationName, fn);
          } catch (err) {
            attempt++;
            const isTimeout = isAxiosError(err) && (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT" || err.message && err.message.toLowerCase().includes("timeout"));
            if (isTimeout) {
              logger.warn(
                "HTTP",
                `Upstream timeout reached during "${operationName}" (${this.timeoutMs}ms). Aborting cleanly to avoid platform 504.`
              );
              throw new UpstreamTimeoutError(
                "University portal took too long to respond. Please retry.",
                { operation: operationName, attempts: attempt, timeoutMs: this.timeoutMs }
              );
            }
            const isNetworkOrTimeout = isAxiosError(err) && (!err.response || err.code === "ECONNRESET" || err.code === "ECONNREFUSED");
            if (attempt > this.maxRetries || !isNetworkOrTimeout) {
              logger.error(
                "HTTP",
                `Failed operation "${operationName}" after ${attempt} attempt(s): ${err instanceof Error ? err.message : String(err)}`
              );
              throw new PlumwareDownError(
                `Plumware gateway error during "${operationName}": ${err instanceof Error ? err.message : "Network failure"}`,
                { operation: operationName, attempts: attempt }
              );
            }
            const jitter = Math.floor(Math.random() * 150);
            const sleepMs = delay + jitter;
            logger.warn(
              "HTTP",
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
      async fetchLoginPage(jar) {
        const timeout = Math.min(this.timeoutMs, 7e3);
        const client = this.createSessionClient(jar, timeout);
        const response = await this.executeWithRetry(
          "fetchLoginPage",
          () => client.get("/plum5_fw_login.php", {
            headers: {
              Referer: `${this.baseURL}/student.htm`
            }
          })
        );
        return {
          html: response.data,
          statusCode: response.status
        };
      }
      /**
       * Downloads the binary JPEG CAPTCHA image using the exact session cookie jar.
       * Clamped to min(timeoutMs, 7000ms).
       */
      async fetchCaptchaBuffer(jar, captchaPath) {
        const timeout = Math.min(this.timeoutMs, 7e3);
        const client = this.createSessionClient(jar, timeout);
        const cleanPath = captchaPath.startsWith("/") ? captchaPath.slice(1) : captchaPath;
        const response = await this.executeWithRetry(
          "fetchCaptchaBuffer",
          () => client.get(`/${cleanPath}`, {
            responseType: "arraybuffer",
            headers: {
              Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
              Referer: `${this.baseURL}/plum5_fw_login.php`
            }
          })
        );
        const buffer = Buffer.from(response.data);
        const isJpeg = buffer.length > 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
        const isPng = buffer.length > 4 && buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71;
        const isGif = buffer.length > 3 && buffer[0] === 71 && buffer[1] === 73 && buffer[2] === 70;
        if (!isJpeg && !isPng && !isGif) {
          const preview = buffer.toString("utf8", 0, 120).replace(/\s+/g, " ").trim();
          logger.error("HTTP", `Upstream returned invalid non-image payload for CAPTCHA challenge: "${preview}"`);
          throw new PlumwareTripwireError(
            "Upstream gateway returned non-image payload for CAPTCHA challenge.",
            { preview, bufferLength: buffer.length }
          );
        }
        return buffer;
      }
      /**
       * Triggers a CAPTCHA regeneration script on the portal via AJAX endpoint.
       * Clamped to min(timeoutMs, 7000ms).
       */
      async refreshCaptchaScript(jar) {
        const timeout = Math.min(this.timeoutMs, 7e3);
        const client = this.createSessionClient(jar, timeout);
        const response = await this.executeWithRetry(
          "refreshCaptchaScript",
          () => client.get("/plum5_fw_utils.php?rty=captcha&typ=login", {
            headers: {
              "X-Requested-With": "XMLHttpRequest",
              Referer: `${this.baseURL}/plum5_fw_login.php`
            }
          })
        );
        return response.data;
      }
      /**
       * Submits student login credentials and CAPTCHA challenge via form POST.
       */
      async submitLogin(jar, formData) {
        const client = this.createSessionClient(jar);
        const formParams = new URLSearchParams(formData).toString();
        const response = await this.executeWithRetry(
          "submitLogin",
          () => client.post("/plum5_fw_login.php", formParams, {
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: `${this.baseURL}/plum5_fw_login.php`,
              Origin: "https://www.imsnsit.org",
              "Upgrade-Insecure-Requests": "1"
            }
          })
        );
        return {
          html: typeof response.data === "string" ? response.data : "",
          statusCode: response.status,
          location: response.headers["location"]
        };
      }
      /**
       * Executes an authenticated GET request against a protected portal route.
       */
      async fetchAuthenticatedPath(jar, pathName, referer = "student_index.htm") {
        const client = this.createSessionClient(jar);
        const cleanPath = pathName.startsWith("/") ? pathName.slice(1) : pathName;
        const response = await this.executeWithRetry(
          `fetchAuthPath:${cleanPath}`,
          () => client.get(`/${cleanPath}`, {
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: {
              Referer: `${this.baseURL}/${referer}`
            }
          })
        );
        return {
          html: typeof response.data === "string" ? response.data : "",
          statusCode: response.status,
          location: response.headers["location"]
        };
      }
    };
  }
});

// src/adapters/plumware/plumware_timetable_parser.ts
import * as cheerio from "cheerio";
var PlumwareTimetableParser;
var init_plumware_timetable_parser = __esm({
  "src/adapters/plumware/plumware_timetable_parser.ts"() {
    "use strict";
    init_timetable();
    init_logger();
    PlumwareTimetableParser = class {
      /** Standard NSUT 8-period fallback time matrix (24-hour clock) */
      static DEFAULT_TIME_SLOTS = [
        { start: "09:00", end: "10:00" },
        // Period 1
        { start: "10:00", end: "11:00" },
        // Period 2
        { start: "11:00", end: "12:00" },
        // Period 3
        { start: "12:00", end: "13:00" },
        // Period 4
        { start: "13:00", end: "14:00" },
        // Lunch / Period 5
        { start: "14:00", end: "15:00" },
        // Period 6
        { start: "15:00", end: "16:00" },
        // Period 7
        { start: "16:00", end: "17:00" }
        // Period 8
      ];
      /**
       * Normalizes arbitrary time header string (e.g., '9:00 - 10:00', '1:00 - 2:00 PM')
       * to standardized 24-hour HH:MM format.
       */
      static normalizeTimeString(raw, fallbackIndex = 0) {
        const clean = raw.replace(/\s+/g, " ").trim();
        const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(?:AM|PM)?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i;
        const match = clean.match(timeRegex);
        if (match) {
          let startH = parseInt(match[1], 10);
          const startM = match[2] ? match[2] : "00";
          let endH = parseInt(match[3], 10);
          const endM = match[4] ? match[4] : "00";
          const periodMeridiem = match[5]?.toUpperCase();
          if (startH >= 1 && startH <= 6 && !clean.toLowerCase().includes("am")) {
            startH += 12;
          }
          if (endH >= 1 && endH <= 6 && !clean.toLowerCase().includes("am")) {
            endH += 12;
          }
          if (periodMeridiem === "PM") {
            if (startH < 12) startH += 12;
            if (endH < 12) endH += 12;
          }
          const startTime = `${String(startH).padStart(2, "0")}:${startM}`;
          const endTime = `${String(endH).padStart(2, "0")}:${endM}`;
          return {
            startTime,
            endTime,
            label: `${startTime} - ${endTime}`
          };
        }
        const fallback = this.DEFAULT_TIME_SLOTS[fallbackIndex] || this.DEFAULT_TIME_SLOTS[this.DEFAULT_TIME_SLOTS.length - 1];
        return {
          startTime: fallback.start,
          endTime: fallback.end,
          label: `${fallback.start} - ${fallback.end}`
        };
      }
      /**
       * Normalizes day string to canonical DayOfWeek enum.
       */
      static parseDayOfWeek(raw) {
        const clean = raw.trim().toUpperCase();
        if (clean.startsWith("MON")) return "Monday";
        if (clean.startsWith("TUE")) return "Tuesday";
        if (clean.startsWith("WED")) return "Wednesday";
        if (clean.startsWith("THU")) return "Thursday";
        if (clean.startsWith("FRI")) return "Friday";
        if (clean.startsWith("SAT")) return "Saturday";
        return null;
      }
      /**
       * Helper to extract room/venue from session text.
       */
      static extractRoom(text) {
        const bracketMatch = text.match(/\[([^\]]+)\]/);
        if (bracketMatch) {
          return bracketMatch[1].trim();
        }
        const roomPattern = /\b(LT-?\s*\d+|Block-?\s*[A-Za-z\d]+(?:\s*(?:Room|Lab)?\s*\d+)?|Room\s*[-:]?\s*\d+|Lab\s*[-:]?\s*\d+|Mechanical\s+Shop)\b/i;
        const match = text.match(roomPattern);
        if (match) {
          return match[1].trim();
        }
        return "TBA";
      }
      /**
       * Helper to extract faculty name from session text.
       */
      static extractFaculty(text) {
        const titleMatch = text.match(/(?:Prof\.|Dr\.|Mr\.|Ms\.)\s+[A-Za-z\.]+(?:\s+[A-Za-z\.]+)?/i);
        if (titleMatch) {
          return titleMatch[0].trim();
        }
        const parenMatch = text.match(/\(([A-Za-z\.\s]+)\)/);
        if (parenMatch && !parenMatch[1].match(/^(L|P|T)$/i)) {
          return parenMatch[1].trim();
        }
        return "TBA";
      }
      /**
       * Parses a single session chunk where all tokens belong to one class.
       */
      static parseSingleSession(text) {
        const clean = text.trim();
        if (!clean || clean === "-" || clean === ".") return null;
        const upper = clean.toUpperCase();
        if (upper === "LUNCH" || upper === "BREAK" || upper === "RECESS" || upper === "SELF STUDY" || upper === "NO CLASSES SCHEDULED" || upper.includes("LIBRARY") || upper.includes("SPORTS") || upper.includes("MENTOR MENTEE")) {
          return null;
        }
        const codeMatch = clean.match(/\b([A-Z]{2,5}\d{2,5}[A-Z]?|WORKSHOP|SEMINAR|PROJECT)\b/i);
        if (!codeMatch) {
          return null;
        }
        const courseCode = codeMatch[1].toUpperCase();
        let component = "Lecture";
        if (upper.includes("(P)") || upper.includes("[P]") || upper.includes("LAB") || upper.includes("PRACTICAL")) {
          component = "Practical";
        } else if (upper.includes("(T)") || upper.includes("[T]") || upper.includes("TUT") || upper.includes("TUTORIAL")) {
          component = "Tutorial";
        } else if (upper.includes("(L)") || upper.includes("[L]") || upper.includes("LECTURE")) {
          component = "Lecture";
        }
        let group = "All";
        const groupMatch = clean.match(/\b(G[1-9]|Group\s*[-:]?\s*[1-9]|Batch\s*[-:]?\s*[A-Za-z\d]+)\b/i);
        if (groupMatch) {
          const rawGroup = groupMatch[1].toUpperCase().replace(/\s+/g, "");
          group = rawGroup.startsWith("GROUP") ? `G${rawGroup.replace("GROUP", "").replace(/[-:]/g, "")}` : rawGroup;
        }
        const room = this.extractRoom(clean);
        const faculty = this.extractFaculty(clean);
        return {
          courseCode,
          component,
          group,
          room,
          faculty,
          rawText: clean
        };
      }
      /**
       * Parses text within a timetable cell into structured RawTimeSlot sessions.
       * Splits multi-group concurrent blocks (e.g. G1: Physics / G2: OOP) into separate sessions.
       */
      static parseCellSessions(cellText) {
        const trimmed = cellText.trim();
        if (!trimmed || trimmed === "-" || trimmed === ".") {
          return [];
        }
        const upper = trimmed.toUpperCase();
        if (upper === "LUNCH" || upper === "BREAK" || upper === "RECESS" || upper === "SELF STUDY" || upper === "NO CLASSES SCHEDULED" || upper.includes("LIBRARY") || upper.includes("SPORTS") || upper.includes("MENTOR MENTEE")) {
          return [];
        }
        const groupMarkerRegex = /\b(G[1-9]|Group\s*[-:]?\s*[1-9]|Batch\s*[-:]?\s*[A-Za-z\d]+)\s*[:\-]/i;
        const hasGroupMarkers = groupMarkerRegex.test(trimmed);
        if (hasGroupMarkers) {
          const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
          let sharedCourseCode;
          let sharedComponent;
          let startIndex = 0;
          if (lines.length > 0 && !groupMarkerRegex.test(lines[0])) {
            const headerLine = lines[0];
            const codeMatch = headerLine.match(/\b([A-Z]{2,5}\d{2,5}[A-Z]?|WORKSHOP|SEMINAR|PROJECT)\b/i);
            if (codeMatch) {
              sharedCourseCode = codeMatch[1].toUpperCase();
            }
            const hdrUpper = headerLine.toUpperCase();
            if (hdrUpper.includes("(P)") || hdrUpper.includes("[P]") || hdrUpper.includes("LAB") || hdrUpper.includes("PRACTICAL")) {
              sharedComponent = "Practical";
            } else if (hdrUpper.includes("(T)") || hdrUpper.includes("[T]") || hdrUpper.includes("TUT") || hdrUpper.includes("TUTORIAL")) {
              sharedComponent = "Tutorial";
            } else if (hdrUpper.includes("(L)") || hdrUpper.includes("[L]") || hdrUpper.includes("LECTURE")) {
              sharedComponent = "Lecture";
            }
            startIndex = 1;
          }
          const groupChunks = [];
          for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes("/")) {
              const parts = line.split(/\s*\/\s*/).map((p) => p.trim()).filter((p) => p.length > 0);
              groupChunks.push(...parts);
            } else {
              groupChunks.push(line);
            }
          }
          const sessions = [];
          for (const chunk of groupChunks) {
            const match = chunk.match(/^(?:.*?\b)?(G[1-9]|Group\s*[-:]?\s*[1-9]|Batch\s*[-:]?\s*[A-Za-z\d]+)\s*[:\-]\s*(.*)$/i);
            if (!match) {
              continue;
            }
            const rawGroup = match[1].toUpperCase().replace(/\s+/g, "");
            const group = rawGroup.startsWith("GROUP") ? `G${rawGroup.replace("GROUP", "").replace(/[-:]/g, "")}` : rawGroup;
            const body = match[2].trim();
            const bodyUpper = body.toUpperCase();
            if (!body || body === "-" || body === "." || bodyUpper === "NIL" || bodyUpper === "FREE" || bodyUpper.startsWith("NO CLASS")) {
              continue;
            }
            const codeMatch = body.match(/\b([A-Z]{2,5}\d{2,5}[A-Z]?|WORKSHOP|SEMINAR|PROJECT)\b/i);
            const courseCode = codeMatch ? codeMatch[1].toUpperCase() : sharedCourseCode;
            if (!courseCode) {
              continue;
            }
            let component = sharedComponent || "Practical";
            if (bodyUpper.includes("(P)") || bodyUpper.includes("[P]") || bodyUpper.includes("LAB") || bodyUpper.includes("PRACTICAL")) {
              component = "Practical";
            } else if (bodyUpper.includes("(T)") || bodyUpper.includes("[T]") || bodyUpper.includes("TUT") || bodyUpper.includes("TUTORIAL")) {
              component = "Tutorial";
            } else if (bodyUpper.includes("(L)") || bodyUpper.includes("[L]") || bodyUpper.includes("LECTURE")) {
              component = "Lecture";
            }
            const room = this.extractRoom(body);
            const faculty = this.extractFaculty(body);
            sessions.push({
              courseCode,
              component,
              group,
              room,
              faculty,
              rawText: chunk
            });
          }
          if (sessions.length > 0) {
            return sessions;
          }
        }
        if (trimmed.includes("/")) {
          const segments = trimmed.split(/\s*\/\s*/).map((s) => s.trim()).filter((s) => s.length > 0);
          const sessions = [];
          for (const seg of segments) {
            const session = this.parseSingleSession(seg);
            if (session) {
              sessions.push(session);
            }
          }
          if (sessions.length > 0) {
            return sessions;
          }
        }
        const single = this.parseSingleSession(trimmed);
        return single ? [single] : [];
      }
      /**
       * Parses legacy Plumware HTML timetable using 2D grid de-merger algorithm.
       */
      static parseTimetable(html, options) {
        const $ = cheerio.load(html);
        const pageText = $("body").text();
        const academicYearMatch = pageText.match(/(?:Session|Year|Academic Session)\s*[-:]?\s*(\d{4}[-/]\d{2,4})/i);
        const programMatch = pageText.match(/(?:Program|Degree)\s*[-:]?\s*([A-Za-z\.\s]+?)(?:\||\n|<|$)/i);
        const branchMatch = pageText.match(/(?:Branch|Department)\s*[-:]?\s*([A-Za-z\s]+?)(?:\||\n|<|$)/i);
        const semesterMatch = pageText.match(/(?:Semester|Sem)\s*[-:]?\s*(\d)/i);
        const sectionMatch = pageText.match(/(?:Section|Sec)\s*[-:]?\s*([A-Za-z\d]+)/i);
        const academicYear = options?.academicYear || academicYearMatch?.[1] || "2026-27";
        const program = options?.program || programMatch?.[1]?.trim() || "B.Tech";
        const branch = options?.branch || branchMatch?.[1]?.trim() || "CSB";
        const semester = options?.semester || (semesterMatch ? parseInt(semesterMatch[1], 10) : 1);
        const section = options?.section || sectionMatch?.[1] || "1";
        let targetTable = null;
        let maxCols = -1;
        const tables = $("table");
        for (let i = 0; i < tables.length; i++) {
          const table = tables.eq(i);
          const headerCount = table.find("tr").first().find("th, td").length;
          if (headerCount >= 4 && headerCount > maxCols) {
            maxCols = headerCount;
            targetTable = table;
          }
        }
        if (!targetTable) {
          logger.warn("TIMETABLE", "Could not locate structured timetable table in HTML DOM.");
          return {
            academicYear,
            program,
            branch,
            semester,
            section,
            timeHeaders: [],
            grid: {
              Monday: [],
              Tuesday: [],
              Wednesday: [],
              Thursday: [],
              Friday: [],
              Saturday: []
            },
            allSlots: [],
            scrapedAt: Date.now()
          };
        }
        const rows = targetTable.find("tr");
        const timeHeaders = [];
        const firstRowCells = rows.first().find("th, td");
        let periodCounter = 0;
        for (let c = 0; c < firstRowCells.length; c++) {
          const cellText = $(firstRowCells[c]).text().trim();
          const lower = cellText.toLowerCase();
          if (lower.includes("day") || lower.includes("period") && lower.includes("day")) {
            continue;
          }
          const normalized = this.normalizeTimeString(cellText, periodCounter);
          timeHeaders.push({
            periodIndex: periodCounter,
            startTime: normalized.startTime,
            endTime: normalized.endTime,
            label: normalized.label
          });
          periodCounter++;
        }
        if (timeHeaders.length === 0) {
          for (let i = 0; i < this.DEFAULT_TIME_SLOTS.length; i++) {
            const slot = this.DEFAULT_TIME_SLOTS[i];
            timeHeaders.push({
              periodIndex: i,
              startTime: slot.start,
              endTime: slot.end,
              label: `${slot.start} - ${slot.end}`
            });
          }
        }
        const numPeriods = timeHeaders.length;
        const grid = {
          Monday: new Array(numPeriods).fill(null),
          Tuesday: new Array(numPeriods).fill(null),
          Wednesday: new Array(numPeriods).fill(null),
          Thursday: new Array(numPeriods).fill(null),
          Friday: new Array(numPeriods).fill(null),
          Saturday: new Array(numPeriods).fill(null)
        };
        const dayRowsList = [];
        const occupancyMap = {
          Monday: new Array(numPeriods).fill(false),
          Tuesday: new Array(numPeriods).fill(false),
          Wednesday: new Array(numPeriods).fill(false),
          Thursday: new Array(numPeriods).fill(false),
          Friday: new Array(numPeriods).fill(false),
          Saturday: new Array(numPeriods).fill(false)
        };
        const allSlots = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows.eq(r);
          const cells = row.find("td, th");
          if (cells.length === 0) continue;
          const firstCellText = cells.first().text();
          const currentDay = this.parseDayOfWeek(firstCellText);
          if (!currentDay) {
            continue;
          }
          dayRowsList.push(currentDay);
          const dayOccupancy = occupancyMap[currentDay];
          const dayGrid = grid[currentDay];
          let cellColPointer = 0;
          for (let cellIdx = 1; cellIdx < cells.length; cellIdx++) {
            while (cellColPointer < numPeriods && dayOccupancy[cellColPointer]) {
              cellColPointer++;
            }
            if (cellColPointer >= numPeriods) {
              break;
            }
            const cellEl = cells.eq(cellIdx);
            const colspan = Math.min(
              numPeriods - cellColPointer,
              parseInt(cellEl.attr("colspan") || "1", 10) || 1
            );
            const rowspan = parseInt(cellEl.attr("rowspan") || "1", 10) || 1;
            const cellClone = cellEl.clone();
            cellClone.find("br").replaceWith("\n");
            const cellText = cellClone.text().trim();
            const candidateSessions = this.parseCellSessions(cellText);
            if (candidateSessions.length > 0) {
              const startTime = timeHeaders[cellColPointer]?.startTime || "09:00";
              const endHeaderIdx = Math.min(numPeriods - 1, cellColPointer + colspan - 1);
              const endTime = timeHeaders[endHeaderIdx]?.endTime || "10:00";
              const slot = {
                day: currentDay,
                startTime,
                endTime,
                periodIndex: cellColPointer,
                spanHours: colspan,
                candidateSessions
              };
              allSlots.push(slot);
              for (let spanOffset = 0; spanOffset < colspan; spanOffset++) {
                const targetCol = cellColPointer + spanOffset;
                if (targetCol < numPeriods) {
                  dayGrid[targetCol] = slot;
                }
              }
            }
            for (let spanCol = 0; spanCol < colspan; spanCol++) {
              const targetCol = cellColPointer + spanCol;
              if (targetCol < numPeriods) {
                dayOccupancy[targetCol] = true;
                if (rowspan > 1) {
                  const currentDayIndex = DAYS_OF_WEEK.indexOf(currentDay);
                  for (let spanRow = 1; spanRow < rowspan; spanRow++) {
                    const nextDay = DAYS_OF_WEEK[currentDayIndex + spanRow];
                    if (nextDay && occupancyMap[nextDay]) {
                      occupancyMap[nextDay][targetCol] = true;
                    }
                  }
                }
              }
            }
            cellColPointer += colspan;
          }
        }
        logger.debug(
          "TIMETABLE",
          `Parsed master timetable: ${allSlots.length} slot entries across ${dayRowsList.length} days`
        );
        return {
          academicYear,
          program,
          branch,
          semester,
          section,
          timeHeaders,
          grid,
          allSlots,
          scrapedAt: Date.now()
        };
      }
    };
  }
});

// src/services/master_timetable.service.ts
var master_timetable_service_exports = {};
__export(master_timetable_service_exports, {
  MasterTimetableService: () => MasterTimetableService
});
import fs from "fs";
import path from "path";
var MasterTimetableService;
var init_master_timetable_service = __esm({
  "src/services/master_timetable.service.ts"() {
    "use strict";
    init_plumware_http_client();
    init_plumware_timetable_parser();
    init_logger();
    MasterTimetableService = class _MasterTimetableService {
      httpClient;
      cacheTtlSeconds;
      staleTtlSeconds;
      cache = /* @__PURE__ */ new Map();
      constructor(deps) {
        this.httpClient = deps?.httpClient || new PlumwareHttpClient();
        this.cacheTtlSeconds = deps?.cacheTtlSeconds || 7 * 24 * 3600;
        this.staleTtlSeconds = deps?.staleTtlSeconds || 24 * 3600;
      }
      /**
       * Generates deterministic cache key for master timetables.
       * Format: `timetable:master:{academicYear}:{program}:{branch}:{semester}:{section}`
       */
      static getCacheKey(academicYear, program, branch, semester, section) {
        return `timetable:master:${academicYear}:${program.toUpperCase()}:${branch.toUpperCase()}:${semester}:${section.toUpperCase()}`;
      }
      /**
       * Queries the master timetable for a given branch, semester, and section.
       * Returns from cache if available; otherwise scrapes and caches.
       */
      async getMasterTimetable(query, cookieJar) {
        const academicYear = "2026-27";
        const program = query.program || "B.Tech";
        const branch = query.branch.toUpperCase();
        const semester = query.semester || 1;
        const section = query.section || "1";
        const cacheKey = _MasterTimetableService.getCacheKey(
          academicYear,
          program,
          branch,
          semester,
          section
        );
        const cached = this.cache.get(cacheKey);
        const now = Date.now();
        if (cached && now < cached.expiresAt) {
          if (now > cached.staleAfter) {
            logger.info(
              "TIMETABLE",
              `SWR: Serving stale cached entry for ${cacheKey} and triggering background refresh`
            );
            void this.revalidateInBackground(
              { academicYear, program, branch, semester, section },
              cacheKey,
              cookieJar
            );
          } else {
            logger.debug("TIMETABLE", `Cache HIT for ${cacheKey}`);
          }
          return {
            ...cached.timetable,
            isCached: true
          };
        }
        logger.info("TIMETABLE", `Cache MISS for ${cacheKey}. Fetching master timetable...`);
        const timetable = await this.scrapeMasterTimetable(
          {
            academicYear,
            program,
            branch,
            semester,
            section
          },
          cookieJar
        );
        this.cache.set(cacheKey, {
          timetable,
          staleAfter: Date.now() + this.staleTtlSeconds * 1e3,
          expiresAt: Date.now() + this.cacheTtlSeconds * 1e3
        });
        return {
          ...timetable,
          isCached: false
        };
      }
      /**
       * Performs an on-demand re-sync and cache warming for a specific master timetable.
       */
      async syncMasterTimetable(payload, cookieJar) {
        const academicYear = payload.academicYear || "2026-27";
        const program = payload.program || "B.Tech";
        const branch = payload.branch.toUpperCase();
        const semester = payload.semester;
        const section = payload.section || "1";
        const cacheKey = _MasterTimetableService.getCacheKey(
          academicYear,
          program,
          branch,
          semester,
          section
        );
        logger.info("TIMETABLE", `Force re-syncing master timetable for ${cacheKey}`);
        const timetable = await this.scrapeMasterTimetable(
          {
            academicYear,
            program,
            branch,
            semester,
            section
          },
          cookieJar
        );
        this.cache.set(cacheKey, {
          timetable,
          staleAfter: Date.now() + this.staleTtlSeconds * 1e3,
          expiresAt: Date.now() + this.cacheTtlSeconds * 1e3
        });
        return {
          ...timetable,
          isCached: false
        };
      }
      /**
       * Asynchronous background revalidation for SWR cache hits.
       */
      async revalidateInBackground(params, cacheKey, cookieJar) {
        try {
          const fresh = await this.scrapeMasterTimetable(params, cookieJar);
          this.cache.set(cacheKey, {
            timetable: fresh,
            staleAfter: Date.now() + this.staleTtlSeconds * 1e3,
            expiresAt: Date.now() + this.cacheTtlSeconds * 1e3
          });
          logger.info("TIMETABLE", `SWR: Background revalidation succeeded for ${cacheKey}`);
        } catch (err) {
          logger.warn(
            "TIMETABLE",
            `SWR: Background revalidation failed for ${cacheKey}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      /**
       * Internal scraper routine: queries upstream portal or parses timetable DOM.
       */
      async scrapeMasterTimetable(params, cookieJar) {
        try {
          if (cookieJar) {
            const resp = await this.httpClient.fetchAuthenticatedPath(cookieJar, "student_timetable.php");
            if (resp.html && resp.html.includes("timetable")) {
              return PlumwareTimetableParser.parseTimetable(resp.html, params);
            }
          }
        } catch (err) {
          logger.warn(
            "TIMETABLE",
            `Upstream scrape failed, falling back to blueprint: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        return this.loadBlueprintTimetable(params);
      }
      /**
       * Loads high-fidelity standard timetable blueprint from repository fixtures.
       */
      loadBlueprintTimetable(params) {
        const prodResourcePath = path.resolve(
          process.cwd(),
          "src",
          "resources",
          "blueprints",
          "master_timetable_csb.html"
        );
        const distResourcePath = path.resolve(
          process.cwd(),
          "dist",
          "src",
          "resources",
          "blueprints",
          "master_timetable_csb.html"
        );
        const fixturePath = path.resolve(process.cwd(), "tests", "fixtures", "master_timetable_csb.html");
        let html = "";
        if (fs.existsSync(prodResourcePath)) {
          html = fs.readFileSync(prodResourcePath, "utf-8");
        } else if (fs.existsSync(distResourcePath)) {
          html = fs.readFileSync(distResourcePath, "utf-8");
        } else if (fs.existsSync(fixturePath)) {
          html = fs.readFileSync(fixturePath, "utf-8");
        } else {
          html = `
        <html><body>
          <table>
            <tr><th>Day</th><th>09:00 - 10:00</th><th>10:00 - 11:00</th></tr>
            <tr><td>Monday</td><td>${params.branch}101 (L) LT-1 Prof. A</td><td>${params.branch}102 (L) LT-2 Prof. B</td></tr>
          </table>
        </body></html>
      `;
        }
        return PlumwareTimetableParser.parseTimetable(html, params);
      }
      /**
       * Purges all cached timetable entries (for testing).
       */
      clearCache() {
        this.cache.clear();
      }
      /**
       * Returns total cached entries count.
       */
      get cacheSize() {
        return this.cache.size;
      }
    };
  }
});

// src/serverless.ts
import express2 from "express";

// src/app.ts
import express from "express";
import path2 from "path";
import fs2 from "fs";
import cors from "cors";
import helmet from "helmet";

// src/routes/index.ts
import { Router as Router4 } from "express";

// src/routes/auth.routes.ts
import { Router } from "express";

// src/middleware/validate_request.ts
init_errors();
import { ZodError } from "zod";
function validateRequest(schema, part = "body") {
  return async (req, _res, next) => {
    try {
      const parsed2 = await schema.parseAsync(req[part]);
      req[part] = parsed2;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = {};
        for (const err of error.issues) {
          const field = Array.isArray(err.path) && err.path.length > 0 ? err.path.join(".") : "root";
          formattedErrors[field] = err.message;
        }
        next(
          new RequestValidationError("Invalid request payload parameters", {
            validationErrors: formattedErrors
          })
        );
      } else {
        next(new RequestValidationError("Failed to validate request payload"));
      }
    }
  };
}

// src/middleware/rate_limiter.ts
init_logger();
var buckets = /* @__PURE__ */ new Map();
var cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 6e4);
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs ?? 6e4;
  const max = options.max ?? 30;
  const keyPrefix = options.keyPrefix ?? "rate";
  const keyGenerator = options.keyGenerator ?? ((req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "127.0.0.1";
    return ip;
  });
  return (req, res, next) => {
    const now = Date.now();
    const clientKey = `${keyPrefix}:${keyGenerator(req)}`;
    let bucket = buckets.get(clientKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 0,
        resetAt: now + windowMs
      };
      buckets.set(clientKey, bucket);
    }
    bucket.count++;
    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1e3);
    res.setHeader("RateLimit-Limit", max.toString());
    res.setHeader("RateLimit-Remaining", remaining.toString());
    res.setHeader("RateLimit-Reset", resetSeconds.toString());
    if (bucket.count > max) {
      res.setHeader("Retry-After", resetSeconds.toString());
      logger.warn("RATE_LIMIT", `Rate limit exceeded for [${clientKey}]: ${bucket.count}/${max} in ${windowMs}ms`);
      res.status(429).json({
        status: "error",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please slow down and try again later.",
        retryAfterSeconds: resetSeconds
      });
      return;
    }
    next();
  };
}
var sessionRateLimiter = createRateLimiter({
  windowMs: 6e4,
  max: 10,
  keyPrefix: "session"
});
var loginRateLimiter = createRateLimiter({
  windowMs: 6e4,
  max: 5,
  keyPrefix: "login"
});
var timetableRateLimiter = createRateLimiter({
  windowMs: 6e4,
  max: 30,
  keyPrefix: "timetable"
});
var studentRateLimiter = createRateLimiter({
  windowMs: 6e4,
  max: 20,
  keyPrefix: "student"
});

// src/types/auth.ts
import { z as z2 } from "zod";

// src/utils/crypto.ts
init_env();
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
var HMAC_SECRET = process.env.SESSION_SECRET || "ns-cognito-ephemeral-hmac-salt-2026";
function generateSignedSessionToken() {
  const rawId = randomUUID();
  const signature = createHmac("sha256", HMAC_SECRET).update(rawId).digest("hex").slice(0, 16);
  return `${rawId}.${signature}`;
}
function verifySessionTokenSignature(token) {
  if (!token || typeof token !== "string") {
    return false;
  }
  const parts = token.split(".");
  if (parts.length === 1) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return env.NODE_ENV !== "production" && uuidRegex.test(token);
  }
  if (parts.length !== 2) {
    return false;
  }
  const [rawId, signature] = parts;
  const expectedSignature = createHmac("sha256", HMAC_SECRET).update(rawId).digest("hex").slice(0, 16);
  const signatureBuffer = Buffer.from(signature, "utf-8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(signatureBuffer, expectedBuffer);
}

// src/types/auth.ts
var SessionTokenSchema = z2.string().min(10, { message: "Session token format invalid; token too short." }).refine(
  (val) => verifySessionTokenSignature(val),
  { message: "Invalid session token signature or unauthorized format." }
);
var LoginPayloadSchema = z2.object({
  sessionToken: SessionTokenSchema,
  rollNo: z2.string().min(3, { message: "Roll number must be at least 3 characters." }).max(30, { message: "Roll number cannot exceed 30 characters." }).transform((val) => val.trim().toUpperCase()),
  password: z2.string().min(1, { message: "Password is required." }),
  captchaText: z2.string().min(1, { message: "CAPTCHA security code is required." }).max(10, { message: "CAPTCHA security code cannot exceed 10 characters." }).transform((val) => val.trim())
});
var RefreshCaptchaSchema = z2.object({
  sessionToken: SessionTokenSchema
});

// src/routes/auth.routes.ts
function createAuthRouter(authController) {
  const router = Router();
  router.get("/session", sessionRateLimiter, authController.initSession);
  router.post("/login", loginRateLimiter, validateRequest(LoginPayloadSchema), authController.login);
  router.post(
    "/refresh-captcha",
    sessionRateLimiter,
    validateRequest(RefreshCaptchaSchema),
    authController.refreshCaptcha
  );
  return router;
}

// src/routes/student.routes.ts
import { Router as Router2 } from "express";
function createStudentRouter(studentController) {
  const router = Router2();
  router.use(studentRateLimiter);
  router.get("/attendance", studentController.getAttendance);
  router.get("/registered-courses", studentController.getRegisteredCourses);
  router.get("/dashboard", studentController.getDashboardProfile);
  router.post("/dashboard", studentController.getDashboardProfile);
  router.get("/schedule", studentController.getSchedule);
  router.post("/schedule", studentController.getSchedule);
  router.get("/forecast", studentController.getForecast);
  router.post("/forecast", studentController.getForecast);
  return router;
}

// src/routes/timetable.routes.ts
import { Router as Router3 } from "express";
function createTimetableRouter(timetableController) {
  const router = Router3();
  router.use(timetableRateLimiter);
  router.get("/query", timetableController.queryTimetable);
  router.get("/infer", timetableController.inferAcademicStanding);
  router.post("/sync", timetableController.syncTimetable);
  return router;
}

// src/services/upstream_monitor.service.ts
init_env();
init_logger();
import axios from "axios";
var UpstreamMonitorService = class {
  state = "healthy";
  lastCheckedAt = Date.now();
  latencyMs = 0;
  consecutiveFailures = 0;
  lastError = null;
  timer = null;
  targetUrl;
  constructor(targetUrl) {
    this.targetUrl = targetUrl || `${env.PLUMWARE_BASE_URL}/student.htm`;
  }
  /**
   * Executes a synthetic canary probe against Plumware ERP.
   */
  async checkHealth() {
    const startTime = Date.now();
    try {
      const response = await axios.get(this.targetUrl, {
        timeout: 5e3,
        validateStatus: (status) => status < 500,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NS-Cognito-Canary/1.0"
        }
      });
      this.latencyMs = Date.now() - startTime;
      this.lastCheckedAt = Date.now();
      this.lastError = null;
      if (response.status >= 400 || this.latencyMs > 3500) {
        this.state = "degraded";
        this.consecutiveFailures = 0;
      } else {
        this.state = "healthy";
        this.consecutiveFailures = 0;
      }
      logger.debug(
        "MONITOR",
        `Upstream canary probe OK: ${this.state} (${this.latencyMs}ms, status ${response.status})`
      );
    } catch (err) {
      this.latencyMs = Date.now() - startTime;
      this.lastCheckedAt = Date.now();
      this.consecutiveFailures++;
      this.lastError = err instanceof Error ? err.message : String(err);
      if (this.consecutiveFailures >= 2) {
        this.state = "offline";
      } else {
        this.state = "degraded";
      }
      logger.warn(
        "MONITOR",
        `Upstream canary probe FAILED (streak ${this.consecutiveFailures}): ${this.lastError} -> state=${this.state}`
      );
    }
    return this.getStatus();
  }
  /**
   * Returns current cached telemetry status without triggering an outbound network probe.
   */
  getStatus() {
    let message = "Upstream university portal (imsnsit.org) is responsive and operating normally.";
    if (this.state === "degraded") {
      message = "Upstream university portal is experiencing high latency or partial errors.";
    } else if (this.state === "offline") {
      message = "Upstream university portal is currently unreachable or rejecting connections.";
    }
    return {
      state: this.state,
      targetUrl: this.targetUrl,
      lastCheckedAt: this.lastCheckedAt,
      latencyMs: this.latencyMs,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
      message
    };
  }
  /**
   * Sets the simulated state (useful for testing degraded banners).
   */
  setMockState(state, error) {
    this.state = state;
    this.lastCheckedAt = Date.now();
    this.lastError = error || null;
  }
  /**
   * Starts background recurring probe (default: every 5 minutes).
   */
  start(intervalMs = 3e5) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.checkHealth();
    }, intervalMs);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }
  /**
   * Halts background recurring probe.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
};
var upstreamMonitor = new UpstreamMonitorService();

// src/services/telemetry_metrics.service.ts
init_upstream_traffic_gate();
var TelemetryMetricsService = class {
  startTime = Date.now();
  totalRequests = 0;
  statusCodes = {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0
  };
  /**
   * Tracks an incoming HTTP response status.
   */
  recordRequest(statusCode) {
    this.totalRequests++;
    if (statusCode >= 200 && statusCode < 300) {
      this.statusCodes["2xx"]++;
    } else if (statusCode >= 300 && statusCode < 400) {
      this.statusCodes["3xx"]++;
    } else if (statusCode >= 400 && statusCode < 500) {
      this.statusCodes["4xx"]++;
    } else if (statusCode >= 500) {
      this.statusCodes["5xx"]++;
    }
  }
  /**
   * Returns instantaneous performance snapshot.
   */
  getMetrics() {
    const mem = process.memoryUsage();
    return {
      node: {
        startTime: this.startTime,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
        nodeVersion: process.version,
        pid: process.pid
      },
      memory: {
        rssMb: +(mem.rss / (1024 * 1024)).toFixed(2),
        heapUsedMb: +(mem.heapUsed / (1024 * 1024)).toFixed(2),
        heapTotalMb: +(mem.heapTotal / (1024 * 1024)).toFixed(2),
        externalMb: +(mem.external / (1024 * 1024)).toFixed(2)
      },
      requests: {
        total: this.totalRequests,
        statusBreakdown: { ...this.statusCodes }
      },
      upstreamTrafficGate: {
        activeConcurrentRequests: upstreamTrafficGate.getActiveCount(),
        waitQueueLength: upstreamTrafficGate.getQueueLength()
      },
      upstreamCanary: upstreamMonitor.getStatus()
    };
  }
  /**
   * Resets metrics counters for testing.
   */
  reset() {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.statusCodes = {
      "2xx": 0,
      "3xx": 0,
      "4xx": 0,
      "5xx": 0
    };
  }
};
var telemetryMetrics = new TelemetryMetricsService();

// src/routes/index.ts
function createApiRouter(authController, studentController, timetableController) {
  const router = Router4();
  router.get("/health", authController.healthCheck);
  router.get("/health/upstream", (_req, res) => {
    res.json({
      status: "success",
      data: upstreamMonitor.getStatus()
    });
  });
  router.get("/health/metrics", (_req, res) => {
    res.json({
      status: "success",
      data: telemetryMetrics.getMetrics()
    });
  });
  const authRouter = createAuthRouter(authController);
  router.use("/v1/auth", authRouter);
  router.use("/auth", authRouter);
  const studentRouter = createStudentRouter(studentController);
  router.use("/v1/student", studentRouter);
  router.use("/student", studentRouter);
  const timetableRouter = createTimetableRouter(timetableController);
  router.use("/v1/timetable", timetableRouter);
  router.use("/timetable", timetableRouter);
  return router;
}

// src/controllers/auth.controller.ts
init_logger();
init_errors();
var AuthController = class {
  constructor(sessionEngine) {
    this.sessionEngine = sessionEngine;
  }
  sessionEngine;
  /**
   * GET /api/v1/auth/session
   * Spawns an isolated session cookie jar, fetches upstream Plumware tokens,
   * and returns the base64-encoded CAPTCHA challenge bound to this session.
   */
  initSession = async (_req, res, next) => {
    try {
      const data = await this.sessionEngine.initializeSession();
      res.status(200).json({
        status: "success",
        data
      });
    } catch (error) {
      const errCode = error?.code || error?.name || "HANDSHAKE_ERROR";
      const errMsg = error?.message || "Handshake failed";
      logger.error("AUTH", `[HANDSHAKE_FAILURE] Gateway handshake failed: ${errMsg}`, {
        code: errCode,
        statusCode: error?.statusCode || error?.status,
        stack: error?.stack,
        details: error?.details
      });
      if (errCode === "ERR_TLS_CERT_ALTNAME_INVALID" || errCode === "CERT_HAS_EXPIRED" || errCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || errCode === "DEPTH_ZERO_SELF_SIGNED_CERT" || errMsg.toLowerCase().includes("certificate") || errMsg.toLowerCase().includes("tls")) {
        res.status(502).json({
          status: "error",
          code: "TLS_HANDSHAKE_FAILED",
          message: `SSL/TLS handshake failure against university portal (${errCode}). Upstream certificate verification failed.`,
          details: { originalCode: errCode, message: errMsg }
        });
        return;
      }
      if (errCode === "ECONNREFUSED" || errCode === "ETIMEDOUT" || errCode === "ENOTFOUND" || errCode === "EHOSTUNREACH" || errCode === "ECONNRESET" || errMsg.toLowerCase().includes("econnrefused") || errMsg.toLowerCase().includes("enotfound")) {
        res.status(503).json({
          status: "error",
          code: "UPSTREAM_FIREWALL_OR_UNREACHABLE",
          message: `Failed to connect to imsnsit.org (${errCode}). Upstream portal may be blocking cloud datacenter IP ranges.`,
          details: { originalCode: errCode, message: errMsg }
        });
        return;
      }
      if (errCode === "UPSTREAM_TIMEOUT" || errCode === "ECONNABORTED" || errMsg.toLowerCase().includes("timeout")) {
        res.status(504).json({
          status: "error",
          code: "UPSTREAM_TIMEOUT",
          message: "University portal took too long to respond. Please retry.",
          details: { originalCode: errCode, message: errMsg }
        });
        return;
      }
      if (errCode === "REDIS_CONNECTION_ERROR" || errCode === "NR_CLOSED" || errMsg.toLowerCase().includes("redis")) {
        res.status(503).json({
          status: "error",
          code: "REDIS_CONNECTION_ERROR",
          message: `Session cache failure: Unable to establish connection to Redis cluster.`,
          details: { originalCode: errCode, message: errMsg }
        });
        return;
      }
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(502).json({
        status: "error",
        code: "HANDSHAKE_ERROR",
        message: `Unable to establish secure handshake with Plumware gateway: ${errMsg}`,
        details: { originalCode: errCode, message: errMsg }
      });
    }
  };
  /**
   * POST /api/v1/auth/login
   * Validates credentials and CAPTCHA challenge against Plumware ERP.
   */
  login = async (req, res, next) => {
    try {
      const payload = req.body;
      const data = await this.sessionEngine.authenticate(payload);
      res.status(200).json({
        status: "success",
        data
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * POST /api/v1/auth/refresh-captcha
   * Refreshes the CAPTCHA for an active unauthenticated session.
   */
  refreshCaptcha = async (req, res, next) => {
    try {
      const { sessionToken } = req.body;
      const data = await this.sessionEngine.refreshCaptcha(sessionToken);
      res.status(200).json({
        status: "success",
        data
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * GET /api/v1/health
   * Telemetry health check verifying engine status.
   */
  healthCheck = async (_req, res) => {
    res.status(200).json({
      status: "operational",
      engine: "NS Cognito Core Proxy",
      version: "1.0.1",
      build: {
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "21f804e",
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    });
  };
};

// src/services/timetable_inference.service.ts
init_errors();
init_logger();
var TimetableInferenceService = class {
  /**
   * Official NSUT Department and Branch Registry.
   */
  static BRANCH_REGISTRY = {
    // Computer Science & Specializations
    CB: { code: "CSB", name: "Computer Science & Business Systems", degree: "B.Tech", sections: 1 },
    CSB: { code: "CSB", name: "Computer Science & Business Systems", degree: "B.Tech", sections: 1 },
    CS: { code: "CSE", name: "Computer Science & Engineering", degree: "B.Tech", sections: 3 },
    CSE: { code: "CSE", name: "Computer Science & Engineering", degree: "B.Tech", sections: 3 },
    COE: { code: "COE", name: "Computer Engineering", degree: "B.Tech", sections: 3 },
    CA: { code: "CSAI", name: "Computer Science & Engineering (AI)", degree: "B.Tech", sections: 2 },
    CSAI: { code: "CSAI", name: "Computer Science & Engineering (AI)", degree: "B.Tech", sections: 2 },
    CI: { code: "CSIOT", name: "Computer Science & Engineering (IoT)", degree: "B.Tech", sections: 1 },
    CSIOT: { code: "CSIOT", name: "Computer Science & Engineering (IoT)", degree: "B.Tech", sections: 1 },
    DS: { code: "CSDS", name: "Computer Science & Engineering (Data Science)", degree: "B.Tech", sections: 1 },
    CSDS: { code: "CSDS", name: "Computer Science & Engineering (Data Science)", degree: "B.Tech", sections: 1 },
    // Information Technology
    IT: { code: "IT", name: "Information Technology", degree: "B.Tech", sections: 2 },
    ITNS: { code: "ITNS", name: "Information Technology (Network & Security)", degree: "B.Tech", sections: 1 },
    // Electronics & Communication
    EC: { code: "ECE", name: "Electronics & Communication Engineering", degree: "B.Tech", sections: 3 },
    ECE: { code: "ECE", name: "Electronics & Communication Engineering", degree: "B.Tech", sections: 3 },
    EI: { code: "ECAM", name: "Electronics & Communication (AI & ML)", degree: "B.Tech", sections: 1 },
    ECAM: { code: "ECAM", name: "Electronics & Communication (AI & ML)", degree: "B.Tech", sections: 1 },
    // Electrical & Instrumentation
    EE: { code: "EE", name: "Electrical Engineering", degree: "B.Tech", sections: 2 },
    IC: { code: "ICE", name: "Instrumentation & Control Engineering", degree: "B.Tech", sections: 2 },
    ICE: { code: "ICE", name: "Instrumentation & Control Engineering", degree: "B.Tech", sections: 2 },
    // Mechanical & Allied
    ME: { code: "ME", name: "Mechanical Engineering", degree: "B.Tech", sections: 2 },
    MEEV: { code: "MEEV", name: "Mechanical Engineering (EV)", degree: "B.Tech", sections: 1 },
    MP: { code: "MPAE", name: "Manufacturing Processes & Automation Engineering", degree: "B.Tech", sections: 1 },
    MPAE: { code: "MPAE", name: "Manufacturing Processes & Automation Engineering", degree: "B.Tech", sections: 1 },
    // Mathematics, Civil, Chemical, Biotech
    MC: { code: "MAC", name: "Mathematics & Computing", degree: "B.Tech", sections: 2 },
    MAC: { code: "MAC", name: "Mathematics & Computing", degree: "B.Tech", sections: 2 },
    BT: { code: "BT", name: "Biotechnology", degree: "B.Tech", sections: 1 },
    CE: { code: "CE", name: "Civil Engineering", degree: "B.Tech", sections: 1 },
    CH: { code: "CH", name: "Chemical Engineering", degree: "B.Tech", sections: 1 },
    GI: { code: "GI", name: "Geoinformatics", degree: "B.Tech", sections: 1 },
    DM: { code: "DES", name: "Design", degree: "B.Des", sections: 1 }
  };
  /**
   * Infers all academic parameters from a student's roll number and system date.
   *
   * NSUT Roll Syntax:
   *   `YYYY` (Admission Year, e.g. 2024)
   *   `U` | `P` | `D` (Level: Undergraduate / Postgraduate / Doctorate)
   *   `[A-Z]{2,4}` (Branch Code: CB, IT, EC, CS, etc.)
   *   `\d{3,5}` (Student Rank / Roll index)
   */
  static inferFromRollNumber(rawRollNo, referenceDate = /* @__PURE__ */ new Date(), options) {
    const clean = rawRollNo.trim().toUpperCase().replace(/[\s\-_]/g, "");
    const rollRegex = /^(\d{4})([UPD])([A-Z]{2,4})(\d{1,5})$/;
    const match = clean.match(rollRegex);
    if (options?.strict && !match) {
      throw new UnrecognizedRollError(
        `Unrecognized student roll number format: "${rawRollNo}". Expected NSUT pattern: <YYYY><Level><Branch><Roll>.`,
        { rollNo: rawRollNo }
      );
    }
    const admissionYear = match ? parseInt(match[1], 10) : referenceDate.getFullYear();
    const levelCode = match ? match[2] : "U";
    const rawBranchCode = match ? match[3] : "CSB";
    if (options?.strict && !this.BRANCH_REGISTRY[rawBranchCode]) {
      throw new UnrecognizedRollError(
        `Unrecognized NSUT department or branch code: "${rawBranchCode}" in roll number "${rawRollNo}".`,
        { branchCode: rawBranchCode, rollNo: rawRollNo }
      );
    }
    let program = "B.Tech";
    if (levelCode === "P") program = "M.Tech";
    if (levelCode === "D") program = "Ph.D";
    const branchMeta = this.BRANCH_REGISTRY[rawBranchCode] || {
      code: rawBranchCode,
      name: `${rawBranchCode} Engineering`,
      degree: program,
      sections: 1
    };
    const istDateStr = referenceDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istDateStr);
    const refYear = istDate.getFullYear();
    const refMonth = istDate.getMonth();
    const isOddTerm = refMonth >= 6;
    const isEvenSemester = !isOddTerm;
    const yearDelta = Math.max(0, refYear - admissionYear);
    let calculatedSemester;
    let academicYearStr;
    let termLabel;
    if (isOddTerm) {
      calculatedSemester = 2 * yearDelta + 1;
      const nextYearShort = String(refYear + 1).slice(-2);
      academicYearStr = `${refYear}-${nextYearShort}`;
      termLabel = `Monsoon (Odd) ${refYear}`;
    } else {
      calculatedSemester = Math.max(1, 2 * yearDelta);
      const prevYear = refYear - 1;
      const curYearShort = String(refYear).slice(-2);
      academicYearStr = `${prevYear}-${curYearShort}`;
      termLabel = `Winter (Even) ${refYear}`;
    }
    const currentSemester = Math.min(8, Math.max(1, calculatedSemester));
    const defaultSection = "1";
    logger.debug("INFERENCE", `Inferred academic standing for ${clean}`, {
      admissionYear,
      branch: branchMeta.code,
      semester: currentSemester,
      academicYear: academicYearStr
    });
    return {
      rollNo: clean,
      admissionYear,
      program,
      branchCode: branchMeta.code,
      branchName: branchMeta.name,
      currentSemester,
      academicYear: academicYearStr,
      defaultSection,
      isEvenSemester,
      termLabel
    };
  }
};

// src/services/schedule_resolver.service.ts
init_timetable();
init_logger();
var ScheduleResolver = class {
  /**
   * Resolves a master section timetable against a student's enrolled group profile.
   */
  static resolvePersonalizedSchedule(masterTimetable, groupProfile, options) {
    const rollNo = options?.rollNo || "UNKNOWN";
    const effectiveDefaultGroup = (options?.targetGroupOverride || groupProfile.defaultGroup || "G1").toUpperCase();
    const schedule = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: []
    };
    let totalClasses = 0;
    let lectureHours = 0;
    let practicalHours = 0;
    let tutorialHours = 0;
    for (const slot of masterTimetable.allSlots) {
      const matchingSession = this.selectMatchingSession(
        slot.candidateSessions,
        groupProfile,
        effectiveDefaultGroup
      );
      if (!matchingSession) {
        continue;
      }
      const durationHours = slot.spanHours || 1;
      const personalizedSlot = {
        startTime: slot.startTime,
        endTime: slot.endTime,
        periodIndex: slot.periodIndex,
        courseCode: matchingSession.courseCode,
        courseName: matchingSession.courseName || matchingSession.courseCode,
        component: matchingSession.component,
        group: matchingSession.group,
        room: matchingSession.room,
        faculty: matchingSession.faculty,
        spanHours: durationHours
      };
      schedule[slot.day].push(personalizedSlot);
      totalClasses += 1;
      if (matchingSession.component === "Lecture") {
        lectureHours += durationHours;
      } else if (matchingSession.component === "Practical") {
        practicalHours += durationHours;
      } else if (matchingSession.component === "Tutorial") {
        tutorialHours += durationHours;
      }
    }
    for (const day of DAYS_OF_WEEK) {
      schedule[day].sort((a, b) => {
        if (a.periodIndex !== b.periodIndex) {
          return a.periodIndex - b.periodIndex;
        }
        return a.startTime.localeCompare(b.startTime);
      });
    }
    logger.debug(
      "RESOLVER",
      `Resolved schedule for ${rollNo}: ${totalClasses} commitments (L: ${lectureHours}h, P: ${practicalHours}h, T: ${tutorialHours}h)`
    );
    return {
      rollNo,
      program: masterTimetable.program,
      branch: masterTimetable.branch,
      semester: masterTimetable.semester,
      section: masterTimetable.section,
      assignedGroup: effectiveDefaultGroup,
      schedule,
      totalWeeklyClasses: totalClasses,
      weeklyLectureHours: lectureHours,
      weeklyPracticalHours: practicalHours,
      weeklyTutorialHours: tutorialHours,
      resolvedAt: Date.now()
    };
  }
  /**
   * Normalizes group identifiers (e.g. 'T1', 'B1', 'Group 1' -> 'G1').
   */
  static normalizeGroup(group) {
    const clean = group.toUpperCase().replace(/\s+/g, "");
    if (clean.startsWith("GROUP")) return `G${clean.replace("GROUP", "").replace(/[-:]/g, "")}`;
    if (clean.startsWith("BATCH")) return `G${clean.replace("BATCH", "").replace(/[-:]/g, "")}`;
    if (/^[TB]\d+$/.test(clean)) return `G${clean.slice(1)}`;
    return clean;
  }
  /**
   * Filters candidate sessions for a time slot down to the session matching the student's group
   * and registered elective enrollments.
   */
  static selectMatchingSession(candidates, profile, effectiveDefaultGroup) {
    if (candidates.length === 0) return null;
    let eligibleCandidates = candidates;
    const distinctCourseCodes = new Set(candidates.map((c) => c.courseCode.toUpperCase()));
    const hasMultipleElectives = distinctCourseCodes.size > 1;
    if (hasMultipleElectives && profile.registeredCourses && profile.registeredCourses.length > 0) {
      const registeredCodes = new Set(
        profile.registeredCourses.map((rc) => rc.courseCode.toUpperCase())
      );
      eligibleCandidates = candidates.filter((c) => registeredCodes.has(c.courseCode.toUpperCase()));
      if (eligibleCandidates.length === 0) {
        return null;
      }
    }
    const normalizedDefaultGroup = this.normalizeGroup(effectiveDefaultGroup);
    for (const candidate of eligibleCandidates) {
      const candidateGroup = this.normalizeGroup(candidate.group);
      if (candidateGroup === "ALL" || candidate.component === "Lecture" && candidateGroup === "ALL") {
        return candidate;
      }
      const componentKey = `${candidate.courseCode}:${candidate.component.toUpperCase()}`;
      if (profile.componentGroups && profile.componentGroups[componentKey]) {
        const assignedGroup = this.normalizeGroup(profile.componentGroups[componentKey]);
        if (assignedGroup === candidateGroup || candidateGroup === "ALL") {
          return candidate;
        }
        continue;
      }
      if (profile.courseGroups && profile.courseGroups[candidate.courseCode]) {
        const assignedGroup = this.normalizeGroup(profile.courseGroups[candidate.courseCode]);
        if (assignedGroup === candidateGroup || candidateGroup === "ALL") {
          return candidate;
        }
        continue;
      }
      if (candidateGroup === normalizedDefaultGroup) {
        return candidate;
      }
    }
    if (candidates.length === 1 && candidates[0].component === "Lecture") {
      return candidates[0];
    }
    return null;
  }
};

// src/services/attendance_forecaster.service.ts
init_logger();
var AttendanceForecaster = class {
  /**
   * Generates a forward-looking attendance projection for a given calendar day.
   */
  static forecastDailyAttendance(subjects, schedule, options) {
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDayIndex = (/* @__PURE__ */ new Date()).getDay();
    const defaultDay = currentDayIndex >= 1 && currentDayIndex <= 6 ? dayNames[currentDayIndex - 1] : "Monday";
    const targetDay = options?.targetDay || defaultDay;
    const defaultAction = options?.defaultAction || "ATTEND";
    const customActions = options?.customActions || {};
    const todaySlots = schedule.schedule[targetDay] || [];
    const totalCommitmentsToday = todaySlots.length;
    const scheduledByCourse = /* @__PURE__ */ new Map();
    let totalScheduledHours = 0;
    for (const slot of todaySlots) {
      const code = slot.courseCode.toUpperCase();
      const hours = slot.spanHours && slot.spanHours > 0 ? slot.spanHours : 1;
      totalScheduledHours += hours;
      const existing = scheduledByCourse.get(code);
      if (existing) {
        existing.count += 1;
        existing.totalHours += hours;
      } else {
        scheduledByCourse.set(code, {
          count: 1,
          totalHours: hours,
          sampleName: slot.courseName || slot.courseCode
        });
      }
    }
    const subjectMap = /* @__PURE__ */ new Map();
    for (const sub of subjects) {
      subjectMap.set(sub.courseCode.toUpperCase(), sub);
    }
    const allCourseCodes = /* @__PURE__ */ new Set([
      ...subjectMap.keys(),
      ...scheduledByCourse.keys()
    ]);
    const projectedCourses = [];
    let currentTotalHeld = 0;
    let currentTotalPresent = 0;
    let projectedTotalHeld = 0;
    let projectedTotalPresent = 0;
    for (const code of allCourseCodes) {
      const subject = subjectMap.get(code);
      const scheduled = scheduledByCourse.get(code);
      const courseName = subject?.courseName || scheduled?.sampleName || code;
      const currentHeld = subject ? subject.totalClasses : 0;
      const currentPresent = subject ? subject.present : 0;
      const currentPercentage = subject ? subject.percentage : 100;
      const currentBunkMargin = subject ? subject.bunkMargin : 0;
      currentTotalHeld += currentHeld;
      currentTotalPresent += currentPresent;
      const classesScheduledToday = scheduled ? scheduled.count : 0;
      const totalWeightHours = scheduled ? scheduled.totalHours : 0;
      const action = customActions[code] || defaultAction;
      let deltaHeld = 0;
      let deltaPresent = 0;
      if (classesScheduledToday > 0) {
        if (action === "ATTEND") {
          deltaHeld = totalWeightHours;
          deltaPresent = totalWeightHours;
        } else if (action === "BUNK") {
          deltaHeld = totalWeightHours;
          deltaPresent = 0;
        } else {
          deltaHeld = 0;
          deltaPresent = 0;
        }
      }
      const projectedHeld = currentHeld + deltaHeld;
      const projectedPresent = currentPresent + deltaPresent;
      const projectedPercentage = this.computePercentage(projectedPresent, projectedHeld);
      const deltaPercentage = Number((projectedPercentage - currentPercentage).toFixed(2));
      const projectedBunkMargin = this.computeBunkMargin(projectedPresent, projectedHeld);
      const classesNeededFor75 = this.computeClassesNeeded(projectedPresent, projectedHeld);
      const status = this.classifyStatus(projectedPercentage);
      projectedTotalHeld += projectedHeld;
      projectedTotalPresent += projectedPresent;
      projectedCourses.push({
        courseCode: code,
        courseName,
        classesScheduledToday,
        totalWeightHours,
        action,
        currentHeld,
        currentPresent,
        currentPercentage,
        currentBunkMargin,
        projectedHeld,
        projectedPresent,
        projectedPercentage,
        projectedBunkMargin,
        classesNeededFor75,
        deltaPercentage,
        status
      });
    }
    projectedCourses.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
    const currentOverallPct = this.computePercentage(currentTotalPresent, currentTotalHeld);
    const currentOverallBunk = this.computeBunkMargin(currentTotalPresent, currentTotalHeld);
    const currentOverallStatus = this.classifyStatus(currentOverallPct);
    const projectedOverallPct = this.computePercentage(projectedTotalPresent, projectedTotalHeld);
    const projectedOverallBunk = this.computeBunkMargin(projectedTotalPresent, projectedTotalHeld);
    const projectedOverallDelta = Number((projectedOverallPct - currentOverallPct).toFixed(2));
    const projectedOverallStatus = this.classifyStatus(projectedOverallPct);
    logger.debug("FORECAST", `Generated attendance forecast for ${targetDay}: ${totalScheduledHours}h scheduled across ${totalCommitmentsToday} classes`, {
      currentOverallPct,
      projectedOverallPct
    });
    return {
      targetDay,
      totalCommitmentsToday,
      totalScheduledHours,
      courses: projectedCourses,
      currentOverall: {
        totalHeld: currentTotalHeld,
        totalPresent: currentTotalPresent,
        percentage: currentOverallPct,
        bunkMargin: currentOverallBunk,
        status: currentOverallStatus
      },
      projectedOverall: {
        totalHeld: projectedTotalHeld,
        totalPresent: projectedTotalPresent,
        percentage: projectedOverallPct,
        bunkMargin: projectedOverallBunk,
        deltaPercentage: projectedOverallDelta,
        status: projectedOverallStatus
      },
      forecastGeneratedAt: Date.now()
    };
  }
  /**
   * Helper computing strictly clamped, 2-decimal attendance percentage.
   */
  static computePercentage(present, held) {
    if (held <= 0) return 100;
    const raw = present / held * 100;
    const clamped = Math.min(100, Math.max(0, raw));
    return Number(clamped.toFixed(2));
  }
  /**
   * Helper computing safe bunk margin at 75% university threshold.
   * Formula: floor((4 * Present - 3 * Held) / 3)
   */
  static computeBunkMargin(present, held) {
    if (held <= 0) return 0;
    const margin = Math.floor((4 * present - 3 * held) / 3);
    return Math.max(0, margin);
  }
  /**
   * Helper computing classes needed to restore attendance to 75%.
   * Formula: ceil(3 * Held - 4 * Present)
   */
  static computeClassesNeeded(present, held) {
    if (held <= 0) return 0;
    const needed = Math.ceil(3 * held - 4 * present);
    return Math.max(0, needed);
  }
  /**
   * Categorizes attendance percentage into academic risk status.
   */
  static classifyStatus(percentage) {
    if (percentage >= 80) return "SAFE";
    if (percentage >= 75) return "WARNING";
    return "CRITICAL";
  }
};

// src/controllers/student.controller.ts
init_errors();
var StudentController = class {
  constructor(attendanceEngine, sessionEngine, masterTimetableService) {
    this.attendanceEngine = attendanceEngine;
    this.sessionEngine = sessionEngine;
    this.masterTimetableService = masterTimetableService;
  }
  attendanceEngine;
  sessionEngine;
  masterTimetableService;
  /**
   * Helper extracting sessionToken from headers or query parameters.
   */
  extractSessionToken(req) {
    const headerToken = req.headers["x-session-token"];
    const authHeader = req.headers["authorization"];
    let bearerToken;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      bearerToken = authHeader.slice(7).trim();
    }
    const queryToken = req.query["sessionToken"];
    const bodyToken = req.body?.["sessionToken"];
    const token = headerToken || bearerToken || queryToken || bodyToken;
    if (!token) {
      throw new RequestValidationError("Missing required sessionToken. Provide via x-session-token header or body.");
    }
    return token;
  }
  /**
   * GET /api/v1/student/attendance
   * Returns parsed attendance matrix, per-course metrics, bunk margins, and recovery projections.
   */
  getAttendance = async (req, res, next) => {
    try {
      const sessionToken = this.extractSessionToken(req);
      const data = await this.attendanceEngine.getStudentAttendance(sessionToken);
      res.status(200).json({
        status: "success",
        data
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * GET /api/v1/student/registered-courses
   * Returns student's registered courses and sub-batch group profile.
   */
  getRegisteredCourses = async (req, res, next) => {
    try {
      const sessionToken = this.extractSessionToken(req);
      const data = await this.attendanceEngine.getStudentGroupProfile(sessionToken);
      res.status(200).json({
        status: "success",
        data
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * POST or GET /api/v1/student/dashboard
   * Unified telemetry endpoint returning combined academic standing, attendance metrics, and group allocations.
   */
  getDashboardProfile = async (req, res, next) => {
    try {
      const sessionToken = this.extractSessionToken(req);
      const data = await this.attendanceEngine.getStudentAcademicProfile(sessionToken);
      res.status(200).json({
        status: "success",
        data
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * GET or POST /api/v1/student/schedule
   * Resolves the master section timetable against the student's sub-batch group assignments.
   */
  getSchedule = async (req, res, next) => {
    try {
      const sessionToken = this.extractSessionToken(req);
      let rollNo = "2024UCB1234";
      let cookieJar = void 0;
      if (this.sessionEngine) {
        const session = await this.sessionEngine.getAuthenticatedSession(sessionToken);
        rollNo = session.rollNo || rollNo;
        cookieJar = session.cookieJar;
      }
      const groupProfile = await this.attendanceEngine.getStudentGroupProfile(sessionToken);
      const inference = TimetableInferenceService.inferFromRollNumber(rollNo);
      let masterTimetable;
      if (this.masterTimetableService) {
        masterTimetable = await this.masterTimetableService.getMasterTimetable(
          {
            program: inference.program,
            branch: inference.branchCode,
            semester: inference.currentSemester,
            section: inference.defaultSection,
            group: groupProfile.defaultGroup || "All"
          },
          cookieJar
        );
      } else {
        const blueprintService = new (await Promise.resolve().then(() => (init_master_timetable_service(), master_timetable_service_exports))).MasterTimetableService();
        masterTimetable = await blueprintService.getMasterTimetable({
          program: inference.program,
          branch: inference.branchCode,
          semester: inference.currentSemester,
          section: inference.defaultSection,
          group: groupProfile.defaultGroup || "All"
        });
      }
      const personalizedSchedule = ScheduleResolver.resolvePersonalizedSchedule(
        masterTimetable,
        groupProfile,
        { rollNo }
      );
      res.status(200).json({
        status: "success",
        data: personalizedSchedule
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * GET or POST /api/v1/student/forecast
   * Simulates forward-looking attendance projections combining live matrix and personal schedule.
   */
  getForecast = async (req, res, next) => {
    try {
      const sessionToken = this.extractSessionToken(req);
      const academicProfile = await this.attendanceEngine.getStudentAcademicProfile(sessionToken);
      let rollNo = academicProfile.rollNo || "2024UCB1234";
      let cookieJar = void 0;
      if (this.sessionEngine) {
        const session = await this.sessionEngine.getAuthenticatedSession(sessionToken);
        rollNo = session.rollNo || rollNo;
        cookieJar = session.cookieJar;
      }
      const inference = TimetableInferenceService.inferFromRollNumber(rollNo);
      let masterTimetable;
      if (this.masterTimetableService) {
        masterTimetable = await this.masterTimetableService.getMasterTimetable(
          {
            program: inference.program,
            branch: inference.branchCode,
            semester: inference.currentSemester,
            section: inference.defaultSection,
            group: academicProfile.groupProfile.defaultGroup || "All"
          },
          cookieJar
        );
      } else {
        const blueprintService = new (await Promise.resolve().then(() => (init_master_timetable_service(), master_timetable_service_exports))).MasterTimetableService();
        masterTimetable = await blueprintService.getMasterTimetable({
          program: inference.program,
          branch: inference.branchCode,
          semester: inference.currentSemester,
          section: inference.defaultSection,
          group: academicProfile.groupProfile.defaultGroup || "All"
        });
      }
      const personalizedSchedule = ScheduleResolver.resolvePersonalizedSchedule(
        masterTimetable,
        academicProfile.groupProfile,
        { rollNo }
      );
      const payload = req.method === "POST" ? req.body : req.query;
      const forecast = AttendanceForecaster.forecastDailyAttendance(
        academicProfile.subjects,
        personalizedSchedule,
        payload
      );
      res.status(200).json({
        status: "success",
        data: forecast
      });
    } catch (error) {
      next(error);
    }
  };
};

// src/controllers/timetable.controller.ts
init_timetable();
var TimetableController = class {
  constructor(masterTimetableService) {
    this.masterTimetableService = masterTimetableService;
  }
  masterTimetableService;
  /**
   * GET /api/v1/timetable/query
   * Public universal timetable lookup with auto-inferred smart defaults.
   */
  queryTimetable = async (req, res, next) => {
    try {
      const query = TimetableQuerySchema.parse(req.query);
      let resolvedSemester = query.semester;
      if (!resolvedSemester) {
        const dummyInference = TimetableInferenceService.inferFromRollNumber(
          `2026U${query.branch.slice(0, 2)}1001`
        );
        resolvedSemester = dummyInference.currentSemester;
      }
      const masterTimetable = await this.masterTimetableService.getMasterTimetable({
        program: query.program,
        branch: query.branch,
        semester: resolvedSemester,
        section: query.section,
        group: query.group
      });
      let filteredSchedule = void 0;
      if (query.group && query.group.toUpperCase() !== "ALL") {
        const syntheticProfile = {
          defaultGroup: query.group,
          courseGroups: {},
          componentGroups: {},
          registeredCourses: []
        };
        filteredSchedule = ScheduleResolver.resolvePersonalizedSchedule(
          masterTimetable,
          syntheticProfile,
          { targetGroupOverride: query.group }
        );
      }
      res.status(200).json({
        status: "success",
        data: {
          queryMeta: {
            program: query.program,
            branch: query.branch,
            semester: resolvedSemester,
            section: query.section,
            group: query.group,
            isCached: masterTimetable.isCached ?? false
          },
          timetable: masterTimetable,
          filteredSchedule
        }
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * GET /api/v1/timetable/infer
   * Auto-infers academic standing, semester, branch, and defaults from a roll number.
   */
  inferAcademicStanding = async (req, res, next) => {
    try {
      const query = InferenceQuerySchema.parse(req.query);
      const inference = TimetableInferenceService.inferFromRollNumber(query.rollNo, /* @__PURE__ */ new Date(), {
        strict: true
      });
      res.status(200).json({
        status: "success",
        data: inference
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * POST /api/v1/timetable/sync
   * Forces re-sync and cache warming for a master section timetable.
   */
  syncTimetable = async (req, res, next) => {
    try {
      const payload = TimetableSyncPayloadSchema.parse(req.body);
      const timetable = await this.masterTimetableService.syncMasterTimetable(payload);
      res.status(200).json({
        status: "success",
        data: {
          message: "Master section timetable successfully synced and warmed in cache.",
          timetable
        }
      });
    } catch (error) {
      next(error);
    }
  };
};

// src/services/session_engine.service.ts
init_plumware_http_client();
import { CookieJar } from "tough-cookie";

// src/adapters/plumware/plumware_html_parser.ts
init_errors();
import * as cheerio2 from "cheerio";
var PlumwareHtmlParser = class {
  /**
   * Extracts essential authentication state tokens and CAPTCHA coordinates
   * from the Plumware login page markup.
   */
  static parseLoginForm(html) {
    const $ = cheerio2.load(html);
    const f = $('input[name="f"]').val()?.toString() || $("#f").val()?.toString() || "";
    const encFy = $('input[name="enc_fy"]').val()?.toString() || $("#enc_fy").val()?.toString() || "";
    let fy = $('select[name="fy"] option[selected]').val()?.toString() || $("#fy option[selected]").val()?.toString() || $('select[name="fy"] option').first().val()?.toString() || "";
    if (!fy) {
      const now = /* @__PURE__ */ new Date();
      const currentYear = now.getFullYear();
      const month = now.getMonth() + 1;
      const startYear = month >= 7 ? currentYear : currentYear - 1;
      const endYearShort = String(startYear + 1).slice(-2);
      fy = `${startYear}-${endYearShort}`;
    }
    const comp = $('input[name="comp"]').val()?.toString() || $("#comp").val()?.toString() || "NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY";
    const t = $('input[name="t"]').val()?.toString() || $("#t").val()?.toString() || "swx";
    const hrandNum = $('input[name="HRAND_NUM"]').val()?.toString() || $("#HRAND_NUM").val()?.toString() || String(Math.floor(Math.random() * 9e4) + 1e4);
    let captchaPath = $("#captchaimg").attr("src")?.trim() || $('img[src*="captcha"]').attr("src")?.trim() || "";
    if (!captchaPath) {
      const match = html.match(/(?:captchaimg['"]?\s*\.src\s*=\s*['"]|src=['"])(images\/captcha\/[^'"]+)/i);
      if (match && match[1]) {
        captchaPath = match[1];
      }
    }
    if (captchaPath.startsWith("/")) {
      captchaPath = captchaPath.slice(1);
    }
    if (!captchaPath) {
      throw new PlumwareTripwireError(
        "Unable to locate CAPTCHA image reference in Plumware login payload.",
        { preview: html.slice(0, 500) }
      );
    }
    return {
      encFy,
      fy,
      comp,
      t,
      hrandNum,
      captchaPath,
      f
    };
  }
  /**
   * Parses the JavaScript snippet returned by plum5_fw_utils.php?rty=captcha
   * Example snippet:
   * parent.frames['data'].document.getElementById('captchaimg').src='images/captcha/captcha_1791748832.jpg';
   */
  static parseCaptchaRefreshScript(scriptText) {
    const srcMatch = scriptText.match(/captchaimg[^=]*\.src\s*=\s*['"]([^'"]+)['"]/i) || scriptText.match(/['"](images\/captcha\/[^'"]+)['"]/i);
    const capMatch = scriptText.match(/originalcap[^=]*\.value\s*=\s*['"]([^'"]+)['"]/i);
    if (!srcMatch || !srcMatch[1]) {
      throw new PlumwareTripwireError(
        "Failed to parse updated CAPTCHA coordinates from Plumware refresh script.",
        { scriptSnippet: scriptText.slice(0, 300) }
      );
    }
    let captchaPath = srcMatch[1].trim();
    if (captchaPath.startsWith("/")) {
      captchaPath = captchaPath.slice(1);
    }
    return {
      captchaPath,
      originalCap: capMatch ? capMatch[1] : void 0
    };
  }
  /**
   * Classifies a login response into one of the canonical domain outcomes.
   */
  static classifyLoginResponse(html, _httpStatus, locationHeader) {
    const lowerHtml = html.toLowerCase();
    const targetUrl = locationHeader || "";
    if (lowerHtml.includes("invalid security number") || lowerHtml.includes("invalid security code") || lowerHtml.includes("please enter captcha")) {
      return {
        type: "INVALID_CAPTCHA",
        reason: "Plumware rejected the provided security code (CAPTCHA mismatch)."
      };
    }
    if (lowerHtml.includes("invalid login") || lowerHtml.includes("invalid userid") || lowerHtml.includes("please enter userid") || lowerHtml.includes("please enter password")) {
      return {
        type: "INVALID_CREDENTIALS",
        reason: "Plumware rejected the student credentials (Roll Number or Password)."
      };
    }
    if (lowerHtml.includes("access denied") || lowerHtml.includes("invalid attempt") || lowerHtml.includes("plum-security.gif")) {
      return {
        type: "ACCESS_DENIED",
        reason: "Plumware security tripwire activated (Access Denied / Invalid Attempt)."
      };
    }
    const successUrlPatterns = ["student_index", "student_home", "plum_menu", "middle_frame", "student_view"];
    const hasSuccessRedirect = successUrlPatterns.some((pattern) => targetUrl.toLowerCase().includes(pattern));
    if (hasSuccessRedirect || lowerHtml.includes("student_menu") || lowerHtml.includes("welcome to student") || lowerHtml.includes("logout.php") || lowerHtml.includes("current sem courses registered")) {
      return {
        type: "SUCCESS",
        targetUrl
      };
    }
    if (targetUrl.includes("plum5_fw_login.php?uid=")) {
      return {
        type: "INVALID_CREDENTIALS",
        reason: "Login failed with redirect back to login surface."
      };
    }
    return {
      type: "UNKNOWN",
      rawPreview: html.slice(0, 300)
    };
  }
};

// src/services/session_engine.service.ts
init_env();
init_logger();
init_errors();
var SessionEngineService = class {
  sessionStore;
  httpClient;
  constructor(deps) {
    this.sessionStore = deps.sessionStore;
    this.httpClient = deps.httpClient || new PlumwareHttpClient();
  }
  /**
   * Initializes a brand-new, isolated Plumware session lifecycle.
   * Fetches upstream tokens, binds the exact CAPTCHA buffer, and caches session state.
   */
  async initializeSession() {
    const sessionToken = generateSignedSessionToken();
    const cookieJar = new CookieJar();
    const createdAt = Date.now();
    logger.info("AUTH", `Initializing session ${sessionToken.slice(0, 8)}...`);
    const { html } = await this.httpClient.fetchLoginPage(cookieJar);
    const parsedForm = PlumwareHtmlParser.parseLoginForm(html);
    logger.debug("AUTH", `Extracted form tokens: fy=${parsedForm.fy}, captcha=${parsedForm.captchaPath}`);
    const captchaBuffer = await this.httpClient.fetchCaptchaBuffer(cookieJar, parsedForm.captchaPath);
    const captchaBase64 = `data:image/jpeg;base64,${captchaBuffer.toString("base64")}`;
    const sessionState = {
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
      expiresAt: createdAt + env.SESSION_TTL_SECONDS * 1e3,
      isAuthenticated: false
    };
    await this.sessionStore.set(sessionToken, sessionState, env.SESSION_TTL_SECONDS);
    logger.info(
      "AUTH",
      `Session ${sessionToken.slice(0, 8)}... primed (TTL: ${env.SESSION_TTL_SECONDS}s, CAPTCHA: ${captchaBuffer.length} bytes)`
    );
    return {
      sessionToken,
      captchaBase64,
      academicYear: parsedForm.fy,
      expiresInSeconds: env.SESSION_TTL_SECONDS,
      timestamp: createdAt
    };
  }
  /**
   * Refreshes the CAPTCHA image for an existing unauthenticated session
   * without requiring re-initialization of the whole session.
   */
  async refreshCaptcha(sessionToken) {
    const session = await this.sessionStore.get(sessionToken);
    if (!session) {
      throw new SessionExpiredError();
    }
    logger.info("AUTH", `Refreshing CAPTCHA challenge for session ${sessionToken.slice(0, 8)}...`);
    const scriptText = await this.httpClient.refreshCaptchaScript(session.cookieJar);
    const { captchaPath } = PlumwareHtmlParser.parseCaptchaRefreshScript(scriptText);
    const captchaBuffer = await this.httpClient.fetchCaptchaBuffer(session.cookieJar, captchaPath);
    const captchaBase64 = `data:image/jpeg;base64,${captchaBuffer.toString("base64")}`;
    await this.sessionStore.update(sessionToken, {
      captchaPath
    });
    return {
      sessionToken,
      captchaBase64,
      academicYear: session.fy,
      expiresInSeconds: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1e3)),
      timestamp: Date.now()
    };
  }
  /**
   * Verifies credentials against the legacy Plumware portal using the session's bound cookie jar.
   */
  async authenticate(payload) {
    const session = await this.sessionStore.get(payload.sessionToken);
    if (!session) {
      throw new SessionExpiredError();
    }
    if (session.isAuthenticated) {
      throw new SessionAlreadyUsedError(
        "Session has already been authenticated. Acquire a fresh session token to log in again."
      );
    }
    if (!session.captchaPath) {
      throw new SessionExpiredError("CAPTCHA challenge has already been consumed. Please refresh the CAPTCHA.");
    }
    await this.sessionStore.update(payload.sessionToken, {
      captchaPath: void 0
    });
    logger.info(
      "AUTH",
      `Submitting authentication handshake for Roll: ${payload.rollNo} (Session: ${session.sessionToken.slice(0, 8)}...)`
    );
    const formPayload = {
      uid: payload.rollNo,
      user_id: payload.rollNo,
      pwd: payload.password,
      password: payload.password,
      cap: payload.captchaText,
      security_code: payload.captchaText,
      f: session.f || "",
      enc_fy: session.encFy || "",
      fy: session.fy,
      comp: session.comp || "NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY",
      t: session.t || "swx",
      HRAND_NUM: session.hrandNum || "",
      login: "Login",
      Submit: "Login"
    };
    let html;
    let statusCode;
    let location;
    try {
      const res = await this.httpClient.submitLogin(session.cookieJar, formPayload);
      html = res.html;
      statusCode = res.statusCode;
      location = res.location;
    } catch (err) {
      await this.sessionStore.delete(payload.sessionToken);
      throw err;
    }
    const outcome = PlumwareHtmlParser.classifyLoginResponse(html, statusCode, location);
    logger.debug("AUTH", `Plumware login outcome classification: ${outcome.type}`);
    switch (outcome.type) {
      case "INVALID_CAPTCHA":
        await this.sessionStore.delete(payload.sessionToken);
        throw new InvalidCaptchaError(outcome.reason);
      case "INVALID_CREDENTIALS":
        await this.sessionStore.delete(payload.sessionToken);
        throw new InvalidCredentialsError(outcome.reason);
      case "ACCESS_DENIED":
        await this.sessionStore.delete(payload.sessionToken);
        throw new PlumwareTripwireError(outcome.reason, { location });
      case "SUCCESS": {
        const authenticatedAt = Date.now();
        const cookies = await session.cookieJar.getCookieString(env.PLUMWARE_BASE_URL);
        await this.sessionStore.update(payload.sessionToken, {
          isAuthenticated: true,
          rollNo: payload.rollNo,
          serializedCookies: cookies,
          f: void 0,
          encFy: void 0,
          comp: void 0,
          t: void 0,
          hrandNum: void 0,
          captchaPath: void 0
        });
        logger.info(
          "AUTH",
          `Handshake SUCCESS for Roll: ${payload.rollNo}. Authenticated session established.`
        );
        return {
          sessionToken: payload.sessionToken,
          rollNo: payload.rollNo,
          academicYear: session.fy,
          authenticatedAt,
          message: "Authentication successful. Upstream ERP session established."
        };
      }
      case "UNKNOWN":
      default:
        await this.sessionStore.delete(payload.sessionToken);
        logger.error("AUTH", "Unrecognized Plumware response signature", { preview: outcome.rawPreview });
        throw new PlumwareTripwireError(
          "Unrecognized response received from university portal during login.",
          { preview: outcome.rawPreview }
        );
    }
  }
  /**
   * Retrieves an active session state if authenticated.
   */
  async getAuthenticatedSession(sessionToken) {
    const session = await this.sessionStore.get(sessionToken);
    if (!session || !session.isAuthenticated) {
      throw new SessionExpiredError("Authenticated session has expired or is invalid.");
    }
    return session;
  }
};

// src/services/attendance_engine.service.ts
init_plumware_http_client();

// src/adapters/plumware/plumware_navigator.ts
init_errors();
init_logger();
import * as cheerio3 from "cheerio";
var PlumwareNavigator = class {
  /**
   * Scans an HTML frame (menu, sidebar, or dashboard) to extract encrypted dynamic URLs.
   */
  static extractNavigationLinks(html) {
    const $ = cheerio3.load(html);
    const rawLinks = {};
    let attendanceUrl;
    let registeredCoursesUrl;
    let timetableUrl;
    $("a").each((_, element) => {
      const el = $(element);
      const rawText = el.text().replace(/\s+/g, " ").trim();
      let href = el.attr("href")?.trim();
      if (!href || href === "#" || href.startsWith("javascript:")) {
        const onClick = el.attr("onclick") || "";
        const match = onClick.match(/['"](plum_url\.php\?[^'"]+)['"]/i);
        if (match && match[1]) {
          href = match[1];
        }
      }
      if (href && !href.startsWith("javascript:void") && href !== "#") {
        const cleanHref = href.startsWith("/") ? href.slice(1) : href;
        rawLinks[rawText] = cleanHref;
        const lowerText = rawText.toLowerCase();
        if (lowerText.includes("attendance") && !lowerText.includes("rule") && !lowerText.includes("policy")) {
          attendanceUrl = cleanHref;
        }
        if (lowerText.includes("registered") || lowerText.includes("registration") || lowerText.includes("course") && (lowerText.includes("reg") || lowerText.includes("list"))) {
          registeredCoursesUrl = cleanHref;
        }
        if (lowerText.includes("time table") || lowerText.includes("timetable") || lowerText.includes("class schedule")) {
          timetableUrl = cleanHref;
        }
      }
    });
    if (!attendanceUrl || !registeredCoursesUrl) {
      const scriptMatches = html.matchAll(/(['"][^'"]*attendance[^'"]*['"][\s\S]*?['"](plum_url\.php\?[^'"]+)['"])/gi);
      for (const match of scriptMatches) {
        if (!attendanceUrl && match[2]) {
          attendanceUrl = match[2];
        }
      }
    }
    logger.debug("NAV", "Extracted navigation routes", {
      attendanceUrl: attendanceUrl ? `${attendanceUrl.slice(0, 30)}...` : void 0,
      registeredCoursesUrl: registeredCoursesUrl ? `${registeredCoursesUrl.slice(0, 30)}...` : void 0,
      totalLinks: Object.keys(rawLinks).length
    });
    return {
      attendanceUrl,
      registeredCoursesUrl,
      timetableUrl,
      rawLinks
    };
  }
  /**
   * Evaluates response DOM and status code for security tripwires or session invalidation.
   */
  static verifyResponseIntegrity(html, httpStatus, locationHeader) {
    const lower = html.toLowerCase();
    const location = (locationHeader || "").toLowerCase();
    if (lower.includes("session expired") || lower.includes("please login again") || location.includes("student_login") || location.includes("student.htm")) {
      throw new SessionExpiredError(
        "Upstream Plumware session expired or was terminated during navigation."
      );
    }
    if (lower.includes("access denied!") || lower.includes("access denied") || lower.includes("invalid attempt") || lower.includes("plum-security.gif") || lower.includes("alert('access denied") || lower.includes('alert("access denied')) {
      throw new PortalDesyncError(
        "Plumware rejected the dynamic navigation token. Frame state or Referer desynchronization detected.",
        { preview: html.slice(0, 300), location }
      );
    }
    if (httpStatus >= 400) {
      throw new PlumwareTripwireError(
        `Upstream gateway returned HTTP ${httpStatus} during frame navigation.`,
        { httpStatus }
      );
    }
  }
};

// src/adapters/plumware/plumware_attendance_parser.ts
init_logger();
import * as cheerio4 from "cheerio";
var PlumwareAttendanceParser = class {
  /**
   * Parses raw token string from an individual table cell into standardized attendance metrics.
   */
  static parseCellToken(rawText) {
    const clean = rawText.trim().toUpperCase().replace(/\s+/g, "");
    if (!clean || clean === "-" || clean === "NA" || clean === "N/A" || clean === ".") {
      return {
        rawToken: rawText.trim(),
        classesHeld: 0,
        classesAttended: 0,
        isHoliday: false,
        isRescheduled: false
      };
    }
    if (clean === "GH" || clean === "GH+GH" || clean === "H" || clean === "HOLIDAY") {
      return {
        rawToken: rawText.trim(),
        classesHeld: 0,
        classesAttended: 0,
        isHoliday: true,
        isRescheduled: false
      };
    }
    if (clean === "CR" || clean === "CR+CR" || clean === "CANCELLED" || clean === "RESCHEDULED") {
      return {
        rawToken: rawText.trim(),
        classesHeld: 0,
        classesAttended: 0,
        isHoliday: false,
        isRescheduled: true
      };
    }
    if (clean.includes("+")) {
      const parts = clean.split("+");
      let held = 0;
      let attended = 0;
      let isHoliday = false;
      let isRescheduled = false;
      for (const part of parts) {
        if (part === "1") {
          held += 1;
          attended += 1;
        } else if (part === "0") {
          held += 1;
        } else if (part === "GH" || part === "H") {
          isHoliday = true;
        } else if (part === "CR") {
          isRescheduled = true;
        }
      }
      return {
        rawToken: rawText.trim(),
        classesHeld: held,
        classesAttended: attended,
        isHoliday,
        isRescheduled
      };
    }
    if (clean === "1" || clean === "P" || clean === "PRESENT") {
      return {
        rawToken: rawText.trim(),
        classesHeld: 1,
        classesAttended: 1,
        isHoliday: false,
        isRescheduled: false
      };
    }
    if (clean === "0" || clean === "A" || clean === "ABSENT") {
      return {
        rawToken: rawText.trim(),
        classesHeld: 1,
        classesAttended: 0,
        isHoliday: false,
        isRescheduled: false
      };
    }
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num >= 0 && num <= 2) {
      return {
        rawToken: rawText.trim(),
        classesHeld: num > 0 ? num : 1,
        classesAttended: num,
        isHoliday: false,
        isRescheduled: false
      };
    }
    return {
      rawToken: rawText.trim(),
      classesHeld: 0,
      classesAttended: 0,
      isHoliday: false,
      isRescheduled: false
    };
  }
  /**
   * Ingests the complex, irregular Plumware attendance HTML matrix table.
   */
  static parseAttendanceMatrix(html) {
    const $ = cheerio4.load(html);
    const footnotes = this.extractFootnotes($, html);
    let targetTable = null;
    let bestScore = -1;
    const tables = $("table");
    for (let i = 0; i < tables.length; i++) {
      const table = tables.eq(i);
      const text = table.text();
      let score = 0;
      if (text.includes("Total Classes") || text.includes("Total Present")) score += 5;
      if (text.match(/[A-Z]{2,4}\d{4}/)) score += 5;
      if (text.match(/\d{1,2}[-/][A-Za-z]{3}|\d{1,2}[-/]\d{1,2}/)) score += 3;
      if (score > bestScore) {
        bestScore = score;
        targetTable = table;
      }
    }
    if (!targetTable || bestScore <= 0) {
      logger.warn("PARSER", "Could not locate structured attendance table in Plumware payload.");
      return {
        courseHeaders: [],
        records: [],
        portalSummaries: {},
        footnotes
      };
    }
    const rows = targetTable.find("tr");
    const courseHeaders = [];
    const portalSummaries = {};
    const records = [];
    let headerRowIndex = -1;
    let dateColumnIndex = 0;
    let dayColumnIndex = -1;
    rows.each((rowIndex, row) => {
      if (headerRowIndex !== -1) return;
      const cells = $(row).find("th, td");
      const detectedHeaders = [];
      cells.each((colIndex, cell) => {
        const text = $(cell).text().trim();
        const codeMatch = text.match(/\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/);
        if (codeMatch) {
          const code = codeMatch[1];
          const title = $(cell).attr("title") || text.replace(code, "").replace(/[\(\)\-:]/g, " ").trim();
          detectedHeaders.push({
            code,
            name: title.length > 0 ? title : void 0,
            columnIndex: colIndex
          });
        } else if (text.toLowerCase() === "date" || text.toLowerCase().includes("date")) {
          dateColumnIndex = colIndex;
        } else if (text.toLowerCase() === "day") {
          dayColumnIndex = colIndex;
        }
      });
      if (detectedHeaders.length > 0) {
        headerRowIndex = rowIndex;
        courseHeaders.push(...detectedHeaders);
      }
    });
    rows.each((rowIndex, row) => {
      if (rowIndex <= headerRowIndex) return;
      const cells = $(row).find("td, th");
      if (cells.length === 0) return;
      const rowText = $(row).text().toLowerCase();
      const expandedCells = this.expandRowCells($, $(row));
      if (rowText.includes("total classes") || rowText.includes("total held")) {
        this.extractSummaryRowValues($, $(row), courseHeaders, portalSummaries, "held");
        return;
      }
      if (rowText.includes("total present") || rowText.includes("classes attended")) {
        this.extractSummaryRowValues($, $(row), courseHeaders, portalSummaries, "present");
        return;
      }
      if (rowText.includes("total absent") || rowText.includes("classes absent")) {
        this.extractSummaryRowValues($, $(row), courseHeaders, portalSummaries, "absent");
        return;
      }
      if (rowText.includes("percentage") || rowText.includes("%")) {
        return;
      }
      const dateCell = expandedCells[dateColumnIndex];
      const dateCellText = dateCell ? $(dateCell).text().trim() : "";
      const isDate = dateCellText.match(/\b\d{1,2}[-/](?:[A-Za-z]{3}|\d{1,2})[-/]?\d{0,4}\b/) || dateCellText.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{1,2}\b/i);
      if (!isDate) {
        return;
      }
      const dayCell = dayColumnIndex !== -1 ? expandedCells[dayColumnIndex] : void 0;
      const dayText = dayCell ? $(dayCell).text().trim() : void 0;
      const courseTokens = {};
      for (const header of courseHeaders) {
        const cell = expandedCells[header.columnIndex];
        const rawCellText = cell ? $(cell).text().trim() : "";
        courseTokens[header.code] = this.parseCellToken(rawCellText);
      }
      records.push({
        date: dateCellText,
        dayOfWeek: dayText,
        courseTokens,
        remarks: []
      });
    });
    logger.debug("PARSER", `Parsed attendance matrix: ${courseHeaders.length} subjects, ${records.length} date entries`);
    return {
      courseHeaders,
      records,
      portalSummaries,
      footnotes
    };
  }
  /**
   * Expands cells containing colspan into a flat normalized array aligned to column indices.
   */
  static expandRowCells($, row) {
    const expanded = [];
    row.find("th, td").each((_, cell) => {
      const el = $(cell);
      const colspan = parseInt(el.attr("colspan") || "1", 10) || 1;
      for (let i = 0; i < colspan; i++) {
        expanded.push(el);
      }
    });
    return expanded;
  }
  /**
   * Helper extracting reported values from summary row cells.
   */
  static extractSummaryRowValues($, row, headers, portalSummaries, type) {
    const cells = this.expandRowCells($, row);
    for (const header of headers) {
      if (!portalSummaries[header.code]) {
        portalSummaries[header.code] = { totalHeld: 0, totalPresent: 0, totalAbsent: 0 };
      }
      const cell = cells[header.columnIndex];
      if (cell) {
        const val = parseInt($(cell).text().trim(), 10);
        if (!isNaN(val)) {
          if (type === "held") portalSummaries[header.code].totalHeld = val;
          if (type === "present") portalSummaries[header.code].totalPresent = val;
          if (type === "absent") portalSummaries[header.code].totalAbsent = val;
        }
      }
    }
  }
  /**
   * Extracts footnote logs like: FCCS0102--->03-08-2026--->NA-CLASSES WERE NOT STARTED
   */
  static extractFootnotes($, html) {
    const remarks = [];
    const arrowMatches = html.matchAll(/([A-Z]{2,5}\d{3,5})--+>(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|[A-Za-z]{3}\s*\d{1,2})--+>([^\r\n<]+)/g);
    for (const match of arrowMatches) {
      remarks.push({
        courseCode: match[1],
        date: match[2],
        remarkText: match[3].trim()
      });
    }
    $("p, font, li").each((_, el) => {
      const text = $(el).text().trim();
      if (text.startsWith("*") || text.toLowerCase().startsWith("remarks:") || text.toLowerCase().startsWith("note:")) {
        if (!text.includes("--->")) {
          remarks.push({
            remarkText: text
          });
        }
      }
    });
    return remarks;
  }
  /**
   * Ingests the "Current Sem Courses Registered" view into structured group profiles.
   */
  static parseRegisteredCourses(html) {
    const $ = cheerio4.load(html);
    const registeredCourses = [];
    const courseGroups = {};
    const componentGroups = {};
    const groupFrequency = /* @__PURE__ */ new Map();
    let targetTable = null;
    let maxRows = -1;
    const tables = $("table");
    for (let i = 0; i < tables.length; i++) {
      const table = tables.eq(i);
      const text = table.text().toLowerCase();
      if (text.includes("course code") || text.includes("course title") || text.includes("batch") || text.includes("group")) {
        const rowCount = table.find("tr").length;
        if (rowCount > maxRows) {
          maxRows = rowCount;
          targetTable = table;
        }
      }
    }
    if (targetTable) {
      const rows = targetTable.find("tr");
      let codeCol = -1;
      let titleCol = -1;
      let typeCol = -1;
      let groupCol = -1;
      let creditsCol = -1;
      rows.each((_, row) => {
        const cells = $(row).find("th, td");
        if (codeCol === -1) {
          cells.each((idx, cell) => {
            const hText = $(cell).text().trim().toLowerCase();
            if (hText.includes("code") || hText.includes("sub code")) codeCol = idx;
            if (hText.includes("title") || hText.includes("name") || hText.includes("subject")) titleCol = idx;
            if (hText.includes("type") || hText.includes("comp")) typeCol = idx;
            if (hText.includes("group") || hText.includes("batch") || hText.includes("sec")) groupCol = idx;
            if (hText.includes("credit") || hText.includes("cr")) creditsCol = idx;
          });
          return;
        }
        if (cells.length > Math.max(codeCol, titleCol)) {
          const rawCode = $(cells[codeCol]).text().trim();
          const codeMatch = rawCode.match(/\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/);
          if (codeMatch) {
            const courseCode = codeMatch[1];
            const courseTitle = titleCol !== -1 ? $(cells[titleCol]).text().trim() : courseCode;
            const rawType = typeCol !== -1 ? $(cells[typeCol]).text().trim().toUpperCase() : "L";
            const rawGroup = groupCol !== -1 ? $(cells[groupCol]).text().trim() : "All";
            const creditsVal = creditsCol !== -1 ? parseFloat($(cells[creditsCol]).text().trim()) : void 0;
            let componentType = "LECTURE";
            if (rawType.startsWith("P") || rawType.includes("LAB") || rawType.includes("PRAC")) {
              componentType = "PRACTICAL";
            } else if (rawType.startsWith("T") || rawType.includes("TUT")) {
              componentType = "TUTORIAL";
            }
            const cleanGroup = rawGroup.length > 0 ? rawGroup : "All";
            registeredCourses.push({
              courseCode,
              courseTitle: courseTitle.length > 0 ? courseTitle : courseCode,
              componentType,
              group: cleanGroup,
              credits: !isNaN(creditsVal) ? creditsVal : void 0
            });
            courseGroups[courseCode] = cleanGroup;
            componentGroups[`${courseCode}:${componentType}`] = cleanGroup;
            if (componentType === "PRACTICAL" && cleanGroup !== "All") {
              groupFrequency.set(cleanGroup, (groupFrequency.get(cleanGroup) || 0) + 1);
            }
          }
        }
      });
    }
    let defaultGroup = "G1";
    let highestCount = 0;
    for (const [grp, count] of groupFrequency.entries()) {
      if (count > highestCount) {
        highestCount = count;
        defaultGroup = grp;
      }
    }
    if (highestCount === 0 && Object.keys(courseGroups).length > 0) {
      const firstNonAll = Object.values(courseGroups).find((g) => g !== "All");
      if (firstNonAll) defaultGroup = firstNonAll;
    }
    logger.debug("PARSER", `Parsed registered courses: ${registeredCourses.length} entries, default group: ${defaultGroup}`);
    return {
      defaultGroup,
      courseGroups,
      componentGroups,
      registeredCourses
    };
  }
};

// src/services/bunk_intelligence.service.ts
var BunkIntelligenceService = class {
  /** Mandatory university cutoff threshold */
  static CUTOFF_THRESHOLD = 0.75;
  /** Safe threshold boundary for green status */
  static SAFE_THRESHOLD = 0.8;
  /**
   * Computes attendance percentage safely to two decimal places.
   * If no classes have been conducted yet, defaults to 100.0%.
   */
  static computePercentage(present, held) {
    if (held <= 0) {
      return 100;
    }
    const raw = present / held * 100;
    return Math.round(raw * 100) / 100;
  }
  /**
   * Calculates the Safe Bunk Margin: how many upcoming consecutive classes
   * a student can skip without their attendance falling below 75%.
   *
   * Algebraic Proof:
   *   (Present) / (Held + b) >= 3/4
   *   <=> 4 * Present >= 3 * Held + 3 * b
   *   <=> 3 * b <= 4 * Present - 3 * Held
   *   <=> b <= (4 * Present - 3 * Held) / 3
   *   b_max = floor((4 * Present - 3 * Held) / 3)
   */
  static computeBunkMargin(present, held) {
    if (held <= 0) {
      return 0;
    }
    const diff = 4 * present - 3 * held;
    if (diff <= 0) {
      return 0;
    }
    return Math.floor(diff / 3);
  }
  /**
   * Calculates the Recovery Requirement: how many upcoming consecutive classes
   * a student must attend to restore attendance to at least 75%.
   *
   * Algebraic Proof:
   *   (Present + r) / (Held + r) >= 3/4
   *   <=> 4 * Present + 4 * r >= 3 * Held + 3 * r
   *   <=> r >= 3 * Held - 4 * Present
   *   Since Held and Present are integers, (3 * Held - 4 * Present) is an exact integer:
   *   r_min = max(0, 3 * Held - 4 * Present)
   */
  static computeClassesNeeded(present, held) {
    if (held <= 0) {
      return 0;
    }
    const needed = 3 * held - 4 * present;
    if (needed <= 0) {
      return 0;
    }
    return needed;
  }
  /**
   * Categorizes academic standing into SAFE, WARNING, or CRITICAL.
   */
  static classifyStatus(percentage) {
    if (percentage >= this.SAFE_THRESHOLD * 100) {
      return "SAFE";
    }
    if (percentage >= this.CUTOFF_THRESHOLD * 100) {
      return "WARNING";
    }
    return "CRITICAL";
  }
  /**
   * Performs an independent arithmetic audit comparing daily cell sums
   * against the portal's reported bottom summary rows.
   */
  static auditIntegrity(calculated, portalReported) {
    const fallbackReported = portalReported || { ...calculated };
    const heldDelta = calculated.totalHeld - fallbackReported.totalHeld;
    const presentDelta = calculated.totalPresent - fallbackReported.totalPresent;
    const absentDelta = calculated.totalAbsent - fallbackReported.totalAbsent;
    const hasDiscrepancy = heldDelta !== 0 || presentDelta !== 0 || absentDelta !== 0;
    let warningMessage;
    if (hasDiscrepancy) {
      warningMessage = `Portal summary mismatch: Portal reported ${fallbackReported.totalHeld} held / ${fallbackReported.totalPresent} present, but sum of dates yields ${calculated.totalHeld} held / ${calculated.totalPresent} present.`;
    }
    return {
      portalReported: fallbackReported,
      calculatedSum: calculated,
      delta: {
        heldDelta,
        presentDelta,
        absentDelta
      },
      hasDiscrepancy,
      warningMessage
    };
  }
  /**
   * Computes normalized attendance telemetry for a single course.
   */
  static processSubject(metrics) {
    const { courseCode, courseName, totalHeld, totalPresent, totalAbsent, portalReportedSummary, remarks } = metrics;
    const percentage = this.computePercentage(totalPresent, totalHeld);
    const bunkMargin = this.computeBunkMargin(totalPresent, totalHeld);
    const classesNeededFor75 = this.computeClassesNeeded(totalPresent, totalHeld);
    const status = this.classifyStatus(percentage);
    const integrityAudit = this.auditIntegrity(
      { totalHeld, totalPresent, totalAbsent },
      portalReportedSummary
    );
    return {
      courseCode,
      courseName: courseName || courseCode,
      totalClasses: totalHeld,
      present: totalPresent,
      absent: totalAbsent,
      percentage,
      bunkMargin,
      classesNeededFor75,
      status,
      remarks: remarks || [],
      integrityAudit
    };
  }
  /**
   * Calculates subjects and overall summary directly from parsed matrix date records.
   */
  static processMatrix(courseHeaders, records, portalReportedSummaries, footnotes) {
    const subjectMetricsMap = /* @__PURE__ */ new Map();
    for (const header of courseHeaders) {
      subjectMetricsMap.set(header.code, { held: 0, present: 0, absent: 0 });
    }
    for (const record of records) {
      for (const [courseCode, token] of Object.entries(record.courseTokens)) {
        const metrics = subjectMetricsMap.get(courseCode);
        if (metrics) {
          metrics.held += token.classesHeld;
          metrics.present += token.classesAttended;
          metrics.absent += token.classesHeld - token.classesAttended;
        }
      }
    }
    const subjects = [];
    for (const header of courseHeaders) {
      const metrics = subjectMetricsMap.get(header.code) || { held: 0, present: 0, absent: 0 };
      const reportedSummary = portalReportedSummaries ? portalReportedSummaries[header.code] : void 0;
      const courseRemarks = footnotes ? footnotes.filter((f) => !f.courseCode || f.courseCode === header.code) : [];
      const subject = this.processSubject({
        courseCode: header.code,
        courseName: header.name || header.code,
        totalHeld: metrics.held,
        totalPresent: metrics.present,
        totalAbsent: metrics.absent,
        portalReportedSummary: reportedSummary,
        remarks: courseRemarks
      });
      subjects.push(subject);
    }
    const overallSummary = this.calculateOverallSummary(subjects);
    return {
      subjects,
      overallSummary
    };
  }
  /**
   * Synthesizes overall aggregate attendance metrics across all enrolled courses.
   */
  static calculateOverallSummary(subjects) {
    let totalHeld = 0;
    let totalPresent = 0;
    let totalAbsent = 0;
    for (const subject of subjects) {
      totalHeld += subject.totalClasses;
      totalPresent += subject.present;
      totalAbsent += subject.absent;
    }
    const overallPercentage = this.computePercentage(totalPresent, totalHeld);
    const overallBunkMargin = this.computeBunkMargin(totalPresent, totalHeld);
    const overallClassesNeededFor75 = this.computeClassesNeeded(totalPresent, totalHeld);
    const status = this.classifyStatus(overallPercentage);
    return {
      totalHeld,
      totalPresent,
      totalAbsent,
      overallPercentage,
      overallBunkMargin,
      overallClassesNeededFor75,
      status
    };
  }
};

// src/services/attendance_engine.service.ts
init_errors();
init_logger();
var AttendanceEngineService = class {
  sessionStore;
  httpClient;
  constructor(deps) {
    this.sessionStore = deps.sessionStore;
    this.httpClient = deps.httpClient || new PlumwareHttpClient();
  }
  /**
   * Retrieves, parses, and normalizes the student's live attendance matrix and bunk metrics.
   */
  async getStudentAttendance(sessionToken) {
    const session = await this.sessionStore.get(sessionToken);
    if (!session || !session.isAuthenticated) {
      throw new SessionExpiredError("Authenticated session has expired or is invalid.");
    }
    logger.info("ATTENDANCE", `Fetching live attendance for Roll: ${session.rollNo}`);
    try {
      const menuResp = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, "student_index.htm");
      PlumwareNavigator.verifyResponseIntegrity(menuResp.html, menuResp.statusCode, menuResp.location);
      const navLinks = PlumwareNavigator.extractNavigationLinks(menuResp.html);
      let attendanceUrl = navLinks.attendanceUrl;
      if (!attendanceUrl) {
        const fallbackMenu = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, "student_menu.php");
        const fallbackLinks = PlumwareNavigator.extractNavigationLinks(fallbackMenu.html);
        attendanceUrl = fallbackLinks.attendanceUrl;
      }
      if (!attendanceUrl) {
        throw new PlumwareTripwireError(
          'Unable to locate dynamic "My Attendance" route in student dashboard frame.'
        );
      }
      logger.debug("ATTENDANCE", `Requesting attendance matrix at: ${attendanceUrl.slice(0, 40)}...`);
      const attendanceResp = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, attendanceUrl);
      PlumwareNavigator.verifyResponseIntegrity(
        attendanceResp.html,
        attendanceResp.statusCode,
        attendanceResp.location
      );
      const parsed2 = PlumwareAttendanceParser.parseAttendanceMatrix(attendanceResp.html);
      const { subjects, overallSummary } = BunkIntelligenceService.processMatrix(
        parsed2.courseHeaders,
        parsed2.records,
        parsed2.portalSummaries,
        parsed2.footnotes
      );
      logger.info(
        "ATTENDANCE",
        `Processed attendance for ${subjects.length} course(s). Overall percentage: ${overallSummary.overallPercentage}% (${overallSummary.status})`
      );
      return {
        subjects,
        overallSummary,
        records: parsed2.records
      };
    } catch (err) {
      if (err instanceof SessionExpiredError || err instanceof PlumwareTripwireError) {
        logger.warn(
          "ATTENDANCE",
          `Session ${sessionToken.slice(0, 8)} purged due to upstream rejection: ${err instanceof Error ? err.message : String(err)}`
        );
        await this.sessionStore.delete(sessionToken);
      }
      throw err;
    }
  }
  /**
   * Retrieves and parses the student's sub-group assignments from "Current Sem Courses Registered".
   */
  async getStudentGroupProfile(sessionToken) {
    const session = await this.sessionStore.get(sessionToken);
    if (!session || !session.isAuthenticated) {
      throw new SessionExpiredError("Authenticated session has expired or is invalid.");
    }
    logger.info("GROUPS", `Extracting registered course groups for Roll: ${session.rollNo}`);
    try {
      const menuResp = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, "student_index.htm");
      PlumwareNavigator.verifyResponseIntegrity(menuResp.html, menuResp.statusCode, menuResp.location);
      const navLinks = PlumwareNavigator.extractNavigationLinks(menuResp.html);
      let registeredCoursesUrl = navLinks.registeredCoursesUrl;
      if (!registeredCoursesUrl) {
        const fallbackMenu = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, "student_menu.php");
        const fallbackLinks = PlumwareNavigator.extractNavigationLinks(fallbackMenu.html);
        registeredCoursesUrl = fallbackLinks.registeredCoursesUrl;
      }
      if (!registeredCoursesUrl) {
        throw new PlumwareTripwireError(
          'Unable to locate dynamic "Current Sem Courses Registered" route in student dashboard.'
        );
      }
      const coursesResp = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, registeredCoursesUrl);
      PlumwareNavigator.verifyResponseIntegrity(
        coursesResp.html,
        coursesResp.statusCode,
        coursesResp.location
      );
      const groupProfile = PlumwareAttendanceParser.parseRegisteredCourses(coursesResp.html);
      logger.info(
        "GROUPS",
        `Identified default group "${groupProfile.defaultGroup}" across ${groupProfile.registeredCourses.length} enrolled component(s)`
      );
      return groupProfile;
    } catch (err) {
      if (err instanceof SessionExpiredError || err instanceof PlumwareTripwireError) {
        logger.warn(
          "GROUPS",
          `Session ${sessionToken.slice(0, 8)} purged due to upstream rejection: ${err instanceof Error ? err.message : String(err)}`
        );
        await this.sessionStore.delete(sessionToken);
      }
      throw err;
    }
  }
  /**
   * Atomic Aggregator: Fetches attendance metrics and course group mappings in parallel,
   * synthesizing a complete student academic profile.
   */
  async getStudentAcademicProfile(sessionToken) {
    const session = await this.sessionStore.get(sessionToken);
    if (!session || !session.isAuthenticated) {
      throw new SessionExpiredError("Authenticated session has expired or is invalid.");
    }
    const [attendanceData, groupProfile] = await Promise.all([
      this.getStudentAttendance(sessionToken),
      this.getStudentGroupProfile(sessionToken)
    ]);
    return {
      rollNo: session.rollNo || "UNKNOWN",
      academicYear: session.fy,
      overallSummary: attendanceData.overallSummary,
      subjects: attendanceData.subjects,
      groupProfile,
      attendanceRecords: attendanceData.records,
      lastUpdated: Date.now()
    };
  }
};

// src/app.ts
init_master_timetable_service();

// src/adapters/cache/memory_session_store.ts
init_logger();
var MemorySessionStore = class {
  store = /* @__PURE__ */ new Map();
  reaperTimer = null;
  constructor(reaperIntervalMs = 3e4) {
    this.reaperTimer = setInterval(() => {
      this.reapExpired();
    }, reaperIntervalMs);
    if (this.reaperTimer.unref) {
      this.reaperTimer.unref();
    }
  }
  async set(sessionToken, state, ttlSeconds) {
    const expiresAt = Date.now() + ttlSeconds * 1e3;
    this.store.set(sessionToken, {
      state: {
        ...state,
        expiresAt
      },
      expiresAt
    });
    logger.debug("STORE", `Session ${sessionToken.slice(0, 8)}... stored with TTL ${ttlSeconds}s`);
  }
  async get(sessionToken) {
    const entry = this.store.get(sessionToken);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionToken);
      logger.debug("STORE", `Session ${sessionToken.slice(0, 8)}... expired on access and purged`);
      return null;
    }
    return entry.state;
  }
  async delete(sessionToken) {
    return this.store.delete(sessionToken);
  }
  async update(sessionToken, updates) {
    const entry = this.store.get(sessionToken);
    if (!entry) {
      return;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionToken);
      return;
    }
    entry.state = {
      ...entry.state,
      ...updates
    };
  }
  /**
   * Scans and purges all records that have exceeded their expiration threshold.
   */
  reapExpired() {
    const now = Date.now();
    let purgedCount = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        purgedCount++;
      }
    }
    if (purgedCount > 0) {
      logger.debug("STORE", `Reaped ${purgedCount} expired session(s) from memory store`);
    }
  }
  async destroy() {
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
    }
    this.store.clear();
  }
  /**
   * Returns current active entry count for diagnostics and telemetry.
   */
  get size() {
    return this.store.size;
  }
};

// src/adapters/cache/redis_session_store.ts
import { Redis } from "ioredis";
import { CookieJar as CookieJar2 } from "tough-cookie";
init_env();
init_logger();
var RedisSessionStore = class {
  client = null;
  fallbackStore;
  keyPrefix;
  defaultTtlSeconds;
  isDestroyed = false;
  constructor(options) {
    this.keyPrefix = options?.keyPrefix || "cognito:session:";
    this.defaultTtlSeconds = options?.defaultTtlSeconds || 180;
    this.fallbackStore = new MemorySessionStore();
    if (options?.client) {
      this.client = options.client;
    } else {
      const url = options?.redisUrl || env.REDIS_URL;
      const isTls = url.startsWith("rediss://");
      const redisOptions = {
        maxRetriesPerRequest: 2,
        connectTimeout: 4e3,
        enableReadyCheck: false,
        lazyConnect: true,
        // Lazy connect avoids blocking lambda cold-starts or unhandled exceptions
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 100, 1e3);
        }
      };
      if (isTls) {
        redisOptions.tls = {
          rejectUnauthorized: env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false"
        };
      }
      try {
        const client = new Redis(url, redisOptions);
        client.on("error", (err) => {
          logger.warn(
            "REDIS",
            `Cloud Redis connection warning: ${err instanceof Error ? err.message : String(err)}. Falling back to in-memory cache.`
          );
        });
        client.on("connect", () => {
          logger.info("REDIS", "Connected to Cloud Redis session store successfully");
        });
        this.client = client;
      } catch (err) {
        logger.warn(
          "REDIS",
          `Failed to instantiate Redis client (${err instanceof Error ? err.message : String(err)}). Seamlessly running in-memory session cache.`
        );
        this.client = null;
      }
    }
  }
  getKey(sessionToken) {
    return `${this.keyPrefix}${sessionToken}`;
  }
  /**
   * Stores a session state object with a strict Time-To-Live in seconds.
   * Serializes the CookieJar losslessly including domain, path, secure, httpOnly, and expires.
   */
  async set(sessionToken, state, ttlSeconds) {
    if (this.isDestroyed) return;
    const key = this.getKey(sessionToken);
    const effectiveTtl = ttlSeconds !== void 0 && ttlSeconds > 0 ? ttlSeconds : this.defaultTtlSeconds;
    const cookieJarSerialized = state.cookieJar ? state.cookieJar.toJSON() : null;
    const payload = {
      sessionToken: state.sessionToken,
      cookieJarSerialized,
      serializedCookies: state.serializedCookies,
      encFy: state.encFy,
      fy: state.fy,
      comp: state.comp,
      t: state.t,
      hrandNum: state.hrandNum,
      captchaPath: state.captchaPath,
      createdAt: state.createdAt,
      expiresAt: state.expiresAt || Date.now() + effectiveTtl * 1e3,
      isAuthenticated: state.isAuthenticated,
      rollNo: state.rollNo
    };
    if (!this.client) {
      await this.fallbackStore.set(sessionToken, state, effectiveTtl);
      return;
    }
    try {
      await this.client.set(key, JSON.stringify(payload), "EX", effectiveTtl);
      logger.debug(
        "REDIS",
        `Session ${sessionToken.slice(0, 8)}... stored with strict TTL ${effectiveTtl}s in Cloud Redis`
      );
    } catch (redisErr) {
      logger.warn(
        "REDIS",
        `Cloud Redis set failed (${redisErr instanceof Error ? redisErr.message : String(redisErr)}); falling back to ephemeral in-memory cache`,
        { sessionToken: sessionToken.slice(0, 8) }
      );
      await this.fallbackStore.set(sessionToken, state, effectiveTtl);
    }
  }
  /**
   * Retrieves an active session state by token.
   * Deserializes the CookieJar to an active tough-cookie instance.
   */
  async get(sessionToken) {
    if (this.isDestroyed) return null;
    const key = this.getKey(sessionToken);
    if (this.client) {
      try {
        const data = await this.client.get(key);
        if (data) {
          const parsed2 = JSON.parse(data);
          let cookieJar;
          if (parsed2.cookieJarSerialized) {
            cookieJar = CookieJar2.deserializeSync(parsed2.cookieJarSerialized);
          } else {
            cookieJar = new CookieJar2();
          }
          const state = {
            sessionToken: parsed2.sessionToken,
            cookieJar,
            encFy: parsed2.encFy,
            fy: parsed2.fy,
            comp: parsed2.comp,
            t: parsed2.t,
            hrandNum: parsed2.hrandNum,
            captchaPath: parsed2.captchaPath,
            createdAt: parsed2.createdAt,
            expiresAt: parsed2.expiresAt,
            isAuthenticated: Boolean(parsed2.isAuthenticated),
            rollNo: parsed2.rollNo,
            serializedCookies: parsed2.serializedCookies
          };
          return state;
        }
      } catch (err) {
        logger.warn(
          "REDIS",
          `Error querying Cloud Redis for session ${sessionToken.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}. Checking in-memory fallback.`
        );
      }
    }
    return await this.fallbackStore.get(sessionToken);
  }
  /**
   * Deletes a session immediately from both Redis and in-memory store.
   */
  async delete(sessionToken) {
    if (this.isDestroyed) return false;
    const key = this.getKey(sessionToken);
    let deletedRedis = false;
    if (this.client) {
      try {
        const deleted = await this.client.del(key);
        deletedRedis = deleted > 0;
      } catch {
      }
    }
    const deletedFallback = await this.fallbackStore.delete(sessionToken);
    return deletedRedis || deletedFallback;
  }
  /**
   * Updates an existing session state while preserving TTL.
   */
  async update(sessionToken, updates) {
    if (this.isDestroyed) return;
    const key = this.getKey(sessionToken);
    const existing = await this.get(sessionToken);
    if (!existing) return;
    if (this.client) {
      try {
        const remainingTtl = await this.client.ttl(key);
        if (remainingTtl > 0) {
          const merged = {
            ...existing,
            ...updates,
            cookieJar: updates.cookieJar || existing.cookieJar
          };
          await this.set(sessionToken, merged, remainingTtl);
          return;
        }
      } catch {
        logger.warn("REDIS", "Redis update failed; updating in-memory fallback");
      }
    }
    await this.fallbackStore.update(sessionToken, updates);
  }
  /**
   * Pings Redis to verify connectivity (used by readiness probes).
   */
  async ping() {
    if (!this.client) return false;
    try {
      const pong = await this.client.ping();
      return pong === "PONG";
    } catch {
      return false;
    }
  }
  /**
   * Cleanly closes the Redis connection and destroys fallback store.
   */
  async destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    if (this.client) {
      try {
        await this.client.quit();
        logger.info("REDIS", "Cloud Redis session connection closed cleanly");
      } catch {
        this.client.disconnect();
      }
    }
    await this.fallbackStore.destroy();
  }
};

// src/adapters/cache/index.ts
init_env();
init_logger();
var sharedStore = null;
function createSessionStore(forceNew = false) {
  if (sharedStore && !forceNew && env.NODE_ENV !== "test") {
    return sharedStore;
  }
  const shouldUseRedis = env.SESSION_STORE_TYPE === "redis" || Boolean(process.env.REDIS_URL) && !process.env.REDIS_URL?.includes("localhost:6379") || process.env.VERCEL === "1" && Boolean(process.env.REDIS_URL);
  if (shouldUseRedis) {
    logger.info("STORE", "Initialized Cloud Redis session store (Stateless / TLS enabled)");
    const store2 = new RedisSessionStore();
    if (!forceNew && env.NODE_ENV !== "test") {
      sharedStore = store2;
    }
    return store2;
  }
  if (process.env.VERCEL === "1") {
    logger.warn(
      "STORE",
      "Running on Vercel without a remote REDIS_URL configured! Falling back to ephemeral MemorySessionStore. Multi-instance session sharing requires REDIS_URL (e.g. Upstash Redis)."
    );
  } else {
    logger.info("STORE", "Initialized structured MemorySessionStore with automatic 30s reaper");
  }
  const store = new MemorySessionStore();
  if (!forceNew && env.NODE_ENV !== "test") {
    sharedStore = store;
  }
  return store;
}

// src/app.ts
init_plumware_http_client();

// src/middleware/request_logger.ts
init_logger();
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;
    telemetryMetrics.recordRequest(statusCode);
    logger.info("HTTP", `${method} ${originalUrl} -> ${statusCode} [${duration}ms]`);
  });
  next();
}

// src/middleware/error_handler.ts
init_errors();
init_logger();
import { ZodError as ZodError2 } from "zod";
function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    logger.warn("ERROR", `[${err.code}] ${err.message}`, err.details);
    res.status(err.statusCode).json(err.toJSON());
    return;
  }
  if (err instanceof ZodError2) {
    const formattedErrors = {};
    for (const issue of err.issues) {
      const field = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : "root";
      formattedErrors[field] = issue.message;
    }
    const appError = new RequestValidationError("Invalid request payload parameters", {
      validationErrors: formattedErrors
    });
    logger.warn("ERROR", `[${appError.code}] ${appError.message}`, appError.details);
    res.status(appError.statusCode).json(appError.toJSON());
    return;
  }
  logger.error("CRASH", `Unhandled internal server error: ${err.message}`, {
    stack: err.stack
  });
  res.status(500).json({
    status: "error",
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected internal error occurred within the proxy engine."
  });
}

// src/app.ts
function createApp() {
  const app2 = express();
  app2.use(helmet());
  const allowedOrigins = [
    "https://nscognito.vercel.app",
    process.env.CORS_ORIGIN,
    process.env.APP_URL,
    ...process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"] : []
  ].filter(Boolean);
  app2.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (origin.endsWith(".vercel.app")) {
          return callback(null, true);
        }
        if (process.env.NODE_ENV !== "production" && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-session-token", "Cookie", "X-Requested-With"],
      exposedHeaders: ["Set-Cookie"]
    })
  );
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  app2.use((_req, res, next) => {
    const originalCookie = res.cookie.bind(res);
    res.cookie = (name, val, options = {}) => {
      const hardenedOptions = {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        ...options
      };
      return originalCookie(name, val, hardenedOptions);
    };
    next();
  });
  app2.use((req, _res, next) => {
    if (!req.url.startsWith("/api") && !req.url.startsWith("/health")) {
      const isApiRoute = req.url.startsWith("/v1") || req.url.startsWith("/auth") || req.url.startsWith("/student") || req.url.startsWith("/timetable");
      if (isApiRoute) {
        req.url = `/api${req.url}`;
      }
    }
    next();
  });
  app2.use(express.json({ limit: "1mb" }));
  app2.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app2.use(requestLogger);
  const sessionStore = createSessionStore();
  const httpClient = new PlumwareHttpClient();
  const sessionEngine = new SessionEngineService({
    sessionStore,
    httpClient
  });
  const attendanceEngine = new AttendanceEngineService({
    sessionStore,
    httpClient
  });
  const masterTimetableService = new MasterTimetableService({
    httpClient
  });
  const authController = new AuthController(sessionEngine);
  const studentController = new StudentController(
    attendanceEngine,
    sessionEngine,
    masterTimetableService
  );
  const timetableController = new TimetableController(masterTimetableService);
  app2.get("/health/live", (_req, res) => {
    res.status(200).json({
      status: "alive",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: Date.now()
    });
  });
  app2.get("/health/ready", async (_req, res) => {
    try {
      await sessionStore.get("readiness-probe-check");
      res.status(200).json({
        status: "ready",
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
        upstreamStatus: upstreamMonitor.getStatus().state
      });
    } catch (err) {
      res.status(503).json({
        status: "not_ready",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  app2.use(
    "/api",
    createApiRouter(authController, studentController, timetableController)
  );
  const clientDist = path2.resolve(process.cwd(), "dist/client");
  if (fs2.existsSync(clientDist)) {
    app2.use(express.static(clientDist));
    app2.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) {
        return res.sendFile(path2.join(clientDist, "index.html"));
      }
      next();
    });
  }
  app2.use((_req, res) => {
    res.status(404).json({
      status: "error",
      code: "ROUTE_NOT_FOUND",
      message: "The requested endpoint was not found on this telemetry node."
    });
  });
  app2.use(errorHandler);
  return {
    app: app2,
    sessionStore,
    sessionEngine,
    attendanceEngine,
    masterTimetableService,
    upstreamMonitor,
    telemetryMetrics
  };
}

// src/serverless.ts
init_logger();
var appInstance;
var initError = null;
process.on("unhandledRejection", (reason) => {
  logger.error("SERVERLESS", "Trapped unhandled promise rejection in serverless runtime", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : void 0
  });
});
try {
  const initialized = createApp();
  appInstance = initialized.app;
  logger.info("SERVERLESS", "NS Cognito Serverless Function handler primed for Vercel deployment");
} catch (err) {
  initError = err instanceof Error ? err : new Error(String(err));
  appInstance = express2();
  logger.error("SERVERLESS", `Critical startup error during module initialization: ${initError.message}`, {
    stack: initError.stack
  });
}
function handler(req, res) {
  if (initError) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        status: "error",
        code: "SERVERLESS_INITIALIZATION_ERROR",
        message: "The telemetry engine encountered a fatal initialization error.",
        details: {
          error: initError.message,
          name: initError.name
        }
      })
    );
    return;
  }
  try {
    appInstance(req, res, (err) => {
      if (err && !res.headersSent) {
        const statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            status: "error",
            code: err.code || "UNHANDLED_GATEWAY_ERROR",
            message: err.message || "An unhandled gateway execution failure occurred."
          })
        );
      }
    });
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "error",
          code: "SERVERLESS_UNCAUGHT_EXCEPTION",
          message: err instanceof Error ? err.message : String(err)
        })
      );
    }
  }
}
var app = appInstance;
export {
  app,
  handler as default
};
