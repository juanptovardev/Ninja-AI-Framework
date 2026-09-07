# Plan Maestro Enterprise — Ninja AI Framework
> **Rama activa**: `fix/epic-b-foundations` · **Última actualización**: 2026-08-25

---

## Grafo de dependencias (EPICs)

```
EPIC A — Estabilización base
  └──► WP-F1 (CI, adelantado) ◄──────────────────────────────────────────┐
         │                                                                  │
         ├──► WP-B1 (errores tipados) ──► WP-B2 (env) ──► WP-C1 (handler)  │
         │         │                                                        │
         ├──► WP-B3 ◄─── coordina ───► WP-B6 (fail semantics)             │
         │                                                                  │
         ├──► WP-B4 (budget) · WP-B5 (guardian) · WP-B7 · WP-B8 · WP-B9  │
         │                                                                  │
         ├──► WP-D1 (common-utils) ──► WP-C2 (circuit breaker)            │
         │                                                                  │
         ├──► WP-D3 (subir cobertura) ──► WP-D2 (thresholds) ──► CI gate ─┘
         │
         ├──► EPIC E (frontend) ──► EPIC F (devops) ──► EPIC G ──► Fase H
         │
         └──► WP-B10 · WP-B11 · WP-B12 · WP-B13 · WP-B14 · WP-B15
```

---

## Checklist global por EPIC

### ✅ EPIC A — Estabilización base (`~44-50h`) — CERRADO

- [x] **S0** — Trazabilidad git (~20 commits semánticos) · dossier `s0.md`
- [x] **S0.bis** — Pre-flight coherencia (grep anti-deps prohibidas)
- [x] **S1** — Vulns NPM (`next@^15.5.18`, `fast-uri@^3.1.2`) + path boundary FS · dossier `s1.md`
- [x] **S2** — TODOs CLI, WS env var, Auto-PRD · dossier `s2.md`
- [x] **S3** — Mini-commits RF-16, toasts, modals, /arsenal, widgets, LiveTimeline · dossier `s3.md`
- [x] **S4** — Office Grid CSS 3D, tooltips, skeletons, a11y, responsive, Ctrl+K · dossier `s4.md`
- [x] **S5** — Dogfooding + E2E + docs usuario · dossier `s5.md`

---

### 🟢 EPIC B — Correctitud crítica & Seguridad P0 (`~38-48h`)

#### WP-B1 · Jerarquía de errores tipados `NinjaError`
- [x] `NinjaError` base class + 8 subclases (`LLMError`, `SentinelError`, etc.)
- [x] `ErrorCodes` catalog (14 códigos) con branded type
- [x] `toJSON()` con PII redaction, stack truncation, cause chain depth-3
- [x] Helpers `isNinjaError`, `wrapUnknown`
- [x] Migración: `integrations-llm/client.ts` → `LLMError`
- [x] Migración: `sentinel/approval.ts` → `SentinelError`
- [x] Migración: `kage-engine/intake.ts` + `coordinator.ts` → `EngineError`
- [x] Migración: `roster/roster.ts` → `RosterError`
- [x] ESLint guard en los 5 archivos migrados
- [x] Script `generate-error-docs.mjs` + `docs/errors.md`
- [x] 35 tests verdes · ADR-0001 + ADR-0002

#### WP-B2 · Validación de entorno fail-fast (Zod)
- [x] `EnvSchema` con todas las variables + defaults
- [x] `NINJA_LLM_FAIL_MODE` (strict/legacy) en schema
- [x] `loadEnv()` fail-fast con mensajes claros
- [x] `parseEnv()` testeable sin side effects
- [x] Wire en `index.ts` antes de bootstrap
- [x] Eliminar `sk-placeholder` de `server.ts`
- [x] Enmascarar `LLM_BASE_URL` (solo host en logs)
- [x] `.env.example` documentado
- [x] 16 tests verdes · ADR-0004

