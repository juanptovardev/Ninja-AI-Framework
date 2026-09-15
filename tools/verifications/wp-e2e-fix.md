# WP-e2e-fix — 8 tests E2E rotos: 3 causas raíz, 16/16 verde

**Fecha:** 2026-09-15 · **Rama:** `feat/wp-e2e-fix` · **Alcance:** `tests/e2e/**`, `apps/forge-console/lib/api.ts`, este dossier.

## Diagnóstico (3 causas raíz, verificadas con snapshot/errores, no claims)

1. **401 en 4 specs API** (`api-endpoints.spec.ts`): requests sin header. El runtime responde 401 **correctamente** (ADR-0008); el test no autenticaba. Roto desde F0 — `NEXT_PUBLIC_RUNTIME_API_KEY` nunca fue seteada.
2. **4 specs de texto no encontraban la UI** (dashboard-navigation, office-live): (a) T8.2 migró el chrome a next-intl (`es` default) y los specs no sembraban locale; (b) **descubierto durante el fix**: el **EulaGate** de T8.2 bloquea primera-ejecución — sin `eula.accepted.version`, el dashboard nunca renderiza (el snapshot mostró el diálogo EULA cubriendo todo).
3. **Causa raíz de producto (la más valiosa)**: `lib/api.ts` nunca autenticaba los fetch del navegador — `authHeaders()` solo leía `NEXT_PUBLIC_RUNTIME_API_KEY` (no configurada). **La UI no podía hablar autenticado con el runtime**: `/api/health/pulse` → 401 → página `/health` con `!data → return null` → `main` vacío. Evidencia: snapshot del error-context mostraba sidebar completo + `main [ref=e93]` vacío.

## Fix

| Archivos | Qué |
|----------|-----|
| `tests/e2e/helpers/e2e-utils.ts` | `getRuntimeKey()` lee `~/.ninja/runtime.key` (fail-fast si falta/vacía) · `runtimeAuthHeaders()` · `seedLocale()` extendido a seed de primera-ejecución: locale (cookie `locale` + `ninja.locale`), EULA (`eula.accepted.version=1.0.0`) y **`ninja.runtime.key` en localStorage** |
| `apps/forge-console/lib/api.ts` | `authHeaders()` ahora lee env **o** `localStorage['ninja.runtime.key']` — el cliente browser local-first autentica con la key configurada en la máquina (mejora de producto encontrada por el E2E, single-user/single-machine por diseño) |
| `api-endpoints.spec.ts` | 4 requests autenticados vía `runtimeAuthHeaders()` |
| `dashboard-navigation.spec.ts` + `office-live.spec.ts` | `beforeEach` → `seedLocale(page,'en')` |

Decisión de diseño (senior): la key en localStorage es el mecanismo de auth del cliente browser en local-first (el usuario pega su key en settings/via installer; el E2E la siembra del keyfile del runtime). NO se hicieron endpoints públicos; NO se cambió el default locale (`es` queda).

## Evidencia

- `npx playwright test` → **16 passed / 0 failed (33.3s)** (antes 8F/8P)
- `pnpm --filter @ninja/forge-console typecheck` → 0 errores
- `npx vitest run apps/forge-console` → 81/81 (sin regresión unit)

## Hallazgos extra (no fixeados — scope)

- **Token Budget / Memory Layers muestran `NaN%`** en el rail cuando no hay run activa (`live-data.ts` divide entre datos ausentes). Cosmético pero real — candidato a WP de UI polish.
- Banner "Degraded mode: real-time connection lost" visible durante los tests: los e2e arrancan runtime en :3141 pero el WS de la página puede conectar tarde; el banner reacciona correctamente (comportamiento F4.5 correcto).

## Proceso

El worker (qwen3.8-flash, 1ª ronda) murió tras escribir los fixes A+B (auth + locale, sin EULA); el orquestador completó: diagnóstico del EulaGate vía snapshot, seed de EULA, y el fix de producto en `lib/api.ts` (causa raíz real), re-ejecutó la suite 3 veces hasta 16/16.
