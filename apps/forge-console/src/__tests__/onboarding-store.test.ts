/**
 * Tests del store del wizard de onboarding (WP-E3 / T7.1).
 *
 * Entorno vitest del repo: `environment: 'node'`, sin jsdom ni Testing Library
 * (precedente: error-boundary.test.ts). Se ejercita la lógica pura del store
 * zustand: estados por paso (idle/loading/success/error), transiciones con
 * clamp, retry por paso y reset. El cliente API (lib/api) se mockea completo,
 * igual que ws-client.test.ts mockea WebSocket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));

const { useOnboarding, WIZARD_STEPS } = await import('../../lib/onboarding-store');
import type { DoctorResult } from '../../lib/onboarding-store';

const doctorOk: DoctorResult = {
  total: 2,
  passed: 1,
  failed: 1,
  reports: [
    { agentId: 'cursor', passed: true, present: ['AGENTS.md'], missing: [], warnings: [] },
    {
      agentId: 'claude',
      passed: false,
      present: [],
      missing: ['CLAUDE.md'],
      warnings: ['config dir vacía'],
    },
  ],
};

beforeEach(() => {
  useOnboarding.getState().reset();
  getMock.mockReset();
  postMock.mockReset();
});

describe('estado inicial y definición de pasos', () => {
  it('WIZARD_STEPS define 4 pasos y test-connection es el único deshabilitado', () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual([
      'env-check',
      'test-connection',
      'create-workspace',
      'tour',
    ]);
    expect(WIZARD_STEPS.find((s) => s.id === 'test-connection')?.enabled).toBe(false);
    expect(WIZARD_STEPS.filter((s) => s.enabled).every((s) => s.id !== 'test-connection')).toBe(
      true
    );
  });

  it('arranca en paso 0 con todos los pasos idle y resultados nulos', () => {
    const s = useOnboarding.getState();
    expect(s.currentStep).toBe(0);
    expect(s.doctorResult).toBeNull();
    expect(s.sessionResult).toBeNull();
    for (const step of WIZARD_STEPS) {
      expect(s.steps[step.id]).toEqual({ status: 'idle', error: null });
    }
  });
});

describe('runEnvCheck (GET /api/doctor)', () => {
  it('flujo de éxito: loading → success con resultado por ítem', async () => {
    getMock.mockResolvedValue({ data: doctorOk, error: null });

    const promise = useOnboarding.getState().runEnvCheck();
    expect(useOnboarding.getState().steps['env-check'].status).toBe('loading');

    await promise;
    const s = useOnboarding.getState();
    expect(s.steps['env-check']).toEqual({ status: 'success', error: null });
    expect(s.doctorResult).toEqual(doctorOk);
    expect(s.doctorResult?.reports).toHaveLength(2);
    expect(getMock).toHaveBeenCalledWith('/api/doctor');
  });

  it('error de API: loading → error con mensaje del runtime', async () => {
    getMock.mockResolvedValue({
      data: null,
      error: { message: 'connect ECONNREFUSED 127.0.0.1:3141', status: 500 },
    });

    await useOnboarding.getState().runEnvCheck();
    const s = useOnboarding.getState();
    expect(s.steps['env-check'].status).toBe('error');
    expect(s.steps['env-check'].error).toContain('ECONNREFUSED');
    expect(s.doctorResult).toBeNull();
  });

  it('respuesta sin data ni error → mensaje fallback, sin throw', async () => {
    getMock.mockResolvedValue({ data: null, error: null });
    await expect(useOnboarding.getState().runEnvCheck()).resolves.toBeUndefined();
    const s = useOnboarding.getState();
    expect(s.steps['env-check'].status).toBe('error');
    expect(s.steps['env-check'].error).toContain('/api/doctor');
  });
});

describe('createWorkspace (POST /api/session/init)', () => {
  it('flujo de éxito: loading → success con sessionId', async () => {
    postMock.mockResolvedValue({
      data: { sessionId: 'sess-123', status: 'initialized' },
      error: null,
    });

    await useOnboarding.getState().createWorkspace();
    const s = useOnboarding.getState();
    expect(s.steps['create-workspace'].status).toBe('success');
    expect(s.sessionResult).toEqual({ sessionId: 'sess-123', status: 'initialized' });
    expect(postMock).toHaveBeenCalledWith('/api/session/init', {});
  });

  it('error de API: loading → error con mensaje', async () => {
    postMock.mockResolvedValue({
      data: null,
      error: { message: 'Failed to init session', status: 500 },
    });

    await useOnboarding.getState().createWorkspace();
    const s = useOnboarding.getState();
    expect(s.steps['create-workspace'].status).toBe('error');
    expect(s.steps['create-workspace'].error).toBe('Failed to init session');
    expect(s.sessionResult).toBeNull();
  });
});

describe('retryStep', () => {
  it('reintenta env-check tras error y lo deja en success', async () => {
    getMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'runtime caído', status: 500 },
    });
    await useOnboarding.getState().runEnvCheck();
    expect(useOnboarding.getState().steps['env-check'].status).toBe('error');

    getMock.mockResolvedValueOnce({ data: doctorOk, error: null });
    await useOnboarding.getState().retryStep('env-check');
    const s = useOnboarding.getState();
    expect(s.steps['env-check'].status).toBe('success');
    expect(s.steps['env-check'].error).toBeNull();
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('reintenta create-workspace despachando a su acción', async () => {
    postMock.mockResolvedValue({
      data: { sessionId: 'sess-retry', status: 'initialized' },
      error: null,
    });
    await useOnboarding.getState().retryStep('create-workspace');
    expect(useOnboarding.getState().steps['create-workspace'].status).toBe('success');
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('pasos sin acción (test-connection, tour) son no-op: no llaman a la API', async () => {
    await useOnboarding.getState().retryStep('test-connection');
    await useOnboarding.getState().retryStep('tour');
    expect(getMock).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
    const s = useOnboarding.getState();
    expect(s.steps['test-connection'].status).toBe('idle');
    expect(s.steps['tour'].status).toBe('idle');
  });
});

describe('transiciones de pasos', () => {
  it('nextStep/prevStep avanzan y retroceden dentro del rango', () => {
    useOnboarding.getState().nextStep();
    expect(useOnboarding.getState().currentStep).toBe(1);
    useOnboarding.getState().nextStep();
    useOnboarding.getState().prevStep();
    expect(useOnboarding.getState().currentStep).toBe(1);
  });

  it('goToStep hace clamp en ambos extremos (0 y último paso)', () => {
    useOnboarding.getState().goToStep(-5);
    expect(useOnboarding.getState().currentStep).toBe(0);
    useOnboarding.getState().goToStep(99);
    expect(useOnboarding.getState().currentStep).toBe(WIZARD_STEPS.length - 1);
  });

  it('nextStep en el último paso y prevStep en el primero no se salen', () => {
    useOnboarding.getState().goToStep(WIZARD_STEPS.length - 1);
    useOnboarding.getState().nextStep();
    expect(useOnboarding.getState().currentStep).toBe(WIZARD_STEPS.length - 1);
    useOnboarding.getState().goToStep(0);
    useOnboarding.getState().prevStep();
    expect(useOnboarding.getState().currentStep).toBe(0);
  });

  it('navegar no pisa los estados de los pasos ya completados', async () => {
    getMock.mockResolvedValue({ data: doctorOk, error: null });
    await useOnboarding.getState().runEnvCheck();
    useOnboarding.getState().goToStep(3);
    useOnboarding.getState().goToStep(0);
    expect(useOnboarding.getState().steps['env-check'].status).toBe('success');
    expect(useOnboarding.getState().doctorResult).toEqual(doctorOk);
  });
});

describe('reset', () => {
  it('devuelve todo el wizard al estado inicial', async () => {
    getMock.mockResolvedValue({ data: doctorOk, error: null });
    postMock.mockResolvedValue({ data: { sessionId: 'x', status: 'initialized' }, error: null });
    await useOnboarding.getState().runEnvCheck();
    await useOnboarding.getState().createWorkspace();
    useOnboarding.getState().goToStep(2);

    useOnboarding.getState().reset();
    const s = useOnboarding.getState();
    expect(s.currentStep).toBe(0);
    expect(s.doctorResult).toBeNull();
    expect(s.sessionResult).toBeNull();
    for (const step of WIZARD_STEPS) {
      expect(s.steps[step.id]).toEqual({ status: 'idle', error: null });
    }
  });
});
