import type { EngineRequest, EnginePlan, EngineRun, EngineStatus, ApprovalResult } from './schema';
import type { WorkflowExecutor } from '@ninja/flow-matrix';
import type { AgentExecutor } from '@ninja/agent-runtime';
import type { ArsenalRegistry } from '@ninja/arsenal-registry';
import type { SessionRepository, RunRepository, ArtifactRepository } from '@ninja/trace-ledger';
import type { EventBus } from '@ninja/events';
import type { Logger } from '@ninja/logging';
import type { WorkspaceContext } from '@ninja/workbench';
import { LLMClient } from '@ninja/integrations-llm';

import { IntakeProcessor } from './intake';
import { ExecutionCoordinator } from './coordinator';
import { ApprovalManager } from './approvals';

// Fachada principal del motor Kage
export class KageEngine {
  private readonly intakeProcessor: IntakeProcessor;
  private readonly executionCoordinator: ExecutionCoordinator;
  private readonly approvalManager: ApprovalManager;

  constructor(
    private readonly llmClient: LLMClient,
    private readonly workflowExecutor: WorkflowExecutor,
    private readonly agentExecutor: AgentExecutor,
    private readonly arsenalRegistry: ArsenalRegistry,
    private readonly sessionRepository: SessionRepository,
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly eventBus: EventBus,
    private readonly logger: Logger
  ) {
    this.intakeProcessor = new IntakeProcessor(llmClient, eventBus, logger);
    this.executionCoordinator = new ExecutionCoordinator(
      workflowExecutor,
      agentExecutor,
      sessionRepository,
      runRepository,
      artifactRepository,
      eventBus,
      logger
    );
    this.approvalManager = new ApprovalManager(eventBus, logger);
  }

  /**
   * Inicializa el motor
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Kage Engine');

    // 1. Cargar Arsenal Registry
    // En una implementación real, esto podría cargar herramientas adicionales
    this.logger.info('Arsenal Registry loaded', {
      tools: this.arsenalRegistry.listTools().length,
      skills: this.arsenalRegistry.listSkills().length,
    });

    // 2. Inicializar Flow Matrix
    // La instancia de WorkflowExecutor ya está inyectada

    this.logger.info('Kage Engine initialized successfully');
  }

  /**
   * Envía una solicitud para ser procesada
   */
  async submit(request: EngineRequest, workspaceContext: WorkspaceContext): Promise<EngineRun> {
    this.logger.info(`Submitting engine request: ${request.id}`, {
      mode: request.mode,
    });

    // 1. Emitir evento de recepción de solicitud
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'engine.request.received',
      source: 'kage-engine',
      timestamp: new Date().toISOString(),
      payload: {
        requestId: request.id,
        mode: request.mode,
        prompt: request.prompt,
        workspaceId: request.workspaceId,
      },
    });

    // 2. Procesar la solicitud con IntakeProcessor
    const plan = await this.intakeProcessor.process(request);

    // 3. Emitir evento de plan creado
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'engine.plan.created',
      source: 'kage-engine',
      timestamp: new Date().toISOString(),
      payload: {
        requestId: request.id,
        planId: plan.workflowId,
        steps: plan.steps.length,
      },
    });

    // ── PERSISTENCIA VISUAL DEL PLAN (Debug/Review) ────────────────────────
    try {
      const fs = await import('fs');
      const path = await import('path');
      const ninjaDir = path.join(workspaceContext.workspace.path, '.ninja');
      
      if (!fs.existsSync(ninjaDir)) fs.mkdirSync(ninjaDir, { recursive: true });
      
      const planMd = [
        `# 🥷 Plan de Operación: ${plan.workflowId}`,
        `**Prompt:** ${request.prompt}`,
        `**Modo:** ${request.mode}`,
        `**Duración Estimada:** ${((plan.estimatedDuration || 0) / 60000).toFixed(2)} min`,
        '',
        '## Pasos del Plan',
        ...plan.steps.map(s => `- [ ] **${s.id}**: ${s.description} *(Agente: ${s.requiredAgentRole})*`),
        '',
        `*Generado el: ${new Date().toLocaleString()}*`
      ].join('\n');
      
      fs.writeFileSync(path.join(ninjaDir, 'last_plan.md'), planMd);
      this.logger.info(`Plan visual guardado en: ${path.join(ninjaDir, 'last_plan.md')}`);
    } catch (err) {
      this.logger.warn('No se pudo guardar el plan visual en el workspace', err);
    }

    // 4. Crear contexto de workflow
    const workflowContext = {
      workflowId: plan.workflowId,
      runId: crypto.randomUUID(), // Se generará un ID real en ExecutionCoordinator
      sessionId: request.sessionId ?? workspaceContext.sessionId ?? crypto.randomUUID(),
      inputs: {
        prompt: request.prompt,
        context: request.context || {},
        workspacePath: workspaceContext.workspace.path,
      },
      memory: {},
    };

    // 5. Iniciar ejecución con ExecutionCoordinator
    const run = await this.executionCoordinator.startRun(plan, workflowContext);

    this.logger.info(`Started engine run: ${run.id} for request: ${request.id}`);

    return run;
  }

  /**
   * Aprueba o rechaza una solicitud de aprobación
   */
  async approve(approvalId: string, result: ApprovalResult): Promise<void> {
    this.logger.info(`Processing approval: ${approvalId}`, {
      approved: result.approved,
    });

    await this.approvalManager.processApprovalResponse(approvalId, result);
  }

  /**
   * Obtiene el estado de una ejecución
   */
  getStatus(runId: string): EngineRun | null {
    return this.executionCoordinator.getRunStatus(runId);
  }

  /**
   * Pausa una ejecución
   */
  async pause(runId: string): Promise<void> {
    this.logger.info(`Pausing engine run: ${runId}`);
    await this.executionCoordinator.pauseRun(runId);
  }

  /**
   * Reanuda una ejecución pausada
   */
  async resume(runId: string): Promise<void> {
    this.logger.info(`Resuming engine run: ${runId}`);
    await this.executionCoordinator.resumeRun(runId);
  }

  /**
   * Cancela una ejecución
   */
  async cancel(runId: string): Promise<void> {
    this.logger.info(`Cancelling engine run: ${runId}`);
    await this.executionCoordinator.cancelRun(runId);
  }

  /**
   * Obtiene una aprobación pendiente
   */
  getPendingApproval(approvalId: string) {
    return this.approvalManager.getPendingApproval(approvalId);
  }

  /**
   * Lista todas las aprobaciones pendientes
   */
  listPendingApprovals() {
    return this.approvalManager.listPendingApprovals();
  }

  /**
   * Limpia aprobaciones expiradas
   */
  async cleanupExpiredApprovals(): Promise<void> {
    await this.approvalManager.cleanupExpiredApprovals();
  }
}
