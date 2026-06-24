'use client';

import React from 'react';
import { useUccStore } from '../lib/ucc-store';
import { api } from '../lib/api';

export default function WorkspacePlanning() {
  const { activePlan, activeRunId, setMode } = useUccStore();

  const handleApprove = async () => {
    if (!activeRunId) {
      // Si no hay runId (ej. offline/desarrollo), solo cambiamos el modo para propósitos visuales
      setMode('RUNNING');
      return;
    }

    try {
      // Intentar enviar aprobación al Kage Runtime (el endpoint de aprobación inicial de plan)
      await api.post(`/engine/run/${activeRunId}/approve`, {
        approvalId: 'plan-approval',
        approved: true,
        notes: 'Plan aprobado desde UCC Dashboard'
      });
      setMode('RUNNING');
    } catch (e) {
      console.error(e);
      // Fallback
      setMode('RUNNING');
    }
  };

  const handleCancel = () => {
    useUccStore.getState().reset();
  };

  if (!activePlan) return null;

  return (
    <div className="flex flex-col h-full p-8 max-w-3xl mx-auto gap-6 justify-between animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          📋 Plan de Operación Generado
        </h2>
        <p className="text-zinc-400 text-sm">
          El planificador ha descompuesto tu requerimiento en {activePlan.steps.length} tareas. Revísalas antes de ejecutar.
        </p>
      </div>

      <div className="flex-1 bg-zinc-900/30 border border-white/5 rounded-2xl p-6 flex flex-col gap-4 overflow-y-auto custom-scroll">
        <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Pasos del Plan</div>
        <div className="space-y-4">
          {activePlan.steps.map((step) => (
            <div key={step.id} className="flex gap-4 items-start relative group">
              <div className="flex flex-col items-center">
                <span className="w-6 h-6 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-bold text-zinc-400 font-mono">
                  {step.id}
                </span>
                {step.id !== activePlan.steps.length.toString() && (
                  <div className="w-0.5 h-10 bg-white/5 my-1" />
                )}
              </div>
              <div className="flex-1 bg-zinc-950/40 border border-white/5 group-hover:border-white/10 rounded-xl p-3 transition-colors">
                <div className="flex justify-between items-start">
                  <h4 className="text-sm font-semibold text-zinc-200">{step.name}</h4>
                  <span className="text-[10px] bg-zinc-900 border border-white/5 text-zinc-400 font-mono px-2 py-0.5 rounded">
                    {step.agent.replace('agent-', '')}
                  </span>
                </div>
                {step.dependencies.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Depende de:</span>
                    {step.dependencies.map((dep) => (
                      <span key={dep} className="text-[9px] bg-zinc-900 border border-white/5 text-zinc-400 font-mono px-1.5 rounded">
                        Paso {dep}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 justify-end items-center shrink-0 border-t border-white/5 pt-6 bg-zinc-950/20">
        <button
          onClick={handleCancel}
          className="bg-zinc-900 hover:bg-zinc-850 border border-white/10 hover:border-white/20 text-zinc-300 font-medium text-sm rounded-xl px-5 py-2.5 transition-all"
        >
          Cancelar Orden
        </button>
        <button
          onClick={handleApprove}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl px-6 py-2.5 shadow-lg shadow-emerald-950/30 hover:shadow-emerald-900/40 transition-all"
        >
          Aprobar y Ejecutar
        </button>
      </div>
    </div>
  );
}
