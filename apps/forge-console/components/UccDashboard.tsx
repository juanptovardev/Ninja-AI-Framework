'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUccStore } from '../lib/ucc-store';
import IntentBar from './IntentBar';
import LiveTimeline from './LiveTimeline';
import WorkspaceRouter from './WorkspaceRouter';
import ConversationRail from './ConversationRail';
import ContextPanel from './ContextPanel';
import OfficeOverlay from './OfficeOverlay';

export default function UccDashboard() {
  const uccStore = useUccStore();
  const router = useRouter();

  useEffect(() => {
    // Escuchar teclas de acceso rápido globales
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘O o Ctrl+O para abrir Office Grid
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        uccStore.toggleOffice();
      }
      // ⌘, o Ctrl+, para ir a Configuración (fuente única: /settings)
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        router.push('/settings');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [uccStore, router]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#030712] text-zinc-100 overflow-hidden font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Top Header Bar */}
      <header className="h-16 px-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-zinc-950/40 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-400 flex items-center justify-center font-bold text-black shadow-lg shadow-emerald-950/20 select-none">
            🥷
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-white uppercase tracking-wider">Ninja Command Center</span>
            <span className="text-[10px] text-zinc-500 font-mono mt-0.5">UNIFIED SUPERVISION ENGINE</span>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => uccStore.toggleOffice()}
            className="bg-zinc-900 hover:bg-zinc-850 border border-white/5 hover:border-white/10 text-zinc-300 text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer font-medium"
          >
            🏢 Office Canvas <kbd className="text-[10px] text-zinc-500 bg-black/40 px-1.5 py-0.5 rounded font-sans font-normal border border-white/5 ml-1">⌘O</kbd>
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="bg-zinc-900 hover:bg-zinc-850 border border-white/5 hover:border-white/10 text-zinc-300 text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer font-medium"
          >
            ⚙️ Configuración <kbd className="text-[10px] text-zinc-500 bg-black/40 px-1.5 py-0.5 rounded font-sans font-normal border border-white/5 ml-1">⌘,</kbd>
          </button>
          <button
            onClick={() => uccStore.toggleContextPanel()}
            className="bg-zinc-900 hover:bg-zinc-850 border border-white/5 hover:border-white/10 text-zinc-300 text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer font-medium"
          >
            📊 Telemetría
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Left Timeline */}
        <LiveTimeline />

        {/* Center Workspace + Bottom Conversation */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-zinc-950/20">
          {/* Top Intent Bar Container (integrated inside central area) */}
          <div className="p-6 pb-2 shrink-0 z-20">
            <IntentBar />
          </div>

          {/* Central Contextual Workspace Router */}
          <div className="flex-1 overflow-hidden relative">
            <WorkspaceRouter />
          </div>

          {/* Bottom steering chat rail */}
          <ConversationRail />
        </div>

        {/* Right Rail (Telemetry context) */}
        <ContextPanel />
      </div>

      {/* Overlays / Modals */}
      <OfficeOverlay />
    </div>
  );
}
