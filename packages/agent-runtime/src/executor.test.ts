import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentExecutor } from './executor';
import { MockLLMClient } from '../../../tests/helpers/mock-llm-client';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus';
import type { LLMClient } from '@ninja/integrations-llm';
import type { Logger } from '@ninja/logging';
import type { AgentExecutor as AgentExecutorType } from '@ninja/agent-runtime';
import type { ArsenalRegistry } from '@ninja/arsenal-registry';
import type { RunRepository, ArtifactRepository } from '@ninja/trace-ledger';
import type { WorkflowStep, WorkflowContext } from '@ninja/flow-matrix';
import { PLANNER_DEFINITION, BACKEND_DEFINITION } from './definitions';
import type { ModelSelector } from '@ninja/model-gateway';

function createMockLogger(): Logger {
  const logs: Array<{ level: string; message: string; args: unknown[] }> = [];
  const logger: Logger = {
    name: 'test-mock',
    debug: (message: string, ...args: unknown[]) => {
      logs.push({ level: 'debug', message, args });
    },
    info: (message: string, ...args: unknown[]) => {
      logs.push({ level: 'info', message, args });
    },
    warn: (message: string, ...args: unknown[]) => {
      logs.push({ level: 'warn', message, args });
    },
    error: (message: string, ...args: unknown[]) => {
      logs.push({ level: 'error', message, args });
    },
  };
  return logger;
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

function makeWorkflowStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step-1',
    name: 'Test Step',
    type: 'agent',
    dependsOn: [],
    agentRole: 'Planner',
    input: { prompt: 'test' },
    output: {},
    ...overrides,
  };
}