#### WP-B3 · Conectar FallbackChain al path LLM
- [x] `classifyLLMError(e)` helper en `@ninja/integrations-llm`
- [x] Reconstruir `buildDefaultChains()` con IDs reales del catálogo
- [x] `completeWithFallback()` helper privado en `AgentExecutor`
- [x] Fallback loop en `executeAgentTask` + reduce-phase
- [x] Feature flag `NINJA_LLM_FAIL_MODE` inyectado por constructor
- [x] Wire `FallbackChain` en `server.ts` (composition root)
- [x] Migrar 4 throws de `executor.ts` a `EngineError`
- [x] Test integración E2E: engine sobrevive LLM failure
- [x] 56 tests agent-runtime + 2 integration tests verdes · ADR-0003

#### WP-B4 · Budget enforcement pre-call ✅
- [x] `isOverBudget()` invocado antes de cada `llmClient.complete()`
- [x] `throw new BudgetError('BUDGET_EXCEEDED', ...)` si supera límite
- [x] Endpoint `GET /api/budget/status` con datos por sesión
- [x] `NINJA_SESSION_TOKEN_BUDGET` env var opcional
- [x] Tests: bloqueo al superar límite, permiso bajo límite (7 tests)

#### WP-B5 · Guardian deny-by-default ✅
- [x] Pasar `policyEngine` al constructor de `Guardian` en `server.ts:~318`
- [x] Cambiar default de `guardian.ts:54-57` a `return false` sin engine
- [x] Tests: sin engine deniega; con engine y política delega a ApprovalManager (18 tests)

#### WP-B6 · LLM failure = task failed (no fake success) ✅
- [x] Cubierto por WP-B3 strict mode — cerrado formalmente con tests
- [x] ADR-0003 actualizado: `Accepted — WP-B3+B6 ✅`
- [x] Tests: mock LLM siempre falla ⇒ `status:'failed'`, 0 `task.completed` (2 tests)

#### WP-B7 · Stability Score real (emitir `latencyMs`) ✅
- [x] `latencyMs` ya se emite en `executor.ts:688` (confirmado)
- [x] `pulse-center/monitor.ts` consume `latencyMs` correctamente
- [x] Tests: score varía con latencia alta (6 tests — primer test suite de pulse-center)

#### WP-B8 · Fix filtro `isAnchor` ✅
- [x] `server.ts:516`: ya corregido — `a.type === 'anchor'`
- [x] Test: `GET /api/artifacts?isAnchor=true` retorna artifacts tipo anchor (3 tests)

#### WP-B9 · `selectFastest` corregir comparación ✅
- [x] `model-gateway/selector.ts:136-141`: `?? Infinity` + `<` (corrección ya hecha)
- [x] Tests regresión: pings {200, 50, 120} ⇒ elige 50 | sin ping pierde vs con ping | todos sin ping → primero
- [x] Dossier: `tools/verifications/wp-b9.md`

#### WP-B10 · Deprecar `ContextOps` legacy ✅
- [x] Grep `new ContextOps(` → 0 referencias en producción
- [x] Eliminado `vault/src/context-ops.ts` + `context-ops.test.ts`
- [x] Removido export en `vault/src/index.ts`
- [x] Typecheck + tests verdes | ADR-0005 | Dossier: `tools/verifications/wp-b10.md`

#### WP-B11 · API Key auth (HTTP + WS) ✅
- [x] `auth-key.ts`: generar key en `~/.ninja/runtime.key` (randomBytes(32))
- [x] `addHook('onRequest')` con validación `X-Ninja-Key` (excluye /health, /api/status)
- [x] WS handshake de auth en 5s o cerrar con code 1008
- [x] CLI: inyecta header desde key file | Forge Console: NEXT_PUBLIC_RUNTIME_API_KEY
- [x] AUTH_REQUIRED + AuthError en contracts | ADR-0008 | CHANGELOG | Dossier: wp-b11.md

