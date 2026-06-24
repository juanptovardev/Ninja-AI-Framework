import { test, expect } from '@playwright/test';
import { navigateTo } from './helpers/e2e-utils';

test.describe('Dashboard Navigation', () => {

  test('navigate to Mission Control renders the page', async ({ page }) => {
    await navigateTo(page, '/mission-control');
    await expect(page.getByText(/Mission Control/i).first()).toBeVisible();
  });

  test('navigate to Health shows health indicators', async ({ page }) => {
    await navigateTo(page, '/health');
    await expect(page.getByText(/System Health/i).first()).toBeVisible();
    await expect(page.getByText(/Stability Score/i).first()).toBeVisible();
    await expect(page.getByText(/Context Efficiency/i).first()).toBeVisible();
  });

  test('sidebar links navigate between pages', async ({ page }) => {
    await navigateTo(page, '/mission-control');

    await page.locator('nav button').filter({ hasText: 'Health' }).click();
    await page.waitForURL('**/health');
    await expect(page.getByText(/System Health/i).first()).toBeVisible();

    await page.locator('nav button').filter({ hasText: 'Settings' }).click();
    await page.waitForURL('**/settings');
    await expect(page.getByRole('heading', { name: /Settings/i }).first()).toBeVisible();
  });

});