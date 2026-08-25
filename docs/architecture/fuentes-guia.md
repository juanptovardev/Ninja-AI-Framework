# 🗺️ Fuentes Guía — Origen de Cada Decisión del Ninja AI Framework
# Última actualización: Refactorización post-análisis de repos de contexto

---

## 1. Resumen de Fuentes Principales

| Fuente | Tipo | URL | Rol en Ninja |
|--------|------|-----|--------------|
| gentle-ai | Motor base + Sistema de providers | github.com/Gentleman-Programming/gentle-ai | Motor de orquestación + patrón de integración LLM. Se rediseña, no se forkea. |
| Build This Now | Inspiración UX/Flujo | buildthisnow.com | Flujo de construcción, etapas, dashboard visual |
| Paperclip | Patrones de artifacts | github.com/paperclipai/paperclip | Artifacts, sesiones, trazabilidad, workspace patterns |
| Miniverse | Guía visual | github.com/ianscott313/miniverse | Oficina digital pseudo-isométrica, departamentos |
| Gentleman-Skills | Contenido nativo | github.com/Gentleman-Programming/Gentleman-Skills | Skills y workflows base nativos |
| guardian (Guardian Angel) | Seguridad | github.com/Gentleman-Programming/gentleman-guardian-angel | Inspiración para Sentinel |
| Engram | Memoria | github.com/Gentleman-Programming/engram | Memoria viva oficial (capa WARM) |
| LightRAG | Indexado masivo | github.com/hkuds/lightrag | Indexación masiva y retrieval (capa COLD). Proceso Python, adapter HTTP. |
| free-coding-models | Datasource/Benchmark | github.com/vava-nessa/free-coding-models | Catálogo 238+ modelos, 25+ providers, Stability Score |

---

## 2. Repos de Contexto y Optimización (Analizados — Patrones Integrados)

Estos repos fueron analizados profundamente. Sus patrones están integrados
en la arquitectura oficial. NO se integran directamente.
Sus contribuciones están normalizadas en el Plan Maestro.

| Repo | Patrón adoptado | Módulo destino | Fase |
|------|-----------------|----------------|------|
| llm-context-optimizer | Token budget management + compresión inteligente | Model Gateway + Vault | 5 |
| context-optimization topic | Semantic chunking + relevance scoring | integrations-lightrag + integrations-engram | 5 |
| openclaw-context-optimizer | Compresión diferencial multi-turno | integrations-engram/compressor.ts | 5 |
| ai-context-optimizer | Feedback loop + context_efficiency_score | Pulse Center + Learning Loop | 4-5 |
| claude-teams-brain | Namespacing concurrente por agente | Vault/agent-namespace.ts | 5 |
| Code-HUD | 4 widgets de observabilidad | UI-Kit + App-Shell | 6 |
| infinite-conversation-architecture | Arquitectura 4 capas + Memory Anchors | Vault (coordinador) + Trace Ledger | 5 |
| context-optimizer-mcp-server | 4 ops públicas de Vault (sin MCP hasta Fase 9) | Vault/context-ops.ts | 5/9 |

---

## 3. Repos de Investigación y Apropiación (Forge Lab)

NO se integran tal como están. Pasan por Forge Lab:

| Repo | URL | Tipo de contenido |
|------|-----|-------------------|
| awesome-chatgpt-prompts | github.com/f/awesome-chatgpt-prompts (prompts.chat) | Técnicas de role-playing, text-to-image (Midjourney/Stable Diffusion/NVidia), y zero-shot/few-shot prompts |
| antigravity-skills | github.com/guanyang/antigravity-skills | Skills generales |
| everything-claude-code | github.com/affaan-m/everything-claude-code | Workflows de coding |
| gsap-skills | github.com/greensock/gsap-skills | Motion/animation |
| antigravity-awesome-skills | github.com/sickn33/antigravity-awesome-skills | Skills adicionales |
| ui-ux-pro-max-skill | github.com/nextlevelbuilder/ui-ux-pro-max-skill | Skills UI/UX |

---

## 4. Trazabilidad: De dónde viene cada concepto

### 4.1 Nombres Nativos Oficiales

| Nombre | Origen | Historia |
|--------|--------|---------|
| Kage Engine | Rediseño de gentle-ai | Historial P1 F3/F6 |
| Kage Runtime | Separación runtime local | Historial P1 F4 |
| Dojo CLI | Menú de arranque gentle-ai | Historial P1 F3 |
| Forge Console | Build This Now + Paperclip | Historial P1 F2+F4 |
| Office Grid | Miniverse | Historial P1 F2 |
| Arsenal Registry | Registro dual técnico+amigable | Historial P1 F4 §7 |
| Flow Matrix | Motor de workflows | Plan Maestro §8.3 |
| Workbench | Paperclip workspace patterns | Historial P1 F2 §4.2 |
| Trace Ledger | Paperclip artifacts | Historial P1 F2+F4 |
| Sentinel | Guardian Angel → Guardian → Sentinel | Historial P1 F3 |
| Model Gateway | Selección inteligente de modelos | Historial P1 F2 §7.6 |
| Pulse Center | Salud + Stability Score | Plan Maestro §14.2 |
| Learning Loop | Aprendizaje controlado | Plan Maestro §13.4 |
| Forge Lab | Investigación de repos externos | Historial P1 F4 §2 |
| Vault | Coordinador de 4 capas de memoria | Plan Maestro §13.3 + Análisis repos de contexto |

