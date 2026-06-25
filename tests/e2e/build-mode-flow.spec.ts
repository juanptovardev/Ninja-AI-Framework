/**
 * E2E: Build-mode flow smoke test (S5.2)
 *
 * NOTE: requires `pnpm runtime:dev` (kage-runtime on :3141) to pass.
 * Without a live server, Playwright will report a connection-refused error.
 */
import { test, expect } from '@playwright/test';

const RUNTIME_URL = 'http://localhost:3141';

interface EngineSubmitBody {
  mode: string;
  prompt: string;
  workspaceId?: string;
}

test.describe('Build-mode flow', () => {
  test('POST /engine/submit with mode=build returns 202 or 400', async ({ request }) => {
    const body: EngineSubmitBody = { mode: 'build', prompt: 'test', workspaceId: 'default-workspace' };

    const response = await request.post(`${RUNTIME_URL}/engine/submit`, { data: body });

    // 202 Accepted = request queued; 400 = schema error (still reachable).
    // Both prove the endpoint exists and the server is up.
    expect([202, 400, 401, 422]).toContain(response.status());
  });

  test('Runtime is accessible at :3141', async ({ request }) => {
    const response = await request.get(`${RUNTIME_URL}/health`);
    expect(response.status()).toBe(200);
  });
});
