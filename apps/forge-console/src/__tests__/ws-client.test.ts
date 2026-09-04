/**
 * Tests WS reconnect (WP-C3b / F2.2).
 *
 * Dos niveles:
 * 1. nextBackoffMs — función pura: progresión exponencial, techo 30s, jitter ±20%, null en ≥5.
 * 2. Ciclo completo con WebSocket mockeado + fake timers: cierre → schedule → re-open →
 *    re-auth → auth.ok; agotamiento de intentos → 'closed'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock del WebSocket global ANTES de importar el store ────────────────────
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number; wasClean: boolean }) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  // Helpers de test
  serverOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  serverMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, wasClean: false });
  }
}

vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
vi.stubEnv('NEXT_PUBLIC_RUNTIME_API_KEY', 'test-key-123456');

const { useWsClient, nextBackoffMs } = await import('../../lib/ws-client');

describe('nextBackoffMs (función pura)', () => {
  it('attempt 0 → ~1000ms ±20%', () => {
    for (let i = 0; i < 50; i++) {
      const ms = nextBackoffMs(0);
      expect(ms).toBeGreaterThanOrEqual(800);
      expect(ms).toBeLessThanOrEqual(1200);
    }
  });

  it('attempt 4 → ~16000ms ±20%', () => {
    for (let i = 0; i < 50; i++) {
      const ms = nextBackoffMs(4);
      expect(ms).toBeGreaterThanOrEqual(12800);
      expect(ms).toBeLessThanOrEqual(19200);
    }
  });

  it('progresión exponencial con jitter determinista (random=0 → mínimo, random=1 → máximo)', () => {
    expect(nextBackoffMs(0, () => 0.5)).toBe(1000);
    expect(nextBackoffMs(0, () => 0)).toBe(800);
    expect(nextBackoffMs(0, () => 1)).toBe(1200);
    expect(nextBackoffMs(1, () => 0.5)).toBe(2000);
    expect(nextBackoffMs(2, () => 0.5)).toBe(4000);
    expect(nextBackoffMs(3, () => 0.5)).toBe(8000);
    expect(nextBackoffMs(4, () => 0.5)).toBe(16000);
  });

  it('no supera el techo de 30000ms en intentos intermedios (si subiera el límite de intentos)', () => {
    // 1000*2^5=32000 → cap 30000 (jitter ±20% aplicado sobre el cap)
    expect(nextBackoffMs(5, () => 0.5)).toBe(null);
    expect(nextBackoffMs(4, () => 0.5)).toBe(16000);
  });

  it('attempt ≥5 → null (agotado)', () => {
    expect(nextBackoffMs(5)).toBe(null);
    expect(nextBackoffMs(6)).toBe(null);
    expect(nextBackoffMs(99)).toBe(null);
  });
});

describe('ciclo de reconexión y re-auth (WS mock + fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    useWsClient.setState({
      messages: [],
      socket: null,
      connected: false,
      status: 'closed',
      authError: null,
    });
  });

  afterEach(() => {
    useWsClient.getState().disconnect();
    vi.useRealTimers();
  });

  it('connect inicial: handshake de auth enviado, connected=false hasta auth.ok', () => {
    useWsClient.getState().connect('ws://test/ws/events');
    expect(useWsClient.getState().status).toBe('connecting');

    const ws = MockWebSocket.instances[0];
    ws.serverOpen();
    // Handshake enviado
    expect(ws.sent).toEqual([JSON.stringify({ action: 'auth', key: 'test-key-123456' })]);
    // Aún no conectado "operativamente"
    expect(useWsClient.getState().connected).toBe(false);
    expect(useWsClient.getState().status).toBe('connecting');

    ws.serverMessage({ type: 'auth.ok' });
    expect(useWsClient.getState().connected).toBe(true);
    expect(useWsClient.getState().status).toBe('open');
  });

  it('runtime sin auth config → open directo sin handshake', () => {
    const prevKey = process.env['NEXT_PUBLIC_RUNTIME_API_KEY'];
    delete process.env['NEXT_PUBLIC_RUNTIME_API_KEY'];
    try {
      useWsClient.getState().connect('ws://test/ws/events');
      const ws = MockWebSocket.instances[0];
      ws.serverOpen();
      expect(ws.sent).toEqual([]);
      expect(useWsClient.getState().connected).toBe(true);
      expect(useWsClient.getState().status).toBe('open');
    } finally {
      process.env['NEXT_PUBLIC_RUNTIME_API_KEY'] = prevKey;
    }
  });

  it('matar runtime → backoff → reconecta → re-auth → recibe eventos de nuevo', () => {
    useWsClient.getState().connect('ws://test/ws/events');
    const first = MockWebSocket.instances[0];
    first.serverOpen();
    first.serverMessage({ type: 'auth.ok' });
    expect(useWsClient.getState().status).toBe('open');

    // El runtime muere
    first.serverClose(1006);
    expect(useWsClient.getState().connected).toBe(false);
    expect(useWsClient.getState().status).toBe('reconnecting');

    // Avanza el backoff del intento 1 (~1000ms ±20%)
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances.length).toBe(2);

    // Segunda conexión: re-auth handshake obligatorio
    const second = MockWebSocket.instances[1];
    second.serverOpen();
    expect(second.sent).toEqual([JSON.stringify({ action: 'auth', key: 'test-key-123456' })]);
    second.serverMessage({ type: 'auth.ok' });
    expect(useWsClient.getState().status).toBe('open');

    // Recibe eventos de nuevo
    second.serverMessage({ type: 'agent.task.started', payload: { role: 'Architect' } });
    const messages = useWsClient.getState().messages;
    expect(messages.length).toBe(1);
    expect(messages[0].sender).toBe('agent');
  });

  it('5 intentos agotados → estado closed + log warn (sin más timers)', () => {
    useWsClient.getState().connect('ws://test/ws/events');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Ciclo: conexión inicial + 5 reconexiones (backoff ~1s,2s,4s,8s,16s ±jitter).
    // En la 5ª caída reconnectAttempt ya vale 5 → nextBackoffMs(5)=null → closed.
    for (let i = 0; i < 6; i++) {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].serverClose(1006);
      vi.advanceTimersByTime(40000);
    }
    // 1 socket inicial + 5 reconexiones creados y cerrados; tras la 5ª caída no hay más timers
    expect(MockWebSocket.instances.length).toBe(6);
    expect(useWsClient.getState().status).toBe('closed');
    expect(useWsClient.getState().connected).toBe(false);

    // Tras agotar, avanza el tiempo sin crear más sockets
    vi.advanceTimersByTime(120000);
    expect(MockWebSocket.instances.length).toBe(6);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('reconexión exitosa resetea el contador de intentos (no agota prematuramente)', () => {
    useWsClient.getState().connect('ws://test/ws/events');
    const first = MockWebSocket.instances[0];
    first.serverOpen();
    first.serverMessage({ type: 'auth.ok' });

    // Dos caídas, cada una recuperada
    for (let round = 0; round < 2; round++) {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].serverClose(1006);
      vi.advanceTimersByTime(2000);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.serverOpen();
      ws.serverMessage({ type: 'auth.ok' });
      expect(useWsClient.getState().status).toBe('open');
    }

    // Tras recuperarse, sigue habiendo máximo 1 intento pendiente por caída
    const third = MockWebSocket.instances[2];
    third.serverClose(1006);
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances.length).toBe(4); // 1 inicial + 3 reconexiones (1 por caída)
  });

  it('disconnect manual → no reconecta (shouldReconnect=false)', () => {
    useWsClient.getState().connect('ws://test/ws/events');
    const ws = MockWebSocket.instances[0];
    ws.serverOpen();
    ws.serverMessage({ type: 'auth.ok' });

    useWsClient.getState().disconnect();
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(useWsClient.getState().status).toBe('closed');
  });

  it('connect es idempotente mientras hay conexión o reconexión en curso', () => {
    useWsClient.getState().connect('ws://test/ws/events');
    useWsClient.getState().connect('ws://test/ws/events');
    useWsClient.getState().connect('ws://test/ws/events');
    expect(MockWebSocket.instances.length).toBe(1);
  });
});
