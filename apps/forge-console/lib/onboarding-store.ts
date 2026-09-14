/**
 * forge-console — lib/onboarding-store.ts
 * Estado del wizard de onboarding (WP-E3 / T7.1): 4 pasos con estados
 * idle/loading/success/error por paso, transiciones y retry.
 *
 * Lógica pura zustand (sin React) — testeable con vitest en entorno node,
 * patrón de lib/ws-client.ts. Los endpoints reales del runtime:
 * - GET  /api/doctor       → verificación de agentes (routes/installer.routes.ts)
 * - GET  /api/model-gateway/status → prueba de conexión (T7.4, lib/api.ts)
 * - POST /api/session/init → bootstrap de sesión de trabajo (routes/session.routes.ts)
 */
import { create } from 'zustand';
import { api, testModelGatewayConnection } from './api';

// ─── Types ───────────────────────────────────────────────────

export type StepId = 'env-check' | 'test-connection' | 'create-workspace' | 'tour';
export type StepStatus = 'idle' | 'loading' | 'success' | 'error';

/** Ítem de reporte devuelto por GET /api/doctor (VerifyReport del installer). */
export interface DoctorReportItem {
  agentId: string;
  passed: boolean;
  present: string[];
  missing: string[];
  warnings: string[];
}

export interface DoctorResult {
  total: number;
  passed: number;
  failed: number;
  reports: DoctorReportItem[];
}

export interface SessionInitResult {
  sessionId: string;
  status: string;
}

/** Resultado de la prueba de conexión (T7.4): latencia + modelos del gateway. */
export interface ConnectionTestOutcome {
  latencyMs: number;
  modelCount: number;
}

export interface StepView {
  id: StepId;
  label: string;
  description: string;
  enabled: boolean;
}

export const WIZARD_STEPS: StepView[] = [
  {
    id: 'env-check',
    label: 'Entorno',
    description: 'Verifica el Kage Runtime y los agentes instalados.',
    enabled: true,
  },
  {
    id: 'test-connection',
    label: 'Conexión',
    description: 'Prueba la conexión con el proveedor de modelos.',
    enabled: true,
  },
  {
    id: 'create-workspace',
    label: 'Workspace',
    description: 'Inicializa la primera sesión de trabajo sobre el workspace activo.',
    enabled: true,
  },
  {
    id: 'tour',
    label: 'Tour',
    description: 'Recorre las vistas clave del Forge Console.',
    enabled: true,
  },
];

interface StepState {
  status: StepStatus;
  error: string | null;
}

const initialSteps = (): Record<StepId, StepState> => ({
  'env-check': { status: 'idle', error: null },
  'test-connection': { status: 'idle', error: null },
  'create-workspace': { status: 'idle', error: null },
  tour: { status: 'idle', error: null },
});

const withStep = (
  steps: Record<StepId, StepState>,
  id: StepId,
  next: StepState
): Record<StepId, StepState> => ({ ...steps, [id]: next });

export interface OnboardingState {
  currentStep: number;
  steps: Record<StepId, StepState>;
  doctorResult: DoctorResult | null;
  sessionResult: SessionInitResult | null;
  connectionResult: ConnectionTestOutcome | null;
  runEnvCheck: () => Promise<void>;
  runTestConnection: () => Promise<void>;
  createWorkspace: () => Promise<void>;
  retryStep: (stepId: StepId) => Promise<void>;
  goToStep: (index: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  currentStep: 0,
  steps: initialSteps(),
  doctorResult: null,
  sessionResult: null,
  connectionResult: null,

  runEnvCheck: async () => {
    set((s) => ({ steps: withStep(s.steps, 'env-check', { status: 'loading', error: null }) }));
    const res = await api.get<DoctorResult>('/api/doctor');
    if (res.error || !res.data) {
      set((s) => ({
        steps: withStep(s.steps, 'env-check', {
          status: 'error',
          error: res.error?.message ?? 'No se pudo consultar /api/doctor',
        }),
      }));
      return;
    }
    set((s) => ({
      doctorResult: res.data,
      steps: withStep(s.steps, 'env-check', { status: 'success', error: null }),
    }));
  },

  runTestConnection: async () => {
    set((s) => ({
      steps: withStep(s.steps, 'test-connection', { status: 'loading', error: null }),
    }));
    const result = await testModelGatewayConnection();
    if (!result.reachable) {
      set((s) => ({
        connectionResult: null,
        steps: withStep(s.steps, 'test-connection', {
          status: 'error',
          error: result.error ?? 'No se pudo contactar el Model Gateway',
        }),
      }));
      return;
    }
    set((s) => ({
      connectionResult: { latencyMs: result.latencyMs, modelCount: result.modelCount },
      steps: withStep(s.steps, 'test-connection', { status: 'success', error: null }),
    }));
  },

  createWorkspace: async () => {
    set((s) => ({
      steps: withStep(s.steps, 'create-workspace', { status: 'loading', error: null }),
    }));
    const res = await api.post<SessionInitResult>('/api/session/init', {});
    if (res.error || !res.data) {
      set((s) => ({
        steps: withStep(s.steps, 'create-workspace', {
          status: 'error',
          error: res.error?.message ?? 'No se pudo inicializar la sesión de trabajo',
        }),
      }));
      return;
    }
    set((s) => ({
      sessionResult: res.data,
      steps: withStep(s.steps, 'create-workspace', { status: 'success', error: null }),
    }));
  },

  retryStep: async (stepId) => {
    if (stepId === 'env-check') {
      await get().runEnvCheck();
      return;
    }
    if (stepId === 'test-connection') {
      await get().runTestConnection();
      return;
    }
    if (stepId === 'create-workspace') {
      await get().createWorkspace();
    }
  },

  goToStep: (index) => {
    const clamped = Math.min(Math.max(index, 0), WIZARD_STEPS.length - 1);
    set({ currentStep: clamped });
  },

  nextStep: () => {
    get().goToStep(get().currentStep + 1);
  },

  prevStep: () => {
    get().goToStep(get().currentStep - 1);
  },

  reset: () => {
    set({
      currentStep: 0,
      steps: initialSteps(),
      doctorResult: null,
      sessionResult: null,
      connectionResult: null,
    });
  },
}));
