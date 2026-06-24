'use client';

import React, { useEffect, useState } from 'react';
import { useUccStore } from '../lib/ucc-store';
import { api } from '../lib/api';
import { useWsClient } from '../lib/ws-client';

export default function WorkspaceRunning() {
  const { activeRunId, activePlan, setMode } = useUccStore();
  const { messages } = useWsClient();
  const [progress, setProgress] = useState(25);
  const [status, setStatus] = useState('executing');
  const [activeAgent, setActiveAgent] = useState({ name: 'Backend Agent', role: 'Backend', model: 'Kimi K2.6', action: 'Generando endpoints REST...' });

  useEffect(() => {
    // Escuchar eventos en vivo del chat para cambiar el agente activo y progreso
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1].text;
      if (lastMessage.includes('DB Architect')) {
        setActiveAgent({ name: 'DB Architect Agent', role: 'DB Architect', model: 'DeepSeek V4', action: 'Diseñando esquema Prisma...' });
        setProgress(35);
      } else if (lastMessage.includes('Backend')) {
        setActiveAgent({ name: 'Backend Agent', role: 'Backend', model: 'Kimi K2.6', action: 'Implementando rutas y controladores...' });
        setProgress(60);
      } else if (lastMessage.includes('Tester')) {
        setActiveAgent({ name: 'Tester Agent', role: 'Tester', model: 'Qwen 3.5 397B', action: 'Ejecutando suite de pruebas unitarias...' });
        setProgress(85);
      } else if (lastMessage.includes('Misión completada')) {
        setProgress(100);
        setStatus('completed');
      } else if (lastMessage.includes('[SENTINEL BLOCK]') || lastMessage.includes('aprobación requerida')) {
        // Sentinel block detected, transition to GATE mode
        // Extraer detalles de aprobación si los hay o usar fallback
        useUccStore.getState().setMode('GATE');
        useUccStore.getState().setPendingApproval({
          id: 'mock-sentinel-approval',
          actionType: 'git.commit',
          actionSummary: 'git commit -m "feat: implement user auth endpoints"',
          technicalDetails: JSON.stringify({ files: ['src/routes/users.ts', 'src/models/User.ts', 'package.json'] }, null, 2),
          policyId: 'git.commit.policy'
        });
      }
    }
  }, [messages]);

  // Periódicamente consultar estado de la corrida al runtime
  useEffect(() => {
    if (!activeRunId) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get<{ status: string; progress: number }>(`/engine/run/${activeRunId}`);
        if (res.data) {
          setProgress(res.data.progress || progress);
          setStatus(res.data.status || status);
          if (res.data.status === 'completed') {
            setMode('IDLE');
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeRunId, progress, status, setMode]);

  const handlePause = async () => {
    if (!activeRunId) return;
    try {
      await api.post(`/engine/run/${activeRunId}/pause`, {});
      setStatus('paused');
    } catch (e) {
      console.error(e);
    }
  };

  const handleResume = async () => {
    if (!activeRunId) return;
    try {
      await api.post(`/engine/run/${activeRunId}/resume`, {});
      setStatus('executing');
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancel = async () => {
    if (activeRunId) {
      try {
        await api.post(`/engine/run/${activeRunId}/cancel`, {});
      } catch (e) {
        console.error(e);
      }
    }
    useUccStore.getState().reset();
  };

  return (
    <div className="flex flex-col h-full p-8 max-w-3xl mx-auto justify-between gap-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            Operación en Progreso
          </h2>
          <span className="text-xs bg-zinc-900 border border-white/5 text-zinc-400 font-mono px-2 py-0.5 rounded uppercase">
            Run ID: {activeRunId?.substring(0, 8) || 'local'}
          </span>
        </div>
        <p className="text-zinc-400 text-sm">
          Ninja está orquestando los agentes autónomos para cumplir tu objetivo.
        </p>
      </div>

      <div className="flex-1 bg-zinc-900/30 border border-white/5 rounded-2xl p-6 flex flex-col justify-center gap-6">
        {/* Progress gauge */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs font-semibold text-zinc-400 font-mono">
            <span>Progreso General</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.2)] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Active agent panel */}
        <div className="bg-zinc-950/40 border border-white/5 hover:border-white/10 p-5 rounded-xl flex gap-4 items-center transition-all duration-300">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-xl shadow-lg shrink-0">
            🤖
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white truncate">{activeAgent.name}</h4>
              <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono px-1.5 py-0.5 rounded">
                {activeAgent.model}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 truncate">{activeAgent.action}</p>
          </div>
        </div>
      </div>

      {/* Control panel buttons */}
      <div className="flex gap-3 justify-end items-center shrink-0 border-t border-white/5 pt-6 bg-zinc-950/20">
        {status === 'paused' ? (
          <button
            onClick={handleResume}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl px-5 py-2.5 transition-all flex items-center gap-1.5"
          >
            ▶️ Reanudar
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="bg-zinc-900 hover:bg-zinc-850 border border-white/10 hover:border-white/20 text-zinc-300 font-medium text-sm rounded-xl px-5 py-2.5 transition-all flex items-center gap-1.5"
          >
            ⏸ Pausar
          </button>
        )}
        <button
          onClick={handleCancel}
          className="bg-rose-950 hover:bg-rose-900 border border-rose-500/20 hover:border-rose-500/30 text-rose-200 font-semibold text-sm rounded-xl px-6 py-2.5 transition-all flex items-center gap-1.5"
        >
          ✕ Cancelar Ejecución
        </button>
      </div>
    </div>
  );
}
