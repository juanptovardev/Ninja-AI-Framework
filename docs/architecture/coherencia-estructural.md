# 🛡️ DIRECTIVA DE COHERENCIA Y CALIDAD ESTRUCTURAL — Ninja AI Framework
**Versión:** 1.1
**Fecha:** Refactorización post-análisis de repos de contexto
**Propósito:** Documento blindaje contra pérdida de contexto, alucinaciones y desviaciones. Lectura obligatoria antes de implementar cualquier módulo.

---

## PREÁMBULO: POR QUÉ EXISTE ESTE DOCUMENTO

Este proyecto se construye por fases delegadas a múltiples agentes de IA usando la metodología de **3 Mineros (OpenCode) + 1 Orquestador (Antigravity)**. Cada agente opera con contexto limitado. Sin esta directiva, los agentes tienden a:

1. Inventar arquitectura no aprobada en el Plan Maestro
2. Copiar código de fuentes externas en vez de crear versiones nativas
3. Cambiar nombres de módulos sin autorización
4. Ignorar integraciones con packages hermanos
5. Usar placeholders perpetuos que jamás se resuelven
6. Olvidar el sistema de eventos
7. Duplicar lógica de compresión en módulos incorrectos

Este documento elimina esas fallas de raíz.

---

# PARTE 1: IDENTIDAD INQUEBRANTABLE DEL PROYECTO

## 1.1 Definición Rectora

> *"Ninja es una plataforma local-first de ingeniería asistida por IA, con runtime único, dashboard observable, oficina digital, aprendizaje controlado, seguridad supervisada y crecimiento modular estricto."*

## 1.2 Nombres Nativos Oficiales — NO NEGOCIABLES

Ningún agente puede renombrarlos, abreviarlos ni sustituirlos.

| Nombre Nativo | Tipo | Origen |
|---------------|------|--------|
| Kage Engine | Motor de orquestación | gentle-ai rediseñado |
| Kage Runtime | Servidor HTTP compartido | Plan Maestro §9 |
| Dojo CLI | Terminal client | gentle-ai menú |
| Forge Console | Dashboard web localhost | Build This Now + Paperclip |
| Office Grid | Oficina pseudo-isométrica | Miniverse |
| Arsenal Registry | Registro de skills/tools dual | Plan Maestro |
| Flow Matrix | Motor de workflows | Plan Maestro |
| Workbench | Sistema de workspaces | Paperclip patterns |
| Trace Ledger | Artifacts, trazas, registros tipo commit | Paperclip + Plan Maestro |
| Sentinel | Seguridad, approvals, auditoría | Guardian Angel → Sentinel |
| Model Gateway | Selección inteligente de modelos | Plan Maestro |
| Pulse Center | Salud, findings, monitoreo | Plan Maestro |
| Learning Loop | Aprendizaje controlado | Plan Maestro |
| Forge Lab | Investigación y apropiación | Plan Maestro |
| Vault | Coordinador de 4 capas de memoria | Plan Maestro + análisis repos |

## 1.3 Agentes Oficiales — Lista Cerrada

| # | Nombre | Departamento |
|---|--------|-------------|
| 1 | Planner | Planning |
| 2 | Planificator | Planning |
| 3 | Librarian | Library & Knowledge |
| 4 | DB Architect | Data |
| 5 | Backend | Backend |
| 6 | Connector | Integration |
| 7 | Designer | Design |
| 8 | Tester | Test |
| 9 | Quality Gate | Quality |
| 10 | Security | Security |
| 11 | Build Fixer | Recovery / Fix |

**Agentes eliminados — NO recrear:**
- ~~Template Curator~~ → fusionado en Librarian
- ~~Memory Keeper~~ → memoria es capacidad raíz
- ~~Guardian Angel~~ → renombrado a Sentinel

---

# PARTE 2: REGLAS DE CONSTRUCCIÓN NATIVA

## 2.1 Principio Rector: TODO es Nativo

| ✅ Correcto | ❌ Incorrecto |
|-------------|---------------|
| Estudiar gentle-ai y reimplementar con @ninja/contracts | Copiar código de gentle-ai |
| LLMClient con fetch nativo, OpenAI-compatible | Instalar openai SDK npm |
| EventBus tipado con NinjaEvent<T> | Usar EventEmitter sin tipado |
| Compresión diferencial en integrations-engram/compressor.ts | Duplicar compresión en Vault |
| Chunking semántico en integrations-lightrag/chunker.ts | Duplicar chunking en Vault o Model Gateway |
| Scoring heurístico en vault/src/scoring/ | Instalar librerías de embeddings propias |
| LightRAG via proceso Python + HTTP adapter | Reescribir LightRAG en TypeScript |

