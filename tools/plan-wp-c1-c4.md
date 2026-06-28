# Plan WP-C1 → WP-C4 — EPIC C · Resiliencia & Error Handling

> **Branch base**: `fix/epic-b-foundations` (continuar) o nueva `feat/epic-c-resilience`
> **Estimación total**: **18–22h** (auditoría confirma rango)
> **Política**: TDD estricto · ADR cuando hay decisión arquitectónica · dossier por WP · gate de cierre EPIC C · CHANGELOG por breaking change
> **Source of truth**: `tools/plan-mejoras-CONSOLIDADO-MASTER.md` §FASE C · ítems 2.1–2.12, 5.7, 7.5

---

## Context

Tras cerrar EPIC B al 100% (correctitud + seguridad P0, 666 tests verdes), el sistema queda **seguro pero frágil**: cualquier fallo transitorio (red, LLM 503, Engram caído) propaga como error 500 y rompe el flow. EPIC C instala la capa de **resiliencia operacional** — circuit breakers, retry/backoff, graceful degradation y persistencia de telemetría — para que el runtime tolere fallos sin caerse.

**Outcome objetivo (DoD del plan maestro)**:
- 3 servicios caídos simultáneos (Engram + LightRAG + LLM provider) → app sigue funcional en modo degradado
- Reconexión WS automática con backoff exponencial
- Pulse + Audit sobreviven a `kill -9` (persistencia SQLite)
- Error handler global elimina ~200 líneas de try/catch boilerplate

---

## 0 · Auditoría previa (estado real verificado en código)

| WP | Spec dice | Estado real (verificado) | Trabajo restante |
|----|-----------|-------------------------|------------------|
| **C1** | Error handler global Fastify + not-found handler centralizado | 🔴 `setErrorHandler` no existe · 30 `try {` en server.ts · graceful shutdown parcial en `lifecycle.ts` | Centralizar errores + completar shutdown (~5h) |
| **C2** | Circuit Breaker + retry/backoff + timeouts jerárquicos en LLM client | 🟡 `retry.ts` tiene backoff+jitter (sin `Retry-After`) · `timeout.ts` simple AbortController · CircuitBreaker: 0 hits | Crear CircuitBreaker + extender retry + timeouts por capa (~6h) |
| **C3** | Graceful degradation + reconexión WS + health granular | 🔴 ws.ts dead code · ws-client.ts sin reconnect · `/health` trivial · LightRAG `_isAvailable` queda en false (sin auto-recovery) | WS reconnect + health granular + LightRAG auto-recovery (~5h) |
| **C4** | Graceful shutdown (SIGTERM) + persistir Pulse/Audit antes de exit | 🟡 SIGINT+SIGTERM ya hookeados · cierra Fastify + bus listeners · **NO cierra DB, Engram, Pulse intervals, Audit flush** | Completar shutdown + persistir Pulse/Audit a SQLite (~4h) |

**Esfuerzo real**: **~18–20h**. Más cerca del piso del rango por la base ya construida.

### Hallazgos críticos del audit

1. **`retry.ts` está sólido**: exponential backoff (`baseDelay * 2^attempt`), jitter `Math.random()*100`, retryOn `[429,503,502,504,408]`, retryOnErrorTypes `['NinjaTimeoutError','AbortError']`. **Falta**: parsing de `Retry-After` header (RFC 7231).
2. **`timeout.ts` es trivial** (22 líneas) — perfecto, no hay que tocarlo. Solo wire-in con timeouts jerárquicos.
3. **`lifecycle.ts:132-178` ya tiene shutdown graceful con timeout de 10s + force-exit**, pero NO cierra: DB (better-sqlite3), Engram client, Pulse intervals, Audit flush. SIGINT+SIGTERM duplican lógica.
4. **`ws.ts` es código muerto** (0 imports). Borrar limpia 92 líneas.
5. **`ws-client.ts:65-73`**: `socket.onclose` sólo setea `connected: false`, sin reconexión. Sin cola de mensajes.
6. **`PulseMonitor` + `Auditor` 100% in-memory** (Map<id, X> y `auditLog: AuditEntry[]`). Crash → telemetría perdida.
7. **`lightrag-client.ts:172,192`**: `_isAvailable = false` se setea on error pero solo se vuelve `true` cuando `checkHealth()` es llamado explícitamente — sin re-check periódico.
8. **Storage tiene migrations framework** (numbered, con `__migrations` tracking), 6 tablas existentes. **Falta**: `pulse_metrics`, `audit_log`.

---

## 1 · Orden de ejecución

```
DÍA 1   ──── C1: Error handler global ────────             [~5h]
DÍA 2   ──── C2: Resilience primitives ──────             [~6h]
DÍA 3   ──── C3: WS reconnect + Health granular ──        [~5h]
DÍA 4   ──── C4: Shutdown completo + Pulse/Audit persist  [~4h]
DÍA 4+  ──── Gate final EPIC C + PR ──                    [~1h]
```

