import type {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowState,
  WorkflowResult,
  WorkflowStatus,
  StepResult,
  WorkflowStep,
} from './schema';
import type { EventBus } from '@ninja/events';
import type { RunRepository, ArtifactRepository } from '@ninja/trace-ledger';
import type { RunStatus, ArtifactType } from '@ninja/trace-ledger';
import { FlowError, ErrorCodes } from '@ninja/contracts';
import { StepRunner, type StepHandler } from './step-runner';

export class WorkflowExecutor {
  private readonly states: Map<string, WorkflowState> = new Map();
  private readonly stepRunner: StepRunner;

  constructor(
    private readonly eventBus: EventBus,
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository
  ) {
    this.stepRunner = new StepRunner(eventBus);
  }

  /**
   * Executes a workflow definition with the given context
   */
  async execute(
    definition: WorkflowDefinition,
    context: WorkflowContext,
    handler: StepHandler
  ): Promise<WorkflowResult> {
    // Initialize workflow state
    const initialState: WorkflowState = {
      status: 'pending',
      stepResults: {},
      memory: { ...context.memory },
      startedAt: new Date().toISOString(),
    };

    this.states.set(context.runId, initialState);

    // Emit workflow started event
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'workflow.started',
      source: 'flow-matrix',
      timestamp: new Date().toISOString(),
      payload: {
        workflowId: context.workflowId,
        runId: context.runId,
        status: 'pending',
      },
    });

    // Persist initial state to Trace Ledger
    try {
      await this.runRepository.updateStatus(context.runId, 'running' as RunStatus);
    } catch (error) {
      console.warn('Failed to update run status in repository:', error);
    }

    try {
      // Update state to running
      const runningState: WorkflowState = {
        ...initialState,
        status: 'running',
      };
      this.states.set(context.runId, runningState);

      // Resolve step dependencies using topological sort
      const executionOrder = this.resolveDependencies(definition.steps);

      // Execute steps in order
      for (const step of executionOrder) {
        // Skip if workflow was cancelled
        const currentState = this.getState(context.runId);
        if (!currentState || currentState.status === 'cancelled') {
          break;
        }

        // Execute step
        const stepResult = await this.stepRunner.run(step, context, handler);

        // Update state with step result
        this.updateStepResult(context.runId, stepResult);

        // Persist step result as artifact
        try {
          await this.artifactRepository.create({
            runId: context.runId,
            type: 'other' as ArtifactType, // Using 'other' for step results
            name: `Step Result: ${step.name}`,
            content: JSON.stringify(stepResult),
          });
        } catch (error) {
          console.warn('Failed to persist step result as artifact:', error);
        }

        // If step failed and it's not configured to continue on error, stop workflow
        if (stepResult.status === 'failed') {
          // For now, we'll continue with other independent steps
          // In a more advanced implementation, this could be configurable
        }
      }

      // Determine final workflow status
      const finalState = this.getState(context.runId);
      if (!finalState) {
        throw new FlowError(ErrorCodes.FLOW_STATE_LOST, 'Workflow state lost during execution');
      }

      const finalStatus: WorkflowStatus = Object.values(finalState.stepResults).every(
        (result) => result.status === 'completed'
      )
        ? 'completed'
        : 'failed';

      // Update final state
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

      this.states.set(context.runId, finalStateWithCompletion);

      // Persist final state to Trace Ledger
      try {
        await this.runRepository.updateStatus(context.runId, finalStatus as RunStatus);
      } catch (error) {
        console.warn('Failed to update final run status in repository:', error);
      }

      // Emit workflow completed event
      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'workflow.completed',
        source: 'flow-matrix',
        timestamp: completedAt,
        payload: {
          workflowId: context.workflowId,
          runId: context.runId,
          status: finalStatus,
        },
      });

      // Return final result
      return {
        status: finalStatus,
        stepResults: finalStateWithCompletion.stepResults,
        finalMemory: finalStateWithCompletion.memory,
        startedAt: finalStateWithCompletion.startedAt,
        completedAt: finalStateWithCompletion.completedAt,
        duration: finalStateWithCompletion.duration,
      };
    } catch (error) {
      // Handle workflow failure
      const failedAt = new Date().toISOString();
      const currentState = this.getState(context.runId);

      if (currentState) {
        const failedState: WorkflowState = {
          ...currentState,
          status: 'failed',
          completedAt: failedAt,
        };

        this.states.set(context.runId, failedState);

        // Persist failure to Trace Ledger
        try {
          await this.runRepository.updateStatus(context.runId, 'failed' as RunStatus);
        } catch (error) {
          console.warn('Failed to update failed run status in repository:', error);
        }

        // Emit workflow failed event
        this.eventBus.emit({
          id: crypto.randomUUID(),
          type: 'workflow.failed',
          source: 'flow-matrix',
          timestamp: failedAt,
          payload: {
            workflowId: context.workflowId,
            runId: context.runId,
            status: 'failed',
            data: { error: (error as Error).message },
          },
        });
      }

      throw error;
    }
  }

  /**
   * Pauses execution of a workflow
   */
  async pause(workflowId: string): Promise<void> {
    const state = this.getState(workflowId);
    if (state && state.status === 'running') {
      const pausedState: WorkflowState = {
        ...state,
        status: 'paused',
      };

      this.states.set(workflowId, pausedState);

      // Persist to Trace Ledger
      try {
        await this.runRepository.updateStatus(workflowId, 'pending' as RunStatus); // Using pending as closest to paused
      } catch (error) {
        console.warn('Failed to update paused run status in repository:', error);
      }

      // Emit event
      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'workflow.paused',
        source: 'flow-matrix',
        timestamp: new Date().toISOString(),
        payload: {
          workflowId,
          runId: workflowId,
          status: 'paused',
        },
      });
    }
  }

  /**
   * Resumes execution of a paused workflow
   */
  async resume(workflowId: string): Promise<void> {
    const state = this.getState(workflowId);
    if (state && state.status === 'paused') {
      const resumedState: WorkflowState = {
        ...state,
        status: 'running',
      };

      this.states.set(workflowId, resumedState);

      // Persist to Trace Ledger
      try {
        await this.runRepository.updateStatus(workflowId, 'running' as RunStatus);
      } catch (error) {
        console.warn('Failed to update resumed run status in repository:', error);
      }

      // Emit event
      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'workflow.resumed',
        source: 'flow-matrix',
        timestamp: new Date().toISOString(),
        payload: {
          workflowId,
          runId: workflowId,
          status: 'running',
        },
      });
    }
  }

  /**
   * Cancels execution of a workflow
   */
  async cancel(workflowId: string): Promise<void> {
    const state = this.getState(workflowId);
    if (state && (state.status === 'running' || state.status === 'paused')) {
      const cancelledState: WorkflowState = {
        ...state,
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      };

      this.states.set(workflowId, cancelledState);

      // Persist to Trace Ledger
      try {
        await this.runRepository.updateStatus(workflowId, 'cancelled' as RunStatus);
      } catch (error) {
        console.warn('Failed to update cancelled run status in repository:', error);
      }

      // Emit event
      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'workflow.cancelled',
        source: 'flow-matrix',
        timestamp: new Date().toISOString(),
        payload: {
          workflowId,
          runId: workflowId,
          status: 'cancelled',
        },
      });
    }
  }

  /**
   * Gets the current state of a workflow
   */
  getState(workflowId: string): WorkflowState | null {
    return this.states.get(workflowId) || null;
  }

  /**
   * Updates the result of a step in the workflow state
   */
  private updateStepResult(workflowId: string, stepResult: StepResult): void {
    const state = this.states.get(workflowId);
    if (state) {
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

  /**
   * Resolves step dependencies using topological sort
   */
  private resolveDependencies(steps: WorkflowStep[]): WorkflowStep[] {
    // Create a map of step ID to step for quick lookup
    const stepMap = new Map<string, WorkflowStep>();
    steps.forEach((step) => stepMap.set(step.id, step));

    // Create adjacency list for dependencies
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Initialize in-degrees
    steps.forEach((step) => {
      inDegree.set(step.id, 0);
      graph.set(step.id, new Set());
    });

    // Build the graph and calculate in-degrees
    steps.forEach((step) => {
      step.dependsOn.forEach((dependencyId) => {
        if (stepMap.has(dependencyId)) {
          const dependents = graph.get(dependencyId);
          if (dependents) {
            dependents.add(step.id);
          }
          inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
        }
      });
    });

    // Kahn's algorithm for topological sorting
    const queue: string[] = [];
    const result: WorkflowStep[] = [];

    // Find all nodes with no incoming edges
    inDegree.forEach((degree, stepId) => {
      if (degree === 0) {
        queue.push(stepId);
      }
    });

    // Process nodes
    while (queue.length > 0) {
      const stepId = queue.shift();
      if (stepId === undefined) {
        break;
      }
      const step = stepMap.get(stepId);
      if (step) {
        result.push(step);
      }

      // Remove this node and update in-degrees of its neighbors
      const neighbors = graph.get(stepId) || new Set();
      neighbors.forEach((neighborId) => {
        const newDegree = (inDegree.get(neighborId) || 0) - 1;
        inDegree.set(neighborId, newDegree);
        if (newDegree === 0) {
          queue.push(neighborId);
        }
      });
    }

    // Check for circular dependencies
    if (result.length !== steps.length) {
      throw new FlowError(
        ErrorCodes.FLOW_CIRCULAR_DEPENDENCY,
        'Circular dependency detected in workflow steps'
      );
    }

    return result;
  }
}
