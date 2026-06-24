# WP-B6 · Verification Dossier — LLM failure = task failed
**Branch**: `fix/epic-b-foundations`
**Date**: 2026-06-24
**Referencia**: ADR-0003 (actualizado)

---

## Resumen

WP-B6 está **formalmente cubierto** por WP-B3 (strict mode).

El bug original: `executeAgentTask` catch retornaba `{ status:'failed', fallback:true }` en vez de lanzar → `run()` tomaba el path de éxito → emitía `agent.task.completed` para un fallo real.

La corrección (WP-B3): `completeWithFallback` lanza; el catch de `executeAgentTask` re-lanza en `strict` mode → `run()` lo atrapa y emite `agent.task.failed`.

WP-B6 añade el test de cierre formal y actualiza ADR-0003.

---

## Tests de cierre

| Test | Verificación |
|---|---|
| Sin fallbackChain + LLM siempre falla → `status:failed` | ✅ |
| `agent.task.completed` count = 0 | ✅ |
| `agent.task.failed` count > 0 | ✅ |
| Strict mode + chain agotada → `status:failed` | ✅ (WP-B3 Sc2) |

---

## Conteos

| Métrica | Antes | Después |
|---|---|---|
| Escenarios WP-B6 verificados con test | 0 | **2** |
| LLM failures que producen `agent.task.completed` falso | Sí | **0** |
| ADR-0003 status | Draft | **Accepted — WP-B3+B6 ✅** |
