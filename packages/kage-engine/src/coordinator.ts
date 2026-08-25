import type { EnginePlan, EngineRun, EngineStatus } from './schema';
import type {
  WorkflowExecutor,
  WorkflowDefinition,
  WorkflowContext,
  WorkflowResult,
} from '@ninja/flow-matrix';
import type { AgentExecutor } from '@ninja/agent-runtime';
import type { SessionRepository, RunRepository, ArtifactRepository, RunStatus } from '@ninja/trace-ledger';
import type { EventBus } from '@ninja/events';
import type { Logger } from '@ninja/logging';
import { EngineError, ErrorCodes } from '@ninja/contracts';

// Coordinador de ejecución
export class ExecutionCoordinator {
  private readonly runs: Map<string, EngineRun> = new Map();

  constructor(
    private readonly workflowExecutor: WorkflowExecutor,
    private readonly agentExecutor: AgentExecutor,
    private readonly sessionRepository: SessionRepository,
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly eventBus: EventBus,
    private readonly logger: Logger
  ) {}

  /**
   * Inicia la ejecución de un plan
   */
  async startRun(plan: EnginePlan, context: WorkflowContext): Promise<EngineRun> {
    this.logger.info(`Starting engine run for plan: ${plan.workflowId}`);

    // 1. Crear registro en Trace Ledger
    const session = await this.sessionRepository.create({
      workspaceId: context.sessionId, // Asumimos que el sessionId del contexto es el workspaceId
      startedAt: new Date().toISOString(),
    });

    const runRecord = await this.runRepository.create({
      sessionId: session.id,
      mode: 'automated', // Modo de ejecución
      status: 'pending',
    });

    // 2. Crear ejecución en memoria
    const run: EngineRun = {
      id: runRecord.id,
      requestId: plan.requestId,
      planId: plan.workflowId,
      status: 'executing',
      progress: 0,
      activeAgents: [],
      artifacts: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.runs.set(run.id, run);

    // 3. Emitir evento de inicio
    this.emitEngineEvent(run, 'executing');

    // 4. Actualizar estado en Trace Ledger
    await this.runRepository.updateStatus(run.id, 'running');

    // 5. Iniciar ejecución del workflow
    this.executeWorkflow(plan, context, run)
      .then((result) => this.handleWorkflowCompletion(run, result))
      .catch((error) => this.handleWorkflowError(run, error));

    return run;
  }

  /**
   * Pausa una ejecución
   */
  async pauseRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new EngineError(ErrorCodes.ENGINE_COORDINATOR_FAILED, `Run ${runId} not found`, {
        httpStatus: 404,
        context: { runId },
      });
    }

