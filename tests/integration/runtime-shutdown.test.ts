import { describe, it, expect, afterAll, vi } from 'vitest';
import { eventBus } from '@ninja/events';
import type { NinjaEvent } from '@ninja/contracts';

// bootstrap() → parseEnv(process.env) requiere LLM_* (ADR-0004). Stub determinista
// antes del import dinámico de lifecycle.js (mismo patrón que runtime-lifecycle.test.ts).
vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');
vi.stubEnv('NINJA_AUTH_DISABLED', 'true');

const shutdownEvents: NinjaEvent[] = [];
const busSub = eventBus.on('*', (event: NinjaEvent) => {
  if (event.type === 'runtime.stopping' || event.type === 'runtime.stopped') {
    shutdownEvents.push(event);
  }
});

describe('Runtime shutdown graceful con timeout (F1.6)', () => {
  let port = 0;
  let host = 'localhost';

  afterAll(async () => {
    // La instancia de lifecycle.ts de ESTE archivo ya fue apagada en el test.
    // Restaurar el bus para no contaminar otros archivos (vitest aísla módulos por archivo).
    busSub.unsubscribe();
    eventBus.clear();
  });

  it('shutdown cierra HTTP+WS, emite stopping→stopped y resuelve antes del timeout', async () => {
    const { bootstrap, shutdown } = await import('../../apps/kage-runtime/src/lifecycle.js');

    // 1. Arrancar runtime propio (puerto efímero, módulos aislados por archivo de test)
    const started = await bootstrap({ port: 0 });
    port = started.port;
    host = started.host;
    expect(port).toBeGreaterThan(0);

    // 2. Abrir conexión WS REAL autenticada y dejarla abierta — la condición que
    //    históricamente colgaba server.close() y motivó el skip original.
    //    (NINJA_AUTH_DISABLED=true → subscribe inmediato sin handshake de auth)
    const ws = new WebSocket(`ws://${host}:${port}/ws/events`);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('WS connect failed')), { once: true });
    });
    const firstMessage = await new Promise<string>((resolve) => {
      ws.addEventListener('message', (ev) => resolve(String(ev.data)), { once: true });
    });
    // Con auth deshabilitada el runtime suscribe sin handshake; el primer mensaje es un evento del bus
    void firstMessage;
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // 3. Shutdown con assertion de timeout: debe resolver ANTES de SHUTDOWN_TIMEOUT_MS (10s)
    const SHUTDOWN_TIMEOUT_MS = 10_000;
    const t0 = Date.now();
    await shutdown();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(SHUTDOWN_TIMEOUT_MS);

    // 4. Post-assert: el puerto ya no acepta conexiones HTTP
    let healthFailed = false;
    try {
      await fetch(`http://${host}:${port}/health`);
    } catch {
      healthFailed = true;
    }
    expect(healthFailed).toBe(true);

    // 5. WS quedó cerrado por el shutdown (Fastify cierra conexiones abiertas)
    //    Listo después del close: el estado puede ser CLOSING(2) o CLOSED(3)
    expect([WebSocket.CLOSING, WebSocket.CLOSED]).toContain(ws.readyState);

    // 6. Orden de eventos: exactamente 1 stopping → 1 stopped, en orden
    const types = shutdownEvents.map((e) => e.type);
    expect(types).toEqual(['runtime.stopping', 'runtime.stopped']);
  }, 20_000);
});
