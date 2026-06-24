import type { EngineStatus } from './schema';

// Eventos completos que emite Kage Engine al bus

export interface KageEngineEvents {
  /**
   * Emitido cuando se recibe una solicitud
   */
  'engine.request.received': {
    requestId: string;
    mode: string;
    prompt: string;
    workspaceId: string;
  };

  /**
   * Emitido cuando se crea un plan
   */
  'engine.plan.created': {
    requestId: string;
    planId: string;
    steps: number;
  };

  /**
   * Emitido cuando comienza una ejecución
   */
  'engine.run.started': {
    runId: string;
    requestId: string;
    status: string;
  };

  /**
   * Emitido cuando se pausa una ejecución
   */
  'engine.run.paused': {
    runId: string;
    requestId: string;
    status: string;
  };

  /**
   * Emitido cuando se reanuda una ejecución
   */
  'engine.run.resumed': {
    runId: string;
    requestId: string;
    status: string;
  };

  /**
   * Emitido cuando se completa una ejecución
   */
  'engine.run.completed': {
    runId: string;
    requestId: string;
    status: string;
  };

  /**
   * Emitido cuando falla una ejecución
   */
  'engine.run.failed': {
    runId: string;
    requestId: string;
    status: string;
    error?: string;
  };

  /**
   * Emitido cuando se solicita una aprobación
   */
  'engine.approval.requested': {
    approvalId: string;
    runId: string;
    type: string;
    technicalSummary: string;
    friendlySummary: string;
    requestedAt: string;
  };

  /**
   * Emitido cuando se recibe una aprobación
   */
  'engine.approval.received': {
    approvalId: string;
    runId: string;
    approved: boolean;
    notes?: string;
  };

  /**
   * Emitido cuando se cancela una aprobación
   */
  'engine.approval.cancelled': {
    approvalId: string;
    runId: string;
  };
}
