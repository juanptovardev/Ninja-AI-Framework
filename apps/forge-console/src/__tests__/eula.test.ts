/**
 * Tests del EULA de primera ejecución (WP-G3 / T8.2).
 *
 * Vitest puro (entorno node, sin jsdom — mismo precedente que
 * degraded-banner.test.ts / onboarding-store.test.ts): se ejercita la
 * lógica pura de persistencia (lib/eula.ts) y las acciones del store
 * (checkEula/acceptEula/declineEula) con un KeyValueStore falso inyectable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  EULA_VERSION,
  EULA_STORAGE_KEY,
  isEulaAccepted,
  persistEulaAcceptance,
} from '../../lib/eula';
import type { KeyValueStore } from '../../lib/kv-store';
import { useUccStore } from '../../lib/ucc-store';

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

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota exceeded');
  },
};

beforeEach(() => {
  useUccStore.setState({ eulaStatus: 'checking' });
});

describe('isEulaAccepted (persistencia eula.accepted.version)', () => {
  it('sin almacén (SSR/bloqueado) → false', () => {
    expect(isEulaAccepted(null)).toBe(false);
  });

  it('clave ausente → false (primera ejecución)', () => {
    expect(isEulaAccepted(fakeStore())).toBe(false);
  });

  it('versión exacta guardada → true', () => {
    const store = fakeStore({ [EULA_STORAGE_KEY]: EULA_VERSION });
    expect(isEulaAccepted(store)).toBe(true);
  });

  it('versión desactualizada → false (renovación de términos)', () => {
    const store = fakeStore({ [EULA_STORAGE_KEY]: '0.9.0' });
    expect(isEulaAccepted(store)).toBe(false);
    expect(isEulaAccepted(store, '0.9.0')).toBe(true);
  });

  it('acceso que lanza → false (fallback seguro, sin throw crudo)', () => {
    expect(isEulaAccepted(throwingStore)).toBe(false);
  });
});

describe('persistEulaAcceptance', () => {
  it('escribe la versión bajo la clave canónica', () => {
    const store = fakeStore();
    persistEulaAcceptance(store);
    expect(store.data[EULA_STORAGE_KEY]).toBe(EULA_VERSION);
    expect(isEulaAccepted(store)).toBe(true);
  });

  it('sin almacén → no-op silencioso', () => {
    expect(() => persistEulaAcceptance(null)).not.toThrow();
  });

  it('setItem que lanza → no propaga (la sesión queda en memoria)', () => {
    expect(() => persistEulaAcceptance(throwingStore)).not.toThrow();
  });
});

describe('ucc-store: ciclo de vida del EULA', () => {
  it("estado inicial 'checking' — misma salida en SSR e hidratación", () => {
    expect(useUccStore.getState().eulaStatus).toBe('checking');
  });

  it('checkEula con almacén vacío → pending (gate bloqueante)', () => {
    useUccStore.getState().checkEula(fakeStore());
    expect(useUccStore.getState().eulaStatus).toBe('pending');
  });

  it('checkEula con aceptación previa → accepted', () => {
    const store = fakeStore({ [EULA_STORAGE_KEY]: EULA_VERSION });
    useUccStore.getState().checkEula(store);
    expect(useUccStore.getState().eulaStatus).toBe('accepted');
  });

  it('acceptEula persiste y acepta; el check posterior ya no pregunta', () => {
    const store = fakeStore();
    useUccStore.getState().acceptEula(store);
    expect(useUccStore.getState().eulaStatus).toBe('accepted');
    expect(store.data[EULA_STORAGE_KEY]).toBe(EULA_VERSION);
    useUccStore.setState({ eulaStatus: 'checking' });
    useUccStore.getState().checkEula(store);
    expect(useUccStore.getState().eulaStatus).toBe('accepted');
  });

  it('declineEula → declined sin persistir aceptación', () => {
    const store = fakeStore();
    useUccStore.getState().declineEula();
    expect(useUccStore.getState().eulaStatus).toBe('declined');
    expect(isEulaAccepted(store)).toBe(false);
  });
});
