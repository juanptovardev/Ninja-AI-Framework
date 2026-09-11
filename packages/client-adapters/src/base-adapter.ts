import path from 'path';
import os from 'os';
import type {
  IClientAdapter,
  AdapterOptions,
  AdapterResult,
  DetectionResult,
  NinjaSkill,
  SDDAgentFile,
  MCPServerConfig,
  VerifyReport,
  DelegationModel,
} from './types.js';
import type { NinjaPersona } from '@ninja/installer';
import type { ClientId } from '@ninja/roster';
import { NinjaError, ErrorCodes } from '@ninja/contracts';

/**
 * BaseTransportAdapter — provides default implementations of the identity,
 * detection, injection, and verification methods of IClientAdapter.
 *
 * Concrete transport adapters (HeadlessCliAdapter, McpAdapter, etc.) extend
 * this class and override only execute(). The full identity/injection methods
 * are implemented by the agent-specific adapters in @ninja/installer.
 *
 * This class exists so that the transport adapters can satisfy the IClientAdapter
 * interface without duplicating boilerplate. The AgentInstaller in @ninja/installer
 * handles the real injection pipeline using the roster ClientConfig data.
 */
export abstract class BaseTransportAdapter implements IClientAdapter {
  // ── 1. Identity (must be overridden by concrete adapters) ──────────────────
  agentId(): ClientId {
    throw new NinjaError(
      ErrorCodes.ADAPTER_METHOD_NOT_IMPLEMENTED,
      'agentId() must be overridden by concrete adapter',
      'runtime'
    );
  }

  displayName(): string {
    return this.agentId();
  }

  delegationModel(): DelegationModel {
    return 'solo';
  }

  // ── 2. Detection ──────────────────────────────────────────────────────────
  async detect(_homeDir?: string): Promise<DetectionResult> {
    return {
      installed: false,
      binaryPath: '',
      configDir: this.globalConfigDir(),
      configFound: false,
    };
  }

  // ── 3. Config Path Resolution ─────────────────────────────────────────────
  globalConfigDir(_homeDir?: string): string {
    return '';
  }

  skillsDir(_homeDir?: string): string {
    return '';
  }

  agentsDir(_homeDir?: string): string {
    return '';
  }

  mcpConfigPath(_homeDir?: string): string {
    return '';
  }

  // ── 4. Injection (no-op by default — AgentInstaller handles this) ──────────
  async injectSystemPrompt(_configDir: string, _content: string): Promise<void> {
    // No-op: use AgentInstaller.install() for actual injection
  }

  async injectSkills(_configDir: string, _skills: NinjaSkill[]): Promise<void> {
    // No-op: use AgentInstaller.install() for actual injection
  }

  async injectSDD(_configDir: string, _agents: SDDAgentFile[]): Promise<void> {
    // No-op: use AgentInstaller.install() for actual injection
  }

  async injectMCPConfig(_configDir: string, _servers: MCPServerConfig[]): Promise<void> {
    // No-op: use AgentInstaller.install() for actual injection
  }

  async injectPersona(_configDir: string, _persona: NinjaPersona): Promise<void> {
    // No-op: use AgentInstaller.install() for actual injection
  }

  // ── 5. Execution (must be implemented by concrete transport adapters) ───────
  abstract execute(prompt: string, options: AdapterOptions): Promise<AdapterResult>;

  // ── 6. Verification ───────────────────────────────────────────────────────
  async verify(_configDir: string): Promise<VerifyReport> {
    return {
      passed: true,
      present: [],
      missing: [],
      warnings: [
        'Verification not implemented for this transport adapter. Use AgentInstaller.verify() instead.',
      ],
    };
  }
}
