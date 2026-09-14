'use client';

import { useState, useRef } from 'react';
import { Button, Badge, PageHeader } from '@ninja/ui-kit';
import { api } from '../../lib/api';
import type { IntakeResponse } from '../../lib/types';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Sparkle, WarningCircle, CheckCircle } from '@phosphor-icons/react';

gsap.registerPlugin(useGSAP);

const MAX_CHARS = 4000;
const WARNING_THRESHOLD = 3000;

export default function PlanPage() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState<IntakeResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from('.plan-animate', {
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power3.out',
      clearProps: 'all'
    });
  }, { scope: container });

  const charCount = prompt.length;
  const isOverLimit = charCount > MAX_CHARS;
  const charCountColor =
    charCount > MAX_CHARS
      ? 'text-[var(--ninja-danger)]'
      : charCount > WARNING_THRESHOLD
        ? 'text-[var(--ninja-warning)]'
        : 'text-[var(--ninja-text-muted)]';

  const handleSubmit = async () => {
    if (!prompt.trim() || isOverLimit) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.post<IntakeResponse>('/engine/submit', { prompt });
      if (res.error) throw new Error(res.error.message);
      setResponse(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={container} className="flex flex-col pb-24 max-w-4xl mx-auto w-full">
      <div className="plan-animate">
        <PageHeader 
          title="Plan Builder" 
          subtitle="Describe what you want to build and the Engine will break it down into tasks."
        />
      </div>

      <div className="plan-animate mb-8">
        <div className="glass-card p-8 border-[var(--ninja-border-subtle)] focus-within:border-[var(--ninja-accent)] focus-within:shadow-[0_0_20px_var(--ninja-accent-muted)] transition-all">
          <div className="flex items-center gap-3 mb-6">
            <Sparkle weight="duotone" className="w-6 h-6 text-[var(--ninja-accent)]" />
            <h2 className="text-xl font-display font-bold text-[var(--ninja-text-primary)]">Architecture Prompt</h2>
          </div>
          
          <div className="space-y-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to build... Be specific about features, technologies, and constraints."
              rows={8}
              className="w-full px-6 py-5 rounded-xl bg-[var(--ninja-bg-secondary)] text-[var(--ninja-text-primary)] placeholder-[var(--ninja-text-muted)] border border-[var(--ninja-border-strong)] focus:border-[var(--ninja-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ninja-accent)] transition-all resize-none font-medium leading-relaxed"
            />

            <div className="flex items-center justify-between">
              <span className={`text-xs font-mono-data font-bold tracking-widest ${charCountColor}`}>
                {charCount} / {MAX_CHARS} CHARS
              </span>

              {isOverLimit && (
                <span className="text-xs font-bold text-[var(--ninja-danger)] flex items-center gap-1">
                  <WarningCircle weight="fill" />
                  Prompt exceeds maximum length
                </span>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              loading={submitting}
              disabled={!prompt.trim() || isOverLimit || submitting}
              className="w-full py-4 text-base font-bold bg-[var(--ninja-accent)] hover:bg-[var(--ninja-accent-hover)] text-[var(--ninja-bg-primary)] mt-4 border-none shadow-[0_0_15px_var(--ninja-accent-muted)]"
            >
              Submit to Kage Engine
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="plan-animate mb-8 p-4 bg-[var(--ninja-danger)]/10 border border-[var(--ninja-danger)]/20 rounded-xl flex items-center gap-3">
          <WarningCircle weight="duotone" className="w-6 h-6 text-[var(--ninja-danger)]" />
          <p className="text-sm font-medium text-[var(--ninja-danger)]">{error.message}</p>
        </div>
      )}

      {response && (
        <div className="plan-animate animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="glass-card p-8 border-[var(--ninja-success)]/30 shadow-[0_0_30px_var(--ninja-success)]/10">
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-[var(--ninja-border-subtle)]">
              <div className="flex items-center gap-3">
                <CheckCircle weight="fill" className="w-8 h-8 text-[var(--ninja-success)]" />
                <div>
                  <h3 className="text-xl font-display font-bold text-[var(--ninja-text-primary)]">Plan Generated</h3>
                  <p className="text-sm text-[var(--ninja-text-secondary)] mt-1">Ready for orchestration</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-[var(--ninja-text-muted)] uppercase tracking-widest mb-1">Execution Mode</p>
                <Badge variant="accent">{response.mode}</Badge>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-4">Task Breakdown</h4>
              <div className="space-y-3">
                {response.tasks.map((task, index) => (
                  <div key={task.id} className="flex items-start gap-4 p-4 rounded-xl bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-subtle)] hover:border-[var(--ninja-border-strong)] transition-colors">
                    <span className="text-sm font-mono-data font-bold text-[var(--ninja-text-muted)] mt-0.5">{(index + 1).toString().padStart(2, '0')}</span>
                    <div className="flex-1">
                      <p className="text-base font-medium text-[var(--ninja-text-primary)]">{task.name}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold font-mono-data bg-[var(--ninja-accent)]/10 text-[var(--ninja-accent)]">
                          {task.agent}
                        </span>
                        {task.dependencies.length > 0 && (
                          <span className="text-xs font-mono-data text-[var(--ninja-text-muted)]">
                            deps: [{task.dependencies.join(', ')}]
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[var(--ninja-border-subtle)] flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest">Estimated Context Burn</span>
              <span className="text-2xl font-mono-data font-bold text-[var(--ninja-accent)]">
                ~{response.estimatedTokens.toLocaleString()} <span className="text-sm text-[var(--ninja-text-muted)]">tokens</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
