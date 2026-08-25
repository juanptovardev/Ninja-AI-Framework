/**
 * Integration test: engine run survives mid-run LLM failure via FallbackChain (WP-B3, task 4.1)
 * Scope: agent-runtime package — uses real AgentExecutor + real FallbackChain (singleton reset)
 * Strategy: SequencedMockLLM + real FallbackChain instance with catalog IDs
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentExecutor } from '../../packages/agent-runtime/src/executor';
import { FallbackChain } from '../../packages/model-gateway/src/fallback';
import { ModelCatalog } from '../../packages/model-gateway/src/catalog';
import { MockEventBus } from '../helpers/mock-event-bus';
import type { LLMClient, LLMRequest, LLMResponse } from '@ninja/integrations-llm';
import type { Logger } from '@ninja/logging';
import type { ArsenalRegistry } from '@ninja/arsenal-registry';
import type { RunRepository, ArtifactRepository } from '@ninja/trace-ledger';
import type { WorkflowStep, WorkflowContext } from '@ninja/flow-matrix';
import { LLMError, ErrorCodes } from '@ninja/contracts';
import { vi } from 'vitest';

// ─── Sequenced mock LLM (same as executor-fallback.test.ts) ─────────────────
class SequencedMockLLM implements Pick<LLMClient, 'complete' | 'stream'> {
  public callCount = 0;
  private sequence: Array<'success' | { throw: LLMError }>;

  constructor(seq: Array<'success' | { throw: LLMError }>) {
    this.sequence = seq;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const step = this.sequence[this.callCount] ?? 'success';
    this.callCount++;
    if (step !== 'success') throw step.throw;
    return {
      id: 'mock', object: 'chat.completion', created: Date.now(), model: req.model,
      choices: [{ index: 0, message: { role: 'assistant', content: '{"result":"ok"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  }

  async *stream(): AsyncGenerator<never, void, unknown> {}
}

function makeWorkflowStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step-1', name: 'Integration test step', type: 'agent',
    dependsOn: [], agentRole: 'Planner',
    input: { prompt: 'test' }, output: {}, ...overrides,
  };
}

function makeWorkflowContext(): WorkflowContext {
  return { workflowId: 'wf-int', runId: 'r-int', sessionId: 's-int', inputs: {}, memory: {} };
}

describe('Integration: AgentExecutor + FallbackChain (WP-B3)', () => {
  let mockEventBus: MockEventBus;
  let mockLogger: Logger;
  let baseRepos: { run: RunRepository; artifact: ArtifactRepository; arsenal: ArsenalRegistry };

  beforeEach(() => {
    FallbackChain.resetInstance();
    ModelCatalog.resetInstance();
    mockEventBus = new MockEventBus();
    mockLogger = { name: 'int', debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    baseRepos = {
      run: { create: vi.fn().mockResolvedValue({ id: 'r1' }), updateStatus: vi.fn(), findById: vi.fn(), findBySessionId: vi.fn(), delete: vi.fn() } as unknown as RunRepository,
      artifact: { create: vi.fn().mockResolvedValue({ id: 'a1' }), findByRunId: vi.fn().mockResolvedValue([]), delete: vi.fn() } as unknown as ArtifactRepository,
      arsenal: { listTools: vi.fn().mockReturnValue([]), listSkills: vi.fn().mockReturnValue([]), getTool: vi.fn(), getSkill: vi.fn(), hasPermission: vi.fn().mockReturnValue(true) } as unknown as ArsenalRegistry,
    };
  });

  it('run completes when 1st model fails (429) and 2nd model succeeds', async () => {
    // Use real FallbackChain with explicit chain to avoid filesystem catalog dependency
    const realChain = FallbackChain.getInstance(mockEventBus as unknown as import('@ninja/events').EventBus);
    // Override with known catalog-aligned chain for gpt-4o-mini (the default selectedModel)
    realChain.setChain('gpt-4o-mini', ['anthropic/claude-3-haiku']);

    const llm = new SequencedMockLLM([
      { throw: new LLMError(ErrorCodes.LLM_RATE_LIMITED, '429 rate limited', { retryable: true }) },
      'success',
    ]);

    const executor = new AgentExecutor(
      llm as unknown as LLMClient, baseRepos.arsenal,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.run, baseRepos.artifact, mockLogger,
      undefined, realChain, 'strict',
    );

    const result = await executor.executeStep(makeWorkflowStep(), makeWorkflowContext());

    // Task completed after fallback
    expect(result.status).toBe('completed');
    // 2 LLM calls: first failed, second succeeded
    expect(llm.callCount).toBe(2);
    // model.fallback.triggered emitted by real FallbackChain
    const fallbackEvents = mockEventBus.getEvents('model.fallback.triggered');
    expect(fallbackEvents.length).toBe(1);
    expect(fallbackEvents[0]!.payload).toMatchObject({
      from: 'gpt-4o-mini',
      reason: 'rate_limit',
    });
    // agent.task.completed emitted (not failed)
    expect(mockEventBus.getEvents('agent.task.completed').length).toBe(1);
    expect(mockEventBus.getEvents('agent.task.failed').length).toBe(0);
  });

  it('run fails with model.gateway.exhausted when all chain models fail (strict mode)', async () => {
    const realChain = FallbackChain.getInstance(mockEventBus as unknown as import('@ninja/events').EventBus);

    // Always fail — will exhaust 'gpt-4o-mini' chain
    const llm = new SequencedMockLLM(
      Array(15).fill({ throw: new LLMError(ErrorCodes.LLM_RATE_LIMITED, '429', { retryable: true }) }),
    );

    const executor = new AgentExecutor(
      llm as unknown as LLMClient, baseRepos.arsenal,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      baseRepos.run, baseRepos.artifact, mockLogger,
      undefined, realChain, 'strict',
    );

    const result = await executor.executeStep(makeWorkflowStep(), makeWorkflowContext());

    expect(result.status).toBe('failed');
    expect(mockEventBus.getEvents('agent.task.completed').length).toBe(0);
    // model.gateway.exhausted emitted by real FallbackChain
    const exhausted = mockEventBus.getEvents('model.gateway.exhausted');
    expect(exhausted.length).toBeGreaterThan(0);
  });
});
