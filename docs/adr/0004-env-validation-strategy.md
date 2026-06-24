# ADR-0004: Env validation strategy

## Status

`accepted`

## Context

El runtime (`kage-runtime`) arrancaba con `'sk-placeholder'` cuando `LLM_API_KEY` no estaba
definida (EV-15). Esto deja pasar el boot pero explota en la primera llamada real.
Además, `LLM_BASE_URL` se logueaba en plaintext, filtrando el valor completo en logs.

Se necesita validación explícita y fail-fast al arranque.

## Decision

1. **Single source of truth**: `apps/kage-runtime/src/env-schema.ts` exporta:
   - `EnvSchema` — Zod object con todas las variables requeridas y opcionales.
   - `parseEnv(env: NodeJS.ProcessEnv): NinjaEnv` — parsea y **lanza** `ZodError` si inválido.
     Testeable sin side effects (no hace `process.exit`).
   - `loadEnv(): NinjaEnv` — llama `parseEnv(process.env)`, captura el error,
     imprime lista de issues con `console.error` y hace `process.exit(1)`.

2. **Variables requeridas** (boot falla si faltan o son inválidas):
   - `LLM_BASE_URL` — URL válida
   - `LLM_API_KEY` — string ≥8 chars
   - `LLM_DEFAULT_MODEL` — string no vacío

3. **Variables opcionales con defaults**:
   - `LLM_PROVIDER` — default `'openai'`
   - `NINJA_RUNTIME_PORT` — default `3141` (coerced number)
   - `LOG_LEVEL` — enum `['debug','info','warn','error','silent']`, default `'info'`
   - `LIGHTRAG_API_URL` — URL opcional
   - `NODE_ENV` — enum `['development','production','test']`, default `'development'`
   - `NINJA_LLM_FAIL_MODE` — enum `['strict','legacy']`, default `'strict'` (ver ADR-0003)

4. **Masking de logs**: ningún valor sensible en plaintext en logs.
   - `LLM_BASE_URL` → solo `new URL(x).host`
   - `LLM_API_KEY` → `***SET*** (${len} chars)`
   - `NINJA_LLM_FAIL_MODE` → valor completo (no es sensible)

5. **Errores de validación** en mensajes de boot: solo el `path` del schema (ej. `LLM_API_KEY`),
   nunca el valor del env var.

6. **`loadEnv()` se invoca en `index.ts`** antes de `bootstrap()`.
   Los imports estáticos de `index.ts` son `dotenv`, `path`, `fs`, `logging` — ninguno
   ejecuta side effects dependientes de env antes del call.

7. **`.env.example`** es la única referencia versionada. `.env` está en `.gitignore`.

## Consequences

- Boot falla rápido (<500ms) con mensaje claro listando todos los issues.
- `server.ts` recibe los valores validados — elimina el `|| 'sk-placeholder'` defensivo.
- `parseEnv` es testeable sin mockear `process.exit`.
- Cualquier variable nueva al runtime debe añadirse al schema primero.

## Alternatives considered

- `dotenv-flow`, `env-cmd`: deps adicionales innecesarias; Zod ya está en el proyecto.
- Validación en `server.ts`: tardía — el server ya importó módulos que pueden fallar.
- Lanzar `Error` en lugar de `process.exit`: correcto para tests, pero en producción
  queremos mensaje legible, no stack trace en stderr. La separación `parseEnv`/`loadEnv` resuelve ambos.
