import type { FastifyInstance } from 'fastify';
import { eventBus } from '@ninja/events';

export function registerBusRoutes(server: FastifyInstance): void {
  server.get('/bus/status', async (_request, reply) => {
    return reply.send({
      activeTypes: eventBus.activeTypeCount,
      subscriptions: eventBus.subscriptionCount,
      eventsEmitted: eventBus.emitCount,
      timestamp: new Date().toISOString(),
    });
  });

  server.get('/bus/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });
}
