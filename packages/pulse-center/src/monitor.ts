/**
 * @ninja/pulse-center — monitor.ts
 * Monitor de eventos del EventBus para cálculo automático de métricas y detección de anomalías.
 * Escucha eventos de agentes y emite alertas de salud.
 */

import type { EventBus, NinjaEvent, EventSubscription } from '@ninja/events';
import type { ID } from '@ninja/contracts';
import {
  type LatencyMeasurement,
  type StabilityScore,
  type ContextEfficiencyScore,
  type HealthScoreUpdatedPayload,
  type HealthDegradationDetectedPayload,
  type HealthContextInefficientPayload,
  type HealthFindingOpenedPayload,
  FindingTypeSchema,
  FindingSeveritySchema,
} from './schema.js';
import { calculateStabilityScore, calculateContextEfficiency } from './scorer.js';
import { openFinding } from './finding.js';

// ============================================================================
// Configuración
// ============================================================================

/** Configuración opcional para el monitor */
export interface PulseMonitorConfig {
  /** Umbral mínimo de estabilidad antes de emitir alerta (default: 60) */
  stabilityThreshold?: number;
  /** Umbral mínimo de eficiencia de contexto antes de emitir alerta (default: 40) */
  contextEfficiencyThreshold?: number;
  /** Máximo número de mediciones de latencia a mantener en memoria (default: 1000) */
  maxLatencyMeasurements?: number;
  /** Máximo número de scores de eficiencia a mantener en caché (default: 100) */
  maxContextEfficiencyScores?: number;
}

// ============================================================================
// PulseMonitor
// ============================================================================

/**
 * Monitor de salud del sistema que escucha eventos del EventBus.
 * Calcula scores automáticamente y emite alertas cuando se detectan degradaciones.
 */
export class PulseMonitor {
  // Almacenamiento de mediciones y scores
  private latencyMeasurements: LatencyMeasurement[] = [];
  private stabilityScores = new Map<string, StabilityScore>();
  private contextEfficiencyScores = new Map<string, ContextEfficiencyScore>();

  // Referencias a suscripciones del EventBus
  private subscriptions: EventSubscription[] = [];

  // Configuración
  private readonly stabilityThreshold: number;
  private readonly contextEfficiencyThreshold: number;
  private readonly maxLatencyMeasurements: number;
  private readonly maxContextEfficiencyScores: number;

  constructor(
    private readonly eventBus: EventBus,
    config: PulseMonitorConfig = {}
  ) {
    this.stabilityThreshold = config.stabilityThreshold ?? 60;
    this.contextEfficiencyThreshold = config.contextEfficiencyThreshold ?? 40;
    this.maxLatencyMeasurements = config.maxLatencyMeasurements ?? 1000;
    this.maxContextEfficiencyScores = config.maxContextEfficiencyScores ?? 100;
  }

  // ---------------------------------------------------------------------------
  // Control de ciclo de vida
  // ---------------------------------------------------------------------------

  /**
   * Inicia el monitoreo suscribiéndose a eventos del EventBus.
   * Debe llamarse antes de usar el monitor.
   */
  start(): void {
    if (this.subscriptions.length > 0) {
      // Ya está iniciado
      return;
    }

    // Suscribirse a eventos de agentes
    const llmSub = this.eventBus.on('agent.llm.called', (event) => {
      this.handleAgentLLMCalled(event as NinjaEvent);
    });

    const completedSub = this.eventBus.on('agent.task.completed', (event) => {
      this.handleAgentTaskCompleted(event as NinjaEvent);
    });

    const failedSub = this.eventBus.on('agent.task.failed', (event) => {
      this.handleAgentTaskFailed(event as NinjaEvent);
    });

    this.subscriptions.push(llmSub, completedSub, failedSub);
  }

  /**
   * Detiene el monitoreo cancelando todas las suscripciones.
   * Limpia el estado interno (opcionalmente).
   */
  stop(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
  }

  /**
   * Limpia el estado interno del monitor.
   * Útil para tests o reset del sistema.
   */
  reset(): void {
    this.latencyMeasurements = [];
    this.stabilityScores.clear();
    this.contextEfficiencyScores.clear();
  }

  // ---------------------------------------------------------------------------
  // Handlers de eventos
  // ---------------------------------------------------------------------------

