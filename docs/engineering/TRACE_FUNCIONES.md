# TRACE DE FUNCIONES — catálogo anti-reescritura

> Consultar ANTES de escribir código nuevo. Si ≥80% del problema ya está resuelto: reutilizar,
> extender o componer — nunca reescribir. Nuevas utilidades se registran **en el mismo commit**.

| Nombre | Paquete / Ruta | Qué hace | Firma | Tests |
|--------|----------------|----------|-------|-------|
| retryWithBackoff | common-utils | Reintento exponencial con jitter + soporte Retry-After | `(fn, opts) => Promise<T>` | ✅ 13 |
| getRetryAfterDelayMs | common-utils | Lee Retry-After de un Error (número/ISO/Date) | `(err) => number|null` | ✅ |
| Retry (HTTP) | integrations-http | Retry con backoff para fetch (capa HTTP) | uso en retry.ts | ✅ |
| CircuitBreaker | common-utils | Circuit breaker con fail-fast | `class` | ✅ |
| DEFAULT_TIMEOUTS | common-utils | Tiempos por categoría LLM/HTTP/DB | `getTimeout(cat)` | ✅ |
| Result/ok/err/isOk/map | common-utils | Result<T,E> tipo Either | `(value) => Result<T,never>` | ✅ 7 |
| debounce / throttle | common-utils | Control de flujo temporal con preservación de this | `(fn, waitMs, opts)` | ✅ 23 |
| deepFreeze | common-utils | Congelación profunda inmutable | `(obj)` | ✅ 8 |
| safeJsonParse | common-utils | JSON.parse que nunca lanza | `(raw, fallback?)` | ✅ 10 |
| errors (codes) | contracts | Catálogo central de errores NinjaError | — | ✅ |
| eventBus | events | `eventBus.on/emit` tipado NinjaEvent | conductor central | ✅ |
| firewall logger | logging | JSON structured logging | — | ✅ |
| L2→L3 fix example | learning-loop | Test fake: `ConstructorParameters<typeof SUT>[0]` | — | ✅ |

> Las capas están en QUALITY_MANUAL §4.2. common-utils es L1: NO importa otros `@ninja/*`.