**Razones del orden**:
- **C1 primero**: instala `setErrorHandler` que los siguientes WPs aprovechan (errores de CircuitBreaker/retry/Pulse persistence van por el handler global)
- **C2 antes que C3**: la WS reconnection (C3) usa el mismo patrón de backoff que C2 — reutilizamos código
- **C3 antes que C4**: el health granular (C3) es lo que C4 consulta antes del shutdown para flushear sólo lo necesario
- **C4 al final**: la persistencia de Pulse/Audit (C4) requiere las migrations (C3) y el shutdown debe llamar al `flush()` añadido

---

## 2 · WP-C1 · Fastify Error Handler global + empty catch fix · 5h

### Especificación técnica

#### 2.1 — `apps/kage-runtime/src/error-handler.ts` (nuevo)

```ts
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { NinjaError, isNinjaError } from '@ninja/contracts';
import { createLogger } from '@ninja/logging';
import { sanitizeError } from './sanitize-error.js';

const log = createLogger('kage-runtime:error-handler');

export function registerErrorHandlers(
  server: FastifyInstance,
  env: 'production' | 'development' | 'test'
): void {
  server.setErrorHandler(async (err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    // 1. ZodError → 400 con issues
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        issues: err.issues,
      });
    }

    // 2. NinjaError → usar httpStatus + sanitizeError
    if (isNinjaError(err)) {
      log.warn({ code: err.code, domain: err.domain, url: req.url }, err.message);
      return reply.status(err.httpStatus ?? 500).send(sanitizeError(err, env));
    }

    // 3. Fastify validation errors (schema-level)
    if (err.validation) {
      return reply.status(400).send({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        issues: err.validation,
      });
    }

    // 4. Error genérico → log + sanitize
    log.error({ err, url: req.url, method: req.method }, 'Unhandled error in request');
    return reply.status(500).send(sanitizeError(err, env));
  });

  server.setNotFoundHandler((req, reply) => {
    return reply.status(404).send({
      error: 'Not found',
      code: 'NOT_FOUND',
      path: req.url,
    });
  });
}
```

#### 2.2 — Wire en `server.ts` después de plugins/auth, antes de rutas

```ts
import { registerErrorHandlers } from './error-handler.js';
// ...
await server.register(websocketPlugin);
// auth hook
registerErrorHandlers(server, env.NODE_ENV);  // ← NEW
```

#### 2.3 — Migrar try/catch redundantes en server.ts

**Estrategia**: para cada `try { ... } catch (err) { reply.status(500).send(sanitizeError(...)) }`, eliminar el try/catch y dejar que el error se propague al handler global. Mantener try/catch solo cuando hay lógica específica en el catch (ej. logging contextual, evento de bus, fallback).

**Estimado**: ~15-20 try/catch eliminables → reducción ~150 líneas.

#### 2.4 — Empty catch blocks (DS plan: 6 ubicaciones)

```bash
rg "^\s*\} catch \([^)]+\) \{\s*$" packages/ apps/ -n
rg "} catch \{$" packages/ apps/ -n
```

Para cada hit: añadir al menos `log.debug({ err, context }, 'Reason for silent swallow')` o convertir en `log.warn`.

### Tests obligatorios

**Archivo**: `apps/kage-runtime/src/__tests__/error-handler.test.ts`

```ts
describe('Global error handler (WP-C1)', () => {
  it('ZodError → 400 con VALIDATION_ERROR + issues', async () => {});
  it('NinjaError(httpStatus=403) → respuesta 403 con código sanitizado', async () => {});
  it('Error genérico en producción → 500 INTERNAL_ERROR sin stack', async () => {});
  it('Error genérico en dev → 500 con message pero sin stack', async () => {});
  it('Ruta inexistente → 404 NOT_FOUND con path', async () => {});
  it('Error en rutas públicas (/health) también pasa por handler', async () => {});
});
```

### Riesgos y mitigación

- **Riesgo medio**: eliminar try/catch que tenían side-effects (logging, eventos) silenciosamente.
- **Mitigación**: hacer migrate **incremental**, un endpoint a la vez, con test E2E que valide el shape de respuesta.

### Commits esperados

```
test(kage-runtime): global error handler 6 scenarios (red→green, WP-C1)
feat(kage-runtime): error-handler.ts con setErrorHandler + setNotFoundHandler
refactor(kage-runtime): remove redundant try/catch in /api/* routes (WP-C1)
fix(*): log empty catch blocks instead of silent swallow (WP-C1)
docs(adr): 0009 centralized error handling contract
docs(verifications): wp-c1 closure dossier
```

### Criterios de aceptación

- [ ] 6 tests verdes
- [ ] `setErrorHandler` + `setNotFoundHandler` registrados
- [ ] `grep -c "try {" apps/kage-runtime/src/server.ts` ≤ 15 (vs 30 actual)
- [ ] 0 empty catch blocks sin logging (`rg "} catch [^{]+\{ ?\}"`)
- [ ] ADR-0009 committed
- [ ] Dossier con before/after counts

