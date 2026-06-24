# Plan Maestro Enterprise — Ninja AI Framework
> **Rama activa**: `fix/epic-b-foundations` · **Última actualización**: 2026-06-24

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

### 🟢 EPIC A — Estabilización base (`~44-50h`)

- [ ] **S0** — Trazabilidad git (~20 commits semánticos)
- [ ] **S0.bis** — Pre-flight coherencia (grep anti-deps prohibidas)
- [ ] **S1** — Vulns NPM (`next@^15.5.18`, `fast-uri@^3.1.2`) + path boundary FS
- [ ] **S2** — TODOs CLI, WS env var, Auto-PRD
- [ ] **S3** — Mini-commits RF-16, toasts, modals, /arsenal, widgets, LiveTimeline
- [ ] **S4** — Office Grid CSS 3D, tooltips, skeletons, a11y, responsive, Ctrl+K
- [ ] **S5** — Dogfooding + E2E + docs usuario

---

### 🟡 EPIC B — Correctitud crítica & Seguridad P0 (`~38-48h`)

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

#### WP-B9 · `selectFastest` corregir comparación
- [ ] `model-gateway/selector.ts:136-141`: `currentPing > bestPing` → `currentPing < bestPing`
- [ ] Cambiar `?? 0` → `?? Infinity`
- [ ] Test: set pings {200, 50, 120} ⇒ elige 50

#### WP-B10 · Deprecar `ContextOps` legacy
- [ ] Grep `new ContextOps(` — confirmar 0 referencias
- [ ] Eliminar `vault/src/context-ops.ts` y su export
- [ ] Typecheck + tests verdes tras remover

#### WP-B11 · API Key auth (HTTP + WS)
- [ ] Generar key en `~/.ninja/runtime.key`
- [ ] `addHook('onRequest')` global en Fastify con validación `X-Ninja-Key`
- [ ] WS: handshake de auth en 5s o cerrar con code 1008
- [ ] Actualizar CLI + Forge Console + Companion en mismo PR

#### WP-B12 · Shell allowlist (reemplazar blocklist)
- [ ] Implementar `ALLOWED` map en `integrations-shell/src/sandbox.ts`
- [ ] Deny-by-default: `python -c`, `node -e`, `curl` → bloqueados
- [ ] `SHELL_ALLOWLIST_EXTRA` env var para extensiones
- [ ] Tests: matriz de comandos permitidos/denegados

#### WP-B13 · Fix CORS wildcard en MCP SSE
- [ ] `mcp-runtime-server.ts`: usar `ALLOWED_ORIGINS` en lugar de `'*'`
- [ ] Test: origin inválido no recibe ACAO

#### WP-B14 · SSRF guard en `integrations-http`
- [ ] Nuevo `ssrf-guard.ts`: resolver hostname + reject IPs privadas
- [ ] Bloquear `169.254.169.254`, `metadata.google.internal`
- [ ] Tests: URLs privadas bloqueadas, públicas permitidas

#### WP-B15 · Zod en boundaries + error sanitization
- [ ] Schemas Zod en `route-schemas.ts` para endpoints críticos
- [ ] `sanitizeError(err, env)` — sin stack en producción
- [ ] Tests: body inválido → 400; error interno → 500 genérico en prod

---

### 🔵 EPIC C — Resiliencia & Error Handling (`~18-22h`)

- [ ] **WP-C1** — Error handler global Fastify + not-found handler
- [ ] **WP-C2** — Circuit Breaker + Retry/backoff + timeouts jerárquicos
- [ ] **WP-C3** — Graceful degradation + reconexión WS + health granular
- [ ] **WP-C4** — Graceful shutdown + persistir Pulse/Audit

---

### 🔵 EPIC D — Calidad de código & Testing (`~30-36h`)

- [ ] **WP-D1** — Implementar `@ninja/common-utils` (reemplaza placeholder)
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

