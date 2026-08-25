'use client';

import { useEffect, useState } from 'react';

interface AgentCommit {
  id: string;
  runId: string;
  agentRole: string;
  summary: string;
  filesChanged: string;
  timestampMs: number;
}

export default function CommitsPage() {
  const [commits, setCommits] = useState<AgentCommit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const port = process.env.NEXT_PUBLIC_NINJA_RUNTIME_PORT || '3141';
    fetch(`http://127.0.0.1:${port}/api/commits`)
      .then((r) => r.json())
      .then((data: AgentCommit[]) => setCommits(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col pb-24 max-w-5xl mx-auto w-full p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Agent Commits</h1>

      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading commits">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 items-center py-3 border-b border-white/5">
              <div className="skeleton h-4 w-24 shrink-0" />
              <div className="skeleton h-4 w-16 shrink-0" />
              <div className="skeleton h-5 w-20 rounded shrink-0" />
              <div className="skeleton h-4 flex-1" />
              <div className="skeleton h-4 w-28 shrink-0" />
            </div>
          ))}
        </div>
      ) : commits.length === 0 ? (
        <p className="text-zinc-500 text-sm">No agent commits recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400 uppercase text-xs tracking-wider">
                <th className="py-3 pr-4">Time</th>
                <th className="py-3 pr-4">Run ID</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-4">Summary</th>
                <th className="py-3">Files</th>
              </tr>
            </thead>
            <tbody>
              {commits.map((c) => {
                let files: string[] = [];
                try { files = JSON.parse(c.filesChanged); } catch { /* noop */ }
                return (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 pr-4 font-mono text-zinc-400 whitespace-nowrap">
                      {new Date(c.timestampMs).toLocaleTimeString()}
                    </td>
                    <td className="py-3 pr-4 font-mono text-zinc-400 text-xs truncate max-w-[100px]">
                      {c.runId.slice(0, 8)}…
                    </td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-xs font-mono">
                        {c.agentRole}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-300 max-w-[300px] truncate">{c.summary}</td>
                    <td className="py-3 text-zinc-500 text-xs font-mono">
                      {files.length > 0 ? files.join(', ') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
