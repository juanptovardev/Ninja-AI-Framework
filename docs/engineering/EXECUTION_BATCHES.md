# EXECUTION BATCHES — Ejecución por Etapas con Terminales Independientes
> **Versión:** 1.0 · **Fecha:** 2026-08-24 · **Modelo objetivo:** GLM 5.2 (gratuito) u otro modelo de contexto corto
> **Fuente estratégica:** `PLAN_EJECUCION.md` v2 · **Estándares:** `docs/engineering/QUALITY_MANUAL.md`
> **Uso:** copia un prompt completo por terminal en sesión fresca. Al terminar una ETAPA completa, pide auditoría al cerebro ("audita etapa N"). No avances de etapa sin veredicto ✅.

---

## 0. Reglas globales de ejecución

1. **Un prompt = una sesión fresca.** Nunca encadenar dos prompts en la misma conversación.
2. **Paralelo real solo donde el prompt lo marca `∥`:** esos prompts crean su propio `git worktree` + branch (comandos incluidos). Los demás corren en el repo principal, **uno a la vez**.
3. **Si un criterio de aceptación falla:** DETENER. No improvisar, no "arreglar por fuera". Reportar al auditor con el output del comando fallido.
4. **Nunca `git add -A`.** Stagear solo los archivos listados en el prompt.
5. **Nunca tocar** `docs/architecture/og/`, `.env`, `~/.ninja/*`, `node_modules/`, `pnpm-lock.yaml` (salvo que el prompt lo diga).
6. Todo prompt termina con: commit Conventional + dossier en `tools/verifications/`.
7. Si el modelo no sabe hacer algo: que lo declare en el dossier bajo `## Bloqueos` — nunca inventar.

### Plantilla estándar (cabecera implícita en todos los prompts)

```
Reglas: no salgas del alcance de archivos listado · aceptación fallida = DETENER y reportar ·
commit exacto como se indica · dossier obligatorio antes del commit final.
```

---

## 1. Protocolo worktree (solo prompts marcados ∥)

Cada terminal paralela ejecuta esto ANTES de su tarea (el prompt lo incluye):

```bash
cd C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework
git worktree add ../ninja-<slot> -b feat/<branch>
cd ../ninja-<slot>
pnpm install
```

Al terminar la tarea y su commit, la terminal reporta el SHA (`git rev-parse HEAD`). El **merge** lo hace la terminal principal (o tú) con los comandos del bloque **MERGE KIT** de cada etapa, en orden de lista. Si hay conflicto de merge: DETENER → auditor.

Limpieza post-etapa:

```bash
git worktree remove ../ninja-<slot>
git branch -d feat/<branch>
```

---

# ETAPA 0 — RESCATE 🔶 (secuencial · 1 terminal · 3 prompts)

**Objetivo:** todo el trabajo en vuelo queda commitado. Tree limpio.
**Precondición:** working tree actual (28+ archivos sucios, ver `git status`).

---

### PROMPT T0.1 — Commit base documental 🟢

```
Ejecuta en C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework (rama fix/epic-b-foundations).

TAREA: crear el primer commit de la base documental.
1. Verifica con `git status --porcelain` que existen estos archivos sin trackear/modificados:
   AGENTS.md, PLAN_EJECUCION.md, .gitignore, docs/engineering/QUALITY_MANUAL.md
2. Léelos 60 segundos para confirmar que existen y no están vacíos (no los modifiques).
3. Stagea SOLO esos 4 archivos:
   git add AGENTS.md PLAN_EJECUCION.md .gitignore docs/engineering/QUALITY_MANUAL.md
4. Commit exacto:
   git commit -m "docs: engineering base — Quality Manual + Execution Plan v2"
5. NO toques ningún otro archivo (los ADRs/dossiers nuevos van en el siguiente prompt).

ACEPTACIÓN:
- `git log -1 --format=%s` → "docs: engineering base — Quality Manual + Execution Plan v2"
- `git status --porcelain` ya NO lista esos 4 archivos
DOSSIER: crea tools/verifications/f0.md con título "# F0 — Rescate", sección "T0.1" y el output de ambos comandos.
REPORTA: SHA del commit (`git rev-parse HEAD`) y salida de `git status --porcelain`.
```

---

### PROMPT T0.2 — Commit WP-C1 (error handler global) 🟡

```
Continúa en el mismo repo (sesión puede ser fresca; lee tools/verifications/f0.md primero).

TAREA: commitear el trabajo WP-C1 ya implementado en el working tree (NO escribas código nuevo).
1. Confirma que existen: apps/kage-runtime/src/error-handler.ts,
   apps/kage-runtime/src/__tests__/error-handler.test.ts,
   docs/adr/0009-centralized-error-handling.md, tools/verifications/wp-c1-closure.md
   (los dos últimos aparecieron tras corrección de .gitignore).
2. NOTA OPERATIVA: server.ts contiene cambios mezclados de C1 y C2 — se commitea ÍNTEGRO en T0.3
   (no uses git add -p).
3. Stagea SOLO:
   git add apps/kage-runtime/src/error-handler.ts apps/kage-runtime/src/__tests__/error-handler.test.ts docs/adr/0009-centralized-error-handling.md tools/verifications/wp-c1-closure.md
4. Commit exacto:
   git commit -m "feat(kage-runtime): global error handler + not-found handler (WP-C1)" -m "Refs: ADR-0009"
5. Verifica que el árbol compila EN EL WORKING TREE (aún hay cambios sin commit, es normal):
   pnpm typecheck

ACEPTACIÓN:
- `git log -1 --format=%s` → "feat(kage-runtime): global error handler + not-found handler (WP-C1)"
- `pnpm typecheck` exit 0
DOSSIER: añade sección "T0.2" a tools/verifications/f0.md con outputs.
REPORTA: SHA y resultado de typecheck.
```

---

### PROMPT T0.3 — Commit WP-C2 + integración server.ts + residuales 🟡

