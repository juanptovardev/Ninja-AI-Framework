# Plan de Ejecución v2 — Ninja AI Framework
> **Versión:** 2.0 · **Fecha:** 2026-08-24 · **Sustituye:** v1 (2026-08-24, misma fecha — la v1 fue la base de auditoría)
> **Contexto:** producto comercial privado, desarrollo cerrado, local-first Windows. Repo remoto GitHub a privatizar antes de cualquier push.
> **Jerarquía documental:** Directiva (`docs/architecture/coherencia-estructural.md`) → Quality Manual (`docs/engineering/QUALITY_MANUAL.md`) → **este plan** → `AGENTS.md`.
> **Registro de auditoría (estado verificado origen):** `docs/architecture/og/audit-2026-08-24.md` — los datos de línea base de este plan provienen de ahí. No re-verificar lo ya verificado; confiar en la auditoría y re-medir solo con los comandos de §10.

---

## Cómo usar este documento (instrucciones para el agente ejecutor)

> **⚠️ MODO DE EJECUCIÓN RECOMENDADO:** no ejecutar este plan ítem a ítem en una sola sesión. Usar
> **`docs/engineering/EXECUTION_BATCHES.md`** — las 9 etapas con ~35 prompts congelados, calibrados por
> dificultad para modelos de contexto corto, con soporte para terminales paralelas (worktrees) y
> auditoría del cerebro al cierre de cada etapa. Este documento define el QUÉ y los gates; EXECUTION_BATCHES
> define el CÓMO operativo sesión por sesión.

1. **Orden de lectura obligatorio antes de tocar código:** Directiva §1–§6 → Quality Manual §1–§6 → este plan completo.
2. **Ejecución estrictamente secuencial dentro de cada fase.** No reordenar F0. La FASE BD ya está COMPLETA (ver §2).
3. **Cada ítem es atómico:** ID, archivos, criterio de aceptación como comando verificable, estimación P50/P80. Un ítem no se cierra sin evidencia en el dossier (`tools/verifications/`).
4. **Los números de línea de `server.ts` (p. ej. `:102`, `:555`) provienen de HEAD de `fix/epic-b-foundations` + working tree 2026-08-24.** Si el archivo cambió, localizar por contenido (`allowedHeaders`, `api-user`), no por número.
5. **Nunca `git add -A` ciegamente:** revisar `git status` antes de cada staging. El `.gitignore` ya protege `og/` y secretos, pero la disciplina es manual hasta F1.
6. **Estimaciones:** P50 = escenario probable, P80 = con imprevistos. d = días laborables del operador.
7. **Al cerrar cada fase:** ejecutar el phase gate (criterios de salida), re-medir KPIs (§10), actualizar `tools/enterprise-progress.md` y §8/§9 de este plan, crear bundle de backup (Manual §10.4).

---

## 1. Estado actual (resumen)

| Aspecto | Estado |
|---------|--------|
| Branch | `fix/epic-b-foundations`, 92 commits sobre `main` |
| Working tree | ~30 archivos: WP-C1+C2 completos sin commit + base documental de esta fase |
| EPICs | A ✅ · B ✅ · C ~30% (C1/C2 sin commit) · D ~5% · E/G 0% · F 10% |
| Remoto GitHub | `juanptovardev/Ninja-AI-Framework` — **PÚBLICO** (privatizar antes de push) |
| CI | Eliminada en limpieza (`.github/` borrado) — los gates serán locales (FASE 1) |
| Bugs P0 | CORS `X-Ninja-Key` · approver hardcodeado |
| Detalle completo | `docs/architecture/og/audit-2026-08-24.md` |

---

## 2. FASE BD — Base documental ✅ COMPLETADA (2026-08-24)

| ID | Entregable | Archivo | Estado |
|----|------------|---------|--------|
| BD.1 | Quality Manual normativo (16 secciones, inglés) | `docs/engineering/QUALITY_MANUAL.md` | ✅ |
| BD.2 | Auditoría archivada como registro inmutable | `docs/architecture/og/audit-2026-08-24.md` | ✅ |
| BD.3 | Este plan v2 (IDs, gates, P50/P80, trazabilidad, riesgos) | `PLAN_EJECUCION.md` | ✅ |
| BD.4 | Reglas de trackabilidad git para docs/engineering | `.gitignore` | ✅ |
| BD.5 | AGENTS.md apuntando a la nueva estructura | `AGENTS.md` | ✅ |

