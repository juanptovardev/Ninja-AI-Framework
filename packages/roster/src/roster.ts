import fs from 'fs';
import path from 'path';
import os from 'os';
import { createLogger } from '@ninja/logging';
import { RosterError, ErrorCodes } from '@ninja/contracts';
import { NinjaRoster, ClientId, ClientRole, ProviderId, ClientConfig } from './types.js';
import { detectAllClients } from './detector.js';

const log = createLogger('roster:manager');

export class RosterManager {
  private roster: NinjaRoster | null = null;
  private rosterFilePath: string;

  constructor(customPath?: string) {
    const home = os.homedir();
    this.rosterFilePath = customPath || path.join(home, '.ninja', 'ninja_roster.json');
  }

  /**
   * Initializes a default roster.
   */
  private createDefaultRoster(): NinjaRoster {
    return {
      version: '1.1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roles: {
        orchestrator: 'codex',
        sentinel: 'claude-code',
        workers: [],
        alwaysOnFallback: 'model-gateway',
      },
      clients: {} as Record<ClientId, ClientConfig>,
      apiKeys: {} as Record<ProviderId, any>,
      orchestration: {
        defaultOrchestrator: 'codex',
        defaultSentinel: 'claude-code',
        heartbeatIntervalMs: 30000,
      },
    };
  }

  /**
   * Checks if the roster file exists.
   */
  public exists(): boolean {
    return fs.existsSync(this.rosterFilePath);
  }

  /**
   * Returns the decrypted roster object. Throws if not loaded.
   */
  public getRoster(): NinjaRoster {
    if (!this.roster) {
      throw new RosterError(ErrorCodes.ROSTER_INVALID_DEFINITION, 'Roster is not loaded. Unlock the roster first.', {
        httpStatus: 500,
      });
    }
    return this.roster;
  }

  /**
   * Unlocks and loads the roster from disk.
   * If it doesn't exist, initializes a new one.
   */
  public unlock(): void {
    const dir = path.dirname(this.rosterFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.rosterFilePath)) {
      log.info('Roster file not found. Initializing a new one...');
      this.roster = this.createDefaultRoster();
      this.save();
      return;
    }

    try {
      const dataJson = fs.readFileSync(this.rosterFilePath, 'utf8');
      this.roster = JSON.parse(dataJson);
      
      log.info('Roster successfully unlocked.');
    } catch (err) {
      log.error('Failed to unlock roster.', err);
      throw new RosterError(ErrorCodes.ROSTER_INVALID_DEFINITION, 'Failed to unlock roster: Corrupted file.', {
        httpStatus: 500,
        cause: err,
      });
    }
  }

  /**
   * Saves the encrypted roster to disk.
   */
  public save(): void {
    if (!this.roster) {
      throw new RosterError(ErrorCodes.ROSTER_INVALID_DEFINITION, 'Roster is not initialized.', {
        httpStatus: 500,
      });
    }

    try {
      this.roster.updatedAt = new Date().toISOString();
      const json = JSON.stringify(this.roster, null, 2);
      
      const dir = path.dirname(this.rosterFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.rosterFilePath, json, 'utf8');
      log.info('Roster successfully saved.');
    } catch (err) {
      log.error('Failed to save roster.', err);
      throw new RosterError(
        ErrorCodes.ROSTER_INVALID_DEFINITION,
        `Failed to save roster: ${err instanceof Error ? err.message : String(err)}`,
        { httpStatus: 500, cause: err },
      );
    }
  }

  /**
   * Runs auto-detection and merges newly detected clients into the roster.
   */
  public detectAndSync(): void {
    const roster = this.getRoster();
    const detected = detectAllClients();

    // Merge detected clients keeping any custom configuration or key configuration
    for (const [id, config] of Object.entries(detected) as [ClientId, ClientConfig][]) {
      if (!roster.clients[id]) {
        roster.clients[id] = config;
      } else {
        // Keep status, assignedRole, and connectionMethod, but update paths & capabilities
        roster.clients[id].executablePath = config.executablePath;
        roster.clients[id].capabilities = config.capabilities;
        roster.clients[id].configPath = config.configPath;
        roster.clients[id].configDir = config.configDir;
        roster.clients[id].mcpConfigPath = config.mcpConfigPath;
        roster.clients[id].skillsDir = config.skillsDir;
        roster.clients[id].agentsDir = config.agentsDir;
        roster.clients[id].delegationModel = config.delegationModel;
      }
    }

    // Set default orchestrator/sentinel/workers roles based on detected clients
    const detectedIds = Object.keys(roster.clients) as ClientId[];
    
    // Choose Codex or Cursor as default orchestrator if available
    if (detectedIds.includes('codex')) {
      roster.roles.orchestrator = 'codex';
      roster.clients['codex'].assignedRole = 'orchestrator';
    } else if (detectedIds.includes('cursor')) {
      roster.roles.orchestrator = 'cursor';
      roster.clients['cursor'].assignedRole = 'orchestrator';
    }

    // Choose Claude Code as default sentinel if available
    if (detectedIds.includes('claude-code')) {
      roster.roles.sentinel = 'claude-code';
      roster.clients['claude-code'].assignedRole = 'sentinel';
    }

    // Others are workers by default
    roster.roles.workers = detectedIds.filter(
      (id) => id !== roster.roles.orchestrator && id !== roster.roles.sentinel
    );
    for (const workerId of roster.roles.workers) {
      roster.clients[workerId].assignedRole = 'worker';
    }

    this.save();
    log.info('Auto-detected clients synced with roster.');
  }

  /**
   * Encrypts and sets an API Key for a provider.
   */
  public setApiKey(provider: ProviderId, apiKey: string): void {
    const roster = this.getRoster();

    roster.apiKeys[provider] = apiKey;
    this.save();
    log.info(`API Key for provider ${provider} has been set.`);
  }

  /**
   * Gets an API Key for a provider.
   */
  public getApiKey(provider: ProviderId): string {
    const roster = this.getRoster();
    const key = roster.apiKeys[provider];
    if (!key) {
      throw new RosterError(ErrorCodes.ROSTER_AGENT_NOT_FOUND, `API Key for provider ${provider} not found in roster.`, {
        httpStatus: 404,
        context: { provider },
      });
    }

    return key;
  }

  /**
   * Assigns a role to a registered client.
   */
  public assignRole(clientId: ClientId, role: ClientRole): void {
    const roster = this.getRoster();
    const client = roster.clients[clientId];
    if (!client) {
      throw new RosterError(ErrorCodes.ROSTER_AGENT_NOT_FOUND, `Client ${clientId} is not registered in the roster.`, {
        httpStatus: 404,
        context: { clientId },
      });
    }

    // Reassign roles in configurations
    client.assignedRole = role;

    if (role === 'orchestrator') {
      // Demote current orchestrator if any
      const currentOrchId = roster.roles.orchestrator;
      if (currentOrchId && currentOrchId !== clientId && roster.clients[currentOrchId]) {
        roster.clients[currentOrchId].assignedRole = 'worker';
      }
      roster.roles.orchestrator = clientId;
    } else if (role === 'sentinel') {
      const currentSentId = roster.roles.sentinel;
      if (currentSentId && currentSentId !== clientId && roster.clients[currentSentId]) {
        roster.clients[currentSentId].assignedRole = 'worker';
      }
      roster.roles.sentinel = clientId;
    } else if (role === 'worker') {
      // Remove from orchestrator or sentinel lists
      if (roster.roles.orchestrator === clientId) {
        throw new RosterError(ErrorCodes.ROSTER_INVALID_DEFINITION, 'Cannot assign orchestrator to worker role without choosing a replacement.', {
          httpStatus: 409,
          context: { clientId },
        });
      }
      if (roster.roles.sentinel === clientId) {
        throw new RosterError(ErrorCodes.ROSTER_INVALID_DEFINITION, 'Cannot assign sentinel to worker role without choosing a replacement.', {
          httpStatus: 409,
          context: { clientId },
        });
      }
      if (!roster.roles.workers.includes(clientId)) {
        roster.roles.workers.push(clientId);
      }
    }

    // Refresh workers list
    roster.roles.workers = Object.keys(roster.clients).filter(
      (id) => id !== roster.roles.orchestrator && id !== roster.roles.sentinel
    ) as ClientId[];

    this.save();
    log.info(`Assigned role ${role} to client ${clientId}.`);
  }
}
