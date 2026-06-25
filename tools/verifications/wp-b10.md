# WP-B10 · Deprecar `ContextOps` legacy — Dossier de Cierre

**Branch**: `fix/epic-b-foundations`
**Fecha**: 2026-06-24

## Estado

✅ **Cerrado**. `ContextOps` eliminado por completo.

## Verificación previa (grep exhaustivo)

```bash
rg "ContextOps" packages/ apps/ --type ts
# → solo en context-ops.ts + context-ops.test.ts + index.ts (export)

rg "context-ops" packages/ apps/ --type ts
# → solo en los 2 archivos propios
```

**Consumidores de producción**: 0

## Cambios realizados

| Acción | Archivo |
|--------|---------|
| Eliminado | `packages/vault/src/context-ops.ts` (~180 líneas) |
| Eliminado | `packages/vault/src/context-ops.test.ts` |
| Quitado export | `packages/vault/src/index.ts` (líneas 5-7) |
| Creado | `docs/adr/0005-vault-exposes-vaultcoordinator-only.md` |

## Métricas antes/después

| Métrica | Antes | Después |
|---------|-------|---------|
| Archivos `ContextOps` | 2 | 0 |
| Exports `@ninja/vault` que referencian `ContextOps` | 2 | 0 |
| `rg "new ContextOps\("` count | 0 (test only) | 0 |
| Tests vault pasando | 8 | 8 |
| Typecheck `@ninja/vault` | ✅ | ✅ |

## Verificación post-borrado

```bash
rg "new ContextOps\(" packages/ apps/ --type ts  # → 0
pnpm --filter @ninja/vault typecheck               # → ✅ (sin errores)
pnpm vitest run packages/vault                     # → 8 passed
```
