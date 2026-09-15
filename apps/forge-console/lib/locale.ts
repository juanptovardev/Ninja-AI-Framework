/**
 * forge-console — lib/locale.ts (WP-G3 / T8.2)
 * Lógica pura del i18n es/en: normalización, persistencia (localStorage +
 * cookie espejo para el SSR de next-intl) y construcción de la cookie.
 * `es` es el idioma por defecto. Sin React ni next/headers: testeable en
 * vitest con entorno node (sin jsdom).
 */
import type { KeyValueStore } from './kv-store';

export const SUPPORTED_LOCALES = ['es', 'en'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'es';

export const LOCALE_STORAGE_KEY = 'ninja.locale';

export const LOCALE_COOKIE_NAME = 'locale';

/** 1 año — el switch de idioma sobrevive a sesiones. */
export const LOCALE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/** Normaliza un valor desconocido a un locale soportado, o null si no lo es. */
export function normalizeLocale(value: unknown): SupportedLocale | null {
  for (const locale of SUPPORTED_LOCALES) {
    if (value === locale) {
      return locale;
    }
  }
  return null;
}

/** Locale persistido en `storage`, con fallback a `DEFAULT_LOCALE`. */
export function readStoredLocale(storage: KeyValueStore | null): SupportedLocale {
  if (!storage) {
    return DEFAULT_LOCALE;
  }
  try {
    return normalizeLocale(storage.getItem(LOCALE_STORAGE_KEY)) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Serial de cookie `document.cookie` para el locale (path=/, same-site lax). */
export function buildLocaleCookie(
  name: string,
  value: SupportedLocale,
  maxAgeSeconds: number = LOCALE_COOKIE_MAX_AGE_S
): string {
  return `${name}=${value}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

export interface LocaleApplyDeps {
  storage: KeyValueStore | null;
  doc: { cookie: string } | null;
  refresh: () => void;
}

/**
 * Aplica un locale: persiste en localStorage, espeja a cookie (para que el
 * SSR de next-intl renderice el mismo idioma) y refresca el router.
 */
export function applyLocale(locale: SupportedLocale, deps: LocaleApplyDeps): void {
  if (deps.storage) {
    try {
      deps.storage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // sin persistencia local: la cookie sigue haciendo el trabajo
    }
  }
  if (deps.doc) {
    deps.doc.cookie = buildLocaleCookie(LOCALE_COOKIE_NAME, locale);
  }
  deps.refresh();
}
