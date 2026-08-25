# WP-B13 · CORS MCP SSE — Dossier de Cierre

**Branch**: `fix/epic-b-foundations`
**Fecha**: 2026-06-24

## Estado

✅ **Cerrado**. Audit muestra CORS ya correcto. Tests de regresión añadidos.

## Resultado del Audit

### 1. CORS global (Fastify `@fastify/cors`)

**Archivo**: `apps/kage-runtime/src/server.ts:64-90`

```ts
const ALLOWED_ORIGINS = [
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:3001', 'http://127.0.0.1:3001',
  'http://localhost:3141', 'http://127.0.0.1:3141',
];

await server.register(cors, {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true); return;
    }
    callback(new Error(`CORS bloqueado para origin: ${origin}`), false);
  },
});
```

**Veredicto**: ✅ Allowlist explícita. No hay wildcard `'*'`.

### 2. CORS MCP SSE (manual headers)

**Archivo**: `apps/kage-runtime/src/mcp-runtime-server.ts:10-60`

```ts
const ALLOWED_ORIGINS = [...]; // mismo array
const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin)
  ? origin
  : 'http://localhost:3001';   // fallback seguro

reply.raw.writeHead(200, {
  'Access-Control-Allow-Origin': allowOrigin,
  'Vary': 'Origin',
  ...
});
```

**Veredicto**: ✅ Eco del origin solo si está en allowlist. Fallback seguro. `Vary: Origin` presente.

### 3. Grep de seguridad

```bash
rg "Access-Control-Allow-Origin.*['\"]\\*['\"]" packages/ apps/  # → 0
rg "origin.*true" apps/kage-runtime/src/                          # → 0 (no hay allow-all)
```

## Greps finales

| Check | Resultado |
|-------|-----------|
| `rg "ACAO.*\*"` | 0 ✅ |
| `rg "origin.*true"` en cors config | 0 ✅ |
| MCP SSE con `Vary: Origin` | ✅ presente |
| Fallback a `localhost:3001` para origins desconocidos | ✅ |

## Tests añadidos

**Archivo**: `apps/kage-runtime/src/__tests__/mcp-cors.test.ts`

| Test | Estado |
|------|--------|
| origin permitido → ACAO refleja origin (no wildcard) | ✅ |
| origin no permitido → ACAO no incluye wildcard ni origin malicioso | ✅ |
| sin origin header → respuesta OK + ACAO no es `*` | ✅ |
