import type { Logger } from '@ninja/logging';
import type { ID } from '@ninja/contracts';
import type { Policy, PolicyDecision, EvaluationContext } from './schema';

/**
 * Motor de políticas de Sentinel — decide qué acciones de agentes requieren burocracia
 */
export class PolicyEngine {
  /** Políticas registradas ordenadas por prioridad */
  private policies: Policy[] = [];
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.loadDefaultPolicies();
    this.logger.info('PolicyEngine initialized', { policyCount: this.policies.length });
  }

  /**
   * Carga las políticas predeterminadas del sistema
   */
  private loadDefaultPolicies(): void {
    this.policies = [
      {
        id: 'shell-execute-require-approval' as ID,
        name: 'Shell Execution Requires Approval',
        description: 'Ejecución de comandos shell requiere aprobación manual',
        actionType: 'shell.execute',
        action: 'require-approval',
        priority: 10,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'agent-spawn-allow-log' as ID,
        name: 'Agent Spawn Allowed with Log',
        description: 'Creación de agentes permitida con registro de auditoría',
        actionType: 'agent.spawn',
        action: 'allow',
        priority: 20,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'fs-write-outside-workspace-require-approval' as ID,
        name: 'Filesystem Write Outside Workspace Requires Approval',
        description: 'Escritura fuera del workspace requiere aprobación',
        actionType: 'fs.write',
        action: 'require-approval',
        priority: 15,
        conditions: { requireApprovalOutsideWorkspace: true },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'http-request-allow-audit' as ID,
        name: 'HTTP Requests Allowed with Audit',
        description: 'Peticiones HTTP permitidas con registro de auditoría completo',
        actionType: 'http.request',
        action: 'allow',
        priority: 30,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'git-push-main-block' as ID,
        name: 'Git Push to Main Branch Blocked',
        description: 'Push a ramas principales bloqueado automáticamente',
        actionType: 'git.push',
        action: 'block',
        priority: 5,
        conditions: { branch: 'main' },
        createdAt: new Date().toISOString(),
      },
    ];

    // Ordenar por prioridad (menor = más importante)
    this.policies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Evalúa una acción contra todas las políticas registradas
   */
  evaluate(actionType: string, context: EvaluationContext): PolicyDecision {
    this.logger.debug('Evaluating action', { actionType, agentId: context.agentId });

    // Buscar la primera política que coincida con el tipo de acción
    const matchedPolicy = this.policies.find(
      (policy) =>
        this.matchesActionType(policy.actionType, actionType) &&
        this.matchesConditions(policy, context)
    );

    if (matchedPolicy) {
      return {
        action: matchedPolicy.action,
        policyId: matchedPolicy.id,
        reason: `Policy matched: ${matchedPolicy.name}`,
        metadata: { policy: matchedPolicy.name, actionType },
      };
    }

    // Política por defecto: allow con log
    return {
      action: 'allow',
      reason: 'No matching policy found, defaulting to allow',
      metadata: { actionType },
    };
  }

  /**
   * Verifica si el tipo de acción coincide con el patrón de la política
   */
  private matchesActionType(policyPattern: string, actionType: string): boolean {
    // Soporte simple para wildcard: "shell.*" o "fs.write.*"
    if (policyPattern.endsWith('.*')) {
      const prefix = policyPattern.slice(0, -2);
      return actionType.startsWith(prefix);
    }
    return policyPattern === actionType;
  }

  /**
   * Verifica condiciones adicionales de la política
   */
  private matchesConditions(policy: Policy, context: EvaluationContext): boolean {
    if (!policy.conditions) return true;

    // Implementación simple para condiciones básicas
    // En un futuro podría usar un motor de evaluación más sofisticado
    for (const [key, expectedValue] of Object.entries(policy.conditions)) {
      const actualValue = context.actionDetails[key];

      if (expectedValue !== actualValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Registra una nueva política (para extensión en runtime)
   */
  registerPolicy(policy: Omit<Policy, 'createdAt'>): void {
    const fullPolicy: Policy = {
      ...policy,
      createdAt: new Date().toISOString(),
    };

    this.policies.push(fullPolicy);
    // Reordenar después de agregar
    this.policies.sort((a, b) => a.priority - b.priority);

    this.logger.info('New policy registered', { policyId: policy.id, name: policy.name });
  }

  /**
   * Elimina una política por ID
   */
  removePolicy(policyId: ID): boolean {
    const initialLength = this.policies.length;
    this.policies = this.policies.filter((p) => p.id !== policyId);

    const removed = initialLength > this.policies.length;
    if (removed) {
      this.logger.info('Policy removed', { policyId });
    }

    return removed;
  }

  /**
   * Lista todas las políticas activas
   */
  listPolicies(): readonly Policy[] {
    return [...this.policies];
  }

  /**
   * Busca una política específica por ID
   */
  getPolicy(policyId: ID): Policy | null {
    return this.policies.find((p) => p.id === policyId) || null;
  }

  /**
   * Verifica si una acción específica requiere aprobación
   */
  requiresApproval(actionType: string, context: EvaluationContext): boolean {
    const decision = this.evaluate(actionType, context);
    return decision.action === 'require-approval';
  }

  /**
   * Genera un resumen amigable de una decisión
   */
  getFriendlyDecisionSummary(decision: PolicyDecision): string {
    switch (decision.action) {
      case 'allow':
        return `Acción permitida: ${decision.reason}`;
      case 'block':
        return `Acción bloqueada: ${decision.reason}`;
      case 'require-approval':
        return `Aprobación requerida: ${decision.reason}`;
      default:
        return `Decisión: ${decision.action}`;
    }
  }
}
