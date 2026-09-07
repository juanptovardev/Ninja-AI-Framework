import fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocketPlugin from '@fastify/websocket';
import { createHash } from 'node:crypto';
import type { RuntimeStatus } from '@ninja/contracts';
import { createLogger } from '@ninja/logging';
import { eventBus } from '@ninja/events';
import { parseEnv } from './env-schema.js';
import { sanitizeError } from './sanitize-error.js';
import { getOrCreateRuntimeKey } from './auth-key.js';
import { AuthError } from '@ninja/contracts';
import {
  ShellExecuteSchema,
  EngineSubmitSchema,
  VaultWriteSchema,
  GitCommitSchema,
  RosterAssignSchema,
} from './route-schemas.js';
import { RUNTIME_NAME, RUNTIME_VERSION } from './constants.js';
import { registerBusRoutes } from './bus-router.js';
import { registerErrorHandlers } from './error-handler.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerShutdownStep, getShutdownSteps, clearShutdownSteps } from './shutdown-registry.js';
import { closeDb } from '@ninja/storage';
import { KageEngine, HttpController } from '@ninja/kage-engine';
import { bootstrap as bootstrapArsenal } from '@ninja/arsenal-registry';
import { requireActiveContext } from '@ninja/workbench';
import { initDb, runMigrations } from '@ninja/storage';
import { WORKSPACE_MIGRATIONS } from '@ninja/workbench';
import { WorkflowExecutor } from '@ninja/flow-matrix';
import { AgentExecutor } from '@ninja/agent-runtime';
import {
  SessionRepository,
  RunRepository,
  ArtifactRepository,
  AgentCommitRepository,
  PulseMetricRepository,
  AuditLogRepository,
} from '@ninja/trace-ledger';
import type { NinjaEvent } from '@ninja/contracts';
import { getNinjaGlobalDir } from '@ninja/config';
import { LLMRegistry } from '@ninja/integrations-llm';
import { PulseMonitor, setDashboardMonitor, getDashboardData } from '@ninja/pulse-center';
import { RosterManager } from '@ninja/roster';
import { DelegationRouter } from '@ninja/delegation-router';
import { registerMcpRuntimeRoutes } from './mcp-runtime-server.js';
import { registerRosterVerifyRoute } from './routes/roster-verify.js';
import { FailoverManager } from './failover.js';
import { PolicyEngine, ApprovalManager, Auditor, Guardian } from '@ninja/sentinel';
import type { ApproverIdentity } from '@ninja/sentinel';
import path from 'path';

// Phase 5: Intelligence & Memory
import { engramClient } from '@ninja/integrations-engram';
import { LightRAGClient } from '@ninja/integrations-lightrag';
import { VaultCoordinator, AgentNamespaceManager, type IHotMemoryProvider } from '@ninja/vault';
import {
  ModelCatalog,
  StrategyEngine,
  ModelSelector,
  BudgetManager,
  FallbackChain,
  createStrategyEngine,
} from '@ninja/model-gateway';
import { LearningHarvester, LearningPromoter, LearningEvaluator } from '@ninja/learning-loop';

// Phase 8: External Integrations & Forge Lab
import { executeCommand, validateCommand, type ShellCommand } from '@ninja/integrations-shell';
import { GitClient, commit } from '@ninja/integrations-git';
import { scanDirectory } from '@ninja/integrations-fs';
import { httpRequest } from '@ninja/integrations-http';
import {
  RepoAnalyzer,
  ContentExtractor,
  normalizeContent,
  scoreContent,
  promoteContent,
  LabPromoter,
} from '@ninja/forge-lab';

// Installer (Gentle AI-compatible orchestration pipeline)
import { AgentInstaller } from '@ninja/installer';
import type { ClientId } from '@ninja/roster';

const log = createLogger('kage-runtime:server');

/** Orígenes locales permitidos para CORS — nunca wildcard en runtime local */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3141',
  'http://127.0.0.1:3141',
];

/**
 * Identidad real del approver derivada de la key autenticada (Ley 6 — doble
 * aprobación trazable). Antes se hardcodeaba `api-user/admin`, lo que hacía
 * imposible saber quién aprobó y permitía que cualquier key aprobara como
 * "admin" anónimo.
 */
function deriveApprover(request: FastifyRequest): ApproverIdentity {
  const raw = request.headers['x-ninja-key'];
  const key = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  const fingerprint = createHash('sha256').update(key).digest('hex').slice(0, 12);
  return { id: `operator-${fingerprint}`, role: 'operator' };
}

