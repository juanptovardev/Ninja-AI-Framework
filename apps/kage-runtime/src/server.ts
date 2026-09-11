import fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocketPlugin from '@fastify/websocket';
import { AuthError } from '@ninja/contracts';
import { createLogger } from '@ninja/logging';
import { eventBus } from '@ninja/events';
import { parseEnv } from './env-schema.js';
import { sanitizeError } from './sanitize-error.js';
import { getOrCreateRuntimeKey } from './auth-key.js';
import { registerBusRoutes } from './bus-router.js';
import { registerErrorHandlers } from './error-handler.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerStatusRoutes } from './routes/status.routes.js';
import { registerRosterRoutes } from './routes/roster.routes.js';
import { registerWsEventsRoutes } from './routes/ws-events.routes.js';
import { registerPulseRoutes } from './routes/pulse.routes.js';
import { registerVaultRoutes } from './routes/vault.routes.js';
import { registerModelGatewayRoutes } from './routes/model-gateway.routes.js';
import { registerLearningRoutes } from './routes/learning.routes.js';
import { registerIntegrationsRoutes } from './routes/integrations.routes.js';
import { registerForgeLabRoutes } from './routes/forge-lab.routes.js';
import { registerSessionRoutes } from './routes/session.routes.js';
import { registerDashboardRoutes } from './routes/dashboard.routes.js';
import { registerInstallerRoutes } from './routes/installer.routes.js';
import { registerEngineRoutes } from './routes/engine.routes.js';
import { registerApprovalsRoutes } from './routes/approvals.routes.js';
import { registerArsenalRoutes } from './routes/arsenal.routes.js';
import { registerShutdownStep, getShutdownSteps, clearShutdownSteps } from './shutdown-registry.js';
import { closeDb, initDb, runMigrations } from '@ninja/storage';
import { registerRequestLogging } from './request-logging.js';
import { KageEngine, HttpController } from '@ninja/kage-engine';
import { bootstrap as bootstrapArsenal } from '@ninja/arsenal-registry';
import { requireActiveContext, WORKSPACE_MIGRATIONS } from '@ninja/workbench';
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
import { getNinjaGlobalDir } from '@ninja/config';
import { LLMRegistry } from '@ninja/integrations-llm';
import { PulseMonitor, setDashboardMonitor } from '@ninja/pulse-center';
import { RosterManager } from '@ninja/roster';
import { DelegationRouter } from '@ninja/delegation-router';
import type { ClientId } from '@ninja/roster';
import { registerMcpRuntimeRoutes } from './mcp-runtime-server.js';
import { FailoverManager } from './failover.js';
import { PolicyEngine, ApprovalManager, Auditor, Guardian } from '@ninja/sentinel';
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

// Installer (Gentle AI-compatible orchestration pipeline)
import { AgentInstaller } from '@ninja/installer';

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

