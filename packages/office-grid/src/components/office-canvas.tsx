'use client';

import React, { useState, useMemo } from 'react';
import { Card, Button } from '@ninja/ui-kit';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import type { OfficeConfig, AgentNode, Department, DepartmentId } from '../types';
import {
  CONNECTION_COLORS,
  CONNECTION_LABELS,
  agentsInDepartment,
  formatEventDate,
  formatLastSync,
  formatSessionClock,
  isAwaitingApproval,
  isDisconnected,
  isReconnecting,
} from '../grid-logic';
import { DepartmentGrid } from './departments';
import AgentCard from './agent-card';
import { ActivityPulse } from './state-indicators';
import { useOfficeState } from '../hooks/use-office-state';

// Connection maps live in grid-logic.ts (single source; re-exported for tests).

interface OfficeCanvasProps {
  config?: Partial<OfficeConfig>;
}

// Connection status bar component
const ConnectionBar: React.FC<{
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  lastSync: Date | null;
  onReconnect: () => void;
}> = ({ connectionState, lastSync, onReconnect }) => {
  const isReconnectingFlag = isReconnecting(connectionState);
  const isDisconnectedFlag = isDisconnected(connectionState);
  const color = CONNECTION_COLORS[connectionState];

  return (
    <div className="h-12 bg-[#0f172a] border-b border-[#334155] px-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2.5 w-2.5 rounded-full ${isReconnectingFlag ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-medium text-[#f1f5f9]">
            {CONNECTION_LABELS[connectionState]}
          </span>
        </div>
        <span className="text-xs text-[#64748b]">Last sync: {formatLastSync(lastSync)}</span>
      </div>

      <div className="flex items-center gap-3">
        {isDisconnectedFlag && (
          <Button size="sm" variant="primary" onClick={onReconnect}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
};

// Agent detail panel (slide-in from right)
const AgentDetailPanel: React.FC<{
  agent: AgentNode | null;
  onClose: () => void;
}> = ({ agent, onClose }) => {
  if (!agent) return null;

  const formatDate = formatEventDate;
  const formatSessionTime = formatSessionClock;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-80 bg-[#1e293b] border-l border-[#334155] shadow-2xl z-50 transform transition-transform duration-300 ease-out translate-x-0">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="h-14 px-4 border-b border-[#334155] flex items-center justify-between bg-[#0f172a]">
          <h3 className="text-sm font-semibold text-[#f1f5f9]">Agent Details</h3>
          <button
            onClick={onClose}
            className="text-[#64748b] hover:text-[#f1f5f9] transition-colors p-1"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Agent Card */}
          <AgentCard agent={agent} isSelected={true} />

          {/* Expanded Details */}
          <div className="space-y-3">
            {agent.currentTask && (
              <div className="bg-[#111827] rounded-lg p-3 border border-[#334155]">
                <h4 className="text-xs font-medium text-[#94a3b8] mb-2">Current Task</h4>
                <p className="text-sm text-[#f1f5f9]">{agent.currentTask}</p>
              </div>
            )}

            <div className="bg-[#111827] rounded-lg p-3 border border-[#334155]">
              <h4 className="text-xs font-medium text-[#94a3b8] mb-2">Metrics</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#64748b]">Token Usage:</span>
                  <span className="text-[#f1f5f9] font-mono">
                    {agent.tokenUsage?.toLocaleString() ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748b]">Session Time:</span>
                  <span className="text-[#f1f5f9] font-mono">
                    {formatSessionTime(agent.sessionTime)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748b]">Status:</span>
                  <div className="flex items-center gap-1.5">
                    <ActivityPulse activity={agent.status} />
                    <span className="text-[#f1f5f9] capitalize">{agent.status}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#111827] rounded-lg p-3 border border-[#334155]">
              <h4 className="text-xs font-medium text-[#94a3b8] mb-2">Activity</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#64748b]">Last Event:</span>
                  <span className="text-[#f1f5f9]">{agent.lastEvent ?? 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748b]">At:</span>
                  <span className="text-[#f1f5f9]">{formatDate(agent.lastEventAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Skeleton card for loading state
const SkeletonCard: React.FC = () => (
  <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 animate-pulse">
    <div className="flex items-center gap-3 mb-3">
      <div className="h-8 w-8 bg-[#334155] rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-[#334155] rounded w-3/4" />
        <div className="h-3 bg-[#334155] rounded w-1/2" />
      </div>
    </div>
    <div className="space-y-2">
      <div className="h-3 bg-[#334155] rounded" />
      <div className="h-3 bg-[#334155] rounded w-5/6" />
    </div>
  </div>
);

// Error state component
const ErrorState: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
    <div className="text-center space-y-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#7f1d1d] text-[#ef4444]">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-[#f1f5f9]">Connection Error</h3>
      <p className="text-sm text-[#94a3b8] max-w-md">{error}</p>
      <Button variant="primary" onClick={onRetry}>
        Retry Connection
      </Button>
    </div>
  </div>
);

// Main OfficeCanvas component
export const OfficeCanvas: React.FC<OfficeCanvasProps> = ({ config }) => {
  const { state, selectedAgentId, selectAgent, reconnect, moveAgent } = useOfficeState(config);
  const [viewMode] = useState<'grid' | 'list'>('grid');

  // Get selected agent details
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return state.agents[selectedAgentId] ?? null;
  }, [selectedAgentId, state.agents]);

  // Get departments as array
  const departments = useMemo(() => {
    return Object.values(state.departments);
  }, [state.departments]);

  // Handle agent selection
  const handleAgentClick = (agentId: string) => {
    selectAgent(selectedAgentId === agentId ? null : agentId);
  };

  // Handle panel close
  const handlePanelClose = () => {
    selectAgent(null);
  };

  const handleDragEnd = (result: DropResult) => {
    const { draggableId, source, destination } = result;
    if (!destination) return;
    
    const newDeptId = destination.droppableId as DepartmentId;
    const oldDeptId = source.droppableId as DepartmentId;
    
    if (newDeptId === oldDeptId) return;

    moveAgent(draggableId, newDeptId);
  };

  // Render agent cards for a department
  const renderDepartmentAgents = (department: Department): React.ReactNode => {
    const departmentAgents = agentsInDepartment(department, state.agents);

    return (
      <Droppable droppableId={department.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`space-y-3 min-h-[100px] rounded-lg transition-colors p-2 -mx-2 ${
              snapshot.isDraggingOver ? 'bg-[#334155]/30' : ''
            }`}
          >
            {departmentAgents.length === 0 ? (
              <div className="text-sm text-[#64748b] italic py-4 text-center">No agents assigned</div>
            ) : (
              departmentAgents.map((agent, index) => (
                <Draggable key={agent.id} draggableId={agent.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`transition-opacity ${snapshot.isDragging ? 'opacity-80' : ''}`}
                    >
                      <AgentCard
                        agent={agent}
                        onClick={handleAgentClick}
                        isSelected={selectedAgentId === agent.id}
                      />
                    </div>
                  )}
                </Draggable>
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    );
  };

  // Loading state with 11 skeleton cards
  if (state.isLoading) {
    return (
      <div className="h-full flex flex-col bg-[#0f172a]">
        <ConnectionBar
          connectionState={state.connectionState}
          lastSync={state.lastSync}
          onReconnect={reconnect}
        />
        <div className="flex-1 p-4 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 11 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (state.error && !state.isLoading) {
    return (
      <div className="h-full flex flex-col bg-[#0f172a]">
        <ConnectionBar
          connectionState={state.connectionState}
          lastSync={state.lastSync}
          onReconnect={reconnect}
        />
        <ErrorState error={state.error} onRetry={reconnect} />
      </div>
    );
  }

  // Main render
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col bg-[#0f172a] relative">
        {/* Connection status bar */}
        <ConnectionBar
          connectionState={state.connectionState}
          lastSync={state.lastSync}
          onReconnect={reconnect}
        />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Department grid */}
          <div className={`flex-1 overflow-auto p-4 ${selectedAgent ? 'md:mr-80' : ''}`}>
            {viewMode === 'grid' ? (
              <DepartmentGrid departments={departments} renderChildren={renderDepartmentAgents} />
            ) : (
              <Droppable droppableId="list-view">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2"
                  >
                    {Object.values(state.agents).map((agent, index) => (
                      <Draggable key={agent.id} draggableId={agent.id} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                          >
                            <AgentCard
                              agent={agent}
                              onClick={handleAgentClick}
                              isSelected={selectedAgentId === agent.id}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            )}
          </div>

          {/* Agent detail panel (slide-in) */}
          {selectedAgent && <AgentDetailPanel agent={selectedAgent} onClose={handlePanelClose} />}
        </div>
      </div>
    </DragDropContext>
  );
};

export default OfficeCanvas;
