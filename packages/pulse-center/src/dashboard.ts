/**
 * @ninja/pulse-center — dashboard.ts
 * Agregador de datos para el dashboard de salud del sistema.
 * Provee funciones para obtener vistas consolidadas del estado del framework.
 */

import type { PulseMonitor } from './monitor.js';
import { getOpenFindings, getFindingStats } from './finding.js';
import { type DashboardData, type HealthScore, HealthScoreSchema } from './schema.js';
import { NinjaError, ErrorCodes } from '@ninja/contracts';

// ============================================================================
// Referencia global al monitor (seteada en inicialización)
// ============================================================================

let globalMonitor: PulseMonitor | null = null;

/**
 * Configura el monitor global para uso del dashboard.
 * Debe llamarse durante la inicialización del sistema.
 * @param monitor Instancia del PulseMonitor
 */
export function setDashboardMonitor(monitor: PulseMonitor): void {
  globalMonitor = monitor;
}

/**
 * Obtiene el monitor global configurado.
 * @returns PulseMonitor o null si no está configurado
 */
export function getDashboardMonitor(): PulseMonitor | null {
  return globalMonitor;
}

// ============================================================================
// Dashboard Data
// ============================================================================

/**
 * Obtiene los datos completos del dashboard de salud.
 * Incluye scores de estabilidad, eficiencia de contexto, findings y metadatos.
 * @returns DashboardData completo
 * @throws Error si el monitor no está configurado
 */
