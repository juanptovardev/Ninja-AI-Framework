# WP-B4 · Verification Dossier — Budget Enforcement pre-call
**Branch**: `fix/epic-b-foundations`
**Date**: 2026-06-24
**ADR**: N/A (policy documentada en ADR-0003 y env-schema)

---

## Resumen

Implementación completa de budget enforcement pre-llamada LLM:
- `BudgetError` + `BUDGET_EXCEEDED` en `@ninja/contracts`
- `NINJA_SESSION_TOKEN_BUDGET` env var opcional
- Pre-call check en `completeWithFallback` antes de cualquier llamada a LLM
- Endpoint `GET /api/budget/status` con datos globales + por sesión
- `BudgetManager` wired en `AgentExecutor` vía composition root

---

## Antes / Después

### packages/agent-runtime/src/executor.ts — completeWithFallback
**Antes**: ninguna validación de budget antes del LLM call.

**Después**:
```ts
if (this.budgetManager && this.sessionTokenBudget !== undefined && sessionId) {
  if (this.budgetManager.isOverBudget(sessionId, this.sessionTokenBudget)) {
    throw new BudgetError(
      `Token budget exceeded for session ${sessionId} (limit: ${this.sessionTokenBudget})`
    );
  }
}
```

---

## Conteos

| Métrica | Antes | Después |
|---|---|---|
| `BudgetError` en contracts | 0 | **1** |
| `BUDGET_EXCEEDED` en ErrorCodes | 0 | **1** |
| Error codes totales (`errors:check`) | 14 | **15** |
| `NINJA_SESSION_TOKEN_BUDGET` en EnvSchema | No | **Sí** (optional, coerce number) |
| Pre-call budget check en executor | No | **Sí** (en `completeWithFallback`) |
| Endpoint `GET /api/budget/status` | No | **Sí** |
| `BudgetManager` wired en AgentExecutor | No | **Sí** |
| Tests añadidos | 0 | **7** (3 executor-budget + 4 budget-endpoint) |
| Tests pasando (packages afectados) | baseline | **292/292** |
| Typecheck @ninja/contracts | ✅ | ✅ |
| Typecheck @ninja/agent-runtime | ✅ | ✅ |
| Typecheck @ninja/kage-runtime | ✅ | ✅ |

---

## Gates verificados

| Check | Estado |
|---|---|
| `pnpm errors:check` → 15 error codes | ✅ |
| `pnpm --filter @ninja/contracts typecheck` | ✅ |
| `pnpm --filter @ninja/agent-runtime typecheck` | ✅ |
| `pnpm --filter @ninja/kage-runtime typecheck` | ✅ |
| `executor-budget.test.ts` (3 tests) | ✅ |
| `budget-endpoint.test.ts` (4 tests) | ✅ |
| `GET /api/budget/status` devuelve `global`, `session`, `limit` | ✅ |
| isOverBudget=true → 0 LLM calls, status:failed | ✅ |
| isOverBudget=false → LLM llamado normalmente | ✅ |
| Sin budgetManager → backward compat | ✅ |

---

## Comportamiento del feature

```bash
# Sin env var → enforcement desactivado (backward compat)
pnpm runtime:dev

# Con límite de 10,000 tokens por sesión
NINJA_SESSION_TOKEN_BUDGET=10000 pnpm runtime:dev

# Consultar estado
GET /api/budget/status
GET /api/budget/status?sessionId=sess-123
# → { global: {...}, session: {...} | null, limit: 10000 | null }
```

**HTTP status**: `429` (BudgetError.httpStatus)
**Error code**: `BUDGET_EXCEEDED`
**Retryable**: `false` (presupuesto agotado hasta reset)
