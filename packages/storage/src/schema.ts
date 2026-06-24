import type { ID, Timestamp } from '@ninja/contracts';

/**
 * Represents a workspace in the system.
 */
export interface WorkspaceRecord {
  /** Unique identifier for the workspace */
  id: ID;
  /** Display name of the workspace */
  name: string;
  /** File system path to the workspace */
  path: string;
  /** Creation timestamp */
  createdAt: Timestamp;
  /** Last update timestamp */
  updatedAt: Timestamp;
}

/**
 * Represents a session within a workspace.
 */
export interface SessionRecord {
  /** Unique identifier for the session */
  id: ID;
  /** ID of the workspace this session belongs to */
  workspaceId: ID;
  /** Start timestamp of the session */
  startedAt: Timestamp;
  /** End timestamp of the session (null if still active) */
  endedAt: Timestamp | null;
}

/**
 * Represents a run within a session.
 */
export interface RunRecord {
  /** Unique identifier for the run */
  id: ID;
  /** ID of the session this run belongs to */
  sessionId: ID;
  /** Mode of execution (e.g., 'train', 'test', 'predict') */
  mode: string;
  /** Status of the run (e.g., 'pending', 'running', 'completed', 'failed') */
  status: string;
  /** Creation timestamp */
  createdAt: Timestamp;
  /** Last update timestamp */
  updatedAt: Timestamp;
}

/**
 * Represents an artifact produced during a run.
 */
export interface ArtifactRecord {
  /** Unique identifier for the artifact */
  id: ID;
  /** ID of the run that produced this artifact */
  runId: ID;
  /** Type of artifact (e.g., 'model', 'dataset', 'log', 'visualization') */
  type: string;
  /** Name of the artifact */
  name: string;
  /** Content of the artifact (could be a path, JSON, etc.) */
  content: string;
  /** Creation timestamp */
  createdAt: Timestamp;
}

/**
 * Represents an event log entry.
 */
export interface EventLogRecord {
  /** Unique identifier for the event */
  id: ID;
  /** Type of event (e.g., 'info', 'warning', 'error') */
  type: string;
  /** Source of the event (e.g., 'runtime', 'trainer', 'validator') */
  source: string;
  /** Payload/data associated with the event */
  payload: string;
  /** Creation timestamp */
  createdAt: Timestamp;
}
