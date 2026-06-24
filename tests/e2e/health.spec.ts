import { test, expect } from '@playwright/test';
import { waitForRuntime, assertPageLoaded } from './helpers/e2e-utils';

const RUNTIME_URL = 'http://localhost:3141';
const CONSOLE_URL = 'http://localhost:3001';

interface HealthResponse {
  status: string;
  timestamp: string;
}

interface RuntimeStatus {
  status: string;
  version: string;
  uptime: number;
  timestamp: string;
}

test.describe('System Health Checks', () => {

  test('GET /health returns 200 with ok status', async ({ request }) => {
    const response = await request.get(`${RUNTIME_URL}/health`);
    expect(response.status()).toBe(200);

    const body: HealthResponse = await response.json();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(() => new Date(body.timestamp)).not.toThrow();
  });

  test('GET /api/status returns system info', async ({ request }) => {
    const response = await request.get(`${RUNTIME_URL}/api/status`);
    expect(response.status()).toBe(200);

    const body: RuntimeStatus = await response.json();
    expect(body.status).toBe('running');
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThan(0);
    expect(typeof body.timestamp).toBe('string');
  });

  test('Forge Console home page loads with Forge title', async ({ page }) => {
    await page.goto(CONSOLE_URL);
    await assertPageLoaded(page, 'Forge');
    expect(page.url()).toBe(CONSOLE_URL + '/');
  });

});