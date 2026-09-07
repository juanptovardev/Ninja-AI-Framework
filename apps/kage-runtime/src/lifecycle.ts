import type { FastifyInstance } from 'fastify';
import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import { createServer } from './server.js';
import { DEFAULT_PORT, DEFAULT_HOST, RUNTIME_NAME, RUNTIME_VERSION } from './constants.js';
import { registerBusListeners } from './bus-listener.js';
import { getShutdownSteps, clearShutdownSteps } from './shutdown-registry.js';
import { createServer as createNetServer } from 'net';

const log = createLogger('kage-runtime:lifecycle');

/** Tiempo máximo (ms) de espera para cierre graceful */
const SHUTDOWN_TIMEOUT_MS = 10_000;

let serverInstance: FastifyInstance | null = null;
let busCleanup: { dispose(): void } | null = null;
let startupPort: number | null = null;
let startupHost: string | null = null;

// ──────────────────────────────────────────────────────────────────────────────
// Utilidades
// ──────────────────────────────────────────────────────────────────────────────

async function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => {
      probe.close();
      resolve(true);
    });
    probe.listen(port, host);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ──────────────────────────────────────────────────────────────────────────────

export async function bootstrap(
  opts: { port?: number; host?: string } = {}
): Promise<{ port: number; host: string }> {
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? DEFAULT_HOST;

  log.info(`Bootstrapping ${RUNTIME_NAME} v${RUNTIME_VERSION}...`);

  // Verificar disponibilidad del puerto antes de intentar bind
  // Skip check for ephemeral port (port === 0)
  if (port !== 0) {
    const isAvailable = await isPortAvailable(port, host);
    if (!isAvailable) {
      const errorMsg = `Port ${port} is not available on ${host}. ¿Hay otra instancia corriendo?`;
      log.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  // Iniciar servidor HTTP + WS + CORS
  serverInstance = await createServer();
  log.info('Server instance created successfully');

  // Registrar listeners del event bus
  busCleanup = registerBusListeners();
  log.info('Bus listeners registered');

  // Disparar pings de disponibilidad de modelos de forma asíncrona pero segura
  // IMPORTANTE: Se llama ANTES de que el engine comience a orquestar para preparar el Gateway
  import('@ninja/model-gateway')
    .then(({ modelPinger, ModelCatalog }) => {
      const mc = ModelCatalog.getInstance();
      modelPinger.pingOnStartup(mc).catch((err) => {
        log.warn('Failed to complete model pinger startup sequence', err);
      });
    })
    .catch((err) => {
      log.warn('Failed to dynamically import modelPinger', err);
    });

  try {
    await serverInstance.listen({ port, host });
    const actualAddress = serverInstance.server.address() as {
      address: string;
      port: number;
      family: string;
    };
    const actualPort = actualAddress.port;
    const actualHost = actualAddress.address === '::' ? 'localhost' : actualAddress.address;

    log.info(`Kage Runtime listening → http://${actualHost}:${actualPort}`);
    log.info(`WebSocket events     → ws://${actualHost}:${actualPort}/ws/events`);

    // Store startup config for later access
    startupPort = actualPort;
    startupHost = actualHost;

    // Verificar salud inmediata del servidor
    const healthUrl = `http://${actualHost}:${actualPort}/health`;
    const response = await fetch(healthUrl);
    if (!response.ok) {
      throw new Error(`Health check falló con status ${response.status}`);
    }
    log.info('Health check passed — runtime operativo');
  } catch (err) {
    log.error('Failed to start Kage Runtime', err);
    const errorPayload =
      err instanceof Error ? { message: err.message, stack: err.stack } : { message: String(err) };
    eventBus.emit(createEvent('runtime.error', RUNTIME_NAME, errorPayload));
    throw err;
  }

  // Emitir evento de arranque exitoso
  eventBus.emit(
    createEvent('runtime.started', RUNTIME_NAME, {
      port: startupPort ?? port,
      host: startupHost ?? host,
      version: RUNTIME_VERSION,
      wsEndpoint: `ws://${startupHost ?? host}:${startupPort ?? port}/ws/events`,
    })
  );

  log.info('Bootstrap completado exitosamente.');

  return { port: startupPort ?? port, host: startupHost ?? host };
}

// ──────────────────────────────────────────────────────────────────────────────
// Shutdown Graceful
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Cierre ordenado del runtime (WP-C4a / F2.4).
 *
 * Orden dictado por el plan:
 * 1. runtime.stopping (evento)
 * 2. WS/HTTP (server.close() — cierra también conexiones WS)
 * 3. Steps del Shutdown Registry en orden de registro:
 *    failover → pulse-monitor → sentinel-auditor (flush) → engram → sqlite-db (última)
 * 4. Dispose de listeners del bus
 * 5. runtime.stopped (evento) y vaciado del bus
 *
 * Cada step es tolerante a fallos: un step que lanza se loguea y el cierre continúa
 * (la DB siempre debe llegar a cerrarse). Si el total supera SHUTDOWN_TIMEOUT_MS,
 * forced exit.
 *
 * @returns lista de steps ejecutados en orden (los que resolvieron sin lanzar).
 */
export async function shutdown(): Promise<string[]> {
  log.info('Initiating graceful shutdown...');

  // Timeout de seguridad — si algo se congela, salimos igual
  const forceExitTimer = setTimeout(() => {
    log.error(`Shutdown timeout (${SHUTDOWN_TIMEOUT_MS}ms) exceeded — forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // No queremos que este timer impida que el proceso termine normalmente
  forceExitTimer.unref();

  const executedSteps: string[] = [];

  try {
    // Notificar - Forge Console y demás clientes WS recibirán este evento
    eventBus.emit(createEvent('runtime.stopping', RUNTIME_NAME, {}));

    // Cerrar Fastify (cierra HTTP + WebSocket connections abiertas)
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
      log.info('HTTP/WebSocket server closed');
    }

    // Steps del Shutdown Registry en orden (failover → pulse → auditor → engram → db)
    for (const step of getShutdownSteps()) {
      try {
        await step.close();
        executedSteps.push(step.name);
        log.info(`Shutdown step ok: ${step.name}`);
      } catch (stepErr) {
        log.error(`Shutdown step failed: ${step.name} — continuing`, stepErr);
      }
    }
    clearShutdownSteps();

    // Liberar listeners del bus
    if (busCleanup) {
      busCleanup.dispose();
      busCleanup = null;
      log.info('Bus listeners disposed');
    }

    // Evento final antes de vaciar el bus
    eventBus.emit(createEvent('runtime.stopped', RUNTIME_NAME, {}));

    // Vaciar subscripciones
    eventBus.clear();

    clearTimeout(forceExitTimer);
    log.info('Kage Runtime stopped cleanly. ✓');
    return executedSteps;
  } catch (err) {
    log.error('Error durante shutdown', err);
    clearTimeout(forceExitTimer);
    throw err;
  }
}
