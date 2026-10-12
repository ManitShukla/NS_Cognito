import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp, type AppContext } from '../src/app.js';
import fs from 'fs';
import path from 'path';

describe('Phase 4: Frontend Telemetry & Static Integration', () => {
  let context: AppContext;

  beforeEach(() => {
    context = createApp();
  });

  afterEach(async () => {
    await context.sessionStore.destroy();
    vi.restoreAllMocks();
  });

  it('serves SPA index.html on root path "/"', async () => {
    const res = await request(context.app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('NS COGNITO');
    expect(res.text).toContain('Academic Coprocessor & Telemetry Engine');
  });

  it('serves SPA index.html on arbitrary non-API client routes (SPA routing)', async () => {
    const res = await request(context.app).get('/dashboard/timetable');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('id="root"');
  });

  it('preserves 404 JSON response for unmapped /api routes', async () => {
    const res = await request(context.app).get('/api/v1/invalid-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 'error',
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested endpoint was not found on this telemetry node.',
    });
  });

  it('verifies that frontend build artifacts exist in dist/client', () => {
    const clientDist = path.resolve(process.cwd(), 'dist/client');
    expect(fs.existsSync(clientDist)).toBe(true);

    const indexHtml = path.join(clientDist, 'index.html');
    expect(fs.existsSync(indexHtml)).toBe(true);

    const assetsDir = path.join(clientDist, 'assets');
    expect(fs.existsSync(assetsDir)).toBe(true);

    const files = fs.readdirSync(assetsDir);
    const hasCss = files.some((f) => f.endsWith('.css'));
    const hasJs = files.some((f) => f.endsWith('.js'));
    expect(hasCss).toBe(true);
    expect(hasJs).toBe(true);
  });
});
