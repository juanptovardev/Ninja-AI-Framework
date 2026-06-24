import type { EngineRequest, EngineRun, EngineApproval, ApprovalResult, EngineStatus } from './schema';
import type { KageEngine } from './engine';
import type { WorkspaceContext } from '@ninja/workbench';

// Definición de rutas HTTP para Kage Engine
export interface HttpRoutes {
  /**
   * Endpoint para enviar solicitudes al motor
   * POST /engine/submit
   */
  submitRequest: {
    method: 'POST';
    path: '/engine/submit';
    request: {
      body: {
        mode: 'build' | 'template' | 'repair' | 'workspace';
        prompt: string;
        workspaceId: string;
        context?: Record<string, unknown>;
        options?: Record<string, unknown>;
      };
    };
    response: {
      status: 200;
      body: {
        runId: string;
        requestId: string;
        status: EngineStatus;
        progress: number;
      };
    };
  };

  /**
   * Endpoint para obtener el estado de una ejecución
   * GET /engine/run/:id
   */
  getRunStatus: {
    method: 'GET';
    path: '/engine/run/:id';
    request: {
      params: {
        id: string; // ID de la ejecución
      };
    };
    response: {
      status: 200;
      body: EngineRun;
    };
  };

  /**
   * Endpoint para aprobar una solicitud
   * POST /engine/run/:id/approve
   */
  approveRequest: {
    method: 'POST';
    path: '/engine/run/:id/approve';
    request: {
      params: {
        id: string; // ID de la ejecución
      };
      body: {
        approvalId: string;
        approved: boolean;
        notes?: string;
      };
    };
    response: {
      status: 200;
      body: {
        success: true;
        message: string;
      };
    };
  };

  /**
   * Endpoint para pausar una ejecución
   * POST /engine/run/:id/pause
   */
  pauseRun: {
    method: 'POST';
    path: '/engine/run/:id/pause';
    request: {
      params: {
        id: string; // ID de la ejecución
      };
    };
    response: {
      status: 200;
      body: {
        success: true;
        message: string;
      };
    };
  };

  /**
   * Endpoint para reanudar una ejecución pausada
   * POST /engine/run/:id/resume
   */
  resumeRun: {
    method: 'POST';
    path: '/engine/run/:id/resume';
    request: {
      params: {
        id: string; // ID de la ejecución
      };
    };
    response: {
      status: 200;
      body: {
        success: true;
        message: string;
      };
    };
  };

  /**
   * Endpoint para cancelar una ejecución
   * POST /engine/run/:id/cancel
   */
  cancelRun: {
    method: 'POST';
    path: '/engine/run/:id/cancel';
    request: {
      params: {
        id: string; // ID de la ejecución
      };
    };
    response: {
      status: 200;
      body: {
        success: true;
        message: string;
      };
    };
  };

  /**
   * Endpoint para listar ejecuciones activas
   * GET /engine/runs
   */
  listActiveRuns: {
    method: 'GET';
    path: '/engine/runs';
    request: {
      query?: {
        status?: 'executing' | 'paused' | 'planning';
        limit?: number;
        offset?: number;
      };
    };
    response: {
      status: 200;
      body: {
        runs: EngineRun[];
        totalCount: number;
      };
    };
  };
}

// Controlador HTTP para Kage Engine
export class HttpController {
  constructor(
    private readonly engine: KageEngine,
    private readonly requireActiveContext: (workspaceId: string) => Promise<WorkspaceContext>
  ) {}

  /**
   * Maneja la solicitud de envío de trabajo
   */
  async handleSubmit(
    req: HttpRoutes['submitRequest']['request']
  ): Promise<HttpRoutes['submitRequest']['response']> {
    // Crear solicitud del motor
    const engineRequest: EngineRequest = {
      id: crypto.randomUUID(),
      mode: req.body.mode,
      prompt: req.body.prompt,
      workspaceId: req.body.workspaceId,
      context: req.body.context,
      options: req.body.options,
      createdAt: new Date().toISOString(),
    };

    // Obtener contexto del workspace
    const workspaceContext = await this.requireActiveContext(req.body.workspaceId);

    // Enviar solicitud al motor
    const run = await this.engine.submit(engineRequest, workspaceContext);

    return {
      status: 200,
      body: {
        runId: run.id,
        requestId: run.requestId,
        status: run.status,
        progress: run.progress,
      },
    };
  }

  /**
   * Maneja la consulta de estado de ejecución
   */
  async handleGetRunStatus(
    req: HttpRoutes['getRunStatus']['request']
  ): Promise<{ status: 200; body: EngineRun } | { status: 404; body: { error: string } }> {
    const run = this.engine.getStatus(req.params.id);

    if (!run) {
      return {
        status: 404,
        body: {
          error: 'Run not found',
        },
      };
    }

    return {
      status: 200,
      body: run,
    };
  }

  /**
   * Maneja la aprobación de solicitudes
   */
  async handleApprove(
    req: HttpRoutes['approveRequest']['request']
  ): Promise<HttpRoutes['approveRequest']['response']> {
    const approvalResult: ApprovalResult = {
      approved: req.body.approved,
      respondedAt: new Date().toISOString(),
      notes: req.body.notes,
    };

    await this.engine.approve(req.body.approvalId, approvalResult);

    return {
      status: 200,
      body: {
        success: true,
        message: `Approval ${req.body.approved ? 'granted' : 'denied'}`,
      },
    };
  }

  /**
   * Maneja la pausa de una ejecución
   */
  async handlePause(
    req: HttpRoutes['pauseRun']['request']
  ): Promise<HttpRoutes['pauseRun']['response']> {
    await this.engine.pause(req.params.id);

    return {
      status: 200,
      body: {
        success: true,
        message: 'Run paused successfully',
      },
    };
  }

  /**
   * Maneja la reanudación de una ejecución
   */
  async handleResume(
    req: HttpRoutes['resumeRun']['request']
  ): Promise<HttpRoutes['resumeRun']['response']> {
    await this.engine.resume(req.params.id);

    return {
      status: 200,
      body: {
        success: true,
        message: 'Run resumed successfully',
      },
    };
  }

  /**
   * Maneja la cancelación de una ejecución
   */
  async handleCancel(
    req: HttpRoutes['cancelRun']['request']
  ): Promise<HttpRoutes['cancelRun']['response']> {
    await this.engine.cancel(req.params.id);

    return {
      status: 200,
      body: {
        success: true,
        message: 'Run cancelled successfully',
      },
    };
  }

  /**
   * Maneja la lista de ejecuciones activas
   */
  async handleListActiveRuns(
    req: HttpRoutes['listActiveRuns']['request']
  ): Promise<HttpRoutes['listActiveRuns']['response']> {
    // Esta implementación dependería de cómo se almacenan las ejecuciones
    // Por ahora, retornamos una estructura vacía
    return {
      status: 200,
      body: {
        runs: [],
        totalCount: 0,
      },
    };
  }
}