---

## 3 · WP-C2 · Circuit Breaker + Retry mejorado + Timeouts jerárquicos · 6h

### Especificación técnica

#### 3.1 — `packages/common-utils/src/circuit-breaker.ts` (nuevo)

> **Decisión arquitectónica**: ubicar en `@ninja/common-utils` para que LLM, Engram, LightRAG, HTTP puedan consumirlo sin acoplarse a un package específico. Esto adelanta el ítem 5.3 del plan consolidado (implementar common-utils).

```ts
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold: number;      // # failures before OPEN (default 5)
  resetTimeoutMs: number;        // ms en OPEN antes de HALF_OPEN (default 30000)
  successThreshold: number;      // # successes en HALF_OPEN para volver a CLOSED (default 2)
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptAt = 0;

  constructor(private readonly name: string, private readonly opts: CircuitBreakerOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptAt) {
        throw new CircuitOpenError(this.name, this.nextAttemptAt);
      }
      this.transitionTo('HALF_OPEN');
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void { /* ... */ }
  private onFailure(): void { /* ... */ }
  private transitionTo(next: CircuitState): void { /* ... emit event + onStateChange */ }
  getState(): CircuitState { return this.state; }
}

export class CircuitOpenError extends Error {
  constructor(public readonly circuitName: string, public readonly retryAt: number) {
    super(`Circuit ${circuitName} is OPEN; retry after ${new Date(retryAt).toISOString()}`);
    this.name = 'CircuitOpenError';
  }
}
```

**Error code nuevo en contracts**: `CIRCUIT_OPEN` con `httpStatus: 503`, `retryable: true`.

#### 3.2 — Wire CircuitBreaker en LLM client + Engram + LightRAG

Cada cliente tiene su propio breaker singleton:

```ts
// packages/integrations-llm/src/client.ts
const llmBreaker = new CircuitBreaker('llm', {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  successThreshold: 2,
  onStateChange: (from, to) => {
    eventBus.emit(createEvent('circuit.state.changed', 'integrations-llm', { circuit: 'llm', from, to }));
  },
});

// Wrap LLM call
return llmBreaker.execute(() => this.rawComplete(req));
```

Igual pattern en `engram-client.ts` y `lightrag-client.ts`.

#### 3.3 — Retry mejorado: respetar `Retry-After`

Extender `packages/integrations-http/src/retry.ts`:

```ts
function getRetryAfterDelay(err: Error): number | null {
  // NinjaHttpError tiene headers? Si no, parsear de err.message o data
  if ('data' in err && typeof err.data === 'object' && err.data !== null) {
    const retryAfter = (err.data as any).retryAfter ?? (err.data as any)['retry-after'];
    if (typeof retryAfter === 'string') {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds * 1000;
    }
  }
  return null;
}

// En withRetry:
const delay = getRetryAfterDelay(lastError) ?? calculateDelay(attempt, finalConfig);
```

**Mejora del jitter**: cambiar `Math.random() * 100` a `Math.random() * exponentialDelay * 0.1` (jitter proporcional al delay, "full jitter" pattern de AWS).

#### 3.4 — Timeouts jerárquicos

Crear `packages/common-utils/src/timeouts.ts`:

