import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { isNinjaError } from '@ninja/contracts';
import { createLogger } from '@ninja/logging';
import { sanitizeError } from './sanitize-error.js';

const log = createLogger('kage-runtime:error-handler');

export function registerErrorHandlers(
  server: FastifyInstance,
  env: 'production' | 'development' | 'test',
): void {
  server.setErrorHandler(async (err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        issues: err.issues,
      });
    }

    if (isNinjaError(err)) {
      log.warn(err.message, { code: err.code, domain: err.domain, url: req.url });
      return reply.status(err.httpStatus ?? 500).send(sanitizeError(err, env));
    }

    if (err.validation) {
      return reply.status(400).send({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        issues: err.validation,
      });
    }

    log.error('Unhandled error in request', { err, url: req.url, method: req.method });
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