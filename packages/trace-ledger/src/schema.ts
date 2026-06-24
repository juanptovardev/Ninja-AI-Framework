import type { ID, Timestamp } from '@ninja/contracts';
import type { ArtifactRecord, SessionRecord, RunRecord } from '@ninja/storage';

/**
 * Types of artifacts that can be produced by the system.
 */
export type ArtifactType =
  | 'prd'
  | 'plan'
  | 'code'
  | 'test'
  | 'report'
  | 'log'
  | 'template'
  | 'anchor'
  | 'other';

/**
 * Status of a run in the system.
 */
export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Extended artifact interface that builds upon the base ArtifactRecord.
 */
export interface Artifact extends ArtifactRecord {
  /** Type of the artifact */
  type: ArtifactType;
}

/**
 * Extended session interface that builds upon the base SessionRecord.
 */
export interface Session extends SessionRecord {
  // Extends base session with no additional fields for now
  // Additional fields can be added as needed
}

/**
 * Extended run interface that builds upon the base RunRecord.
 */
export interface Run extends RunRecord {
  /** Status of the run */
  status: RunStatus;
}

/**
 * Record of an agent's activity or result.
 */
export interface AgentRecord {
  /** Unique identifier for the agent */
  agentId: string;
  /** Role of the agent in the system */
  role: string;
  /** Summary of the agent's activity or result */
  summary: string;
  /** Timestamp when the record was created */
  timestamp: Timestamp;
}

/**
 * Options for creating a new artifact.
 */
export interface CreateArtifactOptions {
  /** ID of the run that produced this artifact */
  runId: ID;
  /** Type of the artifact */
  type: ArtifactType;
  /** Name of the artifact */
  name: string;
  /** Content of the artifact */
  content: string;
}

/**
 * Options for creating a new run.
 */
export interface CreateRunOptions {
  /** ID of the session this run belongs to */
  sessionId: ID;
  /** Mode of execution for this run */
  mode: string;
  /** Initial status of the run */
  status: RunStatus;
}

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  /** ID of the workspace this session belongs to */
  workspaceId: ID;
  /** Timestamp when the session started */
  startedAt: Timestamp;
}