```
Continúa en el mismo repo (lee tools/verifications/f0.md primero).

TAREA: commitear WP-C2 (ya implementado) + la parte de server.ts que integra C1+C2 + archivos residuales.
1. Verifica que existen (sin trackear o modificados): packages/common-utils/src/circuit-breaker.ts,
   circuit-breaker.test.ts, timeouts.ts, packages/integrations-http/src/retry.test.ts,
   tests/helpers/mock-event-bus.test.ts, docs/adr/0010-circuit-breaker-timeouts.md
2. Stagea en DOS commits:

   COMMIT A (WP-C2):
   git add packages/common-utils/src/circuit-breaker.ts packages/common-utils/src/circuit-breaker.test.ts packages/common-utils/src/timeouts.ts packages/common-utils/src/index.ts packages/contracts/src/errors.ts packages/integrations-http/src/retry.ts packages/integrations-http/src/retry.test.ts packages/integrations-llm/src/client.ts packages/integrations-llm/src/classify-error.ts packages/integrations-llm/package.json packages/integrations-lightrag/src/lightrag-client.ts packages/integrations-lightrag/package.json packages/agent-runtime/src/schema.ts packages/agent-runtime/src/executor.test.ts packages/agent-runtime/src/executor-fallback.test.ts docs/adr/0010-circuit-breaker-timeouts.md pnpm-lock.yaml
   git commit -m "feat(common-utils,integrations-llm,integrations-lightrag): CircuitBreaker + hierarchical timeouts + Retry-After (WP-C2)" -m "Refs: ADR-0010"

   COMMIT B (integración + generados):
   git add apps/kage-runtime/src/server.ts docs/errors.md packages/events/errors.txt apps/forge-console/next-env.d.ts apps/forge-console/tsconfig.json tools/verifications/wp-b1.md tests/helpers/mock-event-bus.test.ts
   git commit -m "chore(kage-runtime): wire error handler + circuit breaker into composition root; sync generated files"

3. Verificación final:
   pnpm typecheck && pnpm test && pnpm errors:check   (los tres exit 0)
   git status --porcelain                              → debe quedar VACÍO (salvo borrados D pendientes)

4. Borrados ya confirmados (utils.test.ts eliminado, generate-error-docs.ts eliminado):
   git add -u
   git commit -m "chore: remove dead utils.test.ts and legacy generate-error-docs.ts"

ACEPTACIÓN:
- Los 3 comandos de verificación exit 0
- `git status --porcelain | wc -l` → 0
DOSSIER: añade "T0.3" con los outputs. Este cierre la Etapa 0.
REPORTA: SHAs de los 3 commits + output de git status final.
```

---

### 🔍 AUDITORÍA E-0 (cerebro)
Comandos que ejecutaré: `git log --oneline -6`, `pnpm typecheck && pnpm test && pnpm errors:check`, `git status --porcelain | wc -l`, revisión del diff de server.ts vs HEAD~3, spot-check Manual §4.

---
---

# ETAPA 1 — BLINDAJE 🔴🟢 (secuencial · 1 terminal · 3 prompts)

**Objetivo:** referencias rotas arregladas, bugs P0 de seguridad corregidos con tests, licencia y blindaje anti-publish.
**Precondición:** E-0 ✅.

---

### PROMPT T1.1 — Refs rotas + Fix CORS 🟢→🟡

```
Repo: ninja-ai-framework, rama fix/epic-b-foundations. Lee QUALITY_MANUAL.md §4.5 (eventos/Zod) y §6.1 solo si dudas.

PARTE A — Referencias rotas:
1. En docs/architecture/fuentes-guia.md, sección "§6 Referencias Cruzadas": corrige las filas que apuntan
   a tools/coherencia-estructural.md → docs/architecture/coherencia-estructural.md
   y tools/fuentes-guia.md → docs/architecture/fuentes-guia.md.
   Elimina las filas de vault-memory-layers.md y plan-construccion-fases.md (esos archivos no existen).
2. En package.json raíz: elimina la línea del script "scaffold:workspace" (su archivo no existe).

PARTE B — Fix CORS (bug P0 #1):
3. En apps/kage-runtime/src/server.ts busca la línea:
   allowedHeaders: ['Content-Type', 'Authorization', 'X-Ninja-Session'],
   Reemplázala por:
   allowedHeaders: ['Content-Type', 'Authorization', 'X-Ninja-Key'],
4. Crea el test apps/kage-runtime/src/__tests__/cors-auth-header.test.ts:
   - Usa fastify.inject o construye la app igual que los tests existentes de error-handler
     (mira __tests__/error-handler.test.ts como patrón).
   - Test 1: OPTIONS preflight con headers Origin: http://localhost:3001 y
     Access-Control-Request-Headers: x-ninja-key → respuesta 200/204 y
     access-control-allow-headers CONTIENE "X-Ninja-Key" (case-insensitive).
   - Test 2: GET con header X-Ninja-Key válido desde origin permitido no recibe error CORS.
   - Si necesitas la key de prueba, mira cómo auth-key.ts genera/valida y mockea según el patrón
     de los tests existentes de auth (busca tests que cubran X-Ninja-Key).

ACEPTACIÓN:
- pnpm vitest run apps/kage-runtime/src/__tests__/cors-auth-header.test.ts → verde
- pnpm typecheck && pnpm test → exit 0
- git grep -n "tools/coherencia" -- "*.md" → vacío
COMMITS:
  fix(docs): repair governance cross-references after architecture move
  fix(kage-runtime): allow X-Ninja-Key in CORS preflight — reactivates browser auth
DOSSIER: añade "T1.1" a f0.md (renómbralo mentalmente: es el registro de F0 continuado) con outputs.
REPORTA: outputs de los tests.
```

---

### PROMPT T1.2 — Approver identity real (Ley 6) 🔴 SENSIBLE

```
Repo: ninja-ai-framework. Lee QUALITY_MANUAL.md §6.1-§6.3 (seguridad) ANTES de empezar.
Este cambio toca superficie sensible → tu dossier debe incluir la tabla STRIDE-lite de 6 filas.

TAREA: eliminar el approver hardcodeado.
1. En apps/kage-runtime/src/server.ts busca TODAS las ocurrencias de:
   const approver = { id: 'api-user', role: 'admin' };
   (deben ser 2: en /api/approvals/:id/approve y :id/reject).
2. Reemplaza cada una por identidad derivada del request autenticado:
   import { createHash } from 'node:crypto';   (al inicio del archivo, con los otros imports)
   ...
   const keyHeader = request.headers['x-ninja-key'];
   const fingerprint = createHash('sha256').update(String(keyHeader ?? '')).digest('hex').slice(0, 12);
   const approver = { id: `operator-${fingerprint}`, role: 'operator' };
3. Crea el test apps/kage-runtime/src/__tests__/approver-identity.test.ts:
   - Mockea ApprovalManager igual que hacen los tests existentes (mira patrones en __tests__/).
   - Test 1: approve con key A registra approver.id empezando por "operator-" y ≠ al registrado con key B.
   - Test 2: reject registra el mismo formato.
   - Test 3: el rol NUNCA es 'admin'.
4. NO cambies nada más (ni roles existentes del ApprovalManager ni sus validaciones internas).

ACEPTACIÓN:
- pnpm vitest run apps/kage-runtime/src/__tests__/approver-identity.test.ts → verde
- pnpm typecheck && pnpm test → exit 0
- git grep -n "api-user" -- apps/kage-runtime/src/server.ts → vacío
COMMIT:
  fix(kage-runtime): derive approver identity from auth key — removes hardcoded admin (Ley 6)
DOSSIER: añade "T1.2" con STRIDE-lite (Spoofing/Tampering/Repudiation/InfoDisclose/DoS/Elevation × vector/control/test).
REPORTA: outputs + la tabla STRIDE.
```

