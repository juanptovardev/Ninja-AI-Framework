'use client';

import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import {
  AppWindow,
  GitBranch,
  Package,
  Buildings,
  SlidersHorizontal,
  Compass,
  CheckSquare,
  MapTrifold,
  Heartbeat,
  Database,
} from '@phosphor-icons/react';

const COMMANDS = [
  { id: 'dashboard', label: 'Go to Mission Control', path: '/mission-control', icon: <AppWindow className="w-4 h-4" /> },
  { id: 'commits', label: 'Go to Commits', path: '/commits', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'arsenal', label: 'Go to Arsenal', path: '/arsenal', icon: <Package className="w-4 h-4" /> },
  { id: 'office', label: 'Go to Office', path: '/office', icon: <Buildings className="w-4 h-4" /> },
  { id: 'approvals', label: 'Go to Approvals', path: '/approvals', icon: <CheckSquare className="w-4 h-4" /> },
  { id: 'plan', label: 'Go to Plan', path: '/plan', icon: <MapTrifold className="w-4 h-4" /> },
  { id: 'health', label: 'Go to Health', path: '/health', icon: <Heartbeat className="w-4 h-4" /> },
  { id: 'artifacts', label: 'Go to Artifacts', path: '/artifacts', icon: <Database className="w-4 h-4" /> },
  { id: 'discovery', label: 'Go to Discovery', path: '/discovery', icon: <Compass className="w-4 h-4" /> },
  { id: 'settings', label: 'Open Settings', path: '/settings', icon: <SlidersHorizontal className="w-4 h-4" /> },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        className="relative w-full max-w-lg mx-4 glass-card border-[var(--ninja-border-strong)] shadow-2xl rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <Command className="flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--ninja-border-subtle)]">
            <span className="text-[var(--ninja-text-muted)]">⌘</span>
            <Command.Input
              autoFocus
              placeholder="Search commands..."
              className="flex-1 bg-transparent text-[var(--ninja-text-primary)] placeholder-[var(--ninja-text-muted)] text-sm outline-none"
            />
            <kbd className="text-[10px] font-mono text-[var(--ninja-text-muted)] border border-[var(--ninja-border)] rounded px-1.5 py-0.5">ESC</kbd>
          </div>

          <Command.List className="max-h-64 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-[var(--ninja-text-muted)]">
              No commands found.
            </Command.Empty>

            <Command.Group heading="Navigate" className="[&>[cmdk-group-heading]]:text-[10px] [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-widest [&>[cmdk-group-heading]]:text-[var(--ninja-text-muted)] [&>[cmdk-group-heading]]:px-3 [&>[cmdk-group-heading]]:py-1.5 [&>[cmdk-group-heading]]:font-bold">
              {COMMANDS.map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={cmd.label}
                  onSelect={() => {
                    router.push(cmd.path);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--ninja-text-secondary)] cursor-pointer transition-colors aria-selected:bg-[var(--ninja-surface)] aria-selected:text-[var(--ninja-text-primary)] aria-selected:text-[var(--ninja-accent)]"
                >
                  <span className="text-[var(--ninja-accent)]">{cmd.icon}</span>
                  {cmd.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div className="px-4 py-2 border-t border-[var(--ninja-border-subtle)] flex items-center gap-4 text-[10px] text-[var(--ninja-text-muted)]">
            <span><kbd className="font-mono border border-[var(--ninja-border)] rounded px-1">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono border border-[var(--ninja-border)] rounded px-1">↵</kbd> select</span>
            <span className="ml-auto">Ctrl+K to toggle</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
