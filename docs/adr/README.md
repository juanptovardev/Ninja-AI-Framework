# Architecture Decision Records

Este directorio contiene los ADRs del Ninja AI Framework.

## Convenciones

- Numeración secuencial de 4 dígitos: `0001-`, `0002-`, …
- Status permitidos: `proposed` · `accepted` · `superseded by ADR-NNNN`
- **Una decisión por archivo.** Un ADR aceptado nunca se edita — se supera con uno nuevo.
- Nombre de archivo: `NNNN-<slug-kebab-case>.md`

## Índice

| ADR | Título | Status |
|-----|--------|--------|
| [0001](0001-ninja-error-hierarchy.md) | NinjaError hierarchy | accepted |
| [0002](0002-error-migration-scope.md) | Error migration scope (B1) | accepted |
| [0003](0003-llm-fallback-semantics.md) | LLM fallback semantics + NINJA_LLM_FAIL_MODE | accepted |
| [0004](0004-env-validation-strategy.md) | Env validation strategy (WP-B2) | accepted |
| [0014](0014-windows-portable-packaging.md) | Windows portable-ZIP packaging (WP-F4) | accepted |

<!-- Nota: los ADR 0005–0013 existen en `docs/adr/` pero aún no están indexados en esta
     tabla (laguna preexistente, no introducida por ADR-0014). Registrarlos excede T8.1. -->