---

### PROMPT T1.3 — Trackers + Licencia + blindaje 🟢

```
Repo: ninja-ai-framework. Lee PLAN_EJECUCION.md §10 (KPIs) para los números reales.

PARTE A — Sincronizar trackers con la realidad:
1. tools/enterprise-progress.md:
   - EPIC A → "██████████ 100% ✅ COMPLETO (S0–S5)"
   - EPIC C → "█████░░░░░ 50% (C1+C2 commitados; C3/C4 en FASE 2)"
   - Footer → "commits reales verificados en auditoría 2026-08-24; plan operativo: PLAN_EJECUCION.md"
   - Marca los checkboxes S0–S5 como [x] y WP-C1/C2 como [x].
2. README.md: elimina el claim "292/292" y "EPIC A en progreso". Estado nuevo: EPIC A+B cerrados,
   EPIC C 50%, tests ~750+, rama activa según git branch --show-current. Elimina el code fence
   vacío sobrante al final del archivo.
3. CHANGELOG.md: añade bajo Unreleased:
   ### Fixed
   - CORS: X-Ninja-Key ahora permitido en preflight (reactiva auth de browser)
   - Approvals: identidad de aprobador derivada de la key (antes hardcodeada admin)

PARTE B — Blindaje:
4. Crea LICENSE: texto propietario "All Rights Reserved. Copyright (c) 2026 [OWNER]. Uso, copia,
   distribución o modificación prohibidos sin licencia expresa por escrito." (plantilla estándar propietaria).
5. En TODOS los packages/*/package.json que no tengan "private": true, añádelo (nivel raíz del objeto).
   Las apps ya lo tienen — verifica pero no dupliques.
6. package.json raíz: añade "engines": { "node": ">=22 <25" }.
7. Crea .nvmrc con el contenido exacto: 22

ACEPTACIÓN:
- for f in packages/*/package.json; do node -e "process.exit(require('./$f').private?0:1)" || echo "FALTA:$f"; done → sin salida
- node -e "console.log(require('./package.json').engines.node)" → ">=22 <25"
- git grep -n "292/292" -- README.md → vacío
COMMITS:
  docs(progress): sync trackers with audited reality (EPIC A done, C at 50%)
  chore: proprietary LICENSE + private:true on all packages + engines pin
DOSSIER: añade "T1.3" con outputs.
REPORTA: outputs.
```

---

### 🔍 AUDITORÍA E-1
Verifico: grep `api-user`=0, CORS test verde, STRIDE-lite presente y coherente, LICENSE/private/engines, trackers sin claims falsos, red→green de los tests P0.

---
---

# ETAPA 2 — INTEGRACIÓN 🟡👤🟢 (1 terminal + USUARIO)

**Precondición:** E-1 ✅.

### PROMPT T2.1 — Merge + tag + bundle 🟡

```
Repo: ninja-ai-framework. Ejecuta EXACTAMENTE estos pasos, en orden, deteniéndote ante cualquier error:
1. git checkout main
2. git merge fix/epic-b-foundations --no-ff -m "merge: EPIC A+B complete + EPIC C partial + engineering base (v0.9.0-audit)"
3. pnpm install && pnpm typecheck && pnpm test    (en main; los tres deben dar exit 0)
4. git tag -a v0.9.0-audit -m "Audited baseline: EPIC A+B complete, WP-C1/C2 committed, P0 security fixes in"
5. git bundle create ../ninja-backup-2026-08-24.bundle --all
6. git checkout fix/epic-b-foundations   (volver a la rama de trabajo)
ACEPTACIÓN: git log main --oneline -1 muestra el merge · git tag -l "v0.9.0*" existe · el bundle existe fuera del repo.
DOSSIER: añade "T2.1" a tools/verifications/f0.md.
REPORTA: SHA del merge en main y ruta del bundle.
```

### ACCIÓN T2.2 — 👤 USUARIO
GitHub.com → repo juanptovardev/Ninja-AI-Framework → Settings → General → Danger Zone → Change visibility → **Private**. Confirmar con el auditor.

### PROMPT T2.3 — Push verificado 🟢

```
Repo: ninja-ai-framework. SOLO si el auditor confirmó que el repo ya es privado:
1. curl -s https://api.github.com/repos/juanptovardev/Ninja-AI-Framework | findstr /i "\"private\"" 
   (o en bash: curl -s ... | grep '"private"') → debe mostrar "private": true
2. git push origin main --tags
3. git push origin fix/epic-b-foundations
4. git ls-remote origin | head -5   → main debe apuntar al SHA del merge
COMMIT: ninguno. DOSSIER: añade "T2.3" con outputs.
REPORTA: salida de ls-remote.
```

### 🔍 AUDITORÍA E-2
Verifico: API visibility=private, ls-remote=merge SHA, bundle íntegro (`git bundle verify`), riesgos R1/R2 cerrados en §9 del plan.

---
---

# ETAPA 3 — GATES LOCALES 🟡🔴🟢 (secuencial · 1 terminal · 3 prompts)

**Precondición:** E-2 ✅. Trabajo directo en `main` de ahora en adelante (ramas cortas por WP).

---

### PROMPT T3.1 — Husky + hooks 🟡

