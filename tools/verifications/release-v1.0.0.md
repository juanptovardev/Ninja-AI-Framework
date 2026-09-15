# Release v1.0.0 — T8.3 — Ritual Gate 3 §10.2

- **Estado: RELEASE BLOQUEADA** (ítems 2 de G3 rojos: `test:e2e` + `audit --prod`)
- Fecha: 2026-09-15 · Obrero T8.3 · worktree aislado `wt-e8-t83` · rama `feat/release-v1.0.0`
- HEAD al bloquear: `4868b40` — **sin** bump de versiones, **sin** commit `chore(release)`, **sin** tag, **sin** bundle, **sin** push. Nada borrado.

## Checklist Gate 3 §10.2 — ítem por ítem

### 1. G2 — VERDE ✅

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | 34/34 tasks OK (1m 9s) |
| `pnpm test` | 112 files · **1336/1336 passed** (42.1s) |
| `pnpm errors:check` | ✅ `docs/errors.md` up to date (47 error codes) |

Nota de entorno (sin cambios de código): en worktree recién creado el primer `typecheck` falló en
`@ninja/integrations-llm` con `Cannot find module '@ninja/common-utils'` — su `tsconfig.json` local
(no extiende el base) resuelve el paquete vía workspace link + `types: dist/index.d.ts`, y `dist/`
está gitignored. Tras `pnpm build` (necesario para G3 de todos modos), typecheck 34/34 verde.

### 2. G3 — ROJO ❌

**2a. `pnpm build`: 35/35 tasks OK** ✅ (FULL TURBO, 6.7s).

**2b. `pnpm test:e2e`: 8 failed / 8 passed (1.6m)** ❌ — **no es falta de entorno**: `.env` existe
(LLM_PROVIDER/LLM_BASE_URL/LLM_API_KEY/LLM_DEFAULT_MODEL), Playwright subió runtime :3141 y
forge-console :3001 correctamente (los 401 prueban que el runtime respondió). Diagnóstico:

1. `tests/e2e/api-endpoints.spec.ts` — 4/4 fallan con **HTTP 401** (esperado 200/403/400/200).
   Causa: auth API-key de WP-B11 (`apps/kage-runtime/src/server.ts:146-160`, ADR-0008) exige header
   `X-Ninja-Key` en toda ruta no pública; los specs no lo envían y ningún env activa el escape hatch
   `NINJA_AUTH_DISABLED=true` en el `webServer` de Playwright (`playwright.config.ts:25-38`).
   Suite **stale desde WP-B11**: ni `cierre-etapa-5/6/7.md` registran corrida de e2e.
2. `tests/e2e/dashboard-navigation.spec.ts` — 3/3 fallan ("Mission Control", "System Health",
   nav button "Health" no encontrados) + `tests/e2e/office-live.spec.ts` — 1/2 (heading Office/Agent/Grid).
   Causa: **regresión e2e de T8.2** — `EulaGate.tsx` no monta los children hasta aceptar el EULA
   (`eula.accepted.version` en localStorage); el contexto de navegador de Playwright arranca vacío y
   los specs no aceptan el EULA. El merge `4868b40` (WP-G3) no actualizó la suite. Posible efecto
   sumado de textos literales vs i18n es/en (a verificar tras montar el árbol).

**2c. `pnpm audit --prod`: 29 vulnerabilidades — 10 moderate / 17 high / 2 critical** ❌
(alto por paquete):

| Paquete | Severidades | Rango vulnerable | Fix recomendado |
| --- | --- | --- | --- |
| `next` | **2 critical** + 3 high + 5 moderate | ≥16.0.0 <16.3.3 (pin actual 16.2.7) | ≥16.3.3 |
| `fast-uri` | 5 high | ≥3.0.0 <3.1.6 | ≥3.1.6 (el override actual = 3.1.2 quedó obsoleto) |
| `postcss` | 2 high + 2 moderate | ≤8.5.22 | ≥8.5.23 |
| `sharp` | 2 high | <0.35.4 | ≥0.35.4 |
| `nanoid` | 2 high | <3.3.18 | ≥3.3.18 |
| `find-my-way` | 1 high | ≤9.6.0 | ≥9.7.0 |
| `fastify` | 2 moderate | <5.12.1 | ≥5.12.1 |
| `baseline-browser-mapping` | 1 moderate | ≥2.0.0 <2.11.0 | ≥2.11.0 |

