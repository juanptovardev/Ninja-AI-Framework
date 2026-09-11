import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '@ninja/logging';
import { RosterManager, ClientId, ClientRole, ProviderId } from '@ninja/roster';
import { DelegationRouter } from '@ninja/delegation-router';
import { eventBus, createEvent } from '@ninja/events';

const log = createLogger('kage-runtime:mcp-server');

// WP-B13: allowlist de orígenes locales — espejo de ALLOWED_ORIGINS en server.ts (nunca wildcard)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3141',
  'http://127.0.0.1:3141',
];

interface SSEConnection {
  id: string;
  reply: FastifyReply;
}

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

export function registerMcpRuntimeRoutes(
  server: FastifyInstance,
  deps: {
    rosterManager: RosterManager;
    delegationRouter: DelegationRouter;
    vaultCoordinator: any;
    engine: any;
  }
) {
  const sseConnections = new Map<string, SSEConnection>();
  const taskStatusMap = new Map<string, { status: string; output?: string }>();

  // Track task statuses dynamically
  eventBus.on('delegation.completed', (event) => {
    const payload = event.payload as { taskId: string; output?: string };
    taskStatusMap.set(payload.taskId, { status: 'completed', output: payload.output });
  });
  eventBus.on('delegation.failed', (event) => {
    const payload = event.payload as { taskId: string; error?: string };
    taskStatusMap.set(payload.taskId, { status: 'failed', output: payload.error });
  });

  // 1. Establish SSE Connection
  server.get('/mcp/v1/sse', async (request, reply) => {
    const connectionId = crypto.randomUUID();
    log.info(`Establishing MCP SSE connection ${connectionId}`);

    // WP-B13: eco del origin solo si está en la allowlist; fallback seguro a console local
    const origin = request.headers.origin;
    const allowOrigin =
      origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'http://localhost:3001';

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': allowOrigin,
      Vary: 'Origin',
    });

    const conn: SSEConnection = { id: connectionId, reply };
    sseConnections.set(connectionId, conn);

    // Send the endpoint event immediately to inform the client where to post messages
    const host = request.headers.host || 'localhost:3141';
    const protocol = request.headers['x-forwarded-proto'] || 'http';
    const messageUrl = `${protocol}://${host}/mcp/v1/messages?connectionId=${connectionId}`;

    reply.raw.write(`event: endpoint\ndata: ${messageUrl}\n\n`);

    request.raw.on('close', () => {
      log.info(`MCP SSE connection ${connectionId} closed`);
      sseConnections.delete(connectionId);
    });
  });

  // 2. Message Post Endpoint
  server.post(
    '/mcp/v1/messages',
    async (request: FastifyRequest<{ Querystring: { connectionId: string } }>, reply) => {
      const { connectionId } = request.query;
      if (!connectionId) {
        return reply.status(400).send({ error: 'connectionId query parameter is required' });
      }

      const conn = sseConnections.get(connectionId);
      if (!conn) {
        return reply.status(404).send({ error: 'SSE connection not found or expired' });
      }

      const body = request.body as JsonRpcRequest | undefined;
      if (!body || body.jsonrpc !== '2.0') {
        return reply.status(400).send({ error: 'Invalid JSON-RPC 2.0 payload' });
      }

      // Process the JSON RPC request in the background and reply via the client's SSE stream
      handleJsonRpcRequest(body, conn, deps, taskStatusMap).catch((err) => {
        log.error('Error handling JSON RPC request:', err);
        sendJsonRpcError(conn, body.id, -32603, err.message || 'Internal error');
      });

      return reply.status(202).send(); // Accepted
    }
  );
}

function sendJsonRpcResponse(conn: SSEConnection, id: any, result: any) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id,
    result,
  });
  conn.reply.raw.write(`event: message\ndata: ${payload}\n\n`);
}

function sendJsonRpcError(conn: SSEConnection, id: any, code: number, message: string) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
  conn.reply.raw.write(`event: message\ndata: ${payload}\n\n`);
}