```ts
export const DEFAULT_TIMEOUTS = {
  fs: 5_000,
  engram: 10_000,
  lightrag: 15_000,
  http: 30_000,
  llm: 90_000,
  llmReasoning: 180_000,  // for reasoning models like o1
} as const;

export type TimeoutCategory = keyof typeof DEFAULT_TIMEOUTS;

export function getTimeout(category: TimeoutCategory, override?: number): number {
  const envKey = `NINJA_TIMEOUT_${category.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return override ?? DEFAULT_TIMEOUTS[category];
}
```

Cada integration consume `getTimeout('llm')`, `getTimeout('engram')`, etc. Override en runtime vía env.

### Tests obligatorios

**Archivo**: `packages/common-utils/src/circuit-breaker.test.ts`

```ts
describe('CircuitBreaker (WP-C2)', () => {
  it('CLOSED → ejecuta normalmente', async () => {});
  it('5 failures consecutivos → transición a OPEN', async () => {});
  it('OPEN → rechaza con CircuitOpenError sin invocar fn', async () => {});
  it('OPEN → HALF_OPEN tras resetTimeoutMs', async () => {});
  it('HALF_OPEN + 2 successes → CLOSED', async () => {});
  it('HALF_OPEN + 1 failure → vuelve a OPEN', async () => {});
  it('onStateChange callback invocado en cada transición', async () => {});
});
```

**Archivo**: `packages/integrations-http/src/retry.test.ts` (nuevo o extender)

```ts
describe('withRetry — Retry-After (WP-C2)', () => {
  it('respeta Retry-After de 429 en lugar de backoff exponencial', async () => {});
  it('jitter proporcional al delay (full jitter)', async () => {});
  it('4xx no retryable → no retry, throw inmediato', async () => {});
});
```

### Riesgo y mitigación

- **Medio**: CircuitBreaker singleton acopla state global por proceso. Tests deben resetearlo.
- **Mitigación**: exponer `breaker.reset()` para tests; estado por package (no compartido).

### Commits esperados

```
test(common-utils): CircuitBreaker 7 scenarios (red→green, WP-C2)
feat(common-utils): CircuitBreaker + CircuitOpenError + timeouts catalog
feat(contracts): CIRCUIT_OPEN error code
test(integrations-http): retry honors Retry-After + full jitter (WP-C2)
feat(integrations-http): retry parses Retry-After, jitter proporcional
feat(integrations-llm): wrap calls in CircuitBreaker
feat(integrations-engram): wrap calls in CircuitBreaker
feat(integrations-lightrag): wrap calls in CircuitBreaker
docs(adr): 0010 circuit breaker pattern + timeouts jerárquicos
docs(verifications): wp-c2 dossier
```

### Criterios de aceptación

- [ ] CircuitBreaker tests 7/7 verdes
- [ ] retry.test.ts +3 tests verdes (Retry-After, jitter)
- [ ] `CIRCUIT_OPEN` en `errors:check`
- [ ] LLM, Engram, LightRAG envueltos en breakers
- [ ] `NINJA_TIMEOUT_LLM=120000` override funcional (test E2E)
- [ ] ADR-0010 committed

---

## 4 · WP-C3 · WS reconnect + Health granular + LightRAG auto-recovery · 5h

### Especificación técnica

#### 4.1 — Eliminar `ws.ts` dead code

```bash
# Verificación previa
rg "from.*ws\.js|from.*lib/ws['\"]|from.*'\\./ws['\"]" apps/forge-console/
# Esperado: 0 hits → seguro borrar
```

Borrar `apps/forge-console/lib/ws.ts` (92 líneas). Comentar en commit.

#### 4.2 — WS reconnection en `ws-client.ts`

```ts
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(url: string, connect: (url: string) => void): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    set({ connected: false, reconnecting: false });
    return;
  }
  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts) + Math.random() * 1000,
    RECONNECT_MAX_MS
  );
  reconnectAttempts++;
  set({ reconnecting: true, nextReconnectAt: Date.now() + delay });
  reconnectTimer = setTimeout(() => connect(url), delay);
}

socket.onclose = (event) => {
  set({ connected: false, socket: null });
  // No reconectar si fue cierre intencional (code 1000) o auth fallida (1008)
  if (event.code !== 1000 && event.code !== 1008) {
    scheduleReconnect(url, get().connect);
  }
};
```

Añadir al state: `reconnecting: boolean`, `nextReconnectAt: number | null`, `disconnect()` debe llamar a `clearTimeout(reconnectTimer)` y resetear `reconnectAttempts = 0`.

#### 4.3 — Health granular

Nuevo archivo `apps/kage-runtime/src/routes/health.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { engramClient } from '@ninja/integrations-engram';
import { LightRAGClient } from '@ninja/integrations-lightrag';

type ComponentStatus = 'ok' | 'degraded' | 'down';

interface ComponentHealth {
  name: string;
  status: ComponentStatus;
  latencyMs?: number;
  message?: string;
}

interface HealthDetail {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  components: ComponentHealth[];
}

export function registerHealthRoutes(server: FastifyInstance, deps: { ... }): void {
  server.get('/api/health/detailed', async (_req, _reply): Promise<HealthDetail> => {
    const checks = await Promise.all([
      checkDb(deps.db),
      checkLLM(deps.llmRegistry),
      checkEngram(),
      checkLightRAG(deps.lightragClient),
      checkVault(deps.vaultCoordinator),
    ]);
    const overall = checks.some(c => c.status === 'down') ? 'unhealthy'
                  : checks.some(c => c.status === 'degraded') ? 'degraded' : 'ok';
    return { status: overall, timestamp: new Date().toISOString(), components: checks };
  });

  // Endpoints individuales para WS subscribers / dashboards
  server.get('/api/health/db', async () => checkDb(deps.db));
  server.get('/api/health/llm', async () => checkLLM(deps.llmRegistry));
  server.get('/api/health/engram', async () => checkEngram());
  server.get('/api/health/lightrag', async () => checkLightRAG(deps.lightragClient));
  server.get('/api/health/pulse', async () => deps.pulseMonitor.getOverallHealth());
}
```

Cada `checkX()` mide latencia + status (`ok` si responde, `degraded` si responde >umbral, `down` si falla).

Las rutas `/api/health/*` son **públicas** (añadir a `PUBLIC_PATHS` en server.ts).

#### 4.4 — LightRAG auto-recovery

Modificar `packages/integrations-lightrag/src/lightrag-client.ts`:

```ts
private recoveryInterval: ReturnType<typeof setInterval> | null = null;

constructor(opts) {
  // ...
  this.startAutoRecovery();
}

private startAutoRecovery(): void {
  this.recoveryInterval = setInterval(() => {
    if (!this._isAvailable) {
      this.checkHealth().catch(() => { /* silently retry */ });
    }
  }, 30_000);
  this.recoveryInterval.unref?.();  // no bloquear shutdown
}

