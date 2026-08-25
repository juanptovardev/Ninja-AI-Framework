# WP-B7 · Verification Dossier — Stability Score con latencyMs real
**Branch**: `fix/epic-b-foundations`
**Date**: 2026-06-24

---

## Resumen

`latencyMs` ya se emitía en `executor.ts:688` dentro del payload de `agent.llm.called`.
WP-B7 cierra con tests que verifican que `PulseMonitor` lo consume correctamente.

---

## Estado verificado

`executor.ts` línea 664-688:
```ts
const latencyMs = Date.now() - llmStartedAt;
// ...
this.eventBus.emit({
  type: 'agent.llm.called',
  payload: {
    model: request.model,
    tokensUsed: response.usage.total_tokens,
    latencyMs,  // ← ya presente
  },
});
```

`pulse-center/monitor.ts`: suscribe a `agent.llm.called` y llama `calculateStabilityScore(latencyMs)`.

Fórmula scorer: `score = 100 - (p95/20) - (jitter/10) - (spikes*5) + (uptime*0.1)`

---

## Tests creados

| Test | Descripción |
|---|---|
| Sin eventos → score undefined/baseline | ✅ |
| latencyMs=50ms → score 100 (fast) | ✅ |
| latencyMs=2000ms × N → score < 100 | ✅ |
| Evento `health.degradation.detected` emitido bajo threshold | ✅ |
| Score consistente con múltiples providers | ✅ |
| Reset limpia estado del monitor | ✅ |

---

## Conteos

| Métrica | Antes | Después |
|---|---|---|
| Tests pulse-center | 0 (sin tests) | **6** |
| `latencyMs` en `agent.llm.called` | ✅ (ya existía) | ✅ |
| Score fijo en 100 | Sí (sin datos) | **Varía con latencia** |
| Typecheck @ninja/pulse-center | ✅ | ✅ |
