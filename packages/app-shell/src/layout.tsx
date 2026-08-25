import React from 'react';
import { Sidebar, SidebarProps } from './sidebar';

export interface ShellLayoutProps {
  children: React.ReactNode;
  rightRail?: React.ReactNode;
  sidebarProps: SidebarProps;
  breadcrumb?: React.ReactNode;
  runtimeIndicator?: React.ReactNode;
}

export const ShellLayout: React.FC<ShellLayoutProps> = ({
  children,
  rightRail,
  sidebarProps,
  breadcrumb,
  runtimeIndicator,
}) => {
  return (
    <div className="flex h-screen w-full bg-[var(--ninja-bg-primary)] overflow-hidden p-2 sm:p-4 gap-2 sm:gap-4">
      <aside className="hidden md:flex w-[240px] glass-card overflow-hidden shrink-0 flex-col">
        <Sidebar {...sidebarProps} />
      </aside>

      <div className="flex-1 flex flex-col gap-2 sm:gap-4 min-w-0 min-h-0">
        <header className="h-14 px-4 sm:px-6 glass-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <div className="text-sm font-medium text-[#94a3b8]">{breadcrumb}</div>
          </div>
          <div className="flex items-center gap-6">{runtimeIndicator}</div>
        </header>

        <main 
          tabIndex={0}
          className="flex-1 glass-card overflow-y-auto overflow-x-hidden relative focus:outline-none"
        >
          <div className="p-4 sm:p-8">
            {children}
          </div>
        </main>
      </div>

      {rightRail && (
        <aside className="hidden lg:flex w-[300px] glass-card overflow-hidden shrink-0 flex-col">
          {rightRail}
        </aside>
      )}
    </div>
  );
};

ShellLayout.displayName = 'ShellLayout';
