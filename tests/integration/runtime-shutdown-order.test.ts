/**
 * Test integración shutdown ordenado (WP-C4a / F2.4).
 *
 * Patrón del runtime-shutdown.test.ts existente (F1.6): stubEnv + import dinámico
 * de lifecycle.js + boot real con puerto efímero. Aquí verificamos:
 * 1. shutdown() ejecuta los steps del registry EN ORDEN (failover → pulse → auditor
 *    → engram → sqlite-db última) y los retorna.
 * 2. runtime.stopping se emite antes de cualquier step y runtime.stopped al final.
 * 3. Cada step queda logueado (log estructurado "Shutdown step ok: <name>").
 * 4. DB cerrada limpia: sin WAL huérfano (checkpoint al cerrar la última conexión).
 */
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { eventBus } from '@ninja/events';
import type { NinjaEvent } from '@ninja/contracts';

vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');
vi.stubEnv('NINJA_AUTH_DISABLED', 'true');

const sequence: string[] = [];
let sawStopping = false;
let sawStopped = false;

const busSub = eventBus.on('*', (event: NinjaEvent) => {
  if (event.type === 'runtime.stopping') {
    sawStopping = true;
    sequence.push('event:runtime.stopping');
  } else if (event.type === 'runtime.stopped') {
    sawStopped = true;
    sequence.push('event:runtime.stopped');
  } else if (event.type === 'health.ready.changed') {
    // Primer request de readiness marca transición; no aporta al orden de cierre.
    return;
  }
});

// Spy de logs ANTES del boot: createLogger escribe vía console.* (sync)
const logLines: string[] = [];
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

describe('Runtime shutdown ordenado con registry (WP-C4a / F2.4)', () => {
  beforeAll(() => {
    const capture = (...args: unknown[]) => {
      logLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    console.log = capture;
    console.warn = capture;
    console.error = capture;
  });

  afterAll(async () => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    busSub.unsubscribe();
    eventBus.clear();
  });

  it('shutdown ejecuta steps en orden, evento stopping→stopped envolvente, DB sin WAL huérfano', async () => {
    const { bootstrap, shutdown } = await import('../../apps/kage-runtime/src/lifecycle.js');
    const { getShutdownSteps } = await import('../../apps/kage-runtime/src/shutdown-registry.js');

    // 1. Boot real (puerto efímero) — server.ts registra los 5 steps
    await bootstrap({ port: 0 });

    const registered = getShutdownSteps().map((s) => s.name);
    expect(registered).toEqual([
      'failover-manager',
      'pulse-monitor',
      'sentinel-auditor',
      'engram-warm-memory',
      'sqlite-db',
    ]);

    // 2. Shutdown con assertion de timeout total
    const SHUTDOWN_TIMEOUT_MS = 10_000;
    const t0 = Date.now();
    const executed = await shutdown();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(SHUTDOWN_TIMEOUT_MS);

    // 3. Pasos ejecutados exactamente en orden de registro
    expect(executed).toEqual(registered);

    // 4. runtime.stopping ANTES de todos los steps, runtime.stopped DESPUÉS de todos
    expect(sawStopping).toBe(true);
    expect(sawStopped).toBe(true);
    const stoppingIdx = sequence.indexOf('event:runtime.stopping');
    const stoppedIdx = sequence.indexOf('event:runtime.stopped');
    expect(stoppingIdx).toBe(0);
    expect(stoppedIdx).toBe(sequence.length - 1);

    // 5. Cada step logueado en orden ("Shutdown step ok: <name>")
    const stepLogIdx = executed.map((name) =>
      logLines.findIndex((line) => line.includes(`Shutdown step ok: ${name}`))
    );
    expect(stepLogIdx.every((i) => i >= 0)).toBe(true);
    expect([...stepLogIdx].sort((a, b) => a - b)).toEqual(stepLogIdx);

    // 6. La DB quedó cerrada: el step de DB fue el último ejecutado
    expect(executed[executed.length - 1]).toBe('sqlite-db');
  }, 20_000);

  it('la DB del runtime (ninja.db global) no queda con WAL huérfano tras el shutdown', async () => {
    // Tras el shutdown del test anterior, la conexión SQLite global fue cerrada
    // por el step 'sqlite-db' (closeDb → checkpoint implícito de última conexión).
    // Verificamos que la abrimos fresca sin recovery mode y que __migrations está íntegra.
    const { initDb } = await import('@ninja/storage');
    const { getNinjaGlobalDir } = await import('@ninja/config');
    const path = await import('path');
    const fs = await import('fs');

    const dbPath = path.join(getNinjaGlobalDir(), 'ninja.db');
    const db = initDb(dbPath);
    try {
      // La tabla de migraciones existe y está íntegra (6 migraciones aplicadas)
      const rows = db.prepare('SELECT id FROM __migrations ORDER BY id').all() as { id: number }[];
      expect(rows.length).toBeGreaterThanOrEqual(6);
      // WAL checkpointed: el archivo -wal está ausente o vacío tras cerrar la última conexión
      const walPath = `${dbPath}-wal`;
      if (fs.existsSync(walPath)) {
        expect(fs.statSync(walPath).size).toBe(0);
      }
    } finally {
      db.close();
    }
  });
});