```
Repo: ninja-ai-framework, rama main. Lee QUALITY_MANUAL.md §3.1 (gates) y §9.2.
TAREA: instalar gates locales.
1. Justifica en el dossier (§9.2): husky+lint-staged son devDependencies que sustituyen la CI remota
   eliminada; no son runtime deps; no están en Directiva §4.2.
2. pnpm add -Dw husky lint-staged
3. pnpm pkg set scripts.prepare="husky" && npx husky init
4. Reemplaza el contenido de .husky/pre-commit por:
   pnpm lint-staged
5. Crea .husky/pre-push con:
   pnpm typecheck && pnpm test && pnpm errors:check
6. Añade a package.json raíz la config:
   "lint-staged": { "*.ts": ["prettier --write", "eslint --fix"] }
7. Prueba los hooks: haz un cambio trivial (espacio en un .md), commit (hook debe correr),
   y un push a rama scratch `git checkout -b scratch-hook-test && git push origin scratch-hook-test`
   (pre-push debe correr G2). Borra la rama scratch remota y local después:
   git push origin --delete scratch-hook-test && git checkout main && git branch -D scratch-hook-test
ACEPTACIÓN: hooks disparados evidenciados (output pegado en dossier) · git push origin --delete exit 0.
COMMIT: chore(devx): local quality gates — husky pre-commit/pre-push (G1/G2)
DOSSIER: "T3.1" con justificación §9.2 + evidencia de hooks.
```

---

### PROMPT T3.2 — ESLint flat config + DEBT 🔴

```
Repo: ninja-ai-framework. Lee QUALITY_MANUAL.md §4.1-§4.3.
TAREA: migrar a flat config y endurecer reglas SIN romper la base.
1. Crea eslint.config.mjs (flat) que preserve el comportamiento actual de .eslintrc.cjs:
   - TypeScript ESLint recommended + prettier compat.
   - Reglas a "error": @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion.
   - MANTÉN el guard no-restricted-syntax existente contra throw new Error( en los archivos migrados.
   - Añade no-restricted-imports con las capas del Manual §4.2 (patrones por glob):
     * En packages/contracts/**: restringir imports relativos a otros packages (@ninja/* excepto types inline propios).
     * En packages/{config,logging,storage,events,common-utils,vault}/** (L1): prohibir imports de L2/L3/L4
       (@ninja/kage-engine, @ninja/agent-runtime, @ninja/flow-matrix, @ninja/arsenal-registry, @ninja/workbench,
       @ninja/trace-ledger, @ninja/sentinel, @ninja/model-gateway, @ninja/pulse-center, @ninja/learning-loop,
       @ninja/forge-lab, @ninja/roster, @ninja/integrations-*, @ninja/client-adapters, @ninja/delegation-router,
       @ninja/installer, @ninja/ui-kit, @ninja/office-grid, @ninja/app-shell).
     * En packages L2 (domain): prohibir L3/L4 (integrations-* y apps).
     * En packages L3 (integration): prohibir L2 domain y L4 apps.
     * ui-kit/office-grid/app-shell: prohibir todo @ninja/* excepto contracts/events/logging/config/common-utils.
   - Excepciones temporales (overrides con comentario // DEBT(F3)): archivos que hoy violan — genéralos
     ejecutando pnpm lint y listando los ficheros que fallen; NO intentes arreglarlos ahora.
2. Actualiza los scripts lint de los paquetes para usar la nueva config (elimina ESLINT_USE_FLAT_CONFIG=false
   donde exista). Borra .eslintrc.cjs cuando nada lo referencie.
3. pnpm lint → debe salir VERDE con los overrides DEBT en sitio. Cuenta y lista los archivos en DEBT.
ACEPTACIÓN: pnpm lint exit 0 · lista DEBT documentada · reglas layer en el config.
COMMIT: chore(lint): ESLint 9 flat config — any/non-null to error + layer import rules + DEBT overrides
DOSSIER: "T3.2" + lista DEBT(F3) exacta por archivo.
```

---

### PROMPT T3.3 — passWithNoTests + skip 🟢

```
Repo: ninja-ai-framework. Lee QUALITY_MANUAL.md §5.4.
TAREA:
1. package.json raíz: script test → "vitest run" (sin --passWithNoTests).
2. tests/integration/runtime-lifecycle.test.ts: resuelve el it.skip('shutdown closes gracefully with timeout'):
   implementa el test usando el lifecycle real (arranca runtime de prueba como hacen los otros tests
   del archivo, fuerza shutdown, assertion con fake timers si aplica). Si tras 2 intentos honestos
   no logras estabilizarlo, documenta §15 EXC en el dossier con expiry F2 y déjalo skip + comentario QUARANTINE.
3. pnpm test → exit 0. git grep -c "\.skip(" -- "*.test.ts" → 0 (o 1 con EXC documentada).
COMMIT: test(integration): resolve shutdown-timeout skip — root vitest strict mode
DOSSIER: "T3.3".
```

### 🔍 AUDITORÍA E-3
Verifico: hooks con evidencia, flat config con reglas layer correctas (pruebo import ilegal en scratch), DEBT listada exacta, 0 skips, G2 manual verde en main.

---
---

# ETAPA 4 — RESILIENCIA 🟡×3∥ → wiring 🔴 (∥ = hasta 3 terminales + MERGE KIT)

**Precondición:** E-3 ✅. Cada prompt ∥ crea SU worktree. Los 3 tocan paquetes/archivos DISTINTOS.

---

### PROMPT T4.1∥ — Health granular (worktree A) 🟡

```
SETUP:
cd C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework
git worktree add ../ninja-t41 -b feat/wp-c3-health && cd ../ninja-t41 && pnpm install
LECTURA: QUALITY_MANUAL.md §7.4 (health) · apps/kage-runtime/src/__tests__/error-handler.test.ts (patrón de test).
TAREA:
1. Crea apps/kage-runtime/src/routes/health.ts:
   export function registerHealthRoutes(server, deps: { db: Database.Database; env: {...} })
   - GET /health (liveness): { status:'ok', uptime } — sin tocar DB.
   - GET /health/ready (readiness): ejecuta SELECT 1 sobre deps.db; verifica env LLM_BASE_URL/LLM_API_KEY
     presentes; responde 200 {status:'ready', checks:{db:true,llm:true}} o 503 {checks:{...false}}.
   - Emite eventBus event 'health.ready.changed' cuando el estado flipa (import eventBus de @ninja/events;
     emite solo en transición, no en cada request).
2. Test routes/health.test.ts con fastify inject: ready 200 con db mock OK; 503 con db que lanza;
   liveness siempre 200.
RESTRICCIÓN: NO registres las rutas en server.ts (eso lo hace T4.4). Solo el módulo + tests.
ACEPTACIÓN: pnpm vitest run apps/kage-runtime/src/routes → verde · pnpm typecheck verde.
COMMIT: feat(kage-runtime): granular health routes — liveness/readiness + ready-changed event (WP-C3)
DOSSIER: tools/verifications/wp-c3-health.md con outputs + nota "pendiente wire en T4.4".
REPORTA: SHA de feat/wp-c3-health.
```

