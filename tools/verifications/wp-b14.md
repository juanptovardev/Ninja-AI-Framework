# WP-B14 · SSRF Guard `integrations-http` — Dossier de Cierre

**Branch**: `fix/epic-b-foundations`
**Fecha**: 2026-06-24

## Estado

✅ **Cerrado**. `ssrfGuard` implementado, integrado en `httpRequest`, 12 tests verdes.

## Archivos modificados / creados

| Acción | Archivo |
|--------|---------|
| Creado | `packages/integrations-http/src/ssrf-guard.ts` |
| Creado | `packages/integrations-http/src/ssrf-guard.test.ts` |
| Modificado | `packages/integrations-http/src/client.ts` — wire `ssrfGuard` pre-fetch |
| Modificado | `packages/integrations-http/src/index.ts` — export `ssrfGuard` |
| Modificado | `packages/contracts/src/errors.ts` — `HTTP_SSRF_BLOCKED` + `SSRFError` |

## Matriz de ataques bloqueados

| Ataque | Vector | Bloqueado por | Estado |
|--------|--------|---------------|--------|
| AWS metadata | `169.254.169.254` | `BLOCKED_HOSTS` | ✅ |
| GCP metadata | `metadata.google.internal` | `BLOCKED_HOSTS` | ✅ |
| Private class A | `10.0.0.1` | `PRIVATE_RANGES[0]` | ✅ |
| Private class B | `172.16.5.10` | `PRIVATE_RANGES[1]` | ✅ |
| Private class C | `192.168.1.1` | `PRIVATE_RANGES[2]` | ✅ |
| Localhost | `127.0.0.1` | `PRIVATE_RANGES[3]` | ✅ |
| Link-local | `169.254.x.x` | `PRIVATE_RANGES[4]` | ✅ |
| IPv6 loopback | `::1` | `PRIVATE_RANGES[5]` | ✅ |
| IPv6 ULA | `fd00::` | `PRIVATE_RANGES[6]` | ✅ |
| Allowlist bypass | `bitbucket.org` con `allowedDomains:[github.com]` | allowlist check | ✅ |

## Opciones de integración

```ts
// Modo por defecto (SSRF guard activo, sin allowlist)
await httpRequest({ url: 'https://api.github.com', method: 'GET' });

// Con allowlist de dominios
await httpRequest({
  url: 'https://api.github.com',
  method: 'GET',
  ssrf: { allowedDomains: ['github.com'] },
});

// Deshabilitar guard (solo para dev/internal en entornos controlados)
await httpRequest({ url: 'http://localhost:3141/health', method: 'GET', ssrf: false });
```

## Métricas

| Métrica | Valor |
|---------|-------|
| Tests (ssrf-guard.test.ts) | 12 ✅ |
| Typecheck `@ninja/integrations-http` | ✅ |
| Typecheck `@ninja/contracts` | ✅ |
| Error codes en `ErrorCodes` | +1 (`HTTP_SSRF_BLOCKED`) |
| Clases de error en `@ninja/contracts` | +1 (`SSRFError`) |

## Verificación

```bash
pnpm vitest run packages/integrations-http/src/ssrf-guard.test.ts
# → 12 passed
pnpm --filter @ninja/integrations-http typecheck  # → ✅
pnpm --filter @ninja/contracts typecheck           # → ✅
```
