/**
 * E2E: Approval / Guardian smoke test (S5.2 — EPIC B WP-B5)
 *
 * NOTE: requires `pnpm runtime:dev` (kage-runtime on :3141) to pass.
 */
import { test, expect } from '@playwright/test';

const RUNTIME_URL = 'http://localhost:3141';

test.describe('Guardian deny-by-default (WP-B5)', () => {
  test('GET /health returns 200 — no auth required', async ({ request }) => {
    const response = await request.get(`${RUNTIME_URL}/health`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('Sentinel/approvals route exists and responds (not 404)', async ({ request }) => {
    // Verify the approvals endpoint is registered.
    // 401/403/405/400 all prove the route exists; only 404 means missing.
    const response = await request.get(`${RUNTIME_URL}/api/sentinel/approvals`);
    expect(response.status()).not.toBe(404);
  });
});
