import { create } from 'zustand';
import { isEulaAccepted, persistEulaAcceptance } from './eula';
import { resolveKeyValueStore, type KeyValueStore } from './kv-store';

export type UccMode = 'IDLE' | 'PLANNING' | 'RUNNING' | 'GATE';

/** Ciclo del EULA de primera ejecución (WP-G3 / T8.2). */
export type EulaStatus = 'checking' | 'pending' | 'accepted' | 'declined';

export interface Step {
  id: string;
  name: string;
  agent: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  dependencies: string[];
}

export interface UccState {
  mode: UccMode;
  activeRunId: string | null;
  activePlan: {
    steps: Step[];
    prompt: string;
    mode: string;
  } | null;
  pendingApproval: {
    id: string;
    actionType: string;
    actionSummary: string;
    technicalDetails: string;
    policyId: string;
  } | null;

  // Overlays
  isOfficeOpen: boolean;
  isSettingsOpen: boolean;
  isContextPanelOpen: boolean;

  // EULA de primera ejecución (WP-G3 / T8.2)
  eulaStatus: EulaStatus;

  // Actions
  setMode: (mode: UccMode) => void;
  setActiveRunId: (runId: string | null) => void;
  setActivePlan: (plan: UccState['activePlan']) => void;
  setPendingApproval: (approval: UccState['pendingApproval']) => void;

  toggleOffice: () => void;
  toggleSettings: () => void;
  toggleContextPanel: () => void;

  checkEula: (storage?: KeyValueStore | null) => void;
  acceptEula: (storage?: KeyValueStore | null) => void;
  declineEula: () => void;

  reset: () => void;
}

export const useUccStore = create<UccState>((set) => ({
  mode: 'IDLE',
  activeRunId: null,
  activePlan: null,
  pendingApproval: null,

  isOfficeOpen: false,
  isSettingsOpen: false,
  isContextPanelOpen: true,

  // 'checking' en SSR e hidratación; checkEula() resuelve tras montar.
  eulaStatus: 'checking',

  setMode: (mode) => set({ mode }),
  setActiveRunId: (runId) => set({ activeRunId: runId }),
  setActivePlan: (plan) => set({ activePlan: plan }),
  setPendingApproval: (approval) => set({ pendingApproval: approval }),

  toggleOffice: () => set((state) => ({ isOfficeOpen: !state.isOfficeOpen })),
  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  toggleContextPanel: () => set((state) => ({ isContextPanelOpen: !state.isContextPanelOpen })),

  checkEula: (storage = resolveKeyValueStore()) =>
    set({ eulaStatus: isEulaAccepted(storage) ? 'accepted' : 'pending' }),
  acceptEula: (storage = resolveKeyValueStore()) => {
    persistEulaAcceptance(storage);
    set({ eulaStatus: 'accepted' });
  },
  declineEula: () => set({ eulaStatus: 'declined' }),

  reset: () =>
    set({
      mode: 'IDLE',
      activeRunId: null,
      activePlan: null,
      pendingApproval: null,
    }),
}));