stop(): void {
  if (this.recoveryInterval) clearInterval(this.recoveryInterval);
}
```

Llamar `lightragClient.stop()` en `lifecycle.ts shutdown()` (WP-C4).

### Tests obligatorios

```ts
describe('ws-client reconnection (WP-C3)', () => {
  it('onclose code≠1000 → schedule reconnect con backoff', () => {});
  it('reconexión exitosa resetea attempts a 0', () => {});
  it('10 attempts fallidos → stop reconnecting + emit error', () => {});
  it('disconnect() limpia timer y cancela reconnect', () => {});
  it('cierre intencional (code 1000) NO reconnecta', () => {});
  it('auth failure (code 1008) NO reconnecta', () => {});
});

describe('Health granular (WP-C3)', () => {
  it('/api/health/detailed retorna 5 componentes', async () => {});
  it('si engram caído → status degraded', async () => {});
  it('si DB inaccesible → status unhealthy', async () => {});
  it('latencyMs medida correctamente', async () => {});
  it('/api/health/* públicos (sin X-Ninja-Key)', async () => {});
});

describe('LightRAG auto-recovery (WP-C3)', () => {
  it('failure → _isAvailable=false', async () => {});
  it('retry tras 30s + health OK → _isAvailable=true', async () => {});
  it('stop() limpia interval', async () => {});
});
```

### Commits esperados

```
chore(forge-console): delete dead ws.ts (0 imports verified, WP-C3)
test(forge-console): ws-client reconnect 6 scenarios (red→green)
feat(forge-console): exponential backoff reconnect + intentional-close detection
test(kage-runtime): health granular 5 scenarios
feat(kage-runtime): /api/health/detailed + per-component endpoints
feat(integrations-lightrag): auto-recovery cada 30s + stop() para shutdown
docs(verifications): wp-c3 dossier
```

### Criterios de aceptación

- [ ] `apps/forge-console/lib/ws.ts` no existe
- [ ] 6 + 5 + 3 = 14 tests verdes
- [ ] `/api/health/detailed` retorna shape `{status, timestamp, components[]}`
- [ ] Componentes evaluados: db, llm, engram, lightrag, vault, pulse
- [ ] LightRAG re-checkea cada 30s
- [ ] WS reconecta con backoff y máx 10 attempts

---

## 5 · WP-C4 · Shutdown completo + persistir Pulse/Audit a SQLite · 4h

### Especificación técnica

#### 5.1 — Migrations nuevas en `packages/workbench/src/migrations/`

Agregar a `WORKSPACE_MIGRATIONS`:

```ts
{
  id: 7,
  name: 'pulse_metrics',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pulse_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agentId TEXT,
        sessionId TEXT,
        type TEXT NOT NULL,        -- 'latency' | 'stability' | 'context_efficiency'
        value REAL NOT NULL,
        metadata TEXT,             -- JSON
        recordedAt TEXT NOT NULL
      );
      CREATE INDEX idx_pulse_session ON pulse_metrics(sessionId, recordedAt);
      CREATE INDEX idx_pulse_type ON pulse_metrics(type, recordedAt);
    `);
  },
},
{
  id: 8,
  name: 'audit_log',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eventType TEXT NOT NULL,
        actorAgentId TEXT,
        targetId TEXT,
        action TEXT NOT NULL,
        outcome TEXT NOT NULL,     -- 'allowed' | 'denied' | 'pending'
        reason TEXT,
        metadata TEXT,             -- JSON
        createdAt TEXT NOT NULL
      );
      CREATE INDEX idx_audit_event ON audit_log(eventType, createdAt);
      CREATE INDEX idx_audit_actor ON audit_log(actorAgentId, createdAt);
    `);
  },
}
```

#### 5.2 — Repos en `packages/trace-ledger`

```ts
// packages/trace-ledger/src/pulse-metric-repository.ts
export class PulseMetricRepository {
  constructor(private db: Database) {}
  insert(metric: PulseMetricInput): PulseMetric { /* prepared INSERT */ }
  insertBatch(metrics: PulseMetricInput[]): void { /* tx + insert */ }
  query(opts: { type?, sessionId?, since?, limit? }): PulseMetric[] { /* SELECT */ }
}

// packages/trace-ledger/src/audit-log-repository.ts
export class AuditLogRepository {
  constructor(private db: Database) {}
  insert(entry: AuditEntryInput): AuditLogRecord { /* */ }
  insertBatch(entries: AuditEntryInput[]): void { /* tx + insert */ }
  query(opts: { eventType?, actorAgentId?, since?, limit? }): AuditLogRecord[] { /* */ }
}
```

#### 5.3 — Pulse + Audit con write-through

Modificar `PulseMonitor` y `Auditor` para aceptar repositorio opcional:

```ts
// packages/pulse-center/src/monitor.ts
constructor(eventBus, opts: { repository?: PulseMetricRepository, ... }) {
  this.repo = opts.repository;
}

