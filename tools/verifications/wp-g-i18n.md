# WP-G3 — T8.2 EULA primera ejecución + andamiaje i18n es/en

**Estado:** ✅ implementado y verificado (rama `feat/wp-g3-eula-i18n`) — PARCIAL por diseño: chrome migrado, contenido dinámico de vistas no migrado (ver §Limitaciones)
**Refs:** PLAN_EJECUCION.md WP-G3 · EXECUTION_BATCHES T8.2 · CONSISTENCIA_VISUAL.md · AGENTS.md (native names)

## Scope (archivos tocados)

### EULA (primera ejecución, bloqueante)

- `apps/forge-console/lib/kv-store.ts` — **nuevo**: contrato `KeyValueStore` (localStorage-like) + `resolveKeyValueStore()` seguro (null sin DOM o acceso bloqueado). Inyectable en tests (entorno node, sin jsdom).
- `apps/forge-console/lib/eula.ts` — **nuevo**: lógica pura de persistencia. Clave canónica `eula.accepted.version` + `EULA_VERSION = '1.0.0'`. `isEulaAccepted` exige la versión EXACTA (términos nuevos → se vuelve a exigir); `persistEulaAcceptance` es no-op silencioso sin almacén o con fallo de cuota (cero throws crudos).
- `apps/forge-console/lib/ucc-store.ts` — ciclo de vida `eulaStatus: 'checking' | 'pending' | 'accepted' | 'declined'` + acciones `checkEula`/`acceptEula`/`declineEula` con storage opcional inyectable. `'checking'` en SSR e hidratación = misma salida (sin hydration mismatch).
- `apps/forge-console/components/EulaGate.tsx` — **nuevo**: gate de primera ejecución. Mientras no esté aceptado, el árbol de children NO se monta (el dashboard y sus fetches no existen hasta aceptar).
- `apps/forge-console/components/EulaScreen.tsx` — **nuevo**: pantalla bloqueante con 3 variantes (checking=Spinner, pending=cláusulas + Aceptar/Declinar, declined=mensaje de cierre). solo ui-kit (`Button`/`Card`/`Spinner`) + vars `--ninja-*` arbitrary values; z-modal 1200 (CONSISTENCIA_VISUAL §2.3); cero HEX, cero `style={{}}`, cero tokens nuevos.
- Wiring: `app/ClientLayout.tsx` — `ClientLayout` envuelto en `<EulaGate>` (el gate aplica a todas las rutas, `/setup` incluido); `<LocaleSwitcher />` añadido en ambas ramas de render.

### i18n es/en (next-intl, sin enrutado de locales)

- `apps/forge-console/package.json` + `pnpm-lock.yaml` — `next-intl@^4.14.5` (única dep nueva; justificación: requisito T8.2, i18n nativo estándar para Next 16).
- `apps/forge-console/next.config.ts` — `createNextIntlPlugin('./i18n/request.ts')`.
- `apps/forge-console/i18n/request.ts` — **nuevo**: `getRequestConfig` lee la cookie espejo `locale` (fallback `es`). Nota: leer cookies hace dinámicas las rutas — aceptable, el console es client-heavy por diseño.
- `apps/forge-console/lib/locale.ts` — **nuevo**: lógica pura: `normalizeLocale` (solo `es`/`en`), `readStoredLocale` (fallback `DEFAULT_LOCALE='es'`), `buildLocaleCookie` (`path=/; max-age=1año; samesite=lax`), `applyLocale` (persiste localStorage + espeja cookie para SSR + `router.refresh()`, deps inyectables).
- `apps/forge-console/components/LocaleSwitcher.tsx` — **nuevo**: control flotante ES/EN (no depende de app-shell, fuera de alcance). Fuente de verdad localStorage; al montar resincroniza si diverge de lo servido; `useTransition` + `aria-pressed`.
- `apps/forge-console/messages/es.json` / `messages/en.json` — **nuevos**: 141 líneas cada uno; bloques `banner`, `palette`, `locale`, `eula`, `wizard`, `pages.*` con PARIDAD exacta de claves (test lo verifica).

### Chrome migrado (textos UI → `t()`)

