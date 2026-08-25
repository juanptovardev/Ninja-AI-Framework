# WP-B3 · Verification Dossier
**Branch**: `fix/epic-b-foundations`
**Date**: 2026-06-24
**ADR**: docs/adr/0003-llm-fallback-semantics.md

---

## Resumen

- `classifyLLMError` helper en `@ninja/integrations-llm`
- `FallbackChain.buildDefaultChains()` reconstruido con IDs reales del catálogo
- `AgentExecutor.completeWithFallback()` helper privado extraído + usado en `executeAgentTask` y reduce-phase
- `NINJA_LLM_FAIL_MODE` feature flag inyectado por constructor
- Throws de `executor.ts` migrados a `EngineError`
- `FallbackChain` wired en `server.ts` (composition root)
- 56 tests agent-runtime verdes + 2 integration tests verdes

---

## Antes / Después

### packages/agent-runtime/src/executor.ts — executeAgentTask
**Antes**:
```ts
const response = await this.llmClient.complete(request);
// ...
} catch (error) {
  // returns { fallback: true, status: 'failed', ... }  ← fake success
}
```
**Después**:
```ts
const response = await this.completeWithFallback(request, task.workflowId);
// ...
} catch (error) {
  if (this.fallbackChain && this.llmFailMode === 'strict') throw error; // real failure
  return { fallback: true, ... }; // legacy mode only
}
```

### packages/model-gateway/src/fallback.ts — buildDefaultChains
**Antes** (IDs legacy):
```ts
'gpt-4': ['gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-haiku'],
'claude-3-opus': ['claude-3-sonnet', 'claude-3-haiku', 'gpt-3.5-turbo'],
```
**Después** (IDs catálogo reales):
```ts
'openai/gpt-4o': ['openai/gpt-4o-mini', 'anthropic/claude-3-5-sonnet', 'deepseek/deepseek-v3'],
'openai/gpt-4o-mini': ['anthropic/claude-3-haiku', 'google/gemini-2.0-flash', 'meta/llama-3.3-70b'],
```

---

## Conteos

| Métrica | Antes | Después |
|---|---|---|
| Archivos creados | 0 | 4 (`classify-error.ts`, test, `fallback.test.ts`, integration test) |
| Archivos modificados | 4 | `executor.ts`, `fallback.ts`, `server.ts`, `integrations-llm/index.ts` |
| `this.llmClient.complete(` directo en executor (no en helper) | 2 | **0** (todo pasa por `completeWithFallback`) |
| Default chain IDs legacy (`gpt-4`, `claude-3-opus`, etc.) | 6 | **0** |
| Default chain IDs del catálogo | 0 | **10** |
| `throw new Error(` en `executor.ts` | 4 | **0** |
| Tests añadidos | 0 | **75** (10 classify + 7 fallback chains + 6 executor-fallback + 2 integration + 50 pre-existentes) |
| Tests pasando (agent-runtime) | 50 | **56/56** |
| Tests pasando (integration) | 0 | **2/2** |
| Typecheck `@ninja/agent-runtime` | ✅ | ✅ |
| Typecheck `@ninja/kage-runtime` | ✅ | ✅ |
| `pnpm errors:check` | ✅ | ✅ |

---

## Gates verificados

| Check | Estado |
|---|---|
| `pnpm --filter @ninja/agent-runtime typecheck` | ✅ |
| `pnpm --filter @ninja/kage-runtime typecheck` | ✅ |
| `pnpm vitest run packages/agent-runtime` → 56/56 | ✅ |
| `pnpm vitest run tests/integration/fallback-chain.integration.test.ts` → 2/2 | ✅ |
| `pnpm vitest run packages/model-gateway/src/fallback.test.ts` → 7/7 | ✅ |
| `pnpm vitest run packages/integrations-llm/src/classify-error.test.ts` → 10/10 | ✅ |
| `rg "this\.llmClient\.complete\(" packages/agent-runtime/src/executor.ts` → solo en `completeWithFallback` | ✅ |
| Legacy IDs en FallbackChain → `rg "'gpt-4'" packages/model-gateway/src/fallback.ts` → 0 | ✅ |
| `rg "throw new Error\(" packages/agent-runtime/src/executor.ts` → 0 | ✅ |
| FallbackChain wired in server.ts | ✅ |
| `NINJA_LLM_FAIL_MODE` propagado desde env al constructor | ✅ |

---

## Escenarios de fallback verificados

| # | Escenario | Resultado |
|---|---|---|
| 1 | LLM 429 → fallback → éxito | `task.completed`, 2 calls LLM |
| 2 | Chain agotada + strict | `task.failed`, `model.gateway.exhausted` |
| 3 | `LLM_AUTH` → sin fallback | 1 call, inmediato fail |
| 4 | Sin FallbackChain | backward-compat, funciona |
| 5 | Chain agotada + legacy | retorna `{ fallback: true }`, no lanza |
| 6 | Chain agotada + strict (default) | `status: failed` |
| E2E-1 | Real FallbackChain + 1 fail + éxito | `task.completed`, `model.fallback.triggered` |
| E2E-2 | Real FallbackChain + siempre falla | `task.failed`, `model.gateway.exhausted` |

---

## Feature flag NINJA_LLM_FAIL_MODE

```bash
# Modo estricto (default) — fallo real se propaga
NINJA_LLM_FAIL_MODE=strict  # o no configurar

# Modo legacy — preserva comportamiento antiguo (WP-B6 transition)
NINJA_LLM_FAIL_MODE=legacy
```
Documentado en `.env.example` y ADR-0003.
