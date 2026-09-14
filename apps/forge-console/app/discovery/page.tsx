'use client';

import { PageHeader, EmptyState, Badge } from '@ninja/ui-kit';
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Flask, Scan, MagnifyingGlassPlus, Swap, ShieldCheck } from '@phosphor-icons/react';

gsap.registerPlugin(useGSAP);

const features = [
  {
    title: 'Repository Scanner',
    description: 'Analyze GitHub repos for reusable architecture patterns and module structures.',
    icon: <Scan weight="duotone" className="w-8 h-8 text-[var(--ninja-accent)]" />
  },
  {
    title: 'Pattern Extractor',
    description: 'Identify domain-specific skills, workflows, and templates for extraction.',
    icon: <MagnifyingGlassPlus weight="duotone" className="w-8 h-8 text-[var(--ninja-accent)]" />
  },
  {
    title: 'Skill Normalizer',
    description: 'Convert external logic into native Agentic System format.',
    icon: <Swap weight="duotone" className="w-8 h-8 text-[var(--ninja-accent)]" />
  },
  {
    title: 'Quality Validator',
    description: 'Ensure extracted logic complies with strict engineering standards.',
    icon: <ShieldCheck weight="duotone" className="w-8 h-8 text-[var(--ninja-accent)]" />
  },
];

export default function DiscoveryPage() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from('.discovery-animate', {
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power3.out',
      clearProps: 'all'
    });
  }, { scope: container });

  return (
    <div ref={container} className="flex flex-col pb-24 max-w-5xl mx-auto w-full">
      <div className="discovery-animate">
        <PageHeader
          title="Discovery Lab"
          subtitle="Research module for external repository analysis and skill normalization."
          badge={<Badge variant="warning">PHASE 8</Badge>}
        />
      </div>

      <div className="space-y-8">
        <div className="discovery-animate">
          <EmptyState
            title="Module in Development"
            description="Discovery Lab is currently under construction for Phase 8. This module will allow autonomous agents to discover, analyze, and normalize external repositories and patterns into native skills."
            icon={<Flask weight="duotone" className="w-20 h-20" />}
            phase="Phase 8 Target"
          />
        </div>

        <div className="discovery-animate">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-display font-bold text-[var(--ninja-text-primary)]">Upcoming Capabilities</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="glass-card p-6 border-[var(--ninja-border-subtle)] hover:border-[var(--ninja-accent)] transition-all group">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-[var(--ninja-bg-secondary)] rounded-xl border border-[var(--ninja-border-subtle)] group-hover:scale-110 transition-transform">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[var(--ninja-text-primary)] mb-1 group-hover:text-[var(--ninja-accent)] transition-colors">{feature.title}</h3>
                    <p className="text-sm font-light text-[var(--ninja-text-secondary)] leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="discovery-animate glass-card p-8 border-[var(--ninja-border-subtle)] border-dashed text-center">
          <p className="text-sm font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-2">Roadmap Status</p>
          <p className="text-[var(--ninja-text-muted)] font-light">Scheduled for deployment after <span className="text-[var(--ninja-text-primary)] font-medium">Phase 7: Office Grid</span></p>
        </div>
      </div>
    </div>
  );
}
