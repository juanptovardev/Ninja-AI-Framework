import type { ID, Timestamp, NinjaEvent } from '@ninja/contracts';
import type { RunRecord, ArtifactRecord } from '@ninja/storage';

// Status types
export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type StepStatus = WorkflowStatus;

// Core entities
export interface WorkflowStep {
  /** Unique identifier for the step */
  id: ID;
  /** Human-readable name of the step */
  name: string;
  /** Type of step (e.g., 'tool', 'agent', 'decision') */
  type: string;
  /** IDs of steps that must complete before this one can start */
  dependsOn: ID[];
  /** Optional tool identifier if this is a tool step */
  toolId?: string;
  /** Optional agent role if this is an agent step */
  agentRole?: string;
  /** Input specification for the step */
  input: Record<string, unknown>;
  /** Output specification for the step */
  output: Record<string, unknown>;
  /** Optional timeout in milliseconds */
  timeout?: number;
}

export interface WorkflowDefinition {
  /** Unique identifier for the workflow */
  id: ID;
  /** Human-readable name of the workflow */
  name: string;
  /** Description of what the workflow does */
  description: string;
  /** Ordered list of steps to execute */
  steps: WorkflowStep[];
  /** Additional metadata about the workflow */
  metadata: Record<string, unknown>;
}

export interface WorkflowContext {
  /** ID of the workflow being executed */
  workflowId: ID;
  /** ID of the current run */
  runId: ID;
  /** ID of the session this workflow belongs to */
  sessionId: ID;
  /** Initial inputs provided to the workflow */
  inputs: Record<string, unknown>;
  /** Shared memory/state accessible to all steps */
  memory: Record<string, unknown>;
}

export interface StepResult {
  /** ID of the step this result corresponds to */
  stepId: ID;
  /** Current status of the step */
  status: StepStatus;
  /** Output produced by the step */
  output: Record<string, unknown>;
  /** Error information if the step failed */
  error?: string;
  /** Duration of step execution in milliseconds */
  duration?: number;
  /** Timestamp when the step started */
  startedAt?: Timestamp;
  /** Timestamp when the step completed */
  completedAt?: Timestamp;
}

export interface WorkflowState {
  /** Current status of the workflow */
  status: WorkflowStatus;
  /** Results of completed steps */
  stepResults: Record<ID, StepResult>;
  /** Current values in shared memory */
  memory: Record<string, unknown>;
  /** Timestamp when the workflow started */
  startedAt?: Timestamp;
  /** Timestamp when the workflow completed */
  completedAt?: Timestamp;
  /** Total duration of workflow execution */
  duration?: number;
}

export interface WorkflowResult {
  /** Final status of the workflow */
  status: WorkflowStatus;
  /** Results from all steps */
  stepResults: Record<ID, StepResult>;
  /** Final values in shared memory */
  finalMemory: Record<string, unknown>;
  /** Error message if the workflow failed */
  error?: string;
  /** Duration of workflow execution in milliseconds */
  duration?: number;
  /** Timestamp when the workflow started */
  startedAt?: Timestamp;
  /** Timestamp when the workflow completed */
  completedAt?: Timestamp;
}

// Events
export interface WorkflowEventPayload {
  /** ID of the workflow */
  workflowId: ID;
  /** ID of the run */
  runId: ID;
  /** Current status of the workflow */
  status: WorkflowStatus;
  /** Additional data related to the event */
  data?: Record<string, unknown>;
}

export type WorkflowEvent = NinjaEvent<WorkflowEventPayload>;