#### WP-B12 · Shell allowlist (reemplazar blocklist) ✅
- [x] `ALLOWED` map en `sandbox.ts` — deny-by-default
- [x] `python -c`, `node -e`, `curl`, `bash`, `wget`, `powershell` → bloqueados
- [x] `SHELL_ALLOWLIST_EXTRA` env var funcional
- [x] Audit event `shell.command.denied` en eventBus
- [x] 15 tests verdes | ADR-0006 | Dossier: `tools/verifications/wp-b12.md`

#### WP-B13 · Fix CORS wildcard en MCP SSE ✅
- [x] Audit: `ALLOWED_ORIGINS` allowlist explícita en server.ts + mcp-runtime-server.ts
- [x] Sin wildcard `'*'` en ningún punto del codebase
- [x] 3 tests regresión verdes | Dossier: `tools/verifications/wp-b13.md`

#### WP-B14 · SSRF guard en `integrations-http` ✅
- [x] `ssrf-guard.ts`: 9 rangos privados + 3 hostnames blocked + allowedDomains
- [x] Integrado en `httpRequest` (opt-out via `ssrf: false`)
- [x] HTTP_SSRF_BLOCKED + SSRFError en contracts
- [x] 12 tests verdes | Dossier: `tools/verifications/wp-b14.md`

#### WP-B15 · Zod en boundaries + error sanitization ✅
- [x] `route-schemas.ts`: 5 schemas Zod
- [x] `sanitize-error.ts`: prod/dev/test modes, stack nunca expuesto
- [x] Aplicado en 5 endpoints: /roster/assign, /engine/submit, /shell/execute, /vault/write, /git/commit
- [x] `as any` en server.ts: ~85 → 37 (reducción de 48)
- [x] 8 tests verdes | ADR-0007 | Dossier: `tools/verifications/wp-b15.md`

---

### 🟡 EPIC C — Resiliencia & Error Handling (`~18-22h`) — 100%

- [x] **WP-C1** — Error handler global Fastify + not-found handler · commit f337e14 · ADR-0009 · dossier `wp-c1-closure.md`
- [x] **WP-C2** — Circuit Breaker + Retry/backoff + timeouts jerárquicos · commit 58a6cde · ADR-0010
- [x] **WP-C3a** — Health granular (F2.1): `/health` liveness + `/health/ready` readiness (probes SQLite/migraciones/env LLM) + evento `health.ready.changed` en transición · dossier `wp-c3-health.md`
- [x] **WP-C3b** — WS reconnect forge-console (F2.2): backoff exponencial 1s→30s + jitter ±20%, re-auth handshake en cada reconexión, indicador UI de estado, `lib/ws.ts` muerto eliminado · dossier `wp-c3-ws.md`
- [x] **WP-C4a** — Shutdown completo ordenado (F2.4): shutdown-registry (failover → pulse → auditor flush → engram → sqlite-db última), timeout 10s, tolerante a fallos por paso, hack `as any` failoverManager eliminado · dossier `wp-c4-shutdown.md`
- [x] **WP-C4b** — Persistencia Pulse/Audit (F2.5): migraciones 7/8 con down path (Gate 4) + `revertMigrations` en storage, repos `PulseMetricRepository`/`AuditLogRepository` en trace-ledger, wire por inyección en monitor/auditor, `db:migrate` con backup + modo `--down` · dossier `wp-c4-persistence.md`
- [x] **WP-C4c** — Rate limiting + security headers (F2.6): `@fastify/rate-limit` (100/min por key global, 10/min shell) + `@fastify/helmet` (nosniff etc., CSP off API-only), 429 con formato RATE_LIMITED · ADR-0012 · dossier `wp-c4-security.md`

---

### 🔵 EPIC D — Calidad de código & Testing (`~30-36h`)

