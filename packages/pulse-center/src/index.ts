/**
 * @ninja/pulse-center — index.ts
 * Entry point del módulo Pulse Center.
 * Sistema de salud, métricas y monitoreo del Ninja AI Framework.
 */

// ============================================================================
// Schema (Tipos y esquemas Zod)
// ============================================================================

export {
  // Schemas Zod
  HealthScoreSchema,
  StabilityMetricsSchema,
  StabilityScoreSchema,
  ContextEfficiencyScoreSchema,
  FindingSchema,
  FindingTypeSchema,
  FindingSeveritySchema,
  DashboardDataSchema,
  // Tipos inferidos
  type HealthScore,
  type StabilityMetrics,
  type StabilityScore,
  type ContextEfficiencyScore,
  type Finding,
  type FindingType,
  type FindingSeverity,
  type FindingFilter,
  type DashboardData,
  // Payloads de eventos
  type HealthScoreUpdatedPayload,
  type HealthFindingOpenedPayload,
  type HealthFindingResolvedPayload,
  type HealthDegradationDetectedPayload,
  type HealthContextInefficientPayload,
  // Utilidades
  type LatencyMeasurement,
} from './schema.js';

// ============================================================================
// Scorer (Motor matemático)
// ============================================================================

export {
  calculateStabilityScore,
  calculateStabilityScores,
  calculateContextEfficiency,
  calculateContextEfficiencyScore,
} from './scorer.js';

// ============================================================================
// Finding (CRUD de hallazgos)
// ============================================================================

export {
  openFinding,
  resolveFinding,
  getFindingById,
  getOpenFindings,
  getResolvedFindings,
  getFindings,
  countFindings,
  deleteFinding,
  clearFindings,
  getFindingStats,
  type OpenFindingInput,
} from './finding.js';

// ============================================================================
// Monitor (Integración con EventBus)
// ============================================================================

export { PulseMonitor, type PulseMonitorConfig } from './monitor.js';

// ============================================================================
// Dashboard (Agregador de datos)
// ============================================================================

export {
  getDashboardData,
  getHealthSummary,
  getProviderMetrics,
  getAgentEfficiencyMetrics,
  getFindingsSummary,
  getSystemStats,
  setDashboardMonitor,
  getDashboardMonitor,
  isDashboardReady,
  clearDashboard,
} from './dashboard.js';
