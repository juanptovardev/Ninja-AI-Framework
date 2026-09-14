# GUÍA DE ORQUESTACIÓN PARA IA — Ninja AI Framework

> **Versión:** 1.1.0 · **Fecha:** 2026-09-13 · **Audiencia:** cualquier IA orquestadora
> (opencode/Codex/Claude) que ejecute trabajo en este repositorio, y los obreros que lance.
>
> Esta guía es la **capa operativa de orquestación** del Quality Manual, y la documentación
> del agente orquestador. No contradigas la Directiva, el Quality Manual, `PLAN_EJECUCION.md`
> ni `AGENTS.md`.
>
> Principio rector: **aislamiento físico > disciplina del prompt, y evidencia re-ejecutada > claims.**

---

## 0. Si empiezas una sesión fresca en este repo, haz esto PRIMERO

1. Lee `AGENTS.md` (raíz) — mapa del monorepo, convenciones no negociables, comandos.
2. Lee `docs/architecture/coherencia-estructural.md` — 7 Leyes y decisiones congeladas.
3. Lee `docs/engineering/QUALITY_MANUAL.md` — estándar normativo (gates, capas, testing).
4. Lee `PLAN_EJECUCION.md` §1 — dónde está el proyecto AHORA (fase, etapa, veredictos).
5. Lee `docs/engineering/EXECUTION_BATCHES.md` — prompts congelados de la etapa activa.
6. Lee `docs/engineering/ESTADO_ORQUESTACION.md` (bitácora, §2.2) — contexto de la última
   orquestación sin depender del humano para re-explicar nada.

**Nunca** arranques una tarea consultando solo tu memoria de sesión: la fuente de verdad del
estado es el repo, no tu contexto.

---

## 1. Roles ORCA (Orquestar → Realizar → Cerrar → Auditar)

| Rol | Quién es | Responsabilidad | Prohibido |
|-----|----------|-----------------|-----------|
| **Orquestador** | Sesión principal de IA | Crear entorno aislado, lanzar obreros, mergear, verificar con comandos propios, mantener los archivos del sistema (§2) | Escribir el código de la tarea; calificar su propio merge sin re-ejecutar; tocar prompts congelados |
| **Obrero** | Sesión fresca por prompt (terminal o subagente) | Ejecutar UN prompt congelado en SU rama/worktree; producir código + tests + dossier + REPORTA | Tocar archivos fuera de alcance; elegir su rama; reciclar sesión entre tareas; "arreglar" tests |
| **Rematador** | Sesión fresca, **modelo distinto** al que implementó | Cierre de etapa: re-ejecutar aceptación, micro-fixes mínimos, dossier `cierre-etapa-N.md` con veredicto | Haber participado en la implementación; ampliar alcance |
| **Humano** | Propietario del proyecto | Veredictos go/no-go, lista SOLO-HUMANO (§9), auditoría final de cada etapa | Micro-gestionar obreros |

Regla de oro anti-sesgo: **nadie califica su propio trabajo.** Obrero ≠ rematador ≠ auditor.

---

## 2. Sistema de archivos del orquestador

### 2.1 Archivos del sistema (orquestador)

- `docs/engineering/ESTADO_ORQUESTACION.md` — **bitácora append-only**. Entrada por
  unidad/veredicto. Salvavidas tras compactación: el siguiente orquestador arranca aquí.
- `docs/engineering/CONSISTENCIA_VISUAL.md` — visual registry obligatorio antes de
  tocar `.tsx/.css` de forge-console / office-grid / ui-kit / app-shell.
- `docs/engineering/TRACE_FUNCIONES.md` — catálogo anti-reescritura; regla del 80% de
  reutilización antes de crear código nuevo.
