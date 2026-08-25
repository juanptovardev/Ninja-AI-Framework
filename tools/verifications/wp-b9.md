# WP-B9 · selectFastest — Dossier de Cierre

**Branch**: `fix/epic-b-foundations`
**Fecha**: 2026-06-24

## Estado

✅ **Cerrado**. La corrección ya estaba implementada en commit previo durante WP-B3.
Los 3 tests de regresión específicos (edge cases `?? Infinity`) se añadieron en esta sesión.

## Corrección implementada

```ts
// packages/model-gateway/src/selector.ts:136-143
private selectFastest(models: ModelEntry[]): ModelEntry {
  return models.reduce((best, current) => {
    // WP-B9: "fastest" = menor ping. Sin ping medido => Infinity (no se prioriza como rápido).
    const bestPing = best.lastPing ?? Infinity;
    const currentPing = current.lastPing ?? Infinity;
    return currentPing < bestPing ? current : best;
  });
}
```

**Bug original**: comparación `>` con `?? 0` hacía que modelos sin ping ganaran (0 es el menor).
**Fix**: `<` con `?? Infinity` — sin ping = no compite como rápido.

## Métricas

| Métrica | Valor |
|---------|-------|
| Tests añadidos | 3 |
| Tests totales selector.test.ts | 18 |
| Tests fallando | 0 |
| Typecheck `@ninja/model-gateway` | ✅ |

## Tests de regresión (WP-B9)

| Test | Input | Resultado esperado | Estado |
|------|-------|-------------------|--------|
| elige menor ping | pings {200, 50, 120} | modelo con 50ms | ✅ |
| sin ping no gana | [{undefined}, {100ms}] | modelo con 100ms | ✅ |
| todos sin ping | 3 modelos sin lastPing | primero de la lista | ✅ |

## Verificación

```bash
pnpm vitest run packages/model-gateway/src/selector.test.ts
# → 18 passed (18)
```
