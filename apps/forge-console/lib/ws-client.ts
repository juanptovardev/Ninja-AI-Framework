/**
 * forge-console — lib/ws-client.ts
 * Cliente WS único del dashboard (zustand) con reconexión automática (WP-C3b / F2.2).
 *
 * - Backoff exponencial 1000ms → 30000ms (×2) con jitter ±20% (nextBackoffMs, función pura).
 * - Máximo 5 intentos; agotados → estado 'closed' + log warn estructurado.
 * - Al (re)conectar: handshake de auth ({action:'auth', key}) y esperar {type:'auth.ok'}
 *   antes de considerar la conexión operativa.
 * - Estado expuesto: 'connecting' | 'open' | 'reconnecting' | 'closed'.
 */
import { create } from 'zustand';
import { createLogger } from '@ninja/logging';

const log = createLogger('forge-console:ws-client');

/** Estados de conexión expuestos al UI. */
export type WsConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Intentos máximos de reconexión antes de rendirse (estado 'closed'). */
export const MAX_RECONNECT_ATTEMPTS = 5;
/** Base del backoff exponencial (ms). */
export const BACKOFF_BASE_MS = 1000;
/** Techo del backoff (ms). */
export const BACKOFF_CAP_MS = 30000;
/** Jitter máximo relativo (±20%). */
export const BACKOFF_JITTER = 0.2;

/**
 * Backoff exponencial con jitter para el intento `attempt` (0-based).
 * 1000 × 2^attempt, con techo de 30000ms y jitter uniforme ±20%.
 * Devuelve null cuando se agotaron los intentos (attempt >= 5) → caller rinde.
 */
export function nextBackoffMs(attempt: number, random: () => number = Math.random): number | null {
  if (attempt >= MAX_RECONNECT_ATTEMPTS) return null;
  const base = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS);
  const jitter = base * BACKOFF_JITTER;
  return Math.round(base - jitter + random() * jitter * 2);
}

interface WsMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: number;
}

interface WsState {
  socket: WebSocket | null;
  messages: WsMessage[];
  connected: boolean;
  /** Estado fino de conexión para indicadores UI (WP-C3b). */
  status: WsConnectionStatus;
  /** Último error de auth (p.ej. auth timeout / inválido). */
  authError: string | null;
  connect: (url: string) => void;
  disconnect: () => void;
  sendMessage: (text: string) => void;
  addMessage: (msg: { sender: 'user' | 'agent'; text: string }) => void;
}

// Mapeo de tipos de eventos del motor a mensajes amigables en el chat
const EVENT_MAPPERS: Record<string, (payload: any) => string | null> = {
  'engine.request.received': (p) =>
    `🎯 Nueva solicitud recibida: "${p.prompt?.substring(0, 100)}${p.prompt?.length > 100 ? '...' : ''}" (Modo: ${p.mode})`,

  'engine.plan.created': (p) => `📋 Plan de operaciones creado con ${p.steps} tareas paso a paso.`,

  'engine.run.executing': () => `🚀 La ejecución del plan ha sido iniciada en segundo plano.`,

  'engine.run.paused': () => `⏸ La ejecución se encuentra pausada.`,

  'engine.run.completed': () =>
    `🎉 ¡Misión completada con éxito! Todos los artefactos fueron generados.`,

  'engine.run.failed': (p) => `❌ La ejecución falló${p.data?.error ? `: ${p.data.error}` : '.'}`,

  'agent.task.started': (p) =>
    `🤖 El agente ${p.role} ha tomado la tarea y comenzó a planificar/analizar.`,

  'agent.task.completed': () => `✅ El agente completó satisfactoriamente su tarea asignada.`,

  'agent.task.failed': (p) =>
    `❌ El agente falló al ejecutar la tarea: ${p.data?.error || 'error desconocido'}`,

  'agent.llm.called': (p) =>
    `💬 ${p.role} llamó a LLM (${p.data?.model || 'modelo default'}) consumiendo ${p.data?.tokensUsed || 0} tokens.`,

  'sentinel.approval.required': (p) =>
    `🛡️ [SENTINEL BLOCK] Aprobación requerida para realizar acción sensible: ${p.actionSummary || p.message || 'Auditoría en curso'}`,
};

/** Determina si el runtime tiene auth habilitada (browser env, injectable en tests). */
function resolveApiKey(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): string | null {
  return env['NEXT_PUBLIC_RUNTIME_API_KEY'] ?? null;
}

