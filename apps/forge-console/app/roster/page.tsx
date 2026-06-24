'use client';

import { useEffect, useState } from 'react';
import { RosterClient } from './types';
import { ClientCard } from '../../components/ClientCard';

export default function RosterPage() {
  const [clients, setClients] = useState<RosterClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoster = async () => {
    try {
      setError(null);
      const res = await fetch('http://127.0.0.1:3141/api/roster');
      if (!res.ok) {
        throw new Error(`Failed to fetch roster: ${res.status}`);
      }
      const data = await res.json();
      
      // Expected format might vary. Assume `data.clients` or `data` is the array
      // Roster endpoints typically return { clients: [...] } or just [...]
      if (Array.isArray(data)) {
        setClients(data);
      } else if (data && Array.isArray(data.clients)) {
        setClients(data.clients);
      } else {
        setClients([]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unknown error occurred while fetching the roster.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
    
    // Optional: Auto-refresh every 5 seconds
    const interval = setInterval(fetchRoster, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      <main className="max-w-7xl mx-auto px-6 py-12 md:py-20 flex flex-col gap-10">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-500">
              Visual Roster
            </h1>
            <p className="text-zinc-400 text-lg max-w-xl">
              Monitor and coordinate connected IDEs. Assign roles to specialized agents in real-time.
            </p>
          </div>
          
          <button 
            onClick={fetchRoster}
            disabled={isLoading}
            className="group flex items-center gap-2 bg-zinc-900 border border-white/10 hover:border-white/20 hover:bg-zinc-800 px-4 py-2 rounded-lg transition-all text-sm font-medium disabled:opacity-50"
          >
            <svg 
              className={`w-4 h-4 text-zinc-400 group-hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`} 
              xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Refresh
          </button>
        </header>

        {/* State Management / Bento Grid */}
        <div className="relative">
          {isLoading && clients.length === 0 ? (
            <div className="flex items-center justify-center min-h-[300px] border border-white/5 bg-zinc-900/20 rounded-3xl">
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                <p className="text-zinc-500 text-sm font-medium">Connecting to roster...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center min-h-[300px] border border-rose-500/20 bg-rose-500/5 rounded-3xl p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-10 h-10 text-rose-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <h3 className="text-rose-300 font-semibold text-lg">Connection Error</h3>
                <p className="text-rose-400/80 text-sm max-w-md">{error}</p>
              </div>
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] border border-white/5 bg-zinc-900/20 rounded-3xl p-6 text-center">
              <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-800/50 flex items-center justify-center border border-white/5">
                <svg className="w-8 h-8 text-zinc-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              </div>
              <h3 className="text-zinc-200 font-medium text-xl tracking-tight">No IDEs Connected</h3>
              <p className="text-zinc-500 mt-2 max-w-md">
                Waiting for clients to connect to the mission framework. Ensure Codex or Cursor are running the Ninja plugin.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {clients.map(client => (
                <ClientCard 
                  key={client.id} 
                  client={client} 
                  onRoleChanged={fetchRoster} 
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
