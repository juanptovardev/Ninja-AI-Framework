/**
 * @ninja/learning-loop — compression-learner.ts
 * CompressionLearner: Aprende patrones de compresión óptimos por tipo de tarea.
 *
 * Responsabilidades:
 * - Registrar observaciones de compresión (ratio y calidad)
 * - Calcular estadísticas agregadas por tipo de tarea
 * - Recomendar estrategia de compresión basada en heurística
 * - Emitir eventos cuando se aprende un nuevo patrón
 */

import type { Timestamp } from '@ninja/contracts';
import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import type {
  CompressionStrategy,
  CompressionObservation,
  CompressionStats,
  LearningCompressionPatternLearnedPayload,
} from './schema.js';

const log = createLogger('learning-loop:compression-learner');

// ---------------------------------------------------------------------------
// CompressionLearner
// ---------------------------------------------------------------------------

/**
 * Learner de compresión que aprende qué nivel de compresión funciona mejor
 * por tipo de tarea, basándose en ratios de compresión históricos y calidad.
 */
export class CompressionLearner {
  private readonly observations: Map<string, CompressionObservation[]>;
  private readonly stats: Map<string, CompressionStats>;
  private readonly eventBus: typeof eventBus;
  private readonly log: ReturnType<typeof createLogger>;
  private readonly minSamplesForEmit: number;

  constructor(eventBusInstance?: typeof eventBus, minSamplesForEmit = 10) {
    this.observations = new Map();
    this.stats = new Map();
    this.eventBus = eventBusInstance ?? eventBus;
    this.log = log;
    this.minSamplesForEmit = minSamplesForEmit;
    this.log.info('CompressionLearner initialized', { minSamplesForEmit });
  }

  /**
   * Registra una observación de compresión.
   *
   * @param taskType         Tipo de tarea
   * @param compressionRatio Ratio de compresión (0-1)
   * @param quality          Calidad del resultado (0-1)
   */
  record(taskType: string, compressionRatio: number, quality: number): void {
    if (compressionRatio < 0 || compressionRatio > 1) {
      this.log.warn('Invalid compression ratio', { taskType, compressionRatio });
      return;
    }

    if (quality < 0 || quality > 1) {
      this.log.warn('Invalid quality score', { taskType, quality });
      return;
    }

    const observation: CompressionObservation = {
      taskType,
      compressionRatio,
      quality,
      observedAt: new Date().toISOString(),
    };

    const existing = this.observations.get(taskType) ?? [];
    this.observations.set(taskType, [...existing, observation]);

    this.recalculateStats(taskType);

    this.log.debug('Compression observation recorded', {
      taskType,
      compressionRatio,
      quality,
      sampleCount: existing.length + 1,
    });
  }

  /**
   * Obtiene la mejor estrategia de compresión para un tipo de tarea.
   *
   * @param taskType Tipo de tarea
   * @returns Estrategia recomendada ('balanced' por defecto si no hay datos)
   */
  getBestStrategy(taskType: string): CompressionStrategy {
    const stats = this.stats.get(taskType);

    if (!stats) {
      this.log.debug('No stats available, using default strategy', { taskType });
      return 'balanced';
    }

    return stats.recommendedStrategy;
  }

  /**
   * Obtiene estadísticas agregadas para un tipo de tarea.
   *
   * @param taskType Tipo de tarea
   * @returns Estadísticas o undefined si no hay datos
   */
  getStats(taskType: string): CompressionStats | undefined {
    return this.stats.get(taskType);
  }

  /**
   * Limpia observaciones y estadísticas.
   *
   * @param taskType Si se proporciona, solo limpia ese tipo. Si no, limpia todo.
   */
  clear(taskType?: string): void {
    if (taskType) {
      this.observations.delete(taskType);
      this.stats.delete(taskType);
      this.log.info('Cleared compression data for task type', { taskType });
    } else {
      this.observations.clear();
      this.stats.clear();
      this.log.info('Cleared all compression data');
    }
  }

  // ---------------------------------------------------------------------------
  // Métodos Privados
  // ---------------------------------------------------------------------------

  /**
   * Recalcula estadísticas para un tipo de tarea.
   */
  private recalculateStats(taskType: string): void {
    const observations = this.observations.get(taskType);

    if (!observations || observations.length === 0) {
      return;
    }

    const sampleCount = observations.length;
    const totalRatio = observations.reduce((sum, obs) => sum + obs.compressionRatio, 0);
    const totalQuality = observations.reduce((sum, obs) => sum + obs.quality, 0);

    const avgRatio = totalRatio / sampleCount;
    const avgQuality = totalQuality / sampleCount;
    const recommendedStrategy = this.determineStrategy(avgRatio, avgQuality);

    const stats: CompressionStats = {
      taskType,
      sampleCount,
      avgRatio,
      avgQuality,
      recommendedStrategy,
    };

    this.stats.set(taskType, stats);

    this.log.debug('Stats recalculated', {
      taskType,
      sampleCount,
      avgRatio,
      avgQuality,
      recommendedStrategy,
    });

    if (sampleCount >= this.minSamplesForEmit) {
      this.emitPatternLearnedEvent(stats);
    }
  }

  /**
   * Determina la estrategia de compresión basada en heurística.
   *
   * Heurística:
   * - ratio > 0.6 && quality > 0.8 → aggressive
   * - ratio > 0.4 && quality > 0.6 → balanced
   * - default → minimal
   */
  private determineStrategy(avgRatio: number, avgQuality: number): CompressionStrategy {
    if (avgRatio > 0.6 && avgQuality > 0.8) {
      return 'aggressive';
    }

    if (avgRatio > 0.4 && avgQuality > 0.6) {
      return 'balanced';
    }

    return 'minimal';
  }

  /**
   * Emite evento de patrón aprendido.
   */
  private emitPatternLearnedEvent(stats: CompressionStats): void {
    const confidence = Math.min(stats.sampleCount / 100, 1.0);

    const payload: LearningCompressionPatternLearnedPayload = {
      taskType: stats.taskType,
      strategy: stats.recommendedStrategy,
      sampleCount: stats.sampleCount,
      confidence,
    };

    const event = createEvent('learning.compression.pattern.learned', 'learning-loop', payload);

    this.eventBus.emit(event);

    this.log.info('Compression pattern learned', {
      taskType: stats.taskType,
      strategy: stats.recommendedStrategy,
      sampleCount: stats.sampleCount,
      confidence,
    });
  }
}
