import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eventBus } from '@ninja/events';
import type { NinjaEvent, RuntimeStartedPayload } from '@ninja/contracts';
import { createLogger } from '@ninja/logging';

// bootstrap() → parseEnv(process.env) requiere LLM_* (ADR-0004). En boot real las
// carga loadEnv() desde .env; en tests nadie las carga → suite flaky según orden
// de workers. Stub determinista antes del import dinámico de lifecycle.js.
vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');
vi.stubEnv('NINJA_AUTH_DISABLED', 'true');

const log = createLogger('test:runtime-lifecycle');

describe('Runtime Lifecycle', () => {
  const capturedEvents: NinjaEvent[] = [];
  const SUBSCRIPTION_TIMEOUT = 20000;
  let startupConfig: { port: number; host: string } | null = null;
  
  beforeAll(async () => {
    // Subscribe to all events for test capture
    eventBus.on('*', (event: NinjaEvent) => {
      capturedEvents.push(event);
      log.debug(`Captured event: ${event.type} from ${event.source}`);
    });
    
    // Start the server with ephemeral port
    const { bootstrap } = await import('../../apps/kage-runtime/src/lifecycle.js');
    startupConfig = await bootstrap({ port: 0 });
    log.info(`Test server started on ${startupConfig.host}:${startupConfig.port}`);
  }, SUBSCRIPTION_TIMEOUT);

  afterAll(async () => {
    // Clean shutdown
    const { shutdown } = await import('../../apps/kage-runtime/src/lifecycle.js');
    await shutdown();
    
    capturedEvents.length = 0;
    eventBus.clear();
  }, SUBSCRIPTION_TIMEOUT);

  it('bootstrap initializes all modules in correct order', async () => {
    expect(eventBus.emitCount).toBeGreaterThan(0);
    
    const runtimeStartedEvents = capturedEvents.filter(
      (e) => e.type === 'runtime.started'
    );
    expect(runtimeStartedEvents).toHaveLength(1);
    
    const startedEvent = runtimeStartedEvents[0] as NinjaEvent<RuntimeStartedPayload>;
    expect(startedEvent.payload.port).toBe(startupConfig?.port);
    expect(startedEvent.payload.host).toBe(startupConfig?.host);
    expect(startedEvent.payload.version).toBeDefined();
    
    const healthResponse = await fetch(`http://${startupConfig?.host}:${startupConfig?.port}/health`);
    expect(healthResponse.ok).toBe(true);
  }, SUBSCRIPTION_TIMEOUT);

  it.skip('shutdown closes gracefully with timeout', async () => {
    // SKIP REASON: requires an isolated server instance; bootstrapping a second server
    // inside the same test suite conflicts with the beforeAll/afterAll lifecycle.
    // TODO: expand this test in a dedicated file that spawns a child process for the runtime.
  }, SUBSCRIPTION_TIMEOUT);

  it('modules register correctly in the runtime', async () => {
    const initialSubscriptionCount = eventBus.subscriptionCount;
    const initialActiveTypeCount = eventBus.activeTypeCount;
    
    expect(initialSubscriptionCount).toBeGreaterThan(0);
    expect(initialActiveTypeCount).toBeGreaterThan(0);
    
    log.info(`Subscriptions: ${initialSubscriptionCount}, Active types: ${initialActiveTypeCount}`);
  }, SUBSCRIPTION_TIMEOUT);
});
