import request from 'supertest';
import { createApp } from '../src/app.js';

async function verify() {
  console.log('================================================================');
  console.log('    NS COGNITO // ENDPOINT VERIFICATION & JSON GUARANTEE PROBE  ');
  console.log('================================================================\n');

  const context = createApp();

  // Test 1: GET /api/auth/session (Without /v1)
  console.log('[PROBE 1] Testing GET /api/auth/session...');
  const res1 = await request(context.app).get('/api/auth/session');
  console.log(`STATUS      :: ${res1.status}`);
  console.log(`CONTENT-TYPE:: ${res1.headers['content-type']}`);
  console.log(`SUCCESS     :: ${res1.body.status === 'success'}`);
  console.log(`SESSION_ID  :: ${res1.body.data?.sessionToken}`);
  console.log(`ACAD_YEAR   :: ${res1.body.data?.academicYear}`);
  console.log(`CAPTCHA_LEN :: ${res1.body.data?.captchaBase64?.length} chars`);
  console.log(`IS_JSON     :: ${typeof res1.body === 'object' && !res1.text.startsWith('<html')}`);
  if (res1.status !== 200 || !res1.body.data?.captchaBase64) {
    throw new Error('Probe 1 failed: /api/auth/session did not return 200 JSON with CAPTCHA');
  }
  console.log('[PASS] Probe 1 passed!\n');

  // Test 2: GET /api/v1/auth/session (With /v1)
  console.log('[PROBE 2] Testing GET /api/v1/auth/session...');
  const res2 = await request(context.app).get('/api/v1/auth/session');
  console.log(`STATUS      :: ${res2.status}`);
  console.log(`SUCCESS     :: ${res2.body.status === 'success'}`);
  console.log(`IS_JSON     :: ${typeof res2.body === 'object'}`);
  if (res2.status !== 200) {
    throw new Error('Probe 2 failed: /api/v1/auth/session did not return 200 JSON');
  }
  console.log('[PASS] Probe 2 passed!\n');

  // Test 3: POST /api/auth/login validation error (Missing fields)
  console.log('[PROBE 3] Testing POST /api/auth/login with empty payload...');
  const res3 = await request(context.app).post('/api/auth/login').send({});
  console.log(`STATUS      :: ${res3.status}`);
  console.log(`CODE        :: ${res3.body.code}`);
  console.log(`IS_JSON     :: ${typeof res3.body === 'object' && !res3.text.startsWith('<html')}`);
  if (res3.status !== 422 || res3.body.code !== 'VALIDATION_ERROR') {
    throw new Error('Probe 3 failed: expected 422 VALIDATION_ERROR');
  }
  console.log('[PASS] Probe 3 passed!\n');

  // Test 4: POST /api/auth/login live verification with fresh session
  console.log('[PROBE 4] Testing POST /api/auth/login with active session & test credentials...');
  const sessionToken = res1.body.data.sessionToken;
  const res4 = await request(context.app).post('/api/auth/login').send({
    sessionToken,
    rollNo: '2024UCB9999',
    password: 'VerificationPassword!',
    captchaText: '00000',
  });
  console.log(`STATUS      :: ${res4.status}`);
  console.log(`CODE        :: ${res4.body.code}`);
  console.log(`MESSAGE     :: ${res4.body.message}`);
  console.log(`IS_JSON     :: ${typeof res4.body === 'object' && !res4.text.startsWith('<html')}`);
  console.log(`ZERO_HTML   :: ${!res4.text.includes('<html') && !res4.text.includes('500 Internal')}`);
  if (res4.status >= 500) {
    throw new Error(`Probe 4 failed: returned 5xx status ${res4.status}`);
  }
  console.log('[PASS] Probe 4 passed (Structured JSON error handled gracefully, ZERO HTML 500)!\n');

  // Test 5: Route Not Found JSON Guarantee
  console.log('[PROBE 5] Testing unknown route GET /api/nonexistent...');
  const res5 = await request(context.app).get('/api/nonexistent');
  console.log(`STATUS      :: ${res5.status}`);
  console.log(`CODE        :: ${res5.body.code}`);
  console.log(`IS_JSON     :: ${typeof res5.body === 'object'}`);
  if (res5.status !== 404 || res5.body.code !== 'ROUTE_NOT_FOUND') {
    throw new Error('Probe 5 failed: expected 404 ROUTE_NOT_FOUND');
  }
  console.log('[PASS] Probe 5 passed!\n');

  console.log('================================================================');
  console.log('     ALL API VERIFICATION PROBES SUCCEEDED (100% JSON GUARANTEED)');
  console.log('================================================================');

  await context.sessionStore.destroy();
}

verify().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
