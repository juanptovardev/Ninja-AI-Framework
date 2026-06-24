import type { WorkflowStep, StepResult, WorkflowContext } from './schema';
import type { EventBus } from '@ninja/events';

// StepHandler interface that Agent Runtime will implement
export interface StepHandler {
  /**
   * Executes a step with the given context
   */
  executeStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult>;
}

export class StepRunner {
  constructor(private readonly eventBus: EventBus) {}

  /**
   * Runs a single step
   */
  async run(
    step: WorkflowStep,
    context: WorkflowContext,
    handler: StepHandler
  ): Promise<StepResult> {
    // Emit step started event
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'workflow.step.started',
      source: 'flow-matrix',
      timestamp: new Date().toISOString(),
      payload: {
        workflowId: context.workflowId,
        runId: context.runId,
        status: 'running',
        data: { stepId: step.id },
      },
    });

    const startedAt = new Date().toISOString();
    let result: StepResult;

    try {
      // Set up timeout if specified
      let timeoutHandle: NodeJS.Timeout | null = null;
      const timeoutPromise = step.timeout
        ? new Promise<StepResult>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`Step ${step.id} timed out after ${step.timeout}ms`));
            }, step.timeout);
          })
        : null;

      // Execute step with timeout
      const stepPromise = handler.executeStep(step, context);
      result = timeoutPromise
        ? await Promise.race([stepPromise, timeoutPromise])
        : await stepPromise;

      // Clear timeout if it exists
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      // Ensure result has completed status
      result = {
        ...result,
        status: 'completed',
        startedAt,
        completedAt: new Date().toISOString(),
        duration: new Date().getTime() - new Date(startedAt).getTime(),
      };
    } catch (error) {
      // Handle step failure
      result = {
        stepId: step.id,
        status: 'failed',
        output: {},
        error: (error as Error).message,
        startedAt,
        completedAt: new Date().toISOString(),
        duration: new Date().getTime() - new Date(startedAt).getTime(),
      };
    }

    // Emit step completed event
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: `workflow.step.${result.status}`,
      source: 'flow-matrix',
      timestamp: new Date().toISOString(),
      payload: {
        workflowId: context.workflowId,
        runId: context.runId,
        status: result.status,
        data: { stepId: step.id, result },
      },
    });

    return result;
  }
}
