# WP-B1 · Verification Dossier
**Branch**: `fix/epic-b-foundations`
**Date**: 2026-06-24
**Implementor**: Sonnet (Claude Sonnet)

---

## Resumen

- **5 archivos migrados** (23 throws → NinjaError subclasses)
- **1 clase base** + **8 subclases** + **14 ErrorCodes** implementados
- **35 tests** añadidos en `packages/contracts/src/errors.test.ts` — todos verdes
- ESLint guard activo en los 5 archivos migrados
- Script `generate-error-docs.ts` + `docs/errors.md` generado (14 códigos)
- CI minimal activado con step `errors:check`

---

## Commits del bloque (9 commits, 1 rama)

| SHA | Mensaje |
|-----|---------|
| `7138763` | `chore(ci): add minimal typecheck+test workflow` |
| `ffaed6c` | `docs(adr): bootstrap ADR directory and template` |
| `056767a` | `test(contracts): NinjaError full test suite - shape, catalog, helpers, toJSON (red)` |
| `79b861a` | `feat(contracts): NinjaError hierarchy - base, subclasses, ErrorCodes, toJSON, helpers (35 tests green)` |
| `f2f61c3` | `refactor(integrations-llm): migrate client.ts throws to LLMError` |
| `2855ea1` | `refactor(sentinel): migrate approval.ts throws to SentinelError` |
| `a852412` | `refactor(kage-engine): migrate intake and coordinator throws to EngineError` |
| `a2eeed3` | `refactor(roster): migrate roster.ts throws to RosterError` |
| `c176921` | `feat(tooling): error docs generator, ESLint guard, CI errors:check step` |

---

## Antes / Después (snippets representativos)

### integrations-llm/src/client.ts

**Antes**:
```ts
throw new Error('Request timed out after 30 seconds');
// ...
return { type: 'auth_error', message: rawMsg || 'Invalid API key' };
```

**Después**:
```ts
throw new LLMError(ErrorCodes.LLM_TIMEOUT, 'Request timed out after 30 seconds', {
  retryable: true, httpStatus: 504,
});
// ...
return new LLMError(ErrorCodes.LLM_AUTH, rawMsg || 'Invalid API key', {
  httpStatus: 401, context: { provider: this.provider },
});
```

### sentinel/src/approval.ts

**Antes**:
```ts
throw new Error(`Approval ${approvalId} not found`);
throw new Error(`Approver role "${approver.role}" is not authorized...`);
```

**Después**:
```ts
throw new SentinelError(ErrorCodes.APPROVAL_NOT_FOUND, `Approval ${approvalId} not found`, {
  httpStatus: 404, context: { approvalId },
});
throw new SentinelError(ErrorCodes.APPROVAL_DENIED, `Approver role "${approver.role}" is not authorized...`, {
  httpStatus: 403, context: { role: approver.role },
});
```

### kage-engine/src/coordinator.ts

**Antes**:
```ts
throw new Error(`Run ${runId} not found`);
```

**Después**:
```ts
throw new EngineError(ErrorCodes.ENGINE_COORDINATOR_FAILED, `Run ${runId} not found`, {
  httpStatus: 404, context: { runId },
});
```

### roster/src/roster.ts

**Antes**:
```ts
throw new Error('Roster is not loaded. Unlock the roster first.');
throw new Error(`API Key for provider ${provider} not found in roster.`);
```

**Después**:
```ts
throw new RosterError(ErrorCodes.ROSTER_INVALID_DEFINITION, 'Roster is not loaded. Unlock the roster first.', {
  httpStatus: 500,
});
throw new RosterError(ErrorCodes.ROSTER_AGENT_NOT_FOUND, `API Key for provider ${provider} not found in roster.`, {
  httpStatus: 404, context: { provider },
});
```

---

## Conteos

| Métrica | Antes | Después |
|---------|-------|---------|
| `throw new Error(` total en `packages/` | 74 | **51** |
| `throw new Error(` en los 5 archivos migrados | 23 | **0** |
| NinjaError exports en `@ninja/contracts` | 0 | **11** (clase + 8 subclases + 2 helpers) |
| `ErrorCodes` entradas en catálogo | 0 | **14** |
| Tests añadidos en `errors.test.ts` | 0 | **35** |

---

## Gates verificados

| # | Check | Estado |
|---|-------|--------|
| 1 | `pnpm --filter @ninja/contracts typecheck` | ✅ verde |
| 2 | `pnpm --filter @ninja/integrations-llm typecheck` | ✅ verde |
| 3 | `pnpm --filter @ninja/sentinel typecheck` | ✅ verde |
| 4 | `pnpm --filter @ninja/kage-engine typecheck` | ✅ verde |
| 5 | `pnpm --filter @ninja/roster typecheck` | ✅ verde |
| 6 | `pnpm vitest run packages/contracts/src/errors.test.ts` | ✅ **35/35 tests** |
| 7 | `pnpm errors:check` | ✅ `14 error codes, up to date` |
| 8 | `rg "throw new Error(" <5 archivos migrados>` | ✅ **0 matches** |
| 9 | ESLint guard activo | ✅ `overrides` en `.eslintrc.cjs` |
| 10 | `docs/errors.md` presente | ✅ committed |
| 11 | `docs/adr/0001-*.md` + `0002-*.md` | ✅ committed |
| 12 | `.github/workflows/ci-minimal.yml` | ✅ committed con `errors:check` activo |

---

## Demo verificable

```ts
import { SentinelError, ErrorCodes, isNinjaError } from '@ninja/contracts';

try {
  // Simular un approval no encontrado
  throw new SentinelError(ErrorCodes.APPROVAL_NOT_FOUND, 'Approval abc-123 not found', {
    httpStatus: 404,
    context: { approvalId: 'abc-123' },
  });
} catch (e: unknown) {
  if (isNinjaError(e)) {
    console.log(e instanceof SentinelError);  // true
    console.log(e.code);                       // 'APPROVAL_NOT_FOUND'
    console.log(e.domain);                     // 'sentinel'
    console.log(e.httpStatus);                 // 404
    console.log(e.retryable);                  // false
    // In production: no stack leaked
    // In dev: stack truncated to 20 lines
    console.log(JSON.stringify(e));            // safe toJSON()
  }
}
```

---

## Próximo paso

Pausa para revisión. Si OK → PR `fix/epic-b-foundations → main`.
Siguiente bloque: **WP-B2** (env validation + sk-placeholder) y **WP-B3** (FallbackChain wiring).


---

## Post-audit fixes (2026-06-24)

### A2 — CI script requería Node 24 (bloqueador)
`scripts/generate-error-docs.ts` usaba `--experimental-strip-types` (Node 24 only). Fix: migrado a `scripts/generate-error-docs.mjs` en commit `9673b94`. Sin warnings, compatible con Node 22.

### A1 — Warning `MODULE_TYPELESS_PACKAGE_JSON`
Resuelto automáticamente al migrar a `.mjs` en A2.
