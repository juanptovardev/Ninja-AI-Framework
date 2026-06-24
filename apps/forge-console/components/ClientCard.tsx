'use client';

import { useState } from 'react';
import { RosterClient } from '../app/roster/types';

interface ClientCardProps {
  client: RosterClient;
  onRoleChanged: () => void;
}

export function ClientCard({ client, onRoleChanged }: ClientCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleRoleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value;
    if (newRole === client.assignedRole) return;

    setIsUpdating(true);
    try {
      const res = await fetch('http://127.0.0.1:3141/api/roster/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId: client.id, role: newRole }),
      });

      if (res.ok) {
        onRoleChanged();
      } else {
        console.error('Failed to assign role');
      }
    } catch (error) {
      console.error('Error assigning role:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const isConnected = client.status === 'connected';

  return (
    <div className="relative group overflow-hidden rounded-2xl bg-zinc-900/50 border border-white/5 p-6 backdrop-blur-md transition-all hover:bg-zinc-800/50 hover:border-white/10 hover:shadow-2xl hover:shadow-emerald-900/10 flex flex-col justify-between min-h-[200px]">
      {/* Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-4">
        {/* Header: ID & Status */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <h3 className="text-lg font-semibold text-zinc-100 tracking-tight">
              {client.metadata?.name || 'Unknown IDE'}
            </h3>
            <span className="text-xs text-zinc-500 font-mono mt-1">
              {client.id}
            </span>
          </div>
          <div
            className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        {/* Info Area */}
        <div className="mt-4">
          <label className="block text-xs text-zinc-400 mb-1.5 font-medium uppercase tracking-wider">
            Assigned Role
          </label>
          <div className="relative">
            <select
              value={client.assignedRole || 'Worker'}
              onChange={handleRoleChange}
              disabled={isUpdating}
              className="w-full appearance-none bg-zinc-950/50 border border-white/10 text-zinc-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all cursor-pointer hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="Orchestrator">Orchestrator</option>
              <option value="Sentinel">Sentinel</option>
              <option value="Worker">Worker</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
