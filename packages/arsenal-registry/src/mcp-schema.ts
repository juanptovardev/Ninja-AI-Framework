/**
 * @ninja/arsenal-registry — mcp-schema.ts
 * Tipos MCP (Model Context Protocol) para interoperabilidad con clientes externos.
 * Basado en MCP Specification 2025-06-18.
 */

// ---------------------------------------------------------------------------
// Constantes del protocolo
// ---------------------------------------------------------------------------

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_NAME = 'ninja-arsenal-mcp';
export const MCP_SERVER_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 Base Types
// ---------------------------------------------------------------------------

/**
 * Request JSON-RPC 2.0 estándar.
 * El ID puede ser string, number o null (para notifications).
 */
export interface MCPRequest {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/**
 * Error JSON-RPC 2.0.
 */
export interface MCPError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/**
 * Response JSON-RPC 2.0.
 * Debe tener result XOR error (excluyente).
 */
export interface MCPResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly result?: unknown;
  readonly error?: MCPError;
}

// ---------------------------------------------------------------------------
// JSON Schema para inputSchema/outputSchema
// ---------------------------------------------------------------------------

/**
 * Subset de JSON Schema para definir schemas de entrada/salida.
 */
export interface JSONSchema {
  readonly type: string;
  readonly properties?: Record<string, unknown>;
  readonly required?: string[];
  readonly items?: JSONSchema;
  readonly additionalProperties?: unknown;
  readonly description?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// MCP Tool Definition
// ---------------------------------------------------------------------------

/**
 * Annotations opcionales para describir comportamiento de la tool.
 */
export interface MCPToolAnnotations {
  /** La tool es read-only (no modifica estado) */
  readonly readOnlyHint?: boolean;
  /** La tool puede modificar estado (destructiva) */
  readonly destructiveHint?: boolean;
  /** La tool es idempotente (mismo input → mismo output) */
  readonly idempotentHint?: boolean;
  /** La tool interactúa con mundo externo (APIs, etc.) */
  readonly openWorldHint?: boolean;
}

/**
 * Definición de tool en formato MCP.
 * Compatible con MCP Specification 2025-06-18.
 */
export interface MCPTool {
  /** Identificador único de la tool */
  readonly name: string;
  /** Nombre legible para humanos (display name) */
  readonly title?: string;
  /** Descripción de la funcionalidad */
  readonly description: string;
  /** Schema de entrada (JSON Schema) */
  readonly inputSchema: JSONSchema;
  /** Schema de salida (opcional) */
  readonly outputSchema?: JSONSchema;
  /** Annotations de comportamiento */
  readonly annotations?: MCPToolAnnotations;
}

// ---------------------------------------------------------------------------
// MCP Server Capabilities
// ---------------------------------------------------------------------------

/**
 * Capacidades del servidor MCP.
 */
export interface MCPServerCapabilities {
  /** Soporte para tools */
  readonly tools?: {
    /** Notifica cambios en la lista de tools */
    readonly listChanged?: boolean;
  };
  /** Soporte para prompts */
  readonly prompts?: {
    readonly listChanged?: boolean;
  };
  /** Soporte para resources */
  readonly resources?: {
    readonly subscribe?: boolean;
    readonly listChanged?: boolean;
  };
  /** Soporte para logging */
  readonly logging?: Record<string, never>;
}

// ---------------------------------------------------------------------------
// MCP Initialize Response
// ---------------------------------------------------------------------------

/**
 * Información del servidor.
 */
export interface MCPServerInfo {
  readonly name: string;
  readonly version: string;
  readonly title?: string;
}

/**
 * Resultado de initialize.
 */
export interface MCPInitializeResult {
  readonly protocolVersion: string;
  readonly capabilities: MCPServerCapabilities;
  readonly serverInfo: MCPServerInfo;
  readonly instructions?: string;
}

// ---------------------------------------------------------------------------
// MCP Tools List Response
// ---------------------------------------------------------------------------

/**
 * Respuesta de tools/list.
 */
export interface MCPToolsListResult {
  readonly tools: MCPTool[];
  readonly nextCursor?: string;
  readonly _meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MCP Tools Call Response
// ---------------------------------------------------------------------------

/**
 * Bloque de contenido de texto.
 */
export interface MCPTextContent {
  readonly type: 'text';
  readonly text: string;
}

/**
 * Bloque de contenido de imagen.
 */
export interface MCPImageContent {
  readonly type: 'image';
  readonly data: string;
  readonly mimeType: string;
}

/**
 * Bloque de contenido de recurso.
 */
export interface MCPResourceContent {
  readonly type: 'resource';
  readonly resource: {
    readonly uri: string;
    readonly mimeType?: string;
    readonly text?: string;
    readonly blob?: string;
  };
}

/**
 * Tipos de bloques de contenido.
 */
export type MCPContentBlock = MCPTextContent | MCPImageContent | MCPResourceContent;

/**
 * Resultado de tools/call.
 */
export interface MCPToolCallResult {
  readonly content: MCPContentBlock[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
  readonly _meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Error Codes (JSON-RPC 2.0 + MCP)
// ---------------------------------------------------------------------------

export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ---------------------------------------------------------------------------
// Type Aliases
// ---------------------------------------------------------------------------

/**
 * Alias para el resultado de una herramienta MCP.
 */
export type MCPResult = MCPToolCallResult;
