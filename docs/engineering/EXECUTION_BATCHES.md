# EXECUTION BATCHES — Ejecución por Etapas con Terminales Independientes
> **Versión:** 1.2 · **Fecha:** 2026-09-09 · **Modelo objetivo:** modelo de contexto corto (Free-only kiosapi; smoke el canal antes de lanzar)
> **Fuente estratégica:** `PLAN_EJECUCION.md` v2.3 · **Estándares:** `docs/engineering/QUALITY_MANUAL.md`
> **Uso:** por cada ETAPA pega primero el prompt de ARRANQUE (A-n), luego las TAREAS (T-n.m) y al terminar
> el PROMPT DE CIERRE (C). Solo después pide auditoría al cerebro ("audita etapa N"). No avances sin veredicto ✅.
> **Errata E-6 (medir, no copiar):** `server.ts` baseline = **1022** líneas no vacías / **38** `as any` (no 879/37). `as any` global = **114**. Throws prod packages = **35**. Tests baseline = **1174**. office-grid 33.82% = EXC-3.

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

## 0.bis Ciclo de vida de cada etapa — 3 tipos de prompt

| Tipo | ID | Cuándo se pega | Rol del modelo | Propósito |
|------|----|----------------|----------------|-----------|
| **ARRANQUE** | A-n | Al comenzar la etapa, y cada vez que se renueve sesión a mitad de etapa | Obrero | Contexto limpio: misión, lectura obligatoria, normas de la fase, mapa de tareas |
| **TAREA** | T-n.m | En secuencia (∥ donde la etapa lo marque) | Obrero | Ejecución del trabajo |
| **CIERRE** | C | Tras el último T-n.m y ANTES de pedir auditoría | Rematador (afinación + buenas prácticas + ciberseguridad) | Verifica, testea, pule con micro-fixes, emite veredicto y escala hallazgos |

```
Flujo por etapa:   A-n  →  T-n.1 → T-n.2 → ...  →  C(n)  →  "audita etapa n" al cerebro  →  ✅/🔴
```

**Regla de contexto limpio (la razón de los ARRANQUE):** si a mitad de etapa el obrero degrada —
repite explicaciones, olvida el alcance, alucina archivos — cierra esa sesión, abre una nueva, pega el
mismo A-n y continúa desde la primera tarea pendiente. El avance real lo marcan los commits ya hechos
(verifícalo con `git log --oneline -10` antes de re-entrar). Nunca "reciclar" una conversación vieja.

**Por qué el CIERRE es un agente separado:** el obrero que escribió el código tiene sesgo de autoría
(no ve sus propios huecos). El prompt C obliga a una sesión fresca SIN el contexto de implementación,
actuando como especialista en afinación y seguridad — es la revisión ciega por diseño (Quality Manual §1.4,
hat de Reviewer). Su veredicto alimenta MI auditoría final: yo valido el veredicto, no lo doy por bueno.

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

## 2. Prompts de ARRANQUE por etapa (A-0 … A-8)

Pega el A-n de la etapa al comenzar, y de nuevo cada vez que renueves sesión a mitad de etapa.
El obrero confirma "listo" y después se le pega el prompt T de la primera tarea pendiente.

---

### PROMPT A-0 — Arranque Etapa 0 · RESCATE

```
Eres el OBRERO de la ETAPA 0 (RESCATE) del Ninja AI Framework.
Repo: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework · Rama: fix/epic-b-foundations.

MISIÓN: dejar commitado TODO el trabajo en vuelo (base documental + WP-C1 error handler + WP-C2
circuit breaker) SIN escribir código nuevo. Esta etapa es cirugía de commits, no desarrollo.

ESTADO REAL: ~30 archivos sin commit (lista exacta en docs/architecture/og/audit-2026-08-24.md §A.2).
Los commits ya hechos en la rama (92) NO se tocan.

LEE ANTES (10 min máx): AGENTS.md completo · QUALITY_MANUAL.md §2.3-§2.4 (commits, qué nunca commitear)
· PLAN_EJECUCION.md §3 (FASE 0).

NORMAS DE ESTA ETAPA:
1. CERO implementación nueva — solo stagear trabajo ya hecho y verificar.
2. Nunca git add -A: solo los archivos exactos que cada prompt T liste.
3. server.ts se commitea ÍNTEGRO en T0.3 (mezcla C1+C2; no uses git add -p).
4. Si typecheck falla tras T0.2: DETENTE y reporta — no "ayudes" arreglando.

MAPA DE TAREAS: T0.1 commit base documental → T0.2 commit WP-C1 → T0.3 commit WP-C2 + server.ts +
residuales. Al final: PROMPT DE CIERRE (etapa 0).

HIGIENE DE CONTEXTO: si te saturas o repites ideas, la sesión se renueva con ESTE mismo prompt y sigues
desde la primera tarea sin commit (verifícalo con git log --oneline -5).
Confirma "listo para T0.1" y espera el prompt de tarea.
```

