/**
 * apps/kage-runtime — request-logging.ts
 * Access log mínimo + correlationId por request (WP-F2.7, Manual §7.1/§7.2).
 *
 * - `genReqId` (server.ts) asigna UUID por request → correlationId.
 * - onResponse emite 1 línea: "METHOD url STATUS" con correlationId, duración y
 *   dirección remota — vía @ninja/logging (JSON 1-evento/línea o pretty en TTY).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createLogger } from '@ninja/logging';

const accessLog = createLogger('kage-runtime:access');

// Augment de tipos: correlationId + timer de duración por request.
declare module 'fastify' {
  interface FastifyRequest {
    /** correlationId = request.id (UUID de genReqId). */
    correlationId: string;
    /** Marca de alta resolución para calcular durationMs en onResponse. */
    startTimeNs?: bigint;
  }
}

export interface RequestLoggingOptions {
  /** Rutas (path sin query) excluidas del access log — p.ej. probes ruidosos. */
  skipPaths?: string[];
}

export function registerRequestLogging(
  server: FastifyInstance,
  opts: RequestLoggingOptions = {}
): void {
  const skip = new Set(opts.skipPaths ?? []);

  server.addHook('onRequest', async (request: FastifyRequest) => {
    request.correlationId = request.id;
    request.startTimeNs = process.hrtime.bigint();
  });

  server.addHook('onResponse', async (request, reply) => {
    const pathOnly = request.url.split('?')[0] ?? request.url;
    if (skip.has(pathOnly)) return;

    const start = request.startTimeNs;
    const durationMs = start
      ? Math.round((Number(process.hrtime.bigint() - start) / 1e6) * 100) / 100
      : 0;

    accessLog.info(`${request.method} ${request.url} ${reply.statusCode}`, {
      correlationId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs,
      remoteAddress: request.ip,
    });
  });
}
