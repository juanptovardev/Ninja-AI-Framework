/**
 * @ninja/agent-runtime — executor-budget.test.ts
 * TDD tests for pre-call budget enforcement in AgentExecutor (WP-B4)
 * RED phase — implementation not yet added.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentExecutor } from './executor';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus';
import type { LLMClient, LLMRequest, LLMResponse } from '@ninja/integrations-llm';
import type { Logger } from '@ninja/logging';
import type { ArsenalRegistry } from '@ninja/arsenal-registry';
import type { RunRepository, ArtifactRepository } from '@ninja/trace-ledger';
import type { WorkflowStep, WorkflowContext } from '@ninja/flow-matrix';
import type { BudgetManager } from '@ninja/model-gateway';
import { BudgetError } from '@ninja/contracts';

// ─── Test doubles ──────────────────────────────────────────────────────────

class SimpleMockLLM implements Pick<LLMClient, 'complete' | 'stream'> {
  public callCount = 0;

  async complete(req: LLMRequest): Promise<LLMResponse> {
    this.callCount++;
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

function makeMockBudgetManager(overBudget: boolean): BudgetManager {
  return {
    isOverBudget: vi.fn().mockReturnValue(overBudget),
    record: vi.fn(),
    getSessionSummary: vi.fn().mockReturnValue(undefined),
    getGlobalUsage: vi.fn().mockReturnValue({ totalPrompt: 0, totalCompletion: 0, estimatedCost: 0, modelBreakdown: {} }),
    reset: vi.fn(),
    setSessionBudget: vi.fn(),
  } as unknown as BudgetManager;
}

function createMockLogger(): Logger {
  return { name: 'test', debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
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

describe('AgentExecutor — budget enforcement (WP-B4)', () => {
  let mockEventBus: MockEventBus;
  let mockLogger: Logger;

  beforeEach(() => {
    mockEventBus = new MockEventBus();
    mockLogger = createMockLogger();
  });

  it('when isOverBudget=true → throws BudgetError BEFORE calling LLM', async () => {
    const llm = new SimpleMockLLM();
    const budgetManager = makeMockBudgetManager(true);

    const executor = new AgentExecutor(
      llm as unknown as LLMClient,
      baseRepos.arsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.runRepository,
      baseRepos.artifactRepository,
      mockLogger,
      undefined,   // modelSelector
      undefined,   // fallbackChain
      'strict',    // llmFailMode
      budgetManager,
      5000,        // sessionTokenBudget
    );

    const result = await executor.executeStep(makeWorkflowStep(), makeWorkflowContext());

    expect(llm.callCount).toBe(0);
    expect(result.status).toBe('failed');
  });

  it('when isOverBudget=false → LLM is called normally', async () => {
    const llm = new SimpleMockLLM();
    const budgetManager = makeMockBudgetManager(false);

    const executor = new AgentExecutor(
      llm as unknown as LLMClient,
      baseRepos.arsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.runRepository,
      baseRepos.artifactRepository,
      mockLogger,
      undefined,
      undefined,
      'strict',
      budgetManager,
      5000,
    );

    const result = await executor.executeStep(makeWorkflowStep(), makeWorkflowContext());

    expect(llm.callCount).toBe(1);
    expect(result.status).toBe('completed');
  });

  it('without budgetManager → LLM is called (backward compat)', async () => {
    const llm = new SimpleMockLLM();

    const executor = new AgentExecutor(
      llm as unknown as LLMClient,
      baseRepos.arsenalRegistry,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.runRepository,
      baseRepos.artifactRepository,
      mockLogger,
      // no modelSelector, no fallbackChain, no llmFailMode, no budgetManager
    );

    const result = await executor.executeStep(makeWorkflowStep(), makeWorkflowContext());

    expect(llm.callCount).toBe(1);
    expect(result.status).toBe('completed');
  });
});
