import type { ID } from '@ninja/contracts';
import { ErrorCodes, FlowError, isNinjaError } from '@ninja/contracts';
import type { EventBus } from '@ninja/events';
import { retryWithBackoff, safeJsonParse } from '@ninja/common-utils';
import { createLogger } from '@ninja/logging';
import type {
  ArtifactType,
  ArtifactRepository,
  RunRepository,
  RunStatus,
} from '@ninja/trace-ledger';
import type {
  StepResult,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowResult,
  WorkflowState,
  WorkflowStatus,
  WorkflowStep,
} from './schema';
import { runWithConcurrency } from './concurrency';
import { buildExecutionPlan } from './graph';
import { StepRunner, type StepHandler } from './step-runner';

const DEFAULT_CONCURRENCY_LIMIT = 4;
const DEFAULT_DEADLOCK_TIMEOUT_MS = 60_000;
const STEP_RESULT_PREFIX = 'Step Result: ';

export interface WorkflowExecutorOptions {
  /** Max steps in flight at once (parallel branches). Must be a positive integer. Default 4. */
  concurrencyLimit?: number;
  /**
   * Watchdog per parallel wave: if a wave does not settle within this window the
   * workflow fails with `FlowError` `FLOW_DEADLOCK_TIMEOUT` instead of hanging.
   * Must be a positive integer (ms). Default 60000.
   */
  deadlockTimeoutMs?: number;
}

function errorMessage(error: unknown): string {
  return isNinjaError(error) || error instanceof Error ? error.message : String(error);
}

function isStepResult(value: unknown): value is StepResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.stepId === 'string' && typeof record.status === 'string';
}

const RETRY_PERSISTENCE = { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: false } as const;

export class WorkflowExecutor {
  private readonly states: Map<string, WorkflowState> = new Map();
  private readonly stepRunner: StepRunner;
  private readonly log = createLogger('flow-matrix');
  private readonly concurrencyLimit: number;
  private readonly deadlockTimeoutMs: number;

  constructor(
    private readonly eventBus: EventBus,
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository,
    options: WorkflowExecutorOptions = {}
  ) {
    const rawConcurrency = options.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT;
    const rawDeadlock = options.deadlockTimeoutMs ?? DEFAULT_DEADLOCK_TIMEOUT_MS;
    if (!Number.isInteger(rawConcurrency) || rawConcurrency < 1) {
      throw new FlowError(
        ErrorCodes.FLOW_INVALID_OPTIONS,
        `concurrencyLimit must be a positive integer, got ${String(options.concurrencyLimit)}`
      );
    }
    if (!Number.isInteger(rawDeadlock) || rawDeadlock < 1) {
      throw new FlowError(
        ErrorCodes.FLOW_INVALID_OPTIONS,
        `deadlockTimeoutMs must be a positive integer, got ${String(options.deadlockTimeoutMs)}`
      );
    }
    this.concurrencyLimit = rawConcurrency;
    this.deadlockTimeoutMs = rawDeadlock;
    this.stepRunner = new StepRunner(eventBus);
  }