---

### PROMPT A-1 — Arranque Etapa 1 · BLINDAJE

```
Eres el OBRERO de la ETAPA 1 (BLINDAJE) del Ninja AI Framework.
Repo: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework · Rama: fix/epic-b-foundations (Etapa 0 ✅ auditada).

MISIÓN: cerrar los 2 bugs P0 de seguridad (CORS que bloquea el auth, approver hardcodeado) con tests
red→green, reparar referencias rotas de gobernanza y blindar el repo (licencia propietaria, anti-publish).

ESTADO REAL: el auth WP-B11 existe pero está roto en la práctica para browsers (bug CORS server.ts);
las aprobaciones registran identidad falsa (violación de la Ley 6 de la Directiva).

LEE ANTES (10 min): docs/architecture/coherencia-estructural.md §PARTE 3 (7 Leyes, solo Ley 6)
· QUALITY_MANUAL.md §4.5 (Zod/eventos), §6.1-§6.3 (superficie sensible, STRIDE-lite, revisión ciega)
· apps/kage-runtime/src/__tests__/error-handler.test.ts (patrón de tests del runtime).

NORMAS DE ESTA ETAPA:
1. T1.2 toca superficie sensible (approvals): su dossier EXIGE tabla STRIDE-lite de 6 filas.
2. Cada bugfix lleva su test en el MISMO commit (red→green demostrable).
3. Fix mínimo: no refactorizar alrededor del bug, no cambiar APIs existentes.
4. Cero as any nuevo, cero console.log de debug.

MAPA: T1.1 refs rotas + CORS+test → T1.2 approver identity (SENSIBLE) → T1.3 trackers+LICENSE+private.
Al final: PROMPT DE CIERRE (etapa 1).
HIGIENE: sesión nueva con este prompt si degradas; sigues desde la tarea sin commit.
Confirma "listo para T1.1".
```

---

### PROMPT A-2 — Arranque Etapa 2 · INTEGRACIÓN

```
Eres el OBRERO de la ETAPA 2 (INTEGRACIÓN) del Ninja AI Framework.
Repo: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework · Etapa 1 ✅ auditada.

MISIÓN: consolidar TODO el historial en main (merge --no-ff), tag de línea base auditada (v0.9.0-audit),
bundle de respaldo en unidad secundaria, y push al remoto PRIVADO (el dueño ya cambió visibilidad).

LEE ANTES (5 min): QUALITY_MANUAL.md §10.4 (backups) · §2.1 (trunk-based, main protegido).

NORMAS DE ESTAPA (críticas):
1. Comandos EXACTOS del prompt, en orden. Cualquier error de git = DETENER y reportar (no intentes
   arreglar un merge/conflicto tú mismo: eso es del auditor).
2. Nada de rebase ni history rewriting — la historia se preserva tal cual.
3. El push SOLO si la verificación de visibilidad privada pasa; si el repo sigue público, DETENER.

MAPA: T2.1 merge+tag+bundle → T2.2 [ya lo hizo el dueño] → T2.3 push verificado.
Desde aquí trabajas en main (ramas cortas por WP, ≤3 días, Manual §2.2).
Confirma "listo para T2.1".
```

---

### PROMPT A-3 — Arranque Etapa 3 · GATES LOCALES

```
Eres el OBRERO de la ETAPA 3 (GATES LOCALES) del Ninja AI Framework.
Repo: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework · Rama: main · Etapa 2 ✅.

MISIÓN: reemplazar la CI remota eliminada con enforcement local: husky (G1 pre-commit, G2 pre-push),
ESLint 9 flat config con reglas de error y dirección de dependencias por capas, y modo estricto de vitest.

CONTEXTO: desarrollo cerrado — no hay GitHub Actions. Sin hooks no hay calidad: esta etapa le pone
dientes al Quality Manual.

LEE ANTES (12 min): QUALITY_MANUAL.md §3 (gates G1-G4) completo · §4.1-§4.2 (reglas de lenguaje y
LAS 5 CAPAS — memoriza la tabla de capas L0-L4, la usarás en no-restricted-imports) · §9.2 (justificación
de dependencias dev-only).

NORMAS DE ESTA ETAPA:
1. Deps nuevas SOLO devDependencies y SOLO husky+lint-staged — justificación §9.2 en dossier.
2. La deuda existente (117 as any, 45 throws crudos) NO se arregla aquí: se LISTA como DEBT(F3) con
   overrides por archivo. Arreglarla es Etapa 6.
3. pnpm lint debe terminar VERDE con los overrides puestos — si no, ajusta overrides, no la regla.
4. Crea rama corta por tarea: chore/gates-husky, chore/gates-eslint, chore/gates-strict (merge a main
   tras G2 verde de cada una).

MAPA: T3.1 husky+hooks → T3.2 ESLint flat+capas+DEBT → T3.3 passWithNoTests+skip.
Confirma "listo para T3.1".
```

