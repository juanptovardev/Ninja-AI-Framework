'use client';

import { useState, useEffect, useRef } from 'react';
import { Badge, Button, PageHeader } from '@ninja/ui-kit';
import { api } from '../../lib/api';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Archive, FileDashed, MagnifyingGlass, Anchor } from '@phosphor-icons/react';

gsap.registerPlugin(useGSAP);

type ArtifactType = 'prd' | 'plan' | 'code' | 'test' | 'report' | 'log' | 'template' | 'other';

interface Artifact {
  id: string;
  runId: string;
  type: ArtifactType;
  name: string;
  content: string;
  createdAt: string;
  isAnchor?: boolean;
}

const typeColors: Record<ArtifactType, 'accent' | 'info' | 'success' | 'warning' | 'default'> = {
  prd: 'accent',
  plan: 'info',
  code: 'success',
  test: 'warning',
  report: 'default',
  log: 'default',
  template: 'info',
  other: 'default',
};

const typeLabels: Record<ArtifactType, string> = {
  prd: 'PRD',
  plan: 'Plan',
  code: 'Code',
  test: 'Test',
  report: 'Report',
  log: 'Log',
  template: 'Template',
  other: 'Other',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString();
}

export default function ArtifactsPage() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedType, setSelectedType] = useState<ArtifactType | 'all'>('all');
  const [showAnchorOnly, setShowAnchorOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  const fetchArtifacts = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedType !== 'all') params.append('type', selectedType);
    if (showAnchorOnly) params.append('isAnchor', 'true');

    const response = await api.get<Artifact[]>(`/api/artifacts?${params.toString()}`);
    if (response.error) {
      setError(new Error(response.error.message));
    } else {
      setArtifacts(response.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchArtifacts();
  }, [selectedType, showAnchorOnly]);

  useGSAP(() => {
    if (!loading && artifacts.length > 0) {
      gsap.from('.artifact-item', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.05,
        ease: 'power3.out',
        clearProps: 'all'
      });
    }
  }, { dependencies: [loading, artifacts.length, selectedType, showAnchorOnly], scope: container });

  const filteredArtifacts = artifacts.filter((artifact) => {
    if (selectedType !== 'all' && artifact.type !== selectedType) return false;
    if (showAnchorOnly && !artifact.isAnchor) return false;
    return true;
  });

  if (loading && artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <Archive weight="duotone" className="w-16 h-16 text-[var(--ninja-accent)] animate-pulse" />
        <p className="text-[var(--ninja-text-muted)] font-mono-data tracking-widest uppercase">Fetching Artifacts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh]">
        <FileDashed weight="duotone" className="w-20 h-20 text-[var(--ninja-danger)] mb-6 opacity-80" />
        <h2 className="text-2xl font-display font-bold text-[var(--ninja-text-primary)] mb-2">Failed to load artifacts</h2>
        <p className="text-[var(--ninja-text-secondary)] text-center max-w-md">{error.message}</p>
        <Button variant="secondary" className="mt-8" onClick={fetchArtifacts}>Retry Request</Button>
      </div>
    );
  }

  return (
    <div ref={container} className="flex flex-col pb-24 w-full">
      <div className="artifact-item">
        <PageHeader 
          title="Data Artifacts" 
          subtitle="Explore memory anchors, plans, PRDs, and generated code."
          badge={<Badge variant="default">{filteredArtifacts.length} items</Badge>}
        />
      </div>

      <div className="artifact-item flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between mb-8 p-6 glass-card border-[var(--ninja-border-subtle)]">
        <div className="flex items-center gap-4">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ninja-text-muted)]" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as ArtifactType | 'all')}
              className="bg-[var(--ninja-bg-secondary)] text-[var(--ninja-text-primary)] border border-[var(--ninja-border-strong)] rounded-lg pl-9 pr-10 py-2.5 text-sm font-bold tracking-wide focus:outline-none focus:border-[var(--ninja-accent)] focus:ring-1 focus:ring-[var(--ninja-accent)] appearance-none cursor-pointer"
            >
              <option value="all">All Document Types</option>
              <option value="prd">Product Specs (PRD)</option>
              <option value="plan">Execution Plans</option>
              <option value="code">Source Code</option>
              <option value="test">Test Suites</option>
              <option value="report">Analysis Reports</option>
              <option value="log">System Logs</option>
              <option value="template">Templates</option>
              <option value="other">Uncategorized</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer group">
          <div className={`w-12 h-6 rounded-full transition-colors relative ${showAnchorOnly ? 'bg-[var(--ninja-accent)]' : 'bg-[var(--ninja-border-strong)]'}`}>
            <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${showAnchorOnly ? 'translate-x-6' : 'translate-x-0'}`} />
          </div>
          <input
            type="checkbox"
            checked={showAnchorOnly}
            onChange={(e) => setShowAnchorOnly(e.target.checked)}
            className="hidden"
          />
          <span className="text-sm font-bold uppercase tracking-widest text-[var(--ninja-text-secondary)] group-hover:text-[var(--ninja-text-primary)] transition-colors">
            Memory Anchors Only
          </span>
        </label>
      </div>

      {filteredArtifacts.length === 0 ? (
        <div className="artifact-item flex flex-col items-center justify-center min-h-[300px] glass-card border-[var(--ninja-border-subtle)] border-dashed">
          <Archive weight="duotone" className="w-16 h-16 text-[var(--ninja-text-muted)] mb-4 opacity-50" />
          <p className="text-[var(--ninja-text-secondary)] font-medium">No artifacts found matching criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredArtifacts.map((artifact) => (
            <div key={artifact.id} className="artifact-item glass-card flex flex-col border-[var(--ninja-border-subtle)] hover:border-[var(--ninja-border-strong)] transition-all overflow-hidden group">
              <div className="p-5 border-b border-[var(--ninja-border-subtle)] bg-[var(--ninja-surface)]/50">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-display font-bold text-[var(--ninja-text-primary)] truncate flex-1 mr-4 group-hover:text-[var(--ninja-accent)] transition-colors">
                    {artifact.name}
                  </h3>
                  <div className="flex gap-2 flex-shrink-0">
                    {artifact.isAnchor && (
                      <Badge variant="accent" className="flex items-center gap-1 shadow-[0_0_10px_var(--ninja-accent-muted)]">
                        <Anchor weight="fill" />
                      </Badge>
                    )}
                    <Badge variant={typeColors[artifact.type]}>{typeLabels[artifact.type]}</Badge>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs font-mono-data text-[var(--ninja-text-muted)] uppercase tracking-wider mt-4">
                  <span>Run #{artifact.runId.substring(0, 8)}</span>
                  <span>{formatTime(artifact.createdAt)}</span>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex-1">
                  <p className="text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-3">Preview</p>
                  <div className="bg-[var(--ninja-bg-primary)] rounded-lg p-4 max-h-32 overflow-hidden border border-[var(--ninja-border-subtle)] relative">
                    <pre className="text-xs font-mono-data text-[var(--ninja-text-muted)] whitespace-pre-wrap">
                      {artifact.content.substring(0, 300)}
                      {artifact.content.length > 300 && '...'}
                    </pre>
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--ninja-bg-primary)] to-transparent" />
                  </div>
                </div>

                {expandedId === artifact.id ? (
                  <div className="mt-6 pt-6 border-t border-[var(--ninja-border-subtle)] animate-in slide-in-from-top-4 duration-300">
                    <p className="text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-3 flex justify-between items-center">
                      Full Content
                      <Button variant="ghost" size="sm" onClick={() => setExpandedId(null)} className="h-6 px-2 py-0 text-[var(--ninja-accent)]">Close</Button>
                    </p>
                    <div className="bg-[var(--ninja-bg-primary)] rounded-lg p-4 max-h-96 overflow-y-auto custom-scroll border border-[var(--ninja-border-subtle)]">
                      <pre className="text-xs font-mono-data text-[var(--ninja-text-primary)] whitespace-pre-wrap">
                        {artifact.content}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => setExpandedId(artifact.id)}
                    className="mt-6 border-[var(--ninja-border-strong)] hover:border-[var(--ninja-accent)] hover:text-[var(--ninja-accent)] text-xs font-bold uppercase tracking-widest py-3"
                  >
                    View Full Document
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
