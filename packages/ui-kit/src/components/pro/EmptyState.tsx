import React from 'react';
import { Button } from '../base/Button';
import { Badge } from '../base/Badge';
import { Ghost } from '@phosphor-icons/react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  phase?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const defaultIcon = <Ghost weight="duotone" className="w-16 h-16" />;

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = defaultIcon,
  phase,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] bg-grid rounded-lg p-10 border border-[var(--ninja-border-subtle)] relative overflow-hidden">
      {/* Decorative center glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[var(--ninja-bg-tertiary)] rounded-full blur-[80px] opacity-40 pointer-events-none" />

      <div className="text-[var(--ninja-text-muted)] mb-6 opacity-80 relative z-10">{icon}</div>
      <h3 className="font-display text-2xl tracking-tight text-[var(--ninja-text-primary)] mb-3 text-center relative z-10">{title}</h3>
      
      {description && (
        <p className="text-base text-[var(--ninja-text-secondary)] text-center max-w-md mb-6 leading-relaxed relative z-10">
          {description}
        </p>
      )}
      
      {phase && (
        <Badge variant="warning" className="mt-2 relative z-10">
          Disponible en {phase}
        </Badge>
      )}
      
      {action && (
        <Button variant="primary" onClick={action.onClick} className="mt-2 relative z-10">
          {action.label}
        </Button>
      )}
    </div>
  );
};

EmptyState.displayName = 'EmptyState';