- `app/setup/page.tsx` — wizard completo: `useTranslations('wizard')`; `STEP_MESSAGE_KEY` mapea `StepId` → clave; etiquetas/descripciones/badges/error/éxito/tour vía mensajes con params (`doctorBadge {passed}/{total}`, `connLatency {ms} · {count}`, etc.). Los TÍTULOS de las vistas del tour son nombres nativos (Mission Control, Office, Arsenal, Settings) y NO se traducen (AGENTS.md: native names). `WIZARD_STEPS` (store) queda como ids técnicos; el label se resuelve por i18n.
- `components/CommandPalette.tsx` — `palette.*`: placeholder/aria/empty/group/hints; `COMMANDS` re-estructurado a `{id, target, action: 'goTo'|'open'}` → `t(action, {target})`; `target` son nombres nativos sin traducir.
- `components/DegradedModeBanner.tsx` — `banner.*`: badge/prefix/retry/aria/razones. `degradedMessage(reason, translate?)` mantiene firma retrocompatible con fallback ES importado desde `messages/es.json` → los 10 tests existentes de `degraded-banner.test.ts` siguen verdes sin tocarlos.

## Tests (25 nuevos + área)

- `src/__tests__/eula.test.ts` — **nuevo** (13): primera ejecución → false; versión exacta → true; versión vieja → false (renovación); null/almacén que lanza → false sin throw; `persistEulaAcceptance` escribe clave canónica / no-op sin almacén / no propaga cuota; ciclo del store: `checking` inicial → `checkEula` pending/accepted → `acceptEula` persiste (el re-check ya no pregunta) → `declineEula` declined sin persistir.
- `src/__tests__/locale.test.ts` — **nuevo** (12): normalización (solo `es`/`en`; rechaza `ES`/`fr`/no-strings), lectura persistida con fallback `es`, serial de cookie espejo, `applyLocale` (escribe storage + cookie + refresh 1×; sin deps solo refresca; cuota rota no impide cookie+refresh; ronda es↔en), `SUPPORTED_LOCALES === ['es','en']`, paridad de claves es.json/en.json (flatten recursivo).
- Patrón repo respetado: vitest entorno node, SIN jsdom; DOM/almacén inyectados via `KeyValueStore`/`doc` falsos (precedente: degraded-banner / onboarding-store).

## Evidence (comandos + output, 2026-09-15)

```
pnpm build                          → Tasks: 35 successful, 35 total (Cached 34; forge-console
                                      rebuild: "Compiled successfully in 51s", TypeScript 17.8s,
                                      15/15 static pages, exit 0)
pnpm --filter @ninja/forge-console typecheck
                                    → exit 0 (0 errores, tras build por orden de workspaces —
                                      el TS2307 de la sesión anterior era dist ausente, no código)
pnpm vitest run                     → Test Files 112 passed (112) · Tests 1336 passed (1336)
pnpm vitest run eula.test.ts locale.test.ts
                                    → Test Files 2 passed (2) · Tests 25 passed (25)
pnpm errors:check                   → ✅ docs/errors.md is up to date (47 error codes)
```

Nota: `@ninja/forge-console` no tiene script `lint` en el repo (turbo lo salta) — gates reales: typecheck + test + errors:check + build.

## Limitaciones (parcial por diseño — andamiaje)

- **Contenido dinámico NO migrado**: páginas de datos (mission-control, office, artifacts, approvals, plan, health, roster, arsenal, discovery, settings) conservan sus literales; solo el CHROME (wizard setup, command palette, degraded banner, shell de layout) quedó i18n-ready. La migración full de vistas corresponde a futuros WPs con el catálogo de claves ya establecido.
- **Sin middleware next-intl / enrutado por locale** (`/es/...`): elección deliberada — cookie espejo + `router.refresh()` mantiene URLs estables y zero cambios en rutas existentes (menor riesgo para E2E).
- **app-shell/office-grid no tocados** (fuera de alcance del WP): el switch de idioma es control flotante propio.
- E2E Playwright no ejercita EULA/switch todavía (los specs actuales arrancan con EULA no aceptada en localStorage fresh → el gate bloquea: ver riesgo abajo).

## Riesgos / Notas

- El EULA gatea TODO el render client-side: un E2E nuevo deberá aceptar el EULA (p. ej. `page.addInitScript` fijando `localStorage['eula.accepted.version']='1.0.0'`) o cubrir la pantalla como caso. El suite actual (1336 tests) es unitario/integración node y no monta el DOM del console → verde sin cambios.
- Renovación de términos: subir `EULA_VERSION` fuerza re-acepto en todos los equipos (comportamiento buscado).
- TypeScript strict, cero `as any`, cero throws crudos nuevos; `@ninja/events` no aplica (capa de vista); no se tocó `apps/kage-runtime` ni versiones de paquetes.
- `CONSISTENCIA_VISUAL.md`: sin tokens nuevos (EulaScreen/LocaleSwitcher reutilizan vars y z-escalas existentes) — nada que registrar.