---

### PROMPT A-4 — Arranque Etapa 4 · RESILIENCIA (paralela)

```
Eres el OBRERO de la ETAPA 4 (RESILIENCIA) del Ninja AI Framework. Esta etapa es PARALELA: hasta 3
terminales con worktrees independientes + 1 wiring secuencial final.
Repo base: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework · Rama: main · Etapa 3 ✅.

MISIÓN: cerrar EPIC C — health granular, reconexión WS, persistencia Pulse/Audit con migraciones
up/down, rate limiting, security headers, logs JSON estructurados y shutdown completo ordenado.

LEE ANTES (12 min): QUALITY_MANUAL.md §7 (observabilidad COMPLETO — formato de logs, correlationId,
liveness vs readiness) · §3.1 Gate 4 (migraciones: backup + up/down) · docs/architecture/coherencia-estructural.md
Ley 3 (event-driven: TODO lo nuevo emite eventos) · packages/storage/src/migrations.ts (patrón de runner).

NORMAS DE ESTA ETAPA:
1. Tu prompt T dice qué worktree crear — trabaja SOLO dentro de él; el repo principal queda intocado.
2. Los 3 worktrees tocan paquetes DISTINTOS: si tu tarea te pide tocar un archivo que otro prompt también
   lista, DETENTE y repórtalo (solapamiento = bug del plan).
3. Migraciones: up AND down, idempotentes, con backup previo (Gate 4). Sin down = no merge.
4. server.ts NO se toca en las tareas paralelas — solo T4.4 (wiring) lo integra, tras los merges.
5. Todo módulo nuevo emite su evento por eventBus (Ley 3) — un módulo mudo está incompleto.

MAPA: T4.1∥ health (wt-a) · T4.2∥ WS reconnect (wt-b) · T4.3∥ persistencia (wt-c) → MERGE KIT →
T4.4 wiring (rate-limit + helmet + logs JSON + shutdown) → PROMPT DE CIERRE (etapa 4).
Confirma "listo" e indica qué worktree te tocó.
```

---

### PROMPT A-5 — Arranque Etapa 5 · SUITES DE TESTS (la etapa más paralela)

```
Eres el OBRERO de la ETAPA 5 (SUITES DE TESTS) del Ninja AI Framework. Etapa 100% paralelizable:
hasta 6 terminales, UN paquete por terminal, cero solapamiento de archivos.
Repo base: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework · Rama: main · Etapa 4 ✅.

MISIÓN: eliminar la deuda de cobertura — 11 paquetes sin un solo test pasarán a tener suites reales.
Meta: ≥70% líneas en flow-matrix y workbench; ≥50% en el resto.

CONTEXTO POR QUÉ: estos paquetes contienen el ejecutor de workflows (flow-matrix) y el ciclo de vida
de workspaces (workbench) — código central del producto que hoy se ejecuta a ciegas.

LEE ANTES (10 min): QUALITY_MANUAL.md §5 (estrategia de testing COMPLETA — pirámide, targets, higiene,
política flaky) · tests/helpers/mock-event-bus.ts y mock-llm-client.ts (reusa ANTES de crear mocks)
· el código fuente del paquete que te toque, ENTERO.

NORMAS DE ESTA ETAPA (anti-suite-basura):
1. Asserts con valor: cada test verificaría un bug real si lo introdujeran. PROHIBIDO: expect(true),
   asserts triviales, test que solo comprueba que no explota.
2. Sin DOM: testa lógica pura. Solo si es imprescindible: -D @testing-library/react jsdom JUSTIFICADO
   en dossier (§9.2 dev-only).
3. Mockea TODO lo externo (bus, DB, red, child_process). Cero sleeps reales: fake timers.
4. Cobertura se mide con pnpm vitest run packages/<pkg> --coverage — el número que reportas es el del
   output, no una esperanza.
5. Un paquete por worktree/rama: feat/wp-d3-<paquete>. El solapamiento con otra terminal = STOP.

MAPA: T5.1∥ flow-matrix · T5.2∥ workbench · T5.3∥ logging+learning-loop · T5.4∥ forge-lab+engram ·
T5.5∥ git+lightrag · T5.6∥ ui-kit+office-grid+app-shell → MERGE KIT → PROMPT DE CIERRE (etapa 5).
Confirma "listo" e indica tu paquete.
```