export async function createServer(): Promise<FastifyInstance> {
  // Re-parse env to get typed values — already validated by loadEnv() at boot (ADR-0004)
  const env = parseEnv(process.env as Record<string, string | undefined>);

  // Idempotencia en tests/arranques múltiples: el registro de shutdown es por-proceso.
  clearShutdownSteps();

  // correlationId por request (Manual §7.2) — usado por request-logging y disponible
  // para cualquier handler vía request.id.
  const server = fastify({
    logger: false, // logging gestionado por @ninja/logging (JSON §7.1) + request-logging
    genReqId: () => crypto.randomUUID(),
  });

  const nodeEnv = env.NODE_ENV;

  // ── Request logging (WP-F2.7): access log mínimo con correlationId ─────────
  registerRequestLogging(server, { skipPaths: ['/health'] });

  // ── Security headers (WP-C4c / F2.6, ADR-0012) ─────────────────────────────
  await server.register(helmet, { contentSecurityPolicy: false });

  // ── Rate limiting (WP-C4c / F2.6, ADR-0012) ────────────────────────────────
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
        return reply.status(401).send(sanitizeError(err, nodeEnv));
      }
    });
  }

  // ── Global Error Handler (WP-C1) ───────────────────────────────────────────────
  registerErrorHandlers(server, nodeEnv);

  // ── Status & Event Bus ──────────────────────────────────────────────────────
  registerStatusRoutes(server);
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
  const lightragClient = new LightRAGClient(
    process.env.LIGHTRAG_API_URL || 'http://localhost:8000'
  );

  // Vault & Memory
  const agentNamespaceManager = new AgentNamespaceManager();
  const hotMemoryProvider: IHotMemoryProvider = {
    getEntries: async (agentId, sessionId) => {
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

  // Model Gateway (Selección Inteligente)
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

  // Learning Loop
  const learningHarvester = new LearningHarvester({
    runRepository: runRepo,
    artifactRepository: artifactRepo,
    sessionRepository: sessionRepo,
    eventBus,
  });
  const learningEvaluator = new LearningEvaluator({ eventBus });
  const learningPromoter = new LearningPromoter(engramClient, eventBus);

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

  // ── Roster, Router & Failover (Always-On Multi-Client Integration) ──
  const rosterManager = new RosterManager();
  rosterManager.unlock();
  rosterManager.detectAndSync();

  const delegationRouter = new DelegationRouter({
    rosterManager,
    vaultCoordinator,
    eventBus,
  });

  const failoverManager = new FailoverManager(rosterManager);
  failoverManager.start();

  // ── Pulse Center & Sentinel ──────────────────────────────────────────────────
  const pulseMetricRepo = new PulseMetricRepository(db);
  const auditLogRepo = new AuditLogRepository(db);

  const pulseMonitor = new PulseMonitor(eventBus, {
    stabilityThreshold: 60,
    contextEfficiencyThreshold: 40,
    persistMetric: (entry) => pulseMetricRepo.insert(entry),
  });
  pulseMonitor.start();
  setDashboardMonitor(pulseMonitor);

  const policyEngine = new PolicyEngine(log);
  policyEngine.registerPolicy({
    id: crypto.randomUUID(),
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
      };
    }
  });

  // ── MCP Runtime Routes ─────────────────────────────────────────────────────
  registerMcpRuntimeRoutes(server, {
    rosterManager,
    delegationRouter,
    vaultCoordinator,
    engine,
  });

  // ── WebSocket Events Channel ───────────────────────────────────────────────
  registerWsEventsRoutes(server, { engine, authDisabled, runtimeKey });

  // ── Engine Routes (WP-D4 1/2) ──────────────────────────────────────────────
  registerEngineRoutes(server, {
    engine,
    httpController,
    modelBudgetManager,
    sessionTokenBudget: env.NINJA_SESSION_TOKEN_BUDGET,
  });

  // ── Roster Routes ──────────────────────────────────────────────────────────
  registerRosterRoutes(server, { rosterManager, nodeEnv });

  // ── Approvals, Audit & Commits Routes (WP-D4 1/2) ─────────────────────────
  registerApprovalsRoutes(server, {
    approvalManager,
    auditor,
    agentCommitRepo,
  });

  // ── Arsenal, Artifacts & Vault-Write Routes (WP-D4 1/2) ───────────────────
  registerArsenalRoutes(server, {
    arsenalRegistry,
    artifactRepo,
    vaultCoordinator,
  });

  // ── Phase 5: Vault, Model Gateway & Learning Routes ────────────────────────
  registerVaultRoutes(server, { vaultCoordinator });
  registerModelGatewayRoutes(server, {
    modelCatalog: mc,
    modelBudgetManager,
    sessionTokenBudget: env.NINJA_SESSION_TOKEN_BUDGET,
  });
  registerLearningRoutes(server, {
    learningHarvester,
    learningEvaluator,
    learningPromoter,
    nodeEnv,
  });

  // ── Phase 8: Integrations, Forge Lab, Session, Dashboard & Installer ──────
  registerIntegrationsRoutes(server, { approvalManager, nodeEnv });
  registerForgeLabRoutes(server, { artifactRepo, nodeEnv });
  registerSessionRoutes(server, { sessionRepo, nodeEnv });
  registerDashboardRoutes(server, {
    engine,
    approvalManager,
    runRepo,
    providerId,
    baseUrl,
  });

  const agentInstaller = new AgentInstaller();
  registerInstallerRoutes(server, { agentInstaller });
  registerPulseRoutes(server, { nodeEnv });

  log.info('Kage Engine and Phase 5/8 routes registered');

  return server;
}
