'use client';

import React from 'react';
import { Card } from '@ninja/ui-kit';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentNode } from '../types';
import { ActivityBadge, ActivityPulse, AgentAvatar } from './state-indicators';
import { formatCardSessionTime, isAwaitingApproval } from '../grid-logic';

interface AgentCardProps {
  agent: AgentNode;
  onClick?: (id: string) => void;
  isSelected?: boolean;
}

const springConfig: any = { type: 'spring', bounce: 0, duration: 0.4 };

const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick, isSelected = false }) => {
  // Format session time (single source: grid-logic.ts)
  const formatSessionTime = formatCardSessionTime;

  const isAwaiting = isAwaitingApproval(agent);

  return (
    <motion.div
      layout
      transition={springConfig}
      className={`cursor-pointer overflow-hidden ${isSelected ? 'ring-2 ring-blue-400 rounded-lg' : ''}`}
      onClick={() => onClick?.(agent.id)}
    >
      <Card title={`${agent.role} (${agent.department})`} bordered hoverable className="w-full relative">
        <motion.div layout transition={springConfig}>
          <div className="flex items-center justify-between mb-3">
            <AgentAvatar role={agent.role} />
            <ActivityPulse activity={agent.status} />
            <ActivityBadge activity={agent.status} />
          </div>

          <div className="space-y-2">
            {agent.currentTask && (
              <div className="text-sm text-gray-300">
                Task: {agent.currentTask}
                <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: '75%' }}></div>
                </div>
              </div>
            )}

            <div className="text-xs text-gray-400">
              <div className="flex justify-between">
                <span>Tokens:</span>
                <span>{agent.tokenUsage || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Session:</span>
                <span>{agent.sessionTime ? formatSessionTime(agent.sessionTime) : '00:00'}</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 mt-3">
            Last event: {agent.lastEvent || 'None'}
            {agent.lastEventAt && ` at ${agent.lastEventAt.toLocaleTimeString()}`}
          </div>
        </motion.div>

        <AnimatePresence>
          {isAwaiting && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={springConfig}
              className="flex gap-2 overflow-hidden"
            >
              <button 
                className="flex-1 py-2 px-4 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-md font-medium text-sm transition-colors border border-emerald-500/30"
                onClick={(e) => { e.stopPropagation(); console.log('Approve', agent.id); }}
              >
                Approve
              </button>
              <button 
                className="flex-1 py-2 px-4 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 rounded-md font-medium text-sm transition-colors border border-rose-500/30"
                onClick={(e) => { e.stopPropagation(); console.log('Reject', agent.id); }}
              >
                Reject
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
};

export default AgentCard;