---

### PROMPT T4.2∥ — WS reconnect (worktree B) 🟡

```
SETUP:
cd C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework
git worktree add ../ninja-t42 -b feat/wp-c3-ws-reconnect && cd ../ninja-t42 && pnpm install
LECTURA: apps/forge-console/lib/ws-client.ts (cliente vivo) y lib/ws.ts (muerto).
TAREA:
1. En lib/ws-client.ts añade reconexión: backoff exponencial 1000ms→30000ms (×2) con jitter ±20%;
   al reconectar, re-ejecutar el handshake de auth ({action:'auth',key}) y esperar auth.ok antes de
   resuscribirse; exponer estado ('connecting'|'open'|'reconnecting'|'closed') vía callback/store zustand
   ya usado en el proyecto (busca cómo se consume hoy el WS en app/).
2. Máximo 5 intentos; luego estado 'closed' + log warn estructurado.
3. Verifica 0 referencias a lib/ws.ts y ELLIMÍNALO: git rm apps/forge-console/lib/ws.ts
4. Test unitario del cálculo de backoff (función pura exportada nextBackoffMs(attempt)) — sin WS real:
   attempt 0→~1000ms±20%, 4→~16000ms±20%, ≥5→closed. Usa vitest con fake timers si hace falta.
ACEPTACIÓN: pnpm vitest run (forge-console scope) verde · grep ws.ts refs = 0 · pnpm typecheck verde.
COMMIT: feat(forge-console): ws auto-reconnect with jittered backoff + remove dead ws.ts (WP-C3)
DOSSIER: tools/verifications/wp-c3-ws.md.
REPORTA: SHA de feat/wp-c3-ws-reconnect.
```

---

### PROMPT T4.3∥ — Persistencia Pulse/Audit (worktree C) 🟡🔴

```
SETUP:
cd C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework
git worktree add ../ninja-t43 -b feat/wp-c4-persistence && cd ../ninja-t43 && pnpm install
LECTURA: packages/storage/src/migrations.ts (runner) · packages/workbench/src/migrations/workspace-migrations.ts
(patrón) · packages/storage/src/db.ts (WAL) · QUALITY_MANUAL.md Gate 4 (§3.1).
TAREA:
1. Localiza el registro de migraciones de la DB global (~/.ninja/ninja.db) siguiendo cómo server.ts
   inicializa la DB y qué runner aplica. Ahí añade:
   - Migración 7 up: CREATE TABLE pulse_metrics (id INTEGER PK AUTOINCREMENT, captured_at TEXT NOT NULL,
     metric TEXT NOT NULL, value REAL NOT NULL, context TEXT); + índice (metric, captured_at).
     down: DROP TABLE pulse_metrics.
   - Migración 8 up: CREATE TABLE audit_log (id INTEGER PK AUTOINCREMENT, created_at TEXT NOT NULL,
     actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, result TEXT NOT NULL, detail TEXT);
     down: DROP TABLE audit_log.
2. Crea repositorios en packages/trace-ledger/src/repositories/: pulse-metric.repository.ts y
   audit-log.repository.ts (insert + query por rango de fechas/métrica), siguiendo el estilo de los
   repos existentes ahí (artifact.repository.ts).
3. Tests: migración up/down idempotente sobre DB temporal (:memory: o tmp file); insert+query básico
   de ambos repos.
RESTRICCIÓN: NO conectes aún monitor.ts ni auditor.ts a los repos (eso es T4.4). Solo esquema + repos + tests.
ACEPTACIÓN: pnpm vitest run packages/storage packages/trace-ledger → verde · up/down idempotente probado.
COMMIT: feat(storage,trace-ledger): pulse_metrics + audit_log migrations (up/down) + repositories (WP-C4)
DOSSIER: tools/verifications/wp-c4-persistence.md.
REPORTA: SHA de feat/wp-c4-persistence.
```

---

### MERGE KIT E4-A (terminal principal, tras terminar T4.1-T4.3)

```
cd C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework
git checkout main
git merge feat/wp-c3-health --no-ff -m "merge: wp-c3-health"
git merge feat/wp-c3-ws-reconnect --no-ff -m "merge: wp-c3-ws-reconnect"
git merge feat/wp-c4-persistence --no-ff -m "merge: wp-c4-persistence"
pnpm install && pnpm typecheck && pnpm test
Si conflicto → DETENER, reportar al auditor. Luego limpieza:
git worktree remove ../ninja-t41 ; git branch -d feat/wp-c3-health  (ídem t42/t43)
```

---

### PROMPT T4.4 — Wiring resiliencia (tras merges, secuencial) 🔴

```
Repo: ninja-ai-framework, rama main. Lee apps/kage-runtime/src/lifecycle.ts completo + server.ts zonas de plugins.
TAREA (integración de todo lo anterior + lo restante de C4):
1. server.ts: importa registerHealthRoutes y regístralo con deps {db, env}. Sustituye el GET /health
   inline actual por el del módulo (misma ruta, mismo contrato público).
2. Rate limiting: pnpm add @fastify/rate-limit (justificar §9.2 en dossier). Registro global:
   max 100/min keyed por X-Ninja-Key; override /api/shell/execute → max 10/min. Test: 11ª shell → 429.
3. Security headers: pnpm add @fastify/helmet. Registro con defaults; verificar header
   X-Content-Type-Options nosniff en respuesta de /health.
4. Logs JSON (Manual §7): extiende packages/logging/src/logger.ts con modo JSON (una línea por evento,
   campos ts/level/logger/msg + extras) activable por env LOG_FORMAT=json (añádelo a EnvSchema con
   default pretty). Fastify access-log mínimo via onRequest hook usando ese logger con correlationId
   (genReqId). ACTUALIZA docs/user/troubleshooting.md al formato real.
5. Shutdown completo en lifecycle.ts: extender teardown para cerrar en orden: WS → HTTP server →
   rate-limit timers → Pulse intervals → Auditor flush (usa auditor.getAuditLog + persist a audit_log
   repo de T4.3) → Engram client → DB close. Timeout global 10s → process.exit(1).
   Test integración: arranca app, shutdown, assert logs de orden + DB cerrada.
ACEPTACIÓN: pnpm build && pnpm test && pnpm errors:check verde · tests nuevos verdes ·
curl /health devuelve headers helmet.
COMMIT: feat(kage-runtime): resilience wiring — health routes live, rate-limit, helmet, JSON logs, full graceful shutdown (WP-C3/C4 closure)
DOSSIER: tools/verifications/wp-c4-wiring.md + STRIDE-lite del rate limiter.
REPORTA: outputs completos.
```

