import type { WorkflowDefinition } from './schema';

export class WorkflowRegistry {
  private readonly workflows: Map<string, WorkflowDefinition> = new Map();

  /**
   * Registers a workflow definition
   */
  registerWorkflow(definition: WorkflowDefinition): void {
    this.workflows.set(definition.id, definition);
  }

  /**
   * Gets a workflow definition by ID
   */
  getWorkflow(id: string): WorkflowDefinition | null {
    return this.workflows.get(id) || null;
  }

  /**
   * Lists all registered workflows
   */
  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Removes a workflow from the registry
   */
  unregisterWorkflow(id: string): boolean {
    return this.workflows.delete(id);
  }
}
