// Agent Namespace
export { AgentNamespaceManager } from './agent-namespace.js';
export type { AgentNamespace } from './agent-namespace.js';

// Context Operations
export { ContextOps } from './context-ops.js';
export type { TokenBudget, ContextRequest } from './context-ops.js';

// Schema Types
export type {
  MemoryLayer,
  VaultEntry,
  VaultQuery,
  VaultResult,
  VaultQueryExecutedPayload,
  VaultWritePayload,
  IHotMemoryProvider,
  ContextBudgetExceededPayload,
  ContextCompressedPayload,
  ContextAnchorPromotedPayload,
  CompressionResult,
} from './schema.js';

// Coordinator
export { VaultCoordinator } from './coordinator.js';

// Scoring
export { RelevanceScorer } from './scoring/relevance-scorer.js';
export { VaultBudgetManager } from './scoring/budget-manager.js';
export type { BudgetAllocation, BudgetConfig, TrimResult } from './scoring/budget-manager.js';

// Policy
export { VaultPolicy } from './policy.js';
export type { LayerPolicy, AgentPermission, PolicyConfig } from './policy.js';

// Cache
export { VaultCache } from './cache.js';
export type { CacheConfig, CacheEntry, CacheStats } from './cache.js';