  /**
   * Maneja el evento agent.llm.called.
   * Registra latencia y recalcula StabilityScore.
   */
  private handleAgentLLMCalled(event: NinjaEvent): void {
    const payload = event.payload as {
      agentInstanceId: string;
      agentDefinitionId: string;
      role: string;
      status: string;
      data: {
        model: string;
        tokensUsed?: number;
        latencyMs?: number;
      };
    };

    if (!payload?.data) return;

    const { model, latencyMs, tokensUsed } = payload.data;

    // Crear medición de latencia
    const measurement: LatencyMeasurement = {
      providerId: model || 'unknown',
      latencyMs: latencyMs ?? 0,
      timestamp: Date.now(),
      success: true,
    };

    // Agregar a almacenamiento y limitar tamaño
    this.latencyMeasurements.push(measurement);
    this.trimLatencyMeasurements();

    // Recalcular StabilityScore
    const score = calculateStabilityScore(measurement.providerId, this.latencyMeasurements);
    this.stabilityScores.set(measurement.providerId, score);

    // Emitir evento de score actualizado
    const scorePayload: HealthScoreUpdatedPayload = {
      scoreType: 'stability',
      score,
    };

    this.eventBus.emit({
      id: this.generateId(),
      type: 'health.score.updated',
      source: 'pulse-center',
      timestamp: new Date().toISOString(),
      payload: scorePayload,
    });

    // Detectar degradación
    if (score.score < this.stabilityThreshold) {
      const degradationPayload: HealthDegradationDetectedPayload = {
        providerId: measurement.providerId,
        currentScore: score.score,
        threshold: this.stabilityThreshold,
      };

      this.eventBus.emit({
        id: this.generateId(),
        type: 'health.degradation.detected',
        source: 'pulse-center',
        timestamp: new Date().toISOString(),
        payload: degradationPayload,
      });
    }
  }

  /**
   * Maneja el evento agent.task.completed.
   * Calcula ContextEfficiencyScore basado en tokens y calidad inferida.
   */
  private handleAgentTaskCompleted(event: NinjaEvent): void {
    const payload = event.payload as {
      agentInstanceId: string;
      agentDefinitionId: string;
      role: string;
      status: string;
      data: {
        taskId: string;
        result?: Record<string, unknown>;
      };
    };

    if (!payload?.data) return;

    const { agentInstanceId } = payload;
    const sessionId = payload.data.taskId;

    // Extraer tokens usados del resultado o usar estimación
    const resultData = payload.data.result as Record<string, unknown> | undefined;
    const result = resultData || {};
    const tokensUsed =
      (result.executionContext as Record<string, number> | undefined)?.tokensUsed ?? 100;

    // Inferir calidad del resultado (simplificado)
    // En una implementación real, esto podría usar heurísticas más sofisticadas
    const responseQuality = this.inferResponseQuality(result);

    // Calcular score de eficiencia
    const score = calculateContextEfficiency(
      agentInstanceId,
      sessionId,
      tokensUsed,
      responseQuality
    );

    // Guardar en caché con clave compuesta
    const cacheKey = `${agentInstanceId}:${sessionId}`;
    this.contextEfficiencyScores.set(cacheKey, score);
    this.trimContextEfficiencyScores();

    // Emitir evento de score actualizado
    const scorePayload: HealthScoreUpdatedPayload = {
      scoreType: 'contextEfficiency',
      score,
    };

    this.eventBus.emit({
      id: this.generateId(),
      type: 'health.score.updated',
      source: 'pulse-center',
      timestamp: new Date().toISOString(),
      payload: scorePayload,
    });

    // Detectar ineficiencia
    if (score.score < this.contextEfficiencyThreshold) {
      const inefficiencyPayload: HealthContextInefficientPayload = {
        agentId: agentInstanceId,
        sessionId,
        score: score.score,
        tokensUsed: score.tokensUsed,
      };

      this.eventBus.emit({
        id: this.generateId(),
        type: 'health.context.inefficient',
        source: 'pulse-center',
        timestamp: new Date().toISOString(),
        payload: inefficiencyPayload,
      });
    }
  }

