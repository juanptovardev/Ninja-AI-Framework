/**
 * forge-console — lib/eula.ts (WP-G3 / T8.2)
 * Lógica pura de persistencia del EULA de primera ejecución.
 * Clave canónica: `eula.accepted.version`. Si la versión guardada difiere
 * de `EULA_VERSION`, el acuerdo se vuelve a exigir (renovación de términos).
 * Sin React ni DOM: testeable en vitest con entorno node (patrón
 * degraded-banner.test.ts / onboarding-store.test.ts).
 */
import type { KeyValueStore } from './kv-store';

export const EULA_VERSION = '1.0.0';

export const EULA_STORAGE_KEY = 'eula.accepted.version';

/** ¿Se aceptó EXACTAMENTE esta versión del EULA? */
export function isEulaAccepted(
  storage: KeyValueStore | null,
  version: string = EULA_VERSION
): boolean {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(EULA_STORAGE_KEY) === version;
  } catch {
    return false;
  }
}

/** Persiste la aceptación de `version`. Sin almacén disponible, no-op (la sesión queda en memoria). */
export function persistEulaAcceptance(
  storage: KeyValueStore | null,
  version: string = EULA_VERSION
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(EULA_STORAGE_KEY, version);
  } catch {
    // almacenamiento lleno o bloqueado: la aceptación vive solo en el store de sesión
  }
}
