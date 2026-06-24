# gentle-ai

## URL

github.com/Gentleman-Programming/gentle-ai

## Rol en Ninja

Motor base de orquestación. Se rediseña profundamente como **Kage Engine**, no se forkea ni copia literalmente. El patrón de providers LLM (OpenAI-compatible con fallback chain) se adopta en `integrations-llm`. El patrón de CLI launcher se adopta en **Dojo CLI**.

## Patrones adoptados

1. **Adapter + Registry Pattern** → **Arsenal Registry** (registro de tools/skills con lookup por ID/categoría, `Map<string, ToolDefinition>`).

2. **Proveedor LLM OpenAI-compatible** → **integrations-llm** (endpoint `/v1/chat/completions`, headers `Authorization: Bearer`, streaming SSE line-by-line parsing).

3. **Fallback chain automático** → **integrations-llm + Model Gateway** (si proveedor falla → siguiente en cadena, control de cuota dinámico, log de switches en Trace Ledger).

4. **CLI launcher con menú** → **Dojo CLI** (menú tipo gentle-ai con opciones de instalación/workspace/tarea, runtime client).

5. **Skill Registry con auto-discovery** → **Arsenal Registry** (agents buscan skills relevantes por contexto del proyecto, no listas hardcoded).

6. **Pipeline de ejecución por fases** → **Kage Engine** (intake → planificación → ejecución → validación, con coordinator que orquesta agentes).

7. **Atomic + idempotent file operations** → **integrations-fs** (WriteFileAtomic con content-equality checks, safe to repeat).

8. **Engram persistent memory** → **integrations-engram** (memoria viva con compresión diferencial 5:1, topic-based upserts, session summary protocol).

9. **SDD orchestrator pattern** → **Kage Engine** (delegación por fases con sub-agentes, cada fase con skill específica).

10. **Model assignment por fase** → **Model Gateway** (tiered model routing: opus/sonnet/haiku para diferentes necesidades de capacidad/costo).

## Patrones descartados

1. **Go como lenguaje runtime** — Ninja usa TypeScript strict + Node.js 18+ (decisión de stack §10 del Plan Maestro).

2. **Bubbletea TUI** — Ninja usa Ink/React para CLI y Next.js para Forge Console (decisión de stack §10).

3. **Inyección de config en agentes externos** — Ninja es plataforma autónoma, no configurador de terceros como gentle-ai.

4. **Guardian Angel como hook pre-commit** — Ninja usa **Sentinel** como sistema supervisor interno, no como hook de git.

5. **SDD (Spec-Driven Development) como workflow nativo** — Ninja usa su propio **Flow Matrix** con workflows custom, no adopta SDD como flujo obligatorio.

6. **Persona injection** — Ninja no inyecta personalidades en agentes; cada agente tiene un rol funcional definido (§13.1).

7. **MCP como capa primaria** — Ninja pospone MCP a Fase 9 y lo implementa como adapter de Arsenal Registry, no como interfaz primaria.
