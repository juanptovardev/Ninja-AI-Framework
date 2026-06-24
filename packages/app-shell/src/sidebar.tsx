import React from 'react';
import { 
  AppWindow, 
  MapTrifold, 
  CheckSquare, 
  Buildings, 
  Database, 
  Heartbeat, 
  SlidersHorizontal, 
  Compass 
} from '@phosphor-icons/react';

export interface SidebarProps {
  activePath: string;
  onNavigate: (path: string) => void;
  connectionStatus?: 'connected' | 'disconnected' | 'connecting';
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'SISTEMA',
    items: [
      {
        id: 'mission-control',
        label: 'Mission Control',
        icon: <AppWindow weight="duotone" className="w-5 h-5" />,
        path: '/mission-control',
      },
      {
        id: 'plan',
        label: 'Plan',
        icon: <MapTrifold weight="duotone" className="w-5 h-5" />,
        path: '/plan',
      },
      {
        id: 'approvals',
        label: 'Approvals',
        icon: <CheckSquare weight="duotone" className="w-5 h-5" />,
        path: '/approvals',
      },
    ],
  },
  {
    label: 'AGENTES',
    items: [
      {
        id: 'office',
        label: 'Office',
        icon: <Buildings weight="duotone" className="w-5 h-5" />,
        path: '/office',
      },
    ],
  },
  {
    label: 'DATOS',
    items: [
      {
        id: 'artifacts',
        label: 'Artifacts',
        icon: <Database weight="duotone" className="w-5 h-5" />,
        path: '/artifacts',
      },
      {
        id: 'health',
        label: 'Health',
        icon: <Heartbeat weight="duotone" className="w-5 h-5" />,
        path: '/health',
      },
    ],
  },
  {
    label: 'CONFIGURACIÓN',
    items: [
      {
        id: 'settings',
        label: 'Settings',
        icon: <SlidersHorizontal weight="duotone" className="w-5 h-5" />,
        path: '/settings',
      },
      {
        id: 'discovery',
        label: 'Discovery',
        icon: <Compass weight="duotone" className="w-5 h-5" />,
        path: '/discovery',
      },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activePath,
  onNavigate,
  connectionStatus = 'connected',
}) => {
  const handleClick = (path: string) => {
    onNavigate(path);
  };

  const statusConfig: Record<typeof connectionStatus, { label: string; color: string }> = {
    connected: { label: 'Runtime Online', color: 'var(--ninja-success)' },
    disconnected: { label: 'Runtime Offline', color: 'var(--ninja-danger)' },
    connecting: { label: 'Runtime Connecting', color: 'var(--ninja-warning)' },
  };

  const { label, color } = statusConfig[connectionStatus];

  return (
    <div className="w-full h-full flex flex-col bg-[var(--ninja-bg-primary)] border-r border-[var(--ninja-border-subtle)] shrink-0">
      <div className="p-6 pb-6 border-b border-[var(--ninja-border-subtle)]">
        <div className="font-display font-bold text-[var(--ninja-text-primary)] text-2xl tracking-tighter">NINJA</div>
        <div className="mt-1">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-bold font-mono-data bg-[var(--ninja-accent-muted)] text-[var(--ninja-accent)] uppercase">
            v1.0
          </span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 overflow-y-auto custom-scroll">
        {NAV_SECTIONS.map((section, sectionIndex) => (
          <div key={section.label} className={sectionIndex > 0 ? 'mt-8' : ''}>
            <div className="px-3 mb-3 text-xs text-[var(--ninja-text-muted)] uppercase tracking-widest font-bold">
              {section.label}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = activePath === item.path;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleClick(item.path)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 rounded-md
                      transition-all duration-200 ease-out group
                      ${
                        isActive
                          ? 'bg-[var(--ninja-surface)] text-[var(--ninja-text-primary)] shadow-inner'
                          : 'bg-transparent text-[var(--ninja-text-secondary)] hover:bg-[var(--ninja-surface-hover)] hover:text-[var(--ninja-text-primary)]'
                      }
                    `}
                  >
                    <span className={`
                      transition-colors duration-200
                      ${isActive ? 'text-[var(--ninja-accent)]' : 'text-[var(--ninja-text-muted)] group-hover:text-[var(--ninja-text-primary)]'}
                    `}>
                      {item.icon}
                    </span>
                    <span className="font-semibold text-sm">{item.label}</span>
                    
                    {/* Active state indicator */}
                    {isActive && (
                      <div className="ml-auto w-1 h-4 rounded-full bg-[var(--ninja-accent)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-5 border-t border-[var(--ninja-border-subtle)] bg-[var(--ninja-bg-secondary)]">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ backgroundColor: color }}
            />
            <span
              className="relative inline-flex rounded-full h-2.5 w-2.5"
              style={{ backgroundColor: color }}
            />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ninja-text-secondary)]">{label}</span>
        </div>
      </div>
    </div>
  );
};

Sidebar.displayName = 'Sidebar';
