'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import React from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function Tooltip({ content, children, side = 'right' }: TooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={400}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 px-2.5 py-1 rounded text-xs font-semibold bg-[var(--ninja-bg-tertiary)] text-[var(--ninja-text-primary)] border border-[var(--ninja-border)] shadow-md select-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {content}
          <RadixTooltip.Arrow className="fill-[var(--ninja-border)]" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export { RadixTooltip as TooltipProvider };
