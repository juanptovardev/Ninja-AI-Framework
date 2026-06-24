import type { EngineRequest, EnginePlan, EnginePlanStep, InterviewQuestion, InterviewAnswer } from './schema';
import type { WorkflowDefinition } from '@ninja/flow-matrix';
import type { AgentRole } from '@ninja/agent-runtime';
import type { Logger } from '@ninja/logging';
import type { EventBus } from '@ninja/events';
import { LLMClient, type LLMRequest } from '@ninja/integrations-llm';

export class IntakeProcessor {
  constructor(
    private readonly llmClient: LLMClient,
    private readonly eventBus: EventBus,
    private readonly logger: Logger
  ) {}

  /**
   * Procesa una solicitud y genera un plan de ejecución
   */
  async process(request: EngineRequest): Promise<EnginePlan> {
    this.logger.info(`Processing engine request: ${request.id}`, {
      mode: request.mode,
      prompt: request.prompt,
    });

    const mode = request.mode || (await this.determineMode(request.prompt));

    const tasks = await this.decomposeIntoTasks(request.prompt, mode);

    const steps = this.convertTasksToSteps(tasks);

    const agentAssignments = this.assignAgentsToSteps(steps);

    const workflow = this.generateWorkflowDefinition(request, steps, agentAssignments);

    const estimatedDuration = this.estimateDuration(steps);

    this.validatePlan(steps, agentAssignments);

    const plan: EnginePlan = {
      requestId: request.id,
      steps,
      agentAssignments,
      estimatedDuration,
      workflowId: workflow.id,
      createdAt: new Date().toISOString(),
    };

    this.logger.info(`Generated engine plan: ${plan.workflowId}`, {
      steps: steps.length,
      estimatedDuration,
    });

    return plan;
  }

  private async determineMode(
    prompt: string
  ): Promise<'build' | 'template' | 'repair' | 'workspace'> {
    const systemPrompt = `Eres un clasificador de solicitudes de desarrollo de software.
Analiza el prompt del usuario y determina el modo de operación.
Responde SOLO una palabra, sin explicaciones ni puntuación:
- build: si quiere crear algo nuevo
- template: si quiere usar una plantilla existente
- repair: si quiere arreglar algo que no funciona
- workspace: si quiere gestionar el espacio de trabajo`;

    const userMessage = prompt;

    const modelName = process.env.LLM_DEFAULT_MODEL || 'gpt-4o-mini';

    const request: LLMRequest = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 10,
    };

