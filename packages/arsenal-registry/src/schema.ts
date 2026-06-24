import type { ID, Result } from '@ninja/contracts';

/**
 * Categorías de herramientas disponibles en el sistema
 */
export type ToolCategory =
  | 'filesystem'
  | 'git'
  | 'shell'
  | 'http'
  | 'ai'
  | 'code'
  | 'data'
  | 'custom';

/**
 * Niveles de permiso para herramientas
 */
export type ToolPermission =
  | 'safe' // Ejecución automática segura
  | 'confirm' // Requiere confirmación del usuario
  | 'restricted' // Requiere permisos especiales
  | 'blocked'; // Bloqueada completamente

/**
 * Enum de niveles de permiso para herramientas
 */
export enum ToolPermissionEnum {
  Safe = 'safe',
  Confirm = 'confirm',
  Restricted = 'restricted',
  Blocked = 'blocked',
}

/**
 * Contexto de ejecución para herramientas
 */
export interface ToolContext {
  readonly agentId: ID;
  readonly runId: ID;
  readonly sessionId: ID;
  readonly permissions: Set<ToolPermission>;
}

/**
 * Resultado de ejecución de herramienta
 */
export interface ToolResult<TOutput = unknown> {
  readonly success: boolean;
  readonly output?: TOutput;
  readonly error?: string;
  readonly duration: number; // en milisegundos
}

/**
 * Handler de ejecución de herramienta
 */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ToolContext
) => Promise<ToolResult<TOutput>>;

/**
 * Definición de herramienta
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly id: string; // Ej: "fs.read", "git.clone"
  readonly name: string; // Nombre técnico
  readonly friendlyName: string; // Nombre descriptivo amigable
  readonly description: string;
  readonly category: ToolCategory;
  readonly permission: ToolPermission;
  readonly inputSchema?: unknown; // Para validación con Zod
  readonly outputSchema?: unknown; // Para validación con Zod
  readonly handler: ToolHandler<TInput, TOutput>;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Definición de skill/comportamiento
 */
export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tools: string[]; // IDs de herramientas
  readonly workflowId?: string; // ID opcional del workflow asociado
  readonly agentRole: string; // Rol del agente que puede usar esta skill
  readonly metadata?: Record<string, unknown>;
}

/**
 * Esquemas de entrada/salida para validación
 */
export interface ToolInputSchema {
  // Definición para validación de entrada
}

export interface ToolOutputSchema {
  // Definición para validación de salida
}

/**
 * Snapshot del estado completo del registry
 */
export interface ArsenalSnapshot {
  readonly timestamp: string;
  readonly tools: Map<string, ToolDefinition<unknown, unknown>>;
  readonly skills: Map<string, SkillDefinition>;
}