describe('AgentExecutor', () => {
  let executor: AgentExecutor;
  let mockLLM: MockLLMClient;
  let mockEventBus: MockEventBus;
  let mockLogger: Logger;
  let mockRunRepository: RunRepository;
  let mockArtifactRepository: ArtifactRepository;
  let mockArsenalRegistry: ArsenalRegistry;

  beforeEach(() => {
    mockLLM = new MockLLMClient({
      defaultResponse: JSON.stringify({ result: 'task completed successfully', items: ['a', 'b'] }),
    });
    mockEventBus = new MockEventBus();
    mockLogger = createMockLogger();
    mockRunRepository = {
      create: vi.fn().mockResolvedValue({ id: 'run-mock-1' }),
      updateStatus: vi.fn().mockReturnValue(null),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      delete: vi.fn(),
    } as unknown as RunRepository;
    mockArtifactRepository = {
      create: vi.fn().mockResolvedValue({ id: 'artifact-mock-1' }),
      findByRunId: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    } as unknown as ArtifactRepository;
    mockArsenalRegistry = {
      listTools: vi.fn().mockReturnValue([]),
      listSkills: vi.fn().mockReturnValue([]),
      getTool: vi.fn(),
      getSkill: vi.fn(),
      hasPermission: vi.fn().mockReturnValue(true),
    } as unknown as ArsenalRegistry;

    executor = new AgentExecutor(
      mockLLM as unknown as LLMClient,
      mockArsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      mockRunRepository,
      mockArtifactRepository,
      mockLogger
    );
  });

  describe('createInstance', () => {
    it('should create an agent instance with unique instanceId', () => {
      const instance = executor.createInstance(PLANNER_DEFINITION, makeWorkflowContext());

      expect(instance).toBeDefined();
      expect(instance.instanceId).toBeDefined();
      expect(instance.definitionId).toBe(PLANNER_DEFINITION.id);
      expect(instance.status).toBe('idle');
      expect(instance.memory).toBeDefined();
      expect(instance.startedAt).toBeDefined();
      expect(instance.lastActivityAt).toBeDefined();
    });

    it('should emit agent.instance.created event', () => {
      executor.createInstance(PLANNER_DEFINITION, makeWorkflowContext());

      const events = mockEventBus.getEvents('agent.instance.created');
      expect(events.length).toBe(1);
      expect(events[0].payload).toMatchObject({
        agentDefinitionId: PLANNER_DEFINITION.id,
        role: PLANNER_DEFINITION.role,
        status: 'idle',
      });
    });

    it('should initialize memory with context inputs', () => {
      const context = makeWorkflowContext({ inputs: { projectId: 'proj-123' } });
      const instance = executor.createInstance(PLANNER_DEFINITION, context);

      expect(instance.memory.sessionContext).toEqual({ projectId: 'proj-123' });
    });
  });

  describe('executeStep — StepHandler implementation', () => {
    it('should execute a Planner step and return completed result', async () => {
      const step = makeWorkflowStep({ agentRole: 'Planner' });
      const context = makeWorkflowContext();

      const result = await executor.executeStep(step, context);

      expect(result.status).toBe('completed');
      expect(result.output).toBeDefined();
      expect(result.stepId).toBe('step-1');
    });

    it('should call LLM with agent system prompt', async () => {
      const step = makeWorkflowStep({ agentRole: 'Planner', name: 'Architecture design' });
      const context = makeWorkflowContext();

      await executor.executeStep(step, context);

      expect(mockLLM.callHistory.length).toBeGreaterThanOrEqual(1);
      const lastCall = mockLLM.callHistory[mockLLM.callHistory.length - 1];
      expect(lastCall.request.messages).toBeDefined();
      expect(lastCall.request.messages.length).toBeGreaterThanOrEqual(2);
      expect(lastCall.request.messages[0]!.role).toBe('system');
      expect(lastCall.request.messages[0]!.content).toContain('arquitecto');
    });

    it('should emit agent.llm.called event on successful LLM call', async () => {
      const step = makeWorkflowStep({ agentRole: 'Planner' });
      const context = makeWorkflowContext();

      await executor.executeStep(step, context);

      const events = mockEventBus.getEvents('agent.llm.called');
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit agent.task.completed event on successful execution', async () => {
      const step = makeWorkflowStep({ agentRole: 'Planner' });
      const context = makeWorkflowContext();

      await executor.executeStep(step, context);

      const completedEvents = mockEventBus.getEvents('agent.task.completed');
      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0].payload).toMatchObject({
        role: 'Planner',
        status: 'completed',
      });
    });

    it('should throw error when agentRole is undefined', async () => {
      const step = makeWorkflowStep({ agentRole: undefined as unknown as string });
      const context = makeWorkflowContext();

      await expect(executor.executeStep(step, context)).rejects.toThrow(
        'Step does not specify an agent role'
      );
    });

    it('should throw error when agentRole is unknown', async () => {
      const step = makeWorkflowStep({ agentRole: 'UnknownRole' });
      const context = makeWorkflowContext();

      await expect(executor.executeStep(step, context)).rejects.toThrow(
        'Unknown agent role: UnknownRole'
      );
    });
  });

  describe('executeAgentTask with MockLLMClient', () => {
    it('should parse JSON response from LLM into output.result', async () => {
      const step = makeWorkflowStep({ agentRole: 'Planner', name: 'Create spec' });
      const context = makeWorkflowContext();

      const result = await executor.executeStep(step, context);

      expect(result.status).toBe('completed');
      expect(result.output).toHaveProperty('result');
    });

    it('should include executionContext with model and tokens in output', async () => {
      const step = makeWorkflowStep({ agentRole: 'Planner', name: 'Design architecture' });
      const context = makeWorkflowContext();

      const result = await executor.executeStep(step, context);

      expect(result.output).toHaveProperty('executionContext');
      expect((result.output as Record<string, unknown>).executionContext).toHaveProperty(
        'modelUsed'
      );
      expect((result.output as Record<string, unknown>).executionContext).toHaveProperty(
        'tokensUsed'
      );
    });
  });

  describe('LLM failure fallback', () => {
    beforeEach(() => {
      mockLLM = new MockLLMClient({
        defaultResponse: JSON.stringify({ result: 'success' }),
      });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      executor = new AgentExecutor(
        mockLLM as unknown as LLMClient,
        mockArsenalRegistry,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockRunRepository,
        mockArtifactRepository,
        mockLogger
      );
    });

    it('should handle LLM error gracefully and return fallback result', async () => {
      mockLLM.setNextError({ type: 'server_error', message: 'Service unavailable' });
      const step = makeWorkflowStep({ agentRole: 'Planner', name: 'Task that fails' });
      const context = makeWorkflowContext();

      const result = await executor.executeStep(step, context);

      expect(result.output).toHaveProperty('fallback', true);
      expect(result.output).toHaveProperty('retryable', true);
      expect(result.output).toHaveProperty('status', 'failed');
    });

    it('should emit agent.task.failed event when LLM fails', async () => {
      mockLLM.setNextError({ type: 'server_error', message: 'Service unavailable' });
      const step = makeWorkflowStep({ agentRole: 'Planner', name: 'Failing task' });
      const context = makeWorkflowContext();

      await executor.executeStep(step, context);

      const failedEvents = mockEventBus.getEvents('agent.task.failed');
      expect(failedEvents.length).toBe(1);
    });
  });

  describe('ModelSelector injection', () => {
    it('should use model from ModelSelector when provided', async () => {
      const mockModelSelector: ModelSelector = {
        select: vi.fn().mockReturnValue({
          success: true,
          data: { modelId: 'gpt-4o' },
        }),
      } as unknown as ModelSelector;

      const customExecutor = new AgentExecutor(
        mockLLM as unknown as LLMClient,
        mockArsenalRegistry,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockRunRepository,
        mockArtifactRepository,
        mockLogger,
        mockModelSelector
      );

      const step = makeWorkflowStep({ agentRole: 'Backend' });
      const context = makeWorkflowContext();

      await customExecutor.executeStep(step, context);

      const lastCall = mockLLM.callHistory[mockLLM.callHistory.length - 1];
      expect(lastCall.request.model).toBe('gpt-4o');
    });

    it('should use default model when ModelSelector fails', async () => {
      const mockModelSelector: ModelSelector = {
        select: vi.fn().mockReturnValue({
          success: false,
          error: new Error('No model available'),
        }),
      } as unknown as ModelSelector;

      const customExecutor = new AgentExecutor(
        mockLLM as unknown as LLMClient,
        mockArsenalRegistry,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockRunRepository,
        mockArtifactRepository,
        mockLogger,
        mockModelSelector
      );

      const step = makeWorkflowStep({ agentRole: 'Planner' });
      const context = makeWorkflowContext();

      await customExecutor.executeStep(step, context);

      const lastCall = mockLLM.callHistory[mockLLM.callHistory.length - 1];
      expect(lastCall.request.model).toBe('gpt-4o-mini');
    });
  });

  describe('LLMClient injection', () => {
    it('should inject LLMClient and call complete method', async () => {
      const step = makeWorkflowStep({ agentRole: 'Planner' });
      const context = makeWorkflowContext();

      await executor.executeStep(step, context);

      expect(mockLLM.callHistory.length).toBeGreaterThanOrEqual(1);
      const lastCall = mockLLM.callHistory[mockLLM.callHistory.length - 1];
      expect(lastCall.request).toHaveProperty('model');
      expect(lastCall.request).toHaveProperty('messages');
      expect(Array.isArray(lastCall.request.messages)).toBe(true);
    });

    it('should send user message with task description and input', async () => {
      const step = makeWorkflowStep({
        agentRole: 'Backend',
        name: 'Implement API',
        input: { endpoint: '/users' },
      });
      const context = makeWorkflowContext();

      await executor.executeStep(step, context);

      const lastCall = mockLLM.callHistory[mockLLM.callHistory.length - 1];
      const userMessage = lastCall.request.messages.find(
        (m: { role: string }) => m.role === 'user'
      );
      expect(userMessage!).toBeDefined();
      expect(userMessage!.content).toContain('Implement API');
    });
  });

  describe('instance management', () => {
    it('should return correct status for existing instance', () => {
      const instance = executor.createInstance(PLANNER_DEFINITION, makeWorkflowContext());

      const status = executor.getStatus(instance.instanceId);

      expect(status).toBe('idle');
    });

    it('should return idle for non-existent instance', () => {
      const status = executor.getStatus('non-existent-id');

      expect(status).toBe('idle');
    });

    it('should pause an instance and set status to idle', async () => {
      const instance = executor.createInstance(PLANNER_DEFINITION, makeWorkflowContext());

      await executor.pause(instance.instanceId);

      expect(executor.getStatus(instance.instanceId)).toBe('idle');
      const pausedEvents = mockEventBus.getEvents('agent.instance.paused');
      expect(pausedEvents.length).toBe(1);
    });

    it('should resume a paused instance and set status to planning', async () => {
      const instance = executor.createInstance(PLANNER_DEFINITION, makeWorkflowContext());
      await executor.pause(instance.instanceId);

      await executor.resume(instance.instanceId);

      expect(executor.getStatus(instance.instanceId)).toBe('planning');
      const resumedEvents = mockEventBus.getEvents('agent.instance.resumed');
      expect(resumedEvents.length).toBe(1);
    });

    it('should stop an instance and set status to completed', async () => {
      const instance = executor.createInstance(PLANNER_DEFINITION, makeWorkflowContext());

      await executor.stop(instance.instanceId);

      expect(executor.getStatus(instance.instanceId)).toBe('completed');
      const stoppedEvents = mockEventBus.getEvents('agent.instance.stopped');
      expect(stoppedEvents.length).toBe(1);
    });
  });

  describe('run task execution', () => {
    it('should execute a task via run() method', async () => {
      const instance = executor.createInstance(PLANNER_DEFINITION, makeWorkflowContext());
      const task = {
        id: 'task-1',
        agentInstanceId: instance.instanceId,
        description: 'Plan the architecture',
        stepId: 'step-1',
        workflowId: 'wf-1',
        input: { prompt: 'design a system' },
        status: 'idle' as const,
        createdAt: new Date().toISOString(),
      };

      const result = await executor.run(task, instance);

      expect(result.status).toBe('completed');
      expect(result.stepId).toBe('step-1');
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('should update instance status during execution', async () => {
      const instance = executor.createInstance(BACKEND_DEFINITION, makeWorkflowContext());
      const task = {
        id: 'task-backend',
        agentInstanceId: instance.instanceId,
        description: 'Implement feature',
        input: {},
        status: 'idle' as const,
        createdAt: new Date().toISOString(),
      };

      await executor.run(task, instance);

      expect(executor.getStatus(instance.instanceId)).toBe('completed');
    });
  });

  describe('Backend agent role', () => {
    it('should execute Backend agent step with correct system prompt', async () => {
      const step = makeWorkflowStep({ agentRole: 'Backend', name: 'Implement API' });
      const context = makeWorkflowContext();

      await executor.executeStep(step, context);

      const lastCall = mockLLM.callHistory[mockLLM.callHistory.length - 1];
      const systemMessage = lastCall.request.messages.find(
        (m: { role: string }) => m.role === 'system'
      );
      expect(systemMessage!).toBeDefined();
      expect(systemMessage!.content).toContain('backend');
    });
  });

  describe('Map-Reduce Execution', () => {
    it('should split large tasks and execute in parallel', async () => {
      // Simulate large task
      const longDescription = 'A'.repeat(5000);
      const step = makeWorkflowStep({ agentRole: 'Planner', name: longDescription });
      const context = makeWorkflowContext();

      // Return a generic JSON so it parses successfully
      mockLLM.setDefaultResponse(
        JSON.stringify({ subtasks: ['task1', 'task2'], partial: 1, final: 'reduced' })
      );

      const result = await executor.executeStep(step, context);

      expect(result.status).toBe('completed');
      expect(result.output.reducedOutput).toBeDefined();
    });

    it('should not recurse map-reduce on subtasks', async () => {
      const step = makeWorkflowStep({ agentRole: 'Planner', name: 'A'.repeat(5000) });
      const context = makeWorkflowContext();

      // For the subtasks, they also might be long, but we must not split them again.
      // We'll spy on internal executeAgentTask and executeWithMapReduce if possible, or just
      // rely on the call sequence.
      mockLLM.setDefaultResponse(
        JSON.stringify({
          subtasks: ['long_subtask_1', 'long_subtask_2'],
          partial: 1,
          final: 'reduced',
        })
      );

      const result = await executor.executeStep(step, context);
      expect(result.status).toBe('completed');
    });

    it('should use Promise.allSettled and handle isolated errors without crashing', async () => {
      const longDescription = 'A'.repeat(5000);
      const step = makeWorkflowStep({ agentRole: 'Planner', name: longDescription });
      const context = makeWorkflowContext();

      mockLLM.setDefaultResponse(
        JSON.stringify({ subtasks: ['task1', 'task2'], partial: 2, final: 'reduced with errors' })
      );
      // One fails, one succeeds
      mockLLM.setNextError({ type: 'server_error', message: 'Isolated 500' });

      const result = await executor.executeStep(step, context);
      expect(result.status).toBe('completed');
      expect(result.output.reducedOutput).toBeDefined();
    });
  });
});
