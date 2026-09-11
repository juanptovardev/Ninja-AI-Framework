/**
 * Tests DegradedModeBanner (WP-E3 · T7.3).
 *
 * Vitest puro (entorno node, sin jsdom — mismo precedente que
 * error-boundary.test.ts): se ejercita la lógica pura del banner —
 * condiciones show/hide, motivo y mensaje — sin montar DOM.
 * La integración visual (banner reacciona a WS caído) queda para E2E
 * (Playwright); los fixtures actuales no permiten matar el WS de forma
 * determinista → bloqueo documentado en el dossier wp-e-degraded.md.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveDegradedReason,
  degradedMessage,
  READINESS_POLL_MS,
} from '../../components/DegradedModeBanner';

describe('resolveDegradedReason (condiciones show/hide)', () => {
  it("WS 'closed' → visible con motivo ws-closed (aunque ready esté OK)", () => {
    expect(resolveDegradedReason({ wsStatus: 'closed', readyOk: true })).toBe('ws-closed');
  });

  it("WS 'closed' + ready 503 → el motivo WS tiene prioridad", () => {
    expect(resolveDegradedReason({ wsStatus: 'closed', readyOk: false })).toBe('ws-closed');
  });

  it('ready 503 con WS sano → visible con motivo runtime-not-ready', () => {
    expect(resolveDegradedReason({ wsStatus: 'open', readyOk: false })).toBe('runtime-not-ready');
  });

  it("WS 'reconnecting' + ready pendiente → oculto (no parpadea durante backoff)", () => {
    expect(resolveDegradedReason({ wsStatus: 'reconnecting', readyOk: null })).toBe(null);
  });

  it("WS 'connecting' + ready OK → oculto", () => {
    expect(resolveDegradedReason({ wsStatus: 'connecting', readyOk: true })).toBe(null);
  });

  it("WS 'open' + ready OK → oculto", () => {
    expect(resolveDegradedReason({ wsStatus: 'open', readyOk: true })).toBe(null);
  });

  it("WS 'open' + ready aún sin chequear → oculto (sin falso positivo inicial)", () => {
    expect(resolveDegradedReason({ wsStatus: 'open', readyOk: null })).toBe(null);
  });
});

describe('degradedMessage (motivo)', () => {
  it("motivo ws-closed incluye 'Modo degradado:' + causa legible", () => {
    const msg = degradedMessage('ws-closed');
    expect(msg.startsWith('Modo degradado:')).toBe(true);
    expect(msg).toContain('conexión en tiempo real perdida');
  });

  it('motivo runtime-not-ready menciona health/ready 503', () => {
    const msg = degradedMessage('runtime-not-ready');
    expect(msg.startsWith('Modo degradado:')).toBe(true);
    expect(msg).toContain('503');
  });
});

describe('READINESS_POLL_MS (poll ligero)', () => {
  it('es 15s — ligero, no agresivo contra /health/ready', () => {
    expect(READINESS_POLL_MS).toBe(15000);
  });
});
