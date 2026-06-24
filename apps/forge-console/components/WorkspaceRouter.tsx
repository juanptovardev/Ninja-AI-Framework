'use client';

import React from 'react';
import { useUccStore } from '../lib/ucc-store';
import WorkspaceIdle from './WorkspaceIdle';
import WorkspacePlanning from './WorkspacePlanning';
import WorkspaceRunning from './WorkspaceRunning';
import WorkspaceGate from './WorkspaceGate';

export default function WorkspaceRouter() {
  const { mode } = useUccStore();

  switch (mode) {
    case 'PLANNING':
      return <WorkspacePlanning />;
    case 'RUNNING':
      return <WorkspaceRunning />;
    case 'GATE':
      return <WorkspaceGate />;
    case 'IDLE':
    default:
      return <WorkspaceIdle />;
  }
}
