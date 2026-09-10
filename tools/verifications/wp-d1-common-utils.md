# WP-D1 — common-utils real (T6.1)

**Fecha:** 2026-09-10 · **Alcance:** `packages/common-utils/**` + este dossier · nada más.

## Qué se añadió

| Módulo | Utilidad | Tests |
|--------|----------|-------|
| `retry.ts` | `retryWithBackoff` (backoff exponencial, jitter full 50–100%, opción `respectRetryAfter` — respeta `error.retryAfter`/`error.retry-after`/`error.data['retry-after']` como número-segundos, string numérica, Date o HTTP-date) · `getRetryAfterDelayMs` | 13 |
| `result.ts` | `Result<T,E>` — `ok`/`err`/`isOk`/`isErr`/`map`, discriminante `ok` con narrowing via type guards | 7 |
| `debounce.ts` | `debounce` — trailing/leading, cancel, flush, preserva `this` y args | 11 |
| `throttle.ts` | `throttle` — first-in-window, trailing opcional, cancel, preserva `this` | 12 |
| `deep-freeze.ts` | `deepFreeze` recursivo (objetos/arrays, primitivos pasan intactos, ciclos seguros) | 8 |
| `safe-json.ts` | `safeJsonParse` + `JsonParseError` (sin throws, validador opcional) | 10 |

Todo exportado por `src/index.ts`. L1 puro: cero imports de otros `@ninja/*`. Cero `as any` nuevo. Cero dependencias nuevas.

## Bug real encontrado y corregido

`getRetryAfterDelayMs` parseaba strings numéricas (`'4'`) vía `Date.parse` antes de tratarlas como
segundos → devolvía fechas absurdas. Orden corregido: número → string numérica (regex estricta) →
`Date.parse` como último recurso.

## Evidencia (re-ejecutado por orquestador)

- `pnpm vitest run packages/common-utils --coverage` → **61 passed (61)** · common-utils/src: **94.02% statements / 94.73% functions / 94.14% lines** — umbral ≥80% superado.
- `pnpm --filter @ninja/common-utils typecheck` → **exit 0**.
- Únicas líneas sin cubrir: ramas defensivas (`retry.ts:55` "never produced a value", fallbacks de `Date.parse` inválido).

## Nota de proceso

El worker kiosapi completó archivos pero el timeout de shell cortó la sesión antes del commit; el
orquestador cerró la tarea: arregló 6 errores typecheck en tests (narrowing `isErr`, param fantasma,
readonly-array cast) + el bug de `getRetryAfterDelayMs`, luego verificó y commiteó.
