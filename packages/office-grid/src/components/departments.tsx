'use client';

import React from 'react';
import type { Department, DepartmentId } from '../types';
import { departmentAccent, isGuardianDesk } from '../grid-logic';

// Department zone component
export interface DepartmentZoneProps {
  /** Department ID */
  id: DepartmentId;
  /** Department name for display */
  name: string;
  /** Children elements (typically AgentCard components) */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export const DepartmentZone: React.FC<DepartmentZoneProps> = ({
  id,
  name,
  children,
  className = '',
}) => {
  const accentColor = departmentAccent(id);

  return (
    <div
      className={`relative rounded-lg border border-[#334155] bg-[#1e293b] p-4 transition-all duration-250 ease-in-out ${className}`}
      style={{
        boxShadow: `0 0 0 1px ${accentColor} inset`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#f1f5f9]">{name}</h3>
        {isGuardianDesk(id) && (
          <div className="text-lg" title="Guardian Control Desk">
            🛡️
          </div>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
};

// Department grid component
export interface DepartmentGridProps {
  /** Department data */
  departments: Department[];
  /** Children factory function - receives department and returns React nodes */
  renderChildren: (department: Department) => React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export const DepartmentGrid: React.FC<DepartmentGridProps> = ({
  departments,
  renderChildren,
  className = '',
}) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {departments.map((dept) => (
        <DepartmentZone key={dept.id} id={dept.id} name={dept.name}>
          {renderChildren(dept)}
        </DepartmentZone>
      ))}
    </div>
  );
};
