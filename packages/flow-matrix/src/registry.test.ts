import { describe, it, expect } from 'vitest';
import { WorkflowRegistry } from './registry';
import type { WorkflowDefinition } from './schema';

function makeDefinition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: 'A workflow used in tests',
    steps: [],
    metadata: {},
    ...overrides,
  };
}

describe('WorkflowRegistry', () => {
  it('registers and retrieves a workflow definition by id', () => {
    const registry = new WorkflowRegistry();
    const definition = makeDefinition();
    registry.registerWorkflow(definition);
    expect(registry.getWorkflow('wf-1')).toEqual(definition);
  });

  it('returns null for an unknown workflow id', () => {
    const registry = new WorkflowRegistry();
    expect(registry.getWorkflow('missing')).toBeNull();
  });

  it('overwrites a definition registered with the same id', () => {
    const registry = new WorkflowRegistry();
    registry.registerWorkflow(makeDefinition({ name: 'v1' }));
    registry.registerWorkflow(makeDefinition({ name: 'v2' }));
    expect(registry.getWorkflow('wf-1')?.name).toBe('v2');
    expect(registry.listWorkflows()).toHaveLength(1);
  });

  it('lists all registered workflows in insertion order', () => {
    const registry = new WorkflowRegistry();
    registry.registerWorkflow(makeDefinition({ id: 'wf-a' }));
    registry.registerWorkflow(makeDefinition({ id: 'wf-b' }));
    expect(registry.listWorkflows().map((d) => d.id)).toEqual(['wf-a', 'wf-b']);
  });

  it('unregisters an existing workflow and returns true', () => {
    const registry = new WorkflowRegistry();
    registry.registerWorkflow(makeDefinition());
    expect(registry.unregisterWorkflow('wf-1')).toBe(true);
    expect(registry.getWorkflow('wf-1')).toBeNull();
  });

  it('returns false when unregistering an unknown workflow', () => {
    const registry = new WorkflowRegistry();
    expect(registry.unregisterWorkflow('missing')).toBe(false);
  });
});
