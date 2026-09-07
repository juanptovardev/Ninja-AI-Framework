# Troubleshooting

## Runtime won't start

**Symptoms:** `pnpm runtime:dev` exits immediately or shows a config error.

- Ensure `.env` exists and contains `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_DEFAULT_MODEL`.
- `LLM_API_KEY` must be at least 8 characters (Zod validation rejects short keys).
- Check that port 3141 is free (see "Port already in use" below).

## LLM calls fail

**Symptoms:** Tasks submitted but no output; logs show LLM errors.

- Verify `LLM_API_KEY` is valid for your provider.
- `LLM_BASE_URL` must end in `/v1` for OpenAI-compatible endpoints (e.g. `https://api.openai.com/v1`).
- If using a local model (Ollama etc.), make sure the server is running before starting the runtime.

## Budget exceeded

**Symptoms:** Tasks rejected with a budget error.

- Increase `NINJA_SESSION_TOKEN_BUDGET` in `.env`, or remove the variable to disable the limit.

## Port already in use

**Symptoms:** `Error: listen EADDRINUSE :::3141`.

```bash
# Linux / macOS
lsof -ti:3141 | xargs kill

# Windows (PowerShell)
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3141).OwningProcess -Force
```

## WebSocket not connecting (Forge Console)

**Symptoms:** LiveTimeline shows "Disconnected"; no real-time events.

- Check `NEXT_PUBLIC_RUNTIME_WS_URL` in `apps/forge-console/.env.local`.
  Default: `ws://localhost:3141`. Must match the runtime port.
- Confirm the runtime is running (`GET http://localhost:3141/health` should return `{"status":"ok"}`).

## Tests failing after a fresh clone

```bash
pnpm install          # reinstall workspace deps
pnpm build            # build all packages (required before test)
pnpm vitest run       # run unit tests
```

## Checking logs

Runtime logs are printed to stdout as **structured JSON, one event per line** (JSONL). Each line:

```json
{"ts":"2026-09-07T20:00:00.000Z","level":"info","logger":"kage-runtime:access","msg":"GET /api/status 200","correlationId":"<uuid>","method":"GET","url":"/api/status","statusCode":200,"durationMs":1.24,"remoteAddress":"127.0.0.1"}
```

Mandatory fields: `ts` (ISO 8601) · `level` (`debug|info|warn|error`) · `logger` (module name) ·
`msg`. Errors add `err: { name, message, stack }`. HTTP requests log via
`kage-runtime:access` with `correlationId` (UUID per request — use it to trace a request across
log lines).

In an interactive terminal (TTY) logs render pretty instead; force JSON with
`NINJA_LOG_FORMAT=json` (or pretty with `NINJA_LOG_FORMAT=pretty`). Minimum level via
`LOG_LEVEL`.

Filter by level and follow one request:

```bash
pnpm runtime:dev 2>&1 | grep '"level":"error"'
pnpm runtime:dev 2>&1 | grep '"correlationId":"<uuid>"'
```