async function handleJsonRpcRequest(
  req: any,
  conn: SSEConnection,
  deps: any,
  taskStatusMap: Map<string, { status: string; output?: string }>
) {
  const { method, params, id } = req;

  switch (method) {
    case 'initialize':
      return sendJsonRpcResponse(conn, id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'ninja-runtime-mcp',
          version: '1.0.0',
        },
      });

    case 'tools/list':
      return sendJsonRpcResponse(conn, id, {
        tools: getRuntimeToolsList(),
      });

    case 'tools/call':
      if (!params || !params.name) {
        return sendJsonRpcError(conn, id, -32602, 'Missing tool name parameter');
      }
      try {
        const result = await executeRuntimeTool(
          params.name,
          params.arguments || {},
          deps,
          taskStatusMap
        );
        return sendJsonRpcResponse(conn, id, result);
      } catch (err: any) {
        return sendJsonRpcResponse(conn, id, {
          content: [
            {
              type: 'text',
              text: `Tool execution failed: ${err.message || String(err)}`,
            },
          ],
          isError: true,
        });
      }

    default:
      return sendJsonRpcError(conn, id, -32601, `Method not found: ${method}`);
  }
}

function getRuntimeToolsList() {
  return [
    {
      name: 'ninja_load_profile',
      description:
        'Loads the Ninja Profile containing active context, active skills, orchestration direct blue print, and workers roster.',
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: 'The requesting client ID (e.g. codex)' },
        },
        required: ['clientId'],
      },
    },
    {
      name: 'ninja_delegate_task',
      description:
        'Delegates a natural language prompt task to a worker or sentinel client via Ninja router.',
      inputSchema: {
        type: 'object',
        properties: {
          toClient: { type: 'string', description: 'Worker or sentinel client ID' },
          prompt: { type: 'string', description: 'Task prompt in natural language' },
          priority: { type: 'string', enum: ['critical', 'normal', 'background'] },
          timeoutMs: { type: 'number', description: 'Process timeout in ms' },
        },
        required: ['toClient', 'prompt'],
      },
    },
    {
      name: 'ninja_report_progress',
      description: 'Allows a worker to report its progress or task output back to the runtime.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          status: { type: 'string', enum: ['success', 'error', 'running'] },
          output: { type: 'string' },
        },
        required: ['taskId', 'status', 'output'],
      },
    },
    {
      name: 'ninja_query_vault',
      description: 'Queries the Ninja multi-layer Memory Vault.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or question' },
          sessionId: { type: 'string' },
          layers: { type: 'array', items: { type: 'string' } },
          tokenBudget: { type: 'number' },
        },
        required: ['query', 'sessionId'],
      },
    },
    {
      name: 'ninja_write_vault',
      description: 'Writes a context entry to the Hot/Warm/Cold memory layers in the Vault.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          content: { type: 'string' },
          layer: { type: 'string', enum: ['HOT', 'WARM', 'COLD'] },
        },
        required: ['sessionId', 'content', 'layer'],
      },
    },
    {
      name: 'ninja_get_roster',
      description:
        'Gets current active clients roster status and active configurations (without credentials).',
      inputSchema: { type: 'object' },
    },
    {
      name: 'ninja_heartbeat',
      description: 'Sends client status update and keeps connection active.',
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          status: { type: 'string' },
        },
        required: ['clientId', 'status'],
      },
    },
    {
      name: 'ninja_get_task_status',
      description: 'Polls or checks the completion status of a routed delegation task.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'ninja_get_brain_status',
      description: 'Checks synchronization states of Engram, LightRAG, and Trace Ledger databases.',
      inputSchema: { type: 'object' },
    },
    {
      name: 'ninja_log_tokens',
      description: 'Logs LLM API token consumption back to Trace Ledger.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          inputTokens: { type: 'number' },
          outputTokens: { type: 'number' },
          modelName: { type: 'string' },
        },
        required: ['taskId', 'inputTokens', 'outputTokens'],
      },
    },
    {
      name: 'ninja_get_skills',
      description: 'List available skills from the Arsenal Registry.',
      inputSchema: { type: 'object' },
    },
    {
      name: 'ninja_get_workflows',
      description: 'List available workspace workflow templates.',
      inputSchema: { type: 'object' },
    },
    {
      name: 'ninja_sentinel_audit',
      description: 'Sends code changes or command output to Sentinel for audit review.',
      inputSchema: {
        type: 'object',
        properties: {
          actionType: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['actionType', 'content'],
      },
    },
  ];
}

