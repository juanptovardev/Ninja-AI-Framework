'use client';

import React from 'react';
import type { AgentActivity, AgentRole } from '../types';

// Activity color mappings
const ACTIVITY_COLORS = {
  idle: '#64748b',
  thinking: '#22d3ee',
  working: '#10b981',
  error: '#ef4444',
  offline: '#1e293b',
  blocked: '#f59e0b',
} as const;

interface ActivityBadgeProps {
  activity: AgentActivity;
  className?: string;
}

const ActivityBadge: React.FC<ActivityBadgeProps> = ({ activity, className = '' }) => {
  const activityLabels: Record<AgentActivity, string> = {
    idle: 'Idle',
    thinking: 'Thinking',
    working: 'Working',
    error: 'Error',
    offline: 'Offline',
    blocked: 'Blocked',
    awaiting_approval: 'Awaiting Approval',
  };

  const activityStyles: Record<AgentActivity, string> = {
    idle: 'bg-gray-500 text-gray-200',
    thinking: 'bg-cyan-400 text-cyan-100',
    working: 'bg-green-500 text-green-100',
    error: 'bg-red-500 text-red-100',
    offline: 'bg-gray-800 text-gray-400',
    blocked: 'bg-amber-500 text-amber-100',
    awaiting_approval: 'bg-purple-500 text-purple-100',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${activityStyles[activity]} ${className}`}
    >
      {activityLabels[activity]}
    </span>
  );
};

interface ActivityPulseProps {
  activity: AgentActivity;
  className?: string;
}

const ActivityPulse: React.FC<ActivityPulseProps> = ({ activity, className = '' }) => {
  const pulseColors: Record<AgentActivity, string> = {
    idle: 'bg-gray-500',
    thinking: 'bg-cyan-400',
    working: 'bg-green-500',
    error: 'bg-red-500',
    offline: 'bg-gray-800',
    blocked: 'bg-amber-500',
    awaiting_approval: 'bg-purple-500',
  };

  const shouldPulse = activity === 'thinking' || activity === 'working' || activity === 'awaiting_approval';

  return (
    <div className={`relative inline-flex h-3 w-3 ${className}`}>
      {shouldPulse ? (
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${pulseColors[activity]} animate-pulse`}
        />
      ) : null}
      <span
        className={`inline-flex rounded-full h-3 w-3 ${pulseColors[activity]} ${shouldPulse ? 'ring-2 ring-inset ring-white/20' : ''}`}
      ></span>
    </div>
  );
};

interface AgentAvatarProps {
  role: AgentRole;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const AgentAvatar: React.FC<AgentAvatarProps> = ({ role, size = 'md', className = '' }) => {
  // Map roles to unique colors by department
  const roleColors: Record<string, string> = {
    Planner: 'bg-blue-500',
    Planificator: 'bg-indigo-500',
    Librarian: 'bg-purple-500',
    'DB Architect': 'bg-rose-500',
    Backend: 'bg-amber-500',
    Connector: 'bg-emerald-500',
    Designer: 'bg-pink-500',
    Tester: 'bg-teal-500',
    'Quality Gate': 'bg-violet-500',
    Security: 'bg-cyan-500',
    'Build Fixer': 'bg-orange-500',
  };

  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  };

  const initials = role
    .split(' ')
    .map((word) => word[0])
    .join('')
    .substring(0, 2);

  return (
    <div
      className={`${roleColors[role] || 'bg-gray-500'} ${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white ${className}`}
    >
      {initials}
    </div>
  );
};

export { ActivityBadge, ActivityPulse, AgentAvatar };
