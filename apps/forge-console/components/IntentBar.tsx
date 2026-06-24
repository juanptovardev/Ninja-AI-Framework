'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useUccStore } from '../lib/ucc-store';
import { api } from '../lib/api';

export default function IntentBar() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'build' | 'repair' | 'template' | 'workspace'>('build');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const uccStore = useUccStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    uccStore.setMode('PLANNING');
    uccStore.setActivePlan({
      prompt,
      mode,
      steps: [
        { id: '1', name: 'Analizando requerimientos y creando estrategia', agent: 'agent-planner', status: 'running', dependencies: [] },
        { id: '2', name: 'Definiendo arquitectura y dependencias', agent: 'agent-db-architect', status: 'pending', dependencies: ['1'] },
        { id: '3', name: 'Escribiendo endpoints REST/GraphQL', agent: 'agent-backend', status: 'pending', dependencies: ['2'] },
        { id: '4', name: 'Preparando batería de pruebas unitarias', agent: 'agent-tester', status: 'pending', dependencies: ['3'] },
      ]
    });

    try {
      const res = await api.post<{ runId: string; status: string }>('/engine/submit', {
        prompt,
        mode,
        workspaceId: 'default-workspace'
      });

      if (res.data?.runId) {
        uccStore.setActiveRunId(res.data.runId);
      }
    } catch (err) {
      console.error('Failed to submit prompt', err);
    }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto z-40">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-3 bg-zinc-900/80 border border-white/10 rounded-2xl px-4 py-3 shadow-2xl backdrop-blur-xl focus-within:border-emerald-500/50 transition-all duration-300">
          <span className="text-zinc-400 text-lg">🥷</span>
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setIsOpen(true);
            }}
            placeholder="¿Qué deseas construir hoy? (Presiona ⌘K para enfocar)"
            className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-zinc-500"
          />
          <div className="flex items-center gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="bg-zinc-800 text-zinc-300 text-xs rounded-lg px-2.5 py-1 focus:outline-none border border-white/5 cursor-pointer hover:bg-zinc-750 transition-colors"
            >
              <option value="build">🔨 Build</option>
              <option value="repair">🔧 Repair</option>
              <option value="template">📋 Template</option>
              <option value="workspace">📂 Workspace</option>
            </select>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg px-3 py-1 transition-all flex items-center gap-1 shadow-lg shadow-emerald-900/25"
            >
              Iniciar
            </button>
          </div>
        </div>

        {/* Dropdown with suggestion panel */}
        {isOpen && prompt.length > 0 && (
          <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900/95 border border-white/15 rounded-2xl shadow-3xl backdrop-blur-2xl p-4 flex flex-col gap-3 transition-all animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">Sugerencias rápidas</div>
            <div className="flex flex-col gap-1">
              {[
                `Crear una API REST de usuarios con autenticación JWT usando ${mode}`,
                `Depurar y solucionar el error de conexión en la capa de datos`,
                `Crear tests de cobertura para el módulo del Vault`,
              ].map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(suggestion);
                    setIsOpen(false);
                  }}
                  className="text-left text-sm text-zinc-300 hover:text-white hover:bg-white/5 rounded-xl py-2 px-3 transition-colors cursor-pointer"
                >
                  💡 {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
