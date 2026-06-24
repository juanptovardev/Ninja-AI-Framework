// Tipos y contratos
export type {
  AgentRole,
  AgentStatus,
  AgentDefinition,
  AgentInstance,
  AgentTask,
  AgentMemory,
  AgentEvent,
  AgentEventPayload,
  AgentCommitRecord,
} from './schema';

// Clases principales
export { AgentExecutor } from './executor';
export { MemoryManager } from './memory';

// Definiciones de agentes
export {
  AGENT_DEFINITIONS,
  PLANNER_DEFINITION,
  PLANIFICATOR_DEFINITION,
  LIBRARIAN_DEFINITION,
  DB_ARCHITECT_DEFINITION,
  BACKEND_DEFINITION,
  CONNECTOR_DEFINITION,
  DESIGNER_DEFINITION,
  TESTER_DEFINITION,
  QUALITY_GATE_DEFINITION,
  SECURITY_DEFINITION,
  BUILD_FIXER_DEFINITION,
} from './definitions';

// Mapeo de departamentos
export {
  DEPARTMENT_MAPPINGS,
  getDepartmentByAgentRole,
  getAgentRolesByDepartment,
} from './departments';
