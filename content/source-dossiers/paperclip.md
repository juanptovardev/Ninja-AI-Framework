# Paperclip

## URL

github.com/paperclipai/paperclip

## Rol en Ninja

Inspiración para **Trace Ledger** (artifacts, sesiones, trazabilidad) y **Workbench** (workspace patterns). Se extraen patrones conceptuales, no código. Los artifacts de Paperclip inspiran el modelo de Trace Ledger con `isAnchor: boolean` para Memory Anchors.

## Patrones adoptados

1. **Artifact como unidad de trazabilidad** → **Trace Ledger** (artifacts con metadata, tipo, contenido, timestamps, `isAnchor: boolean` para Memory Anchors).

2. **Session tracking con historial** → **Trace Ledger** (sessions con runs, cada run con agent log + event log, trazabilidad completa).

3. **Workspace como contexto aislado** → **Workbench** (CRUD de workspaces, cada workspace con su contexto de proyecto, repositorio asociado, config propia).

4. **Execution semántica con steps** → **Flow Matrix** (workflows como secuencias de steps con agent/action/input/output, executor que coordina).

5. **Memory landscape por capas** → **Vault** (arquitectura 4 capas HOT/WARM/COLD/FROZEN con Memory Anchors, coordinador de acceso).

6. **Database-first persistence** → **Storage** (SQLite + better-sqlite3 con repositorios manuales, migrations explícitas, sin ORMs pesados).

7. **Artifacts con metadata rica** → **Trace Ledger** (cada artifact tiene tipo, fuente, timestamp, author, tags, isAnchor flag).

8. **Execution context por run** → **Trace Ledger** (cada run captura: agente, tools usadas, artifacts generados, eventos emitidos).

## Patrones descartados

1. **Rails backend** — Ninja usa Fastify (Node.js), no Ruby on Rails (decisión de stack §10 del Plan Maestro).

2. **React server components en el backend** — Ninja separa estrictamente: Fastify para runtime, Next.js solo para Forge Console.

3. **MCP server como capa de exposición principal** — Ninja pospone MCP a Fase 9 y lo implementa como adapter de Arsenal Registry, no como interfaz primaria.

4. **Plugin system dinámico** — Ninja usa módulos cerrados con dependencias explícitas, no plugins dinámicos cargables en runtime.

5. **Código LLM-agnostic en el core** — Paperclip abstrae el LLM como adapter intercambiable; Ninja usa integrations-llm con providers OpenAI-compatible pero no abstrae la interfaz del LLM como plugin externo.

6. **Vite como bundler principal** — Ninja usa tsup (esbuild-based) para builds de packages, Next.js solo para Forge Console.
