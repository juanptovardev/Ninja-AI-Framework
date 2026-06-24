/**
 * @ninja/learning-loop — index.ts
 * Barrel de exportaciones públicas del paquete Learning Loop.
 * Sistema de aprendizaje desde ejecuciones exitosas.
 *
 * Terminal A: Harvester (Turno 1)
 * Terminal B: Promoter y Learner (Turno 2)
 */

// ============================================================================
// Schema (Tipos públicos)
// ============================================================================

export type {
  LearningCandidate,
  EvaluationReport,
  EvalCriteria,
  LearningHarvestCompletedPayload,
  LearningCandidateEvaluatedPayload,
  LearningCandidateFilter,
  LearningCandidatePromotedPayload,
  CompressionStrategy,
  CompressionObservation,
  CompressionStats,
  LearningCompressionPatternLearnedPayload,
} from './schema.js';

// ============================================================================
// Harvester (Recolector de runs) — Terminal A
// ============================================================================

export { LearningHarvester, learningHarvester } from './harvester.js';

// ============================================================================
// Promoter (Promotor de plantillas) — Terminal B
// ============================================================================

export { LearningPromoter } from './promoter.js';

// ============================================================================
// CompressionLearner (Learner de compresión) — Terminal B
// ============================================================================

export { CompressionLearner } from './compression-learner.js';

// ============================================================================
// Evaluator (Evaluador de calidad) — Terminal A, Turno 2
// ============================================================================

export { LearningEvaluator, learningEvaluator, type EvaluationContext } from './evaluator.js';
