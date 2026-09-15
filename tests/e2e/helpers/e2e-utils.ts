import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Page } from '@playwright/test';

export const LOCALE_STORAGE_KEY = 'ninja.locale';
export const LOCALE_COOKIE_NAME = 'locale';
/** Must mirror `EULA_VERSION` / `EULA_STORAGE_KEY` from `apps/forge-console/lib/eula.ts`. */
export const EULA_STORAGE_KEY = 'eula.accepted.version';
export const EULA_VERSION = '1.0.0';
/** Must mirror `LOCAL_KEY_STORAGE` from `apps/forge-console/lib/api.ts`. */
export const LOCAL_KEY_STORAGE = 'ninja.runtime.key';

const RUNTIME_KEY_PATH = join(homedir(), '.ninja', 'runtime.key');

let cachedRuntimeKey: string | undefined;

export function getRuntimeKey(): string {
  if (cachedRuntimeKey === undefined) {
    if (!existsSync(RUNTIME_KEY_PATH)) {
      throw new Error(
        `Runtime auth key not found at ${RUNTIME_KEY_PATH} — start the runtime once (pnpm runtime:dev) so it generates the key`
      );
    }
    const raw = readFileSync(RUNTIME_KEY_PATH, 'utf8').split(/\r?\n/);
    const firstLine = (raw[0] ?? '').trim();
    if (firstLine.length === 0) {
      throw new Error(`Runtime auth key at ${RUNTIME_KEY_PATH} is empty`);
    }
    cachedRuntimeKey = firstLine;
  }
  return cachedRuntimeKey;
}

export function runtimeAuthHeaders(): Record<string, string> {
  return { 'X-Ninja-Key': getRuntimeKey() };
}

/**
 * Seeds first-run state: locale (cookie mirror for next-intl SSR + localStorage),
 * EULA acceptance (without it the EulaGate dialog blocks the dashboard) and the
 * runtime auth key in localStorage — `lib/api.ts` attaches it as X-Ninja-Key on
 * every API call, which is how a single-user local-first browser client
 * authenticates against the runtime.
 */
export async function seedLocale(page: Page, locale: 'en' | 'es'): Promise<void> {
  const runtimeKey = getRuntimeKey();
  await page
    .context()
    .addCookies([{ name: LOCALE_COOKIE_NAME, value: locale, domain: 'localhost', path: '/' }]);
  await page.addInitScript(
    (args: {
      storageKey: string;
      cookieName: string;
      value: string;
      eulaKey: string;
      eulaVersion: string;
      apiKey: string;
      apiKeyStorage: string;
    }) => {
      window.localStorage.setItem(args.storageKey, args.value);
      window.localStorage.setItem(args.eulaKey, args.eulaVersion);
      window.localStorage.setItem(args.apiKeyStorage, args.apiKey);
      document.cookie = `${args.cookieName}=${args.value}; path=/; SameSite=Lax`;
    },
    {
      storageKey: LOCALE_STORAGE_KEY,
      cookieName: LOCALE_COOKIE_NAME,
      value: locale,
      eulaKey: EULA_STORAGE_KEY,
      eulaVersion: EULA_VERSION,
      apiKey: runtimeKey,
      apiKeyStorage: LOCAL_KEY_STORAGE,
    }
  );
}

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
