'use client';

import { useState, useEffect, useRef } from 'react';
import { Badge, PageHeader } from '@ninja/ui-kit';
import { fetchHealthPulse } from '../../lib/api';
import type { PulseData as HealthStatus } from '../../lib/types';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Heartbeat, Warning, Info, ShieldWarning } from '@phosphor-icons/react';

gsap.registerPlugin(useGSAP);

const findingTypeColors = {
  warning: 'warning',
  error: 'danger',
  info: 'info',
} as const;

function getScoreColor(score: number): string {
  if (score < 50) return 'var(--ninja-danger)';
  if (score < 75) return 'var(--ninja-warning)';
  return 'var(--ninja-success)';
}

function getScoreLabel(score: number): string {
  if (score < 50) return 'Critical';
  if (score < 75) return 'Degraded';
  return 'Optimal';
}

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function HealthPage() {
  const [data, setData] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const health = await fetchHealthPulse();
        setData(health);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useGSAP(() => {
    if (!loading && data) {
      gsap.from('.health-animate', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power3.out',
        clearProps: 'all'
      });
    }
  }, { dependencies: [loading, data], scope: container });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <Heartbeat weight="duotone" className="w-16 h-16 text-[var(--ninja-accent)] animate-pulse" />
        <p className="text-[var(--ninja-text-muted)] font-mono-data tracking-widest uppercase">Checking Vitals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh]">
        <ShieldWarning weight="duotone" className="w-20 h-20 text-[var(--ninja-danger)] mb-6 opacity-80" />
        <h2 className="text-2xl font-display font-bold text-[var(--ninja-text-primary)] mb-2">Health Check Failed</h2>
        <p className="text-[var(--ninja-text-secondary)] text-center max-w-md">{error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div ref={container} className="flex flex-col pb-24 max-w-5xl mx-auto w-full">
      <div className="health-animate">
        <PageHeader 
          title="System Health" 
          subtitle="Real-time telemetry and architectural stability."
          badge={<Badge variant="success" pulse>Healthy</Badge>}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="health-animate glass-card p-8 border-[var(--ninja-border-subtle)]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest">Stability Score</h3>
            <span className="text-xs font-bold font-mono-data px-2.5 py-1 rounded-sm border border-[var(--ninja-border-subtle)] text-[var(--ninja-text-muted)]">CORE</span>
          </div>
          <div className="space-y-4">
            <div className="flex items-end justify-between mb-2">
              <span className="text-5xl font-display font-bold tracking-tighter" style={{ color: getScoreColor(data.stabilityScore) }}>
                {data.stabilityScore}%
              </span>
              <span className="text-sm font-bold uppercase tracking-widest" style={{ color: getScoreColor(data.stabilityScore) }}>
                {getScoreLabel(data.stabilityScore)}
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-[var(--ninja-bg-secondary)] overflow-hidden">
              <div
                className="h-full transition-all duration-1000 ease-out rounded-full shadow-[0_0_10px_currentColor]"
                style={{
                  width: `${data.stabilityScore}%`,
                  backgroundColor: getScoreColor(data.stabilityScore),
                }}
              />
            </div>
          </div>
        </div>

        <div className="health-animate glass-card p-8 border-[var(--ninja-border-subtle)]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest">Context Efficiency</h3>
            <span className="text-xs font-bold font-mono-data px-2.5 py-1 rounded-sm border border-[var(--ninja-border-subtle)] text-[var(--ninja-text-muted)]">MEM</span>
          </div>
          <div className="space-y-4">
            <div className="flex items-end justify-between mb-2">
              <span className="text-5xl font-display font-bold tracking-tighter" style={{ color: getScoreColor(data.contextEfficiency) }}>
                {data.contextEfficiency}%
              </span>
              <span className="text-sm font-bold uppercase tracking-widest" style={{ color: getScoreColor(data.contextEfficiency) }}>
                {getScoreLabel(data.contextEfficiency)}
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-[var(--ninja-bg-secondary)] overflow-hidden">
              <div
                className="h-full transition-all duration-1000 ease-out rounded-full shadow-[0_0_10px_currentColor]"
                style={{
                  width: `${data.contextEfficiency}%`,
                  backgroundColor: getScoreColor(data.contextEfficiency),
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="health-animate mb-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-[var(--ninja-text-primary)]">Recent Findings</h2>
          <Badge variant="default">{data.findings.length} events</Badge>
        </div>
        
        <div className="glass-card border-[var(--ninja-border-subtle)] p-6">
          <div className="space-y-4">
            {data.findings.length === 0 ? (
              <p className="text-center py-8 text-[var(--ninja-text-muted)] font-medium">No findings detected.</p>
            ) : (
              data.findings.map((finding) => (
                <div
                  key={finding.id}
                  className="flex items-start gap-4 p-4 rounded-xl bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-subtle)] hover:border-[var(--ninja-border-strong)] transition-colors group"
                >
                  <div className="mt-1">
                    {finding.type === 'error' && <Warning weight="fill" className="w-5 h-5 text-[var(--ninja-danger)]" />}
                    {finding.type === 'warning' && <Warning weight="fill" className="w-5 h-5 text-[var(--ninja-warning)]" />}
                    {finding.type === 'info' && <Info weight="fill" className="w-5 h-5 text-[var(--ninja-info)]" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-medium text-[var(--ninja-text-primary)] group-hover:text-[var(--ninja-accent)] transition-colors">{finding.message}</p>
                    <p className="text-xs font-mono-data text-[var(--ninja-text-muted)] mt-2 uppercase tracking-wider">{formatTimeAgo(finding.timestamp)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="health-animate glass-card p-6 border-[var(--ninja-border-subtle)]">
        <div className="flex items-center justify-between text-sm font-mono-data uppercase tracking-widest font-bold">
          <div className="flex items-center gap-3">
            <span className="text-[var(--ninja-text-muted)]">Uptime</span>
            <span className="text-[var(--ninja-text-primary)]">{formatUptime(data.uptime)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[var(--ninja-text-muted)]">Last sync</span>
            <span className="text-[var(--ninja-text-primary)]">{formatTimeAgo(data.lastCheck)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