// En cada handler que registra métrica:
private handleAgentLLMCalled(event): void {
  const measurement = { ... };
  this.latencyMeasurements.push(measurement);   // in-memory (rápido para queries)
  this.repo?.insert({                            // write-through a SQLite
    type: 'latency',
    sessionId: measurement.sessionId,
    agentId: measurement.agentId,
    value: measurement.latencyMs,
    metadata: JSON.stringify({ model: measurement.model }),
    recordedAt: new Date().toISOString(),
  });
}

// Método para shutdown
async flush(): Promise<void> {
  // batch insert de mediciones in-memory no persistidas (defensa en profundidad)
}
```

Mismo patrón en `Auditor` con `AuditLogRepository`.

#### 5.4 — Shutdown completo en `lifecycle.ts`

```ts
export async function shutdown(): Promise<void> {
  log.info('Initiating graceful shutdown...');
  const forceExitTimer = setTimeout(() => { ... }, SHUTDOWN_TIMEOUT_MS);

  try {
    eventBus.emit(createEvent('runtime.stopping', RUNTIME_NAME, {}));

    // 1. Cerrar Fastify (deja de aceptar nuevas conexiones)
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }

    // 2. Flush telemetría in-memory → SQLite
    if (pulseMonitor) await pulseMonitor.flush();
    if (auditor) await auditor.flush();

    // 3. Stop intervals (LightRAG auto-recovery, model pinger)
    lightragClient?.stop?.();
    modelPinger?.stop?.();

    // 4. Cerrar Engram client
    engramClient?.close?.();

    // 5. Cerrar DB (better-sqlite3)
    if (db) db.close();

    // 6. Bus cleanup
    if (busCleanup) busCleanup.dispose();
    eventBus.emit(createEvent('runtime.stopped', RUNTIME_NAME, {}));
    eventBus.clear();

    clearTimeout(forceExitTimer);
    log.info('Kage Runtime stopped cleanly. ✓');
  } catch (err) {
    log.error('Error durante shutdown', err);
    clearTimeout(forceExitTimer);
    throw err;
  }
}
```

#### 5.5 — Unificar signal handlers en `index.ts`

```ts
const handleSignal = (signal: string) => async () => {
  log.info(`Received ${signal}. Initiating shutdown...`);
  try {
    await shutdown();
    process.exit(0);
  } catch {
    process.exit(1);
  }
};
process.on('SIGINT', handleSignal('SIGINT'));
process.on('SIGTERM', handleSignal('SIGTERM'));
process.on('SIGHUP', handleSignal('SIGHUP'));
```

### Tests obligatorios

```ts
describe('PulseMetricRepository (WP-C4)', () => {
  it('insert + query round-trip', () => {});
  it('batch insert dentro de transacción', () => {});
  it('query filtra por sessionId + since', () => {});
});

describe('AuditLogRepository (WP-C4)', () => {
  it('insert + query round-trip', () => {});
  it('query por eventType + actorAgentId', () => {});
});

describe('PulseMonitor con repo (WP-C4)', () => {
  it('agent.llm.called → in-memory + SQLite insert', async () => {});
  it('flush() persiste mediciones pendientes en batch', async () => {});
});

describe('Graceful shutdown completo (WP-C4)', () => {
  it('SIGTERM → cierra Fastify + DB + Engram + intervals en orden', async () => {});
  it('Pulse + Audit flusheados antes de DB close', async () => {});
  it('shutdown timeout >10s → process.exit(1)', async () => {});
  it('handleSignal funciona para SIGINT, SIGTERM, SIGHUP', async () => {});
});
```

### Riesgos y mitigación

- **Medio**: write-through síncrono podría agregar latencia en hot path. **Mitigación**: usar `db.prepare()` cacheado + `INSERT` simple (better-sqlite3 es sub-ms). Si métricas crecen mucho, mover a batch async cada 5s.
- **Bajo**: migración 7 y 8 sobre DB existente. **Mitigación**: backup antes (ya manejado por migrations framework con `__migrations` tracking).

### Commits esperados

```
feat(workbench): migrations 7-8 (pulse_metrics, audit_log)
feat(trace-ledger): PulseMetricRepository + AuditLogRepository (WP-C4)
test(trace-ledger): repo round-trip + batch insert (red→green)
feat(pulse-center): write-through to SQLite + flush() method
feat(sentinel): Auditor write-through + flush()
feat(kage-runtime): graceful shutdown completo (DB+Engram+Pulse+Audit+intervals)
refactor(kage-runtime): unify signal handlers (SIGINT/SIGTERM/SIGHUP)
docs(adr): 0011 telemetry persistence strategy
docs(verifications): wp-c4 dossier
```

### Criterios de aceptación

- [ ] Migrations 7-8 aplicadas correctamente
- [ ] PulseMetricRepository + AuditLogRepository con tests round-trip
- [ ] PulseMonitor + Auditor escriben a SQLite en cada evento
- [ ] `kill -9` cleanup: relanzar runtime → query SQL retorna métricas pre-crash
- [ ] Shutdown <10s en escenario normal
- [ ] SIGHUP también dispara shutdown limpio
- [ ] ADR-0011 committed

---

## 6 · Gate final EPIC C (post-WP-C4)

```bash
# Typecheck packages tocados
pnpm --filter @ninja/contracts \
     --filter @ninja/common-utils \
     --filter @ninja/integrations-http \
     --filter @ninja/integrations-llm \
     --filter @ninja/integrations-engram \
     --filter @ninja/integrations-lightrag \
     --filter @ninja/pulse-center \
     --filter @ninja/sentinel \
     --filter @ninja/trace-ledger \
     --filter @ninja/workbench \
     --filter @ninja/kage-runtime \
     --filter forge-console \
     typecheck

