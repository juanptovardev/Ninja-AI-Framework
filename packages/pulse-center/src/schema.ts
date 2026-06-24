/**
 * @ninja/pulse-center — schema.ts
 * Esquemas Zod y tipos inferidos para el sistema de salud de Ninja AI Framework.
 * Define HealthScore, StabilityMetrics, StabilityScore, ContextEfficiencyScore y Finding.
 */

import { z } from 'zod';
import type { ID } from '@ninja/contracts';

// ============================================================================
// Health Score
// ============================================================================

/**
 * Esquema Zod para HealthScore.
 * Representa una métrica de salud genérica con valor 0-100.
 */
export const HealthScoreSchema = z.object({
  /** Valor numérico de salud (0-100) */
  value: z.number().min(0).max(100),
  /** Etiqueta descriptiva legible */
  label: z.string(),
  /** Timestamp Unix en milisegundos */
  timestamp: z.number(),
});

/** Tipo inferido para HealthScore */
export type HealthScore = z.infer<typeof HealthScoreSchema>;

// ============================================================================
// Stability Metrics & Score (LLM Providers)
// ============================================================================

/**
 * Esquema Zod para StabilityMetrics.
 * Métricas de estabilidad de un proveedor LLM.
 */
export const StabilityMetricsSchema = z.object({
  /** Percentil 95 de latencia en ms */
  p95: z.number().min(0),
  /** Variación de latencia (jitter) en ms */
  jitter: z.number().min(0),
  /** Número de picos de latencia detectados */
  spikes: z.number().min(0),
  /** Porcentaje de uptime (0-100) */
  uptime: z.number().min(0).max(100),
});

/** Tipo inferido para StabilityMetrics */
export type StabilityMetrics = z.infer<typeof StabilityMetricsSchema>;

/**
 * Esquema Zod para StabilityScore.
 * Score de estabilidad calculado para un proveedor LLM.
 */
export const StabilityScoreSchema = z.object({
  /** ID del proveedor/modelo evaluado */
  providerId: z.string(),
  /** Score de estabilidad (0-100) */
  score: z.number().min(0).max(100),
  /** Métricas subyacentes */
  metrics: StabilityMetricsSchema,
  /** Timestamp Unix en milisegundos */
  timestamp: z.number(),
});

/** Tipo inferido para StabilityScore */
export type StabilityScore = z.infer<typeof StabilityScoreSchema>;

// ============================================================================
// Context Efficiency Score (Agent Sessions)
// ============================================================================

/**
 * Esquema Zod para ContextEfficiencyScore.
 * Mide la eficiencia del uso de contexto por agente y sesión.
 */
export const ContextEfficiencyScoreSchema = z.object({
  /** ID del agente */
  agentId: z.string(),
  /** ID de la sesión */
  sessionId: z.string(),
  /** Score de eficiencia (0-100) */
  score: z.number().min(0).max(100),
  /** Tokens utilizados en la interacción */
  tokensUsed: z.number().min(0),
  /** Calidad de la respuesta (0-1) */
  responseQuality: z.number().min(0).max(1),
  /** Timestamp Unix en milisegundos */
  timestamp: z.number(),
});

/** Tipo inferido para ContextEfficiencyScore */
export type ContextEfficiencyScore = z.infer<typeof ContextEfficiencyScoreSchema>;

// ============================================================================
// Findings (Alertas estructuradas)
// ============================================================================

/** Tipos de finding soportados */
export const FindingTypeSchema = z.enum(['performance', 'stability', 'context', 'system']);

export type FindingType = z.infer<typeof FindingTypeSchema>;

/** Niveles de severidad para findings */
export const FindingSeveritySchema = z.enum(['info', 'warning', 'critical']);

export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

/**
 * Esquema Zod para Finding.
 * Alerta estructurada generada por el sistema de monitoreo.
 */
export const FindingSchema = z.object({
  /** ID único del finding */
  id: z.string(),
  /** Tipo de finding */
  type: FindingTypeSchema,
  /** Nivel de severidad */
  severity: FindingSeveritySchema,
  /** Mensaje descriptivo del finding */
  message: z.string(),
  /** ID del agente asociado (opcional) */
  agentId: z.string().optional(),
  /** Timestamp Unix en milisegundos */
  timestamp: z.number(),
  /** Estado de resolución */
  resolved: z.boolean(),
});

/** Tipo inferido para Finding */
export type Finding = z.infer<typeof FindingSchema>;

// ============================================================================
// Dashboard Data
// ============================================================================

/**
 * Esquema Zod para los datos agregados del dashboard.
 * Usado por la UI para mostrar estado del sistema.
 */
export const DashboardDataSchema = z.object({
  /** Lista de scores de estabilidad por proveedor */
  stability: z.array(StabilityScoreSchema),
  /** Lista de scores de eficiencia de contexto */
  contextEfficiency: z.array(ContextEfficiencyScoreSchema),
  /** Lista de findings abiertos */
  findings: z.array(FindingSchema),
  /** Timestamp de la última actualización */
  timestamp: z.number(),
});

/** Tipo inferido para DashboardData */
export type DashboardData = z.infer<typeof DashboardDataSchema>;

// ============================================================================
// Event Payloads (para EventBus)
// ============================================================================

/** Payload para evento health.score.updated */
export interface HealthScoreUpdatedPayload {
  scoreType: 'stability' | 'contextEfficiency';
  score: StabilityScore | ContextEfficiencyScore;
}

/** Payload para evento health.finding.opened */
export interface HealthFindingOpenedPayload {
  finding: Finding;
}

/** Payload para evento health.finding.resolved */
export interface HealthFindingResolvedPayload {
  findingId: ID;
  resolvedAt: number;
}

/** Payload para evento health.degradation.detected */
export interface HealthDegradationDetectedPayload {
  providerId: string;
  currentScore: number;
  threshold: number;
}

/** Payload para evento health.context.inefficient */
export interface HealthContextInefficientPayload {
  agentId: string;
  sessionId: string;
  score: number;
  tokensUsed: number;
}

// ============================================================================
// Utility Types
// ============================================================================

/** Filtro para consultas de findings */
export interface FindingFilter {
  type?: FindingType;
  severity?: FindingSeverity;
  agentId?: string;
  resolved?: boolean;
  since?: number;
  until?: number;
}

/** Entrada de latencia para cálculos de estabilidad */
export interface LatencyMeasurement {
  providerId: string;
  latencyMs: number;
  timestamp: number;
  success: boolean;
}