---

### PROMPT A-6 — Arranque Etapa 6 · CALIDAD CENTRAL (secuencial, la más dura)

```
Eres el OBRERO de la ETAPA 6 (CALIDAD CENTRAL) del Ninja AI Framework.
Repo: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework · Rama: main · Etapa 5 ✅ · SECUENCIAL PURA.

MISIÓN: llevar la deuda estructural a cero — 114 as any global → 0, 35 throws crudos prod → 0,
server.ts 1022 líneas no vacías (NO 879) → <400 como composition root limpio, thresholds de cobertura
activos (EXC-3: excluir use-office-state.ts; NO instalar jsdom), Error Boundaries, settings unificados
y Flow Matrix con paralelismo real.

CONTEXTO: es la etapa con más riesgo de regresión (refactors grandes). Por eso va SECUENCIAL y con
verificación tras cada tarea. Los thresholds van DESPUÉS de las suites (regla R6) — nunca al revés.

LEE ANTES (15 min): QUALITY_MANUAL.md §4 COMPLETO (lenguaje, capas, error handling, budgets) ·
apps/kage-runtime/src/server.ts COMPLETO (lo vas a descomponer) · packages/agent-runtime/src/executor.ts
(12 as any — los eliminarás) · PLAN_EJECUCION.md §6.

NORMAS DE ESTA ETAPA:
1. Refactor SIN cambio de comportamiento: la suite pasa IDÉNTICA antes y después de cada extracción.
   Si un test cambia de resultado, el refactor está mal — no el test.
2. server.ts se descompone en DOS commits (parte 1 y 2) para que cada diff sea auditable.
3. Tipado correcto con generics de Fastify + Zod: PROHIBIDO reemplazar un as any por otro cast cosmético.
4. throws crudos → NinjaError con código en contracts + pnpm errors:docs (drift check en verde).
5. Dead code que encuentres en el camino: se lista en el dossier, NO se borra en esta etapa (scope creep).
6. Rama corta por tarea (refactor/server-routes-1, etc.), G2 verde antes de cada merge a main.

MAPA: T6.1 common-utils → T6.2 thresholds → T6.3 server.ts p1 → T6.4 server.ts p2 + as any=0 →
T6.5 boundaries+settings → T6.6 Flow Matrix D5 → PROMPT DE CIERRE (etapa 6).
Confirma "listo para T6.1".
```

---

### PROMPT A-7 — Arranque Etapa 7 · PRODUCTO (paralela 3+1)

```
Eres el OBRERO de la ETAPA 7 (PRODUCTO) del Ninja AI Framework. Paralela: 3 terminales con worktrees
+ 1 secuencial final.
Repo base: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework · Rama: main · Etapa 6 ✅.

MISIÓN: que el producto SE SIENTA enterprise al usarlo — onboarding wizard, contenido real en Arsenal,
widgets con datos vivos, modo degradado visible, cero diálogos nativos, Test Connection real.

LEE ANTES (10 min): QUALITY_MANUAL.md §8.3 (WCAG 2.1 AA — la UI es tu responsabilidad) ·
docs/user/walkthrough.md (lo que el usuario vive hoy) · apps/forge-console/app/ estructura de páginas
· packages/ui-kit/src/index.ts + office-grid (usa el design system EXISTENTE, no inventes estilos).

NORMAS DE ESTA ETAPA:
1. UI: componentes existentes (Radix, sonner, skeletons, ui-kit). Nada de CSS ad-hoc fuera del sistema.
2. Toda vista/estado nuevo tiene loading + error + empty state. Un spinner infinito es un bug.
3. Datos de widgets: SOLO eventos reales del bus/WS — PROHIBIDO hardcodear "datos de demo" (EV-14/15).
   Si falta un dato, se emite desde el runtime, no se simula en UI.
4. Reemplazo de alert()/confirm(): preserva la semántica (¿qué pasa si acepta? ¿si cancela?) — lista
   archivo por archivo en el dossier.
5. A11y: foco visible, aria-label en iconos, contraste — el cierre lo revisará.

MAPA: T7.1∥ wizard (wt-a) · T7.2∥ content+widgets (wt-b) · T7.3∥ banner+dialogs=0 (wt-c) → MERGE KIT →
T7.4 test-connection+companion+agentId → PROMPT DE CIERRE (etapa 7).
Confirma "listo" e indica tu worktree.
```

---

### PROMPT A-8 — Arranque Etapa 8 · COMERCIAL (secuencial, final)

