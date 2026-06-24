'use client';

import React, { useEffect, useState } from 'react';
import { useUccStore } from '../lib/ucc-store';
import { api } from '../lib/api';

interface ApprovalRequest {
  id: string;
  runId: string;
  agentId: string;
  actionType: string;
  actionSummary: string;
  technicalDetails: string;
  policyId: string;
  requestedAt: string;
}

export default function WorkspaceGate() {
  const { pendingApproval, setMode, activeRunId } = useUccStore();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchApprovals = async () => {
    try {
      const res = await api.get<ApprovalRequest[]>('/api/approvals');
      if (res.data && res.data.length > 0) {
        setApprovals(res.data);
      }
    } catch (e) {
      console.error('Failed to load pending approvals from API', e);
    }
  };

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 3000);
    return () => clearInterval(interval);
  }, []);

  const currentApproval = approvals[0] || pendingApproval;

  const handleApprove = async () => {
    if (!currentApproval) return;
    setIsSubmitting(true);
    try {
      await api.post(`/api/approvals/${currentApproval.id}/approve`, { notes });
      setMode('RUNNING');
      setApprovals((prev) => prev.slice(1));
    } catch (e) {
      console.error(e);
      // Fallback
      setMode('RUNNING');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!currentApproval) return;
    setIsSubmitting(true);
    try {
      await api.post(`/api/approvals/${currentApproval.id}/reject`, { reason: notes || 'Rejected by user from UCC Console' });
      setMode('RUNNING');
      setApprovals((prev) => prev.slice(1));
    } catch (e) {
      console.error(e);
      // Fallback
      setMode('RUNNING');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentApproval) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-zinc-500">
        <span className="text-3xl mb-2">🛡️</span>
        <p className="text-sm font-semibold">Esperando bloqueos de políticas de Sentinel...</p>
      </div>
    );
  }

  // Parse technical details to see if it is JSON
  let parsedDetails = currentApproval.technicalDetails;
  try {
    const obj = JSON.parse(currentApproval.technicalDetails);
    parsedDetails = JSON.stringify(obj, null, 2);
  } catch (e) {
    // Keep as string
  }

  return (
    <div className="flex flex-col h-full p-8 max-w-3xl mx-auto justify-between gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-1.5 shrink-0">
        <h2 className="text-xl font-bold text-rose-400 flex items-center gap-2">
          🛡️ Control de Seguridad Sentinel (Gate Active)
        </h2>
        <p className="text-zinc-400 text-sm">
          Se ha interceptado una acción sensible. Revisa los detalles técnicos y decide si otorgas permiso.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scroll">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-xl">
            <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Acción Interceptada</span>
            <p className="text-zinc-200 text-sm font-semibold mt-1 font-mono">{currentApproval.actionType}</p>
          </div>
          <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-xl">
            <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Política Infraccionada</span>
            <p className="text-zinc-200 text-sm font-semibold mt-1 font-mono">{currentApproval.policyId}</p>
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-xl">
          <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Resumen Ejecutivo</span>
          <p className="text-zinc-300 text-sm mt-1.5 leading-relaxed">{currentApproval.actionSummary}</p>
        </div>

        <div className="bg-zinc-950 border border-white/5 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Detalles Técnicos / Diff</span>
          <pre className="text-zinc-400 text-xs font-mono overflow-auto max-h-48 p-2 bg-black/30 rounded-lg border border-white/5 leading-relaxed whitespace-pre-wrap">
            {parsedDetails}
          </pre>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-zinc-400 text-xs font-medium">Notas / Justificación de Auditoría</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Escribe notas de auditoría para la aprobación o rechazo..."
            className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors min-h-[80px] resize-none"
          />
        </div>
      </div>

      <div className="flex gap-3 justify-end items-center shrink-0 border-t border-white/5 pt-6 bg-zinc-950/20">
        <button
          onClick={handleReject}
          disabled={isSubmitting}
          className="bg-rose-950 hover:bg-rose-900 border border-rose-500/20 hover:border-rose-500/30 text-rose-200 font-semibold text-sm rounded-xl px-5 py-2.5 transition-all disabled:opacity-50"
        >
          ❌ Denegar Permiso
        </button>
        <button
          onClick={handleApprove}
          disabled={isSubmitting}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl px-6 py-2.5 shadow-lg shadow-emerald-950/30 hover:shadow-emerald-900/40 transition-all disabled:opacity-50"
        >
          ✅ Otorgar Permiso
        </button>
      </div>
    </div>
  );
}
