# VERCEL DEPLOYMENT MIGRATION & RUNTIME ADAPTATION REPORT

**Target Production Domain:** `https://nscognito.vercel.app`  
**Execution Status:** PASSED (17 Test Suites, 158 Tests Passed, 0 TypeScript Errors)  
**Deployment Topology:** Serverless Edge Functions + Static Asset CDN

---

## 1. Executive Summary

In accordance with the **Vercel Deployment Migration Directive**, the runtime layer of **NS Cognito** has been refactored and hardened for deployment onto Vercel's serverless architecture.

All process-bound Node.js dependencies (`app.listen()`, persistent worker intervals) have been isolated, and an enterprise stateless session adapter powered by Cloud Redis with TLS (`rediss://`) and lossless `tough-cookie` serialization has been implemented. Scraping network requests against `imsnsit.org` are bounded to 8500ms to eliminate platform-level 504 timeouts, and strict Swiss security headers and CORS policies targeting `https://nscognito.vercel.app` have been enforced.

```
                    ┌────────────────────────────────────────────────────────┐
                    │            Vercel Edge Network (CDN & WAF)             │
                    │               https://nscognito.vercel.app             │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     │                                                     │
             Static UI Requests                                    API Requests
          (/, /dashboard, /assets/*)                              (/api/*, /health/*)
                     │                                                     │
                     ▼                                                     ▼
     ┌───────────────────────────────┐                     ┌───────────────────────────────┐
     │   Static Asset CDN Delivery   │                     │  Vercel Serverless Function   │
     │      dist/client/index.html   │                     │         api/index.ts          │
     │   Immutable Cache (1 Year)    │                     │   (Node 20, 1024MB, 15s Max)  │
     └───────────────────────────────┘                     └───────────────┬───────────────┘
                                                                           │
                                            ┌──────────────────────────────┴──────────────────────────────┐
                                            │                                                             │
                                            ▼                                                             ▼
                             ┌──────────────────────────────┐                              ┌──────────────────────────────┐
                             │ Upstash / Cloud Redis (TLS)  │                              │    Upstream Plumware ERP     │
                             │   rediss://... (Port 6379)   │                              │        (imsnsit.org)         │
                             │  • Lossless Cookie Jar JSON  │                              │  • Strict 8500ms Timeout     │
                             │  • Strict 180s Ephemeral TTL │                              │  • UpstreamTimeoutError 504  │
                             └──────────────────────────────┘                              └──────────────────────────────┘
```

---

## 2. Scope of Deliverables & Verification Matrix

| Deliverable | Component | Status | Key Specifications |
| :--- | :--- | :---: | :--- |
| **1. Serverless Routing** | `vercel.json` | **VERIFIED** | Function routing (`api/index.ts`), SPA rewrites (`/index.html`), 1024MB RAM, 15s ceiling |
| **2. Security Headers** | `vercel.json` | **VERIFIED** | `X-Frame-Options: DENY`, `nosniff`, `strict-origin`, 1yr cache on `/assets/*`, no-store on `/api/*` |
| **3. Serverless Entrypoint** | `api/index.ts` | **VERIFIED** | Pre-initialized Express app, 0 process listeners, edge prefix normalization |
| **4. Cloud Redis Session Store** | `src/adapters/cache/` | **VERIFIED** | `RedisSessionStore` using `ioredis`, TLS (`rediss://`), 3-min TTL, lossless CookieJar rehydration |
| **5. CORS & Cookie Hardening** | `src/app.ts` | **VERIFIED** | Enforced `https://nscognito.vercel.app`, Vercel previews (`*.vercel.app`), `SameSite=Lax; Secure` |
| **6. Build Pipeline** | `package.json` | **VERIFIED** | Deterministic `vercel-build`, `build:client`, `build:server`, production dependency placement |
| **7. Upstream Timeout Bounding**| `plumware_http_client.ts`| **VERIFIED** | 8500ms hard ceiling, clean `UPSTREAM_TIMEOUT` JSON response, avoids Vercel platform 504 |

---

## 3. Detailed Architectural Implementation

### 3.1. Serverless Routing & Project Topology (`vercel.json`)
* **Framework:** Configured as `vite` with `outputDirectory: "dist/client"`.
* **Serverless Function Target:** `api/index.ts` mapped with `maxDuration: 15` and `memory: 1024`. (Note: Node.js runtime version is set via `package.json` `"engines": { "node": ">=20.0.0" }`, avoiding legacy `functions.runtime` version errors in Vercel CLI).
* **SPA Fallback Routing:** Non-API requests (`/`, `/login`, `/dashboard`, `/explorer`) route to `/index.html` allowing React Router client navigation on page reload.
* **Security Headers:**
  * `X-Frame-Options: DENY`
  * `X-Content-Type-Options: nosniff`
  * `Referrer-Policy: strict-origin-when-cross-origin`
  * `Permissions-Policy: camera=(), microphone=(), geolocation=()`
* **Caching Matrix:**
  * Assets (`/assets/(.*)`): `public, max-age=31536000, immutable`
  * API endpoints (`/api/(.*)`): `no-store, no-cache, must-revalidate, proxy-revalidate`

