/**
 * @ninja/learning-loop — evaluator.ts
 * Evaluador de candidatos de aprendizaje.
 * Aplica criterios ponderados para determinar calidad y promocionabilidad.
 */

import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import type { ID } from '@ninja/contracts';
import type {
  LearningCandidate,
  EvaluationReport,
  EvalCriteria,
  LearningCandidateEvaluatedPayload,
} from './schema.js';

const log = createLogger('learning-evaluator');

// ---------------------------------------------------------------------------
// Configuración de Criterios
// ---------------------------------------------------------------------------

/**
 * Pesos de los criterios de evaluación.
 * La suma debe ser 1.0.
 */
const CRITERIA_WEIGHTS = {
  output_completeness: 0.4, // 40% - ¿Qué tan completo es el resultado?
  execution_speed: 0.3, // 30% - ¿Qué tan rápido se ejecutó?
  token_efficiency: 0.3, // 30% - ¿Qué tan eficientemente usó tokens?
} as const;

/**
 * Threshold para recomendar promoción.
 * Si el score total >= 70 (0.7 * 100), se recomienda promoción.
 */
const PROMOTION_THRESHOLD = 70;

/**
 * Interfaz para datos adicionales de evaluación.
 * Estos datos no están en LearningCandidate pero se pueden pasar opcionalmente.
 */
export interface EvaluationContext {
  /** Tiempo de ejecución en ms (opcional) */
  executionTimeMs?: number;
  /** Tokens utilizados (opcional) */
  tokensUsed?: number;
  /** Timestamp de inicio del run */
  startedAt?: string;
  /** Timestamp de fin del run */
  completedAt?: string;
}

interface LearningEvaluatorDeps {
  eventBus?: typeof eventBus;
}

// ---------------------------------------------------------------------------
// LearningEvaluator
// ---------------------------------------------------------------------------

/**
 * LearningEvaluator
 *
 * Responsable de:
 * - Evaluar candidatos de aprendizaje con criterios ponderados
 * - Calcular score total de calidad
 * - Determinar si un candidato debe ser promocionado
 * - Emitir evento 'learning.candidate.evaluated'
 */
export class LearningEvaluator {
  private eventBus: typeof eventBus;

  constructor(deps: LearningEvaluatorDeps = {}) {
    this.eventBus = deps.eventBus ?? eventBus;
  }

  /**
   * Evalúa un candidato de aprendizaje.
   *
   * @param candidate Candidato a evaluar
   * @param context Contexto adicional para evaluación (opcional)
   * @returns EvaluationReport con scores y recomendación
   */
  evaluate(candidate: LearningCandidate, context?: EvaluationContext): EvaluationReport {
    log.info('Evaluating candidate', {
      candidateId: candidate.runId,
      taskType: candidate.taskType,
    });

    // Calcular cada criterio
    const criteria: EvalCriteria[] = [
      this.evaluateOutputCompleteness(candidate, context),
      this.evaluateExecutionSpeed(candidate, context),
      this.evaluateTokenEfficiency(candidate, context),
    ];

    // Calcular score total ponderado
    const totalScore = this.calculateWeightedScore(criteria);

    // Determinar si se recomienda promoción
    const recommendPromotion = totalScore >= PROMOTION_THRESHOLD;

    // Construir reporte
    const report: EvaluationReport = {
      candidateId: candidate.runId,
      criteria,
      totalScore,
      recommendPromotion,
    };

    // Emitir evento
    this.emitEvaluated(report);

    log.info('Candidate evaluated', {
      candidateId: candidate.runId,
      totalScore,
      recommendPromotion,
    });

    return report;
  }

  // ---------------------------------------------------------------------------
  // Evaluadores de Criterios Individuales
  // ---------------------------------------------------------------------------

  /**
   * Evalúa qué tan completo es el output del candidato.
   *
   * Heurística:
   * - Longitud del resultado (0-100)
   * - Presencia de estructuras clave (código, templates, planes)
   *
   * Score: 0-100
   */
  private evaluateOutputCompleteness(
    candidate: LearningCandidate,
    context?: EvaluationContext
  ): EvalCriteria {
    let score = 0;
    const result = candidate.result;

    // Heurística 1: Longitud del resultado
    // Resultados entre 500-2000 chars son óptimos
    const length = result.length;
    if (length >= 500 && length <= 2000) {
      score = 100;
    } else if (length < 500) {
      // Escalar linealmente: 0 chars = 0 score, 500 chars = 100 score
      score = (length / 500) * 100;
    } else {
      // Penalizar resultados muy largos: > 2000 chars
      // Escalar hacia abajo: 2000 = 100, 5000+ = 20 score
      score = Math.max(20, 100 - (length - 2000) / 30);
    }

    // Heurística 2: Presencia de estructuras clave
    const hasCodeStructure =
      result.includes('function') ||
      result.includes('class') ||
      result.includes('interface') ||
      result.includes('const ') ||
      result.includes('export ');

    const hasTemplateStructure =
      (result.includes('<') && result.includes('>')) ||
      result.includes('{{') ||
      result.includes('props');

    const hasPlanStructure =
      result.includes('##') ||
      result.includes('###') ||
      result.includes('- ') ||
      result.includes('1. ');

    // Bonus por estructura
    if (hasCodeStructure) score = Math.min(100, score + 10);
    if (hasTemplateStructure) score = Math.min(100, score + 10);
    if (hasPlanStructure) score = Math.min(100, score + 5);

    // Clamp final
    score = Math.max(0, Math.min(100, score));

    return {
      name: 'output_completeness',
      score: Math.round(score * 100) / 100,
      weight: CRITERIA_WEIGHTS.output_completeness,
    };
  }

