'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useUccStore } from '../lib/ucc-store';
import { useWsClient } from '../lib/ws-client';
import type { PulseData } from '../lib/types';

export default function ContextPanel() {
  const { isContextPanelOpen } = useUccStore();
  const { messages } = useWsClient();
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [tokensUsed, setTokensUsed] = useState(12400);
  const [cost, setCost] = useState(0.0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const loadPulse = async () => {
    try {
      const res = await api.get<PulseData>('/api/health/pulse');
      if (res.data) {
        setPulse(res.data);
        if (res.data.tokenMetrics) {
          setTokensUsed(res.data.tokenMetrics.used);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadApprovals = async () => {
    try {
      const res = await api.get<any[]>('/api/approvals');
      if (res.data) {
        setPendingApprovalsCount(res.data.length);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadPulse();
    loadApprovals();
    const interval = setInterval(() => {
      loadPulse();
      loadApprovals();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Calcular tokens y costos basados en llamadas LLM en vivo del ws-client
  useEffect(() => {
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.text.includes('llamó a LLM')) {
        // Estimar tokens adicionales
        setTokensUsed((prev) => prev + 1500);
        setCost((prev) => prev + 0.03);
      }
    }
  }, [messages]);

  if (!isContextPanelOpen) return null;

  const budget = pulse?.tokenMetrics?.budget || 32000;
  const saturation = Math.round((tokensUsed / budget) * 100);

  return (
    <div className="w-80 shrink-0 bg-zinc-950/40 border-l border-white/5 flex flex-col h-full animate-in fade-in slide-in-from-right-1 duration-200">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-zinc-950/20">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400"> Telemetría del Sistema</h3>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scroll">
        {/* Memory layers */}
        <div className="bg-zinc-900/20 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center text-xs font-bold text-zinc-400 uppercase tracking-wider">
            <span>🧠 Capas de Memoria</span>
            <span className="text-[10px] text-zinc-500 font-mono">{saturation}% Saturation</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">HOT (Contexto):</span>
              <span className="text-zinc-300 font-mono">1.2K tokens</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">WARM (Engram):</span>
              <span className="text-zinc-300 font-mono">{(tokensUsed - 1200).toLocaleString()} tokens</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">COLD (LightRAG):</span>
              <span className="text-zinc-400 font-mono">890K tokens</span>
            </div>
          </div>
          <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden mt-1">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, saturation)}%` }} />
          </div>
        </div>

        {/* Cost tracker */}
        <div className="bg-zinc-900/20 border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
          <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">💰 Inversión de la Sesión</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-white font-mono">${cost.toFixed(2)}</span>
            <span className="text-[10px] text-zinc-500 font-mono">USD</span>
          </div>
          <span className="text-[10px] text-zinc-500 mt-1">Estimado en base a tokens consumidos</span>
        </div>

        {/* Sentinel status */}
        <div className="bg-zinc-900/20 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center text-xs font-bold text-zinc-400 uppercase tracking-wider">
            <span>🛡️ Sentinel Audit</span>
            {pendingApprovalsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-bold font-mono">
                {pendingApprovalsCount}
              </span>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Estado:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                Activo
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Políticas cargadas:</span>
              <span className="text-zinc-300 font-mono">2</span>
            </div>
          </div>
        </div>

        {/* System Uptime */}
        {pulse && (
          <div className="bg-zinc-900/20 border border-white/5 rounded-2xl p-4 flex justify-between items-center text-xs font-medium">
            <span className="text-zinc-500">Estabilidad de Red:</span>
            <span className="text-emerald-400 font-bold font-mono">{pulse.stabilityScore || 100}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
