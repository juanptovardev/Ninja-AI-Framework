import type { NinjaEvent } from '@ninja/contracts';

const RUNTIME_PORT = process.env.NINJA_RUNTIME_PORT || '3141';
const WS_URL = `ws://localhost:${RUNTIME_PORT}/ws/events`;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface WebSocketOptions {
  onMessage?: (event: NinjaEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onOpen?: () => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketWrapper {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly options: Required<WebSocketOptions>;
  private status: ConnectionStatus = 'disconnected';
  private messageQueue: unknown[] = [];

  constructor(options: WebSocketOptions = {}) {
    this.options = {
      onMessage: options.onMessage || (() => {}),
      onError: options.onError || (() => {}),
      onClose: options.onClose || (() => {}),
      onOpen: options.onOpen || (() => {}),
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
    };
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.status = 'connecting';

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.status = 'connected';
        this.reconnectAttempts = 0;
        this.options.onOpen();

        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift();
          this.ws?.send(JSON.stringify(message));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed: NinjaEvent = JSON.parse(event.data);
          this.options.onMessage(parsed);
        } catch {
          console.error('Failed to parse WebSocket message');
        }
      };

      this.ws.onerror = () => {
        this.options.onError(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        this.status = 'disconnected';
        this.options.onClose();

        if (this.options.reconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const backoff = this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
          setTimeout(() => this.connect(), backoff);
        }
      };
    } catch (error) {
      this.status = 'disconnected';
      this.options.onError(error instanceof Error ? error : new Error('Connection failed'));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.status = 'disconnected';
    }
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.messageQueue.push(data);
    }
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}

export function createWebSocket(options?: WebSocketOptions): WebSocketWrapper {
  return new WebSocketWrapper(options);
}