- [ ] **WP-D1** — Implementar `@ninja/common-utils` (reemplaza placeholder) *(implementado de facto vía WP-C2: circuit-breaker + timeouts + tests en common-utils; dossier propio pendiente)*
- [ ] **WP-D2** — Quality gates CI (quitar `--passWithNoTests`, thresholds)
- [ ] **WP-D3** — Suites de test para 16 packages sin tests *(antes de D2)*
- [ ] **WP-D4** — Eliminar `any` + Error Boundaries + dead code + settings dedup
- [ ] **WP-D5** — Flow Matrix: paralelismo + deadlock + retry + estado persistente

---

### 🔵 EPIC E — Frontend & Product (`~28-34h`)

- [ ] **WP-E1** — Rutas backend→UI faltantes + cargar `content/`
- [ ] **WP-E2** — Reemplazar 16 `alert()/confirm()` + Test Connection real
- [ ] **WP-E3** — Onboarding wizard + error recovery + degraded banner
- [ ] **WP-E4** — Structured logging + correlation IDs + a11y + Companion fix

---

### 🔵 EPIC F — DevOps & Operabilidad (`~20-26h`)

- [ ] **WP-F1 (adelantado)** — ~~CI/CD GitHub Actions mínimo~~ eliminado 2026-08-24 (limpieza de repo); reemplazo: gates locales husky + lint-staged (F1)
- [ ] **WP-F1 completo** — Matriz 2 OS × 2 Node + `pnpm audit` + dependabot
- [ ] **WP-F2** — Pre-commit hooks (husky + lint-staged) + build optimization
- [ ] **WP-F3** — Backup SQLite + migraciones up/down + checksums
- [ ] **WP-F4** — Docker + métricas Prometheus + charts

---

### 🔵 EPIC G — Extensibilidad, API, i18n & Compliance (`~24-30h`)

- [ ] **WP-G1** — API `/api/v1/` + OpenAPI desde Zod + Swagger
- [ ] **WP-G2** — FTS5 search en artifacts + workspace export/import
- [ ] **WP-G3** — i18n (next-intl + i18next, `es`/`en`) + docs C4 (Mermaid)
- [ ] **WP-G4** — RBAC + JWT local + audit inmutable + secrets manager
- [ ] **WP-G5** — Learning Loop: fix `agentId` + scheduler automático
- [ ] **WP-G6** — Cost dashboard LLM (per-agent, presupuestos, CSV)

---

### ⚪ Fase H — Visión v2.0 *(requiere aprobación de scope)*

- [ ] Plugin SDK + sandbox isolated-vm/WASI
- [ ] Webhooks · Custom model providers
- [ ] Office Grid WebGL/R3F
- [ ] Windows nativo (system tray/WAL)
- [ ] Swarm multi-agente

> ❌ **DESCARTADO** (violan local-first): Redis Pub/Sub, Postgres, K8s/Helm

---

## KPIs de éxito

| KPI | Baseline | Meta v1 | Estado |
|-----|----------|---------|--------|
| Vulnerabilidades NPM High | 9 | 0 | 🟡 13 High (`pnpm audit --prod`; cadena postcss@8.4.31 vía next@16.2.7) |
| Endpoints sin auth | todos | 0 (excepto `/health`) | ✅ 0 (B11; excepciones `/health` + `/api/status`) |
| `any`/`as any` en runtime core | 85 | 0 | 🟡 114 globales (deuda F3.4, contados con `git grep`) |
| `throw new Error(` total en packages | 74 | 0 | 🟡 35 (prod packages, sin tests) |
| Packages sin tests | 16/32 | 0 | 🟡 11/32 |
| Cobertura global | sin medir | ≥50% gating | ⏳ sin medir |
| CI pipelines | 0 | 1 (matriz 2 OS × 2 Node) | 🔴 CI mínima eliminada 2026-08-24 → reemplazo gates locales F1 |
| Commits semánticos | 1 | ≥20 | ✅ 100 (rama `fix/epic-b-foundations`) |
| Tests suite | 292 | verde y creciente | ✅ 766 passing + 1 skip (56 archivos) |
| LLM failures como fake success | sí | 0 | ✅ (strict mode + B6 closure) |
| Stability Score fijo en 100 | sí | refleja latencia real | ✅ (B7 — 6 tests) |
| `alert()/confirm()` en UI | 17 | 0 | ✅ 0 (reemplazados por toasts/modals en S3) |
| `sk-placeholder` | sí | 0 | ✅ 0 en código (solo refs históricas en docs/dossiers) |
| Guardian deny-by-default | No (allow) | deny sin engine | ✅ (B5) |
| Budget pre-call enforcement | No | `BudgetError` en 1 línea | ✅ (B4) |
| isAnchor filter correcto | No (siempre vacío) | `type==='anchor'` | ✅ (B8) |

