import type { StepHandler, WorkflowStep, WorkflowContext, StepResult } from '@ninja/flow-matrix';
import type { ArsenalRegistry } from '@ninja/arsenal-registry';
import type { EventBus } from '@ninja/events';
import type { RunRepository, ArtifactRepository, AgentCommitRepository } from '@ninja/trace-ledger';
import type { Logger } from '@ninja/logging';
import type {
  AgentDefinition,
  AgentInstance,
  AgentTask,
  AgentStatus,
  AgentMemory,
  AgentCommitRecord,
  AgentRole,
  SubTask,
  MapReduceResult,
} from './schema';
import { MemoryManager } from './memory';
import { AGENT_DEFINITIONS } from './definitions';
import {
  LLMClient,
  type LLMRequest,
  type LLMResponse,
  classifyLLMError,
} from '@ninja/integrations-llm';
import {
  ModelSelector,
  FallbackChain,
  type ModelCapability,
  type SelectionStrategy,
} from '@ninja/model-gateway';
import { LLMError, EngineError, ErrorCodes, BudgetError } from '@ninja/contracts';
import type { BudgetManager } from '@ninja/model-gateway';

const ROLE_SELECTION_MAP: Record<
  string,
  { capability: ModelCapability; strategy: SelectionStrategy }
> = {
  Planner: { capability: 'reasoning', strategy: 'most-capable' },
  Planificator: { capability: 'chat', strategy: 'fastest' },
  Librarian: { capability: 'chat', strategy: 'fastest' },
  DBArchitect: { capability: 'code', strategy: 'most-capable' },
  Backend: { capability: 'code', strategy: 'balanced' },
  Connector: { capability: 'code', strategy: 'fastest' },
  Designer: { capability: 'vision', strategy: 'balanced' },
  Tester: { capability: 'code', strategy: 'fastest' },
  QualityGate: { capability: 'reasoning', strategy: 'balanced' },
  Security: { capability: 'reasoning', strategy: 'most-capable' },
  BuildFixer: { capability: 'code', strategy: 'balanced' },
};

export class AgentExecutor implements StepHandler {
  private readonly instances: Map<string, AgentInstance> = new Map();
  private readonly tasks: Map<string, AgentTask> = new Map();

  constructor(
    private readonly llmClient: LLMClient,
    private readonly arsenalRegistry: ArsenalRegistry,
    private readonly eventBus: EventBus,
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly logger: Logger,
    private readonly modelSelector?: ModelSelector,
    /** Injected FallbackChain for LLM retry (ADR-0003). If undefined, no fallback is attempted. */
    private readonly fallbackChain?: FallbackChain,
    /** Controls behavior when chain is exhausted (ADR-0003, NINJA_LLM_FAIL_MODE env var). */
    private readonly llmFailMode: 'strict' | 'legacy' = 'strict',
    private readonly budgetManager?: BudgetManager,
    private readonly sessionTokenBudget?: number,
    /** Optional repo for RF-16 mini-commits per agent. If undefined, no per-agent commit row is persisted. */
    private readonly agentCommitRepository?: AgentCommitRepository
  ) {}

