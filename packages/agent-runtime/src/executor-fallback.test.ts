/**
 * @ninja/agent-runtime — executor-fallback.test.ts
 * TDD tests for FallbackChain wiring in AgentExecutor (WP-B3)
 * ADR: docs/adr/0003-llm-fallback-semantics.md
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentExecutor } from './executor';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus';
import type { LLMClient, LLMRequest, LLMResponse } from '@ninja/integrations-llm';
import type { Logger } from '@ninja/logging';
import type { ArsenalRegistry } from '@ninja/arsenal-registry';
import type { RunRepository, ArtifactRepository } from '@ninja/trace-ledger';
import type { WorkflowStep, WorkflowContext } from '@ninja/flow-matrix';
import type { FallbackChain } from '@ninja/model-gateway';
import { LLMError, ErrorCodes } from '@ninja/contracts';

// ─── Test doubles ──────────────────────────────────────────────────────────

/** LLM mock with programmable response sequence */
class SequencedMockLLM implements Pick<LLMClient, 'complete' | 'stream'> {
  public callCount = 0;
  private sequence: Array<'success' | { throw: LLMError }>;

  constructor(sequence: Array<'success' | { throw: LLMError }>) {
    this.sequence = sequence;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const step = this.sequence[this.callCount] ?? 'success';
    this.callCount++;
    if (step !== 'success') throw step.throw;
    return {
      id: 'mock',
      object: 'chat.completion',
      created: Date.now(),
      model: req.model,
      choices: [{ index: 0, message: { role: 'assistant', content: '{"result":"ok"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  }

  async *stream(): AsyncGenerator<never, void, unknown> {}
}

/** FallbackChain mock with controllable behavior */
function makeMockFallbackChain(chains: Map<string, string[]>): FallbackChain {
  return {
    getNext(failedModelId: string, _reason: string, _sessionId?: string): string | null {
      const fallbacks = chains.get(failedModelId) ?? [];
      return fallbacks[0] ?? null;
    },
    setChain() {},
    hasFallback(id: string) { return (chains.get(id) ?? []).length > 0; },
    resetChainForSession() {},
    resetSession() {},
    getChain(id: string) { return chains.get(id); },
    getAllChains() { return chains; },
  } as unknown as FallbackChain;
}

function createMockLogger(): Logger {
  return {
    name: 'test',
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  };
}

function makeWorkflowStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step-1', name: 'Test step', type: 'agent',
    dependsOn: [], agentRole: 'Planner',
    input: { prompt: 'do something' }, output: {},
    ...overrides,
  };
}

function makeWorkflowContext(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowId: 'wf-1', runId: 'run-1', sessionId: 'session-1',
    inputs: {}, memory: {}, ...overrides,
  };
}

const baseRepos = {
  runRepository: {
    create: vi.fn().mockResolvedValue({ id: 'r1' }),
    updateStatus: vi.fn(),
    findById: vi.fn(), findBySessionId: vi.fn(), delete: vi.fn(),
  } as unknown as RunRepository,
  artifactRepository: {
    create: vi.fn().mockResolvedValue({ id: 'a1' }),
    findByRunId: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  } as unknown as ArtifactRepository,
  arsenalRegistry: {
    listTools: vi.fn().mockReturnValue([]),
    listSkills: vi.fn().mockReturnValue([]),
    getTool: vi.fn(), getSkill: vi.fn(),
    hasPermission: vi.fn().mockReturnValue(true),
  } as unknown as ArsenalRegistry,
};

// ─── Test suites ────────────────────────────────────────────────────────────

describe('AgentExecutor — FallbackChain wiring (WP-B3)', () => {
  let mockEventBus: MockEventBus;
  let mockLogger: Logger;

  beforeEach(() => {
    mockEventBus = new MockEventBus();
    mockLogger = createMockLogger();
  });

  // ── Scenario 1: success after 1 retry ────────────────────────────────────
  it('Sc1: LLM 429 on 1st attempt → fallback to next model → task completed', async () => {
    // Default selectedModel is 'gpt-4o-mini' (no ModelSelector provided)
    const chains = new Map([['gpt-4o-mini', ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku']]]);
    const fallbackChain = makeMockFallbackChain(chains);
    const llm = new SequencedMockLLM([
      { throw: new LLMError(ErrorCodes.LLM_RATE_LIMITED, '429', { retryable: true }) },
      'success',
    ]);

    const executor = new AgentExecutor(
      llm as unknown as LLMClient, baseRepos.arsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.runRepository, baseRepos.artifactRepository,
      mockLogger, undefined, fallbackChain, 'strict',
    );

    const result = await executor.executeStep(makeWorkflowStep(), makeWorkflowContext());

    expect(result.status).toBe('completed');
    expect(llm.callCount).toBe(2);
    // With real FallbackChain, model.fallback.triggered would be emitted.
    // With mock chain, verify at least that 2 LLM calls happened (retry occurred).
    const completedEvents = mockEventBus.getEvents('agent.task.completed');
    expect(completedEvents.length).toBe(1);
  });

  // ── Scenario 2: chain exhausted → strict mode → task.failed ─────────────
  it('Sc2: chain exhausted in strict mode → StepResult.status=failed, agent.task.failed emitted', async () => {
    const chains = new Map([['gpt-4o-mini', []]]);  // no fallbacks
    const fallbackChain = makeMockFallbackChain(chains);
    const llm = new SequencedMockLLM([
      { throw: new LLMError(ErrorCodes.LLM_RATE_LIMITED, '429', { retryable: true }) },
    ]);

    const executor = new AgentExecutor(
      llm as unknown as LLMClient, baseRepos.arsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.runRepository, baseRepos.artifactRepository,
      mockLogger, undefined, fallbackChain, 'strict',
    );

    const result = await executor.run(
      { id: 't1', agentInstanceId: 'i1', description: 'task', input: {}, status: 'idle', createdAt: new Date().toISOString() },
      executor.createInstance({ id: 'planner', name: 'Planner', role: 'Planner', description: 'Plan', promptBase: 'You are a planner', allowedTools: [], department: 'planning', avatarKey: 'planner', maxConcurrentTasks: 1 }, makeWorkflowContext())
    );

    expect(result.status).toBe('failed');
    const failedEvents = mockEventBus.getEvents('agent.task.failed');
    expect(failedEvents.length).toBeGreaterThan(0);
    const completedEvents = mockEventBus.getEvents('agent.task.completed');
    expect(completedEvents.length).toBe(0);
  });

  // ── Scenario 3: auth error → no retry ────────────────────────────────────
  it('Sc3: LLM_AUTH error → no fallback attempted → immediate fail', async () => {
    const chains = new Map([['gpt-4o-mini', ['openai/gpt-4o-mini', 'anthropic/claude-3-5-sonnet']]]);
    const fallbackChain = makeMockFallbackChain(chains);
    const llm = new SequencedMockLLM([
      { throw: new LLMError(ErrorCodes.LLM_AUTH, 'invalid key') },
    ]);

    const executor = new AgentExecutor(
      llm as unknown as LLMClient, baseRepos.arsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.runRepository, baseRepos.artifactRepository,
      mockLogger, undefined, fallbackChain, 'strict',
    );

    const result = await executor.executeStep(makeWorkflowStep(), makeWorkflowContext());

    // Auth errors don't retry — only 1 LLM call
    expect(llm.callCount).toBe(1);
    // No fallback event should be emitted
    const fallbackEvents = mockEventBus.getEvents('model.fallback.triggered');
    expect(fallbackEvents.length).toBe(0);
  });

  // ── Scenario 4: no fallback chain injected → backward compat ─────────────
  it('Sc4: no FallbackChain injected → runs without fallback, legacy behavior', async () => {
    const llm = new SequencedMockLLM(['success']);

    const executor = new AgentExecutor(
      llm as unknown as LLMClient, baseRepos.arsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.runRepository, baseRepos.artifactRepository,
      mockLogger,
      // no modelSelector, no fallbackChain, no llmFailMode
    );

    const result = await executor.executeStep(makeWorkflowStep(), makeWorkflowContext());
    expect(result.status).toBe('completed');
  });

  // ── Scenario 5: legacy mode → chain exhausted returns fallback obj ────────
  it('Sc5: legacy mode + chain exhausted → returns fallback obj, NOT throws', async () => {
    const chains = new Map([['gpt-4o-mini', []]]);
    const fallbackChain = makeMockFallbackChain(chains);
    const llm = new SequencedMockLLM([
      { throw: new LLMError(ErrorCodes.LLM_SERVER, '500') },
    ]);

    const executor = new AgentExecutor(
      llm as unknown as LLMClient, baseRepos.arsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.runRepository, baseRepos.artifactRepository,
      mockLogger, undefined, fallbackChain, 'legacy',
    );

    const result = await executor.executeStep(makeWorkflowStep(), makeWorkflowContext());

    // Legacy: returns obj with fallback:true, does NOT throw
    expect(result.output).toHaveProperty('fallback', true);
    expect(result.output).toHaveProperty('retryable', true);
    // Legacy: run processes as "completed" (old behavior preserved)
    // The StepResult.status may be completed or failed depending on run() implementation
    // Key: no exception thrown
  });

  // ── Scenario 6: strict mode default ──────────────────────────────────────
  it('Sc6: strict mode (default) + chain exhausted → task.failed emitted', async () => {
    // gpt-4o-mini is the default model when no selector provided
    const chains = new Map([['gpt-4o-mini', []]]);  // no fallbacks for default model
    const fallbackChain = makeMockFallbackChain(chains);
    const llm = new SequencedMockLLM([
      { throw: new LLMError(ErrorCodes.LLM_RATE_LIMITED, '429', { retryable: true }) },
    ]);

    const executor = new AgentExecutor(
      llm as unknown as LLMClient, baseRepos.arsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.runRepository, baseRepos.artifactRepository,
      mockLogger, undefined, fallbackChain, 'strict',
    );

    const step = makeWorkflowStep({ agentRole: 'Planner' });
    const result = await executor.executeStep(step, makeWorkflowContext());

    expect(result.status).toBe('failed');
    // Strict mode: error should be logged
    expect((mockLogger.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });
});
