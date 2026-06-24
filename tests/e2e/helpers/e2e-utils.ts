import { Page } from '@playwright/test';

export async function waitForRuntime(baseUrl: string, timeout: number = 15000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await globalThis.fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Runtime at ${baseUrl} not ready after ${timeout}ms`);
}

export async function navigateTo(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await page.waitForLoadState('load');
}

export async function assertPageLoaded(page: Page, titleContains: string): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  const title = await page.title();
  if (!title.toLowerCase().includes(titleContains.toLowerCase())) {
    throw new Error(`Page title "${title}" does not contain "${titleContains}"`);
  }
}