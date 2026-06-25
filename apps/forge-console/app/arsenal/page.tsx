'use client';

import { useEffect, useState } from 'react';

interface Tool {
  id: string;
  name: string;
  friendlyName: string;
  description: string;
  category: string;
  permission: string;
  agentRole?: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  agentRole: string;
  capabilities?: string[];
}

interface ArsenalData {
  tools: Tool[];
  skills: Skill[];
}

type Tab = 'friendly' | 'technical';

export default function ArsenalPage() {
  const [data, setData] = useState<ArsenalData>({ tools: [], skills: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('friendly');

  useEffect(() => {
    const port = process.env.NEXT_PUBLIC_NINJA_RUNTIME_PORT || '3141';
    fetch(`http://127.0.0.1:${port}/api/arsenal`)
      .then((r) => r.json())
      .then((d: ArsenalData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col pb-24 max-w-5xl mx-auto w-full p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Arsenal Registry</h1>
        <div className="flex bg-zinc-900 border border-white/10 rounded-xl p-1 gap-1">
          {(['friendly', 'technical'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm font-mono">Loading...</p>
      ) : tab === 'friendly' ? (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">
              Tools ({data.tools.length})
            </h2>
            {data.tools.length === 0 ? (
              <p className="text-zinc-600 text-sm">No tools registered.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.tools.map((t) => (
                  <div key={t.id} className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-white text-sm">{t.friendlyName || t.name}</h3>
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono shrink-0">
                        {t.category}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">{t.description || '—'}</p>
                    <p className="text-[10px] text-zinc-600 font-mono mt-2">Permission: {t.permission}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">
              Skills ({data.skills.length})
            </h2>
            {data.skills.length === 0 ? (
              <p className="text-zinc-600 text-sm">No skills registered.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.skills.map((s) => (
                  <div key={s.id} className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-white text-sm">{s.name}</h3>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono shrink-0">
                        {s.agentRole}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">{s.description || '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <pre className="text-xs text-zinc-300 bg-zinc-950 border border-white/5 rounded-2xl p-6 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
