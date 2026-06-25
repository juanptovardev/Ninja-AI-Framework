# ADR-0005 — Vault expone exclusivamente `VaultCoordinator`

**Status**: Accepted
**Date**: 2026-06-24
**Branch**: fix/epic-b-foundations

## Context

`@ninja/vault` tenía dos implementaciones divergentes de operaciones de contexto:
- `VaultCoordinator` — el coordinador oficial que delega a los adaptadores de memoria (Engram, LightRAG, Trace Ledger).
- `ContextOps` — implementación legacy con lógica de compresión y namespace propia, duplicando responsabilidades.

`ContextOps` nunca fue consumido por ningún módulo de producción. Su único consumidor era `context-ops.test.ts` (el propio test del archivo). La coexistencia creaba ambigüedad sobre cuál era la fuente de verdad.

## Decision

Eliminar `ContextOps` completamente de `@ninja/vault`:
- Borrar `packages/vault/src/context-ops.ts`
- Borrar `packages/vault/src/context-ops.test.ts`
- Quitar los exports `ContextOps`, `TokenBudget`, `ContextRequest` de `packages/vault/src/index.ts`

`VaultCoordinator` es la única API pública de Vault para operaciones de contexto.

## Consequences

**Positivo**:
- Una sola fuente de verdad en `@ninja/vault`.
- Reducción de código muerto (~180 líneas).
- Elimina la confusión sobre qué clase usar.
- Typecheck y tests pasan sin cambios en consumidores externos.

**Negativo / Riesgo**:
- Breaking change para cualquier consumidor externo que importara `ContextOps` directamente. Verificado con `rg "ContextOps" packages/ apps/ --type ts` → 0 resultados fuera de los archivos eliminados.

## Verification

```bash
rg "new ContextOps\(" packages/ apps/ --type ts  # → 0
pnpm --filter @ninja/vault typecheck              # → ✅
pnpm vitest run packages/vault                    # → 8 passed
```
