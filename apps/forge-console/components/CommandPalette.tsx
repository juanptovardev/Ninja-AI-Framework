'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

const COMMANDS: { id: string; target: string; path: string; icon: ReactNode; action: 'goTo' | 'open' }[] = [
  { id: 'dashboard', target: 'Mission Control', action: 'goTo', path: '/mission-control', icon: <AppWindow className="w-4 h-4" /> },
  { id: 'commits', target: 'Commits', action: 'goTo', path: '/commits', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'arsenal', target: 'Arsenal', action: 'goTo', path: '/arsenal', icon: <Package className="w-4 h-4" /> },
  { id: 'office', target: 'Office', action: 'goTo', path: '/office', icon: <Buildings className="w-4 h-4" /> },
  { id: 'approvals', target: 'Approvals', action: 'goTo', path: '/approvals', icon: <CheckSquare className="w-4 h-4" /> },
  { id: 'plan', target: 'Plan', action: 'goTo', path: '/plan', icon: <MapTrifold className="w-4 h-4" /> },
  { id: 'health', target: 'Health', action: 'goTo', path: '/health', icon: <Heartbeat className="w-4 h-4" /> },
  { id: 'artifacts', target: 'Artifacts', action: 'goTo', path: '/artifacts', icon: <Database className="w-4 h-4" /> },
  { id: 'discovery', target: 'Discovery', action: 'goTo', path: '/discovery', icon: <Compass className="w-4 h-4" /> },
  { id: 'settings', target: 'Settings', action: 'open', path: '/settings', icon: <SlidersHorizontal className="w-4 h-4" /> },
];

export function CommandPalette() {
  const t = useTranslations('palette');
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
        aria-label={t('aria')}
      >
        <Command className="flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--ninja-border-subtle)]">
            <span className="text-[var(--ninja-text-muted)]">⌘</span>
            <Command.Input
              autoFocus
              placeholder={t('placeholder')}
              className="flex-1 bg-transparent text-[var(--ninja-text-primary)] placeholder-[var(--ninja-text-muted)] text-sm outline-none"
            />
            <kbd className="text-[10px] font-mono text-[var(--ninja-text-muted)] border border-[var(--ninja-border)] rounded px-1.5 py-0.5">ESC</kbd>
          </div>

          <Command.List className="max-h-64 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-[var(--ninja-text-muted)]">
              {t('empty')}
            </Command.Empty>

            <Command.Group heading={t('group')} className="[&>[cmdk-group-heading]]:text-[10px] [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-widest [&>[cmdk-group-heading]]:text-[var(--ninja-text-muted)] [&>[cmdk-group-heading]]:px-3 [&>[cmdk-group-heading]]:py-1.5 [&>[cmdk-group-heading]]:font-bold">
              {COMMANDS.map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={`${cmd.id} ${cmd.target}`}
                  onSelect={() => {
                    router.push(cmd.path);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--ninja-text-secondary)] cursor-pointer transition-colors aria-selected:bg-[var(--ninja-surface)] aria-selected:text-[var(--ninja-text-primary)] aria-selected:text-[var(--ninja-accent)]"
                >
                  <span className="text-[var(--ninja-accent)]">{cmd.icon}</span>
                  {t(cmd.action, { target: cmd.target })}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div className="px-4 py-2 border-t border-[var(--ninja-border-subtle)] flex items-center gap-4 text-[10px] text-[var(--ninja-text-muted)]">
            <span><kbd className="font-mono border border-[var(--ninja-border)] rounded px-1">↑↓</kbd> {t('navigate')}</span>
            <span><kbd className="font-mono border border-[var(--ninja-border)] rounded px-1">↵</kbd> {t('select')}</span>
            <span className="ml-auto">{t('toggle')}</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
