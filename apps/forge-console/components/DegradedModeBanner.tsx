'use client';

/**
 * forge-console — components/DegradedModeBanner.tsx (WP-E3).
 *
 * Banner global persistente de modo degradado. Se muestra cuando:
 *   (a) el WS está cerrado (status 'closed' de useWsClient, T4.2), o
 *   (b) GET /health/ready responde 503 (poll ligero cada 15s).
 *
 * Texto: "Modo degradado: <motivo>" + botón Reintentar.
 * Se oculta SOLO cuando la condición desaparece.
 *
 * Estilo: exclusivamente componentes ui-kit (Badge + Button) y las vars
 * OKLCH existentes de `app/globals.css` vía arbitrary values — el patrón real
 * de forge-console (mission-control, settings). Nota: las clases del preset
 * `ninja-*` (tailwind.config.ts, estilo v3) no generan CSS bajo Tailwind v4
 * (`@import 'tailwindcss'` en globals.css), por eso no se usan aquí.
 * Cero CSS ad-hoc, cero HEX literales, cero style={{}}, cero vars nuevas.
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '@ninja/ui-kit';
import { useWsClient } from '../lib/ws-client';
import { BASE_URL, WS_URL } from '../lib/api';

export type DegradedReason = 'ws-closed' | 'runtime-not-ready';

const REASON_LABEL: Record<DegradedReason, string> = {
  'ws-closed': 'conexión en tiempo real perdida',
  'runtime-not-ready': 'runtime no listo (health/ready 503)',
};

export function resolveDegradedReason(params: {
  wsStatus: string;
  readyOk: boolean | null;
}): DegradedReason | null {
  if (params.wsStatus === 'closed') return 'ws-closed';
  if (params.readyOk === false) return 'runtime-not-ready';
  return null;
}

export function degradedMessage(reason: DegradedReason): string {
  return `Modo degradado: ${REASON_LABEL[reason]}`;
}

/** Intervalo del poll ligero de readiness (ms). */
export const READINESS_POLL_MS = 15000;

export function DegradedModeBanner() {
  const wsStatus = useWsClient((s) => s.status);
  const connect = useWsClient((s) => s.connect);
  const [readyOk, setReadyOk] = useState<boolean | null>(null);

  const checkReadiness = useCallback(async (cancelled: { value: boolean }): Promise<void> => {
    try {
      const res = await fetch(`${BASE_URL}/health/ready`);
      if (!cancelled.value) setReadyOk(res.status !== 503);
    } catch {
      if (!cancelled.value) setReadyOk(false);
    }
  }, []);

  // Poll ligero de readiness: check inmediato + cada 15s.
  useEffect(() => {
    const cancelled = { value: false };
    void checkReadiness(cancelled);
    const timer = setInterval(() => {
      void checkReadiness(cancelled);
    }, READINESS_POLL_MS);
    return () => {
      cancelled.value = true;
      clearInterval(timer);
    };
  }, [checkReadiness]);

  // Reintento manual: reconecta el WS y fuerza re-check inmediato de readiness
  // (el poll de 15s lo re-chequearía de todos modos; esto lo adelanta).
  const handleRetry = useCallback(() => {
    connect(WS_URL);
    const cancelled = { value: false };
    void checkReadiness(cancelled);
  }, [connect, checkReadiness]);

  const reason = resolveDegradedReason({ wsStatus, readyOk });
  if (reason === null) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="degraded-mode-banner"
      className="flex items-center justify-between gap-4 px-4 py-2 bg-[var(--ninja-warning)]/10 border-b border-[var(--ninja-warning)]"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Badge variant="warning" pulse aria-live="polite">
          Degradado
        </Badge>
        <span className="text-sm font-medium text-[var(--ninja-text-primary)] truncate">
          {degradedMessage(reason)}
        </span>
      </div>
      <Button variant="secondary" size="sm" onClick={handleRetry} aria-label="Reintentar conexión">
        Reintentar
      </Button>
    </div>
  );
}