- `tools/verifications/wp-*.md` / `cierre-etapa-N.md` — dossiers. **Sin dossier no hay merge.**
- `docs/adr/` — cada decisión de arquitectura nueva = ADR nuevo.
- `.opencode/agents/` — **nuevo (v1.1):** definiciones de agentes que ejecutan este protocolo
  (orquestador + fases como `sdd-apply` si las hubiera). El orquestador [ahora](#9-orquestador--agente)
  existe como agente nombrado.

**Choque de nombres de dossier:** si el WP ya tiene dossier (ej. `wp-d1-common-utils.md`
existe de una fase previa y la ETAPA 6 también toca common-utils), NO lo sobrescribas
silenciosamente: añade una sección fechada al final (`## ETAPA 6 — <fecha>`) o usa sufijo
`-e6`. Declara la elección en el REPORTA.

### 2.2 Archivos del sistema que DEBES CREAR si no existen (con plantilla incluida)

El orquestador los crea en su primer uso. Obrero y rematador los leen y respetan.

#### 2.2.1 `docs/engineering/CONSISTENCIA_VISUAL.md` — consistencia estética

Todo detalle de desarrollo estético del producto vive aquí. **Protocolo obligatorio:**

1. **Leer PRIMERO** antes de tocar cualquier `.tsx/.css` de `apps/forge-console`,
   `packages/office-grid`, `packages/ui-kit` o `packages/app-shell`.
2. Si el diseño requiere algo no contemplado (token nuevo, componente nuevo): **proponer la
   adición primero** (actualizar el archivo en el mismo commit), implementar después.
3. Ningún merge visual aprueba un cambio que introduzca un patrón no registrado aquí.

**Plantilla mínima inicial** (el obrero la completa con lo que encuentre en el código):

```markdown
# CONSISTENCIA VISUAL — Forge Console y capa visual
> Única fuente de verdad estética. Leer antes de CUALQUIER cambio visual.
> Cambio visual sin entrada aquí = rechazo en auditoría.

## 1. Stack visual
Tailwind v4 (@theme en app/globals.css) · React 19 · GSAP · Prettier (single quotes, w100)

## 2. Tokens — dónde viven y valores vigentes
- Color: <hex primario/secundario/fondo/superficie/éxito/error — completar desde globals.css>
- Tipografía: <familia, escala>
- Espaciado/radios/sombras: <escala vigente>

## 3. Componentes — cuándo usar cuál
| Componente | Ubicación | Cuándo usarlo | Cuándo NO |

## 4. Estados obligatorios
hover / focus / disabled / loading / error / vacío — todo elemento interactivo define los 6.

## 5. PROHIBIDO (anti-patrones del proyecto)
- <completar: p.ej. colores hex sueltos fuera de tokens, sombras duras, !important>

## 6. Registro de cambios estéticos (append-only)
| Fecha | SHA | Qué cambió | Quién lo aprobó |
```

#### 2.2.2 `docs/engineering/TRACE_FUNCIONES.md` — catálogo anti-reescritura

**Regla del 80%:** antes de implementar cualquier feature, mejora o fix, buscar si el repo ya
resuelve ≥80% del problema. Si existe: **reutilizar** (importar/extender/componer), nunca
reescribir. Aplica a obrero Y orquestador (los micro-fixes del cierre también).

**Protocolo obligatorio antes de escribir código nuevo:**

1. **BUSCAR**: en `TRACE_FUNCIONES.md` + grep en `packages/*/src` + exports de `index.ts`.
   Pistas de ubicación: utilidades genéricas → `@ninja/common-utils`; errores → jerarquía
   `@ninja/contracts` (ADR 0001/0009); eventos → `@ninja/events` (nunca EventEmitter);
   HTTP → `globalThis.fetch`; LLM → `@ninja/integrations-llm`; storage → `@ninja/storage`.
2. **REUTILIZAR** si existe. El dossier justifica por qué no se creó código nuevo.
3. **CREAR** solo si no existe: capa correcta + tests + **registrar la entrada en el mismo
   commit**. La auditoría rechaza código duplicado de funcionalidad ya catalogada.

**Plantilla:**

```markdown
# TRACE DE FUNCIONES — catálogo de capacidades existentes
> Consultar ANTES de desarrollar. Reutilizar > reescribir. Registrar en el mismo commit.

| Nombre | Paquete / Ruta | Qué hace (1 línea) | Firma clave | Reutilizado por | Tests |
|--------|----------------|--------------------|-------------|-----------------|-------|
| retryWithBackoff | common-utils | Reintento exponencial con jitter | (fn, opts) => Promise<T> | — | ✅ |
| withTimeout | common-utils | Timeout con CircuitBreaker | ... | — | ✅ |
| <!-- añadir al crear o al descubrir funciones reutilizables --> |
```

#### 2.2.3 `docs/engineering/ESTADO_ORQUESTACION.md` — bitácora append-only

Propósito: que cualquier sesión fresca (o tras compactación) retome el trabajo **sin que el
humano re-explique nada**. Una entrada por unidad de trabajo y por veredicto.

```markdown
# ESTADO DE ORQUESTACIÓN (append-only — nunca editar entradas viejas)
| Fecha | Etapa/Unidad | Estado | SHA | Veredicto/Evidencia | Pendiente |
|-------|--------------|--------|-----|---------------------|-----------|
| 2026-09-10 | ETAPA 6 | AUTORIZADA | 01e7ece | cierre-etapa-5 CERRADA-CON-RESERVAS | T6.1→T6.6 secuencial |
```

---

## 3. Ciclo ORCA por etapa (comandos exactos)

### Paso 0 — Precondiciones (G0, antes de lanzar CUALQUIER cosa)

```bash
cd C:\Users\juanp_8h8f07l\Documents\ninja-ai-framework
git checkout main && git pull origin main
git status --porcelain   # VACÍO o DETENER
git worktree list        # solo el repo principal
pnpm install && pnpm test           # baseline verde conocido (1174 tests al cierre de E-5)
pnpm typecheck && pnpm lint && pnpm errors:check
```

Más **smoke del proveedor** (§5) — 30 segundos. Si falla, NO lanzar N workers: usar vía
alternativa. El smoke es obligatorio, no opcional.

### Paso 1 — Trabajos (T-n.m): un prompt = una sesión fresca = una rama

- La etapa activa y su secuencia están en `EXECUTION_BATCHES.md` (hoy: ETAPA 6, §6 de ese doc,
  SECUENCIAL en una terminal: T6.1→T6.6, merge entre cada uno).
- El orquestador crea el aislamiento; el obrero nunca lo crea (§4).
- Tras cada unidad: **merge verificado** antes de la siguiente.

### Paso 2 — Merge verificado (MERGE KIT)

```bash
git checkout main && git merge --no-ff <rama>
pnpm vitest run packages/<paquete>            # mínimo: el paquete tocado
pnpm typecheck && pnpm lint && pnpm errors:check
```

Si tocó `apps/kage-runtime/src/server.ts`: `pnpm test` COMPLETA + `pnpm test:e2e`
(smoke health :3141). Conflicto o test rojo post-merge → **STOP + escalar**, jamás
"arreglar el test".

### Paso 3 — Cierre ciego (PROMPT C)

Sesión fresca, modelo distinto al que implementó, `ETAPA A CERRAR: <n>`. Salida:
`tools/verifications/cierre-etapa-N.md` con veredicto **CERRADA / CERRADA-CON-RESERVAS /
RECHAZADA** + escalados + SHAs.

### Paso 4 — Auditoría del orquestador (anti-claims)

Re-ejecutar los números clave con comandos propios (nunca aceptar claims):
suite completa, `grep -c "as any"`, conteo de líneas de server.ts, `git show --stat` de cada
merge (archivos fuera de alcance = escalado), thresholds vigentes no rebajados. Luego:
actualizar `PLAN_EJECUCION.md` (changelog), `enterprise-progress.md`,
`ESTADO_ORQUESTACION.md` → push 0|0 → limpiar worktrees/ramas → veredicto al humano
**sin que pregunte**.

---

## 4. Protocolo de lanzamiento de obreros (opencode + worktrees)

1. **Aislamiento creado por el orquestador** (rama corta `feat|fix/wp-<id>-<slug>`):

   ```powershell
   git worktree add "$env:TEMP\opencode\wt-e6-t61" -b feat/wp-d1-common-utils
   ```

   Cada worktree necesita su propio `pnpm install` (~35s, store compartido).

2. **Launcher `.ps1` versionado en disco** (re-ejecutable si algo muere):

   ```powershell
   $log = "$env:TEMP\opencode\worker-t61.log"
   Set-Location "$env:TEMP\opencode\wt-e6-t61"
   opencode run --auto -m kiosapi/glm-5.3-flash "<prompt T6.1 completo>" 2>&1 | Tee-Object -FilePath $log
   Read-Host "Worker terminado"
   ```

   - `--auto` SIEMPRE en headless (los permisos `git commit/push → ask` matan la sesión).
   - **Orden del CLI:** mensaje ANTES de `-f archivo`. Si `-f` va primero, trata el mensaje
     como archivo → `File not found`. Verificar con smoke `ORDER2-OK` si hay duda.
   - `Tee-Object` preserva el log para post-mortem; `Read-Host` mantiene la ventana abierta.

3. **Presupuesto de lectura en el prompt** (anti-parálisis por análisis): máx ~10 lecturas
   exploratorias; prohibida la arqueología de dossiers históricos. En E-5 un slot se perdió
   50 minutos por no acotar esto.

4. **Formato REPORTA obligatorio al final de cada prompt** (el orquestador lo audita):

   ```text
   REPORTA
   - SHA: <sha corto>
   - Aceptación: <comando + output pegado, por cada criterio>
   - Archivos tocados: <lista>
   - Fuera de alcance: NINGUNO | <lista + justificación>
   - Dossier: tools/verifications/<nombre>.md
   - TRACE_FUNCIONES: entradas añadidas/reutilizadas | NINGUNA
   - Riesgos/deuda detectada: <lista | NINGUNO>
   ```

---

## 5. Proveedores de modelo y escalera de fallback

| Prioridad | Proveedor | Modelos (verificados por validador + smoke en E-7) | Nota |
|-----------|-----------|-----------------------------------------------------|------|
| 1 | kiosapi | glm-5.3-flash, qwen3.8-flash, deepseek-v4-flash, kimi-k3, hy3, gpt-oss-20b, agnes-2.5-flash, oc/muse-spark-1.3-contributor | Gate Telegram: sesiones NUEVAS caen en outage; las abiertas sobreviven |
| 2 | nvidia (NIM) | nemotron-3-super-120b-a12b, nemotron-3-ultra-550b-a55b, nemotron-3-nano-30b-a3b | 550b tiene límites por sesión; nano-30b es el más rápido |
| 3 | openrouter (solo `:free`) | nvidia/nemotron-3-super-120b-a12b:free, poolside/laguna-xs-2.1:free | `:free` obligatorio; routers generales (`.../free`, `auto`, `fusion`) prohibidos |
| 4 | opencode (modelo fijo free, no default) | opencode/muse-spark-1.3-contributor-free, opencode/nemotron-3.5-lightning-free, opencode/nemotron-3-ultra-free, opencode/mimo-v2.5-free | Solo variantes `-free` explícitas; EOL de un modelo = siguiente proveedor (no reintento) |
| 5 | Vía interna | Subagentes (Task tool) del propio opencode | Probada: rescató 3/6 slots en E-5 |
| 6 | Humano | — | Lista §9 |

**Prohibido:** modelos de pago, routers genéricos que eligen modelo automático
(`openrouter/auto`, `orcarouter/auto`, y cualquier `:free` genérico sin modelo concreto).

**Smoke previo:** una llamada por MODELO candidato (<30s) antes de lanzar N workers. El validador
escribe `kiosapi-validator.log`; el humo se verifica con el texto de respuesta.


---

## 6. Gates y verificación (qué re-ejecutar SIEMPRE)

- **G1** pre-commit (husky) · **G2** pre-push · **G3** pre-release · **G4** migraciones —
  definidos en QUALITY_MANUAL. Nunca `--no-verify`.
- Suite: `pnpm test` (vitest). Single: `pnpm vitest run <ruta>.test.ts` o `-t "<nombre>"`.
- Typecheck/lint SIEMPRE junto a la suite; `errors:check` al tocar códigos de error.
- Thresholds de cobertura: global 50, críticos 70 (desde T6.2, en `vitest.config.ts`).
  Prohibido rebajarlos para hacer pasar un WP.
- Toda extracción de `server.ts` exige **suite idéntica antes/después**. Si un test cambia,
  el refactor está mal: revertir (`git checkout --`), no maquillar.
- Dead code encontrado en el camino: se LISTA en el dossier, no se borra (scope creep).
- **Flakes de integración (shutdown/lifecycle, timeouts 20s):** antes de culpar al obrero,
  matar huérfanos (`Get-Process node` + `Stop-Process`), re-ejecutar los 3 archivos aislados,
  y solo entonces la suite completa. Dos verdes aislados = contención, no regresión. Los
  procesos node de workers muertos acumulan CPU y falsean los timeouts: limpiarlos es G0.

---

## 7. Condiciones STOP y lista SOLO-HUMANO

**STOP y escalar (no improvisar):**
1. Aceptación fallida 2 veces en la misma tarea.
2. Un test cambia tras un refactor.
3. Archivo fuera de alcance modificado sin declarar en REPORTA.
4. Conflicto de merge o suite roja post-merge.
5. Proveedor caído sin vía alternativa sana.
6. Desviación detectada contra Directiva / Quality Manual / Plan Maestro → detener y
   superficiar (Protocolo de Desarrollo de AGENTS.md).

**SOLO-HUMANO (pedir, jamás ejecutar):**
- Credenciales, secretos, API keys.
- Dinero: planes, compras, presupuesto de tokens.
- Borrado irreversible fuera de worktrees/regenerables.
- Push a remoto nuevo, público, o release público (repo comercial privado).
- Versión mayor de docs congelados (prompts, Directiva, Plan Maestro).
- Merge que archive/cambie decisiones de la Directiva.

---

## 8. Presupuesto de autonomía (para depender menos del humano)

El orquestador puede mergear y avanzar **sin consultar** cuando TODAS se cumplen:

- ✅ Suite completa verde en HEAD post-merge + typecheck + lint + errors:check.
- ✅ `git show --stat` confirma 0 archivos fuera de alcance del prompt.
- ✅ Dossier del WP existe y su evidencia fue re-ejecutada.
- ✅ No toca: prompts congelados, Directiva, Plan Maestro, lista SOLO-HUMANO.

**Escalado en 4 niveles** (agotar en orden): 1) auto-fix mínimo y trazable → 2) retry con
prompt estricto y presupuesto de lectura → 3) vía alternativa (otro proveedor / subagentes
internos) → 4) humano con resumen de qué se intentó.

