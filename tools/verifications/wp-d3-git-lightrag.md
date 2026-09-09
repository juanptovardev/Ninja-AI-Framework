# Dossier — WP-D3 · T5.5 · Tests integrations-git + integrations-lightrag

**Slot:** wt-5 · **Rama:** `feat/wp-d3-gitlight` · **Fecha:** 2026-09-09
**Prompt congelado:** T5.5 (tests de parsing git + chunker/client LightRAG)

## Alcance

- `packages/integrations-git/src/*.test.ts` (3 archivos nuevos)
- `packages/integrations-lightrag/src/*.test.ts` (4 archivos nuevos)
- `packages/integrations-lightrag/src/lightrag-client.ts` (cambio mínimo, ver "Desviaciones")

## Qué se testea

### integrations-git (child_process aislado vía mock de `@ninja/integrations-shell`)

Nunca se ejecuta git real: `executeCommand` (la frontera de spawn) está mockeada en todos los tests.

- **git-client.test.ts (21 tests):** `run` (env sanitizado `GIT_TERMINAL_PROMPT=0`/`GIT_PAGER=''`, timeout, cwd, GitCommandFailedError en exit≠0, envoltura GitError en fallo de spawn), `isGitAvailable`, `isGitRepo` (false en fallo de comando, rethrow en fallo de ejecución), `verifyGitRepo` (GitNotAvailableError / GitError propagado / GitRepoNotFoundError con path), `runWithVerification`, y parsers protegidos vía subclase: `parsePorcelainLines` (líneas cortas/sin path omitidas) y `parseLogOutput` (mapeo por formato, omisión de columnas sobrantes/faltantes).
- **status.test.ts (14 tests):** parsing porcelain v1 (`M `, `A `, ` M`, ` D`, `??`, `R `), línea de rama con `[ahead N, behind M]` y detached HEAD, `getChangedFiles`, `getLog` con formato `_NINJA_` (fecha ISO, merge por columna de padres con espacio, líneas malformadas omitidas, mensajes que contienen el separador, `--max-count` respetado).
- **operations.test.ts (16 tests):** `stage` (con/sin archivos), `commit` (mensaje vacío rechazado, árbol limpio → sin commit ni evento, extracción de hash → evento `git.commit.created` con hash `unknown` como fallback), `checkout` (validación y bloqueo de `..`, `~`, `^`), `pull` (timeout 120000, detached HEAD), `getBranches` (prefijo `* `), `getWorkingDirectoryStatus` (conteos clean/staged/unstaged/untracked).

### integrations-lightrag (fetch mockeado en `globalThis.fetch`)

- **chunker.test.ts (14 tests) — casos límite explícitos:** texto vacío → `[]`, solo espacios → `[]`, 1 palabra, texto menor que el chunk, división por párrafos, normalización CRLF/espacios, unicode+emoji preservado, split por oraciones sin cortar a mitad, fusión y no-fusión de oraciones según maxTokens, protección de abreviaturas (`Dr.`, `Sr.`, `Prof.`), oración gigante indivisible, evento `lightrag.chunk.created` con contadores consistentes (incl. vacío → todo en 0).
- **lightrag-client.test.ts (21 tests):** `index`/`query`/`health` con fetch mockeado. Errores HTTP (500/429/401/404/400) y timeouts (AbortError) → **NinjaError tipados** (`LIGHTRAG_SERVER`, `LIGHTRAG_RATE_LIMITED`, `LIGHTRAG_AUTH`, `LIGHTRAG_NOT_FOUND`, `LIGHTRAG_BAD_REQUEST`, `LIGHTRAG_TIMEOUT`, `LIGHTRAG_NETWORK_ERROR`) con `retryable` correcto — nunca throws crudos (incl. JSON inválido y TypeError de red). Skip cuando el servicio está caído, circuit breaker (3 fallos → OPEN → health sin red), eventos `lightrag.*` emitidos.
- **indexer.test.ts (8 tests):** generación de IDs únicos, chunk estimado (`ceil(len/500)`), evento `lightrag.document.indexed` / `lightrag.index.failed`, batch mixto con conteo indexed/failed/errors.
- **retriever.test.ts (5 tests):** delegación con `limit`, retorno `[]` cuando el servicio no está disponible (sin query), evento `lightrag.query.executed` con latencia, no-throw en fallo de query.