---

## Progreso por EPIC

```
EPIC A  ██████████ 100%  (S0–S5 ✅ — EPIC A CERRADO)
EPIC B  ██████████ 100%  (B1-B15 ✅ — EPIC B CERRADO)
EPIC C  █████░░░░░  50%  (C1+C2 ✅ · C3-C4 pendientes)
EPIC D  ░░░░░░░░░░   0%  (D1 de facto vía C2, dossier pendiente)
EPIC E  ░░░░░░░░░░   0%
EPIC F  ░░░░░░░░░░   0%  (CI adelantada eliminada 2026-08-24 → gates locales F1)
EPIC G  ░░░░░░░░░░   0%
```

---

## Estimación total

| Fase | Horas | Estado |
|------|-------|--------|
| EPIC A (S0–S5) | 44–50h | ✅ CERRADO |
| EPIC B (correctitud + seguridad P0) | 38–48h | ✅ CERRADO (B1-B15) |
| EPIC C (resiliencia) | 18–22h | 🟡 50% (C1+C2 ✅) |
| EPIC D (calidad + testing) | 30–36h | ⏳ (D1 de facto vía C2) |
| EPIC E (frontend) | 28–34h | ⏳ |
| EPIC F (devops) | 20–26h | ⏳ (CI adelantada revertida 2026-08-24) |
| EPIC G (extensibilidad) | 24–30h | ⏳ |
| Total v1 (A–G) | **~202–246h** | **~52h ejecutadas (~23%)** |
| Fase H (v2.0 opcional) | +60–100h | 🔒 requiere aprobación |

---

## Registro de riesgos activos

| # | Riesgo | Mitigación | Estado |
|---|--------|------------|--------|
| R1 | Next.js 15.5.18 rompe estilos | snapshot visual previo | ⏳ |
| R2 | Auth rompe CLI/Console/Companion | actualizar los 3 en mismo PR | ✅ Mitigado (clientes actualizados en B11 + fix CORS preflight `X-Ninja-Key`, F0.5) |
| R3 | Shell allowlist bloquea legítimos | `SHELL_ALLOWLIST_EXTRA` | ✅ Mitigado (allowlist viva desde B12 + hardening follow-ups) |
| R4 | Eliminar 85 `any` rompe rutas | commit por archivo | ⏳ |
| R5 | WP-B6 cambia semántica de fallos | **✅ `NINJA_LLM_FAIL_MODE` flag (B3) + `strict` default (B6 cierre formal)** | ✅ Mitigado |
| R6 | Coverage thresholds rompen CI | D3 antes de D2/F1 | ⏳ |
| A1 | Warning `MODULE_TYPELESS_PACKAGE_JSON` | **✅ migrado a .mjs** | ✅ |
| A2 | CI script requería Node 24 | **✅ migrado a .mjs** | ✅ |

---

*Fuente: `tools/plan-mejoras-ENTERPRISE-MASTER.md` · ADRs en `docs/adr/` · **100 commits en fix/epic-b-foundations — EPIC A+B cerrados · C1-C2 ✅ · 766 tests verdes***
