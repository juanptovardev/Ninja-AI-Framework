/**
 * @ninja/arsenal-registry — index.ts
 * API pública del Arsenal Registry del Ninja AI Framework.
 *
 * Importa desde aquí en cualquier otro paquete:
 *   import { ArsenalRegistry, bootstrap } from '@ninja/arsenal-registry';
 */

// Tipos y contratos
export type {
  ToolDefinition,
  SkillDefinition,
  ToolCategory,
  ToolPermission,
  ToolContext,
  ToolResult,
  ToolHandler,
  ArsenalSnapshot,
} from './schema.js';

// Registry principal
export { ArsenalRegistry } from './registry.js';

// Skill exporter — converts SkillDefinition[] to NinjaSkill-compatible objects
export { exportSkillsForInjection, type ExportedSkill } from './skill-exporter.js';

// Sistema de permisos
export { checkPermission, validateAndExecute, type PermissionResult } from './permission-guard.js';

// Funciones de bootstrap
export { bootstrap, loadNativeTools, loadNativeSkills } from './loader.js';

// Content pack (inventario real de content/ del repo)
export {
  ContentPackLoader,
  loadContentPack,
  parseSkillFrontmatter,
  resolveContentRoot,
  type ContentPackItem,
  type ContentPackKind,
  type ContentPackLoadResult,
  type ContentPackLoaderOptions,
} from './content-pack-loader.js';

// ---------------------------------------------------------------------------
// MCP Protocol (Model Context Protocol)
// ---------------------------------------------------------------------------

// MCPServer class
export { MCPServer } from './mcp-server.js';

// MCP adapter functions
export { arsenalToolToMCPTool, listMCPTools, executeMCPTool } from './mcp-adapter.js';

// MCP types
export type {
  MCPTool,
  MCPRequest,
  MCPResponse,
  MCPError,
  MCPResult,
  MCPContentBlock,
  MCPTextContent,
  MCPImageContent,
  MCPResourceContent,
  MCPToolCallResult,
  MCPToolsListResult,
  MCPInitializeResult,
  MCPServerInfo,
  MCPServerCapabilities,
  MCPToolAnnotations,
  JSONSchema,
} from './mcp-schema.js';

// MCP constants
export {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_ERROR_CODES,
} from './mcp-schema.js';
