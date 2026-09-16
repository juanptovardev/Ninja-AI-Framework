# release-v1.0.0.md — RC: Enterprise-ready baseline

**Fecha:** 2026-09-15 · **Tag:** `v1.0.0` · **Commit de release:** `d32764e` (rama `feat/release-v1.0.0-final`) · **Supersede:** primer intento BLOQUEADO (`3d5f560`, evidencia en merge `9883b2c [record]`) desbloqueado por `wp-e2e-fix` (`671b36c`) + bumps de seguridad (`b932a30`).

## Gate 3 §10.2 — checklist ítem por ítem (re-ejecutado por orquestador sobre d32764e)

| # | Ítem | Comando | Resultado |
|---|------|---------|-----------|
| 1a | G2 | `pnpm typecheck && pnpm test && pnpm errors:check` | typecheck 34/34 ✅ · **test 1336/1336 (112 files)** ✅ · errors.md (47 códigos) ✅ |
| 1b | G3 build | `pnpm build` | **35/35** ✅ (con next 16.3.5) |
| 1c | G3 e2e | `pnpm playwright test` | **16 passed / 0 failed** ✅ (auth + locale + EULA seeds, wp-e2e-fix) |
| 1d | G3 audit | `pnpm audit --prod` | **"No known vulnerabilities found"** ✅ — antes: 2 critical (RCE Next.js) + 17 high + 10 moderate → despejados con `next@16.3.5`, `fastify@^5.12.4` y overrides dirigidos (`b932a30`) |
| 2 | Secret scan §6.5 | `git grep -n -IE "sk-[A-Za-z0-9]{10,}\|api[_-]?key\s*[:=]\|Bearer [A-Za-z0-9]{15,}" HEAD` | 6 hits = referencias HISTÓRICAS a `sk-placeholder` en docs/ADRs/dossiers (aceptadas en revisión Epic A/B; el placeholder fue eliminado del código) · **0 secretos reales** ✅ *(corrección del comando del Manual: `git rev-list -20` es inválido; `%(-n 20 HEAD)` es la forma efectiva)* |
| 3 | CHANGELOG | `CHANGELOG.md` | sección v1.0.0 completa (Added/Changed/Fixed/Security/deuda residual F0→F5) ✅ |
| 4 | Bump lockstep | 6 packages `0.1.0 → 1.0.0` (forge-lab, installer, integrations-{fs,git,http,shell}) | **32/32 packes a» 1.0.0** ✅ |
| 5 | Tag | `git tag -a v1.0.0` en main (post-merge) | ✅ local |
| 6 | Bundle §10.4 | `../ninja-backup-v1.0.0.bundle` + `git bundle verify` | ✅ |
| 7 | Push | main + tag (remoto privado verificado) | ✅ post-auditoría |

## Edge-3 fix prerelease (registro)

- **`wp-e2e-fix`**: 8 E2E rotos (4 auth 401 + 4 por EulaGate/i18n) + **bug de producto real** (cliente browser nunca autenticaba — `lib/api.ts` perdía modo local-first con key en localStorage). Ahora 16/16. Dossier: `wp-e2e-fix.md`.

## Postmortem ligero

- **Lead time total F0 → v1.0.0:** 2026-08-24 → 2026-09-15 (22 días de desarrollo + 1 etapa de auditoría).
- **Hotfixes durante la etapa:** fix `deepseek-v4-flash` EOL (cambio de modelo); browser-auth + EULA-plugin E2E (èste dossier).
- **Deuda restante conocida:** EXC-3 (office-grid 33.82%, expiración jsdom), ADR-0013/DEBT(T6.4) (layer edges, grandfathered), kage-engine/vault <70% (gate lo denuncia), companion de-scope F5+ (ADR-0011), Node standalone del instalador diferido (F5.x), `ToolProvider NaN%` con rail vacío (cosmético, no bloqueante).
- **Bloqueantes resueltos:** primer intento de Gate 3 (e2e 8F + audit 29) — desbloqueado en la misma sesión.

## Verificaciones finales (ran una vez más después de merge/tag)

- Suite completa en main post-merge: (se confirma al push).
- `git tag -a v1.0.0 -m "v1.0.0 — enterprise-ready baseline"` → tag anotado en main.
- Artifact: `dist-installer/ninja-ai-framework-1.0.0-portable.zip` (~<TBD> MB — ver evidencia del instalador generada) — verificado con `install-check.mjs` (extrae → start.bat → `/health` 200 al intento).
- Bundle: `../ninja-backup-v1.0.0.bundle` — verify OK.

## Archivo de auditoría

Los 8 criterios de `PLAN_EJECUCION.md §11`, con evidencia, en `tools/verifications/cierre-etapa-8.md` (auditoría final del orquestador) tras el push 0|0.