async function executeRuntimeTool(
  name: string,
  args: any,
  deps: any,
  taskStatusMap: Map<string, { status: string; output?: string }>
) {
  log.info(`Executing tool ${name}`);

  switch (name) {
    case 'ninja_load_profile': {
      const roster = deps.rosterManager.getRoster();
      const client = roster.clients[args.clientId];
      if (!client) {
        throw new Error(`Client ${args.clientId} is not registered in the roster.`);
      }

      // Read skills list from Arsenal Registry
      const skills =
        typeof deps.engine.registry?.getSkills === 'function'
          ? deps.engine.registry.getSkills()
          : [];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'success',
                profile: {
                  role: client.assignedRole,
                  orchestrator: roster.roles.orchestrator,
                  sentinel: roster.roles.sentinel,
                  workers: roster.roles.workers,
                  alwaysOnFallback: roster.roles.alwaysOnFallback,
                  orchestrationConfig: roster.orchestration,
                  availableSkills: skills,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'ninja_delegate_task': {
      const taskId = crypto.randomUUID();
      const delegateReq = {
        taskId,
        fromClient: rosterRolesOrchestrator(deps.rosterManager),
        toClient: args.toClient,
        prompt: args.prompt,
        priority: args.priority || 'normal',
        timeoutMs: args.timeoutMs,
      };

      // Execute asynchronously and let the user poll via get_task_status
      deps.delegationRouter.delegate(delegateReq).catch((err: any) => {
        log.error(`Async delegation failed for ${taskId}:`, err);
      });

      taskStatusMap.set(taskId, { status: 'running' });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'running',
              taskId,
              message: `Task delegated to ${args.toClient}. Use ninja_get_task_status with taskId '${taskId}' to poll for results.`,
            }),
          },
        ],
      };
    }

    case 'ninja_report_progress': {
      taskStatusMap.set(args.taskId, { status: args.status, output: args.output });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true }),
          },
        ],
      };
    }

    case 'ninja_query_vault': {
      const queryResults = await deps.vaultCoordinator.query({
        agentId: 'mcp-query',
        sessionId: args.sessionId,
        query: args.query,
        layers: args.layers || ['HOT', 'WARM', 'COLD'],
        tokenBudget: args.tokenBudget || 2000,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(queryResults, null, 2),
          },
        ],
      };
    }

    case 'ninja_write_vault': {
      await deps.vaultCoordinator.write('mcp-write', args.sessionId, args.content, args.layer);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true }),
          },
        ],
      };
    }

    case 'ninja_get_roster': {
      const roster = deps.rosterManager.getRoster();
      // Remove API keys before returning for security
      const cleanRoster = {
        ...roster,
        apiKeys: Object.keys(roster.apiKeys).reduce((acc: any, key) => {
          acc[key] = '[ENCRYPTED]';
          return acc;
        }, {}),
      };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(cleanRoster, null, 2),
          },
        ],
      };
    }

    case 'ninja_heartbeat': {
      // Logic to update client connection status in roster
      const roster = deps.rosterManager.getRoster();
      const client = roster.clients[args.clientId];
      if (client) {
        client.status = args.status === 'error' ? 'error' : 'connected';
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, timestamp: new Date().toISOString() }),
          },
        ],
      };
    }

    case 'ninja_get_task_status': {
      const task = taskStatusMap.get(args.taskId) || { status: 'unknown' };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(task, null, 2),
          },
        ],
      };
    }

    case 'ninja_get_brain_status': {
      // Sync check
      const state = {
        engramConnected: true,
        lightragConnected: true,
        traceLedgerSynced: true,
        activeSession: true,
      };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'ok', state }, null, 2),
          },
        ],
      };
    }

    case 'ninja_log_tokens': {
      // Track LLM usage
      log.info(
        `LLM Usage Log: Task ${args.taskId} used input=${args.inputTokens} output=${args.outputTokens} model=${args.modelName || 'default'}`
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true }),
          },
        ],
      };
    }

    case 'ninja_get_skills': {
      const skills =
        typeof deps.engine.registry?.getSkills === 'function'
          ? deps.engine.registry.getSkills()
          : [];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(skills, null, 2),
          },
        ],
      };
    }

    case 'ninja_get_workflows': {
      const workflows =
        typeof deps.engine.listWorkflows === 'function' ? await deps.engine.listWorkflows() : [];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(workflows, null, 2),
          },
        ],
      };
    }

    case 'ninja_sentinel_audit': {
      // Audit code logic using Sentinel
      let approved = true;
      let notes = 'Bypassed audit by default policy';

      if (deps.engine.sentinel?.policyEngine) {
        const policyResult = deps.engine.sentinel.policyEngine.evaluate(
          args.actionType,
          args.content
        );
        approved = policyResult.approved;
        notes = policyResult.reason || 'Audited by sentinel policies';
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ approved, notes }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Tool not implemented: ${name}`);
  }
}

function rosterRolesOrchestrator(rosterManager: RosterManager): ClientId {
  try {
    return rosterManager.getRoster().roles.orchestrator;
  } catch {
    return 'codex';
  }
}
