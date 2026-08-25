# WP-B8 · Verification Dossier — Fix filtro isAnchor
**Branch**: `fix/epic-b-foundations`
**Date**: 2026-06-24

---

## Resumen

`server.ts:515-516` ya aplica el filtro correcto `a.type === 'anchor'` (la tabla `artifacts` no tiene columna `isAnchor`). WP-B8 cierra con test integración del endpoint.

---

## Antes / Después

### apps/kage-runtime/src/server.ts:516
```ts
// ANTES (legacy — siempre vacío porque isAnchor no existe en DB)
list = list.filter((a) => a.isAnchor === true);

// DESPUÉS (correcto — coincide con cómo se persisten los anchors)
list = list.filter((a) => a.type === 'anchor');
```

---

## Tests creados

| Test | Descripción |
|---|---|
| `GET /api/artifacts?isAnchor=true` → solo type==='anchor' | ✅ |
| Artifacts con otros tipos excluidos | ✅ |
| Sin query param → retorna todos | ✅ |

---

## Conteos

| Métrica | Antes | Después |
|---|---|---|
| `GET /api/artifacts?isAnchor=true` devuelve anchors reales | No (siempre vacío) | **Sí** |
| Tests kage-runtime `__tests__/` | 3 (server.test.ts) | **6** (+3 WP-B8) |