La deuda heredada **documentada** (`docs/security/dependency-audit.md`) son solo 2 moderate
(`postcss` GHSA-qx2v-qp2m-jg93, `ws` GHSA-58qx-3vcg-4xpx). Aquí hay **high/critical NUEVAS** →
la ERRATA 13 ordena DETENERSE y escalar. No aplicable como "heredadas documentadas".

### 3. Secret scan §6.5 — 0 hits reales ✅ (con nota metodológica)

Comando corregido: el `git rev-list -20` del prompt congelado **falla**; se usó
`git grep -IE "sk-[A-Za-z0-9]{10,}|api[_-]?key\s*[:=]|Bearer [A-Za-z0-9]{15,}" $(git rev-list -n 20 HEAD)`.
Salida cruda: hits **únicamente en documentación histórica** — referencias nombradas a
`sk-placeholder` en `docs/adr/0004`, `docs/security/security-review-epic-a-b.md`,
`tools/enterprise-progress.md` y `tools/verifications/wp-b1/b2.md`; ya clasificadas y aceptadas en
la revisión de seguridad de Epic A/B ("0 en código, solo refs históricas en docs/dossiers").
**Cero secretos reales en código** (0 hits de `Bearer …`, 0 de `sk-…` con formato de clave,
0 de `api_key =` en `apps/`/`packages/`).

### 4. CHANGELOG.md — PENDIENTE (no tocado por el bloqueo)

El archivo aún no tiene sección `## [1.0.0]`; las fases figuran como `Unreleased — EPIC B/C`.
La conversión Keep-a-Changelog (F0→F5, breaking changes prominentes) queda para el reintento.

### 5. Bump lockstep — NO EJECUTADO (pre-verificado)

Listado con `node -e` antes de tocar: 30 packages ya en `1.0.0`; exactamente **6** en `0.1.0`
(`@ninja/forge-lab`, `@ninja/installer`, `@ninja/integrations-fs`, `-git`, `-http`, `-shell`)
— coincide con la ERRATA 6. Cero ediciones.

### 6. Tag `v1.0.0` — NO creado. 7. Bundle — NO creado. 8. No push, no borrados.

## Instalador (ERRATA 12) — ✅ ejecutado con éxito

`node scripts/build-installer.mjs` → `dist-installer/ninja-ai-framework-1.0.0-win-x64-portable.zip`
(8.52 MB; runtime bundle `server.bundle.cjs` 769.6 KB con 0 requires de `@ninja/*`; stage sin
symlinks/junctions; VERSION + manifest escritos). El artifact es sano pero **no** legitima el release.

## Postmortem ligero

- **Lead time F0 → candidato v1.0.0**: snapshot F0 `b8c9e2a` (2026-06-24) → HEAD `4868b40` (2026-09-15) = **84 días** (≈12 semanas).
- **Hotfixes conocidos**: P0 de la auditoría 2026-08-24 (preflight CORS con `X-Ninja-Key`; identidad de approver en approvals, Directiva Ley 6).
- **Deuda restante para la nota de release**: EXC-3 office-grid (cobertura React+WS hook requiere jsdom — ADR futura), DEBT(T6.4)/ADR-0013 (umbrales de throws en prod), `kage-engine` y `vault` con cobertura <70, `companion-extension` de-scopado a F5+.

## Veredicto y camino sugerido (escalación al orquestador — §15, sin excepciones)

Gate 3 rojo en 2 sub-ítems ⇒ **v1.0.0 NO se taggea**. Recomendación en 3 pasos:

1. **WP-e2e-fix** (toca solo `tests/e2e/` + `playwright.config.ts`): header `X-Ninja-Key` en specs
   de API (o `NINJA_AUTH_DISABLED=true` en el env del `webServer` de Playwright), aceptación del EULA
   vía `addInitScript` en `navigateTo`, y revisión de literales vs i18n es/en.
2. **Hotfix dependencias**: `next` ≥16.3.3, override `fast-uri` ≥3.1.6, `sharp` ≥0.35.4,
   `nanoid` ≥3.3.18, `find-my-way` ≥9.7.0, `postcss` ≥8.5.23; re-correr G2 completo + build + e2e + audit.
3. **Re-ejecutar este ritual T8.3** sobre `feat/release-v1.0.0` (el HEAD habrá avanzado; dossier
   presente = evidencia re-ejecutable).
