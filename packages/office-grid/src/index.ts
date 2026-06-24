// @ninja/office-grid — Public API
export * from './types';
export { default as OfficeCanvas } from './components/office-canvas';
export { default as AgentCard } from './components/agent-card';
export { ActivityBadge, ActivityPulse, AgentAvatar } from './components/state-indicators';
export { DepartmentZone, DepartmentGrid } from './components/departments';
export { useOfficeState } from './hooks/use-office-state';
export { officeEventSchema, agentNodeSchema } from './schema';