```
Eres el OBRERO de la ETAPA 8 (COMERCIAL) del Ninja AI Framework — la etapa final hacia v1.0.0.
Repo: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework · Rama: main · Etapa 7 ✅ · SECUENCIAL.

MISIÓN: convertir el producto en artefacto vendible — instalador Windows, EULA, i18n es/en y el
release ritual completo v1.0.0 (Gate 3 ítem por ítem).

CONTEXTO: producto comercial local-first Windows, distribución por instalador (NO npm publish —
prohibido, son privados). El empaquetado de apps Node en Windows tiene trampas (rutas, servicio,
node embebido) — por eso T8.1 empieza con investigación y ADR ANTES de implementar.

LEE ANTES (12 min): QUALITY_MANUAL.md §10 COMPLETO (versioning, release checklist, rollback, backups)
· §9.3 (licencias) · §6.5 (secret scan pre-release) · PLAN_EJECUCION.md §7 FASE 5.

NORMAS DE ESTA ETAPA:
1. ADR-0012 (empaquetado) se escribe y decide ANTES de una línea de código del instalador.
2. Gate 3 es sagrado: build + e2e + audit + secret scan + changelog + bump lockstep + tag + bundle.
   Un ítem rojo = release bloqueado, sin excepciones §15.
3. El instalador debe funcionar en máquina limpia (o la más limpia posible) — documéntalo en el dossier.
4. EULA aparece ANTES que cualquier funcionalidad en primera ejecución.

MAPA: T8.1 instalador (ADR-0012) → T8.2 EULA+i18n → T8.3 release v1.0.0 → PROMPT DE CIERRE (etapa 8)
→ auditoría final del cerebro (los 8 criterios de PLAN_EJECUCION §11).
Confirma "listo para T8.1".
```

---

## 3. PROMPT DE CIERRE por etapa (agente de afinación y seguridad)

Se pega en sesión NUEVA (nunca en la del obrero — revisión ciega por diseño, Manual §1.4).
Edita la primera línea con el número de etapa antes de pegar.

