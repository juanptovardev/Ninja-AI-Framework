import WebSocket, { WebSocketServer } from 'ws';
import { IClientAdapter, AdapterOptions, AdapterResult } from '../types.js';
import { BaseTransportAdapter } from '../base-adapter.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('client-adapters:websocket');

export class WebSocketAdapter extends BaseTransportAdapter {
  private static connections = new Map<string, WebSocket>();
  private static server: WebSocketServer | null = null;

  /**
   * Starts a global WebSocket server to listen for companion extension connections.
   */
  public static startServer(port: number): void {
    if (this.server) return;

    log.info(`Starting WebSocket Server for VS Code Companion Extensions on port ${port}...`);
    this.server = new WebSocketServer({ port });

    this.server.on('connection', (ws, req) => {
      // Typically, the extension will send an initialization message identifying itself, e.g. "codex" or "cursor"
      log.info(`New extension WebSocket connection from ${req.socket.remoteAddress}`);
      let clientId = 'unknown';

      ws.on('message', (message) => {
        try {
          const payload = JSON.parse(message.toString());
          if (payload.type === 'register') {
            clientId = payload.clientId;
            this.connections.set(clientId, ws);
            log.info(`Extension registered: ${clientId}`);
            ws.send(JSON.stringify({ type: 'registered', status: 'ok' }));
          }
        } catch {
          // Ignore
        }
      });

      ws.on('close', () => {
        if (clientId !== 'unknown') {
          this.connections.delete(clientId);
          log.info(`Extension disconnected: ${clientId}`);
        }
      });

      ws.on('error', (err) => {
        log.error(`WebSocket error for ${clientId}:`, err);
      });
    });
  }

  /**
   * Stops the global WebSocket server.
   */
  public static stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.connections.clear();
      log.info('WebSocket Server stopped.');
    }
  }

  async execute(prompt: string, options: AdapterOptions & { clientId: string; port?: number }): Promise<AdapterResult> {
    const startTime = Date.now();
    const clientId = options.clientId;
    const port = options.port || 7780;

    log.info(`Sending task to companion extension ${clientId}...`);

    // 1. Try to find an existing connection from the server
    let ws = WebSocketAdapter.connections.get(clientId);

    if (ws && ws.readyState === WebSocket.OPEN) {
      return this.sendTaskViaWebSocket(ws, prompt, options, startTime);
    }

    // 2. Fallback: Try to connect as a client to the extension's WS server
    log.info(`No active incoming connection. Attempting to connect to extension server at ws://127.0.0.1:${port}...`);
    return new Promise((resolve) => {
      const clientWs = new WebSocket(`ws://127.0.0.1:${port}`);
      
      const timeout = setTimeout(() => {
        clientWs.terminate();
        resolve({
          status: 'timeout',
          output: `Timeout: Could not connect to extension server on port ${port} within 10000ms`,
          durationMs: Date.now() - startTime,
        });
      }, 10000);

      clientWs.on('open', () => {
        clearTimeout(timeout);
        this.sendTaskViaWebSocket(clientWs, prompt, options, startTime)
          .then((res) => {
            clientWs.close();
            resolve(res);
          })
          .catch((err) => {
            clientWs.close();
            resolve({
              status: 'error',
              output: `WS error during task execution: ${err.message}`,
              durationMs: Date.now() - startTime,
            });
          });
      });

      clientWs.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          status: 'error',
          output: `Failed to connect to extension WebSocket on port ${port}: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  private sendTaskViaWebSocket(ws: WebSocket, prompt: string, options: AdapterOptions, startTime: number): Promise<AdapterResult> {
    return new Promise((resolve, reject) => {
      const messageHandler = (data: WebSocket.RawData) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.taskId === options.taskId && payload.type === 'task_result') {
            ws.off('message', messageHandler);
            clearTimeout(timeout);
            
            const durationMs = Date.now() - startTime;
            if (payload.status === 'success') {
              resolve({
                status: 'success',
                output: payload.output,
                rawOutput: payload,
                durationMs,
              });
            } else {
              resolve({
                status: 'error',
                output: payload.error || payload.output || 'Unknown extension execution error',
                rawOutput: payload,
                durationMs,
              });
            }
          }
        } catch {
          // Ignore non-matching or invalid JSON
        }
      };

      ws.on('message', messageHandler);

      const timeout = setTimeout(() => {
        ws.off('message', messageHandler);
        resolve({
          status: 'timeout',
          output: `Timeout: Extension did not respond within ${options.timeoutMs || 90000}ms.`,
          durationMs: Date.now() - startTime,
        });
      }, options.timeoutMs || 90000);

      try {
        ws.send(JSON.stringify({
          type: 'execute_task',
          taskId: options.taskId,
          prompt,
          timeoutMs: options.timeoutMs,
        }));
      } catch (err) {
        ws.off('message', messageHandler);
        clearTimeout(timeout);
        reject(err);
      }
    });
  }
}
