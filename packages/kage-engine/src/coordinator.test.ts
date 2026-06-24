import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ExecutionCoordinator } from './coordinator';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus';
import type { Logger } from '@ninja/logging';
import type { WorkflowExecutor, WorkflowContext, WorkflowResult } from '@ninja/flow-matrix';
import type { AgentExecutor } from '@ninja/agent-runtime';
import type { SessionRepository, RunRepository, ArtifactRepository } from '@ninja/trace-ledger';
import type { EnginePlan as LocalEnginePlan, EnginePlanStep as LocalEnginePlanStep } from './schema';
import type { AgentRole } from '@ninja/agent-runtime';

function createMockLogger(): Logger {
  const logs: Array<{ level: string; message: string; args: unknown[] }> = [];
  const logger: Logger = {
    name: 'test-mock',
    debug: (message: string, ...args: unknown[]) => { logs.push({ level: 'debug', message, args }); },
    info: (message: string, ...args: unknown[]) => { logs.push({ level: 'info', message, args }); },
    warn: (message: string, ...args: unknown[]) => { logs.push({ level: 'warn', message, args }); },
    error: (message: string, ...args: unknown[]) => { logs.push({ level: 'error', message, args }); },
  };
  return logger;
}

function makeEnginePlan(overrides: Partial<LocalEnginePlan> = {}): LocalEnginePlan {
  return {
    requestId: 'req-1',
    steps: [],
    agentAssignments: {},
    workflowId: 'wf-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWorkflowContext(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowId: 'wf-1',
    runId: 'run-1',
    sessionId: 'session-1',
    inputs: { prompt: 'test prompt' },
    memory: {},
    ...overrides,
  };
}

function createWorkflowExecutorMock(): WorkflowExecutor {
  return {
    execute: vi.fn<() => Promise<WorkflowResult>>().mockResolvedValue({
      status: 'completed',
      stepResults: {},
      finalMemory: {},
    } as WorkflowResult),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue(null),
  } as unknown as WorkflowExecutor;
}

