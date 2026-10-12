import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { MemorySessionStore } from '../src/adapters/cache/memory_session_store.js';
import { PlumwareHttpClient } from '../src/adapters/plumware/plumware_http_client.js';
import { SessionEngineService } from '../src/services/session_engine.service.js';
import { InvalidCaptchaError } from '../src/utils/errors.js';

/**
 * NS COGNITO // CLI AUTHENTICATION HANDSHAKE & TELEMETRY TEST HARNESS
 *
 * Runs the live session initialization pipeline against imsnsit.org:
 * 1. Establishes isolated Cookie Jar session with Plumware
 * 2. Parses form tokens (fy, enc_fy, comp, HRAND_NUM)
 * 3. Downloads bound JPEG CAPTCHA and writes 'captcha_preview.jpg'
 * 4. Verifies challenge rejection (non-interactive mode) or interactive login
 */

async function main() {
  console.log('================================================================');
  console.log('       NS COGNITO // PLUMWARE ERP PROTOCOL TEST HARNESS        ');
  console.log('       AESTHETIC: SWISS EDITORIAL × HIGH-DENSITY TELEMETRY      ');
  console.log('================================================================');

  const sessionStore = new MemorySessionStore();
  const httpClient = new PlumwareHttpClient();
  const sessionEngine = new SessionEngineService({
    sessionStore,
    httpClient,
  });

  const startTime = Date.now();
  console.log(`\n[TEL // INIT] Initiating session handshake against imsnsit.org...`);

  let sessionData;
  try {
    sessionData = await sessionEngine.initializeSession();
  } catch (err: any) {
    console.error(`[ERR // HANDSHAKE_FAILED] Failed to initialize session: ${err.message}`);
    process.exit(1);
  }

  const durationMs = Date.now() - startTime;

  console.log(`\n------------------ SESSION TELEMETRY ACQUIRED ------------------`);
  console.log(`STATUS         :: 200 OK (${durationMs}ms)`);
  console.log(`SESSION_TOKEN  :: ${sessionData.sessionToken}`);
  console.log(`ACADEMIC_YEAR  :: ${sessionData.academicYear}`);
  console.log(`TTL_SECONDS    :: ${sessionData.expiresInSeconds}s`);
  console.log(`CAPTCHA_TYPE   :: JPEG (Base64 length: ${sessionData.captchaBase64.length} chars)`);

  // Write CAPTCHA image to disk for inspection
  const base64Data = sessionData.captchaBase64.replace(/^data:image\/jpeg;base64,/, '');
  const captchaBuffer = Buffer.from(base64Data, 'base64');
  const previewPath = path.resolve(process.cwd(), 'captcha_preview.jpg');
  fs.writeFileSync(previewPath, captchaBuffer);

  console.log(`CAPTCHA_FILE   :: ${previewPath} (${captchaBuffer.length} bytes written)`);
  console.log(`----------------------------------------------------------------\n`);

  const args = process.argv.slice(2);
  const isNonInteractive = args.includes('--non-interactive') || !process.stdin.isTTY;

  if (isNonInteractive) {
    console.log(`[TEL // AUTOMATED] Non-interactive mode detected. Verifying security tripwires...`);

    // 1. Verify invalid CAPTCHA rejection
    console.log(`[TEL // TEST 1] Verifying CAPTCHA mismatch tripwire (submitting invalid code '00000')...`);
    try {
      await sessionEngine.authenticate({
        sessionToken: sessionData.sessionToken,
        rollNo: '2024UCB0001',
        password: 'DefensiveTestPassword123!',
        captchaText: '00000',
      });
      console.error(`[FAIL] Expected InvalidCaptchaError, but authentication passed or did not reject.`);
      process.exit(1);
    } catch (err: any) {
      if (err instanceof InvalidCaptchaError) {
        console.log(`[PASS] Correctly rejected: ${err.message} (HTTP ${err.statusCode} - ${err.code})`);
      } else {
        console.error(`[FAIL] Unexpected error type: ${err.constructor.name} - ${err.message}`);
        process.exit(1);
      }
    }

    // 2. Verify CAPTCHA refresh mechanism
    console.log(`\n[TEL // TEST 2] Verifying CAPTCHA refresh pipeline...`);
    try {
      const refreshed = await sessionEngine.refreshCaptcha(sessionData.sessionToken);
      console.log(`[PASS] Refreshed CAPTCHA successfully received (Refreshed length: ${refreshed.captchaBase64.length} chars)`);
    } catch (err: any) {
      console.error(`[FAIL] Failed to refresh CAPTCHA: ${err.message}`);
      process.exit(1);
    }

    console.log(`\n================================================================`);
    console.log(`  ALL PROTOCOL VERIFICATION CHECKS PASSED WITH PRODUCTION RIGOR  `);
    console.log(`================================================================`);
    await sessionStore.destroy();
    process.exit(0);
  }

  // Interactive CLI Login
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> =>
    new Promise((resolve) => rl.question(query, resolve));

  console.log(`[ACTION REQUIRED] Inspect 'captcha_preview.jpg' in your editor to read the CAPTCHA.`);
  const captchaText = await question('ENTER CAPTCHA CODE   : ');
  const rollNo = await question('ENTER STUDENT ROLL NO : ');
  const password = await question('ENTER PASSWORD        : ');

  rl.close();

  if (!captchaText.trim() || !rollNo.trim() || !password.trim()) {
    console.log(`[ABORT] Missing required fields. Verification terminated.`);
    await sessionStore.destroy();
    process.exit(0);
  }

  console.log(`\n[TEL // AUTH] Submitting authentication request to Plumware...`);
  try {
    const result = await sessionEngine.authenticate({
      sessionToken: sessionData.sessionToken,
      rollNo: rollNo.trim(),
      password: password.trim(),
      captchaText: captchaText.trim(),
    });

    console.log(`\n=================== AUTHENTICATION SUCCESS =====================`);
    console.log(`STUDENT_ROLL   :: ${result.rollNo}`);
    console.log(`ACADEMIC_YEAR  :: ${result.academicYear}`);
    console.log(`AUTH_TIMESTAMP :: ${new Date(result.authenticatedAt).toISOString()}`);
    console.log(`MESSAGE        :: ${result.message}`);
    console.log(`================================================================\n`);
  } catch (err: any) {
    console.error(`\n=================== AUTHENTICATION FAILED ======================`);
    console.error(`ERROR_CODE     :: ${err.code || 'UNKNOWN'}`);
    console.error(`STATUS_CODE    :: ${err.statusCode || 500}`);
    console.error(`MESSAGE        :: ${err.message}`);
    console.error(`================================================================\n`);
  } finally {
    await sessionStore.destroy();
  }
}

main().catch((err) => {
  console.error('Fatal CLI execution error:', err);
  process.exit(1);
});