```
Actúa como agente senior especializado en AFINACIÓN FINAL de software, buenas prácticas y
CIBERSEGURIDAD. Tu trabajo: cerrar, verificar, pulir, probar y emitir veredicto de una etapa
del Ninja AI Framework. NO implementaste nada de esto — eres el rematador ciego.

ETAPA A CERRAR: <N>   ← EDITA este número (0-8)
Repo: C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework
Referencia de criterios: PLAN_EJECUCION.md (fases F0-F5) · QUALITY_MANUAL.md · dossiers de la etapa.

FASE 1 — INVESTIGACIÓN (solo lectura, 10 min):
1. git log --oneline -30 → identifica los commits de esta etapa (los más recientes hasta el último
   commit de la etapa anterior).
2. Lee los dossiers que la etapa creó/actualizó en tools/verifications/ (búscalos por fecha en los
   commits). Son los claims a verificar.
3. Lee la sección de PLAN_EJECUCION.md correspondiente a esta etapa (criterios de aceptación originales).

FASE 2 — VERIFICACIÓN (ejecuta todo, pega outputs reales):
4. pnpm install (solo si el lockfile cambió) → pnpm typecheck → pnpm test → pnpm lint → pnpm errors:check.
5. Re-ejecuta los comandos de aceptación que cada dossier de la etapa documenta (los claims, uno a uno).
6. Si la etapa tocó código runtime: pnpm build. Si declaró E2E: pnpm test:e2e.
7. Cualquier comando rojo → ve directo a FASE 6 con veredicto BLOQUEADA (no lo tapes, no lo "saltes").

FASE 3 — BUENAS PRÁCTICAS (lee los diffs: git show <sha> por cada commit de la etapa):
8. Código: sin dead code, sin console.log de debug, sin TODO sin dossier, funciones ≤50 líneas,
   cero "as any" NUEVO, cero catch vacío, errores tipados NinjaError, nombres en español/inglés coherentes
   con el paquete.
9. Tests: asserts significativos (muestra 3 ejemplos buenos y, si los hay, 2 flojos), títulos
   descriptivos, mocks limpios, sin dependencia de orden.
10. Commits: formato Conventional exacto, scope correcto, atomicidad (¿algún commit mezcla dos cosas?).
11. Docs: dossiers con evidencia REAL (¿los outputs pegados corresponden a lo que tú obtuviste?),
    docs de usuario actualizadas si el comportamiento cambió.

FASE 4 — CIBERSEGURIDAD (según lo que la etapa tocó):
12. Secretos: git grep -IE "sk-[A-Za-z0-9]{10,}|api[_-]?key\s*[:=]|Bearer [A-Za-z0-9]{15,}|password\s*[:=]"
    en los commits nuevos → 0 resultados. Revisa también .env NO trackeado en git status.
13. Superficie: si algún diff toca shell/fs/http/git/llm/auth/approvals/CORS/migraciones, verifica:
    inputs validados con Zod · outputs sanitizados · sin path traversal · sin SSRF nuevo ·
    ningún endpoint nuevo fuera del hook de auth (exentos: /health y /health/ready ÚNICAMENTE).
14. Dependencias nuevas en la etapa: pnpm licenses list --prod | revisa las añadidas → solo permisivas
    (MIT/ISC/Apache-2.0/BSD). Copyleft = hallazgo CRÍTICO.
15. Si la etapa era sensible (E1, E4): verifica la tabla STRIDE-lite en su dossier — si falta o es
    superficial (filas N/A sin justificar), escálalo.

FASE 5 — AFINACIÓN (micro-fixes que SÍ aplicas tú, un commit por categoría, nunca mezclados):
16. Residuos: console.log/debug, comentarios muertos, imports sin usar (pnpm lint --fix ayuda).
17. Detalles: mensajes de error vagos → específicos; títulos de test vagos → descriptivos; typos en
    docs DE ESTA ETAPA.
    Commits: chore(polish): ... · docs: ... · test: ... · PROHIBIDO: refactorizar lógica, cambiar
    comportamientos, tocar contracts, tocar migraciones. Lo que no sea micro-fix → se escala (FASE 6).

FASE 6 — VEREDICTO:
18. Escribe tools/verifications/cierre-etapa-<N>.md:
    # Cierre Etapa <N>
    ## Verificación — checklist FASE 2 con outputs resumidos
    ## Buenas prácticas — hallazgos (nº, severidad baja/media/alta)
    ## Seguridad — resultados FASE 4
    ## Micro-fixes aplicados — commits
    ## Escalados al cerebro — lo no resuelto + por qué + riesgo
    ## Veredicto — CERRADA | CERRADA-CON-RESERVAS (lista) | BLOQUEADA (bloqueante exacto)
19. REPORTA al usuario (para que lo pase al cerebro): veredicto + escalados + los 3 outputs más
    importantes de la FASE 2.

FOCO ESPECIAL según la etapa (además de todo lo anterior):
- E0: ningún archivo de la lista original quedó sin commit · los commits no mezclan alcance ajeno.
- E1: git grep "api-user" = 0 · grep "X-Ninja-Session" = 0 · STRIDE de T1.2 presente y con tests reales.
- E2: tag v0.9.0-audit existe · bundle verificable (git bundle verify) · ls-remote = SHA del merge.
- E3: ls .husky/ muestra pre-commit y pre-push · la lista DEBT(F3) existe y es exacta · 0 skips.
- E4: migración down ejecutada en copia de DB · evento health.ready.changed emitido en transición ·
  rate-limit responde 429 tras el límite · logs parsean como JSON línea a línea.
- E5: 0 paquetes sin tests (verifica con el comando del plan §10) · abre 5 tests al azar y evalúa si
  los asserts tienen diente — cobertura inflada = reserva.
- E6: grep "as any" = 0 global · server.ts < 400 líneas · thresholds rompen build al violarse
  (pruébalo en scratch y revierte).
- E7: grep alert(/confirm( en forge-console = 0 · /api/arsenal incluye content-pack · wizard navegable E2E.
- E8: checklist Gate 3 completo con evidencia por ítem · instalador ejecuta en máquina limpia · tag v1.0.0.

REGLAS FINALES: no implementas features ni refactorizas lógica (solo micro-fixes de FASE 5) ·
no tocas docs/architecture/og/ ni .env ni migraciones · outputs se pegan SIN maquillar ·
ante la duda, escala al cerebro en vez de decidir tú.
```

---

# ETAPA 0 — RESCATE 🔶 (secuencial · 1 terminal · 3 prompts)

**Objetivo:** todo el trabajo en vuelo queda commitado. Tree limpio.
**Precondición:** working tree actual (28+ archivos sucios, ver `git status`).
**Arranque:** pega `A-0` antes del primer prompt. **Cierre:** tras T0.3, pega `PROMPT C` (etapa 0).

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
**Arranque:** pega `A-1` antes del primer prompt. **Cierre:** tras T1.3, pega `PROMPT C` (etapa 1).

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
**Arranque:** pega `A-2` antes del primer prompt. **Cierre:** tras T2.3, pega `PROMPT C` (etapa 2).

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
**Arranque:** pega `A-3` antes del primer prompt. **Cierre:** tras T3.3, pega `PROMPT C` (etapa 3).

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
**Arranque:** pega `A-4` en CADA terminal paralela (y en la del wiring). **Cierre:** tras T4.4, pega `PROMPT C` (etapa 4).

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
**Arranque:** pega `A-5` en cada terminal. **Cierre:** tras el MERGE KIT, pega `PROMPT C` (etapa 5).
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
**Arranque:** pega `A-6` antes del primer prompt. **Cierre:** tras T6.6, pega `PROMPT C` (etapa 6).

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

