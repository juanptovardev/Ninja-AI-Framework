'use client';

import React from 'react';
import type { AgentActivity, AgentRole } from '../types';
import {
  ACTIVITY_BADGE_STYLES,
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  ACTIVITY_PULSE_COLORS,
  agentInitials,
  avatarColorFor,
  AVATAR_SIZE_CLASSES,
  shouldPulse,
  type AvatarSize,
} from '../grid-logic';

// Activity color mappings (single source: grid-logic.ts)

interface ActivityBadgeProps {
  activity: AgentActivity;
  className?: string;
}

const ActivityBadge: React.FC<ActivityBadgeProps> = ({ activity, className = '' }) => {
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${ACTIVITY_BADGE_STYLES[activity]} ${className}`}
    >
      {ACTIVITY_LABELS[activity]}
    </span>
  );
};

interface ActivityPulseProps {
  activity: AgentActivity;
  className?: string;
}

const ActivityPulse: React.FC<ActivityPulseProps> = ({ activity, className = '' }) => {
  const pulsing = shouldPulse(activity);

  return (
    <div className={`relative inline-flex h-3 w-3 ${className}`}>
      {pulsing ? (
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${ACTIVITY_PULSE_COLORS[activity]} animate-pulse`}
        />
      ) : null}
      <span
        className={`inline-flex rounded-full h-3 w-3 ${ACTIVITY_PULSE_COLORS[activity]} ${pulsing ? 'ring-2 ring-inset ring-white/20' : ''}`}
      ></span>
    </div>
  );
};

interface AgentAvatarProps {
  role: AgentRole;
  size?: AvatarSize;
  className?: string;
}

const AgentAvatar: React.FC<AgentAvatarProps> = ({ role, size = 'md', className = '' }) => {
  const sizeClasses: Record<AvatarSize, string> = AVATAR_SIZE_CLASSES;
  const initials = agentInitials(role);

  return (
    <div
      className={`${avatarColorFor(role)} ${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white ${className}`}
    >
      {initials}
    </div>
  );
};

export { ActivityBadge, ActivityPulse, AgentAvatar };