### 3.2. Serverless API Entrypoint Adapter (`api/index.ts`)
* Exported handler dispatches HTTP requests directly to Express without calling `app.listen()`.
* Static singletons (`createApp()`) are instantiated at module scope once per container lifecycle, eliminating cold-start latency across subsequent warm invocations.
* Includes URL normalization middleware in `src/app.ts` to seamlessly handle both `/api/v1/...` and stripped `/v1/...` rewrite paths.

### 3.3. Stateless Cloud Redis Session Store (`RedisSessionStore`)
* Implements `ISessionStore` backed by `ioredis`.
* **TLS & Cloud Provider Support:** Natively supports `rediss://` for Upstash Redis, Redis Cloud, and AWS ElastiCache. Configurable TLS validation via `REDIS_TLS_REJECT_UNAUTHORIZED`.
* **Lossless CookieJar Serialization:**
  * Uses `state.cookieJar.toJSON()` on storage and `CookieJar.deserializeSync()` on hydration.
  * Preserves `PHPSESSID`, `domain`, `path`, `httpOnly`, `secure`, creation, and expiry timestamps across physically disjointed serverless containers.
* **Strict Ephemeral TTL:** All sessions and auth keys enforce a strict 180s (3-minute) eviction window.

### 3.4. CORS, Domain & Cookie Security Hardening
* Backend CORS middleware strictly enforces:
  * Production domain: `https://nscognito.vercel.app`
  * Dynamic variables: `process.env.CORS_ORIGIN` and `process.env.APP_URL`
  * Preview branches: `*.vercel.app` (when running inside Vercel environment)
  * Local origins (`localhost`, `127.0.0.1`) only during local development / testing
* Dispatched cookies are hardened with `secure: true`, `sameSite: 'lax'`, and `httpOnly: true`.

### 3.5. Upstream Timeout Bounding & Degraded Network Handling
* Upstream Plumware requests are bounded to `8500ms` (inside the specified 8000ms–9000ms ceiling).
* When `imsnsit.org` hangs or drops sockets:
  * Network requests abort immediately on timeout (`ECONNABORTED`, `ETIMEDOUT`) without spinning up runaway retry loops that would exceed Vercel's 15s limit.
  * Throws `UpstreamTimeoutError`, returning the structured JSON payload:
    ```json
    {
      "success": false,
      "status": "error",
      "error": "UPSTREAM_TIMEOUT",
      "code": "UPSTREAM_TIMEOUT",
      "message": "University portal took too long to respond. Please retry."
    }
    ```
  * Returned as HTTP 504 from the serverless function, preventing Vercel from intercepting the request with a generic HTML gateway error page.
  * The frontend client parses `json.error` and displays the crisp, monospaced Swiss error message.

---

## 4. Test Suite Execution & Verification Log

```bash
RUN  v5.0.3 NS Cognito
Test Files  17 passed (17)
     Tests  158 passed (158)
  Duration  8.36s
```

All 17 test suites (158 unit and integration tests) passed with 100% compliance:
1. `tests/vercel_serverless_migration.test.ts` (16 tests) — **PASS**
2. `tests/production_hardening.test.ts` (14 tests) — **PASS**
3. `tests/timetable_endpoints.test.ts` (12 tests) — **PASS**
4. `tests/timetable_complex_spans.test.ts` (8 tests) — **PASS**
5. `tests/schedule_resolver.test.ts` (3 tests) — **PASS**
6. `tests/attendance_forecaster.test.ts` (6 tests) — **PASS**
7. `tests/bunk_intelligence.test.ts` (10 tests) — **PASS**
8. `tests/timetable_parser.test.ts` (11 tests) — **PASS**
9. `tests/attendance_parser.test.ts` (10 tests) — **PASS**
10. `tests/navigator.test.ts` (9 tests) — **PASS**
11. `tests/attendance_endpoints.test.ts` (9 tests) — **PASS**
12. `tests/auth_endpoints.test.ts` (10 tests) — **PASS**
13. `tests/crypto.test.ts` (7 tests) — **PASS**
14. `tests/errors.test.ts` (7 tests) — **PASS**
15. `tests/html_parser.test.ts` (11 tests) — **PASS**
16. `tests/memory_store.test.ts` (6 tests) — **PASS**
17. `tests/tripwire.test.ts` (9 tests) — **PASS**

---

## 5. Deployment Instructions for Vercel

### Step 1: Connect Repository to Vercel
1. Log in to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Select your GitHub repository (`ManitShukla/NS-Cognito`).
3. Vercel will automatically detect `vercel.json` and set the Framework Preset to **Vite**.

### Step 2: Configure Environment Variables in Vercel Dashboard
In **Settings > Environment Variables**, add:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production runtime flag |
| `APP_URL` | `https://nscognito.vercel.app` | Production app URL |
| `CORS_ORIGIN` | `https://nscognito.vercel.app` | Allowed CORS origin |
| `SESSION_STORE_TYPE` | `redis` | Enables stateless Redis session store |
| `REDIS_URL` | `rediss://default:token@...upstash.io:6379` | Upstash Redis TLS connection string |
| `SESSION_TTL_SECONDS` | `180` | Ephemeral session lifetime (3 min) |
| `PLUMWARE_TIMEOUT_MS` | `8500` | Bounded upstream request timeout |
| `PLUMWARE_MAX_RETRIES` | `1` | Low retry count for serverless safety |

### Step 3: Deploy
Click **Deploy**. Vercel will run `npm run build` (`build:client` + `build:server`), deploy the static assets to the global edge CDN, and wire `/api/*` to the serverless function handler.
