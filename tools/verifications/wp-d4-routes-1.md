# WP-D4 — Extracción de rutas 1/2: engine / approvals / arsenal (T6.3)

**Fecha:** 2026-09-10 · **Rama:** `feat/wp-d4-routes-1` · **Base:** `main` (f349b05) ·
**Alcance:** `apps/kage-runtime/src/server.ts` (adelgazamiento) + `apps/kage-runtime/src/routes/` + dossier. Nada más.

## Qué se hizo

Extracción del primer lote de rutas inline de `server.ts` (composition root) a módulos en
`apps/kage-runtime/src/routes/`, siguiendo el patrón `register<Domain>Routes(server, deps)` ya usado
por `routes/health.ts`. **Cero cambios de comportamiento** — la suite queda idéntica (1228/1228).

| Archivo nuevo | Rutas movidas |
| ------------- | ------------- |
| `routes/engine.routes.ts` | POST `/api/engine/interview`, POST `/api/engine/interview/:id/answers`, POST `/engine/submit` (EngineSubmitSchema), GET `/engine/run/:id`, POST `/engine/run/:id/approve`, POST `/engine/run/:id/pause`, POST `/engine/run/:id/resume`, POST `/engine/run/:id/cancel`, GET `/engine/runs` (9) |
| `routes/approvals.routes.ts` | GET `/api/approvals`, POST `/api/approvals/:id/approve`, POST `/api/approvals/:id/reject`, GET `/api/audit`, GET `/api/commits` (5) + `deriveApprover()` movida tal cual (Ley 6) |
| `routes/arsenal.routes.ts` | GET `/api/arsenal`, GET `/api/artifacts`, GET `/api/artifacts/:id`, POST `/api/vault/write` (VaultWriteSchema) (4) |

`server.ts`: eliminados los 18 handlers inline; se inyectan las tres llaves de registro en su posición
original. El orden relativo de rutas se preserva; `POST /api/vault/write` queda registrado antes que
`GET /api/vault/context`, sin conflicto (método + path estáticos distintos). Todos los deps se siguen
construyendo en `server.ts` y se pasan tipados por interface (`EngineRouteDeps`, `ApprovalsRouteDeps`,
`ArsenalRouteDeps`).

### Sin NUEVOS `as any` (regla DEBT_F34_ANY)

Los 24 `as any` que vivían en los handlers movidos **fueron eliminados, no trasladados**: params tipados
con genéricos de Fastify, `ID = string` (contracts) elimina el cast en `approveRequest/rejectRequest`,
`MemoryLayer` de Vault coincide con el enum de `VaultWriteSchema` (el `layer` pasa directo), y los métodos
soft de entrevista se tipan vía intersection `KageEngine & EngineInterviewMethods` manteniendo el guard
`typeof === 'function'` original.

```
git diff main -- apps/kage-runtime/src/ | Select-String "as any"   → solo líneas "-" (eliminadas), 0 añadidas
```

## Evidencia (re-ejecutable)

### 1. `pnpm build` — verde

```
Tasks:    35 successful, 35 total
```

### 2. `pnpm typecheck` — verde

```
Tasks:    34 successful, 34 total
```

### 3. `pnpm test` — suite idéntica al baseline (102 files / 1228 tests)

```
 Test Files  102 passed (102)
      Tests  1228 passed (1228)
 Start at    16:04:22
 Duration    38.50s
```

### 4. `pnpm errors:check` — verde

```
✅ docs/errors.md is up to date (19 error codes).
```

### 5. Líneas `server.ts` (Measure-Object -Line) — 1022 → 879 (−143, −14%)

```
(Get-Content apps/kage-runtime/src/server.ts | Measure-Object -Line).Lines   → 879
```

Reducción menor al ~40% estimado en la errata: el alcance T6.3 mueve exactamente las rutas pedidas
(18 handlers ≈ 143 líneas); el segundo lote (T6.4, meta <400) continúa la extracción. El conteo es
honesto y relativo, la suite no cambió.

### 6. ESLint — 0 errores (4 archivos) · Prettier — limpio

```
npx eslint --config eslint.config.mjs <4 archivos>   → 0 errors (12 warnings pre-existentes de server.ts)
npx prettier --check <4 archivos>                    → All matched files use Prettier code style!
```

`pnpm test` + `tsc --noEmit` re-ejecutados DESPUÉS de `prettier --write` (verificación post-formato idéntica).

### 7. E2E — BLOQUEADO por entorno del worktree de aislamiento

```
❌ Kage Runtime cannot start — invalid environment variables:
   - LLM_BASE_URL: Required
   - LLM_API_KEY: Required
   - LLM_DEFAULT_MODEL: Required
```

El worktree temp no tiene `.env` (solo `.env.example`, gitignored), así que el runtime no arranca y el
`webServer` de Playwright hace timeout (120 s). **No es regresión de código**: en el entorno del worktree
nunca fue ejecutable. El arranque del servidor y rutas queda cubierto por los test unitarios que bootean
`createServer()` y pasan en verde (`server.test.ts`, `health.test.ts`, `error-handler.test.ts`,
`approver-identity.test.ts`, `artifacts-anchor-filter.test.ts`, `commits-endpoint.test.ts`).

## Veredicto

- [x] `pnpm build` verde
- [x] `pnpm typecheck` verde
- [x] `pnpm test` — mismo conteo que baseline (1228/1228, 102 files)
- [x] `pnpm errors:check` verde
- [x] 0 `as any` nuevos (diff solo elimina)
- [x] `server.ts` 1022 → 879 líneas
- [x] Prettier/ESLint sin errores
- [x] E2E bloqueado por entorno documentado (sin `.env` en worktree)
- [x] Fuera de alcance: NINGUNA (solo `server.ts`, 3 archivos nuevos, dossier)