  /**
   * Maneja el evento agent.task.failed.
   * Abre un finding de tipo 'system' con severidad 'critical'.
   */
  private handleAgentTaskFailed(event: NinjaEvent): void {
    const payload = event.payload as {
      agentInstanceId: string;
      agentDefinitionId: string;
      role: string;
      status: string;
      data: {
        taskId: string;
        error?: string;
        fallback?: boolean;
      };
    };

    if (!payload?.data) return;

    const { agentInstanceId } = payload;
    const { error, taskId, fallback } = payload.data;

    // Construir mensaje descriptivo
    const errorMessage = error ?? 'Unknown error';
    const fallbackText = fallback ? ' (fallback mode)' : '';
    const message = `Agent task failed${fallbackText}: ${errorMessage}`;

    // Abrir finding
    const finding = openFinding({
      type: 'system',
      severity: 'critical',
      message,
      agentId: agentInstanceId,
    });

    // Emitir evento de finding abierto
    const findingPayload: HealthFindingOpenedPayload = {
      finding,
    };

    this.eventBus.emit({
      id: this.generateId(),
      type: 'health.finding.opened',
      source: 'pulse-center',
      timestamp: new Date().toISOString(),
      payload: findingPayload,
    });
  }

  // ---------------------------------------------------------------------------
  // Métodos de consulta
  // ---------------------------------------------------------------------------

  /**
   * Obtiene todos los scores de estabilidad calculados.
   * @returns Mapa de providerId -> StabilityScore
   */
  getStabilityScores(): Map<string, StabilityScore> {
    return new Map(this.stabilityScores);
  }

  /**
   * Obtiene el score de estabilidad para un proveedor específico.
   * @param providerId ID del proveedor
   * @returns StabilityScore o undefined si no existe
   */
  getStabilityScore(providerId: string): StabilityScore | undefined {
    return this.stabilityScores.get(providerId);
  }

  /**
   * Obtiene todos los scores de eficiencia de contexto calculados.
   * @returns Mapa de cacheKey -> ContextEfficiencyScore
   */
  getContextEfficiencyScores(): Map<string, ContextEfficiencyScore> {
    return new Map(this.contextEfficiencyScores);
  }

  /**
   * Obtiene las mediciones de latencia almacenadas.
   * @returns Array de mediciones
   */
  getLatencyMeasurements(): LatencyMeasurement[] {
    return [...this.latencyMeasurements];
  }

  /**
   * Obtiene la cantidad de mediciones de latencia almacenadas.
   */
  getLatencyMeasurementCount(): number {
    return this.latencyMeasurements.length;
  }

  // ---------------------------------------------------------------------------
  // Utilidades privadas
  // ---------------------------------------------------------------------------

  /**
   * Genera un ID único para eventos.
   */
  private generateId(): ID {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Limita el tamaño del array de mediciones de latencia.
   */
  private trimLatencyMeasurements(): void {
    if (this.latencyMeasurements.length > this.maxLatencyMeasurements) {
      // Mantener las mediciones más recientes
      const startIndex = this.latencyMeasurements.length - this.maxLatencyMeasurements;
      this.latencyMeasurements = this.latencyMeasurements.slice(startIndex);
    }
  }

  /**
   * Limita el tamaño del mapa de scores de eficiencia.
   * Elimina las entradas más antiguas basadas en timestamp.
   */
  private trimContextEfficiencyScores(): void {
    if (this.contextEfficiencyScores.size <= this.maxContextEfficiencyScores) {
      return;
    }

    // Convertir a array y ordenar por timestamp descendente
    const entries = Array.from(this.contextEfficiencyScores.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);

    // Mantener solo las más recientes
    const toKeep = entries.slice(0, this.maxContextEfficiencyScores);
    this.contextEfficiencyScores = new Map(toKeep);
  }

  /**
   * Infiere la calidad de una respuesta basada en el resultado.
   * Heurística simple: respuestas con error tienen calidad baja,
   * respuestas con datos completos tienen calidad alta.
   */
  private inferResponseQuality(result: Record<string, unknown>): number {
    // Si hay error explícito, calidad baja
    if (result.error || result.parseError) {
      return 0.3;
    }

    // Si hay rawContent (fallo de parseo), calidad media-baja
    if (result.rawContent) {
      return 0.5;
    }

    // Si hay resultados sustanciales, calidad alta
    const keys = Object.keys(result);
    if (keys.length > 2) {
      return 0.9;
    }

    // Por defecto, calidad media
    return 0.7;
  }
}