**Auto-reporte:** al cierre de cada unidad y de cada etapa, el orquestador entrega veredicto
+ SHAs + reservas sin que el humano pregunte. La inversión del flujo de atención es lo que
elimina la dependencia operativa del humano: este decide dirección, no pasos.

---

## 9. Gotchas del entorno (aprendidos con costo real — no redescubrir)

1. `opencode run`: mensaje ANTES de `-f archivo`; `--auto` obligatorio en headless.
2. PowerShell: `$pid` es variable reservada; no existen `head/tail/grep`; `/dev/null` →
   `2>$null`; usar `Select-Object -First`.
3. Git pathspecs `**` con rutas absolutas fallan en este shell — derivar listas desde
   `git ls-files` completo.
4. `.gitignore`: excluir directorio (`docs/`) impide re-incluir con `!` — usar `docs/*`.
5. Números citados en prompts congelados se re-verifican contra HEAD el día del lanzamiento
   (drift real: server.ts pasó de 879 → 1022 líneas entre F2 y el cierre de E-5). La errata
   va en el launcher, nunca en el prompt congelado.
6. Un worktree = un `pnpm install`. Presupuestar el tiempo.
7. Los tests no deben importar capas L3 desde L2 (gate `no-restricted-imports` cubre
   `import type`): usar fakes en memoria + tipos derivados del SUT
   (`ConstructorParameters<typeof SUT>`).
