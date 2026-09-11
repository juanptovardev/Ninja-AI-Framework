/**
 * apps/kage-runtime — routes/ws-events.routes.ts
 * Canal WebSocket de eventos en tiempo real (WP-D4 2/2).
 *
 * Extraído de server.ts (composition root) sin cambiar comportamiento:
 * - GET /ws/events → stream de NinjaEvent del eventBus con handshake de auth
 *   (WP-B11: primer mensaje debe ser { action: 'auth', key } salvo NINJA_AUTH_DISABLED).
 */
import type { FastifyInstance } from 'fastify';
import { eventBus } from '@ninja/events';
import type { EventBusLike, NinjaEvent } from '@ninja/events';
import type { KageEngine } from '@ninja/kage-engine';
import { createLogger } from '@ninja/logging';

const log = createLogger('kage-runtime:routes:ws-events');

/**
 * Método "soft" de entrevista accesible por WS: el handler inline original
 * hacía `(engine as <any>).submitAnswers(msg.payload)` con UN solo argumento
 * (código sin tipar, WP-D4 1/2). Se preserva el guard `typeof === 'function'`
 * y el aridad exacta (payload único) para no cambiar el contract del canal.
 */
type WsEngine = KageEngine & { submitAnswers?(payload: unknown): void };

export interface WsRoutesDeps {
  /** KageEngine con método "soft" submitAnswers (guard idéntico al original). */
  engine: WsEngine;
  /** Deriva de NINJA_AUTH_DISABLED — desactiva el handshake de auth. */
  authDisabled: boolean;
  /** Key autenticada del proceso (null si auth deshabilitada). */
  runtimeKey: string | null;
}

export function registerWsEventsRoutes(server: FastifyInstance, deps: WsRoutesDeps): void {
  const { engine, authDisabled, runtimeKey } = deps;

  server.get('/ws/events', { websocket: true }, (socket, _request) => {
    log.info('WebSocket client connected to /ws/events');

    // WP-B11: WS auth — first message must be { action: 'auth', key }
    let authenticated = authDisabled;

    const authTimeout = authDisabled
      ? null
      : setTimeout(() => {
          if (!authenticated) {
            socket.close(1008, 'Auth timeout: send auth handshake within 5s');
          }
        }, 5000);

    let busSubscription: { unsubscribe: () => void } | null = null;

    const subscribe = (bus: EventBusLike) => {
      busSubscription = bus.on('*', (event: NinjaEvent) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      });
    };

    const unsubscribe = () => busSubscription?.unsubscribe();

    if (authDisabled) {
      subscribe(eventBus);
    }

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (!authenticated) {
          if (msg.action === 'auth' && msg.key === runtimeKey) {
            authenticated = true;
            if (authTimeout) clearTimeout(authTimeout);
            socket.send(JSON.stringify({ type: 'auth.ok' }));
            subscribe(eventBus);
          } else {
            socket.close(1008, 'Invalid auth');
          }
          return;
        }

        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        } else if (msg.action === 'interview:answers') {
          if (typeof engine.submitAnswers === 'function') {
            engine.submitAnswers(msg.payload);
          } else {
            log.warn('engine.submitAnswers no está implementado aún en KageEngine');
          }
        }
      } catch (err) {
        log.debug('Failed to parse WS message', err);
      }
    });

    socket.on('close', () => {
      if (authTimeout) clearTimeout(authTimeout);
      unsubscribe();
      log.info('WebSocket client disconnected from /ws/events');
    });

    socket.on('error', (err: Error) => {
      if (authTimeout) clearTimeout(authTimeout);
      unsubscribe();
      log.error('WebSocket error in /ws/events', err);
    });
  });
}