export const useWsClient = create<WsState>((set, get) => {
  // ── Estado interno del ciclo de reconexión (no reactivo) ──────────────────
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let shouldReconnect = false;
  let lastUrl = '';

  const clearReconnectTimer = (): void => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  /**
   * Abre un socket hacia `url` con handlers completos.
   * En `onopen` envía el handshake de auth; la conexión no se considera operativa
   * (connected=true) hasta recibir {type:'auth.ok'} (re-auth en cada reconexión).
   */
  const openSocket = (url: string): void => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      log.debug('WebSocket constructor failed', { url });
      scheduleReconnect();
      return;
    }
    set({ socket });

    socket.onopen = () => {
      log.info('WebSocket open — sending auth handshake');
      const apiKey = resolveApiKey();
      if (apiKey) {
        socket.send(JSON.stringify({ action: 'auth', key: apiKey }));
        // connected sigue false hasta auth.ok (onmessage)
      } else {
        // Sin auth configurada: conexión operativa directa (NINJA_AUTH_DISABLED del runtime).
        set({ connected: true, status: 'open', authError: null });
        reconnectAttempt = 0;
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);

        // ── Handshake de auth (WP-B11 / WP-C3b) ─────────────────────────────
        if (data.type === 'auth.ok') {
          log.info('WebSocket auth.ok — connection operational');
          reconnectAttempt = 0;
          set({ connected: true, status: 'open', authError: null });
          return;
        }
        if (
          data.type === 'auth.timeout' ||
          (data instanceof Object &&
            'reason' in data &&
            typeof data.reason === 'string' &&
            data.reason.startsWith('Auth'))
        ) {
          log.warn('WebSocket auth rejected', { reason: String(data.reason ?? 'auth.timeout') });
          set({ authError: String(data.reason ?? 'auth timeout') });
          return;
        }

        // ── Mensajes legacy de texto directo ─────────────────────────────────
        if (data.type === 'message' && data.text) {
          get().addMessage({ sender: 'agent', text: data.text });
          return;
        }

        // ── Eventos tipados del EventBus de Ninja ────────────────────────────
        if (data.type && EVENT_MAPPERS[data.type]) {
          const mappedText = EVENT_MAPPERS[data.type](data.payload || {});
          if (mappedText) {
            get().addMessage({ sender: 'agent', text: mappedText });
          }
        }
      } catch {
        log.debug('Failed to parse WS message');
      }
    };

    socket.onclose = (event: CloseEvent) => {
      log.info('WebSocket closed', { code: event.code, wasClean: event.wasClean });
      set({ connected: false, socket: null });
      if (shouldReconnect) {
        scheduleReconnect();
      } else {
        set({ status: 'closed' });
      }
    };

    socket.onerror = () => {
      log.debug('WebSocket error (will rely on onclose for reconnect)');
    };
  };

  /** Programa el próximo intento de reconexión con backoff exponencial + jitter. */
  const scheduleReconnect = (): void => {
    clearReconnectTimer();
    const delay = nextBackoffMs(reconnectAttempt);
    if (delay === null) {
      log.warn('WebSocket reconnect attempts exhausted — giving up', {
        attempts: MAX_RECONNECT_ATTEMPTS,
        url: lastUrl,
      });
      set({ status: 'closed', connected: false, socket: null });
      return;
    }
    reconnectAttempt += 1;
    set({ status: 'reconnecting', connected: false });
    log.info('WebSocket reconnect scheduled', {
      attempt: reconnectAttempt,
      delayMs: delay,
    });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket(lastUrl);
    }, delay);
  };

  return {
    socket: null,
    messages: [],
    connected: false,
    status: 'closed',
    authError: null,

    connect: (url) => {
      // Idempotente: si ya hay un socket vivo o un timer de reconexión, no duplicar.
      if (get().socket || reconnectTimer !== null) return;
      shouldReconnect = true;
      lastUrl = url;
      reconnectAttempt = 0;
      set({ status: 'connecting', authError: null });
      openSocket(url);
    },

    disconnect: () => {
      shouldReconnect = false;
      clearReconnectTimer();
      const { socket } = get();
      if (socket) {
        socket.close();
        set({ socket: null, connected: false, status: 'closed' });
      } else {
        set({ status: 'closed' });
      }
    },

    sendMessage: (text) => {
      const { socket, connected } = get();
      if (socket && connected) {
        socket.send(JSON.stringify({ type: 'message', text }));
        get().addMessage({ sender: 'user', text });
      }
    },

    addMessage: (msg) => {
      set((state) => ({
        messages: [
          ...state.messages,
          { ...msg, id: Math.random().toString(36).slice(2), timestamp: Date.now() },
        ],
      }));
    },
  };
});
