# ADR-0012: Rate limiting y security headers con plugins oficiales de Fastify

## Status

`accepted`

## Context

El runtime expone HTTP/WS en localhost:3141 con auth por `X-Ninja-Key`. Sin embargo, el modelo
local-first no elimina todo riesgo: cualquier proceso local (o pestaña del navegador comprometida)
puede martillear endpoints costosos (`/api/shell/execute` ejecuta comandos; `/api/forgelab/analyze`
hace fetch externo), y las respuestas del runtime carecían de cabeceras de seguridad mínimas
(`X-Content-Type-Options`, `Referrer-Policy`, etc.). El QUALITY_MANUAL §6.6 (security
misconfiguration) y el despacho F2.6 piden rate limiting + security headers.

Se requiere decidir: implementación hand-rolled vs plugins oficiales del ecosistema Fastify, y
parámetros de límite. Justificación §9.2 requerida por ser dependencias de runtime.

## Decision

1. **`@fastify/rate-limit` v11** registrado global con:
   - `max: 100` / `timeWindow: '1 minute'`, clave por `X-Ninja-Key` (fallback `request.ip` para
     rutas públicas sin key).
   - `/api/shell/execute` con override route-level `max: 10 / min` (superficie de ejecución).
   - `errorResponseBuilder` que devuelve el formato de error del runtime
     (`{ statusCode: 429, error, code: 'RATE_LIMITED', message }`).
2. **`@fastify/helmet` v13** registrado con `contentSecurityPolicy: false` — el runtime sirve
   API/WS, no HTML propio (el dashboard es forge-console/Next.js con sus cabeceras). Las demás
   cabeceras por defecto (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`,
   `Strict-Transport-Security`, etc.) quedan activas.
3. Ambos se registran **antes** de CORS y del hook de auth: el límite aplica también a requests
   no autenticadas (el abuso no necesita credenciales).

### Justificación §9.2

| Criterio | @fastify/rate-limit v11 | @fastify/helmet v13 |
|----------|------------------------|---------------------|
| (1) Need no resoluble en ~50 LoC | Token bucket por key con timeWindow, override por ruta y store intercambiable: ~150+ LoC con edge cases (ventanas deslizantes, race conditions, reset). Hand-rolled sería deuda de seguridad. | Cobertura correcta de ~15 cabeceras con matices por browser; mantenerlas a mano envejece mal. |
| (2) Alternativas consideradas | a) Hand-rolled (~50 LoC): descartada — superficie de seguridad propia sin tests de tercero. b) `fastify-rate-limit` comunidad: descartada, menos mantenida. c) Proxy externo (nginx): viola local-first, instalación extra en Windows. | a) Cabeceras manuales con `addHook('onSend')`: descartada — inventario manual incompleto y sin auditoría externa. b) `fastify-helmet` comunidad: es el mismo paquete (renombrado a scope @fastify). |
| (3) Licencia | MIT | MIT |
| (4) Install size | ~120 KB (1 dependencia: fastify-plugin) | ~150 KB (fastify-plugin + helmet-core) |
| (5) Mantenimiento | Fastify org (official), versionado activo, fastify ^5 peer | Fastify org (official), versionado activo, fastify ^5 peer |

Ambos pertenecen al stack aprobado (§9.1 / Directiva §4.1: ecosistema Fastify).

## Consequences

- Las respuestas 429 del plugin NO pasan por el error handler global (el plugin responde
  directamente): por eso `errorResponseBuilder` replica el formato de error del runtime.
- Cabeceras helmet en respuestas JSON son mayormente inertes para clientes API, pero protegen
  cualquier render futuro y satisfacen el baseline de security misconfiguration (§6.6).
- 100/min global es holgado para single-operator local; el store es in-memory (se resetea con el
  proceso) — suficiente; si F5 añade multi-instancia, migrar a store compartido.
- Coste: 2 dependencias runtime nuevas en `@ninja/kage-runtime` (justificadas arriba y en el
  dossier `wp-c4-security.md`).

## Alternatives considered

- **Hand-rolled rate limiter**: descartada (ver §9.2(1)).
- **@fastify/helmet con CSP activa**: descartada — CSP en respuestas JSON/WS añade ruido sin
  protección real aquí; forge-console (el único HTML) no lo sirve este proceso.
- **Excluir /health del rate limit**: descartado — 100/min es holgado para probes locales y el
  criterio del plan pide límite global simple; si un monitor externo lo necesita, permitir por
  `allowList` de IP en un WP futuro.

## References

- PLAN_EJECUCION.md F2.6 · QUALITY_MANUAL §9.2, §9.3, §6.6 · Dossier `tools/verifications/wp-c4-security.md`
