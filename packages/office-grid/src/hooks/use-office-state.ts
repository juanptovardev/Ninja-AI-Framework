'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import type { OfficeState, AgentNode, OfficeEvent, DepartmentId } from '../types';
import { officeEventSchema } from '../schema';

// Create logger instance
const logger = createLogger('office-grid');

// Default configuration
const DEFAULT_CONFIG = {
  wsUrl: 'ws://localhost:3141/ws/events',
  reconnectIntervalMs: 5000,
  syncIntervalMs: 30000,
};

// Initial state with all 11 agents in idle state
const INITIAL_OFFICE_STATE: OfficeState = {
  agents: {
    'agent-planner': {
      id: 'agent-planner',
      role: 'Planner',
      department: 'Planning',
      status: 'idle',
      position: { x: 10, y: 10, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-planificator': {
      id: 'agent-planificator',
      role: 'Planificator',
      department: 'Planning',
      status: 'idle',
      position: { x: 20, y: 10, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-librarian': {
      id: 'agent-librarian',
      role: 'Librarian',
      department: 'Library & Knowledge',
      status: 'idle',
      position: { x: 10, y: 30, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-db-architect': {
      id: 'agent-db-architect',
      role: 'DB Architect',
      department: 'Data',
      status: 'idle',
      position: { x: 20, y: 30, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-backend': {
      id: 'agent-backend',
      role: 'Backend',
      department: 'Backend',
      status: 'idle',
      position: { x: 10, y: 50, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-connector': {
      id: 'agent-connector',
      role: 'Connector',
      department: 'Integration',
      status: 'idle',
      position: { x: 20, y: 50, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-designer': {
      id: 'agent-designer',
      role: 'Designer',
      department: 'Design',
      status: 'idle',
      position: { x: 10, y: 70, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-tester': {
      id: 'agent-tester',
      role: 'Tester',
      department: 'Test',
      status: 'idle',
      position: { x: 20, y: 70, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-quality': {
      id: 'agent-quality',
      role: 'Quality Gate',
      department: 'Quality',
      status: 'idle',
      position: { x: 10, y: 90, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-security': {
      id: 'agent-security',
      role: 'Security',
      department: 'Security',
      status: 'idle',
      position: { x: 20, y: 90, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
    'agent-build-fixer': {
      id: 'agent-build-fixer',
      role: 'Build Fixer',
      department: 'Recovery / Fix',
      status: 'idle',
      position: { x: 10, y: 110, z: 0 },
      currentTask: undefined,
      tokenUsage: 0,
      sessionTime: 0,
      lastEvent: undefined,
      lastEventAt: undefined,
    },
  },
  departments: {
    Planning: {
      id: 'Planning',
      name: 'Planning Department',
      agents: ['agent-planner', 'agent-planificator'],
      position: { x: 0, y: 0, z: 0 },
    },
    'Library & Knowledge': {
      id: 'Library & Knowledge',
      name: 'Library & Knowledge Department',
      agents: ['agent-librarian'],
      position: { x: 0, y: 20, z: 0 },
    },
    Data: {
      id: 'Data',
      name: 'Data Department',
      agents: ['agent-db-architect'],
      position: { x: 0, y: 40, z: 0 },
    },
    Backend: {
      id: 'Backend',
      name: 'Backend Department',
      agents: ['agent-backend'],
      position: { x: 0, y: 60, z: 0 },
    },
    Integration: {
      id: 'Integration',
      name: 'Integration Department',
      agents: ['agent-connector'],
      position: { x: 0, y: 80, z: 0 },
    },
    Design: {
      id: 'Design',
      name: 'Design Department',
      agents: ['agent-designer'],
      position: { x: 0, y: 100, z: 0 },
    },
    Test: {
      id: 'Test',
      name: 'Test Department',
      agents: ['agent-tester'],
      position: { x: 0, y: 120, z: 0 },
    },
    Quality: {
      id: 'Quality',
      name: 'Quality Department',
      agents: ['agent-quality'],
      position: { x: 0, y: 140, z: 0 },
    },
    Security: {
      id: 'Security',
      name: 'Security Department',
      agents: ['agent-security'],
      position: { x: 0, y: 160, z: 0 },
    },
    'Recovery / Fix': {
      id: 'Recovery / Fix',
      name: 'Recovery / Fix Department',
      agents: ['agent-build-fixer'],
      position: { x: 0, y: 180, z: 0 },
    },
  },
  connectionState: 'connected',
  lastSync: null,
  isLoading: false,
  error: null,
};

// Helper function to emit agent state change events
const emitAgentStateChangeEvent = (agentId: string, from: string, to: string) => {
  eventBus.emit(
    createEvent('office.agent.state.changed', 'office-grid', {
      agentId,
      from,
      to,
    })
  );
};

// Helper function to emit connection change events
const emitConnectionChangeEvent = (from: string, to: string) => {
  eventBus.emit(createEvent('office.connection.changed', 'office-grid', { from, to }));
};

interface UseOfficeStateReturn {
  state: OfficeState;
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
  reconnect: () => void;
  moveAgent: (agentId: string, departmentId: DepartmentId) => Promise<boolean>;
}

export const useOfficeState = (config?: Partial<typeof DEFAULT_CONFIG>): UseOfficeStateReturn => {
  const [state, setState] = useState<OfficeState>(INITIAL_OFFICE_STATE);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep a ref to avoid stale state in callbacks
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // Initial sync date after mount to avoid hydration mismatch
    setState((prev) => ({ ...prev, lastSync: new Date() }));
  }, []);

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState((prev) => ({
      ...prev,
      connectionState: 'reconnecting',
    }));

    try {
      const ws = new globalThis.WebSocket(finalConfig.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        logger.info('WebSocket connected to office grid');
        reconnectAttemptsRef.current = 0;

        setState((prev) => {
          if (prev.connectionState !== 'connected') {
            emitConnectionChangeEvent(prev.connectionState, 'connected');
          }
          return {
            ...prev,
            connectionState: 'connected',
            error: null,
            lastSync: new Date(),
          };
        });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const parsed = officeEventSchema.safeParse(data);

          if (!parsed.success) {
            logger.warn('Invalid office event received', parsed.error);
            return;
          }

          const officeEvent = parsed.data as OfficeEvent;

          setState((prev) => {
            switch (officeEvent.type) {
              case 'office.sync': {
                const agentsMap: Record<string, AgentNode> = {};
                officeEvent.payload.agents.forEach((agent: AgentNode) => {
                  agentsMap[agent.id] = agent;
                });
                return {
                  ...prev,
                  agents: agentsMap,
                  lastSync: new Date(),
                };
              }

              case 'agent.status.updated': {
                const agentId = officeEvent.payload.agentId;
                const agent = prev.agents[agentId];
                if (!agent) return prev;

                emitAgentStateChangeEvent(agentId, agent.status, officeEvent.payload.activity);

                return {
                  ...prev,
                  agents: {
                    ...prev.agents,
                    [agentId]: {
                      ...agent,
                      status: officeEvent.payload.activity,
                      currentTask: officeEvent.payload.task,
                      lastEvent: 'status.updated',
                      lastEventAt: new Date(),
                    },
                  },
                };
              }

              case 'agent.token.updated': {
                const tokenId = officeEvent.payload.agentId;
                const tokenAgent = prev.agents[tokenId];
                if (!tokenAgent) return prev;

                return {
                  ...prev,
                  agents: {
                    ...prev.agents,
                    [tokenId]: {
                      ...tokenAgent,
                      tokenUsage: officeEvent.payload.tokens,
                      lastEvent: 'token.updated',
                      lastEventAt: new Date(),
                    },
                  },
                };
              }

              case 'system.health': {
                logger.info('System health update', officeEvent.payload.status);
                return prev;
              }

              default:
                return prev;
            }
          });
        } catch (error) {
          logger.error('Error parsing WebSocket message', error);
        }
      };

      ws.onclose = () => {
        logger.warn('WebSocket connection closed');

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        if (reconnectAttemptsRef.current < 3) {
          const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            logger.info(`Reconnection attempt ${reconnectAttemptsRef.current}`);
            connect();
          }, delay);
        } else {
          setState((prev) => {
            if (prev.connectionState !== 'disconnected') {
              emitConnectionChangeEvent(prev.connectionState, 'disconnected');
            }
            return {
              ...prev,
              connectionState: 'disconnected',
              error: 'Max reconnection attempts reached',
            };
          });
        }
      };

      ws.onerror = () => {
        logger.error('WebSocket error');
        setState((prev) => ({
          ...prev,
          connectionState: 'disconnected',
          error: 'WebSocket connection error',
        }));
      };
    } catch (err) {
      logger.error('Failed to create WebSocket connection', err);
      setState((prev) => ({
        ...prev,
        connectionState: 'disconnected',
        error: 'Failed to connect',
      }));
    }
  }, [finalConfig.wsUrl]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    connect();

    return () => {
      cleanup();
    };
  }, [connect, cleanup]);

  // Select agent handler
  const selectAgent = useCallback((id: string | null) => {
    setSelectedAgentId(id);
  }, []);

  // Manual reconnect handler
  const reconnect = useCallback(() => {
    cleanup();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [cleanup, connect]);

  // Move agent between departments
  const moveAgent = useCallback(
    async (agentId: string, departmentId: DepartmentId) => {
      const currentState = stateRef.current;
      const agent = currentState.agents[agentId];
      if (!agent) return false;

      const oldDept = agent.department;
      if (oldDept === departmentId) return true;

      // Save rollback data
      const rollbackAgents = { ...currentState.agents };
      const rollbackDepartments = { ...currentState.departments };

      // Optimistic Update
      setState((prev) => {
        const updatedAgent: AgentNode = { ...prev.agents[agentId], department: departmentId };

        const newDepts = { ...prev.departments };
        if (prev.departments[oldDept]) {
          newDepts[oldDept] = {
            ...prev.departments[oldDept],
            agents: prev.departments[oldDept].agents.filter((id: string) => id !== agentId),
          };
        }
        if (prev.departments[departmentId]) {
          newDepts[departmentId] = {
            ...prev.departments[departmentId],
            agents: [
              ...prev.departments[departmentId].agents.filter((id: string) => id !== agentId),
              agentId,
            ],
          };
        }

        return {
          ...prev,
          agents: {
            ...prev.agents,
            [agentId]: updatedAgent,
          },
          departments: newDepts,
        };
      });

      try {
        const wsUrlObj = new URL(finalConfig.wsUrl);
        const httpProtocol = wsUrlObj.protocol === 'wss:' ? 'https:' : 'http:';
        const apiUrl = `${httpProtocol}//${wsUrlObj.host}/api/roster/assign`;

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ clientId: agentId, role: departmentId }),
        });

        if (!res.ok) {
          // NOTE(T6.4): kept as plain Error on purpose — importing @ninja/contracts
          // into this client hook breaks the forge-console Turbopack build (barrel
          // .js resolution). Single remaining prod throw; tracked, not hidden.
          throw new Error(`Failed to update roster on backend: status ${res.status}`);
        }

        logger.info(`Successfully moved agent ${agentId} to department ${departmentId}`);
        return true;
      } catch (err) {
        logger.error(`Failed to move agent ${agentId} to department ${departmentId}`, err);
        // Rollback
        setState((prev) => ({
          ...prev,
          agents: rollbackAgents,
          departments: rollbackDepartments,
        }));
        return false;
      }
    },
    [finalConfig.wsUrl]
  );

  return {
    state,
    selectedAgentId,
    selectAgent,
    reconnect,
    moveAgent,
  };
};

export default useOfficeState;