## Aceptación (output pegado)

Comando: `pnpm vitest run packages/integrations-git packages/integrations-lightrag --coverage`

```
 Test Files  7 passed (7)
      Tests  101 passed (101)
   Start at  13:52:23
   Duration  2.83s (transform 1.55s, setup 0ms, import 2.50s, tests 345ms, environment 2ms)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
 ...ations-git/src |   96.19 |    95.14 |   94.28 |   97.64 |                   
  git-client.ts    |   94.02 |    95.45 |   88.23 |   93.75 | 39-47             
  operations.ts    |     100 |    97.29 |     100 |     100 | 139               
  status.ts        |   95.65 |    93.18 |     100 |     100 | 92,146-151        
 ...s-lightrag/src |   94.68 |    84.74 |   92.85 |   96.66 |                   
  chunker.ts       |     100 |    78.57 |     100 |     100 | 54-60,148         
  ...rag-client.ts |   89.24 |    86.48 |   84.21 |   93.02 | 123-125,172-174   
  retriever.ts     |     100 |       75 |     100 |     100 | 60                
-------------------|---------|----------|---------|---------|-------------------
```

Cobertura por archivo (json-summary, confirma indexer.ts que no se muestra en la tabla de texto):

| Archivo | Lines |
|---|---|
| integrations-git (paquete) | **97.64%** ✅ ≥50% |
| — git-client.ts | 93.75% |
| — operations.ts | 100% |
| — status.ts | 100% |
| integrations-lightrag (paquete) | **96.66%** ✅ ≥50% |
| — chunker.ts | 100% |
| — indexer.ts | 100% (27/27 líneas) |
| — lightrag-client.ts | 93.02% |
| — retriever.ts | 100% |

## Gates

- **G1 pre-commit:** `pnpm vitest run packages/integrations-git packages/integrations-lightrag --coverage` → 7 files / 101 tests passed ✅
- **Typecheck:** `pnpm --filter @ninja/integrations-git typecheck` ✅ · `pnpm --filter @ninja/integrations-lightrag typecheck` ✅
- **Build:** `pnpm --filter @ninja/integrations-git build` ✅ · `pnpm --filter @ninja/integrations-lightrag build` ✅ (warning preexistente de `exports` en package.json del paquete git, no relacionado)
- **Anti-suite-basura (Quality Manual §5):** sin `expect(true)`, sin asserts triviales, sin sleeps reales (los timeouts se simulan con rejects de AbortError; no se usan fake timers porque no hay esperas activas).

## Desviaciones documentadas

1. **`lightrag-client.ts` — mapeo a NinjaError (cambio de código mínimo, requerido por el prompt T5.5):** el prompt exige "errores HTTP, timeouts → errores tipados NinjaError correspondientes, nunca throws crudos". El client original envolvía todo en `Error` crudo y tragaba los fallos de `index()`/`query()`. Se agregó `toLightRAGError()` (dominio `vault` = capa COLD, códigos `LIGHTRAG_*` con `retryable` según status) y `_handleError` ahora devuelve el NinjaError que el caller lanza. Semántica pública preservada: `health()` sigue retornando boolean, `query()` sigue retornando `[]` cuando el servicio está no disponible, y los callers existentes (vault coordinator, indexer, retriever) ya envuelven las llamadas en try/catch — verificado en `packages/vault/src/coordinator.ts:211-235` y `:353-374`.
2. **Behavior documentado, no "corregido":** `getLog` conserva el separador `_NINJA_` final cuando `%p` es vacío y `isMerge` se detecta por espacio en la columna de padres — se asertó el comportamiento real del parser (caracterización) sin modificar el código.
3. **Ramas defensivas no cubiertas:** el branch `CircuitOpenError` dentro de `index()`/`query()` es inalcanzable vía API pública (todo camino que abre el circuito también marca `_isAvailable=false`, lo que hace skip temprano). Impacto: ~6 líneas; la meta de 50% se supera con holgura.

## Commit

`git add packages/integrations-git packages/integrations-lightrag tools/verifications/wp-d3-git-lightrag.md`
`git commit -m "test(git,lightrag): parsers + chunker + typed error paths coverage"`

SHA: ver output de `git rev-parse HEAD` tras el commit.