export function getDashboardData(): DashboardData {
  if (!globalMonitor) {
    throw new NinjaError(
      ErrorCodes.PULSE_MONITOR_NOT_CONFIGURED,
      'PulseMonitor not configured. Call setDashboardMonitor() before using getDashboardData().',
      'runtime'
    );
  }

  // Obtener scores de estabilidad del monitor
  const stabilityScores = Array.from(globalMonitor.getStabilityScores().values());

  // Obtener scores de eficiencia de contexto
  const contextEfficiencyScores = Array.from(globalMonitor.getContextEfficiencyScores().values());

  // Obtener findings abiertos
  const findings = getOpenFindings();

  // Construir y retornar DashboardData
  return {
    stability: stabilityScores,
    contextEfficiency: contextEfficiencyScores,
    findings,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Vistas especializadas del dashboard
// ============================================================================

function requireMonitor(): PulseMonitor {
  if (!globalMonitor) {
    throw new NinjaError(
      ErrorCodes.PULSE_MONITOR_NOT_CONFIGURED,
      'PulseMonitor not configured. Call setDashboardMonitor() first.',
      'runtime'
    );
  }
  return globalMonitor;
}

/**
 * Obtiene un resumen de salud del sistema.
 * Útil para displays rápidos o indicadores de estado.
 */
export function getHealthSummary(): {
  overallScore: HealthScore;
  stabilityStatus: 'healthy' | 'degraded' | 'critical';
  contextEfficiencyStatus: 'healthy' | 'degraded' | 'critical';
  openFindingsCount: number;
  criticalFindingsCount: number;
  lastUpdated: number;
} {
  requireMonitor();

  const dashboardData = getDashboardData();

  // Calcular score de estabilidad promedio
  const stabilityScores = dashboardData.stability;
  const avgStabilityScore =
    stabilityScores.length > 0
      ? stabilityScores.reduce((sum, s) => sum + s.score, 0) / stabilityScores.length
      : 100;

  // Calcular score de eficiencia promedio
  const contextScores = dashboardData.contextEfficiency;
  const avgContextScore =
    contextScores.length > 0
      ? contextScores.reduce((sum, s) => sum + s.score, 0) / contextScores.length
      : 100;

  // Determinar estado de estabilidad
  let stabilityStatus: 'healthy' | 'degraded' | 'critical';
  if (avgStabilityScore >= 80) {
    stabilityStatus = 'healthy';
  } else if (avgStabilityScore >= 60) {
    stabilityStatus = 'degraded';
  } else {
    stabilityStatus = 'critical';
  }

  // Determinar estado de eficiencia
  let contextEfficiencyStatus: 'healthy' | 'degraded' | 'critical';
  if (avgContextScore >= 70) {
    contextEfficiencyStatus = 'healthy';
  } else if (avgContextScore >= 40) {
    contextEfficiencyStatus = 'degraded';
  } else {
    contextEfficiencyStatus = 'critical';
  }

  // Contar findings críticos
  const criticalFindingsCount = dashboardData.findings.filter(
    (f) => f.severity === 'critical'
  ).length;

  // Calcular score global (promedio ponderado)
  const overallScoreValue =
    Math.round((avgStabilityScore * 0.6 + avgContextScore * 0.4) * 100) / 100;

  // Determinar label del score global
  let overallLabel: string;
  if (overallScoreValue >= 80) {
    overallLabel = 'Healthy';
  } else if (overallScoreValue >= 60) {
    overallLabel = 'Degraded';
  } else if (overallScoreValue >= 40) {
    overallLabel = 'Warning';
  } else {
    overallLabel = 'Critical';
  }

  const overallScore: HealthScore = {
    value: overallScoreValue,
    label: overallLabel,
    timestamp: Date.now(),
  };

  // Validar con Zod
  HealthScoreSchema.parse(overallScore);

  return {
    overallScore,
    stabilityStatus,
    contextEfficiencyStatus,
    openFindingsCount: dashboardData.findings.length,
    criticalFindingsCount,
    lastUpdated: dashboardData.timestamp,
  };
}

/**
 * Obtiene métricas detalladas de proveedores LLM.
 * Útil para la vista de estabilidad del dashboard.
 */
export function getProviderMetrics(): Array<{
  providerId: string;
  score: number;
  p95: number;
  jitter: number;
  uptime: number;
  lastUpdated: number;
}> {
  const monitor = requireMonitor();

  const scores = Array.from(monitor.getStabilityScores().values());

  return scores.map((score) => ({
    providerId: score.providerId,
    score: score.score,
    p95: score.metrics.p95,
    jitter: score.metrics.jitter,
    uptime: score.metrics.uptime,
    lastUpdated: score.timestamp,
  }));
}

/**
 * Obtiene métricas de eficiencia por agente.
 * Útil para la vista de contexto del dashboard.
 */
export function getAgentEfficiencyMetrics(): Array<{
  agentId: string;
  sessionId: string;
  score: number;
  tokensUsed: number;
  responseQuality: number;
  lastUpdated: number;
}> {
  const monitor = requireMonitor();

  const scores = Array.from(monitor.getContextEfficiencyScores().values());

  return scores.map((score) => ({
    agentId: score.agentId,
    sessionId: score.sessionId,
    score: score.score,
    tokensUsed: score.tokensUsed,
    responseQuality: score.responseQuality,
    lastUpdated: score.timestamp,
  }));
}

/**
 * Obtiene un resumen de findings para el dashboard.
 */
export function getFindingsSummary(): {
  total: number;
  open: number;
  resolved: number;
  bySeverity: {
    info: number;
    warning: number;
    critical: number;
  };
  byType: {
    performance: number;
    stability: number;
    context: number;
    system: number;
  };
  recentOpen: Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    timestamp: number;
  }>;
} {
  const stats = getFindingStats();
  const openFindings = getOpenFindings();

  // Obtener los 5 findings abiertos más recientes
  const recentOpen = openFindings.slice(0, 5).map((finding) => ({
    id: finding.id,
    type: finding.type,
    severity: finding.severity,
    message: finding.message,
    timestamp: finding.timestamp,
  }));

  return {
    total: stats.total,
    open: stats.open,
    resolved: stats.resolved,
    bySeverity: stats.bySeverity,
    byType: stats.byType,
    recentOpen,
  };
}

/**
 * Obtiene estadísticas del sistema en tiempo real.
 * Incluye conteos de mediciones y scores.
 */
export function getSystemStats(): {
  latencyMeasurementsCount: number;
  stabilityScoresCount: number;
  contextEfficiencyScoresCount: number;
  monitorActive: boolean;
} {
  if (!globalMonitor) {
    return {
      latencyMeasurementsCount: 0,
      stabilityScoresCount: 0,
      contextEfficiencyScoresCount: 0,
      monitorActive: false,
    };
  }

  return {
    latencyMeasurementsCount: globalMonitor.getLatencyMeasurementCount(),
    stabilityScoresCount: globalMonitor.getStabilityScores().size,
    contextEfficiencyScoresCount: globalMonitor.getContextEfficiencyScores().size,
    monitorActive: true,
  };
}

// ============================================================================
// Utilidades
// ============================================================================

/**
 * Verifica si el dashboard está configurado y listo para usar.
 * @returns true si el monitor está configurado
 */
export function isDashboardReady(): boolean {
  return globalMonitor !== null;
}

/**
 * Limpia la configuración del dashboard.
 * Útil para tests o reinicio del sistema.
 */
export function clearDashboard(): void {
  globalMonitor = null;
}
