import type { HealthResponse, RuntimeStatus, EngineRequest, EngineRun } from '@ninja/contracts';
import { RUNTIME_HEALTH_ENDPOINT, RUNTIME_URL } from './constants.js';
import { spawn, type ChildProcess } from 'child_process';
import { createLogger } from '@ninja/logging';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const log = createLogger('dojo-cli:runtime-client');

function getRuntimeKey(): string | null {
  const keyPath = join(homedir(), '.ninja', 'runtime.key');
  if (!existsSync(keyPath)) return null;
  return readFileSync(keyPath, 'utf8').trim();
}

function authHeaders(): Record<string, string> {
  const key = getRuntimeKey();
  return key ? { 'X-Ninja-Key': key } : {};
}

/** Instancia del proceso del runtime si fue arrancado por este CLI */
let runtimeProcess: ChildProcess | null = null;

// ──────────────────────────────────────────────────────────────────────────────
// Health & Status
// ──────────────────────────────────────────────────────────────────────────────

export async function checkRuntimeHealth(): Promise<boolean> {
  try {
    const res = await fetch(RUNTIME_HEALTH_ENDPOINT, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as HealthResponse;
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function getRuntimeStatus(): Promise<RuntimeStatus | null> {
  try {
    const res = await fetch(`${RUNTIME_URL}/api/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as RuntimeStatus;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Engine Operations
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Envía una solicitud de ejecución al motor Kage.
 */
export async function submitEngineRequest(request: Partial<EngineRequest>): Promise<EngineRun | null> {
  try {
    const res = await fetch(`${RUNTIME_URL}/engine/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        ...request,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    return (await res.json()) as EngineRun;
  } catch (error) {
    log.error('Error al enviar solicitud al motor:', (error as Error).message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Start Runtime (subprocess)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Arranca el proceso `kage-runtime` como un subproceso hijo.
 * El Dojo CLI pasa a ser el "process manager" ligero del runtime.
 *
 * Estrategia de inicio:
 * 1. Si ya está corriendo (health OK) → no hace nada
 * 2. Spawns kage-runtime via pnpm filter
 * 3. Espera hasta 15s para que el healthcheck pase
 * 4. Retorna true si el runtime respondió, false si timeout
 */
export async function startRuntime(): Promise<boolean> {
  // Si ya está corriendo no arrancamos otro
  const alreadyRunning = await checkRuntimeHealth();
  if (alreadyRunning) {
    log.info('Runtime ya está corriendo — saltando start');
    return true;
  }

  log.info('Arrancando Kage Runtime como subproceso...');

  runtimeProcess = spawn(
    'pnpm',
    ['--filter', '@ninja/kage-runtime', 'run', 'dev'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: false,
    }
  );

  runtimeProcess.stdout?.on('data', (data: Buffer) => {
    log.debug(`[kage-runtime] ${data.toString().trim()}`);
  });

  runtimeProcess.stderr?.on('data', (data: Buffer) => {
    log.warn(`[kage-runtime:err] ${data.toString().trim()}`);
  });

  runtimeProcess.on('exit', (code) => {
    log.info(`Kage Runtime process exited with code ${code}`);
    runtimeProcess = null;
  });

  // Esperar a que el runtime responda al healthcheck (hasta 15s, polling 500ms)
  const MAX_WAIT_MS = 15_000;
  const POLL_MS = 500;
  let elapsed = 0;

  while (elapsed < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    elapsed += POLL_MS;
    const healthy = await checkRuntimeHealth();
    if (healthy) {
      log.info(`Runtime listo en ${elapsed}ms`);
      return true;
    }
  }

  log.error('Timeout: Runtime no respondió en 15s');
  return false;
}

/** Detener el subproceso del runtime si fue iniciado por este CLI */
export async function stopRuntime(): Promise<void> {
  if (!runtimeProcess) return;
  log.info('Enviando SIGTERM al proceso Kage Runtime...');
  runtimeProcess.kill('SIGTERM');
  runtimeProcess = null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Events (WebSocket info)
// ──────────────────────────────────────────────────────────────────────────────

export async function getRuntimeInfo(): Promise<any> {
  try {
    const res = await fetch(`${RUNTIME_URL}/bus/status`, {
      signal: AbortSignal.timeout(3000),
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Obtener corridas de engine activas */
export async function getActiveRuns(): Promise<any> {
  try {
    const res = await fetch(`${RUNTIME_URL}/engine/runs`, {
      signal: AbortSignal.timeout(3000),
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Obtener artifacts del Trace Ledger via /api/artifacts */
export async function getArtifacts(limit = 10): Promise<any[]> {
  try {
    const res = await fetch(`${RUNTIME_URL}/api/artifacts?limit=${limit}`, {
      signal: AbortSignal.timeout(3000),
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.artifacts ?? []);
  } catch {
    return [];
  }
}