- [x] **WP-F1 (adelantado)** — CI/CD GitHub Actions mínimo (`.github/workflows/ci-minimal.yml`)
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
| Vulnerabilidades NPM High | 9 | 0 | ⏳ |
| Endpoints sin auth | todos | 0 (excepto `/health`) | ⏳ |
| `any`/`as any` en runtime core | 85 | 0 | ⏳ |
| `throw new Error(` total en packages | 74 | 0 | 🟡 51 |
| Packages sin tests | 16/32 | 0 | ⏳ |
| Cobertura global | sin medir | ≥50% gating | ⏳ |
| CI pipelines | 0 | 1 (matriz 2 OS × 2 Node) | 🟡 CI mínimo |
| Commits semánticos | 1 | ≥20 | ✅ 24+ |
| LLM failures como fake success | sí | 0 | ✅ (strict mode + B6 closure) |
| Stability Score fijo en 100 | sí | refleja latencia real | ✅ (B7 — 6 tests) |
| `alert()/confirm()` en UI | 17 | 0 | ⏳ |
| `sk-placeholder` | sí | 0 | ✅ |
| Guardian deny-by-default | No (allow) | deny sin engine | ✅ (B5) |
| Budget pre-call enforcement | No | `BudgetError` en 1 línea | ✅ (B4) |
| isAnchor filter correcto | No (siempre vacío) | `type==='anchor'` | ✅ (B8) |

---

## Progreso por EPIC

```
EPIC A  ░░░░░░░░░░  0%   (por iniciar)
EPIC B  ██████░░░░  55%  (B1 ✅ B2 ✅ B3 ✅ B4 ✅ B5 ✅ B6 ✅ B7 ✅ B8 ✅ · B9–B15 pendientes)
EPIC C  ░░░░░░░░░░  0%
EPIC D  ░░░░░░░░░░  0%
EPIC E  ░░░░░░░░░░  0%
EPIC F  █░░░░░░░░░  10%  (CI mínimo ✅)
EPIC G  ░░░░░░░░░░  0%
```

---

## Estimación total

| Fase | Horas | Estado |
|------|-------|--------|
| EPIC A (S0–S5) | 44–50h | ⏳ |
| EPIC B (correctitud + seguridad P0) | 38–48h | 🟡 ~15h ejecutadas |
| EPIC C (resiliencia) | 18–22h | ⏳ |
| EPIC D (calidad + testing) | 30–36h | ⏳ |
| EPIC E (frontend) | 28–34h | ⏳ |
| EPIC F (devops) | 20–26h | 🟡 ~4h ejecutadas |
| EPIC G (extensibilidad) | 24–30h | ⏳ |
| **Total v1 (A–G)** | **~202–246h** | **~19h ejecutadas (~8%)** |
| Fase H (v2.0 opcional) | +60–100h | 🔒 requiere aprobación |

---

## Registro de riesgos activos

| # | Riesgo | Mitigación | Estado |
|---|--------|------------|--------|
| R1 | Next.js 15.5.18 rompe estilos | snapshot visual previo | ⏳ |
| R2 | Auth rompe CLI/Console/Companion | actualizar los 3 en mismo PR | ⏳ |
| R3 | Shell allowlist bloquea legítimos | `SHELL_ALLOWLIST_EXTRA` | ⏳ |
| R4 | Eliminar 85 `any` rompe rutas | commit por archivo | ⏳ |
| R5 | WP-B6 cambia semántica de fallos | **✅ `NINJA_LLM_FAIL_MODE` flag** | ✅ Mitigado |
| R6 | Coverage thresholds rompen CI | D3 antes de D2/F1 | ⏳ |
| A1 | Warning `MODULE_TYPELESS_PACKAGE_JSON` | **✅ migrado a .mjs** | ✅ |
| A2 | CI script requería Node 24 | **✅ migrado a .mjs** | ✅ |

---

*Fuente: `tools/plan-mejoras-ENTERPRISE-MASTER.md` · ADRs en `docs/adr/`*
