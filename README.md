# NS COGNITO // ACADEMIC COPROCESSOR & TELEMETRY ENGINE

[![Engine](https://img.shields.io/badge/ENGINE-NS_COGNITO_v1.0-red?style=flat-square)](https://github.com/ManitShukla)
[![Stack](https://img.shields.io/badge/STACK-NODE_24_%7C_EXPRESS_5_%7C_REACT_19_%7C_TAILWIND_v4-black?style=flat-square)](https://github.com/ManitShukla)
[![Security](https://img.shields.io/badge/SECURITY-ZERO_PERSISTENCE-success?style=flat-square)](https://github.com/ManitShukla)
[![License](https://img.shields.io/badge/LICENSE-MIT-lightgrey?style=flat-square)](LICENSE)

High-performance academic coprocessor, proxy scraper, and telemetry dashboard designed for students of Netaji Subhas University of Technology (NSUT). 

NS Cognito liberates students from the fragile, archaic, and frameset-dependent legacy Plumware ERP (`imsnsit.org`). It converts convoluted HTML tables and encrypted dynamic URLs into clean REST APIs and an ultra-dense Swiss Editorial telemetry interface.

---

## 1. System Mission & Core Directives

1. **Zero-Persistence Privacy Guarantee:** Student passwords and raw credentials are **never written to disk, databases, or logs**. Credentials exist solely in volatile RAM for the duration of the outbound HTTPS handshake against Plumware, and are scrubbed immediately.
2. **Upstream ERP Protection & Anti-Ban:** Implements strict concurrency throttling (max 6 parallel requests) and randomized jitter (150ms–350ms) to ensure university portal firewalls never blacklist student IPs.
3. **Smart Conflict Resolution & Scheduling:** De-merges merged multi-hour HTML lecture/lab blocks, matches registered student sub-batches (`G1`, `G2`, `G3`), and outputs personal schedules with zero timetable clashes.
4. **Interactive Attendance Simulator:** Real-time forward-looking attendance modeling with multi-hour lab weighting, 75% statutory threshold margins, and bunk/recovery computations.
5. **Swiss Editorial Visual Interface:** Uncompromising brutalist aesthetic utilizing monospaced telemetry fonts, high-density tables, and strict 0px border radius geometry.

---

## 2. Architecture & Data Flow

```
   [ Browser Client (React 19 / Swiss Telemetry UI) ]
                         |
           HTTPS / REST (JSON + CSP)
                         v
        [ Nginx Reverse Proxy / Edge Gateway ]
                         |
                 Internal Network
                         v
     [ NS Cognito API Engine (Node.js 24 / Express 5) ]
       ├── Payload Sanitizer & Redaction Middleware
       ├── In-Memory Sliding-Window Rate Limiters
       ├── Upstream Traffic Gate (Concurrency Token Bucket + Jitter)
       ├── Session Engine (HMAC-Signed Tokens + Ephemeral Cookie Jar)
       ├── Attendance Matrix Parser & Group Extractor
       ├── 2D Timetable De-merger & Smart Inference Engine
       └── Upstream Canary Monitor & Telemetry Metrics
                         |
         ┌───────────────┴───────────────┐
         v                               v
[ Redis / Memory Cache ]      [ Plumware ERP (imsnsit.org) ]
(TTL: 180s Sessions,          (Legacy framesets, dynamic PHP tokens,
 7d Cached Timetables)         encrypted Plum URLs)
```

---

## 3. Technology Stack

* **Backend Core:** Node.js 24 LTS, TypeScript 5.9, Express 5.3
* **Parsing & Extraction:** Cheerio 1.2, Tough-Cookie 6.0, Axios 1.20, Axios-CookieJar-Support 7.0
* **Frontend Surface:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite 8
* **Ephemeral Cache:** Redis 7 (LRU memory eviction) / Structured In-Memory Fallback
* **Containerization:** Multi-Stage Dockerfile (Alpine, non-root user `node`), Nginx 1.27
* **Testing:** Vitest 4, Supertest 7 (128+ automated unit and integration tests)

---

## 4. Environment Configuration

Copy `.env.example` to `.env` and configure appropriate runtime variables:

```ini
# Server Configuration
PORT=3000
NODE_ENV=production

# Session & Security Policy
SESSION_STORE=memory                  # 'memory' or 'redis'
SESSION_TTL_SECONDS=180               # Ephemeral session duration (default: 3 minutes)
SESSION_SECRET=your_32_byte_hmac_secret_key_here

# Redis Configuration (required if SESSION_STORE=redis)
REDIS_URL=redis://127.0.0.1:6379

# Plumware ERP Upstream Configuration
PLUMWARE_BASE_URL=https://imsnsit.org
PLUMWARE_TIMEOUT_MS=12000
PLUMWARE_MAX_RETRIES=2
```

---

## 5. Quickstart & Local Development

### Prerequisites
* Node.js >= 22.0.0
* npm >= 9.0.0

### Installation
```bash
# Clone the repository
git clone https://github.com/ManitShukla/ns-cognito.git
cd ns-cognito

# Install exact dependencies
npm ci
```

### Development Mode
```bash
# Start backend in watch mode
npm run dev

# Start frontend Vite dev server (in a separate terminal)
npm run client
```
Access the client interface at `http://localhost:5173`.

### Production Build
```bash
# Compile both backend and frontend distribution bundles
npm run build

# Start the unified production server
npm start
```
Access the unified application at `http://localhost:3000`.

---

## 6. Test Suite & Verification

The repository contains an exhaustive test suite covering authentication handshakes, Plumware HTML table de-merging, sub-batch extraction, attendance mathematics, rate limiting, and canary probes.

```bash
# Execute entire test suite (128+ tests)
npm test

# Run tests in continuous watch mode
npm run test:watch
```

---

## 7. API Reference Specification

All API responses follow a strict envelope schema: `{ "status": "success" | "error", "data": ..., "code": ..., "message": ... }`.

### Authentication Endpoints
* `GET /api/v1/auth/session`: Initializes ephemeral session and delivers base64 CAPTCHA challenge. (Rate Limit: 10/min)
* `POST /api/v1/auth/login`: Authenticates student credentials against Plumware. Single-use CAPTCHA enforcement. (Rate Limit: 5/min)
* `POST /api/v1/auth/refresh-captcha`: Refreshes CAPTCHA challenge without losing session state. (Rate Limit: 10/min)

### Student Telemetry Endpoints
* `POST /api/v1/student/dashboard`: Retrieves full telemetry profile (attendance, registered courses, sub-batch groups). (Rate Limit: 20/min)
* `POST /api/v1/student/attendance`: Retrieves attendance records, statutory 75% bunk/recovery margins. (Rate Limit: 20/min)
* `POST /api/v1/student/schedule`: Delivers personalized conflict-free weekly schedule. (Rate Limit: 20/min)
* `POST /api/v1/student/forecast`: Computes forward-looking attendance simulation. (Rate Limit: 20/min)

### Universal Timetable Endpoints
* `GET /api/v1/timetable/query`: Public universal section timetable query with branch and group filtering. (Rate Limit: 30/min)
* `GET /api/v1/timetable/infer?rollNo=...`: Auto-infers department, degree, branch, and semester from NSUT roll number. (Rate Limit: 30/min)
* `POST /api/v1/timetable/sync`: Force re-syncs and warms server cache for a master timetable.

### Observability & Health Probes
* `GET /health/live`: Container orchestrator liveness probe.
* `GET /health/ready`: Orchestrator readiness probe (verifies cache store connectivity).
* `GET /api/health/upstream`: Real-time status of university portal (`healthy`, `degraded`, or `offline`).
* `GET /api/health/metrics`: Telemetry performance snapshot (uptime, memory, queue depth, status codes).

---

## 8. Production Deployment with Docker Compose

Deploy the hardened 3-tier production stack:

```bash
# Build client and server artifacts
npm run build

# Launch API, Redis, and Nginx containers
docker compose -f docker-compose.prod.yml up -d --build

# Verify container health
docker compose -f docker-compose.prod.yml ps
```

The Nginx reverse proxy listens on `http://localhost:80` with gzip/brotli compression, strict Content-Security-Policy headers, and automatic API routing.

---

## 9. Security & Governance

* **Zero-Persistence:** Credentials and student roll numbers are sanitized by `payload_sanitizer.ts`. Logs never display passwords, cookies, or PHPSESSIDs.
* **Cryptographic Signatures:** Sessions are signed with HMAC-SHA256 to eliminate cookie tampering.
* **Anti-Replay Defense:** Single-use CAPTCHA challenge policy invalidates session tokens on failed or completed attempts.
* **Anti-Bruteforce Defense:** Strict rate limiting returns HTTP 429 with explicit `Retry-After` headers.

---

## 10. License

Released under the **MIT License**. Built with engineering pride for NSUT students.
