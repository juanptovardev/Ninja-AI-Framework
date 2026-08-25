'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { PageHeader, Metric, ProTable, BarList, Badge, Button, Spinner } from '@ninja/ui-kit';
import { api, WS_URL } from '../../lib/api';
import type { DashboardData, TaskEntry } from '../../lib/types';
import { useWsClient } from '../../lib/ws-client';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { PaperPlaneRight, Robot, WarningCircle } from '@phosphor-icons/react';

gsap.registerPlugin(useGSAP);

const GrillMeSection = () => {
  const { messages, connected, connect, disconnect, sendMessage } = useWsClient();
  const [input, setInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connect(WS_URL);
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    // Add to local chat UI optimistically
    sendMessage(input);
    
    const goal = input;
    setInput('');
    
    try {
      await api.post('/engine/submit', {
        prompt: goal,
        mode: 'auto',
        workspaceId: 'default-workspace'
      });
    } catch (err) {
      console.error('Failed to submit goal', err);
    }
  };

  return (
    <div className="flex flex-col h-[600px] glass-card rounded-2xl overflow-hidden font-sans border border-[var(--ninja-border-strong)]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-8 py-6 border-b border-[var(--ninja-border-subtle)] bg-[var(--ninja-surface)]/80 backdrop-blur-md">
        <div>
          <h3 className="text-2xl font-display font-bold text-[var(--ninja-text-primary)] tracking-tight">Grill-Me Interview</h3>
          <p className="text-base text-[var(--ninja-text-secondary)] mt-1 font-light">Refine your Specification interactively</p>
        </div>
        <div className="flex items-center gap-4 mt-4 sm:mt-0">
          <Badge variant={connected ? 'success' : 'warning'}>
            {connected ? 'WS Connected' : 'Connecting...'}
          </Badge>
          <Button 
            className="bg-[var(--ninja-accent)] hover:bg-[var(--ninja-accent-hover)] text-[var(--ninja-bg-primary)] transition-all font-bold px-6 py-2.5 rounded-lg shadow-[0_0_20px_var(--ninja-accent-muted)] hover:shadow-[0_0_30px_var(--ninja-accent-muted)]"
            onClick={async () => {
              try {
                await api.post('/api/session/init', {});
                window.location.reload();
              } catch (e) {
                console.error(e);
              }
            }}
          >
            Start New Session
          </Button>
        </div>
      </div>
      
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scroll bg-[var(--ninja-bg-primary)]/40 relative">
        {messages.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--ninja-text-muted)]">
            <Robot weight="duotone" className="w-16 h-16 mb-6 opacity-60 text-[var(--ninja-text-secondary)]" />
            <p className="text-lg font-medium text-[var(--ninja-text-primary)]">Ready to start the spec interview.</p>
            <p className="text-sm mt-2 text-[var(--ninja-text-secondary)] font-light">The agent will begin asking questions shortly.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-6 py-4 ${
                msg.sender === 'user' 
                  ? 'bg-[var(--ninja-accent)] text-[var(--ninja-bg-primary)] shadow-lg rounded-br-sm' 
                  : 'bg-[var(--ninja-surface)] text-[var(--ninja-text-primary)] border border-[var(--ninja-border-subtle)] rounded-bl-sm'
              }`}>
                <p className={`text-base leading-relaxed whitespace-pre-wrap ${msg.sender === 'user' ? 'font-medium' : 'font-light'}`}>{msg.text}</p>
                <span className={`text-[11px] font-mono-data mt-3 block uppercase tracking-wider ${msg.sender === 'user' ? 'text-[var(--ninja-bg-primary)]/70' : 'text-[var(--ninja-text-muted)]'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-6 border-t border-[var(--ninja-border-subtle)] bg-[var(--ninja-surface)]/90 backdrop-blur-md">
        <div className="relative flex items-center max-w-5xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your response to the agent..."
            aria-label="Message to agent"
            className="w-full bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-strong)] rounded-xl px-6 py-4 pr-16 text-base text-[var(--ninja-text-primary)] placeholder-[var(--ninja-text-muted)] focus:outline-none focus:border-[var(--ninja-accent)] focus:ring-1 focus:ring-[var(--ninja-accent)] transition-all shadow-inner"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            aria-label="Send message"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-[var(--ninja-accent)] hover:bg-[var(--ninja-accent-hover)] disabled:bg-[var(--ninja-surface-hover)] disabled:text-[var(--ninja-text-muted)] disabled:cursor-not-allowed text-[var(--ninja-bg-primary)] transition-all flex items-center justify-center shadow-md active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--ninja-accent)] focus-visible:outline-none"
          >
            <PaperPlaneRight weight="fill" className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const statusColors = {
  pending: 'warning',
  running: 'info',
  completed: 'success',
  failed: 'danger',
} as const;

const systemStateColors = {
  idle: 'default',
  running: 'success',
  paused: 'warning',
  error: 'danger',
} as const;

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
};