export async function createServer(): Promise<FastifyInstance> {
  // Re-parse env to get typed values — already validated by loadEnv() at boot (ADR-0004)
  const env = parseEnv(process.env as Record<string, string | undefined>);

  // Idempotencia en tests/arranques múltiples: el registro de shutdown es por-proceso.
  clearShutdownSteps();

  const server = fastify({ logger: false }); // logging gestionado por @ninja/logging

  // ── Security headers (WP-C4c / F2.6, ADR-0012) ─────────────────────────────
  // CSP deshabilitada: el runtime sirve API/WS, no HTML propio (el dashboard es
  // forge-console/Next.js, que gestiona sus cabeceras).
  await server.register(helmet, { contentSecurityPolicy: false });

  // ── Rate limiting (WP-C4c / F2.6, ADR-0012) ────────────────────────────────
  // Global: 100 req/min por X-Ninja-Key (o IP en rutas públicas).
  // /api/shell/execute: 10/min (route-level override) — ejecución de comandos.
  await server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      const raw = request.headers['x-ninja-key'];
      const key = Array.isArray(raw) ? raw[0] : raw;
      return key ?? request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
      message: `Rate limit of ${context.max} requests per ${context.after} exceeded.`,
    }),
  });

  // ── CORS ────────────────────────────────────────────────────────────────────
  await server.register(cors, {
    origin: (origin, callback) => {
      // Permitir requests sin origin (curl, Postman, mismo proceso)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS bloqueado para origin: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Ninja-Key'],
    credentials: true,
  });

  // ── WebSocket ────────────────────────────────────────────────────────────────
  await server.register(websocketPlugin);

  // ── API Key auth (WP-B11) ────────────────────────────────────────────────────
  // /health/ready es público: probe de infraestructura, solo expone booleanos (WP-C3a).
  const PUBLIC_PATHS = ['/health', '/health/ready', '/api/status', '/status'];
  const authDisabled = process.env.NINJA_AUTH_DISABLED === 'true';
  const runtimeKey = authDisabled ? null : getOrCreateRuntimeKey();

  if (!authDisabled) {
    server.addHook('onRequest', async (request, reply) => {
      if (PUBLIC_PATHS.some((p) => request.url === p || request.url.startsWith(p + '?'))) return;
      if (request.url.startsWith('/ws/')) return;
      const key = request.headers['x-ninja-key'];
      if (key !== runtimeKey) {
        const err = new AuthError('Missing or invalid X-Ninja-Key header');
        return reply
          .status(401)
          .send(sanitizeError(err, env.NODE_ENV as 'production' | 'development' | 'test'));
      }
    });
  }

  // ── Global Error Handler (WP-C1) ───────────────────────────────────────────────
  registerErrorHandlers(server, env.NODE_ENV as 'production' | 'development' | 'test');

  // ── Health & Status ──────────────────────────────────────────────────────────
  // GET /health y GET /health/ready se registran más abajo (registerHealthRoutes,
  // WP-C3a) una vez que la DB y el env validado están disponibles.
  server.get('/api/status', async (_request, _reply): Promise<RuntimeStatus> => {
    log.debug('Status check requested');
    return {
      status: 'running',
      version: RUNTIME_VERSION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // Alias para compatibilidad hacia atrás
  server.get('/status', async (_request, _reply): Promise<RuntimeStatus> => {
    return {
      status: 'running',
      version: RUNTIME_VERSION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // ── Event Bus Routes ─────────────────────────────────────────────────────────
  registerBusRoutes(server);

  // ── Engine Dependencies ──────────────────────────────────────────────────────
  const arsenalRegistry = bootstrapArsenal();
  log.info('Arsenal Registry initialized');

  // Inicializar Base de Datos (usando ruta global por defecto)
  const dbPath = path.join(getNinjaGlobalDir(), 'ninja.db');
  const db = initDb(dbPath);
  log.info(`Storage Database initialized at ${dbPath}`);

  // Ejecutar migraciones
  log.info('Running database migrations...');
  runMigrations(db, WORKSPACE_MIGRATIONS);

  // ── Health granular (WP-C3a): liveness + readiness con probes reales ────────
  registerHealthRoutes(server, {
    db,
    env: { LLM_BASE_URL: env.LLM_BASE_URL, LLM_API_KEY: env.LLM_API_KEY },
    expectedMigrations: WORKSPACE_MIGRATIONS.length,
  });
  log.info('Granular health routes registered (/health, /health/ready)');

  // Inicializar Repositories del Trace Ledger
  const sessionRepo = new SessionRepository(db);
  const runRepo = new RunRepository(db);
  const artifactRepo = new ArtifactRepository(db);
  const agentCommitRepo = new AgentCommitRepository(db);

  // ── LLM Integration ────────────────────────────────────────────────────────
  const llmRegistry = LLMRegistry.getInstance();

  // Registrar proveedor por defecto (usando OpenAI como base si no hay nada)
  const providerId =
    (process.env.LLM_PROVIDER as import('@ninja/integrations-llm').LLMProvider) || 'openai';
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env['LLM_API_KEY']!; // validated by loadEnv() at boot (ADR-0004)

  try {
    llmRegistry.register(providerId, baseUrl, apiKey);
    log.info(`LLM Registry: Registered provider "${providerId}" at ${baseUrl}`);
  } catch (err) {
    log.warn(
      `LLM Registry: Provider "${providerId}" already registered or error during registration`
    );
  }

  const llmClient = llmRegistry.get(providerId);
  log.info(`LLM Integration active with provider: ${providerId}`);

  // ── Phase 5: Intelligence & Memory Initialization ─────────────────────────
  log.info('Initializing Phase 5: Intelligence & Memory...');

  // 1. Storage Clients (Engram & LightRAG)
  // engramClient is already initialized as a singleton in the package
  const lightragClient = new LightRAGClient(
    process.env.LIGHTRAG_API_URL || 'http://localhost:8000'
  );

  // 2. Vault & Memory
  const agentNamespaceManager = new AgentNamespaceManager();
  const hotMemoryProvider: IHotMemoryProvider = {
    getEntries: async (agentId, sessionId) => {
      // Intentar obtener el namespace actual de la memoria volátil
      const ns = agentNamespaceManager.getNamespace(agentId, sessionId, '');
      return ns?.hotMemory || [];
    },
  };

  const vaultCoordinator = new VaultCoordinator({
    engram: engramClient,
    lightrag: lightragClient,
    traceLedger: { artifactRepository: artifactRepo },
    hotMemoryProvider,
    eventBus,
  });

  // 3. Model Gateway (Selección Inteligente)
  const mc = ModelCatalog.getInstance();
  const modelBudgetManager = BudgetManager.getInstance(eventBus);
  const modelSelector = new ModelSelector(mc, eventBus);
  const fallbackChain = FallbackChain.getInstance(eventBus); // WP-B3: FallbackChain for LLM retry

  const strategyEngine = createStrategyEngine({
    selector: modelSelector,
    catalog: mc,
    budget: modelBudgetManager,
    eventBus,
  });

  // 4. Learning Loop
  const learningHarvester = new LearningHarvester({
    runRepository: runRepo,
    artifactRepository: artifactRepo,
    sessionRepository: sessionRepo,
    eventBus,
  });
  const learningEvaluator = new LearningEvaluator({ eventBus });
  const learningPromoter = new LearningPromoter(engramClient, eventBus);

  log.info('Intelligence & Memory modules initialized successfully');

  // Inicializar Executors para Workflow y Agentes
  const workflowExecutor = new WorkflowExecutor(eventBus, runRepo, artifactRepo);
  const agentExecutor = new AgentExecutor(
    llmClient,
    arsenalRegistry,
    eventBus,
    runRepo,
    artifactRepo,
    log,
    modelSelector,
    fallbackChain, // FallbackChain wired (WP-B3 / ADR-0003)
    env.NINJA_LLM_FAIL_MODE, // Feature flag from validated env (ADR-0003)
    modelBudgetManager, // BudgetManager for pre-call enforcement (WP-B4)
    env.NINJA_SESSION_TOKEN_BUDGET, // Per-session token budget (WP-B4)
    agentCommitRepo // RF-16: persist agent commits for /api/commits and /commits page
  );

  // ── Kage Engine ──────────────────────────────────────────────────────────────
  const engine = new KageEngine(
    llmClient,
    workflowExecutor,
    agentExecutor,
    arsenalRegistry,
    sessionRepo,
    runRepo,
    artifactRepo,
    eventBus,
    log
  );
  log.info('Kage Engine initialized');

  // ── Roster, Router & Failover (Always-On Multi-Client Integration) ──
  const rosterManager = new RosterManager();
  rosterManager.unlock();
  rosterManager.detectAndSync();

  server.get('/api/roster', async (_request, reply) => {
    return reply.send(rosterManager.getRoster());
  });

  server.post('/api/roster/assign', async (request, reply) => {
    const parsed = RosterAssignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }
    const { clientId, role } = parsed.data;
    try {
      rosterManager.assignRole(clientId as any, role as any);
      return reply.send({ success: true });
    } catch (err) {
      if (clientId.startsWith('agent-')) {
        log.info(`Mocking roster assignment for UI agent: ${clientId} to ${role}`);
        return reply.send({ success: true });
      }
      return reply
        .status(400)
        .send(sanitizeError(err, env.NODE_ENV as 'production' | 'development' | 'test'));
    }
  });

  const delegationRouter = new DelegationRouter({
    rosterManager,
    vaultCoordinator,
    eventBus,
  });

  const failoverManager = new FailoverManager(rosterManager);
  failoverManager.start();

  // ── Pulse Center & Sentinel ──────────────────────────────────────────────────
  // Repos de persistencia Pulse/Audit (WP-C4b / F2.5) — misma DB global de storage
  const pulseMetricRepo = new PulseMetricRepository(db);
  const auditLogRepo = new AuditLogRepository(db);

  const pulseMonitor = new PulseMonitor(eventBus, {
    stabilityThreshold: 60,
    contextEfficiencyThreshold: 40,
    persistMetric: (entry) => pulseMetricRepo.insert(entry),
  });
  pulseMonitor.start();
  setDashboardMonitor(pulseMonitor);
  log.info('Pulse Center Monitor started');

  const policyEngine = new PolicyEngine(log);
  policyEngine.registerPolicy({
    id: crypto.randomUUID() as any,
    name: 'Block external execution by default',
    description: 'Requires approval to execute shell commands',
    actionType: 'shell.execute',
    action: 'require-approval',
    priority: 10,
  });

  // Register policy for git commits
  policyEngine.registerPolicy({
    id: 'git.commit.policy',
    name: 'Require approval for git commits',
    description: 'All git commits require Sentinel approval',
    actionType: 'git.commit',
    action: 'require-approval',
    priority: 20,
  });

  const approvalManager = new ApprovalManager(eventBus, log);
  const auditor = new Auditor(eventBus, log, (entry) => auditLogRepo.insert(entry));
  auditor.start();

  const guardian = new Guardian(eventBus, log, approvalManager, policyEngine);
  guardian.start();

  log.info('Sentinel System started');

  // ── Shutdown Registry (WP-C4a / F2.4) ─────────────────────────────────────
  // Orden dictado por el plan: WS/HTTP → Executor/Failover → Pulse → Auditor
  // (flush) → Engram → SQLite (última). WS/HTTP lo cierra lifecycle.ts
  // directamente (server.close()); aquí registramos el resto en orden.
  registerShutdownStep('failover-manager', () => failoverManager.stop());
  registerShutdownStep('pulse-monitor', () => pulseMonitor.stop());
  registerShutdownStep('sentinel-auditor', () => auditor.stop());
  registerShutdownStep('engram-warm-memory', () => engramClient.close());
  registerShutdownStep('sqlite-db', () => {
    closeDb(db);
    log.info('SQLite database closed (last step)');
  });
  log.info(
    `Shutdown steps registered: ${getShutdownSteps()
      .map((s) => s.name)
      .join(' → ')}`
  );

  const httpController = new HttpController(engine, async (workspaceId: string) => {
    try {
      return requireActiveContext();
    } catch (err) {
      log.warn(`No active workspace found in runtime memory, using fallback for ${workspaceId}`);
      return {
        sessionId: crypto.randomUUID(),
        workspace: {
          id: workspaceId || 'default-workspace',
          name: 'Fallback Workspace',
          path: process.cwd(),
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        dbPath: '',
        ninjaDir: '',
      } as any;
    }
  });

  // ── Engine Routes ─────────────────────────────────────────────────────────
  registerMcpRuntimeRoutes(server, {
    rosterManager,
    delegationRouter,
    vaultCoordinator,
    engine,
  });

  /**
   * Canal WS de eventos en tiempo real.
   */
  server.get('/ws/events', { websocket: true }, (socket, _request) => {
    log.info('WebSocket client connected to /ws/events');

    // WP-B11: WS auth — first message must be { action: 'auth', key }
    let authenticated = authDisabled;

    const authTimeout = authDisabled
      ? null
      : setTimeout(() => {
          if (!authenticated) {
            socket.close(1008, 'Auth timeout: send auth handshake within 5s');
          }
        }, 5000);

    let busSubscription: { unsubscribe: () => void } | null = null;

    const subscribe = () => {
      busSubscription = eventBus.on('*', (event: NinjaEvent) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      });
    };

    const unsubscribe = () => busSubscription?.unsubscribe();

    if (authDisabled) {
      subscribe();
    }

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (!authenticated) {
          if (msg.action === 'auth' && msg.key === runtimeKey) {
            authenticated = true;
            if (authTimeout) clearTimeout(authTimeout);
            socket.send(JSON.stringify({ type: 'auth.ok' }));
            subscribe();
          } else {
            socket.close(1008, 'Invalid auth');
          }
          return;
        }

        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        } else if (msg.action === 'interview:answers') {
          if (typeof (engine as any).submitAnswers === 'function') {
            (engine as any).submitAnswers(msg.payload);
          } else {
            log.warn('engine.submitAnswers no está implementado aún en KageEngine');
          }
        }
      } catch (err) {
        log.debug('Failed to parse WS message', err);
      }
    });

    socket.on('close', () => {
      if (authTimeout) clearTimeout(authTimeout);
      unsubscribe();
      log.info('WebSocket client disconnected from /ws/events');
    });

    socket.on('error', (err: Error) => {
      if (authTimeout) clearTimeout(authTimeout);
      unsubscribe();
      log.error('WebSocket error in /ws/events', err);
    });
  });

  server.post('/api/engine/interview', async (request, reply) => {
    const id = crypto.randomUUID();
    if (typeof (engine as any).startInterview === 'function') {
      await (engine as any).startInterview(id);
    }
    return reply.send({ id, status: 'started' });
  });

  server.post('/api/engine/interview/:id/answers', async (request, reply) => {
    const id = (request.params as any).id;
    const answers = request.body;
    if (typeof (engine as any).submitAnswers === 'function') {
      await (engine as any).submitAnswers(id, answers);
    }
    return reply.send({ success: true });
  });

  server.post('/engine/submit', async (request, reply) => {
    const parsed = EngineSubmitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }
    const result = await httpController.handleSubmit({ body: parsed.data as any });
    if (env.NINJA_SESSION_TOKEN_BUDGET && result.body && (result.body as any).sessionId) {
      modelBudgetManager.setSessionBudget(
        (result.body as any).sessionId,
        env.NINJA_SESSION_TOKEN_BUDGET
      );
    }
    return reply.status(result.status).send(result.body);
  });

  server.get('/engine/run/:id', async (request, reply) => {
    const result = await httpController.handleGetRunStatus({
      params: { id: (request.params as any).id },
    });
    return reply.status(result.status).send(result.body);
  });

  server.post('/engine/run/:id/approve', async (request, reply) => {
    const result = await httpController.handleApprove({
      params: { id: (request.params as any).id },
      body: request.body as any,
    });
    return reply.status(result.status).send(result.body);
  });

  server.post('/engine/run/:id/pause', async (request, reply) => {
    const result = await httpController.handlePause({
      params: { id: (request.params as any).id },
    });
    return reply.status(result.status).send(result.body);
  });

  server.post('/engine/run/:id/resume', async (request, reply) => {
    const result = await httpController.handleResume({
      params: { id: (request.params as any).id },
    });
    return reply.status(result.status).send(result.body);
  });

  server.post('/engine/run/:id/cancel', async (request, reply) => {
    const result = await httpController.handleCancel({
      params: { id: (request.params as any).id },
    });
    return reply.status(result.status).send(result.body);
  });

  server.get('/engine/runs', async (request, reply) => {
    const result = await httpController.handleListActiveRuns({});
    return reply.status(result.status).send(result.body);
  });

  // ── Pulse Center & Sentinel Routes ──────────────────────────────────────────────
  server.get('/api/health/pulse', async (_request, reply) => {
    try {
      const data = getDashboardData();
      return reply.send(data);
    } catch (err: any) {
      return reply
        .status(500)
        .send(sanitizeError(err, env.NODE_ENV as 'production' | 'development' | 'test'));
    }
  });

  server.get('/api/approvals', async (_request, reply) => {
    const list = approvalManager.listPendingApprovals();
    return reply.send(list);
  });

  server.post('/api/approvals/:id/approve', async (request, reply) => {
    const id = (request.params as any).id;
    const body = (request.body as { notes?: string }) || {};
    const approver = deriveApprover(request);
    await approvalManager.approveRequest(id as any, approver, body.notes);
    return reply.send({ success: true });
  });

  server.post('/api/approvals/:id/reject', async (request, reply) => {
    const id = (request.params as any).id;
    const body = request.body as { reason: string };
    if (!body?.reason) return reply.status(400).send({ error: 'reason is required' });
    const approver = deriveApprover(request);
    await approvalManager.rejectRequest(id as any, approver, body.reason);
    return reply.send({ success: true });
  });

  server.get('/api/audit', async (_request, reply) => {
    const logs = auditor.getAuditLog();
    return reply.send(logs);
  });

  // ── Agent Commits Routes (RF-16) ──────────────────────────────────────────
  server.get('/api/commits', async (request, reply) => {
    const { runId, limit } = request.query as { runId?: string; limit?: string };
    const lim = limit ? parseInt(limit) : 100;
    if (runId) {
      return reply.send(agentCommitRepo.findByRunId(runId));
    }
    return reply.send(agentCommitRepo.findAll(lim));
  });

  // ── Arsenal Registry Route (S3.4) ─────────────────────────────────────────
  server.get('/api/arsenal', async (_request, reply) => {
    return reply.send({
      tools: arsenalRegistry.listTools(),
      skills: arsenalRegistry.listSkills(),
    });
  });

  // ── Artifacts Routes ───────────────────────────────────────────────────────
  server.get('/api/artifacts', async (request, reply) => {
    const { runId, type, isAnchor } = request.query as any;
    let list = artifactRepo.findAll();

    if (runId) {
      list = list.filter((a: any) => a.runId === runId);
    }
    if (type) {
      list = list.filter((a: any) => a.type === type);
    }
    if (isAnchor === 'true') {
      // WP-B8: los anchors se persisten con type 'anchor' (la tabla artifacts no tiene columna isAnchor)
      list = list.filter((a: any) => a.type === 'anchor');
    }

    return reply.send(list);
  });

  server.get('/api/artifacts/:id', async (request, reply) => {
    const id = (request.params as any).id;
    const artifact = artifactRepo.findById(id);
    if (!artifact) {
      return reply.status(404).send({ error: 'Artifact not found' });
    }
    return reply.send(artifact);
  });

  // ── Engine Routes ───────────────────────────────────────────────────────── (No changes inside)

  // ── Phase 5: Vault & Intelligence Routes ──────────────────────────────────
  interface VaultContextQuery {
    q: string;
    sessionId: string;
    agentId?: string;
    layers?: string;
    budget?: string;
  }

  server.get<{ Querystring: VaultContextQuery }>('/api/vault/context', async (request, reply) => {
    const { q, sessionId, agentId, layers, budget } = request.query;
    if (!q || !sessionId) {
      return reply.status(400).send({ error: 'Query (q) and sessionId are required' });
    }

    const results = await vaultCoordinator.query({
      agentId: agentId || 'guest',
      sessionId,
      query: q,
      layers: layers ? (layers.split(',') as any[]) : ['HOT', 'WARM', 'COLD'],
      tokenBudget: budget ? parseInt(budget) : 2000,
    });
    return reply.send(results);
  });

  server.post('/api/vault/write', async (request, reply) => {
    const parsed = VaultWriteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }
    const { agentId, sessionId, content, layer } = parsed.data;
    await vaultCoordinator.write(agentId ?? 'guest', sessionId, content, layer as any);
    return reply.send({ success: true });
  });

  server.get('/api/model-gateway/status', async (_request, reply) => {
    return reply.send({
      catalogSize: mc.getAll().length,
      activeStrategy: 'dynamic-hybrid',
      stats: modelBudgetManager.getGlobalUsage(),
    });
  });

  server.get('/api/budget/status', async (request, reply) => {
    const { sessionId } = request.query as { sessionId?: string };
    return reply.send({
      global: modelBudgetManager.getGlobalUsage(),
      session: sessionId ? (modelBudgetManager.getSessionSummary(sessionId) ?? null) : null,
      limit: env.NINJA_SESSION_TOKEN_BUDGET ?? null,
    });
  });

  server.get('/api/learning/candidates', async (_request, reply) => {
    const candidates = await learningHarvester.harvest(7);
    return reply.send(candidates);
  });

  server.post<{ Params: { id: string } }>('/api/learning/promote/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      // 1. Obtener candidatos recientemente cosechados
      const candidates = await learningHarvester.harvest(30);
      const candidate = candidates.find((c) => c.runId === id);

      if (!candidate)
        return reply.status(404).send({ error: 'Candidate not found in recent runs' });

      // 2. Evaluar
      const report = learningEvaluator.evaluate(candidate);

      // 3. Promocionar (si el reporte lo recomienda)
      const result = await learningPromoter.promote(report, candidate);

      if (!result.success) {
        return reply.status(500).send({ error: result.error.message });
      }

      return reply.send({
        success: true,
        promoted: report.recommendPromotion,
        score: report.totalScore,
      });
    } catch (err) {
      return reply
        .status(500)
        .send(sanitizeError(err, env.NODE_ENV as 'production' | 'development' | 'test'));
    }
  });

  // ── Phase 8: External Integrations & Forge Lab ──────────────────────────
  log.info('Initializing Phase 8 routes: Integrations & Forge Lab');

  // Integrations-Shell Routes (rate limit estricto: 10/min — WP-C4c / F2.6)
  server.post(
    '/api/shell/execute',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const parsed = ShellExecuteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request body',
          code: 'VALIDATION_ERROR',
          issues: parsed.error.issues,
        });
      }
      const { cmd, args, cwd } = parsed.data;
      const shellCommand: ShellCommand = { cmd, args, cwd };
      const validation = validateCommand(shellCommand);
      if (!validation.allowed) {
        return reply.status(403).send({ error: validation.reason });
      }
      const result = await executeCommand(shellCommand);
      return reply.send(result);
    }
  );

  // Integrations-Git Routes
  server.get('/api/git/status', async (request, reply) => {
    const { repoPath } = request.query as { repoPath?: string };
    const git = new GitClient(repoPath || process.cwd());
    try {
      if (!(await git.isGitRepo())) {
        return reply.status(400).send({ error: 'Not a git repository' });
      }
      const result = await git.run(['status', '--porcelain', '-b']);
      return reply.send({ rawStatus: result.stdout });
    } catch (err) {
      return reply
        .status(500)
        .send(sanitizeError(err, env.NODE_ENV as 'production' | 'development' | 'test'));
    }
  });

  server.get('/api/git/log', async (request, reply) => {
    const { repoPath, limit } = request.query as { repoPath?: string; limit?: string };
    const git = new GitClient(repoPath || process.cwd());
    const result = await git.run(['log', `-n`, limit || '20', '--oneline']);
    return reply.send({ rawLog: result.stdout });
  });

  server.post('/api/git/commit', async (request, reply) => {
    const parsed = GitCommitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }
    const { message, repoPath } = parsed.data;
    try {
      const approvalResult = await approvalManager.createApprovalRequest({
        runId: crypto.randomUUID(),
        agentId: 'kage-runtime',
        actionType: 'git.commit',
        actionSummary: `Git commit: "${message}"`,
        technicalDetails: JSON.stringify({ repoPath, message }),
        policyId: 'git.commit.policy',
      });
      if (!approvalResult.approved) {
        return reply
          .status(403)
          .send({ error: 'Commit rejected by Sentinel policy', notes: approvalResult.notes });
      }
      const git = new GitClient(repoPath || process.cwd());
      await commit(git, message);
      return reply.send({
        success: true,
        message: 'Commit created successfully',
        repoPath: repoPath || process.cwd(),
      });
    } catch (err) {
      return reply
        .status(500)
        .send(sanitizeError(err, env.NODE_ENV as 'production' | 'development' | 'test'));
    }
  });

  // Integrations-FS Routes
  server.get('/api/fs/scan', async (request, reply) => {
    const { dirPath } = request.query as { dirPath?: string };
    const results = await scanDirectory(dirPath || process.cwd());
    return reply.send(results);
  });

  // Forge Lab Routes
  server.post('/api/forgelab/analyze', async (request, reply) => {
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ error: 'GitHub URL is required' });

    try {
      const analyzer = new RepoAnalyzer(httpRequest);
      const analysis = await analyzer.analyzeGitHubRepo(url);

      const extractor = new ContentExtractor(httpRequest);
      const extracted = await extractor.extractRelevantFiles(analysis, {
        targetTypes: ['skill', 'pattern'],
      });

      const pipelineResults = await Promise.all(
        extracted.map(async (e) => {
          const norm = normalizeContent(e);
          const score = scoreContent(norm);
          // Use LabPromoter for database persistence
          const labPromoter = new LabPromoter(artifactRepo, crypto.randomUUID(), eventBus, log);
          const promo = await labPromoter.promoteContent(norm, score);
          return { file: e.sourcePath, score, promoted: promo.promoted };
        })
      );

      return reply.send({ analysis, pipelineResults });
    } catch (err) {
      return reply
        .status(500)
        .send(sanitizeError(err, env.NODE_ENV as 'production' | 'development' | 'test'));
    }
  });

  server.get('/api/forgelab/results', async (_request, reply) => {
    // Temporary stub, would realistically query TraceLedger/Storage
    return reply.send({ runs: [] });
  });

  log.info('Kage Engine and Phase 5/8 routes registered');

  // ── Session Routes ─────────────────────────────────────────────────────────

  server.post('/api/session/init', async (request, reply) => {
    try {
      const workspaceId = 'default-workspace';
      const session = sessionRepo.create({
        workspaceId,
        startedAt: new Date().toISOString(),
      });

      await engramClient.recordObservation(
        'session.init',
        `Initialized blank session ${session.id} for workspace ${workspaceId}`
      );

      return reply.send({ sessionId: session.id, status: 'initialized' });
    } catch (err: any) {
      log.error('Failed to init session', err);
      return reply
        .status(500)
        .send(sanitizeError(err, env.NODE_ENV as 'production' | 'development' | 'test'));
    }
  });

  server.get('/api/session/list', async (_request, reply) => {
    const sessions =
      typeof (sessionRepo as any).findAll === 'function' ? (sessionRepo as any).findAll() : [];
    return reply.send(sessions);
  });

  server.post('/api/session/restore/:id', async (request, reply) => {
    const id = (request.params as any).id;
    try {
      const session = sessionRepo.findById(id);
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      await engramClient.recordObservation('session.restore', `Restored session ${id}`);
      return reply.send({ sessionId: id, status: 'restored' });
    } catch (err: any) {
      log.error('Failed to restore session', err);
      return reply
        .status(500)
        .send(sanitizeError(err, env.NODE_ENV as 'production' | 'development' | 'test'));
    }
  });

  // ── Dashboard & Settings Routes ────────────────────────────────────────────

  server.get('/api/dashboard', async (_request, reply) => {
    try {
      const pulseData = getDashboardData();
      const pendingApprovals = approvalManager.listPendingApprovals();
      const activeRuns =
        typeof (engine as any).getActiveRuns === 'function' ? (engine as any).getActiveRuns() : [];

      // Get recent tasks from runs
      const recentTasks =
        typeof (runRepo as any).findRecent === 'function' ? (runRepo as any).findRecent(20) : [];

      return reply.send({
        systemState: 'running',
        runsActive: Array.isArray(activeRuns) ? activeRuns.length : 0,
        agentsActive: (pulseData as any)?.agentMetrics?.activeCount ?? 0,
        pendingApprovals: pendingApprovals.length,
        recentTasks: recentTasks,
        pulse: pulseData,
        uptime: process.uptime(),
        version: RUNTIME_VERSION,
      });
    } catch (err: any) {
      log.warn('Dashboard endpoint error, returning defaults', err);
      return reply.send({
        systemState: 'running',
        runsActive: 0,
        agentsActive: 0,
        pendingApprovals: 0,
        recentTasks: [],
        pulse: null,
        uptime: process.uptime(),
        version: RUNTIME_VERSION,
      });
    }
  });

  server.get('/api/settings/providers', async (_request, reply) => {
    try {
      const registry = LLMRegistry.getInstance();
      const providers =
        typeof (registry as any).getAll === 'function' ? (registry as any).getAll() : [];
      return reply.send(providers);
    } catch (err: any) {
      // Return current env-configured provider as fallback
      return reply.send([
        {
          id: providerId,
          name: providerId,
          baseUrl: baseUrl,
          models: [process.env.LLM_DEFAULT_MODEL || 'unknown'],
          isActive: true,
        },
      ]);
    }
  });

  server.get('/api/settings/workspace', async (_request, reply) => {
    try {
      const ctx = requireActiveContext();
      return reply.send({
        name: ctx.workspace?.name || 'ninja-ai-framework',
        path: ctx.workspace?.path || process.cwd(),
        createdAt: ctx.workspace?.createdAt || new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      });
    } catch {
      return reply.send({
        name: 'ninja-ai-framework',
        path: process.cwd(),
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      });
    }
  });

  // ── Installer Routes (Gentle AI-compatible orchestration pipeline) ──────────
  // These routes mirror Gentle AI's install/sync/uninstall/doctor commands
  // but expose them as REST endpoints for the Kage Runtime server.

  const agentInstaller = new AgentInstaller();

  // POST /api/install/:agentId — install Ninja into a specific agent
  server.post<{ Params: { agentId: string } }>('/api/install/:agentId', async (request, reply) => {
    const { agentId } = request.params;
    const result = await agentInstaller.install(agentId as ClientId, {
      backup: true,
      verify: true,
    });
    return reply.status(result.success ? 200 : 400).send(result);
  });

  // POST /api/install/all — install Ninja into all detected agents
  server.post('/api/install/all', async (_request, reply) => {
    const results = await agentInstaller.installAll({ backup: true, verify: true });
    return reply.send({
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  });

  // POST /api/sync/:agentId — sync Ninja files to a specific agent
  server.post<{ Params: { agentId: string } }>('/api/sync/:agentId', async (request, reply) => {
    const { agentId } = request.params;
    const result = await agentInstaller.sync(agentId as ClientId);
    return reply.send(result);
  });

  // DELETE /api/install/:agentId — uninstall Ninja from a specific agent
  server.delete<{ Params: { agentId: string }; Querystring: { restore?: string } }>(
    '/api/install/:agentId',
    async (request, reply) => {
      const { agentId } = request.params;
      const restoreBackup = request.query.restore === 'true';
      const result = await agentInstaller.uninstall(agentId as ClientId, restoreBackup);
      return reply.send(result);
    }
  );

  // GET /api/install/:agentId/verify — verify agent config
  server.get<{ Params: { agentId: string } }>(
    '/api/install/:agentId/verify',
    async (request, reply) => {
      const { agentId } = request.params;
      const report = await agentInstaller.verify(agentId as ClientId);
      return reply.send(report);
    }
  );

  // GET /api/doctor — verify all detected agents (Ninja doctor)
  server.get('/api/doctor', async (_request, reply) => {
    const { detectAllClients } = await import('@ninja/roster');
    const detected = detectAllClients();
    const reports = await Promise.all(
      Object.keys(detected).map((id) => agentInstaller.verify(id as ClientId))
    );
    return reply.send({
      total: reports.length,
      passed: reports.filter((r) => r.passed).length,
      failed: reports.filter((r) => !r.passed).length,
      reports,
    });
  });

  // GET /api/roster/verify — verify ALL known agents (including undetected)
  registerRosterVerifyRoute(server, { agentInstaller });

  log.info('Installer routes registered: /api/install, /api/sync, /api/doctor, /api/roster/verify');

  return server;
}
