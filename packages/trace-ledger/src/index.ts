// Schema types
export type {
  ArtifactType,
  RunStatus,
  Artifact,
  Session,
  Run,
  AgentRecord,
  CreateArtifactOptions,
  CreateRunOptions,
  CreateSessionOptions,
} from './schema.js';

// Repository classes
export { ArtifactRepository } from './repositories/artifact.repository.js';
export { SessionRepository } from './repositories/session.repository.js';
export { RunRepository } from './repositories/run.repository.js';
export { AgentCommitRepository } from './repositories/agent-commit.repository.js';
export type { AgentCommitRow } from './repositories/agent-commit.repository.js';

// Event persistence functionality
export { startEventPersistence } from './event-log.js';

// Agent log functionality
export type { AgentLogEntry } from './agent-log.js';
export { logAgentResult, getAgentLogs } from './agent-log.js';
