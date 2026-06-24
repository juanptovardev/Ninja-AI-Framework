# ADR-0003: LLM fallback semantics and NINJA_LLM_FAIL_MODE feature flag

## Status

Accepted — WP-B3 ✅ WP-B6 ✅ (strict mode formally closes B6, 2026-06-24)

## Context

WP-B3 conecta `FallbackChain` al path de ejecución de LLM en `AgentExecutor`.
Esto cambia la semántica cuando todos los modelos de la cadena fallan:

- **Comportamiento anterior (legacy)**: el `catch` de `executeAgentTask` retorna
  `{ result: 'Agent unavailable...', status: 'failed', fallback: true }` como respuesta de éxito.
  `run()` lo procesa como tarea completada y emite `agent.task.completed`.
- **Comportamiento correcto (strict)**: tras agotar la cadena, lanzar
  `LLMError(LLM_ALL_PROVIDERS_FAILED)`. `run()` lo captura y emite `agent.task.failed`.

El riesgo R5 del plan ENTERPRISE clasifica esto como Alta probabilidad de romper flujos
existentes. Se requiere migración controlada sin redeploy.

## Decision

1. **Loop de fallback**: `executeAgentTask` envuelve `llmClient.complete` con un loop que
   consulta `FallbackChain.getNext(model, reason, sessionId)` en cada fallo clasificable.
   Una respuesta válida tras N intentos produce `agent.task.completed` como antes.

2. **Cadena agotada — modo `strict`** (default desde este WP):
   `throw new LLMError(ErrorCodes.LLM_ALL_PROVIDERS_FAILED, ..., { retryable: false })`
   El `catch` de `run()` emite `agent.task.failed`. Esto cubre parcialmente WP-B6.

3. **Cadena agotada — modo `legacy`** (opt-in vía env var):
   Retorna el objeto histórico `{ result: 'Agent unavailable...', status: 'failed', fallback: true }`.
   `run()` lo toma por el camino de éxito (backward-compat). Warning en log.

4. **Feature flag `NINJA_LLM_FAIL_MODE`** en `EnvSchema` (WP-B2):
   - Tipo: `z.enum(['strict', 'legacy']).default('strict')`
   - Inyectado en `AgentExecutor` constructor como `llmFailMode: 'strict' | 'legacy'`
   - No accede a `process.env` directamente en el executor (testeable)

5. **Plan de eliminación**: el flag se elimina cuando WP-B6 cierre formalmente (PR separado).
   Hasta entonces `legacy` permite rollback sin redeploy.

6. **`classifyLLMError(e)`** en `@ninja/integrations-llm`:
   Mapea `NinjaError` codes y `AbortError` a `FallbackReason | null`.
   Si retorna `null` (ej. `LLM_AUTH`) el loop **no** reintenta — error fatal inmediato.

## Consequences

- Flujos existentes continúan funcionando con `NINJA_LLM_FAIL_MODE=legacy` (0 cambios).
- Modo `strict` hace observable el fallo real de LLM en `agent.task.failed`.
- `FallbackChain` inyectada por constructor — no singleton global directo en executor.
- `completeWithFallback()` helper privado compartido entre `executeAgentTask` y reduce-phase.

## Alternatives considered

- **Cambio directo sin flag**: rechazado — R5 es Alta probabilidad de romper flujos.
- **Flag en código (constante)**: rechazado — no permite rollback sin recompilar.
- **Flag por sessionId**: rechazado — complejidad excesiva sin beneficio claro.
- **Esperar a WP-B6**: rechazado — B3 ya cambia la semántica parcialmente; es mejor
  hacer el cambio completo con flag que a medias sin él.