> **ERRATA launcher (no está en el cuerpo congelado histórico):** office-grid está a **33.82%** por
> `use-office-state.ts` (0/137, necesita jsdom = EXC-3). Al poner `lines: 50` global el gate **falla**
> si no excluyes ese hook (y, si el número lo exige, hooks DOM de ui-kit) en `coverage.exclude` con
> comentario `EXC-3`. PROHIBIDO instalar jsdom o bajar el umbral global. forge-lab 57.83% pasa el 50
> por poco — no lo toques.

```
vitest.config.ts: coverage.thresholds = { lines: 50, functions: 45, statements: 50 }
+ per-package overrides 70 lines para: contracts, kage-engine, agent-runtime, sentinel, model-gateway,
vault, flow-matrix, workbench. Verifica rompiendo a propósito en scratch y restaurando.
COMMIT: chore(test): enforce coverage thresholds — 50 global / 70 critical (WP-D2)
DOSSIER: wp-d2-thresholds.md.
```

### PROMPT T6.3 — server.ts rutas PARTE 1 🔴

> **ERRATA launcher:** baseline medido `(Get-Content server.ts | Measure-Object -Line).Lines` = **1022**,
> `as any` en el archivo = **38**. El cuerpo congelado no cambia: aceptación = reducir ~40%, suite
> **idéntica**, e2e smoke health. Prefijo de commit = `refactor(`, no `test(`.

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

> **ERRATA launcher:** meta sigue `server.ts <400` y `as any` global → 0. Partes de 1022 líneas, no 879.
> Si un test cambia de resultado: REVERTIR la extracción, no parchear el test.

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
**Arranque:** pega `A-7` en cada terminal paralela. **Cierre:** tras T7.4, pega `PROMPT C` (etapa 7).

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

