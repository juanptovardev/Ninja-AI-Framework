'use client';

import { OfficeCanvas } from '@ninja/office-grid';
import { PageHeader, Badge } from '@ninja/ui-kit';
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export default function OfficePage() {
  const wsUrl = process.env.NEXT_PUBLIC_RUNTIME_WS_URL ?? 'ws://localhost:3141/ws/events';
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from('.office-animate', {
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power3.out',
      clearProps: 'all'
    });
  }, { scope: container });

  return (
    <div ref={container} className="flex flex-col h-[calc(100vh-80px)]">
      <div className="office-animate flex-none">
        <PageHeader
          title="Digital Office"
          subtitle="Real-time agent workspace and collaborative canvas."
          badge={<Badge variant="success" pulse>LIVE WS</Badge>}
        />
      </div>

      {/* perspective container for pseudo-isometric CSS 3D */}
      <div className="office-animate flex-1" style={{ perspective: '1000px' }}>
        <div
          className="h-full glass-card border-[var(--ninja-border-subtle)] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-transform duration-500 ease-out"
          style={{ transform: 'rotateX(4deg) rotateZ(-1deg)', transformStyle: 'preserve-3d' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = 'rotateX(0deg) rotateZ(0deg)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = 'rotateX(4deg) rotateZ(-1deg)';
          }}
        >
          <OfficeCanvas config={{ wsUrl }} />
        </div>
      </div>
    </div>
  );
}