### 🔍 AUDITORÍA E-4 (crítica)
Verifico: 3 branches mergeadas limpias, migraciones up/down reales (corro down en DB copy), rate-limit 429 real, logs parsean JSON, shutdown test, STRIDE de T4.4, EXC de quarantines vigentes.

---
---

# ETAPA 5 — SUITES DE TESTS 🟢×6 (∥ = hasta 6 terminales, cero solapamiento)

**Precondición:** E-4 ✅. La etapa más paralela: cada terminal = UN paquete distinto.
**Meta común:** ≥70% líneas en flow-matrix/workbench; ≥50% en el resto. Sin DOM (usa lógica pura); si un componente necesita render, añade `-D` `@testing-library/react jsdom` JUSTIFICADO en dossier.
**Setup worktree común para cada terminal n:** `git worktree add ../ninja-t5<n> -b feat/wp-d3-<pkg> && cd ../ninja-t5<n> && pnpm install`

---

### PROMPT T5.1∥ — flow-matrix tests 🟢

```
SETUP worktree (feat/wp-d3-flow-matrix). LEE: packages/flow-matrix/src/* completo (598 líneas, léelo TODO).
TAREA: suite *.test.ts junto a cada módulo cubriendo: ejecución secuencial en orden, propagación de
fallos entre steps, configuración de retry, estados del workflow (running/paused/cancelled si existen),
emisión de eventos por step (mockea eventBus con tests/helpers/mock-event-bus.ts del repo MAIN — cópialo
si el worktree no lo tiene trackeado aún). Mockea dependencias externas; nada de red.
ACEPTACIÓN: pnpm vitest run packages/flow-matrix --coverage → lines ≥70%. Pega el resumen de cobertura.
COMMIT: test(flow-matrix): executor coverage — ordering, failure propagation, retry, events
DOSSIER: tools/verifications/wp-d3-flow-matrix.md con resumen de cobertura.
```

### PROMPT T5.2∥ — workbench tests 🟢

```
SETUP worktree (feat/wp-d3-workbench). LEE: packages/workbench/src/* completo.
TAREA: tests de workspace lifecycle (create/open/close/list) y del migration runner: idempotencia
(re-run misma migración = no-op), fail-hard en error, orden de aplicación. Usa DB temporal.
ACEPTACIÓN: coverage ≥70% en packages/workbench. COMMIT: test(workbench): workspace lifecycle + migration runner coverage
DOSSIER: wp-d3-workbench.md.
```

### PROMPT T5.3∥ — logging + learning-loop 🟢

```
SETUP worktree (feat/wp-d3-log-learning).
logging: niveles filtran correctamente, createLogger naming, modo JSON si ya existe (F2.7).
learning-loop: harvester recolecta eventos → candidatos; evaluator scoring determinista; promoter umbral
(mockea bus y storage). Meta ≥50% c/u.
COMMIT: test(logging,learning-loop): logger levels + harvest/evaluate/promote coverage
DOSSIER: wp-d3-log-learning.md.
```

### PROMPT T5.4∥ — forge-lab + integrations-engram 🟢

```
SETUP worktree (feat/wp-d3-forge-engram).
forge-lab: analyzer produce shape esperado sobre fixture pequeño (crea fixture en __fixtures__), normalizer
normaliza, quality scorer acotado 0-100. engram: compressor ratio lógica (5:1 diferencial), client CRUD
contra SQLite :memory:. Meta ≥50% c/u.
COMMIT: test(forge-lab,engram): analyzer/normalizer/scorer + compressor/client coverage
DOSSIER: wp-d3-forge-engram.md.
```

### PROMPT T5.5∥ — integrations-git + lightrag 🟢

```
SETUP worktree (feat/wp-d3-git-lightrag).
git: parsing de status/log con child_process MOCKEADO (nunca git real). lightrag: chunker (split semántico,
tamaños, solapes) con casos límite (texto vacío, 1 palabra, unicode), client con fetch mockeado (errores HTTP,
timeouts → errores tipados). Meta ≥50% c/u.
COMMIT: test(git,lightrag): parsers + chunker + typed error paths coverage
DOSSIER: wp-d3-git-lightrag.md.
```

### PROMPT T5.6∥ — ui-kit + office-grid + decisión app-shell 🟢

```
SETUP worktree (feat/wp-d3-ui).
ui-kit/office-grid: testa lógica PURA (hooks de estado, cálculos de layout/grid, tipos) SIN render DOM.
Si un hook requiere React runtime: pnpm add -D @testing-library/react jsdom SOLO en ese paquete +
justificación dev-only en dossier. app-shell (5 líneas): decide y ejecuta UNA opción: (a) disolver su
contenido en ui-kit y eliminar el paquete (actualiza tsconfig/vitest aliases + turbo + imports), o
(b) dejarlo con test mínimo. Documenta la decisión y el porqué en el dossier.
Meta ≥50% c/u. COMMIT: test(ui-kit,office-grid): pure logic coverage + app-shell resolution (WP-D3c)
DOSSIER: wp-d3-ui.md con la decisión de app-shell.
```

### MERGE KIT E5 (orden numérico, mismo patrón que E4-A; conflicto → auditor)

### 🔍 AUDITORÍA E-5
Verifico: `for d in packages/*/; do [ -z "$(git ls-files "${d}src/**/*.test.ts")" ] && echo "$d"; done` → vacío · coberturas ≥70/≥50 reales (no infladas con asserts triviales — reviso calidad de asserts) · decisión app-shell ejecutada y aliases consistentes.

---
---

# ETAPA 6 — CALIDAD CENTRAL 🟡🔴 (secuencial · 1 terminal · 6 prompts)

**Precondición:** E-5 ✅.

### PROMPT T6.1 — common-utils real 🟡

