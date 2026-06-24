import type { ID, Timestamp, NinjaEvent } from '@ninja/contracts';
import type { 
  EngineMode, 
  EngineRequest as BaseEngineRequest, 
  EnginePlan as BaseEnginePlan, 
  EnginePlanStep as BaseEnginePlanStep, 
  EngineRun as BaseEngineRun, 
  EngineStatus as BaseEngineStatus 
} from '@ninja/contracts';
import type { AgentRole } from '@ninja/agent-runtime';

export type EngineStatus = BaseEngineStatus | 'interviewing';
export type { EngineMode };

export interface InterviewQuestion {
  id: string;
  text: string;
  type: 'open' | 'choice' | 'boolean';
  options?: string[];
  required: boolean;
}

export interface InterviewAnswer {
  questionId: string;
  answer: string;
}

// Re-exportamos con los tipos específicos del paquete si es necesario (ej e AgentRole real)
export interface EngineRequest extends BaseEngineRequest {}

export interface EnginePlan extends Omit<BaseEnginePlan, 'agentAssignments'> {
  agentAssignments: Record<ID, AgentRole>;
  steps: EnginePlanStep[];
}

export interface EnginePlanStep extends Omit<BaseEnginePlanStep, 'requiredAgentRole'> {
  requiredAgentRole: AgentRole;
}

export interface EngineRun extends BaseEngineRun {}

// Evento específico del motor
export interface EngineEventPayload {
  /** ID de la ejecución */
  runId: ID;
  /** ID de la solicitud */
  requestId: ID;
  /** Estado actual */
  status: EngineStatus;
  /** Datos adicionales del evento */
  data?: Record<string, unknown>;
}

export type EngineEvent = NinjaEvent<EngineEventPayload>;

// Solicitud de aprobación al usuario
export interface EngineApproval {
  id: ID;
  runId: ID;
  type: string;
  description: string;
  technicalSummary: string;
  friendlySummary: string;
  requestedAt: Timestamp;
}

// Resultado de una aprobación
export interface ApprovalResult {
  approved: boolean;
  respondedAt: Timestamp;
  notes?: string;
}