*Nota: los archivos BD.1–BD.5 quedan sin commit hasta F0.0 (primer commit de la fase siguiente).*

---

## 3. FASE 0 — Cierre y blindaje
> **Objetivo:** todo el trabajo existente commitado, bugs P0 resueltos, main como fuente de verdad, respaldo creado, remoto privado sincronizado.
> **Entrada:** working tree como está hoy; FASE BD completa.
> **Estimación:** P50 2 d · P80 3.5 d

| ID | Tarea | Archivos | Criterio de aceptación (comando → esperado) | Est. |
|----|-------|----------|---------------------------------------------|------|
| F0.0 | **Commit base documental** — stagear los 5 archivos de FASE BD + `.gitignore` + `AGENTS.md` | `docs/engineering/QUALITY_MANUAL.md`, `docs/architecture/og/audit-2026-08-24.md` (NO — og/ está ignorado, queda local), `PLAN_EJECUCION.md`, `.gitignore`, `AGENTS.md` | `git status --porcelain` ya no lista estos archivos tras commit · `git log -1 --format=%s` = `docs: engineering base — Quality Manual + Execution Plan v2` | 0.1 d |
| F0.1 | **Commit WP-C1** (error handler global). Stagear solo los archivos de C1; si `server.ts` mezcla C1+C2, usar `git add -p` para dividir | `apps/kage-runtime/src/error-handler.ts`, `apps/kage-runtime/src/__tests__/error-handler.test.ts`, `server.ts` (parte try/catch), `docs/adr/0009-*` (en disco, sin trackear), `tools/verifications/wp-c1-closure.md` (idem) | `pnpm typecheck && pnpm test` → exit 0 · `git grep -c "try {" -- apps/kage-runtime/src/server.ts` → ≤15 · commit `feat(kage-runtime): global error handler + not-found handler (WP-C1) Refs: ADR-0009` | 0.3 d |
| F0.2 | **Commit WP-C2** (resiliencia). Stagear resto del trabajo en vuelo | `packages/common-utils/src/{circuit-breaker,circuit-breaker.test,timeouts,index}.ts`, `packages/contracts/src/errors.ts`, `packages/integrations-http/src/{retry,retry.test}.ts`, `packages/integrations-llm/src/{client,classify-error}.ts` + `package.json`, `packages/integrations-lightrag/src/lightrag-client.ts` + `package.json`, `packages/agent-runtime/src/{schema,executor.test,executor-fallback.test}.ts`, `docs/adr/0010-*`, `docs/errors.md`, `pnpm-lock.yaml` | `pnpm typecheck && pnpm test` → exit 0 · `pnpm errors:check` → exit 0 · commit `feat(common-utils,integrations-llm,integrations-lightrag): CircuitBreaker + timeouts + Retry-After (WP-C2) Refs: ADR-0010` | 0.4 d |
| F0.3 | **Commit de residuales** — archivos generados/incidentales que no pertenecen a C1/C2 | `apps/forge-console/{next-env.d.ts,tsconfig.json}`, `packages/events/errors.txt`, `tools/verifications/wp-b1.md`, `tests/helpers/mock-event-bus.test.ts` | `git status --porcelain` → vacío (salvo lo ya commitado) · commit `chore: sync generated files + wp-b1 dossier errata` | 0.1 d |
| F0.4 | **Fix referencias rotas** | `docs/architecture/fuentes-guia.md` §6 (rutas `tools/coherencia-estructural.md`→`docs/architecture/coherencia-estructural.md`, idem fuentes-guia; eliminar/asar filas de `vault-memory-layers.md` y `plan-construccion-fases.md` — no existen), `package.json` (eliminar script `scaffold:workspace` — su script no existe) | `git grep -n "tools/coherencia" -- "*.md" "*.json"` → 0 · `node -e "console.log(require('./package.json').scripts['scaffold:workspace'])"` → `undefined` | 0.2 d |
| F0.5 | **Fix CORS** (P0, bug #1 auditoría) | `apps/kage-runtime/src/server.ts` — línea `allowedHeaders: ['Content-Type', 'Authorization', 'X-Ninja-Session']` → `allowedHeaders: ['Content-Type', 'Authorization', 'X-Ninja-Key']` (eliminar `X-Ninja-Session`: no se usa en ningún lado) | Test nuevo en `apps/kage-runtime/src/__tests__/` o e2e: OPTIONS preflight con `Access-Control-Request-Headers: x-ninja-key` → respuesta incluye `X-Ninja-Key` en `access-control-allow-headers` · commit `fix(kage-runtime): allow X-Ninja-Key in CORS preflight — reactivates browser auth` | 0.2 d |
| F0.6 | **Fix approver identity** (P0, bug #2, Ley 6) | `apps/kage-runtime/src/server.ts` — reemplazar ambos `const approver = { id: 'api-user', role: 'admin' };` (buscar por `api-user`) por identidad derivada del request autenticado: `const approver = { id: 'operator-' + fingerprint, role: 'operator' }` donde `fingerprint = createHash('sha256').update(request.headers['x-ninja-key'] ?? '').digest('hex').slice(0, 12)` | Test: approve con key A registra approver `operator-<fingerprintA>` ≠ approver con key B · commit `fix(kage-runtime): real approver identity derived from auth key (Ley 6)` | 0.4 d |
| F0.7 | **Sync trackers con realidad** | `tools/enterprise-progress.md` (EPIC A ✅ 100%, EPIC C 50% con C1/C2 cerrados, footer 92+ commits, KPIs re-medidos), `README.md` (estado real: EPIC A+B cerrados, ~750 tests, sin "en progreso"), `CHANGELOG.md` (añadir sección EPIC C parcial + fixes P0) | `git grep -n "por iniciar" -- tools/enterprise-progress.md` → 0 · README sin claims de "292/292" | 0.3 d |
| F0.8 | **Licencia propietaria + blindaje publicación** | `LICENSE` (texto All Rights Reserved, copyright 2026, uso prohibido sin licencia expresa), `private: true` en los 32 `packages/*/package.json` que no lo tengan (apps ya lo tienen) + root, `engines: {"node": ">=22 <25"}` en root, `.nvmrc` con `22` | `for f in packages/*/package.json; do node -e "process.exit(require('./$f').private?0:1)" || echo "FALTA: $f"; done` → sin salida · commit `chore: proprietary LICENSE + private:true + engines pin` | 0.3 d |
| F0.9 | **Merge + tag + respaldo local** | `main` ← `fix/epic-b-foundations` (merge, no rebase — preservar historia), tag anotado `v0.9.0-audit` | `git log main --oneline -1` → merge commit · `git tag -l "v0.9.0*"` → `v0.9.0-audit` · `git bundle create ../ninja-backup-2026-08-24.bundle --all` → archivo creado en unidad secundaria | 0.2 d |
| F0.10 | **[USUARIO]** Cambiar repo GitHub Público→Privado | (GitHub web → Settings → General → Danger Zone → Change visibility → Private) | Confirmación verbal del usuario + verificación: `curl -s https://api.github.com/repos/juanptovardev/Ninja-AI-Framework` → `"private": true` | — |
| F0.11 | **Push tras confirmación de privacidad** | `git push origin main --tags` + `git push origin fix/epic-b-foundations` | `git ls-remote origin` muestra main en el SHA del merge · `git status` → `up to date` | 0.1 d |
| F0.12 | **Post-push**: actualizar descripción del repo (dice "v3.2" — incoherente → "Ninja AI Framework — private"), desactivar wiki | (GitHub web) | Descripción actualizada | — |

**Criterios de salida (phase gate F0):**
- [ ] `git status --porcelain | wc -l` → 0
- [ ] `main` contiene los 92 commits + F0.x; tag `v0.9.0-audit` existe
- [ ] Bundle de backup en unidad secundaria
- [ ] KPIs re-medidos (§10) registrados en dossier F0 (`tools/verifications/f0.md`)
- [ ] Remote privado y sincronizado
- [ ] Riesgos R1, R2, R3 (§9) → status mitigado

---

## 4. FASE 1 — Gates locales
> **Objetivo:** reemplazar la CI eliminada con enforcement local. Sin esto, el Manual no tiene dientes.
> **Entrada:** F0 completo (main limpio).
> **Estimación:** P50 3 d · P80 5 d

| ID | Tarea | Detalle | Criterio de aceptación | Est. |
|----|-------|---------|------------------------|------|
| F1.1 | Instalar husky + lint-staged (dev-only) | Justificación §9.2 en dossier: reemplaza CI remota eliminada; no es dependencia de runtime; no está en Directiva §4.2 prohibidas | `pnpm add -D husky lint-staged` + `pnpm pkg set scripts.prepare="husky"` · `.husky/` existe | 0.2 d |
| F1.2 | Hook pre-commit (Gate 1) | `.husky/pre-commit` → `pnpm lint-staged`. `lint-staged` config en root `package.json`: `*.ts` → prettier --write + eslint --fix | Commit con archivo mal formateado → el hook lo corrige/bloquea | 0.3 d |
| F1.3 | Hook pre-push (Gate 2) | `.husky/pre-push` → `pnpm typecheck && pnpm test && pnpm errors:check` | Push con typecheck roto → bloqueado | 0.2 d |
| F1.4 | ESLint flat config + reglas error | Migrar `.eslintrc.cjs` → `eslint.config.mjs` (ESLint 9 nativo). Reglas a `error`: `no-explicit-any`, `@typescript-eslint/no-non-null-assertion`, mantener guard `no-restricted-syntax` anti `throw new Error(` y **extenderlo a todos los archivos migrados a NinjaError**. Añadir `no-restricted-imports` con las 5 capas del Manual §4.2 (L0 contracts no importa nada interno; L1 no importa L2+; etc.) | `pnpm lint` → exit 0 con la base actual (los 117 `as any` quedan como deuda F3 — usar temporariamente overrides por archivo con comentario `// DEBT(F3.4)`, contados y listados en el dossier) | 1 d |
| F1.5 | Quitar `--passWithNoTests` del script test root | `package.json` scripts.test → `vitest run` | `pnpm test` → exit 0 (la suite root encuentra 57+ archivos globalmente; por-package no aplica al script root) | 0.1 d |
| F1.6 | Resolver el test saltado | `tests/integration/runtime-lifecycle.test.ts` — `it.skip('shutdown closes gracefully with timeout')`: implementar el shutdown con timeout o documentar §15 EXC con expiry F2 | `git grep -c "\.skip(" -- "*.test.ts"` → 0 | 0.5 d |
| F1.7 | Dossier F1 + re-medición KPIs | `tools/verifications/f1.md` con: justificación deps, lista DEBT(F3.4) exacta, evidence | Dossier completo | 0.2 d |

**Criterios de salida F1:** hooks instalados y probados con un fallo intencional cada uno · `pnpm lint` verde con flat config · 0 skips · dossier F1 filed.

---

## 5. FASE 2 — Cierre EPIC C (Resiliencia)
> **Objetivo:** runtime resiliente: health granular, WS con reconexión, shutdown completo, persistencia de Pulse/Audit, rate limiting.
> **Entrada:** F1 completo.
> **Estimación:** P50 5 d · P80 8 d
> **Todos los ítems emiten eventos vía `eventBus` (Ley 3) y llevan STRIDE-lite si tocan superficie sensible (§6.1 Manual).**

| ID | Tarea | Detalle | Criterio de aceptación | Est. |
|----|-------|---------|------------------------|------|
| F2.1 | Health granular (WP-C3a) | `apps/kage-runtime/src/routes/health.ts`: `GET /health` liveness (estático, rápido) · `GET /health/ready` readiness: probe SQLite (`SELECT 1` vía storage), migraciones aplicadas, env LLM presente. Emite `health.ready.changed` | Test: con DB inaccesible → `/health/ready` 503 y `/health` 200 | 0.8 d |
| F2.2 | WS reconnect (WP-C3b) | Cliente forge-console: reconexión con backoff exponencial 1s→30s + jitter, re-auth handshake al reconectar, indicador UI de estado conexión | Test E2E: matar runtime 3s → cliente reconecta y recibe eventos de nuevo | 1 d |
| F2.3 | Eliminar dead code WS (EV-18) | `apps/forge-console/lib/ws.ts` (muerto) tras verificar 0 referencias tras F2.2 | `git grep -rn "from.*lib/ws" -- apps/forge-console` → 0 | 0.2 d |
| F2.4 | Shutdown completo (WP-C4a) | `apps/kage-runtime/src/lifecycle.ts`: cierre ordenado de WS, HTTP, Executor/pool, Pulse intervals, Auditor flush, Engram, DB (última). Timeout total 10s con forced exit | Test integración: shutdown → log de cada cierre en orden + DB cerrada limpio (sin WAL huérfano) | 1 d |
| F2.5 | Persistencia Pulse/Audit (WP-C4b) | Migraciones 7 (`pulse_metrics`) y 8 (`audit_log`) — **con down path** (Gate 4) + `pulse-metric-repository.ts`, `audit-log-repository.ts` en trace-ledger + wire en monitor/auditor | Test: emitir eventos → filas en DB · `pnpm db:migrate` + down + up → idempotente | 1.2 d |
| F2.6 | Rate limiting + security headers | `@fastify/rate-limit` (global: 100 req/min por key; `/api/shell/execute`: 10/min) + `@fastify/helmet`. Justificación §9.2 en dossier | Test: 101ª request → 429 · headers `X-Content-Type-Options` presentes | 0.6 d |
| F2.7 | Logs JSON estructurados (Manual §7) | Extender `@ninja/logging`: salida JSON 1-evento/línea con `ts,level,logger,msg` + `correlationId` (Fastify genReqId), mantener modo pretty en TTY dev. Fastify `logger:false` → logger propio con access log mínimo. Actualizar `troubleshooting.md` al formato real | Test: log capturado parsea como JSON con campos obligatorios | 1 d |
| F2.8 | Dossier F2 + STRIDE-lite + re-medición | `tools/verifications/f2.md` | Filed | 0.2 d |

**Criterios de salida F2:** health listo · reconnect E2E verde · shutdown test verde · migraciones 7-8 up/down · rate limit activo · logs JSON · KPIs re-medidos.

---

## 6. FASE 3 — EPIC D (Calidad) — orden estricto R6: D3→D1→D2→D4→D5
> **Objetivo:** la deuda estructural medida (117 `as any`, 45 throws crudos, 11 paquetes sin tests) a cero, con thresholds sostenibles.
> **Entrada:** F2 completo.
> **Estimación:** P50 10 d · P80 15 d

| ID | Tarea | Detalle | Criterio de aceptación | Est. |
|----|-------|---------|------------------------|------|
| F3.1 | **D3a** — suites flow-matrix y workbench (críticos sin tests) | flow-matrix: sequential+parallel executor, retry, estados. workbench: workspace lifecycle, migraciones | 2 paquetes con ≥70% líneas · `pnpm vitest run packages/flow-matrix packages/workbench` verde | 2 d |
| F3.2 | **D3b** — suites logging, learning-loop, forge-lab, integrations-engram/git/lightrag | cobertura de adaptadores con mocks HTTP/SQLite | 6 paquetes más con ≥50% líneas | 2.5 d |
| F3.3 | **D3c** — suites ui-kit, office-grid; decidir destino de app-shell (5 líneas: disolver en ui-kit o eliminar del layout) | componentes render smoke tests | 0 paquetes sin tests: `for d in packages/*/; do [ -z "$(git ls-files "${d}src/**/*.test.ts")" ] && echo "$d"; done` → vacío | 1.5 d |
| F3.4 | **D1** — common-utils real | Ya tiene circuit-breaker+timeouts. Añadir: `retryWithBackoff` (reusa lógica integrations-http), `Result<T,E>` type, `debounce`/`throttle`, `deepFreeze`, `safeJsonParse`. Con tests | Cobertura common-utils ≥80% · exportado todo por index.ts | 1 d |
| F3.5 | **D2** — thresholds de cobertura | `vitest.config.ts`: global `lines: 50`, overrides por paquetes críticos `lines: 70` (después de D3 — por eso este orden) | `pnpm test` falla si baja del umbral (verificar con un test roto intencional en rama scratch) | 0.5 d |
| F3.6 | **D4a** — modularizar server.ts | Extraer las 43 rutas a `apps/kage-runtime/src/routes/*.ts` (por dominio: engine, approvals, arsenal, git, fs, session, settings, health...). `server.ts` queda como composition root <400 líneas. Eliminar los 37 `as any` en el proceso (params tipados con Fastify generics + Zod) | `git grep -c "as any" -- apps/kage-runtime/src/server.ts` → 0 · `(Get-Content server.ts \| Measure-Object -Line).Lines` <400 · `pnpm build && pnpm test` verde | 2.5 d |
| F3.7 | **D4b** — eliminar resto de `as any` y throws crudos | executor.ts (12), mcp-runtime-server (3), client-adapters/generic (5), resto según baseline del dossier F1 (lista DEBT) · migrar throws crudos restantes a NinjaError con códigos | `git grep -o "as any" -- "*.ts" \| wc -l` → 0 · `git grep -o "throw new Error(" -- "packages/**/*.ts" \| wc -l` → 0 · `pnpm errors:check` verde tras nuevos códigos | 2 d |
| F3.8 | **D4c** — Error Boundaries + settings dedup | forge-console: ErrorBoundary por vista con fallback UI + reporte al log. Settings duplicados (~80%, EV-23) unificados | 0 crashes sin boundary · 1 sola fuente de settings | 1 d |
| F3.9 | **D5** — Flow Matrix paralelismo real | Ejecución paralela con Promise.allSettled + límite de concurrencia, detección deadlock por timeout, estado persistente entre reinicios, eliminar 7 console.warn (EV-25) | Test: 3 ramas paralelas se ejecutan concurrentes (timing) · deadlock → error tipado, no hang | 1.5 d |
| F3.10 | Dossier F3 + re-medición final de deuda | `tools/verifications/f3.md` | Filed, KPIs as-any=0, throws=0 | 0.3 d |

**Criterios de salida F3:** 0 paquetes sin tests · 0 `as any` · 0 throws crudos en packages · thresholds activos · server.ts <400 líneas · EXC-1 (Manual §15) cerrado.

---

## 7. FASE 4 — EPIC E (Producto) y FASE 5 (Comercial)
> **Objetivo F4:** el producto se siente enterprise al usarlo. **F5:** se puede vender/instalar.
> **Entrada F4:** F3. **Entrada F5:** F4.
> **Estimación:** F4 P50 8 d / P80 12 d · F5 P50 5 d / P80 8 d

### FASE 4 — ítems

| ID | Tarea | Criterio de aceptación | Est. |
|----|-------|------------------------|------|
| F4.1 | Onboarding wizard (forge-console `/setup`): pasos con progreso — env check (LLM vars), Test Connection real (ping al endpoint LLM con timeout 5s → resultado visible), creación workspace inicial, tour mínimo | E2E del wizard con LLM mockeado verde · usuario nuevo llega al dashboard sin leer docs | 2 d |
| F4.2 | Test Connection real en settings (reemplaza simulación) + estado de conexión persistente | Botón ejecuta request real (o mockeado en E2E) y muestra latencia/modelo | 0.5 d |
| F4.3 | Cargar `content/` en Arsenal (EV-29) — skills/workflows/templates leídos por arsenal-registry al inicio | `GET /api/arsenal` incluye los 3 skills + 2 workflows + 3 templates de content/ | 1 d |
| F4.4 | Métricas reales vs mock — widgets del rail (TokenMeter, AgentStatus, SessionTimer, ContextDepth) alimentados por eventos/pulse reales | Widget muestra datos de una run real E2E | 1 d |
| F4.5 | Banner de modo degradado (LLM caído → banner + retry policy visible; WS desconectado → indicador) | E2E: LLM mock falla → banner visible + run marcada failed (semántica WP-B6 preservada) | 1 d |
| F4.6 | Eliminar ~15 `alert()/confirm()` restantes (EV-20) — reemplazo por sonner/Radix ConfirmDialog existentes | `git grep -oE "alert\(\|confirm\(" -- apps/forge-console \| wc -l` → 0 | 1 d |
| F4.7 | Companion extension: decidir — implementar mínimo viable (conectar a :3141 con key, notificar approvals) o de-scopear del README/layout hasta F5+ | Decisión en ADR-0011 + acción ejecutada | 1 d |
| F4.8 | Learning Loop fix agentId (EV-27) + scheduler (G5 parcial) — usar agentId real, no workspaceId; cron interno opcional | Test: candidato de promoción con agentId correcto | 0.5 d |

**Criterios de salida F4:** wizard E2E · arsenal con content · 0 dialogs nativos · banner degradado · KPIs re-medidos.

### FASE 5 — ítems

| ID | Tarea | Criterio de aceptación | Est. |
|----|-------|------------------------|------|
| F5.1 | Empaquetado Windows — evaluación ADR-0012 (NSIS vs MSIX vs squirrel) + build del instalador que bundlea kage-runtime (node binario via pkg/nexe o node service) + forge-console estático + dojo-cli | Instalador produce .exe/.msi que instala y la app arranca sin dev deps | 2 d |
| F5.2 | Auto-update mínimo: check de versión contra endpoint local/file + descarga manual guiada (v1: sin auto-update silencioso) | UI informa versión nueva disponible | 0.5 d |
| F5.3 | i18n es/en — next-intl en forge-console, es default (directorio `messages/`) | Cambio de idioma persistente · 100% strings clave migradas (no hace ser exhaustivo en v1: solo chrome de UI) | 1 d |
| F5.4 | EULA + pantalla de licencia primera ejecución | EULA mostrada y aceptada antes del onboarding (F4.1) | 0.5 d |
| F5.5 | Mantenimiento programado — Task Scheduler: `pnpm audit --prod` semanal + recordatorio bundle semanal | Tareas registradas en el equipo del dueño | 0.5 d |
| F5.6 | Release ritual completo v1.0.0 — Gate 3 completo, CHANGELOG, tag, bundle, installer firmado si hay cert | Tag `v1.0.0` + artefacto instalador | 0.5 d |

**Criterios de salida F5:** instalador funcionando · EULA · i18n básico · **v1.0.0 taggeada** → cumple la definición §11.

---

## 8. Matriz de trazabilidad

| EPIC | WP | ADR | Tests (evidencia) | Dossier | Estado |
|------|----|----|-------------------|---------|--------|
| A | S0–S5 | — | varios | `s0.md`…`s5.md` | ✅ |
| B | B1 | 0001, 0002 | 35 tests errores | `wp-b1.md` | ✅ |
| B | B2 | 0004 | 16 tests env | (en wp-b1/b2) | ✅ |
| B | B3+B6 | 0003 | 56+2 tests fallback | `wp-b3.md` | ✅ |
| B | B4–B9 | — | 7+18+2+3+3+3 | `wp-b4.md`…`wp-b9.md` | ✅ |
| B | B10 | 0005 | typecheck+tests | `wp-b10.md` | ✅ |
| B | B11 | 0008 | auth handshake 5s | `wp-b11.md` | ✅ |
| B | B12–B14 | 0006 | 15+3+12+5 tests | `wp-b12–14.md` | ✅ |
| B | B15 | 0007 | 8 tests schemas | `wp-b15.md` | ✅ |
| C | C1 | 0009 (disco) | 6 tests handler | `wp-c1-closure.md` (disco) | 🔶 sin commit → F0.1 |
| C | C2 | 0010 (disco) | circuit+retry tests | — (a crear F0.2) | 🔶 sin commit → F0.2 |
| C | C3 | 0011 (a crear F2) | health/reconnect | — | ⏳ F2 |
| C | C4 | idem | shutdown/persistencia | — | ⏳ F2 |
| D | D1–D5 | 0013 (a crear F3.4 server-routes) | por ítem | — | ⏳ F3 |
| E | E1–E4 | 0011/0012 | E2E wizard | — | ⏳ F4 |
| F | F1 | — | — | — | ⏳ F5 |

**Ledger EV absorbido** (de `og/plan-mejoras-ENTERPRISE-MASTER.md`): EV-16→F3.7 · EV-17→F0.2 · EV-18→F2.3 · EV-19→F3.8 · EV-20→F4.6 · EV-21→F3.2 · EV-22→F1.5 · EV-23→F3.8 · EV-25→F3.9 · EV-27→F4.8 · EV-29→F4.3 · EV-30→F1.1 · EV-31→F4.7 · EV-32→F2.5 · EV-33→F3.3.

---

## 9. Registro de riesgos (cuantificado — Manual §12)

| ID | Riesgo | P | I | Score | Trigger (señal) | Detección | Mitigación | Estado |
|----|--------|---|---|-------|-----------------|-----------|------------|--------|
| R1 | Pérdida de trabajo local (92 commits + WT sin respaldo) | 2 | 5 | **10** | fallo disco / borrado accidental | `git ls-remote origin` desactualizado | F0.1–F0.3 commits + F0.9 bundle ANTES de todo lo demás | 🔶→F0 |
| R2 | Repo GitHub público con snapshot comercial | 5 | 4 | **20** | ya ocurrió (verificado) | `curl api.github.com/repos/...` | F0.10 privatización inmediata | 🔴 activo |
| R3 | Defectos P0 en superficie de seguridad (CORS/approver) | 4 | 4 | **16** | bug #1/#2 auditoría | tests F0.5/F0.6 | Fixes con red→green + revisión adversarial §6.3 | 🔴→F0 |
| R4 | Hooks husky rompen flujo de desarrollo (falsos positivos) | 3 | 2 | 6 | quejas en uso diario | — | tuning en F1, excepciones §15 con expiry | ⏳ |
| R5 | Thresholds de cobertura rompen builds (R6 clásico) | 3 | 2 | 6 | `pnpm test` rojo tras F3.5 | gate | orden estricto D3→D2 | ⏳ |
| R6 | Migración Pulse/Audit corrompe datos locales | 2 | 4 | 8 | migración fallida a mitad | backup previo Gate 4 | down path obligatorio + backup DB pre-migración | ⏳ |
| R7 | Publish accidental de código propietario a npm | 1 | 5 | 5 | — | — | F0.8 `private:true` ×32 | ⏳ |
| R8 | Dependencia con licencia copyleft entra al producto | 2 | 4 | 8 | `pnpm licenses list` | Gate 3 spot-check | Política §9.3 Manual | ⏳ |
| R9 | Scope creep en F5 (empaquetado complejo) | 3 | 3 | 9 | F5 excede P80 | estimación vs real | ADR-0012 decide la opción mínima; auto-update v1 = manual | ⏳ |

**Thresholds Manual §12.2:** ≥12 requiere mitigación antes de salir la fase dueña. R2 y R3 bloquean la salida de F0; R1 se cierra con el bundle.

---

## 10. KPIs y comandos de re-medición

Medir y registrar en el dossier de cada fase (bash; el output crudo va al dossier, sin maquillaje):

```bash
git status --porcelain | wc -l                       # archivos sucios        → meta 0 (tras F0)
git grep -o "as any" -- "*.ts" | wc -l               # casts any              → 117 hoy, meta 0 (F3)
git grep -o "throw new Error(" -- "packages/**/*.ts" | wc -l   # throws crudos → 45 hoy, meta 0 (F3)
for d in packages/*/; do [ -z "$(git ls-files "${d}src/**/*.test.ts")" ] && echo "$d"; done  # sin tests → 11 hoy, meta 0 (F3)
git grep -oE "alert\(|confirm\(" -- apps/forge-console | wc -l  # dialogs nativos → ~15 hoy, meta 0 (F4)
git grep -c "\.skip(" -- "*.test.ts" 2>/dev/null      # skips                  → 1 hoy, meta 0 (F1)
```

Estado por fase (se actualiza al cerrar cada fase):

| KPI | Base (auditoría) | Tras F0 | Tras F3 | Meta v1.0 |
|-----|------------------|---------|---------|-----------|
| Archivos sucios | ~30 | 0 | 0 | 0 |
| `as any` | 117 | 117 | **0** | 0 |
| Throws crudos packages | 45 | 45 | **0** | 0 |
| Paquetes sin tests | 11 | 11 | **0** | 0 |
| Dialogs nativos | ~15 | ~15 | ~15 | **0** |
| Tests saltados | 1 | 1 | 0 | 0 |
| Tests totales | ~748 | ~748+ | +estimado 200–300 | ≥1000 |

---

## 11. Definición de "enterprise-ready v1.0" (cierre)

El tag `v1.0.0` (F5.6) exige cumplir TODOS:

1. KPIs de §10 en meta.
2. Gates G1–G4 del Manual operativos (hooks + release checklist).
3. Health granular + shutdown completo + persistencia audit/pulse (F2).
4. Onboarding + degradación visible + arsenal con content/ (F4).
5. Instalador Windows + EULA + i18n básico (F5).
6. Riesgos §9: sin ítems score ≥12 activos.
7. Bundle de respaldo verificado en unidad secundaria.
8. Remote privado sincronizado.

---

## 12. Control de cambios de este documento

| Versión | Fecha | Cambio | Autor |
|---------|-------|--------|-------|
| 1.0 | 2026-08-24 | Creación (base de auditoría) | opencode (GLM-5.3) |
| 2.0 | 2026-08-24 | Reescritura profesional: fases con gates, IDs, P50/P80, trazabilidad, riesgos cuantificados, KPIs ejecutables; base documental separada (Quality Manual + auditoría og/) | opencode (GLM-5.3) |

*Regla: cada cambio a este plan es un commit `docs(plan): ...` con entrada en esta tabla. Las fases completadas se marcan ✅ con fecha y no se reabren — nueva fase o ADR si hay que deshacer.*
