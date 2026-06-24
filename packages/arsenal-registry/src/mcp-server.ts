/**
 * @ninja/arsenal-registry — mcp-server.ts
 * Servidor MCP sobre stdio usando JSON-RPC 2.0.
 * Compatible con Claude Desktop, Cursor y otros clientes MCP.
 */

import * as readline from 'readline';
import type { EventBus } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import { ArsenalRegistry } from './registry.js';
import {
  listMCPTools,
  executeMCPTool,
} from './mcp-adapter.js';
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_ERROR_CODES,
  MCPRequest,
  MCPResponse,
  MCPError,
  MCPServerCapabilities,
  MCPInitializeResult,
  MCPToolsListResult,
  MCPToolCallResult,
} from './mcp-schema.js';

const logger = createLogger('MCPServer');

// ---------------------------------------------------------------------------
// Estado del servidor
// ---------------------------------------------------------------------------

type ServerState = 'uninitialized' | 'initialized' | 'stopped';

// ---------------------------------------------------------------------------
// MCP Server Class
// ---------------------------------------------------------------------------

export class MCPServer {
  private state: ServerState = 'uninitialized';
  private rl: readline.Interface | null = null;
  private eventBus?: EventBus;

  constructor(
    private readonly registry: ArsenalRegistry,
    eventBus?: EventBus
  ) {
    this.eventBus = eventBus;
  }

  /**
   * Inicia el servidor MCP.
   * Lee desde stdin, escribe en stdout.
   */
  start(): void {
    if (this.state === 'stopped') {
      logger.warn('Cannot start: server already stopped');
      return;
    }

    // Configurar readline para stdin
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Escuchar líneas de entrada
    this.rl.on('line', (line: string) => {
      this.handleLine(line);
    });

    // Manejar cierre de stdin
    this.rl.on('close', () => {
      logger.info('STDIN closed');
      this.stop();
    });

    logger.info('MCP Server started (stdio transport)');
  }

  /**
   * Detiene el servidor.
   */
  stop(): void {
    if (this.state === 'stopped') {
      return;
    }

    this.state = 'stopped';

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    // Emitir evento de parada
    this.emitEvent({
      type: 'mcp.server.stopped',
      payload: {},
    });

    logger.info('MCP Server stopped');
  }

  /**
   * Maneja una línea de entrada (JSON-RPC request).
   */
  private handleLine(line: string): void {
    // Ignorar líneas vacías
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return;
    }

    // Parsear JSON
    let request: MCPRequest;
    try {
      request = JSON.parse(trimmedLine) as MCPRequest;
    } catch (error) {
      // Parse error
      this.sendError(
        null,
        MCP_ERROR_CODES.PARSE_ERROR,
        'Parse error: invalid JSON'
      );
      return;
    }

    // Validar estructura básica
    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      this.sendError(
        request.id ?? null,
        MCP_ERROR_CODES.INVALID_REQUEST,
        'Invalid Request: missing or invalid jsonrpc field'
      );
      return;
    }

    if (!request.method) {
      this.sendError(
        request.id ?? null,
        MCP_ERROR_CODES.INVALID_REQUEST,
        'Invalid Request: missing method'
      );
      return;
    }

    // Dispatch
    void this.dispatch(request);
  }

  /**
   * Despacha el request al handler correspondiente.
   */
  private async dispatch(request: MCPRequest): Promise<void> {
    const { method, params, id } = request;

    try {
      switch (method) {
        case 'initialize':
          this.handleInitialize(id, params);
          break;

        case 'tools/list':
          this.handleToolsList(id);
          break;

        case 'tools/call':
          await this.handleToolsCall(id, params);
          break;

        case 'ping':
          this.handlePing(id);
          break;

        default:
          this.sendError(id, MCP_ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendError(id, MCP_ERROR_CODES.INTERNAL_ERROR, `Internal error: ${message}`);
    }
  }

  /**
   * Handler: initialize
   */
  private handleInitialize(id: string | number | null, params?: Record<string, unknown>): void {
    // Validar estado
    if (this.state === 'uninitialized') {
      this.state = 'initialized';
    }

    const result: MCPInitializeResult = {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false,
        },
      } as MCPServerCapabilities,
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
        title: 'Ninja Arsenal MCP Server',
      },
      instructions:
        'Use tools/list to see available tools. Use tools/call to invoke a tool.',
    };

    this.sendResult(id, result);

    // Emitir evento de inicio
    const toolCount = listMCPTools(this.registry).length;
    this.emitEvent({
      type: 'mcp.server.started',
      payload: { toolCount },
    });

    logger.info(`MCP Server initialized with ${toolCount} tools`);
  }

  /**
   * Handler: tools/list
   */
  private handleToolsList(id: string | number | null): void {
    if (this.state !== 'initialized') {
      this.sendError(id, MCP_ERROR_CODES.INVALID_REQUEST, 'Server not initialized');
      return;
    }

    const tools = listMCPTools(this.registry);

    const result: MCPToolsListResult = {
      tools,
    };

    this.sendResult(id, result);
    logger.debug(`tools/list: returned ${tools.length} tools`);
  }

  /**
   * Handler: tools/call
   */
  private async handleToolsCall(
    id: string | number | null,
    params?: Record<string, unknown>
  ): Promise<void> {
    if (this.state !== 'initialized') {
      this.sendError(id, MCP_ERROR_CODES.INVALID_REQUEST, 'Server not initialized');
      return;
    }

    // Validar params
    if (!params || typeof params.name !== 'string') {
      this.sendError(id, MCP_ERROR_CODES.INVALID_PARAMS, 'Invalid params: missing or invalid tool name');
      return;
    }

    const toolName = params.name;
    const args = (params.arguments as Record<string, unknown>) ?? {};

    logger.debug(`tools/call: ${toolName}(${JSON.stringify(args)})`);

    try {
      const result: MCPToolCallResult = await executeMCPTool(
        this.registry,
        toolName,
        args
      );

      this.sendResult(id, result);

      // Emitir evento de tool llamada
      this.emitEvent({
        type: 'mcp.tool.called',
        payload: {
          toolName,
          success: !result.isError,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendError(id, MCP_ERROR_CODES.INTERNAL_ERROR, `Internal error: ${message}`);
    }
  }

  /**
   * Handler: ping
   */
  private handlePing(id: string | number | null): void {
    this.sendResult(id, {});
  }

  /**
   * Envía un resultado exitoso.
   */
  private sendResult(id: string | number | null, result: unknown): void {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.send(response);
  }

  /**
   * Envía un error.
   */
  private sendError(
    id: string | number | null,
    code: number,
    message: string
  ): void {
    const error: MCPError = {
      code,
      message,
    };

    const response: MCPResponse = {
      jsonrpc: '2.0',
      id,
      error,
    };

    this.send(response);
    logger.error(`Error ${code}: ${message}`);
  }

  /**
   * Envía una respuesta por stdout.
   */
  private send(response: MCPResponse): void {
    // JSON.stringify + newline
    const line = JSON.stringify(response);
    process.stdout.write(line + '\n');
  }

  /**
   * Emite un evento al EventBus si está disponible.
   */
  private emitEvent(event: { type: string; payload: unknown }): void {
    if (!this.eventBus) {
      return;
    }

    // Crear evento genérico compatible con NinjaEvent
    const customEvent = {
      id: crypto.randomUUID(),
      type: event.type,
      source: 'mcp-server',
      timestamp: new Date().toISOString(),
      payload: event.payload,
    };

    this.eventBus.emit(customEvent as never);
  }
}
