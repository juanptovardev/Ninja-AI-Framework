import type { ID, Timestamp } from '@ninja/contracts';
import type { VaultEntry } from './schema.js';

export interface AgentNamespace {
  agentId: ID;
  sessionId: ID;
  workspaceId: ID;
  hotMemory: VaultEntry[];
  createdAt: Timestamp;
  lastAccess: Timestamp;
}

interface NamespaceStore {
  namespaces: Map<string, AgentNamespace>;
}

function createNamespaceKey(workspaceId: ID, agentId: ID, sessionId: ID): string {
  return `${workspaceId}:${agentId}:${sessionId}`;
}

export class AgentNamespaceManager {
  private store: NamespaceStore;

  constructor() {
    this.store = {
      namespaces: new Map(),
    };
  }

  createNamespace(agentId: ID, sessionId: ID, workspaceId: ID): AgentNamespace {
    const key = createNamespaceKey(workspaceId, agentId, sessionId);
    const now = new Date().toISOString();

    const namespace: AgentNamespace = {
      agentId,
      sessionId,
      workspaceId,
      hotMemory: [],
      createdAt: now,
      lastAccess: now,
    };

    this.store.namespaces.set(key, namespace);
    return namespace;
  }

  getOrCreate(agentId: ID, sessionId: ID, workspaceId: ID): AgentNamespace {
    const key = createNamespaceKey(workspaceId, agentId, sessionId);
    const existing = this.store.namespaces.get(key);

    if (existing) {
      existing.lastAccess = new Date().toISOString();
      return existing;
    }

    return this.createNamespace(agentId, sessionId, workspaceId);
  }

  appendToHotMemory(agentId: ID, sessionId: ID, entry: VaultEntry): void {
    // Creamos un nuevo VaultEntry con los campos requeridos
    const fullEntry: VaultEntry = {
      ...entry,
      agentId: entry.agentId || agentId,
      sessionId: entry.sessionId || sessionId,
      workspaceId: entry.workspaceId || entry.sessionId || sessionId, // fallback a sessionId si no hay workspaceId
      timestamp: entry.timestamp || new Date().toISOString(),
      layer: entry.layer || 'HOT',
      relevance: entry.relevance || 0.5,
    };

    const namespace = this.getOrCreate(agentId, sessionId, fullEntry.workspaceId || '');
    namespace.hotMemory.push(fullEntry);
    namespace.lastAccess = new Date().toISOString();
  }

  getNamespace(agentId: ID, sessionId: ID, workspaceId: ID): AgentNamespace | undefined {
    const key = createNamespaceKey(workspaceId, agentId, sessionId);
    const namespace = this.store.namespaces.get(key);

    if (namespace) {
      namespace.lastAccess = new Date().toISOString();
    }

    return namespace;
  }

  clearNamespace(agentId: ID, sessionId: ID, workspaceId: ID): void {
    const key = createNamespaceKey(workspaceId, agentId, sessionId);
    this.store.namespaces.delete(key);
  }

  getNamespacesBySession(sessionId: ID, workspaceId: ID): AgentNamespace[] {
    const namespaces: AgentNamespace[] = [];
    const prefix = `${workspaceId}:`;

    for (const [key, namespace] of this.store.namespaces) {
      if (namespace.sessionId === sessionId && namespace.workspaceId === workspaceId) {
        namespaces.push(namespace);
      }
    }

    return namespaces;
  }

  countNamespaces(): number {
    return this.store.namespaces.size;
  }
}