export default function MissionControlPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await api.get<DashboardData>('/api/dashboard');
        setData(res.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // GSAP Staggered Entry Animation
  useGSAP(() => {
    if (!loading && data) {
      gsap.from('.stagger-item', {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power3.out',
        clearProps: 'all'
      });
    }
  }, { dependencies: [loading, data], scope: container });

  const agentsWorkload = useMemo(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    data.recentTasks.forEach((task) => {
      if (task.agent) {
        counts[task.agent] = (counts[task.agent] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 border-t-2 border-[var(--ninja-accent)] rounded-full animate-spin"></div>
          <div className="absolute inset-2 border-r-2 border-[var(--ninja-text-secondary)] rounded-full animate-spin reverse-spin opacity-50"></div>
        </div>
        <p className="text-[var(--ninja-text-muted)] font-mono-data tracking-widest uppercase">Initializing Telemetry...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh]">
        <WarningCircle weight="duotone" className="w-20 h-20 text-[var(--ninja-danger)] mb-6 opacity-80" />
        <h2 className="text-2xl font-display font-bold text-[var(--ninja-text-primary)] mb-2">Telemetry Failure</h2>
        <p className="text-[var(--ninja-text-secondary)] text-center max-w-md">{error.message}</p>
        <Button variant="secondary" className="mt-8" onClick={() => window.location.reload()}>Retry Connection</Button>
      </div>
    );
  }

  if (!data) return null;

  const columns = [
    {
      key: 'id',
      header: 'ID',
      width: '100px' as const,
      mono: true,
      render: (item: Record<string, unknown>) => {
        const task = item as unknown as TaskEntry;
        return <span className="opacity-80">#{task.id.slice(-5)}</span>;
      },
    },
    {
      key: 'name',
      header: 'Task Designation',
      render: (item: Record<string, unknown>) => {
        const task = item as unknown as TaskEntry;
        return <span className="font-medium text-[var(--ninja-text-primary)]">{task.name}</span>;
      },
    },
    {
      key: 'agent',
      header: 'Assigned Agent',
      width: '140px' as const,
      render: (item: Record<string, unknown>) => {
        const task = item as unknown as TaskEntry;
        return <span className="text-[var(--ninja-text-secondary)] font-semibold">{task.agent || '—'}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px' as const,
      render: (item: Record<string, unknown>) => {
        const task = item as unknown as TaskEntry;
        return <Badge variant={statusColors[task.status]}>{task.status}</Badge>;
      },
    },
    {
      key: 'timestamp',
      header: 'Time',
      width: '100px' as const,
      render: (item: Record<string, unknown>) => {
        const task = item as unknown as TaskEntry;
        return <span className="text-[var(--ninja-text-muted)]">{formatRelativeTime(task.timestamp)}</span>;
      },
    },
  ];

  return (
    <div ref={container} className="flex flex-col pb-24">
      <div className="stagger-item">
        <PageHeader
          title="Mission Control"
          subtitle="System overview, active runs, and global agent orchestration."
          badge={
            <Badge
              variant={systemStateColors[data.systemState]}
              pulse={data.systemState === 'running'}
            >
              SYSTEM {data.systemState.toUpperCase()}
            </Badge>
          }
        />
      </div>

      {/* Asymmetric Grid to break the 3/4 column monotony */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-10">
        <div className="stagger-item lg:col-span-3">
          <Metric 
            value={data.runsActive} 
            label="Active Orchestration Runs" 
            delta={{ value: 12.4, trend: 'up' }} 
            color="cyan"
            className="h-full bg-[var(--ninja-bg-secondary)] border-[var(--ninja-border-strong)] shadow-2xl"
          />
        </div>
        <div className="stagger-item lg:col-span-3">
          <Metric
            value={data.agentsActive}
            label="Agents Engaged"
            color="cyan"
            delta={{ value: 5.2, trend: 'up' }}
            className="h-full"
          />
        </div>
        <div className="stagger-item lg:col-span-2 md:col-span-1">
          <Metric 
            value="23%" 
            label="System Load" 
            color="amber" 
            delta={{ value: 2.1, trend: 'down' }} 
          />
        </div>
        <div className="stagger-item lg:col-span-4 md:col-span-1">
          <Metric 
            value="1.2K" 
            label="Context Burn Rate" 
            prefix="⚡" 
            suffix=" t/min" 
            color="emerald" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-10">
        <div className="stagger-item xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest">Active Task Stream</h3>
            <span className="text-xs text-[var(--ninja-text-muted)] font-mono-data">LIVE</span>
          </div>
          <ProTable
            columns={columns}
            data={data.recentTasks as unknown as Record<string, unknown>[]}
          />
        </div>

        <div className="stagger-item xl:col-span-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest">Workload Distribution</h3>
          </div>
          <div className="flex-1">
            <BarList data={agentsWorkload} color="cyan" className="h-full" />
          </div>
        </div>
      </div>

      <div className="stagger-item mb-12">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest">Event Horizon</h3>
        </div>
        <div className="glass-card p-6 border-[var(--ninja-border-subtle)]">
          <div className="space-y-4">
            {data.recentTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-4 p-3 rounded-xl hover:bg-[var(--ninja-surface-hover)] transition-all duration-300 border border-transparent hover:border-[var(--ninja-border-strong)] group"
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full mt-2 flex-shrink-0 transition-transform duration-300 group-hover:scale-125 ${
                    task.status === 'running'
                      ? 'bg-[var(--ninja-accent)] animate-pulse shadow-[0_0_8px_var(--ninja-accent)]'
                      : task.status === 'completed'
                        ? 'bg-[var(--ninja-success)]'
                        : task.status === 'failed'
                          ? 'bg-[var(--ninja-danger)]'
                          : 'bg-[var(--ninja-warning)]'
                  }`}
                />
                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-medium text-[var(--ninja-text-primary)] truncate group-hover:text-[var(--ninja-accent)] transition-colors">{task.name}</p>
                    <p className="text-sm text-[var(--ninja-text-secondary)] mt-0.5">
                      <span className="font-semibold">{task.agent}</span> • Assigned Agent
                    </p>
                  </div>
                  <span className="text-xs font-mono-data text-[var(--ninja-text-muted)] sm:text-right bg-[var(--ninja-bg-primary)] px-2.5 py-1 rounded-md border border-[var(--ninja-border-subtle)]">
                    {formatRelativeTime(task.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stagger-item">
        <GrillMeSection />
      </div>
    </div>
  );
}
