/**
 * E2E: Office Grid live route smoke test (S5.2 — Fase 7)
 *
 * NOTE: requires `pnpm console:dev` (forge-console on :3001) to pass.
 */
import { test, expect } from '@playwright/test';
import { navigateTo } from './helpers/e2e-utils';

test.describe('Office Grid live route', () => {
  test('/office route loads without 404', async ({ page }) => {
    await navigateTo(page, '/office');
    // Page should not show a Next.js 404 page
    await expect(page.locator('h1, h2').first()).not.toHaveText(/404|not found/i);
  });

  test('/office page contains Office or Agent heading', async ({ page }) => {
    await navigateTo(page, '/office');
    // Accepts any heading containing "Office" or "Agent" or "Grid"
    const heading = page.getByRole('heading').filter({ hasText: /office|agent|grid/i }).first();
    await expect(heading).toBeVisible();
  });
});