    if (run.status === 'executing') {
      // Pausar el workflow executor
      await this.workflowExecutor.pause(runId);

      // Actualizar estado
      run.status = 'paused';
      run.updatedAt = new Date().toISOString();
      this.runs.set(runId, run);

      // Actualizar en Trace Ledger
      await this.runRepository.updateStatus(runId, 'paused');

      // Emitir evento
      this.emitEngineEvent(run, 'paused');

      this.logger.info(`Paused engine run: ${runId}`);
    }
  }

  /**
   * Reanuda una ejecución pausada
   */
  async resumeRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new EngineError(ErrorCodes.ENGINE_COORDINATOR_FAILED, `Run ${runId} not found`, { httpStatus: 404, context: { runId } });
    }

    if (run.status === 'paused') {
      // Reanudar el workflow executor
      await this.workflowExecutor.resume(runId);

      // Actualizar estado
      run.status = 'executing';
      run.updatedAt = new Date().toISOString();
      this.runs.set(runId, run);

      // Actualizar en Trace Ledger
      await this.runRepository.updateStatus(runId, 'running');

      // Emitir evento
      this.emitEngineEvent(run, 'executing');

      this.logger.info(`Resumed engine run: ${runId}`);
    }
  }

  /**
   * Cancela una ejecución
   */
  async cancelRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new EngineError(ErrorCodes.ENGINE_COORDINATOR_FAILED, `Run ${runId} not found`, { httpStatus: 404, context: { runId } });
    }

    if (run.status === 'executing' || run.status === 'paused') {
      // Cancelar el workflow executor
      await this.workflowExecutor.cancel(runId);

      // Actualizar estado
      run.status = 'failed';
      run.updatedAt = new Date().toISOString();
      this.runs.set(runId, run);

      // Actualizar en Trace Ledger
      await this.runRepository.updateStatus(runId, 'cancelled');

      // Emitir evento
      this.emitEngineEvent(run, 'failed');

      this.logger.info(`Cancelled engine run: ${runId}`);
    }
  }

  /**
   * Obtiene el estado de una ejecución
   */
  getRunStatus(runId: string): EngineRun | null {
    return this.runs.get(runId) || null;
  }

  /**
   * Ejecuta un workflow
   */
  private async executeWorkflow(
    plan: EnginePlan,
    context: WorkflowContext,
    run: EngineRun
  ): Promise<WorkflowResult> {
    // Obtener la definición del workflow y mapear plan.steps a WorkflowStep[]
    const workflowDefinition: WorkflowDefinition = {
      id: plan.workflowId,
      name: `Workflow for request ${plan.requestId}`,
      description: 'Automated workflow mapped from plan steps',
      steps: plan.steps.map((step) => ({
        id: step.id,
        name: step.description,
        type: 'agent',
        dependsOn: step.dependsOn,
        agentRole: plan.agentAssignments[step.id] || 'Planner',
        input: {
          prompt: step.description,
          context: context.inputs || {},
        },
        output: {},
        timeout: step.estimatedDuration ? step.estimatedDuration * 2 : 300000,
      })),
      metadata: { requestId: plan.requestId },
    };

    // Ejecutar el workflow usando el AgentExecutor como StepHandler
    return await this.workflowExecutor.execute(workflowDefinition, context, this.agentExecutor);
  }

  /**
   * Maneja la finalización exitosa de un workflow
   */
  private async handleWorkflowCompletion(run: EngineRun, result: WorkflowResult): Promise<void> {
    // Actualizar estado
    run.status = 'completed';
    run.progress = 100;
    run.updatedAt = new Date().toISOString();
    this.runs.set(run.id, run);

    // Registrar artefactos generados
    // En una implementación real, esto vendría del resultado del workflow
    // run.artifacts = result.artifacts.map(a => a.id);

    // Actualizar en Trace Ledger
    await this.runRepository.updateStatus(run.id, 'completed');

    // Emitir evento
    this.emitEngineEvent(run, 'completed');

    this.logger.info(`Completed engine run: ${run.id}`);
  }

  /**
   * Maneja un error en la ejecución del workflow
   */
  private async handleWorkflowError(run: EngineRun, error: Error): Promise<void> {
    // Actualizar estado
    run.status = 'failed';
    run.updatedAt = new Date().toISOString();
    this.runs.set(run.id, run);

    // Actualizar en Trace Ledger
    await this.runRepository.updateStatus(run.id, 'failed');

    // Emitir evento
    this.emitEngineEvent(run, 'failed', { error: error.message });

    this.logger.error(`Failed engine run: ${run.id}`, { error: error.message });
  }

  /**
   * Emite un evento del motor
   */
  private emitEngineEvent(
    run: EngineRun,
    status: EngineStatus,
    data?: Record<string, unknown>
  ): void {
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: `engine.run.${status}`,
      source: 'kage-engine',
      timestamp: new Date().toISOString(),
      payload: {
        runId: run.id,
        requestId: run.requestId,
        status,
        data,
      },
    });
  }

  /**
   * Maneja las aprobaciones dobles antes de ejecutar
   */
  private async handleApprovals(run: EngineRun): Promise<boolean> {
    // Esta función manejaría la lógica de aprobaciones
    // Por ahora, retornamos true para permitir la ejecución
    return true;
  }

  /**
   * Mapea un EngineStatus a un RunStatus compatible con el Trace Ledger.
   * Los estados de engine que no tienen equivalente directo se mapean a 'running'.
   */
  private toRunStatus(status: EngineStatus): RunStatus {
    const map: Partial<Record<EngineStatus, RunStatus>> = {
      planning: 'running',
      executing: 'running',
      paused: 'paused',
      completed: 'completed',
      failed: 'failed',
    };
    return map[status] ?? 'running';
  }

  /**
   * Persiste información en Trace Ledger
   */
  private async persistToTraceLedger(run: EngineRun): Promise<void> {
    try {
      await this.runRepository.updateStatus(run.id, this.toRunStatus(run.status));
    } catch (error) {
      this.logger.error('Failed to persist to Trace Ledger', { error: (error as Error).message });
    }
  }
}