### 4.2 Decisiones Arquitectónicas Clave

| Decisión | Origen | Referencia |
|----------|--------|-----------|
| Local-first | Solicitud 1 del usuario | Historial P1 F1 |
| Runtime único | Engine-first | Historial P1 F2 §6.1 |
| TypeScript + pnpm + Turbo | Consolidado Fase 5 | Historial P1 F5-6 |
| Event-driven architecture | Eventos estructurados | Historial P1 F2 §6.2 |
| Doble confirmación | Solicitud 4 — grado de autonomía | Historial P1 F4 §14 |
| PRD como capacidad, no modo | Solicitud 4 | Historial P1 F4 §8.2 |
| Office siempre integrada | Solicitud 4 | Historial P1 F4 §8.3 |
| Memoria como capacidad raíz | Memory Keeper eliminado | Historial P1 F4 §9.3 |
| 4 capas de memoria (HOT/WARM/COLD/FROZEN) | Análisis infinite-conversation-architecture | Análisis repos de contexto |
| Memory Anchors = artifacts isAnchor:true | Análisis infinite-conversation-architecture | Análisis repos de contexto |
| Namespacing por agente en Vault | Análisis claude-teams-brain | Análisis repos de contexto |
| context_efficiency_score | Análisis ai-context-optimizer | Análisis repos de contexto |
| 4 widgets rail derecho | Análisis Code-HUD | Análisis repos de contexto |
| Token budget pre-LLM | Análisis llm-context-optimizer | Análisis repos de contexto |
| integrations-llm adelantado a Fase 3.0 | Plan de orquestación Fase 3 | §7.2 de respuestas usuario |
| Compresión vive en adapters, no en Vault | Análisis de redundancias | Doble análisis de conflictos |
| MCP Protocol pospuesto a Fase 9 | Análisis de prioridades | Formulario de decisiones |
| LightRAG vía proceso Python + HTTP adapter | Decisión de stack | §3.3 respuestas usuario |
| Metodología 3 mineros + 1 orquestador | Plan de orquestación | §7.2 respuestas usuario |

### 4.3 Agentes y su Origen

| Agente | Origen | Notas |
|--------|--------|-------|
| Planner, DB Architect, Backend, Connector, Designer, Tester, Quality Gate, Security, Build Fixer | Build This Now | 9 especialistas base |
| Librarian | Propuesto en Respuesta 3.7.2 | Recomendador + auditor inteligente |
| Planificator | Renombrado de "PRD Architect" | Solicitud 4 |
| ~~Template Curator~~ | Eliminado | Fusionado en Librarian + indexador |
| ~~Memory Keeper~~ | Eliminado | Memoria es capacidad raíz |
| ~~Guardian Angel~~ | Eliminado | Renombrado a Sentinel |

---

## 5. Evolución de la Identidad del Proyecto

1. Solicitud 1: "Cliente CLI de IA para Windows" → visión simple
2. Solicitud 2: + Paperclip + Miniverse → oficina digital + artifacts
3. Solicitud 3: + gentle-ai → plataforma multiagente
4. Solicitud 4: consolidación → plataforma local-first híbrida
5. Fases 5-8: congelación del Plan Maestro con 10 fases
6. Fases 9-13: protocolo de desarrollo con IA + scaffolding real
7. Análisis de repos de contexto: arquitectura de Vault ampliada,
   Memory Anchors, namespacing, 4 widgets, token budget, metodología de orquestación

**Definición final rectora:**
> "Ninja es una plataforma local-first de ingeniería asistida por IA,
> con runtime único, dashboard observable, oficina digital,
> aprendizaje controlado, seguridad supervisada y crecimiento modular estricto."

---

## 6. Referencias Cruzadas con Documentos del Proyecto

| Documento | Ruta |
|-----------|------|
| Plan Maestro v1.1 | Ninja AI Framework v1.0.md |
| Guía Maestra Total | tools/guia-maestra.md |
| Checklist Global | tools/checklist-global.md |
| Directiva de Coherencia | docs/architecture/coherencia-estructural.md |
| Fuentes Guía (este doc) | docs/architecture/fuentes-guia.md |
| Historial Parte 1 | docs/architecture/historial-creacion-ninja.md |
| Historial Parte 2 | docs/architecture/historial-creacion-ninja-parte-2.md |
| Logs de sesiones | logs/ |