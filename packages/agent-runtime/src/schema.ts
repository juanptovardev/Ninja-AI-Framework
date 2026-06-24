import type { ID, Timestamp, NinjaEvent } from '@ninja/contracts';
import type { WorkflowStep, StepResult } from '@ninja/flow-matrix';
import type { ToolDefinition, SkillDefinition } from '@ninja/arsenal-registry';

// Agent roles según el Plan Maestro
export type AgentRole =
  | 'Planner'
  | 'Planificator'
  | 'Librarian'
  | 'DBArchitect'
  | 'Backend'
  | 'Connector'
  | 'Designer'
  | 'Tester'
  | 'QualityGate'
  | 'Security'
  | 'BuildFixer';

// Estados posibles de un agente
export type AgentStatus =
  | 'idle'
  | 'planning'
  | 'researching'
  | 'designing'
  | 'building'
  | 'testing'
  | 'validating'
  | 'blocked'
  | 'waiting_confirmation'
  | 'fixing'
  | 'failed'
  | 'completed';

// Definición base de un agente
export interface AgentDefinition {
  /** Identificador único de la definición */
  id: ID;
  /** Rol del agente */
  role: AgentRole;
  /** Nombre descriptivo del agente */
  name: string;
  /** Descripción detallada de las capacidades del agente */
  description: string;
  /** IDs de herramientas permitidas para este agente */
  allowedTools: string[];
  /** Prompt base que guía el comportamiento del agente */
  promptBase: string;
  /** Departamento al que pertenece el agente */
  department: string;
  /** Clave para identificar el avatar del agente en la UI */
  avatarKey: string;
  /** Número máximo de tareas concurrentes permitidas */
  maxConcurrentTasks: number;
}

// Instancia en ejecución de un agente
export interface AgentInstance {
  /** ID de la definición base */
  definitionId: ID;
  /** ID único de esta instancia */
  instanceId: ID;
  /** Estado actual del agente */
  status: AgentStatus;
  /** Tarea actual que está ejecutando (si hay alguna) */
  currentTask?: AgentTask;
  /** Herramientas activas en uso por el agente */
  activeTools: string[];
  /** Memoria de trabajo del agente */
  memory: AgentMemory;
  /** Timestamp de inicio de la instancia */
  startedAt: Timestamp;
  /** Timestamp de última actividad */
  lastActivityAt: Timestamp;
}

// Tarea asignada a un agente
export interface AgentTask {
  /** Identificador único de la tarea */
  id: ID;
  /** ID de la instancia del agente */
  agentInstanceId: ID;
  /** Descripción de lo que debe hacer el agente */
  description: string;
  /** ID del paso del workflow asociado (opcional) */
  stepId?: ID;
  /** ID del workflow asociado (opcional) */
  workflowId?: ID;
  /** Input para la tarea */
  input: Record<string, unknown>;
  /** Estado de la tarea */
  status: AgentStatus;
  /** Timestamp de creación */
  createdAt: Timestamp;
  /** Indica si la tarea es una sub-tarea de un Map-Reduce para evitar recursión */
  isSubTask?: boolean;
}

// Memoria de trabajo corto plazo del agente
export interface AgentMemory {
  /** Contexto de la sesión actual */
  sessionContext: Record<string, unknown>;
  /** Historial reciente de interacciones */
  interactionHistory: Array<{
    timestamp: Timestamp;
    type: string;
    content: unknown;
  }>;
  /** Datos temporales relevantes para la tarea actual */
  taskData: Record<string, unknown>;
  /** Resultados intermedios */
  intermediateResults: Record<string, unknown>;
}

// Evento específico de agente
export interface AgentEventPayload {
  /** ID de la instancia del agente */
  agentInstanceId: ID;
  /** ID de la definición del agente */
  agentDefinitionId: ID;
  /** Rol del agente */
  role: AgentRole;
  /** Estado actual del agente */
  status: AgentStatus;
  /** Datos adicionales relacionados con el evento */
  data?: Record<string, unknown>;
}

export type AgentEvent = NinjaEvent<AgentEventPayload>;

// Registro tipo commit del resultado del agente
export interface AgentCommitRecord {
  /** ID único del registro */
  id: ID;
  /** ID de la instancia del agente */
  agentInstanceId: ID;
  /** ID de la tarea completada */
  taskId: ID;
  /** Resumen ejecutivo del resultado */
  summary: string;
  /** Detalle técnico del resultado */
  technicalDetails: string;
  /** Artefactos producidos */
  artifacts: Array<{
    name: string;
    type: string;
    content: unknown;
  }>;
  /** Timestamp de creación */
  createdAt: Timestamp;
}
// --- Map-Reduce Types ---
export interface SubTask {
  id: ID;
  description: string;
  input: Record<string, unknown>;
  agentRole?: AgentRole;
  isSubTask: boolean;
}

export interface MapReduceResult {
  taskId: ID;
  subResults: Record<string, unknown>[];
  reducedOutput: Record<string, unknown>;
  summary: string;
  metrics: {
    totalTokens: number;
    parallelTasks: number;
    executionTimeMs: number;
  };
}
