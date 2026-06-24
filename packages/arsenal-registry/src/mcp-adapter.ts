/**
 * @ninja/arsenal-registry — mcp-adapter.ts
 * Adapter para convertir tools del Arsenal Registry a formato MCP.
 * NO modifica el Registry interno — solo lectura.
 */

import type {
  ToolDefinition,
  ToolPermission,
  ToolContext,
  ToolResult,
} from './schema.js';
import type { ArsenalRegistry } from './registry.js';
import type {
  MCPTool,
  MCPToolAnnotations,
  JSONSchema,
  MCPToolCallResult,
} from './mcp-schema.js';
import { createLogger } from '@ninja/logging';

const logger = createLogger('MCPAdapter');

// ---------------------------------------------------------------------------
// Contexto MCP por defecto
// ---------------------------------------------------------------------------

/**
 * ToolContext para llamadas desde MCP.
 * Permisos limitados: safe y confirm. Restricted se deniega.
 */
const MCP_DEFAULT_CONTEXT: Omit<ToolContext, 'permissions'> & {
  permissions: Set<'safe' | 'confirm'>;
} = {
  agentId: 'mcp-external' as const,
  runId: 'mcp-run' as const,
  sessionId: 'mcp-session' as const,
  permissions: new Set(['safe', 'confirm']),
};

// ---------------------------------------------------------------------------
// Mapas hardcoded de schemas para tools nativas
// ---------------------------------------------------------------------------

/**
 * Schemas de entrada para las 6 tools nativas.
 * Las tools tienen inputSchema: undefined, así que proveemos schemas manuales.
 */
const NATIVE_TOOL_SCHEMAS: Record<string, JSONSchema> = {
  'fs.read': {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Ruta del archivo a leer',
      },
    },
    required: ['path'],
  },
  'fs.write': {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Ruta del archivo a escribir',
      },
      content: {
        type: 'string',
        description: 'Contenido a escribir en el archivo',
      },
    },
    required: ['path', 'content'],
  },
  'fs.list': {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Ruta del directorio a listar',
      },
    },
    required: ['path'],
  },
  'shell.exec': {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Comando a ejecutar',
      },
      args: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Argumentos del comando',
      },
    },
    required: ['command'],
  },
  'http.get': {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL de la petición GET',
      },
      headers: {
        type: 'object',
        additionalProperties: {
          type: 'string',
        },
        description: 'Headers HTTP opcionales',
      },
    },
    required: ['url'],
  },
  'http.post': {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL de la petición POST',
      },
      body: {
        type: 'object',
        description: 'Cuerpo de la petición',
      },
      headers: {
        type: 'object',
        additionalProperties: {
          type: 'string',
        },
        description: 'Headers HTTP opcionales',
      },
    },
    required: ['url'],
  },
};

// ---------------------------------------------------------------------------
// Mapeo de permisos a annotations
// ---------------------------------------------------------------------------

/**
 * Mapea permiso de Arsenal a MCP Tool Annotations.
 */
function permissionToAnnotations(permission: ToolPermission): MCPToolAnnotations {
  switch (permission) {
    case 'safe':
      return {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      };
    case 'confirm':
      return {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      };
    case 'restricted':
      return {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      };
    case 'blocked':
    default:
      // Blocked no debería llegar aquí (se filtran antes)
      return {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Funciones públicas
// ---------------------------------------------------------------------------

/**
 * Convierte una ToolDefinition del Arsenal a MCPTool.
 */
export function arsenalToolToMCPTool(tool: ToolDefinition<unknown, unknown>): MCPTool {
  // Obtener schema de entrada (hardcoded para tools nativas)
  const inputSchema = NATIVE_TOOL_SCHEMAS[tool.id] ?? {
    type: 'object',
    properties: {},
    required: [],
  };

  // Obtener schema de salida (si existe)
  const outputSchema = tool.outputSchema
    ? (tool.outputSchema as JSONSchema)
    : undefined;

  // Convertir permiso a annotations
  const annotations = permissionToAnnotations(tool.permission);

  return {
    name: tool.name,
    title: tool.friendlyName,
    description: tool.description,
    inputSchema,
    outputSchema,
    annotations,
  };
}

/**
 * Lista todas las tools del registry en formato MCP.
 * Filtra tools 'blocked' (no se exponen).
 */
export function listMCPTools(registry: ArsenalRegistry): MCPTool[] {
  const tools = registry.listTools();

  return tools
    .filter((tool) => tool.permission !== 'blocked')
    .map((tool) => arsenalToolToMCPTool(tool));
}

/**
 * Ejecuta una tool del registry desde MCP.
 * Devuelve MCPToolCallResult (compatible con tools/call response).
 */
export async function executeMCPTool(
  registry: ArsenalRegistry,
  name: string,
  args: Record<string, unknown>
): Promise<MCPToolCallResult> {
  // Buscar tool por name o por id
  let tool = registry.getTool(name);
  if (!tool) {
    tool = registry.getTool(name);
  }

  if (!tool) {
    // Tool no encontrada
    return {
      content: [
        {
          type: 'text',
          text: `Tool '${name}' not found`,
        },
      ],
      isError: true,
    };
  }

  // Verificar permiso restricted (MCP externo no tiene restricted)
  if (tool.permission === 'restricted') {
    return {
      content: [
        {
          type: 'text',
          text: `Tool '${name}' requiere permisos restricted. Acceso denegado desde MCP.`,
        },
      ],
      isError: true,
    };
  }

  // Verificar permiso blocked (no debería ocurrir, pero por si acaso)
  if (tool.permission === 'blocked') {
    return {
      content: [
        {
          type: 'text',
          text: `Tool '${name}' está bloqueada por política de seguridad.`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Ejecutar tool con contexto MCP
    const context: ToolContext = {
      ...MCP_DEFAULT_CONTEXT,
    };

    const result: ToolResult<unknown> = await tool.handler(args, context);

    if (result.success) {
      // Convertir output a string para content
      const outputStr =
        result.output !== undefined
          ? JSON.stringify(result.output, null, 2)
          : 'Tool executed successfully (no output)';

      return {
        content: [
          {
            type: 'text',
            text: outputStr,
          },
        ],
        structuredContent: result.output as Record<string, unknown>,
        isError: false,
      };
    } else {
      // Error en la ejecución
      return {
        content: [
          {
            type: 'text',
            text: result.error ?? 'Unknown error',
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    // Error inesperado
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error(`Error ejecutando tool '${name}': ${errorMessage}`);

    return {
      content: [
        {
          type: 'text',
          text: `Error interno: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
