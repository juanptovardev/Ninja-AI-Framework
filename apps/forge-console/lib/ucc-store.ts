import { create } from 'zustand';

export type UccMode = 'IDLE' | 'PLANNING' | 'RUNNING' | 'GATE';

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
  
  // Actions
  setMode: (mode: UccMode) => void;
  setActiveRunId: (runId: string | null) => void;
  setActivePlan: (plan: UccState['activePlan']) => void;
  setPendingApproval: (approval: UccState['pendingApproval']) => void;
  
  toggleOffice: () => void;
  toggleSettings: () => void;
  toggleContextPanel: () => void;
  
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
  
  setMode: (mode) => set({ mode }),
  setActiveRunId: (runId) => set({ activeRunId: runId }),
  setActivePlan: (plan) => set({ activePlan: plan }),
  setPendingApproval: (approval) => set({ pendingApproval: approval }),
  
  toggleOffice: () => set((state) => ({ isOfficeOpen: !state.isOfficeOpen })),
  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  toggleContextPanel: () => set((state) => ({ isContextPanelOpen: !state.isContextPanelOpen })),
  
  reset: () => set({
    mode: 'IDLE',
    activeRunId: null,
    activePlan: null,
    pendingApproval: null,
  }),
}));
