import { execSync, spawn } from 'child_process';
import { createLogger } from '@ninja/logging';
import type { ClientId, ClientConfig } from '@ninja/roster';
import { detectClient } from '@ninja/roster';

const log = createLogger('installer:auto-installer');

export interface AutoInstallResult {
  success: boolean;
  output: string;
  agentId: ClientId;
  durationMs: number;
  command?: string;
}

export interface AutoInstallAllResult {
  results: AutoInstallResult[];
  succeeded: ClientId[];
  failed: ClientId[];
  skipped: ClientId[];
}

/**
 * AutoInstaller — attempts to install missing agents by running their
 * declared installCommand via child_process.execSync.
 *
 * Mirrors Gentle AI's SupportsAutoInstall() / InstallCommand() concept,
 * adapted for TypeScript and Ninja's execution model.
 *
 * Safety:
 *   - installCommand is only executed for agents where ClientConfig.supportsAutoInstall
 *     is true and the command string is non-empty.
 *   - 120s timeout is enforced to prevent hanging installs.
 *   - Failures are captured (not thrown) so the caller can iterate over results.
 */
export class AutoInstaller {
  private readonly timeoutMs: number;

  constructor(options?: { timeoutMs?: number }) {
    this.timeoutMs = options?.timeoutMs ?? 120000;
  }

  /**
   * Returns true if Ninja can attempt to auto-install the given agent.
   * The agent must:
   *   1. Be a known ClientId (detectClient returns non-null)
   *   2. Have supportsAutoInstall=true in its ClientConfig
   *   3. Have a non-empty installCommand
   */
  canAutoInstall(agentId: ClientId): boolean {
    const config = this.getConfig(agentId);
    if (!config) return false;
    return config.supportsAutoInstall && config.installCommand.trim().length > 0;
  }

  /**
   * Attempts to install a single agent by running its installCommand.
   * Captures stdout/stderr and returns a structured result.
   */
  async install(agentId: ClientId): Promise<AutoInstallResult> {
    const startTime = Date.now();

    if (!this.canAutoInstall(agentId)) {
      const message = `Auto-install not supported for ${agentId} (supportsAutoInstall=false or empty installCommand). Visit the agent's website for manual installation.`;
      log.warn(message);
      return {
        success: false,
        output: message,
        agentId,
        durationMs: Date.now() - startTime,
      };
    }

    const config = this.getConfig(agentId);
    if (!config) {
      const message = `Agent ${agentId} is not a recognized ClientId.`;
      log.warn(message);
      return {
        success: false,
        output: message,
        agentId,
        durationMs: Date.now() - startTime,
      };
    }

    const command = config.installCommand;
    log.info(`Auto-installing ${agentId} via: ${command}`);

    return new Promise<AutoInstallResult>((resolve) => {
      const child = spawn(command, {
        shell: true,
        timeout: this.timeoutMs,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          log.debug(`[${agentId} auto-install stdout]: ${chunk.trim()}`);
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          const chunk = data.toString();
          stderr += chunk;
          log.debug(`[${agentId} auto-install stderr]: ${chunk.trim()}`);
        });
      }

      child.on('close', (code) => {
        const durationMs = Date.now() - startTime;
        if (code === 0) {
          log.info(`Successfully installed ${agentId} in ${durationMs}ms`);
          resolve({
            success: true,
            output: stdout.trim(),
            agentId,
            durationMs,
            command,
          });
        } else {
          log.error(`Failed to install ${agentId} after ${durationMs}ms with exit code ${code}`);
          const errHeader = `Command failed with exit code ${code}`;
          const combinedOutput = [errHeader, stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
          resolve({
            success: false,
            output: combinedOutput,
            agentId,
            durationMs,
            command,
          });
        }
      });

      child.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        log.error(`Spawn error during install of ${agentId}: ${err.message}`);
        resolve({
          success: false,
          output: err.message,
          agentId,
          durationMs,
          command,
        });
      });
    });
  }

  /**
   * Attempts to install all known agents that support auto-install.
   * Installs are run sequentially (not in parallel) to avoid
   * package-manager conflicts (e.g. multiple npm install -g).
   */
  async installAll(): Promise<AutoInstallAllResult> {
    const allIds: ClientId[] = [
      'claude-code',
      'opencode',
      'kilocode',
      'gemini-cli',
      'cursor',
      'vscode-copilot',
      'codex',
      'windsurf',
      'antigravity-2',
      'antigravity-cli',
      'kimi-code',
      'kiro-ide',
      'qwen-code',
      'openclaw',
      'trae',
      'pi',
      'deepseek-tui',
    ];

    const results: AutoInstallResult[] = [];
    const succeeded: ClientId[] = [];
    const failed: ClientId[] = [];
    const skipped: ClientId[] = [];

    for (const id of allIds) {
      if (!this.canAutoInstall(id)) {
        skipped.push(id);
        log.debug(`Skipping ${id} — not auto-installable`);
        continue;
      }

      const result = await this.install(id);
      results.push(result);
      if (result.success) {
        succeeded.push(id);
      } else {
        failed.push(id);
      }
    }

    log.info(
      `installAll complete: ${succeeded.length} succeeded, ${failed.length} failed, ${skipped.length} skipped`
    );

    return { results, succeeded, failed, skipped };
  }

  /**
   * Returns the install info for a given agent, or null if unknown.
   * Convenience method for callers that want to display install options.
   */
  getInstallInfo(agentId: ClientId): {
    supportsAutoInstall: boolean;
    installCommand: string;
    installUrl: string;
  } | null {
    const config = this.getConfig(agentId);
    if (!config) return null;
    return {
      supportsAutoInstall: config.supportsAutoInstall,
      installCommand: config.installCommand,
      installUrl: config.installUrl,
    };
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  private getConfig(agentId: ClientId): ClientConfig | null {
    try {
      return detectClient(agentId, true);
    } catch (err) {
      log.warn(`Failed to detect client ${agentId}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private extractStderr(err: unknown): string {
    if (err && typeof err === 'object' && 'stderr' in err) {
      const stderr = (err as { stderr?: unknown }).stderr;
      if (typeof stderr === 'string' && stderr.trim().length > 0) {
        return stderr.trim();
      }
      if (Buffer.isBuffer(stderr) && stderr.length > 0) {
        return stderr.toString('utf8').trim();
      }
    }
    return '';
  }
}
