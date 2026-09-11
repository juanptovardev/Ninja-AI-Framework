/**
 * @ninja/ui-kit — widgets/live-data.ts
 * Mapeo puro evento→dato para los widgets del rail (TokenMeter, AgentStatus,
 * SessionTimer, ContextDepth). Sin DOM, sin estado: testeable en node (WP-E4).
 *
 * Los widgets reciben props; estos helpers transforman eventos reales del
 * eventBus (WS) y datos del dashboard en los props que consumen.
 */
import type { AgentInfo, AgentState } from './agent-status';

/** Estado de token reportado por el runtime (pulse.tokenMetrics). */
export interface TokenMetricsInput {
  readonly used?: number;
  readonly budget?: number;
}

/** Props de TokenMeter. */
export interface TokenMeterData {
  readonly current: number;
  readonly max: number;
}

/** Task del dashboard (recentTasks). */
export interface RecentTaskInput {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly agent?: string;
  readonly timestamp: number;
}

/** Evento mínimo del eventBus (payload sin tipar en la frontera WS). */
export interface LiveEventInput {
  readonly type?: string;
  readonly payload?: {
    readonly data?: { readonly tokensUsed?: number };
  };
}

/**
 * TokenMeter: metrics → props, con fallback explícito (nunca datos inventados).
 */
export function tokenMeterFromMetrics(
  metrics: TokenMetricsInput | null | undefined,
  fallback: TokenMeterData
): TokenMeterData {
  const used = metrics?.used;
  const budget = metrics?.budget;
  if (typeof used !== 'number' && typeof budget !== 'number') {
    return fallback;
  }
  return {
    current: typeof used === 'number' ? used : fallback.current,
    max: typeof budget === 'number' ? budget : fallback.max,
  };
}

/**
 * TokenMeter (live): extrae el delta de tokens de `agent.llm.called`.
 * Devuelve 0 si el evento no es un delta válido.
 */
export function tokenDeltaFromEvent(event: LiveEventInput): number {
  if (event?.type !== 'agent.llm.called') {
    return 0;
  }
  const tokensUsed = event.payload?.data?.tokensUsed;
  return typeof tokensUsed === 'number' && Number.isFinite(tokensUsed) && tokensUsed >= 0
    ? tokensUsed
    : 0;
}

/**
 * SessionTimer: deriva el inicio real de la sesión del runtime desde el uptime
 * del dashboard (process.uptime del kage-runtime). Real, no simulado.
 */
export function sessionStartFromUptime(now: number, uptimeSeconds: number): number {
  const uptimeMs = Math.max(0, uptimeSeconds) * 1000;
  return now - uptimeMs;
}

/**
 * ContextDepth: mapea el uso de tokens a la saturación de contexto.
 * (mismo par de datos que TokenMeter, expresado en el contrato de ContextDepth).
 */
export function contextDepthFromTokenMeter(data: TokenMeterData): {
  currentTokens: number;
  maxTokens: number;
} {
  return { currentTokens: data.current, maxTokens: data.max };
}

/**
 * AgentStatus: traduce el status de una task del dashboard a AgentState
 * del rail (misma semántica que clientes previos, ahora viva en ui-kit).
 */
export function agentStateFromTaskStatus(status: string): AgentState {
  switch (status) {
    case 'running':
      return 'working';
    case 'pending':
      return 'idle';
    case 'completed':
      return 'idle';
    default:
      return 'blocked';
  }
}

/**
 * AgentStatus: task reciente → AgentInfo. Devuelve null si no hay agente.
 */
export function agentInfoFromTask(task: RecentTaskInput): AgentInfo | null {
  const agent = task.agent?.trim();
  if (!agent) {
    return null;
  }
  const id = `agent-${agent.toLowerCase().replace(/\s+/g, '-')}`;
  return {
    id,
    name: agent,
    state: agentStateFromTaskStatus(task.status),
    task: task.status === 'running' ? task.name : undefined,
  };
}

/**
 * AgentStatus: varias tasks → lista de agentes (la más reciente por agente,
 * máx `limit`). Orden estable por timestamp descendente.
 */
interface AgentWithTimestamp extends AgentInfo {
  readonly _timestamp: number;
}

export function agentsFromTasks(tasks: readonly RecentTaskInput[], limit = 5): AgentInfo[] {
  const map = new Map<string, AgentWithTimestamp>();
  for (const task of tasks) {
    const info = agentInfoFromTask(task);
    if (info === null) {
      continue;
    }
    const existing = map.get(info.id);
    if (!existing || task.timestamp > existing._timestamp) {
      map.set(info.id, { ...info, _timestamp: task.timestamp });
    }
  }
  const result: AgentInfo[] = [];
  const ranked = Array.from(map.values()).sort((a, b) => b._timestamp - a._timestamp);
  for (const entry of ranked.slice(0, limit)) {
    result.push({
      id: entry.id,
      name: entry.name,
      state: entry.state,
      task: entry.task,
    });
  }
  return result;
}
