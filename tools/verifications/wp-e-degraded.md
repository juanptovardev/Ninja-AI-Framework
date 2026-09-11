# WP-E3/E2 — T7.3 Banner degradado + dialogs=0

**Estado:** ✅ implementado y verificado (rama `feat/wp-e-degraded-dialogs`)
**Refs:** PLAN_EJECUCION.md WP-E3/E2 · EV-20 · EXECUTION_BATCHES T7.3 · CONSISTENCIA_VISUAL.md

## Scope (archivos tocados)

- `apps/forge-console/components/DegradedModeBanner.tsx` — **nuevo**: banner global persistente. Condiciones: (a) WS `status==='closed'` de `useWsClient` (T4.2) o (b) `GET /health/ready` → 503 (poll ligero 15s). Texto `"Modo degradado: <motivo>"` + botón Reintentar (reconecta WS + re-check inmediato de readiness). Se oculta SOLO cuando la condición desaparece (`resolveDegradedReason` → null). Estilo: exclusivamente ui-kit (`Badge` + `Button`) y vars OKLCH existentes vía arbitrary values — cero CSS ad-hoc, cero HEX, cero `style={{}}`, cero tokens nuevos.
- `apps/forge-console/app/ClientLayout.tsx` — wiring: `<DegradedModeBanner />` en ambas ramas de render (con y sin shell), junto al `Toaster` existente.
- `apps/forge-console/src/__tests__/degraded-banner.test.ts` — **nuevo**: 10 tests de lógica pura (vitest node, sin jsdom — mismo precedente que `error-boundary.test.ts`).
- `docs/engineering/CONSISTENCIA_VISUAL.md` — **sin cambios**: el banner no requirió ningún token/visual nuevo (reutiliza `Badge variant="warning"` + vars existentes), así que no hubo nada que registrar.
- `tools/verifications/wp-e-degraded.md` — este dossier.

## PARTE 2 — dialogs archivo-por-archivo (EV-20)

Inventario exacto (aceptación #1):

```
git grep -oE "alert\(|confirm\(" -- apps/forge-console   → 0 resultados (exit 1 = no match)
```

Greps amplios de descarte (`alert\s*\(`, `[^A-Za-z]confirm\s*\(`, `window.alert|window.confirm|globalThis`) → 0 llamadas nativas. El único hit de `confirm` en el árbol es `app/settings/page.tsx` y son **identificadores** (`confirmOpen`, `confirmDelete`, `onConfirm`), no llamadas nativas — ese flujo ya implementa el patrón objetivo, por lo que **no hubo reemplazos que hacer (0→0)** y la semántica queda preservada por construcción:

- `app/settings/page.tsx` — **sin cambios**: delete-provider ya usa Radix `ConfirmDialog` (aceptar → `confirmDelete` borra provider + `toast`; cancelar → cierra + limpia `pendingDeleteId`) y sonner `toast` para save/errors. Es el patrón objetivo del prompt.
- Resto de `apps/forge-console/**` — cero llamadas nativas a `alert()`/`confirm()`.

## Tests (10 nuevos + 21 del área)

**degraded-banner.test.ts (10):** `closed` → visible `ws-closed` (prioridad sobre 503) · 503 con WS sano → `runtime-not-ready` · `reconnecting`+pendiente → oculto (sin parpadeo en backoff) · `connecting`/`open`+OK → oculto · `open`+sin chequear → oculto (sin falso positivo inicial) · mensajes con prefijo `Modo degradado:` + causa · `READINESS_POLL_MS === 15000`.

**Área existente (21, handlers intactos):** `settings-dedup` + `ws-client` + `error-boundary` → 21/21 verdes; ningún handler se rompe (no se tocó ningún handler).

## Evidence (comandos + output)

```
git grep -oE "alert\(|confirm\(" -- apps/forge-console → 0 resultados
pnpm --filter @ninja/forge-console typecheck → exit 0
  (nota: primer intento dio solo TS2307 por dist ausentes en el worktree
   aislado; `pnpm build` primero per prompt, sin tocar tsconfig)
pnpm build → Tasks: 35 successful, 35 total
pnpm vitest run degraded-banner.test.ts → Test Files 1 passed · Tests 10 passed
pnpm vitest run settings-dedup + ws-client + error-boundary → 3 passed · 21 passed
```

## E2E

Bloqueo documentado: los fixtures Playwright actuales no permiten matar el WS de forma determinista → el caso "banner reacciona a WS caído" queda pendiente de fixtures; cubierto a nivel unidad (lógica show/hide + wiring en `ClientLayout`). Igual precedente que wp-c3-ws (sustitución documentada, no omisión silenciosa).

## Dead code

Ninguno introducido por este WP (LISTA per prompt: vacía). Nota pre-existente fuera de alcance: socket WS ad-hoc de `ClientLayout.tsx` (token metrics), deuda ya listada en wp-c3-ws — no se toca (WIP=1).

## Riesgos / Notas

- E2E WS-caído pendiente de fixtures deterministas (ver §E2E).
- `CONSISTENCIA_VISUAL.md` intacto por diseño (cero tokens nuevos).
- TypeScript strict, cero `as any`, cero throws crudos en el código nuevo.
