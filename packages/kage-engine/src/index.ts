// Tipos y contratos
export type {
  EngineMode,
  EngineRequest,
  EnginePlan,
  EnginePlanStep,
  EngineRun,
  EngineStatus,
  EngineEvent,
  EngineEventPayload,
  EngineApproval,
  ApprovalResult,
} from './schema';

// Clases principales
export { KageEngine } from './engine';
export { IntakeProcessor } from './intake';
export { ExecutionCoordinator } from './coordinator';
export { ApprovalManager } from './approvals';

// Componentes HTTP
export type { HttpRoutes } from './routes';
export { HttpController } from './routes';

// Tipos de eventos
export type { KageEngineEvents } from './events'; // Archivo de definición de eventos