  /**
   * Wrapper around llmClient.complete that implements FallbackChain retry (ADR-0003).
   * - With FallbackChain: retries on rate_limit/timeout/server_error, tries next model.
   * - Chain exhausted + strict: throws LLMError(LLM_ALL_PROVIDERS_FAILED).
   * - Chain exhausted + legacy: returns { fallback: true, ... } for backward compat.
   * - No FallbackChain or non-retryable error: propagates immediately.
   */
  private async completeWithFallback(
    request: LLMRequest,
    sessionId?: string
  ): Promise<
    | LLMResponse
    | { fallback: true; retryable: true; status: 'failed'; result: string; timestamp: string }
  > {
    if (this.budgetManager && this.sessionTokenBudget !== undefined && sessionId) {
      if (this.budgetManager.isOverBudget(sessionId, this.sessionTokenBudget)) {
        throw new BudgetError(
          `Token budget exceeded for session ${sessionId} (limit: ${this.sessionTokenBudget})`,
          { context: { sessionId, limit: this.sessionTokenBudget } }
        );
      }
    }

    if (!this.fallbackChain) {
      return this.llmClient.complete(request);
    }

    let currentModel = request.model;
    let lastError: unknown;

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return await this.llmClient.complete({ ...request, model: currentModel });
      } catch (err) {
        lastError = err;
        const reason = classifyLLMError(err);
        if (!reason) throw err; // non-retryable (auth, unknown) — propagate immediately

        const next = this.fallbackChain.getNext(currentModel, reason, sessionId);
        if (!next) break; // chain exhausted

        this.logger.warn(`LLM fallback ${currentModel} → ${next} (${reason})`);
        currentModel = next;
      }
    }

    // Chain exhausted
    if (this.llmFailMode === 'strict') {
      throw new LLMError(
        ErrorCodes.LLM_ALL_PROVIDERS_FAILED,
        `LLM chain exhausted from ${request.model}`,
        { retryable: false, cause: lastError, context: { initialModel: request.model } }
      );
    }

    // Legacy mode: return historic fallback object
    this.logger.warn(
      `[fallback] chain exhausted, using legacy fallback object (NINJA_LLM_FAIL_MODE=legacy)`
    );
    return {
      fallback: true as const,
      retryable: true as const,
      status: 'failed' as const,
      result: 'Agent unavailable due to LLM service interruption',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Crea una nueva instancia de agente
   */
  createInstance(definition: AgentDefinition, context: WorkflowContext): AgentInstance {
    const instanceId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    const memoryManager = new MemoryManager(context.inputs);

    const instance: AgentInstance = {
      definitionId: definition.id,
      instanceId,
      status: 'idle',
      activeTools: [],
      memory: memoryManager.getMemoryState(),
      startedAt,
      lastActivityAt: startedAt,
    };

    this.instances.set(instanceId, instance);

    // Emitir evento de creación de instancia
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'agent.instance.created',
      source: 'agent-runtime',
      timestamp: startedAt,
      payload: {
        agentInstanceId: instanceId,
        agentDefinitionId: definition.id,
        role: definition.role,
        status: 'idle',
      },
    });

    this.logger.info(`Created agent instance: ${definition.name} (${instanceId})`);

    return instance;
  }

  /**
   * Ejecuta una tarea asignada al agente
   */
  async run(task: AgentTask, instance: AgentInstance): Promise<StepResult> {
    // Actualizar estado de la instancia
    const updatedInstance: AgentInstance = {
      ...instance,
      currentTask: task,
      status: 'planning',
      lastActivityAt: new Date().toISOString(),
    };

    this.instances.set(instance.instanceId, updatedInstance);

    // Emitir evento de inicio de tarea
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'agent.task.started',
      source: 'agent-runtime',
      timestamp: new Date().toISOString(),
      payload: {
        agentInstanceId: instance.instanceId,
        agentDefinitionId: instance.definitionId,
        role: this.getAgentRole(instance.definitionId),
        status: 'planning',
        data: { taskId: task.id },
      },
    });

    try {
      // Ejecutar el agente (simulación de interacción con modelo de IA)
      const result = await this.executeAgentTask(task, updatedInstance);

      // Registrar commit del resultado
      await this.logAgentResult(
        {
          id: crypto.randomUUID(),
          agentInstanceId: instance.instanceId,
          taskId: task.id,
          summary: `Tarea completada: ${task.description}`,
          technicalDetails: JSON.stringify(result),
          artifacts: [],
          createdAt: new Date().toISOString(),
        },
        updatedInstance
      );

      // Actualizar estado a completado
      const completedInstance: AgentInstance = {
        ...updatedInstance,
        status: 'completed',
        lastActivityAt: new Date().toISOString(),
        currentTask: undefined,
      };

      this.instances.set(instance.instanceId, completedInstance);

      // Emitir evento de tarea completada
      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'agent.task.completed',
        source: 'agent-runtime',
        timestamp: new Date().toISOString(),
        payload: {
          agentInstanceId: instance.instanceId,
          agentDefinitionId: instance.definitionId,
          role: this.getAgentRole(instance.definitionId),
          status: 'completed',
          data: { taskId: task.id, result },
        },
      });

      this.logger.info(`Completed agent task: ${task.description} (${task.id})`);

      // Retornar resultado para el workflow
      return {
        stepId: task.stepId || task.id,
        status: 'completed',
        output: result,
        startedAt: updatedInstance.lastActivityAt,
        completedAt: new Date().toISOString(),
        duration: new Date().getTime() - new Date(updatedInstance.lastActivityAt).getTime(),
      };
    } catch (error) {
      // Manejar error en ejecución
      const errorInstance: AgentInstance = {
        ...updatedInstance,
        status: 'failed',
        lastActivityAt: new Date().toISOString(),
        currentTask: undefined,
      };

      this.instances.set(instance.instanceId, errorInstance);

      // Emitir evento de error
      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'agent.task.failed',
        source: 'agent-runtime',
        timestamp: new Date().toISOString(),
        payload: {
          agentInstanceId: instance.instanceId,
          agentDefinitionId: instance.definitionId,
          role: this.getAgentRole(instance.definitionId),
          status: 'failed',
          data: { taskId: task.id, error: (error as Error).message },
        },
      });

      this.logger.error(
        `Failed agent task: ${task.description} (${task.id}) - ${(error as Error).message}`
      );

      // Retornar resultado de error para el workflow
      return {
        stepId: task.stepId || task.id,
        status: 'failed',
        output: {},
        error: (error as Error).message,
        startedAt: updatedInstance.lastActivityAt,
        completedAt: new Date().toISOString(),
        duration: new Date().getTime() - new Date(updatedInstance.lastActivityAt).getTime(),
      };
    }
  }

  /**
   * Pausa la ejecución de un agente
   */
  async pause(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      const pausedInstance: AgentInstance = {
        ...instance,
        status: 'idle',
        lastActivityAt: new Date().toISOString(),
      };

      this.instances.set(instanceId, pausedInstance);

      // Emitir evento de pausa
      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'agent.instance.paused',
        source: 'agent-runtime',
        timestamp: new Date().toISOString(),
        payload: {
          agentInstanceId: instanceId,
          agentDefinitionId: instance.definitionId,
          role: this.getAgentRole(instance.definitionId),
          status: 'idle',
        },
      });

      this.logger.info(`Paused agent instance: ${instanceId}`);
    }
  }

  /**
   * Reanuda la ejecución de un agente pausado
   */
  async resume(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance && instance.status === 'idle') {
      const resumedInstance: AgentInstance = {
        ...instance,
        status: 'planning',
        lastActivityAt: new Date().toISOString(),
      };

      this.instances.set(instanceId, resumedInstance);

      // Emitir evento de reanudación
      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'agent.instance.resumed',
        source: 'agent-runtime',
        timestamp: new Date().toISOString(),
        payload: {
          agentInstanceId: instanceId,
          agentDefinitionId: instance.definitionId,
          role: this.getAgentRole(instance.definitionId),
          status: 'planning',
        },
      });

      this.logger.info(`Resumed agent instance: ${instanceId}`);
    }
  }

  /**
   * Detiene completamente la ejecución de un agente
   */
  async stop(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      const stoppedInstance: AgentInstance = {
        ...instance,
        status: 'completed',
        lastActivityAt: new Date().toISOString(),
        currentTask: undefined,
      };

      this.instances.set(instanceId, stoppedInstance);

      // Emitir evento de detención
      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'agent.instance.stopped',
        source: 'agent-runtime',
        timestamp: new Date().toISOString(),
        payload: {
          agentInstanceId: instanceId,
          agentDefinitionId: instance.definitionId,
          role: this.getAgentRole(instance.definitionId),
          status: 'completed',
        },
      });

      this.logger.info(`Stopped agent instance: ${instanceId}`);
    }
  }

  /**
   * Obtiene el estado actual de un agente
   */
  getStatus(instanceId: string): AgentStatus {
    const instance = this.instances.get(instanceId);
    return instance ? instance.status : 'idle';
  }

  /**
   * Descubre habilidades para la tarea, retornando subset de JSON schema.
   */
  private async discoverSkillsForTask(
    task: AgentTask,
    definition: AgentDefinition
  ): Promise<Record<string, unknown>[]> {
    try {
      type ArsenalToolsAccess = {
        getTools?: () => Array<{ id: string; name: string; schema?: Record<string, unknown> }>;
      };
      const allTools = (await (this.arsenalRegistry as ArsenalToolsAccess).getTools?.()) ?? [];
      return allTools
        .filter(
          (t) => definition.allowedTools.includes(t.id) || definition.allowedTools.includes(t.name)
        )
        .map((t) => t.schema ?? {});
    } catch (e) {
      this.logger.error(`Failed to discover skills: ${(e as Error).message}`);
      return [];
    }
  }

  /**
   * Helper de chunking semantico (mock)
   */
  private semanticChunker(text: string): string[] {
    const CHUNK_SIZE = 2000;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.substring(i, i + CHUNK_SIZE));
    }
    return chunks;
  }

  /**
   * Ejecuta map-reduce para tareas grandes evadiendo rate limits y evitando recursión.
   */
  private async executeWithMapReduce(
    task: AgentTask,
    instance: AgentInstance
  ): Promise<MapReduceResult> {
    this.logger.info(`Starting Map-Reduce for task ${task.id}`);
    const agentDef = this.getAgentDefinitionById(instance.definitionId);
    if (!agentDef)
      throw new EngineError(ErrorCodes.ENGINE_COORDINATOR_FAILED, 'Agent definition not found', {
        context: { taskId: task.id },
      });

    const startTime = Date.now();

    const chunks = this.semanticChunker(task.description);
    const subTasks: SubTask[] = chunks.map((chunk, index) => ({
      id: crypto.randomUUID(),
      description: chunk,
      input: { ...task.input, chunkIndex: index },
      agentRole: agentDef.role,
      isSubTask: true,
    }));

    const subResults = await Promise.allSettled(
      subTasks.map(async (st) => {
        const subAgentTask: AgentTask = {
          id: st.id,
          agentInstanceId: instance.instanceId,
          description: st.description,
          input: st.input,
          status: 'planning',
          createdAt: new Date().toISOString(),
          isSubTask: true,
        };
        return this.executeAgentTask(subAgentTask, instance);
      })
    );

    const successfulResults: Record<string, unknown>[] = [];
    let totalTokens = 0;

    subResults.forEach((res) => {
      if (res.status === 'fulfilled' && res.value && !res.value.fallback) {
        successfulResults.push(res.value);
        const executionContext = res.value.executionContext as { tokensUsed?: number } | undefined;
        if (executionContext?.tokensUsed) {
          totalTokens += executionContext.tokensUsed;
        }
      } else if (res.status === 'rejected') {
        this.logger.warn(`Subtask failed during Map-Reduce: ${res.reason}`);
      }
    });

    const reduceMessage = {
      role: 'user' as const,
      content: `Reduce the following partial results into a single final result:\n${JSON.stringify(successfulResults)}`,
    };

    const request: LLMRequest = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a summarizer. Merge partial results logically.' },
        reduceMessage,
      ],
      temperature: 0.3,
      max_tokens: 2048,
    };

    let reducedOutput: Record<string, unknown> = {};
    try {
      const reduceRaw = await this.completeWithFallback(request, task.workflowId);
      // Handle legacy fallback case
      if ('fallback' in reduceRaw) {
        reducedOutput = { error: 'Reduce failed (LLM unavailable)', partials: successfulResults };
      } else {
        const reduceResponse = reduceRaw;
        totalTokens += reduceResponse.usage.total_tokens;
        try {
          reducedOutput = JSON.parse(reduceResponse.choices[0]?.message?.content || '{}');
        } catch {
          reducedOutput = { raw: reduceResponse.choices[0]?.message?.content };
        }
      }
    } catch (e) {
      this.logger.error(`Reduce phase failed: ${(e as Error).message}`);
      reducedOutput = { error: 'Reduce failed', partials: successfulResults };
    }

    return {
      taskId: task.id,
      subResults: successfulResults,
      reducedOutput,
      summary: `Map-reduce completed with ${successfulResults.length}/${subTasks.length} successful chunks`,
      metrics: {
        totalTokens,
        parallelTasks: subTasks.length,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Implementación del StepHandler de Flow Matrix
   */
  async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    // Obtener definición del agente basada en el rol del step
    const role = step.agentRole as AgentRole;
    if (!role) {
      throw new EngineError(
        ErrorCodes.ENGINE_INVALID_INTAKE,
        `Step does not specify an agent role: ${step.id}`,
        { httpStatus: 400, context: { stepId: step.id } }
      );
    }

    const agentDefinition = AGENT_DEFINITIONS[role];
    if (!agentDefinition) {
      throw new EngineError(ErrorCodes.ENGINE_INVALID_INTAKE, `Unknown agent role: ${role}`, {
        httpStatus: 400,
        context: { role },
      });
    }

    // Crear instancia del agente
    const instance = this.createInstance(agentDefinition, context);

    // Crear tarea para el agente basada en el step
    const task: AgentTask = {
      id: crypto.randomUUID(),
      agentInstanceId: instance.instanceId,
      description: step.name,
      stepId: step.id,
      workflowId: context.workflowId,
      input: step.input,
      status: 'idle',
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);

    // Ejecutar la tarea
    return this.run(task, instance);
  }

  /**
   * Registra el resultado tipo commit de un agente.
   * - Persiste fila en agent_commits via AgentCommitRepository (RF-16) si está inyectado.
   * - Actualiza Run y Artifact repositories como antes.
   */
  private async logAgentResult(record: AgentCommitRecord, instance?: AgentInstance): Promise<void> {
    try {
      this.logger.info(`Agent commit recorded: ${record.summary} for task ${record.taskId}`);

      // RF-16: persistir en agent_commits para /api/commits y /commits page
      if (this.agentCommitRepository) {
        try {
          const agentDef = instance
            ? this.getAgentDefinitionById(instance.definitionId)
            : undefined;
          const role = agentDef?.role ?? 'unknown';
          const filesChanged = (record.artifacts ?? [])
            .map((a) => a.name)
            .filter((n): n is string => typeof n === 'string');
          const ts = Date.parse(record.createdAt);
          this.agentCommitRepository.create({
            id: record.id,
            runId: record.taskId,
            agentRole: role,
            summary: record.summary,
            filesChanged: JSON.stringify(filesChanged),
            timestampMs: Number.isFinite(ts) ? ts : Date.now(),
          });
        } catch (e) {
          // No matar el flujo del agente por un fallo de auditoría secundaria.
          this.logger.error(`Failed to persist agent commit row: ${(e as Error).message}`);
        }
      }

      // Integracion Trace Ledger (Gap 4)
      await this.runRepository.updateStatus(record.taskId, 'completed');
    } catch (error) {
      this.logger.error(`Failed to log agent result: ${(error as Error).message}`);
    }
  }

  /**
   * Ejecuta una tarea por parte del agente usando LLM real
   */
  private async executeAgentTask(
    task: AgentTask,
    instance: AgentInstance
  ): Promise<Record<string, unknown>> {
    const agentDef = this.getAgentDefinitionById(instance.definitionId);
    if (!agentDef) {
      throw new EngineError(
        ErrorCodes.ENGINE_COORDINATOR_FAILED,
        `Agent definition not found: ${instance.definitionId}`,
        { context: { definitionId: instance.definitionId } }
      );
    }

    if (!task.isSubTask && task.description.length > 4000) {
      const mapReduceResult = await this.executeWithMapReduce(task, instance);
      return {
        ...mapReduceResult,
        taskId: task.id,
        agentInstanceId: instance.instanceId,
        timestamp: new Date().toISOString(),
      };
    }

    const discoveredTools = await this.discoverSkillsForTask(task, agentDef);

    const systemMessage = {
      role: 'system' as const,
      content: `${agentDef.promptBase}\n\nAvailable Tools Schema:\n${JSON.stringify(discoveredTools)}`,
    };

    const userMessage = {
      role: 'user' as const,
      content: `${task.description}\nInput: ${JSON.stringify(task.input)}`,
    };

    const relevantMemory =
      instance.memory.interactionHistory.length > 0
        ? {
            role: 'user' as const,
            content: `Contexto relevante: ${JSON.stringify(instance.memory)}`,
          }
        : null;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      systemMessage,
      userMessage,
    ];
    if (relevantMemory) {
      messages.push(relevantMemory);
    }

    // Selección inteligente de modelo vía ModelGateway mejorado
    let selectedModel = 'gpt-4o-mini';
    if (this.modelSelector) {
      const selectionConfig = ROLE_SELECTION_MAP[agentDef.role] || {
        capability: 'chat',
        strategy: 'balanced',
      };

      const selectionResult = this.modelSelector.select({
        capability: selectionConfig.capability,
        strategy: selectionConfig.strategy,
        taskContext: task.description,
      });

      if (selectionResult.success) {
        selectedModel = selectionResult.data.modelId;
        this.logger.debug(
          `ModelGateway selected "${selectedModel}" for role "${agentDef.role}" (Strategy: ${selectionConfig.strategy})`
        );
      } else {
        this.logger.warn(
          `ModelGateway failed to select model for ${agentDef.role}, using default: ${selectionResult.error.message}`
        );
      }
    }

    const request: LLMRequest = {
      model: selectedModel,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    };

    try {
      const llmStartedAt = Date.now();
      const response = await this.completeWithFallback(request, task.workflowId);
      const latencyMs = Date.now() - llmStartedAt;

      // Legacy mode: completeWithFallback returned a fallback object instead of a response
      if ('fallback' in response) {
        return {
          ...response,
          taskId: task.id,
          agentInstanceId: instance.instanceId,
        };
      }

      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'agent.llm.called',
        source: 'agent-runtime',
        timestamp: new Date().toISOString(),
        payload: {
          agentInstanceId: instance.instanceId,
          agentDefinitionId: instance.definitionId,
          role: agentDef.role,
          status: instance.status,
          data: {
            model: request.model,
            tokensUsed: response.usage.total_tokens,
            latencyMs,
          },
        },
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        parsed = {
          rawContent: content,
          parseError: (parseError as Error).message,
        };
      }

      return {
        taskId: task.id,
        agentInstanceId: instance.instanceId,
        agentRole: agentDef.role,
        description: task.description,
        input: task.input,
        result: parsed,
        timestamp: new Date().toISOString(),
        executionContext: {
          toolsUsed: instance.activeTools,
          memorySize: Object.keys(instance.memory.taskData).length,
          modelUsed: request.model,
          tokensUsed: response.usage.total_tokens,
        },
      };
    } catch (error) {
      this.logger.error(`LLM call failed: ${(error as Error).message}`);

      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'agent.task.failed',
        source: 'agent-runtime',
        timestamp: new Date().toISOString(),
        payload: {
          agentInstanceId: instance.instanceId,
          agentDefinitionId: instance.definitionId,
          role: agentDef.role,
          status: 'failed',
          data: {
            taskId: task.id,
            error: (error as Error).message,
            fallback: true,
          },
        },
      });

      // In strict mode (or when FallbackChain already exhausted), re-throw so run()
      // marks the task as failed with the correct StepResult.status = 'failed'.
      // BudgetError always re-throws (budget enforcement is not a legacy fallback scenario).
      // In legacy mode without FallbackChain, return the historic fallback object.
      if (error instanceof BudgetError || (this.fallbackChain && this.llmFailMode === 'strict')) {
        throw error;
      }

      return {
        result: 'Agent unavailable due to LLM service interruption',
        status: 'failed',
        fallback: true,
        retryable: true,
        timestamp: new Date().toISOString(),
        taskId: task.id,
        agentInstanceId: instance.instanceId,
      };
    }
  }

  /**
   * Obtiene el rol de un agente por su ID de definición
   */
  private getAgentRole(definitionId: string): AgentRole {
    const agentDef = this.getAgentDefinitionById(definitionId);
    return agentDef ? agentDef.role : ('Planner' as AgentRole); // Valor por defecto
  }

  /**
   * Obtiene la definición de un agente por su ID
   */
  private getAgentDefinitionById(definitionId: string): AgentDefinition | undefined {
    return Object.values(AGENT_DEFINITIONS).find((def) => def.id === definitionId);
  }
}