```
Lee packages/common-utils/src/*. Lee Manual §4.2 (common-utils es L1: no importa otros @ninja/* salvo nada).
TAREA: completa la librería con tests: retryWithBackoff(opts) (jitter, Retry-After opcional param),
Result<T,E> (ok/err/isOk/map), debounce/throttle (fake timers), deepFreeze, safeJsonParse<T>.
Prohibido depender de otros @ninja/*. Cobertura ≥80%.
COMMIT: feat(common-utils): retryWithBackoff, Result, debounce/throttle, deepFreeze, safeJsonParse (WP-D1)
DOSSIER: wp-d1-common-utils.md.
```

### PROMPT T6.2 — thresholds cobertura 🟢

```
vitest.config.ts: coverage.thresholds = { lines: 50, functions: 45, statements: 50 }
+ per-package overrides 70 lines para: contracts, kage-engine, agent-runtime, sentinel, model-gateway,
vault, flow-matrix, workbench. Verifica rompiendo a propósito en scratch y restaurando.
COMMIT: chore(test): enforce coverage thresholds — 50 global / 70 critical (WP-D2)
DOSSIER: wp-d2-thresholds.md.
```

### PROMPT T6.3 — server.ts rutas PARTE 1 🔴

```
Lee apps/kage-runtime/src/server.ts COMPLETO + Manual §4.4 (budgets) y §4.2 (apps=L4).
TAREA: extrae la PRIMERA MITAD de rutas inline a módulos routes/ por dominio:
engine.routes.ts (interview/submit/run*/approve/pause/resume/cancel/runs), approvals.routes.ts
(approvals+audit+commits), arsenal.routes.ts (arsenal/artifacts/vault-write). Patrón register<Domain>Routes
(server, deps) como health.ts. Tipa params/body con Zod schemas existentes en route-schemas.ts —
prohibido as any nuevo. server.ts delega; comportamiento idéntico.
ACEPTACIÓN: pnpm build && pnpm test && pnpm test:e2e (smoke health) verde · líneas server.ts reducidas ~40%.
COMMIT: refactor(kage-runtime): extract engine/approvals/arsenal routes from composition root (WP-D4 1/2)
DOSSIER: wp-d4-routes-1.md con conteo antes/después.
```

### PROMPT T6.4 — server.ts PARTE 2 + as any=0 🔴

```
Continuación: extrae la segunda mitad (pulse, learning, shell/git/fs, forgelab, session, settings,
install, doctor, mcp si aplica) a sus routes/*.ts. server.ts <400 líneas, solo composición.
Después: elimina TODOS los as any restantes del repo (baseline lista DEBT de T3.2 + executor.ts 12 +
resto). Tipado correcto con generics de Fastify/Zod — NO casts cosméticos.
ACEPTACIÓN: git grep -o "as any" -- "*.ts" | wc -l → 0 · server.ts <400 líneas · suite completa verde.
COMMIT: refactor(kage-runtime): complete route extraction — composition root under 400 lines (WP-D4 2/2)
      + chore(types): eliminate all `as any` casts across packages and apps
DOSSIER: wp-d4-routes-2.md.
```

### PROMPT T6.5 — Error Boundaries + settings dedup 🟡

```
forge-console: ErrorBoundary por vista (class component o react-error-boundary ya presente? verifica deps;
si añades lib, justifícala) con fallback UI + log al runtime. Settings duplicados (~80%, EV-23):
unifica en una sola fuente (zustand store existente o servicio), migra consumidores, borra duplicados.
ACEPTACIÓN: 0 vistas sin boundary · grep duplicados=0 · build+e2e smoke verde.
COMMIT: fix(forge-console): view ErrorBoundaries + unified settings source (WP-D4)
DOSSIER: wp-d4-frontend.md.
```

### PROMPT T6.6 — Flow Matrix D5 🔴

```
packages/flow-matrix: paralelismo real (allSettled + concurrency limit configurable por step/nodo),
detección deadlock por timeout por rama (error tipado FlowDeadlockError → añadir código a contracts si
aplica + errors:docs), retry por nodo con backoff común-utils, estado persistente entre reinicios
(via storage repo — sigue patrón trace-ledger). Elimina console.warn restantes (EV-25) → logger.
Tests: concurrencia real medida con timing, deadlock detectado, resume tras reinicio.
ACEPTACIÓN: cobertura mantiene ≥70% · suite verde · pnpm errors:docs actualizado si añadiste código.
COMMIT: feat(flow-matrix): true parallelism + deadlock detection + persistent state (WP-D5)
DOSSIER: wp-d5-flow-matrix.md.
```

### 🔍 AUDITORÍA E-6
Ejecuto los KPIs §10 completos: as any=0, throws=0, 32/32 con tests, thresholds activos, server.ts<400, e2e smoke. Reviso asserts de suites nuevas (anti-inflación). Cierro EXC-1.

---
---

# ETAPA 7 — PRODUCTO 🟡×3∥ + seq

**Precondición:** E-6 ✅.

### PROMPT T7.1∥ — Onboarding wizard (worktree A) 🟡

```
SETUP worktree feat/wp-e-onboarding.
forge-console /setup: wizard 4 pasos (zustand): 1) env check (GET /api/doctor ya existe — úsalo),
2) Test Connection placeholder deshabilitado (llega en T7.4), 3) creación de workspace
(POST existente del runtime — busca endpoint session/workspace), 4) tour mínimo (links a páginas clave).
Estados: loading/success/error por paso con retry. Skeletons ya existen — úsalos.
E2E Playwright con LLM/runtimes mockeados según fixtures existentes de tests/e2e/helpers.
COMMIT: feat(forge-console): onboarding wizard — doctor check, workspace bootstrap, guided tour (WP-E3)
DOSSIER: wp-e-onboarding.md.
```

### PROMPT T7.2∥ — content/ en Arsenal + métricas reales (worktree B) 🟡

```
SETUP worktree feat/wp-e-content-metrics.
1. arsenal-registry: ContentPackLoader que lee content/{skills/*.md, workflows/*.json, templates/*.json}
   al iniciar y los expone en el catálogo (source: 'content-pack'). GET /api/arsenal los incluye.
   Test con fixture content/ real.
2. Widgets del rail derecho: alimenta TokenMeter/AgentStatus/SessionTimer/ContextDepth con eventos reales
   del eventBus vía WS (suscripción existente) — elimina datos mock/hardcoded (EV-14/15). Si falta un dato,
   emítelo desde el runtime (evento nuevo tipado en contracts) en vez de simularlo en UI.
ACEPTACIÓN: GET /api/arsenal incluye content pack · widget renderiza datos de una run E2E real.
COMMIT: feat(arsenal,forge-console): content-pack loader + live widget data (WP-E1/E4)
DOSSIER: wp-e-content.md.
```

