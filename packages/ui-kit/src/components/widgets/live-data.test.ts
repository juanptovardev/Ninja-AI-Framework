import { describe, it, expect } from 'vitest';
import {
  tokenMeterFromMetrics,
  tokenDeltaFromEvent,
  sessionStartFromUptime,
  contextDepthFromTokenMeter,
  agentStateFromTaskStatus,
  agentInfoFromTask,
  agentsFromTasks,
} from './live-data';

describe('live-data — TokenMeter', () => {
  it('mapea metrics reales del runtime a props', () => {
    expect(tokenMeterFromMetrics({ used: 1500, budget: 32000 }, { current: 0, max: 0 })).toEqual({
      current: 1500,
      max: 32000,
    });
  });

  it('usa el fallback explícito cuando no hay metrics (nunca inventa datos)', () => {
    expect(tokenMeterFromMetrics(null, { current: 0, max: 0 })).toEqual({ current: 0, max: 0 });
    expect(tokenMeterFromMetrics(undefined, { current: 0, max: 0 })).toEqual({
      current: 0,
      max: 0,
    });
  });

  it('combina used real con budget fallback si falta uno de los dos', () => {
    expect(tokenMeterFromMetrics({ used: 500 }, { current: 0, max: 1000 })).toEqual({
      current: 500,
      max: 1000,
    });
  });
});

describe('live-data — TokenMeter delta (agent.llm.called)', () => {
  it('extrae tokensUsed de agent.llm.called', () => {
    expect(
      tokenDeltaFromEvent({ type: 'agent.llm.called', payload: { data: { tokensUsed: 1234 } } })
    ).toBe(1234);
  });

  it('devuelve 0 para eventos no-LLM o sin tokens', () => {
    expect(tokenDeltaFromEvent({ type: 'engine.run.started' })).toBe(0);
    expect(tokenDeltaFromEvent({})).toBe(0);
    expect(tokenDeltaFromEvent({ type: 'agent.llm.called', payload: { data: {} } })).toBe(0);
    expect(
      tokenDeltaFromEvent({ type: 'agent.llm.called', payload: { data: { tokensUsed: -5 } } })
    ).toBe(0);
  });
});

describe('live-data — SessionTimer', () => {
  it('deriva sessionStart real desde uptime del runtime', () => {
    const now = 1_700_000_000_000;
    expect(sessionStartFromUptime(now, 3600)).toBe(now - 3_600_000);
  });

  it('clampa uptime negativo a 0 (no retrocede en el tiempo)', () => {
    expect(sessionStartFromUptime(1000, -10)).toBe(1000);
  });
});

describe('live-data — ContextDepth', () => {
  it('mapea uso de tokens a saturación de contexto', () => {
    expect(contextDepthFromTokenMeter({ current: 200, max: 800 })).toEqual({
      currentTokens: 200,
      maxTokens: 800,
    });
  });
});

describe('live-data — AgentStatus', () => {
  it('mapea status de task a AgentState', () => {
    expect(agentStateFromTaskStatus('running')).toBe('working');
    expect(agentStateFromTaskStatus('pending')).toBe('idle');
    expect(agentStateFromTaskStatus('completed')).toBe('idle');
    expect(agentStateFromTaskStatus('failed')).toBe('blocked');
    expect(agentStateFromTaskStatus('unknown')).toBe('blocked');
  });

  it('convierte una task reciente a AgentInfo', () => {
    expect(
      agentInfoFromTask({
        id: 't1',
        name: 'Implement X',
        status: 'running',
        agent: 'Backend',
        timestamp: 1000,
      })
    ).toEqual({
      id: 'agent-backend',
      name: 'Backend',
      state: 'working',
      task: 'Implement X',
    });
  });

  it('devuelve null si la task no tiene agente', () => {
    expect(
      agentInfoFromTask({ id: 't2', name: 'X', status: 'completed', timestamp: 1 })
    ).toBeNull();
  });

  it('deduplica por agente quedándose con la task más reciente y limita el total', () => {
    const tasks = [
      { id: 't1', name: 'Old', status: 'completed', agent: 'Backend', timestamp: 100 },
      { id: 't2', name: 'New', status: 'running', agent: 'Backend', timestamp: 500 },
      { id: 't3', name: 'QA', status: 'running', agent: 'Tester', timestamp: 300 },
      { id: 't4', name: 'Sec', status: 'failed', agent: 'Security', timestamp: 200 },
      { id: 't5', name: 'A', status: 'running', agent: 'A', timestamp: 1 },
      { id: 't6', name: 'B', status: 'running', agent: 'B', timestamp: 2 },
    ] as const;
    const result = agentsFromTasks(tasks, 3);
    expect(result).toHaveLength(3);
    const backend = result.find((a) => a.id === 'agent-backend');
    expect(backend?.task).toBe('New');
    expect(backend?.state).toBe('working');
  });
});
