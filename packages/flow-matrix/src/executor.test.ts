import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowExecutor } from './executor';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus';
import type { StepHandler } from './step-runner';
import type {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowStep,
  WorkflowState,
  WorkflowResult,
  StepResult,
} from './schema';
import type { EventBus } from '@ninja/events';
import type { RunRepository, ArtifactRepository } from '@ninja/trace-ledger';

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step-1',
    name: 'Step One',
    type: 'agent',
    dependsOn: [],
    input: {},
    output: {},
    ...overrides,
  };
}

function makeDefinition(
  steps: WorkflowStep[],
  overrides: Partial<WorkflowDefinition> = {}
): WorkflowDefinition {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: 'A workflow used in tests',
    steps,
    metadata: {},
    ...overrides,
  };
}

function makeContext(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowId: 'wf-1',
    runId: 'run-1',
    sessionId: 'session-1',
    inputs: {},
    memory: { seed: 'v0' },
    ...overrides,
  };
}

function createRunRepository(): RunRepository {
  return {
    updateStatus: vi.fn<(id: string, status: string) => Promise<unknown>>().mockResolvedValue({}),
  } as unknown as RunRepository;
}

function createArtifactRepository(): ArtifactRepository {
  return {
    create: vi.fn<(options: unknown) => Promise<unknown>>().mockResolvedValue({}),
  } as unknown as ArtifactRepository;
}