    try {
      const response = await this.llmClient.complete(request);
      const content = response.choices[0]?.message?.content?.trim().toLowerCase();

      const validModes = ['build', 'template', 'repair', 'workspace'] as const;
      if (content && validModes.includes(content as any)) {
        this.eventBus.emit({
          id: crypto.randomUUID(),
          type: 'intake.mode.llm.success',
          source: 'kage-engine',
          timestamp: new Date().toISOString(),
          payload: { mode: content, prompt: prompt.substring(0, 100), model: request.model },
        });
        return content as (typeof validModes)[number];
      }

      this.logger.warn(`LLM returned invalid mode: ${content}, falling back to keywords`);
      return this.determineModeFallback(prompt);
    } catch (error) {
      this.logger.error(`LLM classify failed: ${(error as Error).message}`);

      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'intake.mode.llm.failed',
        source: 'kage-engine',
        timestamp: new Date().toISOString(),
        payload: { error: (error as Error).message, fallback: true },
      });

      return this.determineModeFallback(prompt);
    }
  }

  private determineModeFallback(prompt: string): 'build' | 'template' | 'repair' | 'workspace' {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('build') || lowerPrompt.includes('crear')) {
      return 'build';
    } else if (lowerPrompt.includes('template') || lowerPrompt.includes('plantilla')) {
      return 'template';
    } else if (lowerPrompt.includes('repair') || lowerPrompt.includes('reparar')) {
      return 'repair';
    } else if (lowerPrompt.includes('workspace') || lowerPrompt.includes('espacio')) {
      return 'workspace';
    }

    return 'build';
  }

  private async decomposeIntoTasks(
    prompt: string,
    mode: string
  ): Promise<Array<{ id: string; description: string; dependencies: string[] }>> {
    const systemPrompt = `Eres un planificador de tareas de desarrollo de software experto.
Descompón la solicitud del usuario en tareas atómicas y secuenciales.
Responde SOLO con un JSON válido, sin markdown ni explicaciones.

Schema esperado:
[
  {
    "id": "task-1",
    "description": "Descripción clara de la tarea",
    "dependencies": []
  }
]

Reglas:
- Los IDs deben ser únicos y secuenciales: task-1, task-2, etc.
- Las dependencias son arrays de IDs de tareas previas
- Máximo 10 tareas
- Descripciones concisas en español`;

    const userMessage = `Modo: ${mode}\nSolicitud: ${prompt}`;

    const model = process.env.LLM_DEFAULT_MODEL || 'gpt-4o-mini';

    const request: LLMRequest = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    };

    try {
      const response = await this.llmClient.complete(request);
      const content = response.choices[0]?.message?.content ?? '';

      let tasks: Array<{ id: string; description: string; dependencies: string[] }>;
      try {
        tasks = JSON.parse(content);
      } catch (parseError) {
        this.logger.warn(`JSON parse failed for tasks, falling back to default`);
        return this.decomposeIntoTasksFallback(mode);
      }

      if (!Array.isArray(tasks) || tasks.length === 0) {
        this.logger.warn(`LLM returned invalid tasks structure, falling back`);
        return this.decomposeIntoTasksFallback(mode);
      }

      for (const task of tasks) {
        if (!task.id || !task.description) {
          this.logger.warn(`Invalid task structure, falling back`);
          return this.decomposeIntoTasksFallback(mode);
        }
      }

      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'intake.decompose.llm.success',
        source: 'kage-engine',
        timestamp: new Date().toISOString(),
        payload: { taskCount: tasks.length, model: request.model },
      });

      return tasks;
    } catch (error) {
      this.logger.error(`LLM decompose failed: ${(error as Error).message}`);

      this.eventBus.emit({
        id: crypto.randomUUID(),
        type: 'intake.decompose.llm.failed',
        source: 'kage-engine',
        timestamp: new Date().toISOString(),
        payload: { error: (error as Error).message, fallback: true },
      });

      return this.decomposeIntoTasksFallback(mode);
    }
  }

  private decomposeIntoTasksFallback(
    mode: string
  ): Array<{ id: string; description: string; dependencies: string[] }> {
    return [
      {
        id: 'task-1',
        description: 'Analizar requisitos del proyecto',
        dependencies: [],
      },
      {
        id: 'task-2',
        description: 'Diseñar arquitectura',
        dependencies: ['task-1'],
      },
      {
        id: 'task-3',
        description: 'Implementar componentes',
        dependencies: ['task-2'],
      },
      {
        id: 'task-4',
        description: 'Probar funcionalidad',
        dependencies: ['task-3'],
      },
    ];
  }

  /**
   * Convierte tareas en pasos del plan
   */
  private convertTasksToSteps(
    tasks: Array<{ id: string; description: string; dependencies: string[] }>
  ): EnginePlanStep[] {
    return tasks.map((task) => ({
      id: task.id,
      description: task.description,
      dependsOn: task.dependencies,
      requiredAgentRole: this.determineRequiredAgentRole(task.description),
      estimatedDuration: this.estimateTaskDuration(task.description),
    }));
  }

  /**
   * Determina el rol de agente requerido para una tarea
   */
  private determineRequiredAgentRole(description: string): AgentRole {
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('arquitectura') || lowerDesc.includes('diseño')) {
      return 'Planner';
    } else if (lowerDesc.includes('implementar') || lowerDesc.includes('codificar')) {
      return 'Backend';
    } else if (lowerDesc.includes('probar') || lowerDesc.includes('test')) {
      return 'Tester';
    } else if (lowerDesc.includes('documentar') || lowerDesc.includes('investigar')) {
      return 'Librarian';
    } else if (lowerDesc.includes('seguridad') || lowerDesc.includes('auditar')) {
      return 'Security';
    }

    return 'Planner'; // Valor por defecto
  }

  /**
   * Estima la duración de una tarea
   */
  private estimateTaskDuration(description: string): number {
    // Esta sería la implementación real usando un modelo para estimar
    // Por ahora, retornamos valores simulados
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('analizar') || lowerDesc.includes('revisar')) {
      return 30000; // 30 segundos
    } else if (lowerDesc.includes('diseñar') || lowerDesc.includes('arquitectura')) {
      return 60000; // 1 minuto
    } else if (lowerDesc.includes('implementar') || lowerDesc.includes('codificar')) {
      return 120000; // 2 minutos
    } else if (lowerDesc.includes('probar') || lowerDesc.includes('test')) {
      return 90000; // 1.5 minutos
    }

    return 45000; // 45 segundos por defecto
  }

  /**
   * Asigna agentes a pasos del plan
   */
  private assignAgentsToSteps(steps: EnginePlanStep[]): Record<string, AgentRole> {
    const assignments: Record<string, AgentRole> = {};

    for (const step of steps) {
      assignments[step.id] = step.requiredAgentRole;
    }

    return assignments;
  }

  /**
   * Genera una definición de workflow para Flow Matrix
   */
  private generateWorkflowDefinition(
    request: EngineRequest,
    steps: EnginePlanStep[],
    agentAssignments: Record<string, AgentRole>
  ): WorkflowDefinition {
    return {
      id: crypto.randomUUID(),
      name: `Workflow for request ${request.id}`,
      description: `Automated workflow for ${request.mode} request`,
      steps: steps.map((step) => ({
        id: step.id,
        name: step.description,
        type: 'agent',
        dependsOn: step.dependsOn,
        agentRole: agentAssignments[step.id],
        input: {
          prompt: step.description,
          context: request.context || {},
        },
        output: {},
        timeout: step.estimatedDuration ? step.estimatedDuration * 2 : 300000, // 5 minutos por defecto
      })),
      metadata: {
        requestId: request.id,
        mode: request.mode,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Calcula la duración estimada total del plan
   */
  private estimateDuration(steps: EnginePlanStep[]): number {
    return steps.reduce((total, step) => total + (step.estimatedDuration || 0), 0);
  }

  /**
   * Valida la integridad del plan
   */
  private validatePlan(steps: EnginePlanStep[], agentAssignments: Record<string, AgentRole>): void {
    // Verificar que todos los pasos tengan asignaciones de agentes
    for (const step of steps) {
      if (!agentAssignments[step.id]) {
        throw new Error(`Step ${step.id} has no assigned agent role`);
      }
    }

    // Verificar que no haya ciclos en las dependencias
    this.detectDependencyCycles(steps);

    // Verificar que todas las dependencias existan
    this.validateDependenciesExist(steps);
  }

  /**
   * Detecta ciclos en las dependencias
   */
  private detectDependencyCycles(steps: EnginePlanStep[]): void {
    // Implementación del algoritmo de detección de ciclos
    // Usando DFS (Depth-First Search)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (stepId: string): boolean => {
      if (recursionStack.has(stepId)) {
        return true;
      }

      if (visited.has(stepId)) {
        return false;
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = steps.find((s) => s.id === stepId);
      if (step) {
        for (const dep of step.dependsOn) {
          if (hasCycle(dep)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (hasCycle(step.id)) {
        throw new Error(`Circular dependency detected involving step ${step.id}`);
      }
    }
  }

  /**
   * Valida que todas las dependencias existan
   */
  private validateDependenciesExist(steps: EnginePlanStep[]): void {
    const stepIds = new Set(steps.map((s) => s.id));

    for (const step of steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          throw new Error(`Step ${step.id} depends on non-existent step ${dep}`);
        }
      }
    }
  }

  /**
   * Genera preguntas de entrevista para clarificar la solicitud
   */
  async generateInterview(prompt: string, vaultContext?: string): Promise<InterviewQuestion[]> {
    const systemPrompt = `Eres un Arquitecto de Software Senior analizando una nueva solicitud de producto/feature.
Genera un MINIMO de 7 preguntas para entender completamente el requerimiento.
OBLIGATORIO: La primera pregunta (P1) DEBE ser de Detección de Intención (ej. ¿Es una aplicación Enterprise interna o una Landing page/SaaS público?).

Responde ÚNICAMENTE con un JSON válido usando este schema:
[
  {
    "id": "string",
    "text": "string",
    "type": "open" | "choice" | "boolean",
    "options": ["string"] // solo si type es "choice"
    "required": boolean
  }
]`;

    const request: LLMRequest = {
      model: process.env.LLM_PREMIUM_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Prompt: ${prompt}\n\nContexto (Vault): ${vaultContext || 'N/A'}` },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    };

    try {
      const response = await this.llmClient.complete(request);
      const content = response.choices[0]?.message?.content ?? '[]';
      
      const jsonStrMatch = content.match(/\[[\s\S]*\]/);
      const jsonStr = jsonStrMatch ? jsonStrMatch[0] : '[]';
      const questions: InterviewQuestion[] = JSON.parse(jsonStr);
      
      if (questions.length < 7) {
        this.logger.warn(`El LLM generó menos de 7 preguntas (${questions.length}).`);
      }
      
      return questions;
    } catch (error) {
      this.logger.error(`Error generando entrevista: ${(error as Error).message}`);
      return [
        { id: 'q1', text: '¿Es una aplicación Enterprise interna o una Landing page/SaaS público?', type: 'choice', options: ['Enterprise', 'Landing', 'SaaS', 'Otro'], required: true },
        { id: 'q2', text: '¿Cuáles son los roles de usuario principales?', type: 'open', required: true },
        { id: 'q3', text: '¿Qué integraciones externas son necesarias?', type: 'open', required: true },
        { id: 'q4', text: '¿Existen restricciones de tiempo o presupuesto?', type: 'open', required: false },
        { id: 'q5', text: '¿Cuáles son los requisitos de rendimiento o escalabilidad?', type: 'open', required: false },
        { id: 'q6', text: '¿Cómo se manejará la autenticación y autorización?', type: 'open', required: true },
        { id: 'q7', text: '¿Hay alguna preferencia de stack tecnológico adicional a la base?', type: 'open', required: false },
      ];
    }
  }

  /**
   * Genera automáticamente un PRD estructurado basado en las respuestas
   */
  async autoGeneratePRD(questions: InterviewQuestion[], answers: InterviewAnswer[], prompt: string, vaultContext?: string): Promise<string> {
    const qnaText = questions.map(q => {
      const a = answers.find(ans => ans.questionId === q.id);
      return `Q: ${q.text}\nA: ${a?.answer || 'No respondido'}`;
    }).join('\n\n');

    const systemPrompt = `Eres un Orquestador Enterprise creando un Product Requirements Document (PRD) profesional.
Basado en el prompt inicial, el contexto del Vault, y las respuestas a la entrevista, genera un PRD estructurado en Markdown.
Debe incluir:
1. Resumen Ejecutivo
2. Detección de Intención y Alcance
3. Requisitos Funcionales
4. Requisitos No Funcionales
5. Supuestos y Restricciones`;

    const request: LLMRequest = {
      model: process.env.LLM_PREMIUM_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Prompt Inicial: ${prompt}\n\nContexto (Vault): ${vaultContext || 'N/A'}\n\nEntrevista:\n${qnaText}` },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    };

    try {
      const response = await this.llmClient.complete(request);
      return response.choices[0]?.message?.content ?? '# PRD Generado\n(Contenido vacío)';
    } catch (error) {
      this.logger.error(`Error generando PRD: ${(error as Error).message}`);
      return `# PRD de Respaldo\nHubo un error al generar el PRD completo.`;
    }
  }
}
