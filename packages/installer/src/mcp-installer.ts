import fs from 'fs';
import path from 'path';
import { createLogger } from '@ninja/logging';
import type { MCPServerConfig } from './types.js';
import { FileInjector } from './file-injector.js';

const log = createLogger('installer:mcp');

// Ninja-managed key in MCP config files
const NINJA_MCP_KEY = 'mcpServers';

/**
 * MCPInstaller — merges Ninja MCP server configuration into agent MCP config files.
 * Mirrors Gentle AI's internal/components/mcp pipeline.
 *
 * Each agent uses a slightly different MCP config format:
 *   - Claude Code: ~/.claude.json  (nested under `mcpServers`)
 *   - OpenCode:    opencode.json   (nested under `mcp.servers`)
 *   - Cursor:      ~/.cursor/mcp.json  (same as Claude format)
 *   - Codex:       TOML-based config
 *   - Others:      ~/.{agent}/mcp.json
 *
 * The installer merges Ninja servers under a `__ninja__` namespace to avoid
 * clobbering user-defined servers.
 */
export class MCPInstaller {
  private injector: FileInjector;

  constructor() {
    this.injector = new FileInjector();
  }

  /**
   * Merges Ninja MCP server configs into the agent's MCP config file.
   * Supports JSON (most agents) and TOML (Codex) formats.
   */
  install(mcpConfigPath: string, servers: MCPServerConfig[], format: 'json' | 'toml' | 'opencode' = 'json'): boolean {
    if (!mcpConfigPath) {
      log.debug('No mcpConfigPath configured. Skipping MCP injection.');
      return false;
    }

    fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });

    switch (format) {
      case 'json':
        return this.injectJsonMCP(mcpConfigPath, servers);
      case 'opencode':
        return this.injectOpenCodeMCP(mcpConfigPath, servers);
      case 'toml':
        return this.injectTomlMCP(mcpConfigPath, servers);
      default:
        log.warn(`Unknown MCP config format: ${format}`);
        return false;
    }
  }

  /**
   * Standard Claude/Cursor/Kimi JSON MCP format:
   * { "mcpServers": { "serverName": { "command": "...", "args": [...] } } }
   */
  private injectJsonMCP(configPath: string, servers: MCPServerConfig[]): boolean {
    let existing: Record<string, any> = {};

    if (fs.existsSync(configPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        log.warn(`Could not parse ${configPath}, starting fresh.`);
      }
    }

    const ninjaServers: Record<string, any> = {};
    for (const srv of servers) {
      ninjaServers[srv.name] = this.serverToJsonFormat(srv);
    }

    const mcpServers = { ...(existing[NINJA_MCP_KEY] || {}), ...ninjaServers };
    const merged = { ...existing, [NINJA_MCP_KEY]: mcpServers };

    return this.injector.writeFile(configPath, JSON.stringify(merged, null, 2) + '\n');
  }

  /**
   * OpenCode MCP format (inside opencode.json):
   * { "mcp": { "servers": { "serverName": { "type": "stdio", "command": "...", "args": [...] } } } }
   */
  private injectOpenCodeMCP(configPath: string, servers: MCPServerConfig[]): boolean {
    let existing: Record<string, any> = {};

    if (fs.existsSync(configPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        log.warn(`Could not parse ${configPath}, starting fresh.`);
      }
    }

    const existingMcp = existing['mcp'] || {};
    const existingServers = existingMcp['servers'] || {};
    const ninjaServers: Record<string, any> = {};

    for (const srv of servers) {
      ninjaServers[srv.name] = {
        type: srv.url ? 'http' : 'stdio',
        ...this.serverToJsonFormat(srv),
      };
    }

    const merged = {
      ...existing,
      mcp: {
        ...existingMcp,
        servers: { ...existingServers, ...ninjaServers },
      },
    };

    return this.injector.writeFile(configPath, JSON.stringify(merged, null, 2) + '\n');
  }

  /**
   * TOML format (Codex ~/.codex/config.toml):
   * [mcp_servers.serverName]
   * command = "..."
   * args = [...]
   */
  private injectTomlMCP(configPath: string, servers: MCPServerConfig[]): boolean {
    const tomlLines: string[] = [];

    for (const srv of servers) {
      tomlLines.push(`[mcp_servers.${srv.name}]`);
      tomlLines.push(`command = "${srv.command}"`);
      if (srv.args && srv.args.length > 0) {
        tomlLines.push(`args = [${srv.args.map(a => `"${a}"`).join(', ')}]`);
      }
      if (srv.env) {
        for (const [k, v] of Object.entries(srv.env)) {
          tomlLines.push(`env.${k} = "${v}"`);
        }
      }
      tomlLines.push('');
    }

    return this.injector.injectManagedBlockToml(configPath, tomlLines.join('\n'));
  }

  private serverToJsonFormat(srv: MCPServerConfig): Record<string, any> {
    const result: Record<string, any> = { command: srv.command };
    if (srv.args && srv.args.length > 0) result['args'] = srv.args;
    if (srv.env) result['env'] = srv.env;
    if (srv.url) result['url'] = srv.url;
    return result;
  }

  /**
   * Removes Ninja-managed MCP servers from the agent's config.
   * Identified by the server names provided in the list.
   */
  uninstall(mcpConfigPath: string, serverNames: string[], format: 'json' | 'toml' | 'opencode' = 'json'): boolean {
    if (!mcpConfigPath || !fs.existsSync(mcpConfigPath)) return false;

    if (format === 'json') {
      try {
        const existing = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
        const mcpServers = existing[NINJA_MCP_KEY] || {};
        for (const name of serverNames) delete mcpServers[name];
        existing[NINJA_MCP_KEY] = mcpServers;
        return this.injector.writeFile(mcpConfigPath, JSON.stringify(existing, null, 2) + '\n');
      } catch {
        return false;
      }
    }

    if (format === 'toml') {
      return this.injector.removeManagedBlock(mcpConfigPath);
    }

    return false;
  }
}