## 2.2 Matriz de Integración de Fuentes

| Fuente | Estrategia | Regla |
|--------|-----------|-------|
| gentle-ai | Rediseño profundo | NO copiar código. SÍ copiar patrón de providers y cliente LLM. |
| Build This Now | Inspiración funcional | Solo referencia de UX/flujo |
| Paperclip | Adopción de patrones | Implementar nativamente en Trace Ledger y Workbench |
| Miniverse | Referencia visual | Solo guía de diseño para Office Grid |
| Gentleman-Skills | Integración nativa directa | Se integra como contenido de Arsenal Registry |
| Guardian Angel | Inspiración para Sentinel | Se reimplementa como @ninja/sentinel |
| Engram | Se usa sin modificar | Adapter en integrations-engram. Compresión en compressor.ts |
| LightRAG | Proceso Python + HTTP adapter | NO reescribir. Adapter en integrations-lightrag. Chunking en chunker.ts |
| free-coding-models | Datasource | Datos para Model Gateway y Pulse Center |
| 8 repos de contexto | Patrones normalizados | Ya integrados en Plan Maestro. NO integrar directamente. |

## 2.3 Regla de Propiedad de la Lógica — CRÍTICA

La lógica de compresión y chunking NO vive en Vault. Vault coordina. La lógica vive en:

```
Compresión diferencial → integrations-engram/src/compressor.ts
Chunking semántico     → integrations-lightrag/src/chunker.ts
Scoring heurístico     → vault/src/scoring/relevance-scorer.ts
Token budget           → vault/src/scoring/budget-manager.ts
Embeddings             → NO existen en Ninja. LightRAG los gestiona internamente.
```

---

# PARTE 3: LAS 7 LEYES TÉCNICAS INQUEBRANTABLES

**Ley 1 — Local-first**
No depende de infraestructura remota para el flujo principal.

**Ley 2 — Runtime único**
CLI y dashboard consumen la misma lógica vía Kage Runtime. NUNCA lógica duplicada.

**Ley 3 — Event-driven**
Todo lo relevante se emite vía `@ninja/events` (EventBus).
Un módulo que no emite eventos es un módulo incompleto.
El sistema de contexto/compresión emite:
- `context.compressed`
- `context.budget.exceeded`
- `context.anchor.promoted`

**Ley 4 — Workspace-centric**
Todo vive dentro de un workspace/proyecto.

**Ley 5 — Provider-agnostic**
El sistema no depende de un solo modelo de IA.
integrations-llm soporta cualquier endpoint OpenAI-compatible.

**Ley 6 — Human-in-the-loop**
Acciones sensibles requieren doble confirmación (técnica + amigable).

**Ley 7 — Trazabilidad total**
Cada agente deja registro tipo commit en Trace Ledger.
Los artifacts con `isAnchor: true` son Memory Anchors y NUNCA se comprimen.

---

# PARTE 4: STACK TÉCNICO

## 4.1 Stack aprobado

| Categoría | Tecnología | Regla |
|-----------|-----------|-------|
| Lenguaje | TypeScript strict | Sin `any` |
| Monorepo | pnpm + Turborepo | workspace:* para internos |
| Bundler | tsup 8.x | CJS + ESM + DTS |
| HTTP Server | Fastify | Solo en kage-runtime |
| DB | SQLite better-sqlite3 | Solo en @ninja/storage |
| Validación | Zod | En contracts y events |
| Testing | Vitest + Playwright | |
| Frontend | React + Next.js + Tailwind | Solo en forge-console |
| Animación | GSAP | Selectivo |
| Fetch | globalThis.fetch | Node.js 18+ nativo |
| Memoria | Engram | Via integrations-engram |
| Indexado | LightRAG | Via HTTP → proceso Python localhost |

## 4.2 Dependencias prohibidas

