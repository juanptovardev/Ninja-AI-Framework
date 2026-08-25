# ADR-0001: NinjaError hierarchy

## Status

`accepted`

## Context

El proyecto tiene 74 instancias de `throw new Error(string)` sin código, dominio ni tipado.
Esto impide: filtrar errores por dominio, serializar de forma segura hacia HTTP (sin filtrar stacks),
clasificar retryability, y construir un error handler centralizado (WP-C1).
Se necesita una jerarquía nativa en TypeScript strict sin dependencias externas.

## Decision

- Clase base `NinjaError extends Error` con: `code: string`, `domain: NinjaErrorDomain`,
  `retryable: boolean` (default `false`), `httpStatus?: number`, `suggestion?: string`,
  `context?: Record<string, unknown>`.
- `Error.cause` nativo (ES2022) para cadenas de causalidad.
- Subclases ligeras por dominio (`LLMError`, `SentinelError`, `EngineError`, etc.) —
  solo fijan `domain`, sin behavior adicional.
- `ErrorCode` como branded type (`string & { readonly __brand: unique symbol }`) para bloquear typos en compile time.
- `toJSON()` sanitiza: omite `stack` en `NODE_ENV=production`, trunca stack a 20 líneas en dev,
  redacta PII en `context` (apiKey, authorization, token, password, secret, bearer),
  serializa `cause` recursivamente hasta depth 3.
- Helpers: `isNinjaError(e): e is NinjaError` y `wrapUnknown(e, code, domain)`.
- Catálogo de códigos como `const object` exportado (`ErrorCodes`).
- Reside en `packages/contracts/src/errors.ts` y se exporta desde `@ninja/contracts`.

## Consequences

- Todo error del sistema puede ser `instanceof NinjaError` — el error handler global (WP-C1)
  puede extraer `httpStatus`, `retryable` y `code` sin ifs.
- El branded type impone disciplina en el catálogo de códigos.
- La serialización segura previene filtración de stacks/credenciales en producción.
- Los paquetes externos siguen lanzando errores nativos — `wrapUnknown` los convierte en el boundary.

## Alternatives considered

- **ts-custom-error** (npm): dependencia externa prohibida por `coherencia-estructural.md`.
- **AggregateError**: orientado a múltiples errores simultáneos; no aporta para single-cause.
- **Enum de códigos (TypeScript enum)**: genera JS runtime overhead y complica tree-shaking. `const object` es suficiente y más simple.
- **Symbol-based domain**: más seguro pero impide serialización JSON trivial. String literal union es pragmático.