8. Sesiones largas de worker se degradan: si un obrero repite acciones, cortar y renovar
   sesión con el mismo prompt — no negociar con la sesión.
9. **Muerte silenciosa del obrero:** el proceso puede morir sin commit y sin log final.
   Detectar por: log sin escribir >5 min + `git log` de la rama sin commit nuevo en >5 min +
   cero procesos del worktree vivos (`Get-CimInstance Win32_Process` filtrado por ruta).
   Entonces: matar, relanzar mismo prompt con nota de retome (el trabajo parcial sobrevive).
10. **Credencial de git invisible:** si `git push` se queda colgado sin output y hay procesos
    `git-credential-manager` con ventana "Select an account", el PAT está guardado pero falta
    desambiguar usuario. Fix: `git config credential.https://github.com.username <usuario>`
    (no toca secretos). Nunca matar a ciegas un push silencioso sin esta comprobación.
11. **Gates en orden:** `turbo` cachea y puede reportar verde con `dist` viejo. En worktree
    fresco siempre `pnpm build` → `pnpm typecheck` → tests. Si typecheck falla con TS2307
    en `@ninja/*` tras build limpio, el dist no existe: es orden, no código.
12. **Modelo EOL/endpoint retirado:** si el proveedor dice 410/Gone para un modelo antes OK,
    no reintentar con ese modelo: cambiar de proveedor (fallback §5). El EOL es permanente.

---

## 10. Control de cambios de esta guía

| Versión | Fecha | Cambio |
|---------|-------|--------|
| 1.0.0 | 2026-09-10 | Versión inicial especializada en este repo, destilada de la orquestación ETAPA 5 (cierre `tools/verifications/cierre-etapa-5.md`) |
| 1.1.0 | 2026-09-13 | Autonomía: §2.1 documenta el agente orquestador; §5 escalera con pool real verificado en E-7 (kiosapi/nvidia/openrouter `:free`/opencode-free); §9 gotchas 9–12 (muerte silenciosa, credencial invisible, orden build→typecheck, modelo EOL); 2.1 añade CONSISTENCIA + TRACE + ESTADO como archivos del sistema |
| 1.1.1 | 2026-09-13 | Agente `ninja-orquestador` registrado y verificado (AGENT-OK, qwen3.8-flash). Validador: denylist por prefijos eliminada — gate económico (paidRemoved) mantiene Free-only con `denegados=0`. `.opencode/node_modules` ignorado |
