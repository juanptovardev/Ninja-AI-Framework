import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StepRunner, type StepHandler } from './step-runner';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus';
import type { EventBus } from '@ninja/events';
import type { WorkflowStep, WorkflowContext, StepResult } from './schema';

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

function makeContext(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowId: 'wf-1',
    runId: 'run-1',
    sessionId: 'session-1',
    inputs: {},
    memory: {},
    ...overrides,
  };
}

function makeHandler(
  impl: (step: WorkflowStep, context: WorkflowContext) => Promise<StepResult>
): StepHandler {
  return {
    executeStep: vi.fn(impl) as (
      step: WorkflowStep,
      context: WorkflowContext
    ) => Promise<StepResult>,
  };
}

describe('StepRunner', () => {
  let bus: MockEventBus;

  beforeEach(() => {
    bus = new MockEventBus();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a completed result with the handler output and timing metadata', async () => {
    const runner = new StepRunner(bus as unknown as EventBus);
    const step = makeStep();
    const context = makeContext();
    const handler = makeHandler(async () => ({
      stepId: step.id,
      status: 'running',
      output: { value: 42 },
    }));

    const result = await runner.run(step, context, handler);

    expect(result.stepId).toBe('step-1');
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ value: 42 });
    expect(result.startedAt).toEqual(expect.any(String));
    expect(result.completedAt).toEqual(expect.any(String));
    expect(result.duration).toEqual(expect.any(Number));
    expect(handler.executeStep).toHaveBeenCalledWith(step, context);
  });

  it('emits a started event before execution and a completed event after', async () => {
    const runner = new StepRunner(bus as unknown as EventBus);
    const events: string[] = [];
    bus.onAny((event) => {
      events.push(event.type);
    });

    await runner.run(
      makeStep(),
      makeContext(),
      makeHandler(async () => ({
        stepId: 'step-1',
        status: 'running',
        output: {},
      }))
    );

    expect(events).toEqual(['workflow.step.started', 'workflow.step.completed']);
  });

  it('includes workflow, run and step identifiers in the emitted event payloads', async () => {
    const runner = new StepRunner(bus as unknown as EventBus);
    const context = makeContext({ workflowId: 'wf-42', runId: 'run-7' });

    await runner.run(
      makeStep({ id: 'step-9' }),
      context,
      makeHandler(async () => ({
        stepId: 'step-9',
        status: 'running',
        output: {},
      }))
    );

    const started = bus.getEvents('workflow.step.started');
    expect(started).toHaveLength(1);
    expect(started[0].payload).toMatchObject({
      workflowId: 'wf-42',
      runId: 'run-7',
      status: 'running',
      data: { stepId: 'step-9' },
    });
    expect(started[0].source).toBe('flow-matrix');

    const completed = bus.getEvents('workflow.step.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].payload).toMatchObject({
      workflowId: 'wf-42',
      runId: 'run-7',
      status: 'completed',
      data: { stepId: 'step-9' },
    });
  });

  it('catches a handler rejection and returns a failed result carrying the error message', async () => {
    const runner = new StepRunner(bus as unknown as EventBus);
    const handler = makeHandler(async () => {
      throw new Error('tool exploded');
    });

    const result = await runner.run(makeStep(), makeContext(), handler);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('tool exploded');
    expect(result.output).toEqual({});
    expect(result.completedAt).toEqual(expect.any(String));
  });

  it('emits workflow.step.failed (not completed) when the handler rejects', async () => {
    const runner = new StepRunner(bus as unknown as EventBus);
    const handler = makeHandler(async () => {
      throw new Error('boom');
    });

    await runner.run(makeStep(), makeContext(), handler);

    expect(bus.getEvents('workflow.step.failed')).toHaveLength(1);
    expect(bus.getEvents('workflow.step.completed')).toHaveLength(0);
  });

  it('fails a step whose timeout elapses before the handler resolves', async () => {
    const runner = new StepRunner(bus as unknown as EventBus);
    const executeStep = vi.fn(
      () =>
        new Promise<StepResult>((resolve) => {
          setTimeout(() => {
            resolve({ stepId: 'step-1', status: 'running', output: {} });
          }, 5000);
        })
    );
    const handler: StepHandler = { executeStep };

    const pending = runner.run(makeStep({ timeout: 1000 }), makeContext(), handler);
    const assertion = expect(pending).resolves.toMatchObject({
      status: 'failed',
      error: 'Step step-1 timed out after 1000ms',
    });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it('clears the timeout and completes normally when the handler resolves before timeout', async () => {
    const runner = new StepRunner(bus as unknown as EventBus);
    const handler = makeHandler(async () => ({
      stepId: 'step-1',
      status: 'running',
      output: { ok: true },
    }));

    const result = await runner.run(makeStep({ timeout: 1000 }), makeContext(), handler);

    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
