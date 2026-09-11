import { createLogger } from '@ninja/logging';
import { eventBus as defaultEventBus, createEvent } from '@ninja/events';
import { RosterManager } from '@ninja/roster';
import { getClientAdapter, getAgentAdapter } from '@ninja/client-adapters';
import { ClientId, ClientRole } from '@ninja/roster';
import { RosterError, ErrorCodes } from '@ninja/contracts';

const log = createLogger('delegation-router');

export interface DelegationRequest {
  taskId: string;
  fromClient: ClientId;
  toClient: ClientId;
  prompt: string;
  skills?: string[];
  priority?: 'critical' | 'normal' | 'background';
  timeoutMs?: number;
  sessionId?: string; // Optional session context
}

export interface DelegationResult {
  taskId: string;
  status: 'success' | 'error' | 'timeout';
  output: string;
  durationMs: number;
  clientUsed: ClientId;
  modelUsed: string;
}

export class DelegationRouter {
  private rosterManager: RosterManager;
  private vaultCoordinator: any; // Passed dynamically to prevent circular imports
  private eventBus: any;

  constructor(deps: { rosterManager: RosterManager; vaultCoordinator?: any; eventBus?: any }) {
    this.rosterManager = deps.rosterManager;
    this.vaultCoordinator = deps.vaultCoordinator;
    this.eventBus = deps.eventBus || defaultEventBus;
    log.info('DelegationRouter initialized.');
  }

  /**
   * Delegates a task to the target client.
   * Leverages the client adapters and handles orchestration context, logging, and error handling.
   */
  async delegate(req: DelegationRequest): Promise<DelegationResult> {
    const startTime = Date.now();
    log.info(`Routing delegation request ${req.taskId} from ${req.fromClient} to ${req.toClient}`);

    // Emit event that delegation has started
    this.eventBus.emit(
      'delegation.started',
      createEvent('delegation.started', 'delegation-router', {
        taskId: req.taskId,
        fromClient: req.fromClient,
        toClient: req.toClient,
        priority: req.priority || 'normal',
      })
    );

    try {
      const roster = this.rosterManager.getRoster();
      const clientConfig = roster.clients[req.toClient];

      if (!clientConfig) {
        throw new RosterError(
          ErrorCodes.ROSTER_AGENT_NOT_FOUND,
          `Target client '${req.toClient}' is not registered in the roster.`
        );
      }

      // 1. Enrich prompt with Vault Context if available
      let finalPrompt = req.prompt;
      if (this.vaultCoordinator && req.sessionId) {
        try {
          finalPrompt = await this.enrichPromptWithVault(
            req.prompt,
            req.skills || [],
            req.sessionId,
            req.fromClient
          );
        } catch (vaultErr) {
          log.warn('Failed to enrich prompt from Vault. Proceeding with raw prompt.', vaultErr);
        }
      }

      // 2. Resolve adapter connection method and instantiate the adapter
      const connectionType = clientConfig.connectionMethod.type;
      let adapter = getAgentAdapter(req.toClient);
      if (!adapter) {
        adapter = getClientAdapter(connectionType);
      }

      // 3. Setup adapter execution options
      const executablePath = clientConfig.executablePath;
      let args: string[] = [];
      let flags: string[] = [];

      if ('args' in clientConfig.connectionMethod) {
        args = clientConfig.connectionMethod.args;
      }
      if ('flags' in clientConfig.connectionMethod) {
        flags = clientConfig.connectionMethod.flags;
      }

      const options: any = {
        taskId: req.taskId,
        executablePath,
        args,
        flags,
        timeoutMs: req.timeoutMs || 90000,
        clientId: req.toClient, // for VSIX WebSocket adapter
      };

      // Add connection specific properties
      if (connectionType === 'mcp-http') {
        options.connectionType = 'http';
        const method = clientConfig.connectionMethod;
        if (method.type === 'mcp-http') {
          options.url = method.url;
        }
      } else if (connectionType === 'mcp-stdio') {
        options.connectionType = 'stdio';
      }

      // 4. Execute the client adapter
      const adapterResult = await adapter.execute(finalPrompt, options);
      const durationMs = Date.now() - startTime;

      const result: DelegationResult = {
        taskId: req.taskId,
        status: adapterResult.status,
        output: adapterResult.output,
        durationMs,
        clientUsed: req.toClient,
        modelUsed: clientConfig.subscription || 'default-model',
      };

      // Emit completion event
      this.eventBus.emit(
        'delegation.completed',
        createEvent('delegation.completed', 'delegation-router', {
          taskId: req.taskId,
          status: result.status,
          durationMs,
          clientUsed: req.toClient,
        })
      );

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      log.error(`Delegation failed for task ${req.taskId}: ${errorMsg}`);

      // Emit error event
      this.eventBus.emit(
        'delegation.failed',
        createEvent('delegation.failed', 'delegation-router', {
          taskId: req.taskId,
          error: errorMsg,
          durationMs,
        })
      );

      return {
        taskId: req.taskId,
        status: 'error',
        output: `Delegation error: ${errorMsg}`,
        durationMs,
        clientUsed: req.toClient,
        modelUsed: 'unknown',
      };
    }
  }

  /**
   * Context enrichment helper. Queries the Vault and formats context to append to the prompt.
   */
  private async enrichPromptWithVault(
    prompt: string,
    skills: string[],
    sessionId: string,
    fromClient: string
  ): Promise<string> {
    log.debug(`Enriching prompt from Vault for session ${sessionId}...`);

    const vaultResults = await this.vaultCoordinator.query({
      agentId: fromClient,
      sessionId,
      query: prompt,
      layers: ['HOT', 'WARM', 'COLD'],
      tokenBudget: 2500,
    });

    const contextBlocks: string[] = [];

    // Format skills context if any
    if (skills.length > 0) {
      contextBlocks.push(`[SYSTEM - Arsenal Skills requested]: ${skills.join(', ')}`);
    }

    // Format vault entries
    for (const res of vaultResults) {
      for (const entry of res.entries) {
        contextBlocks.push(`[MEMORY - ${res.layer}]: ${entry.content}`);
      }
    }

    if (contextBlocks.length > 0) {
      return `### CONTEXT AND INSTRUCTIONS FOR EXECUTION
${contextBlocks.join('\n\n')}

### TASK TO EXECUTE
${prompt}`;
    }

    return prompt;
  }
}
