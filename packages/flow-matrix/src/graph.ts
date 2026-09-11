/**
 * graph.ts — dependency analysis for the Flow Matrix executor.
 *
 * Builds an execution plan from a workflow's step list: a topological order
 * (used to validate the graph) and a set of parallel "waves". Steps in the
 * same wave share the same dependency depth and are therefore mutually
 * independent, so they can run concurrently.
 */
import type { ID } from '@ninja/contracts';
import { ErrorCodes, FlowError } from '@ninja/contracts';
import type { WorkflowStep } from './schema';

export interface ExecutionPlan {
  /** Steps in topological order (parents before children). */
  order: WorkflowStep[];
  /** Steps grouped by dependency depth; each wave runs in parallel. */
  waves: WorkflowStep[][];
}

interface DependencyGraph {
  stepMap: Map<ID, WorkflowStep>;
  edges: Map<ID, Set<ID>>;
  inDegree: Map<ID, number>;
}

function buildGraph(steps: WorkflowStep[]): DependencyGraph {
  const stepMap = new Map<ID, WorkflowStep>();
  const edges = new Map<ID, Set<ID>>();
  const inDegree = new Map<ID, number>();

  for (const step of steps) {
    stepMap.set(step.id, step);
    edges.set(step.id, new Set<ID>());
    inDegree.set(step.id, 0);
  }

  for (const step of steps) {
    for (const dependencyId of step.dependsOn) {
      // Dependencies pointing at unknown steps are ignored, never a hang.
      if (!stepMap.has(dependencyId)) continue;
      const dependents = edges.get(dependencyId);
      if (dependents !== undefined) dependents.add(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  return { stepMap, edges, inDegree };
}

function topologicalOrder(steps: WorkflowStep[], graph: DependencyGraph): WorkflowStep[] {
  const queue: ID[] = [];
  for (const [stepId, degree] of graph.inDegree) {
    if (degree === 0) queue.push(stepId);
  }

  const order: WorkflowStep[] = [];
  while (queue.length > 0) {
    const stepId = queue.shift();
    if (stepId === undefined) break;

    const step = graph.stepMap.get(stepId);
    if (step !== undefined) order.push(step);

    const dependents = graph.edges.get(stepId);
    if (dependents === undefined) continue;
    for (const dependentId of dependents) {
      const nextDegree = (graph.inDegree.get(dependentId) ?? 0) - 1;
      graph.inDegree.set(dependentId, nextDegree);
      if (nextDegree === 0) queue.push(dependentId);
    }
  }

  if (order.length !== steps.length) {
    throw new FlowError(
      ErrorCodes.FLOW_CIRCULAR_DEPENDENCY,
      'Circular dependency detected in workflow steps'
    );
  }

  return order;
}

function assignDepths(order: WorkflowStep[]): Map<ID, number> {
  const depth = new Map<ID, number>();
  for (const step of order) {
    let maxParentDepth = 0;
    for (const dependencyId of step.dependsOn) {
      const parentDepth = depth.get(dependencyId);
      if (parentDepth !== undefined && parentDepth >= maxParentDepth) {
        maxParentDepth = parentDepth + 1;
      }
    }
    depth.set(step.id, maxParentDepth);
  }
  return depth;
}

function groupWaves(order: WorkflowStep[], depth: Map<ID, number>): WorkflowStep[][] {
  const byDepth = new Map<number, WorkflowStep[]>();
  for (const step of order) {
    const stepDepth = depth.get(step.id) ?? 0;
    const wave = byDepth.get(stepDepth);
    if (wave !== undefined) {
      wave.push(step);
    } else {
      byDepth.set(stepDepth, [step]);
    }
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  return depths.map((stepDepth) => byDepth.get(stepDepth) ?? []);
}

/**
 * Builds the execution plan for a workflow step list.
 *
 * @throws {FlowError} `FLOW_CIRCULAR_DEPENDENCY` when the graph has a cycle.
 */
export function buildExecutionPlan(steps: WorkflowStep[]): ExecutionPlan {
  const graph = buildGraph(steps);
  const order = topologicalOrder(steps, graph);
  const depth = assignDepths(order);
  return { order, waves: groupWaves(order, depth) };
}
