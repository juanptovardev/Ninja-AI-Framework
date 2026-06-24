import type { ID, Timestamp } from './common.js';

// Modos de operación del motor
export type EngineMode = 'build' | 'template' | 'repair' | 'workspace';

// Solicitud entrante al motor
export interface EngineRequest {
  id: ID;
  mode: EngineMode;
  prompt: string;
  workspaceId: ID;
  sessionId?: ID;
  context?: Record<string, unknown>;
  options?: Record<string, unknown>;
  createdAt: Timestamp;
}

// Plan generado por el motor
export interface EnginePlan {
  requestId: ID;
  steps: EnginePlanStep[];
  agentAssignments: Record<ID, string>; // Usamos string para el rol para evitar dependencias circulares con agent-runtime
  estimatedDuration?: number;
  workflowId: ID;
  createdAt: Timestamp;
}

// Paso individual en un plan
export interface EnginePlanStep {
  id: ID;
  description: string;
  dependsOn: ID[];
  requiredAgentRole: string;
  estimatedDuration?: number;
}

// Ejecución de un plan
export interface EngineRun {
  id: ID;
  requestId: ID;
  planId: ID;
  status: EngineStatus;
  progress: number;
  activeAgents: ID[];
  artifacts: ID[];
  startedAt: Timestamp;
  updatedAt: Timestamp;
}

// Estados posibles del motor
export type EngineStatus = 'idle' | 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
