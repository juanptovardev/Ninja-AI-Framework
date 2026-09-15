/**
 * forge-console — lib/kv-store.ts (WP-G3 / T8.2)
 * Contrato mínimo de almacenamiento clave-valor (localStorage-like) con
 * resolución segura del almacén real. Inyectable en tests (entorno node,
 * sin jsdom): los consumidores aceptan `KeyValueStore | null`.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Devuelve un adaptador de `window.localStorage`, o null si no hay DOM o el acceso está bloqueado. */
export function resolveKeyValueStore(): KeyValueStore | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const backend = window.localStorage;
    return {
      getItem: (key) => backend.getItem(key),
      setItem: (key, value) => {
        backend.setItem(key, value);
      },
    };
  } catch {
    return null;
  }
}