# Tests
pnpm vitest run packages/ apps/

# Errors check (deberían añadirse: CIRCUIT_OPEN, NOT_FOUND si no existe)
pnpm errors:check

# Greps de cierre
grep -c "try {" apps/kage-runtime/src/server.ts                # → ≤15 (vs 30)
grep "setErrorHandler" apps/kage-runtime/src/server.ts          # → 1+
ls apps/forge-console/lib/ws.ts 2>/dev/null | wc -l             # → 0 (deleted)
grep "scheduleReconnect\|reconnectAttempts" apps/forge-console/lib/ws-client.ts | wc -l  # → ≥3
grep "CircuitBreaker" packages/integrations-llm/src/             # → 1+
grep "_isAvailable" packages/integrations-lightrag/src/lightrag-client.ts | grep "recoveryInterval\|setInterval"  # → 1+

# Chaos test manual (validar DoD)
# 1. Apagar Ollama → LLM calls deben retornar fallback chain o CircuitOpen
# 2. kill -9 runtime mid-session → relanzar → /api/audit retorna entries pre-crash

# Commit count
git rev-list main..fix/epic-b-foundations --count   # ~110-120 commits
```

---

## 7 · Métricas de cierre EPIC C

| KPI | Baseline (post-EPIC B) | Meta tras EPIC C | Validación |
|-----|------------------------|------------------|------------|
| `try {` en server.ts | 30 | ≤15 | grep |
| `setErrorHandler` | 0 | 1 | grep |
| Empty catch blocks | ~6 (DS audit) | 0 sin log | rg |
| CircuitBreaker en LLM/Engram/LightRAG | 0 | 3 | grep |
| WS reconexión | ❌ | ✅ exponential backoff | test |
| Health granular endpoints | 1 (`/health`) | 6+ | rg |
| Pulse persistido a SQLite | ❌ in-memory | ✅ write-through | tabla `pulse_metrics` |
| Audit persistido a SQLite | ❌ in-memory | ✅ write-through | tabla `audit_log` |
| Graceful shutdown cierra DB+Engram+intervals | parcial | completo | review lifecycle.ts |
| LightRAG auto-recovery | ❌ | ✅ 30s | grep recoveryInterval |
| Tests totales | 666 | **≥720** | vitest |
| ADRs | 8 | **11** | docs/adr/ |
| Error codes | 18 | **20+** (+CIRCUIT_OPEN, +NOT_FOUND) | errors:check |

---

## 8 · ADRs nuevos

- **ADR-0009 · Centralized error handling contract** — Fastify setErrorHandler + setNotFoundHandler + jerarquía ZodError/NinjaError/genérico
- **ADR-0010 · Circuit Breaker pattern + timeouts jerárquicos** — CLOSED/OPEN/HALF_OPEN + categorías de timeout configurables vía env
- **ADR-0011 · Telemetry persistence strategy** — Pulse + Audit write-through a SQLite con flush en shutdown

---

## 9 · Dependencias nuevas

Ninguna. Todo se implementa con stdlib + utilidades nativas del monorepo.

---

## 10 · Riesgos transversales y mitigaciones

1. **Cambio de contrato de errores rompe clientes** → mantener shape `{error, code, issues?}` consistente con WP-B15. CHANGELOG si hay regresión.
2. **CircuitBreaker singleton acopla state global** → exponer `reset()` para tests; usar instancias por package en lugar de global.
3. **Write-through síncrono aumenta latencia** → benchmark antes y después; fallback a batch async si p99 sube >5%.
4. **WS reconnect infinito en falla persistente** → cap a 10 attempts + emit `ws.giveup` event.
5. **Migrations 7-8 sobre DB existente** → migrations framework hace backup implícito; rollback documentado.
6. **LightRAG auto-recovery genera ruido en logs si está abajo mucho tiempo** → log.debug en chequeos, log.info solo en transitions de estado.

---

## 11 · Después de EPIC C

Siguiente plan recomendado del consolidado: **EPIC D — Calidad de Código & Testing (~30–36h)**, con **R6: WP-D3 (suites para 16 packages sin tests) ANTES de D2 y F1-thresholds** para no romper CI.

Cómo pedirlo:
> "Crea plan enterprise para EPIC D — empezando por D3 (cobertura de tests) por R6"

---

## Critical files to be modified

### Created
- `apps/kage-runtime/src/error-handler.ts`
- `apps/kage-runtime/src/__tests__/error-handler.test.ts`
- `apps/kage-runtime/src/routes/health.ts`
- `packages/common-utils/src/circuit-breaker.ts`
- `packages/common-utils/src/circuit-breaker.test.ts`
- `packages/common-utils/src/timeouts.ts`
- `packages/integrations-http/src/retry.test.ts` (extender si existe)
- `packages/trace-ledger/src/pulse-metric-repository.ts`
- `packages/trace-ledger/src/audit-log-repository.ts`
- `docs/adr/0009-centralized-error-handling.md`
- `docs/adr/0010-circuit-breaker-timeouts.md`
- `docs/adr/0011-telemetry-persistence.md`
- `tools/verifications/wp-c1.md` to `wp-c4.md` (4 dossiers)

### Modified
- `apps/kage-runtime/src/server.ts` — wire registerErrorHandlers, eliminar try/catch redundantes
- `apps/kage-runtime/src/lifecycle.ts` — shutdown completo + flush Pulse/Audit
- `apps/kage-runtime/src/index.ts` — unificar signal handlers
- `apps/forge-console/lib/ws-client.ts` — scheduleReconnect + state reconnecting
- `packages/contracts/src/errors.ts` — añadir CIRCUIT_OPEN, NOT_FOUND
- `packages/integrations-http/src/retry.ts` — Retry-After parsing + full jitter
- `packages/integrations-llm/src/client.ts` — wrap en CircuitBreaker
- `packages/integrations-engram/src/engram-client.ts` — wrap en CircuitBreaker
- `packages/integrations-lightrag/src/lightrag-client.ts` — wrap + auto-recovery
- `packages/pulse-center/src/monitor.ts` — repo opcional + write-through + flush()
- `packages/sentinel/src/auditor.ts` — repo opcional + write-through + flush()
- `packages/workbench/src/migrations/workspace-migrations.ts` — migrations 7-8

### Deleted
- `apps/forge-console/lib/ws.ts` (dead code, 0 imports)

### Existing utilities to reuse
- `packages/integrations-http/src/retry.ts:20` `withRetry` — base sólida, solo extender
- `packages/integrations-http/src/timeout.ts:3` `withTimeout` — perfecto, no tocar
- `apps/kage-runtime/src/sanitize-error.ts` — el handler global lo invoca
- `apps/kage-runtime/src/lifecycle.ts:132` `shutdown` — extender, no reescribir
- `packages/storage/src/migrations.ts` — framework de migraciones, agregar entradas

---

## Verification (end-to-end)

```bash
# 1. Per-WP TDD: red → impl → green
pnpm vitest run packages/common-utils/src/circuit-breaker.test.ts          # WP-C2
pnpm vitest run apps/kage-runtime/src/__tests__/error-handler.test.ts      # WP-C1
pnpm vitest run apps/kage-runtime/src/__tests__/health.test.ts             # WP-C3
pnpm vitest run packages/trace-ledger/src/pulse-metric-repository.test.ts  # WP-C4

# 2. Typecheck recursivo
pnpm typecheck

# 3. Gate final EPIC C (después de C4)
pnpm vitest run packages/ apps/   # esperar ≥720 verdes
pnpm errors:check                  # CIRCUIT_OPEN y NOT_FOUND presentes

# 4. Chaos test manual (validar DoD del plan maestro)
# a) Iniciar runtime: pnpm runtime:dev
# b) Apagar Ollama
# c) Llamar /engine/submit → debe responder degraded, no 500
# d) GET /api/health/detailed → status: 'degraded', llm: 'down'
# e) Encender Ollama → esperar 30s → /api/health/llm vuelve a 'ok'

# 5. Crash recovery test
# a) Iniciar runtime + ejecutar 3 runs con LLM calls
# b) kill -9 <pid>
# c) Relanzar runtime
# d) sqlite3 ~/.ninja/ninja.db "SELECT COUNT(*) FROM pulse_metrics"  → >0
# e) sqlite3 ~/.ninja/ninja.db "SELECT COUNT(*) FROM audit_log"      → >0

# 6. WS reconnect test (Forge Console)
# a) Abrir Forge Console en http://localhost:3001
# b) Matar runtime con ctrl+c
# c) Observar UI: badge "reconnecting" con countdown
# d) Relanzar runtime
# e) UI debe reconectar dentro de 30s sin refresh manual
```

---

*Plan generado: 2026-06-28 · Senior-engineer style · Source: tools/plan-mejoras-CONSOLIDADO-MASTER.md §FASE C + audit en vivo del codebase post-EPIC B*
