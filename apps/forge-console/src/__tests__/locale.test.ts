/**
 * Tests del i18n es/en (WP-G3 / T8.2).
 *
 * Vitest puro (entorno node, sin jsdom — precedente: degraded-banner.test.ts):
 * lógica pura de lib/locale.ts: normalización, lectura persistida con
 * fallback, serialización de la cookie espejo y applyLocale con dependencias
 * inyectadas (storage + doc + refresh).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE_S,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  applyLocale,
  buildLocaleCookie,
  normalizeLocale,
  readStoredLocale,
} from '../../lib/locale';
import type { KeyValueStore } from '../../lib/kv-store';
import esMessages from '../../messages/es.json';
import enMessages from '../../messages/en.json';

function fakeStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('normalizeLocale', () => {
  it('acepta solo los locales soportados', () => {
    expect(normalizeLocale('es')).toBe('es');
    expect(normalizeLocale('en')).toBe('en');
  });

  it('rechaza valores desconocidos, null, undefined y no-strings', () => {
    expect(normalizeLocale('fr')).toBe(null);
    expect(normalizeLocale('ES')).toBe(null);
    expect(normalizeLocale('')).toBe(null);
    expect(normalizeLocale(null)).toBe(null);
    expect(normalizeLocale(undefined)).toBe(null);
    expect(normalizeLocale(42)).toBe(null);
  });
});

describe('readStoredLocale (fallback es)', () => {
  it('sin almacén → DEFAULT_LOCALE (es)', () => {
    expect(readStoredLocale(null)).toBe(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe('es');
  });

  it('valor persistido válido → ese locale', () => {
    const store = fakeStore({ [LOCALE_STORAGE_KEY]: 'en' });
    expect(readStoredLocale(store)).toBe('en');
  });

  it('valor persistido inválido o acceso que lanza → DEFAULT_LOCALE', () => {
    expect(readStoredLocale(fakeStore({ [LOCALE_STORAGE_KEY]: 'de' }))).toBe(DEFAULT_LOCALE);
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    expect(readStoredLocale(broken)).toBe(DEFAULT_LOCALE);
  });
});

describe('buildLocaleCookie (espejo para SSR de next-intl)', () => {
  it('serial name=value con path, max-age y samesite=lax', () => {
    expect(buildLocaleCookie(LOCALE_COOKIE_NAME, 'en')).toBe(
      `locale=en; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; samesite=lax`
    );
  });
});

describe('applyLocale (persistir + espejar + refrescar)', () => {
  it('escribe en storage, fija la cookie y refresca el router', () => {
    const store = fakeStore();
    const doc = { cookie: '' };
    const refresh = vi.fn();
    applyLocale('en', { storage: store, doc, refresh });
    expect(store.data[LOCALE_STORAGE_KEY]).toBe('en');
    expect(doc.cookie).toBe(buildLocaleCookie(LOCALE_COOKIE_NAME, 'en'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('sin storage ni doc → solo refresca (no lanza)', () => {
    const refresh = vi.fn();
    expect(() => applyLocale('es', { storage: null, doc: null, refresh })).not.toThrow();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('storage que lanza → la cookie y el refresh siguen haciendo el trabajo', () => {
    const broken: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    const doc = { cookie: '' };
    const refresh = vi.fn();
    applyLocale('en', { storage: broken, doc, refresh });
    expect(doc.cookie).toContain('locale=en');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ronda completa: aplicar 'en' y releer desde el mismo almacén", () => {
    const store = fakeStore();
    applyLocale('en', { storage: store, doc: null, refresh: () => undefined });
    expect(readStoredLocale(store)).toBe('en');
    applyLocale('es', { storage: store, doc: null, refresh: () => undefined });
    expect(readStoredLocale(store)).toBe('es');
  });
});

describe('mensajes es/en (paridad de claves)', () => {
  function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return flattenKeys(value as Record<string, unknown>, path);
      }
      return [path];
    });
  }

  it('SUPPORTED_LOCALES es exactamente [es, en]', () => {
    expect(SUPPORTED_LOCALES).toEqual(['es', 'en']);
  });

  it('es.json y en.json tienen el mismo set de claves', () => {
    const esKeys = flattenKeys(esMessages).sort();
    const enKeys = flattenKeys(enMessages).sort();
    expect(enKeys).toEqual(esKeys);
    expect(esKeys.length).toBeGreaterThan(0);
  });
});
