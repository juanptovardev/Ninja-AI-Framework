/**
 * @ninja/learning-loop — schema.ts
 * Tipos para el sistema de aprendizaje desde ejecuciones exitosas.
 */

import type { ID, Timestamp } from '@ninja/contracts';

// ---------------------------------------------------------------------------
// LearningCandidate — Run candidato a aprender
// ---------------------------------------------------------------------------

/**
 * Candidato de aprendizaje derivado de un run exitoso.
 */
export interface LearningCandidate {
  /** ID del run original en Trace Ledger */
  readonly runId: ID;
  /** ID del agente que ejecutó el run */
  readonly agentId: ID;
  /** Tipo de tarea realizada */
  readonly taskType: string;
  /** Resultado del run (output relevante) */
  readonly result: string;
  /** Score de calidad calculado (0-100) */
  readonly qualityScore: number;
  /** Timestamp cuando fue promocionado (opcional) */
  readonly promotedAt?: Timestamp;
}

// ---------------------------------------------------------------------------
// EvaluationReport — Reporte de evaluación de calidad
// ---------------------------------------------------------------------------

/**
 * Criterio individual de evaluación.
 */
export interface EvalCriteria {
  /** Nombre del criterio (ej: "success_rate", "relevance", "completeness") */
  readonly name: string;
  /** Score obtenido para este criterio (0-100) */
  readonly score: number;
  /** Peso del criterio en el score total (0-1) */
  readonly weight: number;
}

/**
 * Reporte de evaluación de un candidato.
 */
export interface EvaluationReport {
  /** ID del candidato evaluado */
  readonly candidateId: ID;
  /** Lista de criterios evaluados */
  readonly criteria: EvalCriteria[];
  /** Score total ponderado (0-100) */
  readonly totalScore: number;
  /** Si se recomienda promoción a plantilla */
  readonly recommendPromotion: boolean;
}

// ---------------------------------------------------------------------------
// Event Payloads
// ---------------------------------------------------------------------------

/**
 * Payload emitido cuando se completa una cosecha de candidatos.
 */
export interface LearningHarvestCompletedPayload {
  /** Número de candidatos cosechados */
  readonly count: number;
  /** Timestamp de la cosecha */
  readonly harvestedAt: Timestamp;
}

/**
 * Payload emitido cuando se evalúa un candidato.
 */
export interface LearningCandidateEvaluatedPayload {
  /** ID del candidato */
  readonly candidateId: ID;
  /** Score total */
  readonly totalScore: number;
  /** Si se recomienda promoción */
  readonly recommended: boolean;
}

/**
 * Payload emitido cuando se promueve un candidato a plantilla.
 */
export interface LearningCandidatePromotedPayload {
  /** ID del candidato promocionado */
  readonly candidateId: ID;
  /** Tipo de tarea */
  readonly taskType: string;
  /** ID del run original */
  readonly runId: ID;
  /** ID del agente */
  readonly agentId: ID;
}

// ---------------------------------------------------------------------------
// CompressionStrategy — Nivel de compresión recomendado
// ---------------------------------------------------------------------------

/**
 * Estrategia de compresión recomendada por el learner.
 */
export type CompressionStrategy = 'aggressive' | 'balanced' | 'minimal';

/**
 * Registro de observación de compresión.
 */
export interface CompressionObservation {
  /** Tipo de tarea */
  readonly taskType: string;
  /** Ratio de compresión (0-1, donde 1 es máxima compresión) */
  readonly compressionRatio: number;
  /** Calidad del resultado después de compresión (0-1) */
  readonly quality: number;
  /** Timestamp de la observación */
  readonly observedAt: Timestamp;
}

/**
 * Estadísticas agregadas por tipo de tarea.
 */
export interface CompressionStats {
  /** Tipo de tarea */
  readonly taskType: string;
  /** Número de observaciones */
  readonly sampleCount: number;
  /** Ratio promedio */
  readonly avgRatio: number;
  /** Calidad promedio */
  readonly avgQuality: number;
  /** Estrategia recomendada */
  readonly recommendedStrategy: CompressionStrategy;
}

/**
 * Payload emitido cuando se aprende un nuevo patrón de compresión.
 */
export interface LearningCompressionPatternLearnedPayload {
  /** Tipo de tarea */
  readonly taskType: string;
  /** Estrategia recomendada */
  readonly strategy: CompressionStrategy;
  /** Número de muestras usadas */
  readonly sampleCount: number;
  /** Score de confianza (0-1) */
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// Query Types
// ---------------------------------------------------------------------------

/**
 * Filtros para buscar candidatos de aprendizaje.
 */
export interface LearningCandidateFilter {
  readonly agentId?: ID;
  readonly taskType?: string;
  readonly minQualityScore?: number;
  readonly promoted?: boolean;
}