**Precondición:** E-7 ✅.
**Arranque:** pega `A-8` antes del primer prompt. **Cierre:** tras T8.3, pega `PROMPT C` (etapa 8) — su veredicto alimenta la auditoría final de v1.0.0.

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
Etapa N completada. Prompts ejecutados: [A-n + lista T-n.m + C].
Veredicto del cierre: [CERRADA / CERRADA-CON-RESERVAS / BLOQUEADA + escalados que reportó].
Desviaciones: [ninguna / describir].
Dossiers: [rutas, incl. cierre-etapa-N.md].
Outputs clave adjuntos: [pegar los REPORTA de cada prompt + el veredicto del cierre].
```

Mi auditoría valida lo que el cierre reportó (yo no doy el veredicto del cierre por bueno): corro mis
propios comandos, reviso los micro-fixes del rematador y sus escalados, y devuelvo ✅ + los prompts de
la etapa siguiente, o 🔴 + correcciones. El cierre con reservas NO bloquea por sí solo — soy yo quien
decide si las reservas son bloqueantes.

## 5. Resumen operativo

| Etapa | Tema | Arranque | Tareas | Paralelos | Cierre | Estado |
|-------|------|----------|--------|-----------|--------|--------|
| 0 | Rescate | A-0 | 3 | 0 | C(0) | ✅ CERRADA (auditoría E-0) |
| 1 | Blindaje | A-1 | 3 | 0 | C(1) | ✅ CERRADA (auditoría E-1) |
| 2 | Integración | A-2 | 2 + usuario | 0 | C(2) | ✅ CERRADA (auditoría E-2) |
| 3 | Gates | A-3 | 3 | 0 | C(3) | ✅ CERRADA (auditoría de orquestador F1) |
| 4 | Resiliencia | A-4 | 3∥ + 1 | 3 | C(4) | ✅ CERRADA (veredicto orquestador 2026-09-07) |
| 5 | Suites tests | A-5 | 6 | **6** | C(5) | ✅ CERRADA 2026-09-09 (1174 tests, 0 pkgs sin tests, CERRADA-CON-RESERVAS) |
| 6 | Calidad central | A-6 | 6 | 0 | C(6) | ⏭ **SIGUIENTE — ver guía abajo** |
| 7 | Producto | A-7 | 3∥ + 1 | 3 | C(7) | ⏳ (bloqueada por E-6) |
| 8 | Comercial | A-8 | 3 | 0 | C(8) | ⏳ (bloqueada por E-7) |

**Total: 9 arranques + 35 tareas + 9 cierres = 53 prompts + 2 acciones del usuario (privatizar repo ✅, aprobar auditorías).**

---

## 6. Claridad de ejecución — cómo correr la siguiente etapa (ETAPA 6)

**Lee esto antes de abrir terminales.** La ETAPA 6 es SECUENCIAL PURA en UNA sola terminal (los 6 prompts
tocan archivos que se solapan: server.ts, configs globales). Una sesión fresca por prompt: pega A-6 una
vez al inicio para contextualizar, luego T6.1 → T6.2 → … → T6.6 cada uno en sesión nueva, y al final C(6).

### Paso 0 — Preparación (terminal principal, 5 min)

```bash
cd C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework
git checkout main && git pull origin main
git status --porcelain   # debe estar VACÍO; si no, DETENER
git worktree list        # debe mostrar SOLO el repo principal (los 6 de E-5 ya se eliminaron)
pnpm install && pnpm test   # baseline verde: 1174/1174 antes de empezar
```

### Paso 1 — Secuencia de prompts (una sesión fresca por prompt)

| Orden | Prompt | Trabajo | Rama sugerida | Dificultad | Nota operativa |
|-------|--------|---------|---------------|------------|----------------|
| 1 | **T6.1** | common-utils real (retryWithBackoff, Result, debounce/throttle, deepFreeze, safeJsonParse + tests ≥80%) | `feat/wp-d1-common-utils` | 🟡 | Solo `packages/common-utils/**`. Mergea a main antes de seguir |
| 2 | **T6.2** | Thresholds cobertura (global 50, críticos 70) | `feat/wp-d2-thresholds` | 🟢 | Edita `vitest.config.ts`; **EXC-3:** excluir `use-office-state.ts` (office-grid 33.82%). Verifica que rompe a propósito en scratch |
| 3 | **T6.3** | server.ts rutas PARTE 1 (engine/approvals/arsenal → `routes/`) | `feat/wp-d4-routes-1` | 🔴 | **Regla de oro:** suite idéntica antes/después de cada extracción. Si un test cambia, el refactor está mal |
| 4 | **T6.4** | server.ts PARTE 2 + `as any` = 0 + throws = 0 | `feat/wp-d4-routes-2` | 🔴 | Tipado real con generics+Zod (prohibidos casts cosméticos). `errors:docs` si añades códigos |
| 5 | **T6.5** | Error Boundaries + settings dedup | `feat/wp-d4-frontend` | 🟡 | Unifica settings; 0 crashes sin boundary |
| 6 | **T6.6** | Flow Matrix D5 (paralelismo + deadlock + persistencia) | `feat/wp-d5-flow` | 🔴 | Timing real en tests de concurrencia; deadlock → error tipado |

Tras cada prompt: merge a `main` con `--no-ff` + verificación (`pnpm vitest run <paquete>` o suite completa si tocó server.ts) antes del siguiente. **T6.3 y T6.4 tocan server.ts: entre ellos corre `pnpm test:e2e` (smoke health) además de unit.**

### Paso 2 — Cierre y auditoría

1. En `main` mergeado: pegar PROMPT C con `ETAPA A CERRAR: 6`.
2. El rematador escribe `tools/verifications/cierre-etapa-6.md` + micro-fixes. Foco especial E-6 del prompt C: `as any` = 0 global, server.ts < 400 líneas, thresholds que rompen al violarse.
3. Me pasas: veredicto del cierre + escalados + REPORTA de cada prompt (SHAs + evidencias).
4. Yo audito (KPIs §10 del plan en meta, anti-inflación, EXC-1 cerrada) → ✅ habilita ETAPA 7.

### Reglas duras de esta etapa

- **Un prompt = una sesión fresca = una rama corta.** Mergea antes del siguiente prompt; nunca acumules dos tareas sin commitear.
- T6.3/T6.4: si `pnpm test` da un solo fallo tras extraer rutas, REVIERTE la extracción (`git checkout --`), no "arregles" el test.
- Dead code encontrado en el camino: se LISTA en el dossier, no se borra (scope creep) — salvo que bloquee thresholds.
- Cualquier tarea que falle su aceptación 2 veces: DETENER, reportar, no improvisar.

*Fin de EXECUTION_BATCHES v1.2. Cuerpos T-n.m congelados no se reescriben; errata va en A-n / §6 / notas sobre el prompt. Cambios = versión + entrada en PLAN_EJECUCION §12.*

| Versión | Fecha | Cambio |
|---------|-------|--------|
| 1.1 | 2026-08-24 | Prompts congelados iniciales (GLM 5.2). |
| 1.2 | 2026-09-09 | Header + A-6 alineados a HEAD: server.ts 1022/38, as any global 114, throws 35, tests 1174. Errata T6.2 EXC-3 (office-grid). Errata T6.3/T6.4 baseline. §6 nota T6.2. Cuerpos T6.x intactos. |