describe('WorkflowExecutor', () => {
  let bus: MockEventBus;
  let runRepository: RunRepository;
  let artifactRepository: ArtifactRepository;

  beforeEach(() => {
    bus = new MockEventBus();
    runRepository = createRunRepository();
    artifactRepository = createArtifactRepository();
  });

  function createExecutor(): WorkflowExecutor {
    return new WorkflowExecutor(bus as unknown as EventBus, runRepository, artifactRepository);
  }

  describe('sequential execution', () => {
    it('runs steps strictly in declaration order for an independent chain', async () => {
      const executor = createExecutor();
      const calls: string[] = [];
      const handler: StepHandler = {
        executeStep: vi.fn(async (step: WorkflowStep): Promise<StepResult> => {
          calls.push(step.id);
          return { stepId: step.id, status: 'running', output: {} };
        }),
      };

      await executor.execute(
        makeDefinition([makeStep({ id: 'a' }), makeStep({ id: 'b' }), makeStep({ id: 'c' })]),
        makeContext(),
        handler
      );

      expect(calls).toEqual(['a', 'b', 'c']);
      expect(handler.executeStep).toHaveBeenCalledTimes(3);
    });

    it('topologically orders steps whose dependencies are declared out of order', async () => {
      const executor = createExecutor();
      const calls: string[] = [];
      const handler: StepHandler = {
        executeStep: vi.fn(async (step: WorkflowStep): Promise<StepResult> => {
          calls.push(step.id);
          return { stepId: step.id, status: 'running', output: {} };
        }),
      };

      await executor.execute(
        makeDefinition([
          makeStep({ id: 'c', dependsOn: ['b'] }),
          makeStep({ id: 'b', dependsOn: ['a'] }),
          makeStep({ id: 'a' }),
        ]),
        makeContext(),
        handler
      );

      expect(calls).toEqual(['a', 'b', 'c']);
    });

    it('ignores dependencies pointing at unknown step ids instead of hanging', async () => {
      const executor = createExecutor();
      const handler: StepHandler = {
        executeStep: vi.fn(
          async (step: WorkflowStep): Promise<StepResult> => ({
            stepId: step.id,
            status: 'running',
            output: {},
          })
        ),
      };

      const result = await executor.execute(
        makeDefinition([makeStep({ id: 'a', dependsOn: ['ghost'] })]),
        makeContext(),
        handler
      );

      expect(result.status).toBe('completed');
      expect(Object.keys(result.stepResults)).toEqual(['a']);
    });

    it('returns a result whose stepResults map every executed step and preserves final memory', async () => {
      const executor = createExecutor();
      const handler: StepHandler = {
        executeStep: vi.fn(
          async (step: WorkflowStep): Promise<StepResult> => ({
            stepId: step.id,
            status: 'running',
            output: { done: step.id },
          })
        ),
      };

      const result = await executor.execute(
        makeDefinition([makeStep({ id: 'x' }), makeStep({ id: 'y' })]),
        makeContext({ memory: { seed: 'v0' } }),
        handler
      );

      expect(result.status).toBe('completed');
      expect(Object.keys(result.stepResults).sort()).toEqual(['x', 'y']);
      expect(result.finalMemory).toEqual({ seed: 'v0' });
      expect(result.startedAt).toEqual(expect.any(String));
      expect(result.completedAt).toEqual(expect.any(String));
      expect(result.duration).toEqual(expect.any(Number));
    });

    it('executes a workflow with zero steps and reports completed', async () => {
      const executor = createExecutor();
      const handler: StepHandler = { executeStep: vi.fn() };

      const result = await executor.execute(makeDefinition([]), makeContext(), handler);

      expect(result.status).toBe('completed');
      expect(result.stepResults).toEqual({});
      expect(handler.executeStep).not.toHaveBeenCalled();
    });
  });

  describe('failure propagation', () => {
    it('collects a failed step result with its error message', async () => {
      const executor = createExecutor();
      const handler: StepHandler = {
        executeStep: vi.fn(async (step: WorkflowStep): Promise<StepResult> => {
          if (step.id === 'bad') throw new Error('step exploded');
          return { stepId: step.id, status: 'running', output: {} };
        }),
      };

      const result = await executor.execute(
        makeDefinition([makeStep({ id: 'good' }), makeStep({ id: 'bad' })]),
        makeContext(),
        handler
      );

      expect(result.status).toBe('failed');
      expect(result.stepResults['bad'].status).toBe('failed');
      expect(result.stepResults['bad'].error).toBe('step exploded');
      expect(result.stepResults['good'].status).toBe('completed');
    });

    it('continues executing independent steps after one fails', async () => {
      const executor = createExecutor();
      const executed: string[] = [];
      const handler: StepHandler = {
        executeStep: vi.fn(async (step: WorkflowStep): Promise<StepResult> => {
          executed.push(step.id);
          if (step.id === 'bad') throw new Error('boom');
          return { stepId: step.id, status: 'running', output: {} };
        }),
      };

      await executor.execute(
        makeDefinition([makeStep({ id: 'bad' }), makeStep({ id: 'after' })]),
        makeContext(),
        handler
      );

      expect(executed).toEqual(['bad', 'after']);
    });

    it('persists each step result as an artifact containing the serialized StepResult', async () => {
      const executor = createExecutor();
      const handler: StepHandler = {
        executeStep: vi.fn(
          async (step: WorkflowStep): Promise<StepResult> => ({
            stepId: step.id,
            status: 'running',
            output: { v: 1 },
          })
        ),
      };

      await executor.execute(
        makeDefinition([makeStep({ id: 'a', name: 'Alpha' })]),
        makeContext({ runId: 'run-artifact' }),
        handler
      );

      expect(artifactRepository.create).toHaveBeenCalledTimes(1);
      const options = (artifactRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        runId: string;
        type: string;
        name: string;
        content: string;
      };
      expect(options.runId).toBe('run-artifact');
      expect(options.type).toBe('other');
      expect(options.name).toBe('Step Result: Alpha');
      const parsed = JSON.parse(options.content) as { stepId: string; status: string };
      expect(parsed).toMatchObject({ stepId: 'a', status: 'completed' });
    });

    it('does not abort the workflow when the artifact repository fails', async () => {
      (artifactRepository.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('disk full')
      );
      const executor = createExecutor();
      const handler: StepHandler = {
        executeStep: vi.fn(
          async (step: WorkflowStep): Promise<StepResult> => ({
            stepId: step.id,
            status: 'running',
            output: {},
          })
        ),
      };

      const result = await executor.execute(
        makeDefinition([makeStep({ id: 'a' })]),
        makeContext(),
        handler
      );

      expect(result.status).toBe('completed');
    });

    it('does not abort the workflow when the run repository fails on start', async () => {
      (runRepository.updateStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db locked')
      );
      const executor = createExecutor();
      const handler: StepHandler = {
        executeStep: vi.fn(
          async (step: WorkflowStep): Promise<StepResult> => ({
            stepId: step.id,
            status: 'running',
            output: {},
          })
        ),
      };

      const result = await executor.execute(
        makeDefinition([makeStep({ id: 'a' })]),
        makeContext(),
        handler
      );

      expect(result.status).toBe('completed');
    });

    it('emits workflow.failed and rethrows when the topological sort finds a cycle', async () => {
      const executor = createExecutor();
      const handler: StepHandler = { executeStep: vi.fn() };
      const onFailed = vi.fn();
      bus.on('workflow.failed', onFailed);

      await expect(
        executor.execute(
          makeDefinition([
            makeStep({ id: 'a', dependsOn: ['b'] }),
            makeStep({ id: 'b', dependsOn: ['a'] }),
          ]),
          makeContext(),
          handler
        )
      ).rejects.toThrow('Circular dependency detected in workflow steps');

      expect(onFailed).toHaveBeenCalledTimes(1);
      const event = onFailed.mock.calls[0][0] as import('./schema').WorkflowEvent;
      expect(event.payload).toMatchObject({ workflowId: 'wf-1', runId: 'run-1', status: 'failed' });
      expect(event.payload.data?.error).toBe('Circular dependency detected in workflow steps');
      expect(handler.executeStep).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('emits workflow.started before any step and workflow.completed at the end', async () => {
      const executor = createExecutor();
      const order: string[] = [];
      bus.onAny((event) => {
        if (event.type.startsWith('workflow.')) order.push(event.type);
      });
      const handler: StepHandler = {
        executeStep: vi.fn(
          async (step: WorkflowStep): Promise<StepResult> => ({
            stepId: step.id,
            status: 'running',
            output: {},
          })
        ),
      };

      await executor.execute(makeDefinition([makeStep({ id: 'a' })]), makeContext(), handler);

      expect(order).toEqual([
        'workflow.started',
        'workflow.step.started',
        'workflow.step.completed',
        'workflow.completed',
      ]);
    });

    it('emits workflow.completed with status failed when any step failed', async () => {
      const executor = createExecutor();
      const handler: StepHandler = {
        executeStep: vi.fn(async (step: WorkflowStep): Promise<StepResult> => {
          if (step.id === 'bad') throw new Error('boom');
          return { stepId: step.id, status: 'running', output: {} };
        }),
      };

      await executor.execute(makeDefinition([makeStep({ id: 'bad' })]), makeContext(), handler);

      const completed = bus.getEvents('workflow.completed') as import('./schema').WorkflowEvent[];
      expect(completed).toHaveLength(1);
      expect(completed[0].payload.status).toBe('failed');
    });

    it('persists run status transitions to the Trace Ledger', async () => {
      const executor = createExecutor();
      const handler: StepHandler = {
        executeStep: vi.fn(
          async (step: WorkflowStep): Promise<StepResult> => ({
            stepId: step.id,
            status: 'running',
            output: {},
          })
        ),
      };

      await executor.execute(makeDefinition([makeStep({ id: 'a' })]), makeContext(), handler);

      expect(runRepository.updateStatus).toHaveBeenNthCalledWith(1, 'run-1', 'running');
      expect(runRepository.updateStatus).toHaveBeenNthCalledWith(2, 'run-1', 'completed');
    });
  });

  describe('pause / resume / cancel', () => {
    function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }

    /** Inicia execute() y espera de forma determinista a que el estado sea running con el step bloqueado. */
    async function startBlockedExecution(executor: WorkflowExecutor): Promise<{
      gate: { resolve: (value: StepResult) => void };
      execution: Promise<WorkflowResult>;
    }> {
      const gate = deferred<StepResult>();
      const execution = executor.execute(makeDefinition([makeStep({ id: 'a' })]), makeContext(), {
        executeStep: vi.fn(() => gate.promise),
      });
      await vi.waitFor(() => {
        const status = executor.getState('run-1')?.status;
        if (status !== 'running') throw new Error(`expected running, got ${status}`);
      });
      return { gate, execution };
    }

    it('pause transitions a running workflow to paused, emits workflow.paused and persists pending', async () => {
      const executor = createExecutor();
      const { gate, execution } = await startBlockedExecution(executor);

      await executor.pause('run-1');

      expect(executor.getState('run-1')?.status).toBe('paused');
      const paused = bus.getEvents('workflow.paused');
      expect(paused).toHaveLength(1);
      expect(paused[0].payload).toMatchObject({
        workflowId: 'run-1',
        runId: 'run-1',
        status: 'paused',
      });
      expect(runRepository.updateStatus).toHaveBeenCalledWith('run-1', 'pending');

      gate.resolve({ stepId: 'a', status: 'running', output: {} });
      await execution;
    });

    it('resume transitions a paused workflow back to running and emits workflow.resumed', async () => {
      const executor = createExecutor();
      const { gate, execution } = await startBlockedExecution(executor);

      await executor.pause('run-1');
      await executor.resume('run-1');

      expect(executor.getState('run-1')?.status).toBe('running');
      const resumed = bus.getEvents('workflow.resumed');
      expect(resumed).toHaveLength(1);
      expect(resumed[0].payload).toMatchObject({
        workflowId: 'run-1',
        runId: 'run-1',
        status: 'running',
      });
      expect(runRepository.updateStatus).toHaveBeenCalledWith('run-1', 'running');

      gate.resolve({ stepId: 'a', status: 'running', output: {} });
      await execution;
    });

    it('cancel marks the run cancelled mid-execution and skips remaining steps', async () => {
      const executor = createExecutor();
      const gate = deferred<StepResult>();
      const executed: string[] = [];
      let statusAfterCancel: WorkflowState['status'] | undefined;
      const handler: StepHandler = {
        executeStep: vi.fn(async (step: WorkflowStep): Promise<StepResult> => {
          executed.push(step.id);
          if (step.id === 'a') {
            await gate.promise;
            await executor.cancel('run-1');
            statusAfterCancel = executor.getState('run-1')?.status;
          }
          return { stepId: step.id, status: 'running', output: {} };
        }),
      };
      const execution = executor.execute(
        makeDefinition([makeStep({ id: 'a' }), makeStep({ id: 'b' })]),
        makeContext(),
        handler
      );

      await vi.waitFor(() => {
        const status = executor.getState('run-1')?.status;
        if (status !== 'running') throw new Error(`expected running, got ${status}`);
      });
      gate.resolve({ stepId: 'a', status: 'running', output: {} });
      await execution;

      expect(executed).toEqual(['a']);
      expect(statusAfterCancel).toBe('cancelled');
      const cancelled = bus.getEvents('workflow.cancelled');
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].payload).toMatchObject({
        workflowId: 'run-1',
        runId: 'run-1',
        status: 'cancelled',
      });
      const result = await execution;
      expect(result.stepResults['b']).toBeUndefined();
    });

    it('pause is a no-op with no event for a workflow that never ran', async () => {
      const executor = createExecutor();
      await executor.pause('never-run');
      expect(executor.getState('never-run')).toBeNull();
      expect(bus.getEvents('workflow.paused')).toHaveLength(0);
    });

    it('resume is a no-op with no event for a workflow that never ran', async () => {
      const executor = createExecutor();
      await executor.resume('never-run');
      expect(executor.getState('never-run')).toBeNull();
      expect(bus.getEvents('workflow.resumed')).toHaveLength(0);
    });

    it('cancel is a no-op with no event for a workflow that never ran', async () => {
      const executor = createExecutor();
      await executor.cancel('never-run');
      expect(executor.getState('never-run')).toBeNull();
      expect(bus.getEvents('workflow.cancelled')).toHaveLength(0);
    });

    it('getState returns null for an unknown run id', () => {
      const executor = createExecutor();
      expect(executor.getState('unknown')).toBeNull();
    });
  });
});