| ❌ NO usar | ✅ Alternativa correcta |
|-----------|------------------------|
| axios, node-fetch | globalThis.fetch nativo |
| openai SDK oficial | integrations-llm nativo (patrón gentle-ai) |
| express | Fastify |
| lodash | @ninja/common-utils |
| winston | @ninja/logging |
| Cualquier ORM pesado | better-sqlite3 + repositorios manuales |
| Librerías de embeddings | LightRAG los gestiona internamente |
| Librerías de compresión de texto | Lógica heurística nativa en los adapters |

## 4.3 Convenciones de Código

- Nombres de paquetes: `@ninja/{nombre-kebab}`
- Imports internos: siempre `workspace:*` en package.json
- Exports: siempre vía `src/index.ts` con re-exports limpios
- Tipos compartidos: en `@ninja/contracts`, nunca duplicados
- Eventos: via `EventBus.emit()` con `NinjaEvent<T>`
- Logs: via `Logger` de `@ninja/logging`
- Config: via `@ninja/config`
- Fetch: via `globalThis.fetch`

---

# PARTE 5: PROTOCOLO DE LA METODOLOGÍA DE ORQUESTACIÓN

## 5.1 Roles

**Orquestador (Antigravity):**
- Lee el Plan Maestro y esta Directiva antes de cada sesión
- Genera PARTE A (planificación arquitectónica) por módulo
- Genera PARTE B (ejecución) por módulo
- Acopla el trabajo de los 3 mineros en el punto de composición
- Valida el build global después del acoplamiento
- Detecta desviaciones y las resuelve antes de continuar
- NUNCA implementa código directamente en esta etapa

**Mineros (OpenCode x3 en paralelo):**
- Reciben prompts PARTE A + PARTE B del orquestador
- Implementan exactamente lo especificado
- NO toman decisiones de arquitectura
- NO instalan dependencias no aprobadas
- Entregan FEEDBACK REPORT al terminar

## 5.2 Checklist obligatorio para Mineros — antes de escribir código

