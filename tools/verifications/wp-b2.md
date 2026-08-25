# WP-B2 · Verification Dossier
**Branch**: `fix/epic-b-foundations`
**Date**: 2026-06-24
**ADR**: docs/adr/0004-env-validation-strategy.md

---

## Resumen

- **Archivos creados**: `env-schema.ts`, `__tests__/env-schema.test.ts`, `.env.example`
- **Archivos modificados**: `index.ts` (wire loadEnv), `server.ts` (remove sk-placeholder, LLMProvider cast)
- **Antes/Después**: `sk-placeholder` 1 → 0; plaintext LLM_BASE_URL log 1 → 0
- **Tests añadidos**: 16 (todos verdes)

---

## Antes / Después

### apps/kage-runtime/src/server.ts:150
**Antes**:
```ts
const apiKey = process.env.LLM_API_KEY || 'sk-placeholder'; // Evitar crash si no hay key
```
**Después**:
```ts
const apiKey = process.env['LLM_API_KEY']!; // validated by loadEnv() at boot (ADR-0004)
```

### apps/kage-runtime/src/index.ts
**Antes**:
```ts
console.log(`[dotenv] LLM_BASE_URL = ${process.env.LLM_BASE_URL}`);
```
**Después**:
```ts
const env = loadEnv();
const urlHost = new URL(env.LLM_BASE_URL).host;
console.log(`[env] LLM_BASE_URL host = ${urlHost} (model=${env.LLM_DEFAULT_MODEL})`);
```

---

## Conteos

| Métrica | Antes | Después |
|---|---|---|
| Archivos creados | 0 | 3 (`env-schema.ts`, test, `.env.example`) |
| Archivos modificados | 0 | 2 (`index.ts`, `server.ts`) |
| `sk-placeholder` ocurrencias | 1 | **0** |
| Log LLM_BASE_URL en plaintext | 1 | **0** |
| Tests añadidos | 0 | **16** |
| Tests pasando (post-WP) | - | **16/16** |
| NINJA_LLM_FAIL_MODE en EnvSchema | No | **Sí** (`strict` default) |
| Variables validadas al boot | Ninguna | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_DEFAULT_MODEL` + 6 opcionales |
| Typecheck `@ninja/kage-runtime` | ✅ | ✅ |

---

## Gates verificados

| Check | Estado |
|---|---|
| `pnpm --filter @ninja/kage-runtime typecheck` | ✅ |
| Tests `env-schema.test.ts` (16 tests) | ✅ |
| `rg "sk-placeholder" apps/ packages/` → 0 | ✅ |
| `rg "LLM_BASE_URL.*=.*\${process\.env" apps/kage-runtime/` → 0 | ✅ |
| `.env.example` presente con all variables | ✅ |
| `NINJA_LLM_FAIL_MODE` en schema (`strict`/`legacy` enum) | ✅ |

---

## Demo

```bash
# Boot sin LLM_API_KEY
LLM_BASE_URL=https://api.openai.com/v1 LLM_DEFAULT_MODEL=gpt-4o-mini pnpm runtime:dev
# ❌ Kage Runtime cannot start — invalid environment variables:
#   - LLM_API_KEY: LLM_API_KEY requerida (≥8 chars)
```

---

## Próximo paso
WP-B3 (FallbackChain wiring) depende de `NINJA_LLM_FAIL_MODE` ya en el schema ✅.
