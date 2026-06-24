/**
 * @ninja/sentinel — index.ts
 * Public API del sistema de seguridad, auditoría, aprobaciones y supervisión senior
 */

export type {
  PolicyAction,
  Policy,
  PolicyDecision,
  ApprovalRequest,
  AuditEntry,
  EvaluationContext,
  SentinelBlockedPayload,
} from './schema.js';

export type {
  ApprovalResult,
  ApproverIdentity,
  CreateApprovalOptions,
  ApprovalRequestedPayload,
  ApprovalReceivedPayload,
  ApprovalCancelledPayload,
} from './approval.js';

export { PolicyEngine } from './policy.js';
export { ApprovalManager } from './approval.js';
export { Auditor } from './auditor.js';
export { Guardian } from './guardian.js';
export { ApprovalPendingError } from './schema.js';
