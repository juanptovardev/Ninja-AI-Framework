/**
 * @ninja/pulse-center — scorer.ts
 * Motor matemático para cálculo de scores de estabilidad y eficiencia de contexto.
 */

import {
  type StabilityScore,
  type LatencyMeasurement,
  type ContextEfficiencyScore,
} from './schema.js';

// ============================================================================
// Utilidades
// ============================================================================

/**
 * Genera un UUID v4 para identificadores.
 * Fallback para entornos sin crypto.randomUUID.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback simple (no criptográficamente seguro, suficiente para IDs internos)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Calcula el percentil de un array de números.
 * @param arr Array de números ordenado
 * @param p Percentil deseado (0-100)
 * @returns Valor en el percentil
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calcula la media de un array de números.
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calcula la desviación estándar de un array de números.
 */
function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Limita un número a un rango [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// Stability Score Calculation
// ============================================================================

/**
 * Calcula el StabilityScore para un proveedor LLM basado en mediciones de latencia.
 *
 * Fórmula: score = 100 - (p95/20) - (jitter/10) - (spikes*5) + (uptime*0.1)
 *
 * @param providerId - ID del proveedor/modelo evaluado
 * @param measurements - Array de mediciones de latencia
 * @returns StabilityScore completo con métricas calculadas
 */
export function calculateStabilityScore(
  providerId: string,
  measurements: LatencyMeasurement[]
): StabilityScore {
  // Filtrar mediciones por proveedor
  const providerMeasurements = measurements.filter((m) => m.providerId === providerId);

  // Si no hay mediciones, retornar score 0
  if (providerMeasurements.length === 0) {
    return {
      providerId,
      score: 0,
      metrics: {
        p95: 0,
        jitter: 0,
        spikes: 0,
        uptime: 0,
      },
      timestamp: Date.now(),
    };
  }

  // Separar exitosas y fallidas
  const successfulMeasurements = providerMeasurements.filter((m) => m.success);
  const failedMeasurements = providerMeasurements.filter((m) => !m.success);

  // Calcular uptime (%)
  const uptime = (successfulMeasurements.length / providerMeasurements.length) * 100;

  // Calcular métricas de latencia (solo mediciones exitosas)
  let p95 = 0;
  let jitter = 0;
  let spikes = 0;

  if (successfulMeasurements.length > 0) {
    const latencies = successfulMeasurements.map((m) => m.latencyMs);

    // Percentil 95
    p95 = percentile(latencies, 95);

    // Jitter (desviación estándar)
    jitter = stdDev(latencies);

    // Spikes: latencias > 2x el promedio
    const avgLatency = mean(latencies);
    spikes = latencies.filter((l) => l > avgLatency * 2).length;
  }

  // Aplicar fórmula de score
  // score = 100 - (p95/20) - (jitter/10) - (spikes*5) + (uptime*0.1)
  let score = 100 - p95 / 20 - jitter / 10 - spikes * 5 + uptime * 0.1;

  // Clamp a rango [0, 100]
  score = clamp(score, 0, 100);

  // Redondear a 2 decimales para legibilidad
  score = Math.round(score * 100) / 100;

  return {
    providerId,
    score,
    metrics: {
      p95: Math.round(p95 * 100) / 100,
      jitter: Math.round(jitter * 100) / 100,
      spikes,
      uptime: Math.round(uptime * 100) / 100,
    },
    timestamp: Date.now(),
  };
}

/**
 * Calcula StabilityScore para múltiples proveedores de una sola vez.
 *
 * @param measurements - Array de mediciones de latencia (todos los proveedores)
 * @param providerIds - Array de IDs de proveedores a evaluar
 * @returns Mapa de providerId -> StabilityScore
 */
export function calculateStabilityScores(
  measurements: LatencyMeasurement[],
  providerIds: string[]
): Map<string, StabilityScore> {
  const scores = new Map<string, StabilityScore>();

  for (const providerId of providerIds) {
    const score = calculateStabilityScore(providerId, measurements);
    scores.set(providerId, score);
  }

  return scores;
}

// ============================================================================
// Context Efficiency Score Calculation
// ============================================================================

/**
 * Calcula el score de eficiencia de contexto para una interacción agente/sesión.
 *
 * Fórmula: score = (quality * 100) / log10(tokensUsed + 1)
 * Normalizado a rango [0, 100]
 *
 * @param agentId - ID del agente
 * @param sessionId - ID de la sesión
 * @param tokensUsed - Cantidad de tokens utilizados
 * @param responseQuality - Calidad de la respuesta (0-1)
 * @returns ContextEfficiencyScore completo
 */
export function calculateContextEfficiency(
  agentId: string,
  sessionId: string,
  tokensUsed: number,
  responseQuality: number
): ContextEfficiencyScore {
  // Validar inputs
  const validTokens = Math.max(0, tokensUsed);
  const validQuality = clamp(responseQuality, 0, 1);

  // Calcular score usando fórmula logarítmica
  // Penaliza uso excesivo de tokens, premia calidad
  const denominator = Math.log10(validTokens + 1);

  // Evitar división por cero (aunque log10(1) = 0, tokensUsed >= 0)
  // Cuando tokensUsed = 0, log10(1) = 0, así que manejamos ese caso
  let score: number;
  if (validTokens === 0) {
    // Sin tokens usados, score basado puramente en calidad escalada
    score = validQuality * 100;
  } else {
    score = (validQuality * 100) / denominator;
  }

  // Normalizar: la fórmula puede dar valores > 100 para pocos tokens + alta calidad
  // Ajustamos usando una función sigmoide suave para mapear a [0, 100]
  if (score > 100) {
    // Suavizar valores altos: score = 100 * (1 - e^(-score/100))
    score = 100 * (1 - Math.exp(-score / 100));
  }

  // Clamp final
  score = clamp(score, 0, 100);

  // Redondear a 2 decimales
  score = Math.round(score * 100) / 100;

  return {
    agentId,
    sessionId,
    score,
    tokensUsed: validTokens,
    responseQuality: validQuality,
    timestamp: Date.now(),
  };
}

/**
 * Calcula el score de eficiencia de contexto devolviendo solo el valor numérico.
 * Útil para comparaciones rápidas sin construir el objeto completo.
 *
 * @param tokensUsed - Cantidad de tokens utilizados
 * @param responseQuality - Calidad de la respuesta (0-1)
 * @returns Score numérico (0-100)
 */
export function calculateContextEfficiencyScore(
  tokensUsed: number,
  responseQuality: number
): number {
  const validTokens = Math.max(0, tokensUsed);
  const validQuality = clamp(responseQuality, 0, 1);

  let score: number;
  if (validTokens === 0) {
    score = validQuality * 100;
  } else {
    const denominator = Math.log10(validTokens + 1);
    score = (validQuality * 100) / denominator;
  }

  if (score > 100) {
    score = 100 * (1 - Math.exp(-score / 100));
  }

  return Math.round(clamp(score, 0, 100) * 100) / 100;
}
