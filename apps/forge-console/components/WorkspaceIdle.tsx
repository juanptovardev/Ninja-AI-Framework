'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useUccStore } from '../lib/ucc-store';

interface Session {
  id: string;
  workspaceId: string;
  startedAt: string;
}

export default function WorkspaceIdle() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState({ activeAgents: 11, providerStatus: 'Activo', sentinel: 'Vigilando' });
  const uccStore = useUccStore();

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const res = await api.get<Session[]>('/api/session/list');
        if (res.data) setSessions(res.data);
      } catch (e) {
        console.error(e);
      }
    };
    loadSessions();
  }, []);

  return (
    <div className="flex flex-col justify-center items-center h-full max-w-2xl mx-auto p-8 text-center gap-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-white">🥷 Bienvenido a Ninja Command Center</h2>
        <p className="text-zinc-400 text-sm">
          Un espacio de supervisión y orquestación unificado. Describe tu objetivo arriba para comenzar.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 w-full">
        <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center">
          <span className="text-zinc-500 text-xs uppercase font-semibold">Agentes Listos</span>
          <span className="text-white text-2xl font-bold font-mono mt-1">{stats.activeAgents}</span>
        </div>
        <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center">
          <span className="text-zinc-500 text-xs uppercase font-semibold">Gatekeepers</span>
          <span className="text-white text-2xl font-bold font-mono mt-1">{stats.sentinel}</span>
        </div>
        <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center">
          <span className="text-zinc-500 text-xs uppercase font-semibold">Proveedor LLM</span>
          <span className="text-emerald-400 text-sm font-bold mt-2.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            NVIDIA NIM
          </span>
        </div>
      </div>

      <div className="w-full flex flex-col gap-3 bg-zinc-900/20 border border-white/5 rounded-2xl p-6 text-left">
        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-2">Sesiones Recientes</h3>
        {sessions.length === 0 ? (
          <p className="text-zinc-500 text-xs italic">No hay sesiones anteriores creadas.</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scroll pr-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex justify-between items-center bg-zinc-900/60 hover:bg-zinc-800/60 border border-white/5 hover:border-white/10 rounded-xl px-4 py-2.5 transition-all cursor-pointer"
                onClick={() => {
                  uccStore.setMode('RUNNING');
                  uccStore.setActiveRunId(s.id);
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-zinc-300 font-mono font-medium truncate max-w-sm">{s.id}</span>
                  <span className="text-[10px] text-zinc-500">Workspace: {s.workspaceId}</span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {new Date(s.startedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