### PROMPT T7.3∥ — Banner degradado + dialogs=0 (worktree C) 🟡

```
SETUP worktree feat/wp-e-degraded-dialogs.
1. Banner global cuando: WS closed (usa estado de T4.2) o /health/ready 503 → banner persistente
   "Modo degradado: <motivo>" con botón reintentar.
2. Reemplaza TODOS los alert()/confirm() restantes por sonner toast / Radix ConfirmDialog ya presentes
   (EV-20). Busca con grep, uno por uno, preservando la semántica de cada diálogo.
ACEPTACIÓN: grep dialogs → 0 · e2e smoke verde.
COMMIT: feat(forge-console): degraded-mode banner + replace all native dialogs (WP-E3/E2)
DOSSIER: wp-e-degraded.md con lista archivo-por-archivo de reemplazos.
```

### MERGE KIT E7-A (orden 7.1→7.2→7.3, conflicto → auditor)

### PROMPT T7.4 — Test Connection real + companion + agentId 🟢🟡

```
1. Settings providers: botón Test Connection ejecuta ping REAL al LLM (models endpoint o complete mínimo
   1 token, timeout 5s, vía @ninja/integrations-llm) mostrando ms + modelo. Deshabilita el placeholder del wizard.
2. Learning Loop: corrige EV-27 (agentId usa workspaceId) — usa el agentId real del candidato; test de regresión.
3. Companion extension: ADR-0011 decide: MVP mínimo (leer ~/.ninja/runtime.key, status bar conexión :3141,
   notificación de approvals pendientes vía polling /api/approvals) O de-scope explícito del README/layout.
   Ejecuta la opción elegida.
ACEPTACIÓN: test connection E2E mockeado verde · regresión agentId verde · ADR-0011 + acción hecha.
COMMIT: feat(forge-console): real LLM test connection + learning-loop agentId fix + companion decision (ADR-0011)
DOSSIER: wp-e-final.md.
```

### 🔍 AUDITORÍA E-7
Wizard E2E completo, arsenal sirve content/, 0 dialogs, banner reacciona a WS caído, agentId regression, ADR-0011 consistente con lo implementado.

---
---

# ETAPA 8 — COMERCIAL 🔴🟡🟡 (secuencial · 3 prompts)

### PROMPT T8.1 — Empaquetado Windows 🔴

```
INVESTIGA primero (30 min máx): opciones de empaquetado para Node desktop local-first en Windows:
NSIS (electron-builder standalone sin electron), MSIX, portable+service. Escribe ADR-0012 eligiendo la
opción mínima viable que: bundle kage-runtime (Node embebido), sirva forge-console build estático,
instale dojo-cli, gestione ~/.ninja. IMPLEMENTA el pipeline de build (script scripts/build-installer.mjs
que: pnpm build → empaqueta dist + static console + node runtime → genera instalador).
ACEPTACIÓN: instalador generado instala en máquina limpia (o sandbox) y /health responde.
COMMIT: feat(distribution): Windows installer pipeline (WP-F4 minimal, ADR-0012)
DOSSIER: wp-f-packaging.md + ADR-0012.
```

### PROMPT T8.2 — EULA + i18n 🟡

```
1. EULA: pantalla primera-ejecución forge-console con aceptación persistida (localStorage+flag runtime).
2. i18n: next-intl, locales es (default) + en, directorio messages/. Migra SOLO el chrome de UI
   (nav, botones, títulos, wizard, banner). Contenido dinámico queda como está.
ACEPTACIÓN: switch idioma persiste · wizard navegable en ambos idiomas · build verde.
COMMIT: feat(forge-console): first-run EULA + i18n es/en scaffolding (WP-G3 partial)
DOSSIER: wp-g-i18n.md.
```

### PROMPT T8.3 — RELEASE v1.0.0 🟡

```
Gate 3 completo (Manual §10.2): pnpm build && pnpm test && pnpm test:e2e && pnpm audit --prod →
secret scan §6.5 → CHANGELOG final (todas las fases F0-F5) → bump lockstep 1.0.0 en 32+4 package.json →
tag anotado v1.0.0 → bundle backup → push (repo privado confirmado). Genera instalador final T8.1.
ACEPTACIÓN: checklist §10.2 ítem por ítem pegado en dossier · tag existe · installer artifact listo.
COMMIT: chore(release): v1.0.0 — enterprise-ready baseline
DOSSIER: release-v1.0.0.md (postmortem ligero: lead time total, hotfixes, deuda restante conocida).
```

### 🔍 AUDITORÍA FINAL
Los 8 criterios de PLAN_EJECUCION §11, uno por uno, con evidencia. Veredicto v1.0.0.

---
---

## 4. Qué pegarme cuando pidas auditoría ("audita etapa N")

```
Etapa N completada. Prompts ejecutados: [lista IDs]. Desviaciones: [ninguna / describir].
Dossiers: [rutas]. Outputs clave adjuntos: [pegar los REPORTA de cada prompt].
```

Con eso yo corro mis comandos, reviso dossiers y código, y te devuelvo ✅ + los prompts de la siguiente etapa, o 🔴 + correcciones puntuales.

## 5. Resumen operativo

| Etapa | Tema | Prompts | Paralelos | Dificultad dominante |
|-------|------|---------|-----------|---------------------|
| 0 | Rescate | 3 | 0 | 🟡 |
| 1 | Blindaje | 3 | 0 | 🔴 T1.2 |
| 2 | Integración | 2 + usuario | 0 | 🟡 |
| 3 | Gates | 3 | 0 | 🔴 T3.2 |
| 4 | Resiliencia | 3∥ + 1 | 3 | 🔴 T4.4 |
| 5 | Suites tests | 6 | 6 | 🟢 |
| 6 | Calidad central | 6 | 0 | 🔴×3 |
| 7 | Producto | 3∥ + 1 | 3 | 🟡 |
| 8 | Comercial | 3 | 0 | 🔴 T8.1 |

*Fin de EXECUTION_BATCHES v1.0. Cambios a prompts congelados = versión + entrada en control de cambios del PLAN_EJECUCION.*