  /**
   * Executes a workflow definition with the given context.
   * Independent branches run in parallel waves (bounded by concurrencyLimit);
   * a wave that never settles fails with FLOW_DEADLOCK_TIMEOUT. Never hangs.
   */
  async execute(
    definition: WorkflowDefinition,
    context: WorkflowContext,
    handler: StepHandler
  ): Promise<WorkflowResult> {
    const runId = context.runId;

    const initialState: WorkflowState = {
      status: 'pending',
      stepResults: {},
      memory: { ...context.memory },
      startedAt: new Date().toISOString(),
    };
    this.states.set(runId, initialState);

    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'workflow.started',
      source: 'flow-matrix',
      timestamp: new Date().toISOString(),
      payload: {
        workflowId: context.workflowId,
        runId,
        status: 'pending',
      },
    });

    await this.persistStatus(runId, 'running');

    try {
      const runningState: WorkflowState = { ...initialState, status: 'running' };
      this.states.set(runId, runningState);

      const plan = buildExecutionPlan(definition.steps);

      for (const wave of plan.waves) {
        const currentState = this.getState(runId);
        if (currentState === null || currentState.status === 'cancelled') break;

        const settled = await this.runWave(wave, context, handler);
        for (let i = 0; i < wave.length; i += 1) {
          const step = wave[i];
          const outcome = settled[i];
          const stepResult = this.collectStepResult(step.id, outcome);
          this.updateStepResult(runId, stepResult);
          await this.persistStepArtifact(runId, step, stepResult);
        }
      }

      const finalState = this.getState(runId);
      if (finalState === null) {
        throw new FlowError(ErrorCodes.FLOW_STATE_LOST, 'Workflow state lost during execution');
      }

      const finalStatus: WorkflowStatus = Object.values(finalState.stepResults).every(
        (result) => result.status === 'completed'
      )
        ? 'completed'
        : 'failed';

      const completedAt = new Date().toISOString();
      const finalStateWithCompletion: WorkflowState = {
        ...finalState,
        status: finalStatus,
        completedAt,
        duration:
          completedAt && finalState.startedAt
            ? new Date(completedAt).getTime() - new Date(finalState.startedAt).getTime()
            : undefined,
      };
      this.states.set(runId, finalStateWithCompletion);

      await this.persistStatus(runId, finalStatus);

      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'workflow.completed',
        source: 'flow-matrix',
        timestamp: completedAt,
        payload: {
          workflowId: context.workflowId,
          runId,
          status: finalStatus,
        },
      });

      return {
        status: finalStatus,
        stepResults: finalStateWithCompletion.stepResults,
        finalMemory: finalStateWithCompletion.memory,
        startedAt: finalStateWithCompletion.startedAt,
        completedAt: finalStateWithCompletion.completedAt,
        duration: finalStateWithCompletion.duration,
      };
    } catch (error) {
      const failedAt = new Date().toISOString();
      const currentState = this.getState(runId);
      if (currentState !== null) {
        const failedState: WorkflowState = {
          ...currentState,
          status: 'failed',
          completedAt: failedAt,
        };
        this.states.set(runId, failedState);

        await this.persistStatus(runId, 'failed');

        this.eventBus.emit({
          id: crypto.randomUUID(),
          type: 'workflow.failed',
          source: 'flow-matrix',
          timestamp: failedAt,
          payload: {
            workflowId: context.workflowId,
            runId,
            status: 'failed',
            data: { error: errorMessage(error) },
          },
        });
      }
      throw error;
    }
  }

  /**
   * Pauses a running workflow.
   */
  async pause(workflowId: string): Promise<void> {
    const state = this.getState(workflowId);
    if (state !== null && state.status === 'running') {
      const pausedState: WorkflowState = { ...state, status: 'paused' };
      this.states.set(workflowId, pausedState);

      // RunStatus has no 'paused' sibling semantics in the ledger; pending is the closest.
      await this.persistStatus(workflowId, 'pending');

      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'workflow.paused',
        source: 'flow-matrix',
        timestamp: new Date().toISOString(),
        payload: { workflowId, runId: workflowId, status: 'paused' },
      });
    }
  }

  /**
   * Resumes a paused workflow.
   */
  async resume(workflowId: string): Promise<void> {
    const state = this.getState(workflowId);
    if (state !== null && state.status === 'paused') {
      const resumedState: WorkflowState = { ...state, status: 'running' };
      this.states.set(workflowId, resumedState);

      await this.persistStatus(workflowId, 'running');

      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'workflow.resumed',
        source: 'flow-matrix',
        timestamp: new Date().toISOString(),
        payload: { workflowId, runId: workflowId, status: 'running' },
      });
    }
  }

  /**
   * Cancels a running or paused workflow.
   */
  async cancel(workflowId: string): Promise<void> {
    const state = this.getState(workflowId);
    if (state !== null && (state.status === 'running' || state.status === 'paused')) {
      const cancelledState: WorkflowState = {
        ...state,
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      };
      this.states.set(workflowId, cancelledState);

      await this.persistStatus(workflowId, 'cancelled');

      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'workflow.cancelled',
        source: 'flow-matrix',
        timestamp: new Date().toISOString(),
        payload: { workflowId, runId: workflowId, status: 'cancelled' },
      });
    }
  }

  /**
   * Gets the current in-memory state of a workflow.
   */
  getState(workflowId: string): WorkflowState | null {
    return this.states.get(workflowId) || null;
  }

  /**
   * Rebuilds the persisted state of a run from Trace Ledger (run status + step
   * result artifacts). Returns null when the run was never persisted. This is
   * the restart-survival surface: state written by one executor instance stays
   * visible to a new one sharing the same repositories.
   */
  async getRunSnapshot(runId: string): Promise<WorkflowState | null> {
    const run = this.runRepository.findById(runId);
    if (run === null) return null;

    const stepResults: Record<ID, StepResult> = {};
    for (const artifact of this.artifactRepository.findByRunId(runId)) {
      if (!artifact.name.startsWith(STEP_RESULT_PREFIX)) continue;
      const parsed = safeJsonParse(artifact.content);
      if (!parsed.ok) {
        this.log.warn('Ignoring unparseable step-result artifact while rebuilding state', {
          runId,
          artifactName: artifact.name,
          error: parsed.error,
        });
        continue;
      }
      if (!isStepResult(parsed.value)) continue;
      stepResults[parsed.value.stepId] = parsed.value;
    }

    return { status: run.status, stepResults, memory: {} };
  }

  /**
   * Runs a single parallel wave with a bounded concurrency pool and a deadlock
   * watchdog. All steps in a wave are mutually independent.
   */
  private async runWave(
    wave: WorkflowStep[],
    context: WorkflowContext,
    handler: StepHandler
  ): Promise<PromiseSettledResult<StepResult>[]> {
    if (wave.length === 0) return [];

    const tasks = wave.map(
      (step) => (): Promise<StepResult> => this.stepRunner.run(step, context, handler)
    );
    const settle = runWithConcurrency(tasks, this.concurrencyLimit);

    let watchdogHandle: NodeJS.Timeout | undefined;
    const watchdog = new Promise<never>((_, reject) => {
      watchdogHandle = setTimeout(() => {
        reject(
          new FlowError(ErrorCodes.FLOW_DEADLOCK_TIMEOUT, this.deadlockMessage(wave), {
            retryable: true,
            httpStatus: 504,
            context: { runId: context.runId, stepIds: wave.map((step) => step.id) },
          })
        );
      }, this.deadlockTimeoutMs);
    });

    try {
      return await Promise.race([settle, watchdog]);
    } finally {
      if (watchdogHandle !== undefined) clearTimeout(watchdogHandle);
    }
  }

  private deadlockMessage(wave: WorkflowStep[]): string {
    const ids = wave.map((step) => step.id).join(', ');
    return `Parallel wave did not settle within ${this.deadlockTimeoutMs}ms — possible circular wait (deadlock) on steps: ${ids}`;
  }

  private collectStepResult(stepId: ID, outcome: PromiseSettledResult<StepResult>): StepResult {
    if (outcome.status === 'fulfilled') {
      return outcome.value;
    }
    return { stepId, status: 'failed', output: {}, error: errorMessage(outcome.reason) };
  }

  private updateStepResult(workflowId: string, stepResult: StepResult): void {
    const state = this.states.get(workflowId);
    if (state !== undefined) {
      const updatedState: WorkflowState = {
        ...state,
        stepResults: {
          ...state.stepResults,
          [stepResult.stepId]: stepResult,
        },
      };
      this.states.set(workflowId, updatedState);
    }
  }

  private async persistStatus(runId: ID, status: RunStatus): Promise<void> {
    try {
      await retryWithBackoff(
        () => Promise.resolve().then(() => this.runRepository.updateStatus(runId, status)),
        RETRY_PERSISTENCE
      );
    } catch (error) {
      this.log.warn('Failed to persist run status to the Trace Ledger', { runId, status, error });
    }
  }

  private async persistStepArtifact(
    runId: ID,
    step: WorkflowStep,
    stepResult: StepResult
  ): Promise<void> {
    try {
      await retryWithBackoff(
        () =>
          Promise.resolve().then(() =>
            this.artifactRepository.create({
              runId,
              type: 'other' as ArtifactType,
              name: `${STEP_RESULT_PREFIX}${step.name}`,
              content: JSON.stringify(stepResult),
            })
          ),
        RETRY_PERSISTENCE
      );
    } catch (error) {
      this.log.warn('Failed to persist step result as artifact', {
        runId,
        stepId: step.id,
        error,
      });
    }
  }
}