- [ ] ¿El módulo está en el Plan Maestro?
- [ ] ¿Los nombres coinciden exactamente con la tabla §1.2?
- [ ] ¿Solo uso dependencias @ninja/* aprobadas + stack §4.1?
- [ ] ¿Mi código emite eventos via @ninja/events?
- [ ] ¿Mis tipos usan o extienden @ninja/contracts?
- [ ] ¿Estoy creando código nativo, no copiando de fuentes externas?
- [ ] ¿Mi módulo tiene fallback si un servicio externo falla?
- [ ] ¿Estoy poniendo lógica de compresión donde corresponde (adapters, no Vault)?

## 5.3 Señales de desviación — Detener y reportar

| Señal | Acción |
|-------|--------|
| Tipo necesario no existe en @ninja/contracts | Reportar — no inventar |
| Dependencia npm no listada en §4.1 | Reportar y justificar antes de instalar |
| Nombre no coincide con tabla §1.2 | NO renombrar. Usar nombre oficial |
| Conectar módulos de fases futuras | Reportar. No conectar prematuramente |
| Lógica real no existe y se quiere poner TODO | Implementar con fallback local, no TODO |
| Se quiere instalar librería de embeddings | Detener. No se usan embeddings propios. |
| Se quiere poner compresión en Vault | Detener. La compresión va en los adapters. |

---

# PARTE 6: REGLAS ESPECÍFICAS POR TIPO DE MÓDULO

## 6.1 Foundation Packages
`contracts, config, logging, events, storage, vault, common-utils`
- Base de todo. NO dependen de otros @ninja/*
- No añadir lógica de negocio. Solo contratos, utilidades y primitivas.
- Vault es foundation pero tiene lógica de coordinación (no de compresión).

## 6.2 Packages de Dominio
`agent-runtime, kage-engine, flow-matrix, arsenal-registry, workbench, trace-ledger`
- Dependen de foundation packages
- DEBEN emitir eventos tipados
- DEBEN tener fallbacks locales si un servicio externo falla
- DEBEN integrarse con Trace Ledger para trazabilidad

## 6.3 Packages de Integración
`integrations-llm, integrations-engram, integrations-lightrag, integrations-*`
- Son adapters puros. NO contienen lógica de negocio
- Exponen interfaz nativa (@ninja/* types)
- **integrations-llm:** fetch nativo, OpenAI-compatible, SSE, fallback chain
- **integrations-engram:** adapter + `compressor.ts` (lógica WARM de compresión diferencial)
- **integrations-lightrag:** HTTP adapter → Python process + `chunker.ts` (lógica COLD de chunking semántico)

## 6.4 Apps
`kage-runtime, dojo-cli, forge-console`
- Consumen packages. NO implementan lógica que debería vivir en un package
- kage-runtime es el punto de composición (dependency injection)
- dojo-cli y forge-console son clientes del runtime

---

# PARTE 7: VALIDACIÓN OBLIGATORIA POST-IMPLEMENTACIÓN

## 7.1 Comandos obligatorios

```bash
pnpm install
pnpm build       # TODOS los packages deben compilar
pnpm typecheck   # 0 errores de tipos
pnpm test        # Pipeline de tests (debe pasar)
```

## 7.2 FEEDBACK REPORT obligatorio (guardar en logs/)

```
# FEEDBACK REPORT (guardar como logs/fase-[X.Y]-[nombre-modulo].md)
1. Estado del Build (exit code + número de packages)
2. Estado del Typecheck
3. Archivos creados y sus rutas
4. Archivos modificados
5. Decisiones técnicas tomadas
6. Validación contra Plan Maestro y esta Directiva
7. Errores detectados y cómo se resolvieron
8. Puntos que requieren intervención humana
```

---

# PARTE 8: REFERENCIA RÁPIDA DE DECISIONES CONGELADAS

| Decisión | Estado | Fuente |
|----------|--------|--------|
| Motor basado en gentle-ai (rediseñado) | ✅ CONGELADO | Historial P1 F3 |
| Sistema de providers LLM basado en gentle-ai | ✅ CONGELADO | Respuestas §2.1 |
| PRD no es un modo, es capacidad integrada | ✅ CONGELADO | Historial P1 F4 §8.2 |
| Office siempre integrada | ✅ CONGELADO | Historial P1 F4 §8.3 |
| Memoria como capacidad raíz, no agente | ✅ CONGELADO | Historial P1 F4 §9.3 |
| Doble confirmación para acciones sensibles | ✅ CONGELADO | Historial P1 F4 §13 |
| Oficina pseudo-isométrica por departamentos | ✅ CONGELADO | Historial P1 F4 §12 |
| Repos externos pasan por Forge Lab | ✅ CONGELADO | Historial P1 F4 §2 |
| Engram se usa sin modificar | ✅ CONGELADO | Historial P1 F5 §1.4 |
| LightRAG vía proceso Python + HTTP adapter | ✅ CONGELADO | Respuestas §3.3 |
| Gentleman-Skills se integra como nativo | ✅ CONGELADO | Historial P1 F5 §1.5 |
| Tema oscuro premium | ✅ CONGELADO | Historial P1 F5 §3.1 |
| Sentinel como componente obligatorio | ✅ CONGELADO | Historial P1 F4 §10.2 |
| Registro tipo commit por agente | ✅ CONGELADO | Historial P1 F4 §10.4 |
| Vault = coordinador de 4 capas (HOT/WARM/COLD/FROZEN) | ✅ CONGELADO | Análisis repos de contexto |
| Memory Anchors = artifacts con isAnchor: true | ✅ CONGELADO | Análisis repos de contexto |
| Compresión vive en adapters, NO en Vault | ✅ CONGELADO | Análisis de conflictos |
| Namespacing por agente en Vault | ✅ CONGELADO | claude-teams-brain |
| context_efficiency_score en Pulse Center | ✅ CONGELADO | ai-context-optimizer |
| 4 widgets rail derecho (TokenMeter, AgentStatus, SessionTimer, ContextDepth) | ✅ CONGELADO | Code-HUD |
| Token budget pre-LLM coordinado por Vault + Model Gateway | ✅ CONGELADO | llm-context-optimizer |
| integrations-llm adelantado a Fase 3.0 (prerrequisito bloqueante) | ✅ CONGELADO | Plan de orquestación |
| MCP Protocol pospuesto a Fase 9 | ✅ CONGELADO | Análisis de prioridades |
| Embeddings no propios — LightRAG los gestiona | ✅ CONGELADO | Análisis de prioridades |
| Scoring de relevancia heurístico (overlap + recencia) para Fases 3-8 | ✅ CONGELADO | Análisis de prioridades |
| Metodología: 3 Mineros (OpenCode) + 1 Orquestador (Antigravity) | ✅ CONGELADO | Respuestas §7.2 |

---

*Este documento es la última línea de defensa contra la pérdida de coherencia.*
*Actualizar cada vez que una nueva decisión arquitectónica sea congelada por el usuario.*