describe('ExecutionCoordinator', () => {
  let coordinator: ExecutionCoordinator;
  let mockWorkflowExecutor: WorkflowExecutor;
  let mockAgentExecutor: AgentExecutor;
  let mockSessionRepository: SessionRepository;
  let mockRunRepository: RunRepository;
  let mockArtifactRepository: ArtifactRepository;
  let mockEventBus: MockEventBus;
  let mockLogger: Logger;

  beforeEach(() => {
    mockWorkflowExecutor = createWorkflowExecutorMock();

    mockAgentExecutor = {
      executeStep: vi.fn().mockResolvedValue({
        stepId: 'step-1',
        status: 'completed',
        output: {},
      }),
    } as unknown as AgentExecutor;

    mockSessionRepository = {
      create: vi.fn().mockResolvedValue({ id: 'session-1' }),
      findById: vi.fn(),
      findByWorkspaceId: vi.fn(),
      delete: vi.fn(),
    } as unknown as SessionRepository;

    mockRunRepository = {
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
      updateStatus: vi.fn().mockReturnValue(null),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      delete: vi.fn(),
    } as unknown as RunRepository;

    mockArtifactRepository = {
      create: vi.fn().mockResolvedValue({ id: 'artifact-1' }),
      findByRunId: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    } as unknown as ArtifactRepository;

    mockEventBus = new MockEventBus();
    mockLogger = createMockLogger();

    coordinator = new ExecutionCoordinator(
      mockWorkflowExecutor,
      mockAgentExecutor,
      mockSessionRepository,
      mockRunRepository,
      mockArtifactRepository,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      mockLogger
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startRun', () => {
    it('should create session and run records before starting execution', async () => {
      const plan = makeEnginePlan({ requestId: 'req-1', workflowId: 'wf-1' });
      const context = makeWorkflowContext();

      await coordinator.startRun(plan, context);

      expect(mockSessionRepository.create).toHaveBeenCalled();
      expect(mockRunRepository.create).toHaveBeenCalled();
    });

    it('should emit engine.run.executing event on start', async () => {
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      await coordinator.startRun(plan, context);

      const events = mockEventBus.getEvents('engine.run.executing');
      expect(events.length).toBe(1);
      expect(events[0].payload).toMatchObject({
        status: 'executing',
      });
    });

    it('should return EngineRun with executing status immediately', async () => {
      const plan = makeEnginePlan({ requestId: 'req-test' });
      const context = makeWorkflowContext();

      const run = await coordinator.startRun(plan, context);

      expect(run).toBeDefined();
      expect(run.status).toBe('executing');
      expect(run.progress).toBe(0);
      expect(run.requestId).toBe('req-test');
      expect(run.id).toBeDefined();
    });

    it('should be callable and return without waiting for async workflow completion', async () => {
      let workflowStarted = false;
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(async () => {
        workflowStarted = true;
        await new Promise(resolve => setTimeout(resolve, 50));
        return { status: 'completed', stepResults: {}, finalMemory: {} } as WorkflowResult;
      });
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const runPromise = coordinator.startRun(plan, context);
      expect(workflowStarted).toBe(false);

      await runPromise;
      expect(workflowStarted).toBe(true);
    });

    it('should handle build mode orchestration correctly', async () => {
      let resolveExecute: (result: WorkflowResult) => void;
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(resolve => { resolveExecute = () => resolve({ status: 'completed', stepResults: {}, finalMemory: {} } as WorkflowResult); })
      );

      const plan = makeEnginePlan({
        requestId: 'build-req-1',
        steps: [{ id: 'step-1', description: 'Build step', dependsOn: [], requiredAgentRole: 'Planner' } as LocalEnginePlanStep],
        agentAssignments: { 'step-1': 'Planner' as AgentRole },
      });
      const context = makeWorkflowContext();

      const run = await coordinator.startRun(plan, context);

      await new Promise(resolve => setTimeout(resolve, 0));
      resolveExecute!(undefined as unknown as WorkflowResult);
      await new Promise(resolve => setTimeout(resolve, 0));

      const finalStatus = coordinator.getRunStatus(run.id);
      expect(finalStatus?.status).toBe('completed');
      expect(finalStatus?.progress).toBe(100);
    });

    it('should call runRepository.updateStatus when workflow completes', async () => {
      let resolveExecute: (result: WorkflowResult) => void;
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(resolve => { resolveExecute = () => resolve({ status: 'completed', stepResults: {}, finalMemory: {} } as WorkflowResult); })
      );

      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const run = await coordinator.startRun(plan, context);

      await new Promise(resolve => setTimeout(resolve, 0));
      resolveExecute!(undefined as unknown as WorkflowResult);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRunRepository.updateStatus).toHaveBeenCalledWith(run.id, 'completed');
    });

    it('should map plan steps to WorkflowDefinition steps correctly', async () => {
      const plan = makeEnginePlan({
        requestId: 'req-map',
        workflowId: 'wf-map',
        steps: [
          { id: 'step-1', description: 'desc 1', dependsOn: [], requiredAgentRole: 'Planner', estimatedDuration: 100 },
          { id: 'step-2', description: 'desc 2', dependsOn: ['step-1'], requiredAgentRole: 'Backend' },
        ],
        agentAssignments: {
          'step-1': 'Planner' as AgentRole,
          'step-2': 'Backend' as AgentRole,
        },
      });
      const context = makeWorkflowContext({ inputs: { 'var1': 'value1' } });

      await coordinator.startRun(plan, context);

      expect(mockWorkflowExecutor.execute).toHaveBeenCalled();
      const callArgs = vi.mocked(mockWorkflowExecutor.execute).mock.calls[0];
      const workflowDef: any = callArgs[0];

      expect(workflowDef.steps).toHaveLength(2);
      expect(workflowDef.steps[0]).toMatchObject({
        id: 'step-1',
        name: 'desc 1',
        type: 'agent',
        dependsOn: [],
        agentRole: 'Planner',
        input: { prompt: 'desc 1', context: { 'var1': 'value1' } },
        timeout: 200,
      });
      expect(workflowDef.steps[1]).toMatchObject({
        id: 'step-2',
        name: 'desc 2',
        type: 'agent',
        dependsOn: ['step-1'],
        agentRole: 'Backend',
        input: { prompt: 'desc 2', context: { 'var1': 'value1' } },
        timeout: 300000,
      });
    });
  });

  describe('handleWorkflowError', () => {
    it('should set run status to failed when workflow throws error', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        async () => { throw new Error('Workflow execution failed'); }
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const run = await coordinator.startRun(plan, context);

      await new Promise(resolve => setTimeout(resolve, 0));

      const failedStatus = coordinator.getRunStatus(run.id);
      expect(failedStatus?.status).toBe('failed');
    });

    it('should emit engine.run.failed event when workflow errors', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        async () => { throw new Error('Agent execution failed'); }
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      await coordinator.startRun(plan, context);

      await new Promise(resolve => setTimeout(resolve, 0));

      const failedEvents = mockEventBus.getEvents('engine.run.failed');
      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].payload).toHaveProperty('data');
    });

    it('should call runRepository.updateStatus with failed when workflow throws', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        async () => { throw new Error('Execution failed'); }
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const run = await coordinator.startRun(plan, context);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRunRepository.updateStatus).toHaveBeenCalledWith(run.id, 'failed');
    });

    it('should handle error from agent executor gracefully', async () => {
      let rejectExecute: (error: Error) => void;
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise((_, reject) => { rejectExecute = reject; })
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const run = await coordinator.startRun(plan, context);

      await new Promise(resolve => setTimeout(resolve, 0));
      rejectExecute!(new Error('Agent executor failed'));
      await new Promise(resolve => setTimeout(resolve, 0));

      const status = coordinator.getRunStatus(run.id);
      expect(status?.status).toBe('failed');
    });
  });

  describe('pauseRun', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should pause an executing run', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(() => { /* never resolves — workflow keeps running */ })
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const runPromise = coordinator.startRun(plan, context);
      await vi.advanceTimersByTimeAsync(0);
      const run = await runPromise;

      expect(coordinator.getRunStatus(run.id)?.status).toBe('executing');

      await coordinator.pauseRun(run.id);

      const status = coordinator.getRunStatus(run.id);
      expect(status?.status).toBe('paused');
      expect(mockWorkflowExecutor.pause).toHaveBeenCalledWith(run.id);
    });

    it('should emit engine.run.paused event when pausing', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(() => {})
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const runPromise = coordinator.startRun(plan, context);
      await vi.advanceTimersByTimeAsync(0);
      const run = await runPromise;
      mockEventBus.clear();

      await coordinator.pauseRun(run.id);

      const pausedEvents = mockEventBus.getEvents('engine.run.paused');
      expect(pausedEvents.length).toBe(1);
    });

    it('should call runRepository.updateStatus with paused', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(() => {})
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const runPromise = coordinator.startRun(plan, context);
      await vi.advanceTimersByTimeAsync(0);
      const run = await runPromise;

      await coordinator.pauseRun(run.id);

      expect(mockRunRepository.updateStatus).toHaveBeenCalledWith(run.id, 'paused');
    });

    it('should throw error when pausing non-existent run', async () => {
      await expect(coordinator.pauseRun('non-existent')).rejects.toThrow(
        'Run non-existent not found',
      );
    });
  });

  describe('resumeRun', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should resume a paused run', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(() => {})
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const runPromise = coordinator.startRun(plan, context);
      await vi.advanceTimersByTimeAsync(0);
      const run = await runPromise;
      await coordinator.pauseRun(run.id);
      mockEventBus.clear();

      await coordinator.resumeRun(run.id);

      const status = coordinator.getRunStatus(run.id);
      expect(status?.status).toBe('executing');
      expect(mockWorkflowExecutor.resume).toHaveBeenCalledWith(run.id);
    });

    it('should emit engine.run.executing event when resuming', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(() => {})
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const runPromise = coordinator.startRun(plan, context);
      await vi.advanceTimersByTimeAsync(0);
      const run = await runPromise;
      await coordinator.pauseRun(run.id);
      mockEventBus.clear();

      await coordinator.resumeRun(run.id);

      const resumedEvents = mockEventBus.getEvents('engine.run.executing');
      expect(resumedEvents.length).toBe(1);
    });

    it('should throw error when resuming non-existent run', async () => {
      await expect(coordinator.resumeRun('non-existent')).rejects.toThrow(
        'Run non-existent not found',
      );
    });
  });

  describe('cancelRun', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should cancel an executing run', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(() => {})
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const runPromise = coordinator.startRun(plan, context);
      await vi.advanceTimersByTimeAsync(0);
      const run = await runPromise;
      mockEventBus.clear();

      await coordinator.cancelRun(run.id);

      const status = coordinator.getRunStatus(run.id);
      expect(status?.status).toBe('failed');
      expect(mockWorkflowExecutor.cancel).toHaveBeenCalledWith(run.id);
    });

    it('should emit engine.run.failed event when cancelling', async () => {
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(() => {})
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const runPromise = coordinator.startRun(plan, context);
      await vi.advanceTimersByTimeAsync(0);
      const run = await runPromise;
      mockEventBus.clear();

      await coordinator.cancelRun(run.id);

      const cancelledEvents = mockEventBus.getEvents('engine.run.failed');
      expect(cancelledEvents.length).toBe(1);
    });

    it('should throw error when cancelling non-existent run', async () => {
      await expect(coordinator.cancelRun('non-existent')).rejects.toThrow(
        'Run non-existent not found',
      );
    });
  });

  describe('getRunStatus', () => {
    it('should return null for non-existent run', () => {
      const status = coordinator.getRunStatus('non-existent');

      expect(status).toBeNull();
    });

    it('should return current run status', async () => {
      let resolveExecute: (result: WorkflowResult) => void;
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(resolve => { resolveExecute = () => resolve({ status: 'completed', stepResults: {}, finalMemory: {} } as WorkflowResult); })
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext();

      const run = await coordinator.startRun(plan, context);

      const status = coordinator.getRunStatus(run.id);

      expect(status).toBeDefined();
      expect(status?.id).toBe(run.id);
    });
  });

  describe('coordinator timeout handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should handle workflow that takes extended time', async () => {
      let resolveExecute: (result: WorkflowResult) => void;
      mockWorkflowExecutor.execute = vi.fn<() => Promise<WorkflowResult>>().mockImplementation(
        () => new Promise(resolve => { resolveExecute = () => resolve({ status: 'completed', stepResults: {}, finalMemory: {} } as WorkflowResult); })
      );
      const plan = makeEnginePlan();
      const context = makeWorkflowContext({ inputs: { timeout: 60000 } });

      const runPromise = coordinator.startRun(plan, context);
      await vi.advanceTimersByTimeAsync(0);
      resolveExecute!(undefined as unknown as WorkflowResult);
      await vi.advanceTimersByTimeAsync(0);

      const run = await runPromise;
      const status = coordinator.getRunStatus(run.id);

      expect(status?.status).toBe('completed');
    });
  });
});