  /**
   * Evalúa la velocidad de ejecución del run.
   *
   * Heurística:
   * - Usa executionTimeMs si está disponible en context
   * - Si no, estima basándose en la complejidad del resultado
   *
   * Score: 0-100 (100 = muy rápido, 0 = muy lento)
   */
  private evaluateExecutionSpeed(
    candidate: LearningCandidate,
    context?: EvaluationContext
  ): EvalCriteria {
    let score = 50; // Default neutral

    if (context?.executionTimeMs !== undefined) {
      // Usar tiempo real de ejecución
      const time = context.executionTimeMs;

      // Escala: < 1000ms = 100, > 10000ms = 0
      if (time < 1000) {
        score = 100;
      } else if (time > 10000) {
        score = 0;
      } else {
        // Escalar linealmente de 1000ms (100) a 10000ms (0)
        score = 100 - ((time - 1000) / 9000) * 100;
      }
    } else {
      // Sin datos reales, estimar por complejidad del resultado
      const length = candidate.result.length;
      const complexity = length / 1000; // Simple proxy

      // Asumir que resultados más cortos son más rápidos
      // Pero no penalizar demasiado
      score = Math.max(30, 100 - complexity * 10);
    }

    // Clamp
    score = Math.max(0, Math.min(100, score));

    return {
      name: 'execution_speed',
      score: Math.round(score * 100) / 100,
      weight: CRITERIA_WEIGHTS.execution_speed,
    };
  }

  /**
   * Evalúa la eficiencia en el uso de tokens.
   *
   * Heurística:
   * - Usa tokensUsed si está disponible en context
   * - Si no, estima basándose en el tamaño del resultado
   *
   * Score: 0-100 (100 = muy eficiente, 0 = muy ineficiente)
   */
  private evaluateTokenEfficiency(
    candidate: LearningCandidate,
    context?: EvaluationContext
  ): EvalCriteria {
    let score = 50; // Default neutral

    if (context?.tokensUsed !== undefined) {
      // Usar tokens reales
      const tokens = context.tokensUsed;

      // Escala: < 500 tokens = 100, > 5000 tokens = 0
      if (tokens < 500) {
        score = 100;
      } else if (tokens > 5000) {
        score = 0;
      } else {
        // Escalar linealmente
        score = 100 - ((tokens - 500) / 4500) * 100;
      }
    } else {
      // Sin datos reales, estimar
      // Aproximación: 1 token ≈ 4 caracteres
      const estimatedTokens = candidate.result.length / 4;

      // Misma escala
      if (estimatedTokens < 500) {
        score = 100;
      } else if (estimatedTokens > 5000) {
        score = 0;
      } else {
        score = 100 - ((estimatedTokens - 500) / 4500) * 100;
      }
    }

    // Clamp
    score = Math.max(0, Math.min(100, score));

    return {
      name: 'token_efficiency',
      score: Math.round(score * 100) / 100,
      weight: CRITERIA_WEIGHTS.token_efficiency,
    };
  }

  // ---------------------------------------------------------------------------
  // Métodos Auxiliares
  // ---------------------------------------------------------------------------

  /**
   * Calcula el score ponderado total.
   *
   * Fórmula: Σ (score_i × weight_i)
   */
  private calculateWeightedScore(criteria: EvalCriteria[]): number {
    const total = criteria.reduce((sum, c) => {
      return sum + c.score * c.weight;
    }, 0);
    return Math.round(total * 100) / 100;
  }

  /**
   * Emite el evento 'learning.candidate.evaluated'.
   */
  private emitEvaluated(report: EvaluationReport): void {
    const payload: LearningCandidateEvaluatedPayload = {
      candidateId: report.candidateId,
      totalScore: report.totalScore,
      recommended: report.recommendPromotion,
    };
    const evt = createEvent('learning.candidate.evaluated', 'learning-loop', payload);
    this.eventBus.emit(evt);
  }
}

// Singleton export
export const learningEvaluator = new LearningEvaluator();
