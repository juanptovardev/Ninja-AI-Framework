import { IClientAdapter } from './types.js';
import type { ClientId } from '@ninja/roster';
import { HeadlessCliAdapter } from './adapters/headless.js';
import { PtyInteractiveAdapter } from './adapters/pty.js';
import { McpAdapter } from './adapters/mcp.js';
import { WebSocketAdapter } from './adapters/websocket.js';
import { KimiAdapter } from './adapters/kimi-adapter.js';
import { KiroAdapter } from './adapters/kiro-adapter.js';
import { QwenAdapter } from './adapters/qwen-adapter.js';
import { GenericAgentAdapter, GenericAgentConfig, PRESET_AGENTS, createGenericAgent } from './adapters/generic-agents-adapter.js';
import { ClaudeAdapter } from './adapters/claude-adapter.js';
import { CodexAdapter } from './adapters/codex-adapter.js';
import { CursorAdapter } from './adapters/cursor-adapter.js';
import { OpenCodeAdapter } from './adapters/opencode-adapter.js';
import { WindsurfAdapter } from './adapters/windsurf-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-cli-adapter.js';

export * from './types.js';
export * from './base-adapter.js';
export * from './adapters/headless.js';
export * from './adapters/pty.js';
export * from './adapters/mcp.js';
export * from './adapters/websocket.js';
export * from './adapters/kimi-adapter.js';
export * from './adapters/kiro-adapter.js';
export * from './adapters/qwen-adapter.js';
export * from './adapters/generic-agents-adapter.js';
export * from './adapters/claude-adapter.js';
export * from './adapters/codex-adapter.js';
export * from './adapters/cursor-adapter.js';
export * from './adapters/opencode-adapter.js';
export * from './adapters/windsurf-adapter.js';
export * from './adapters/gemini-cli-adapter.js';

export function getClientAdapter(connectionType: 'headless-cli' | 'pty' | 'mcp-stdio' | 'mcp-http' | 'vsix-websocket'): IClientAdapter {
  switch (connectionType) {
    case 'headless-cli':
      return new HeadlessCliAdapter();
    case 'pty':
      return new PtyInteractiveAdapter();
    case 'mcp-stdio':
    case 'mcp-http':
      return new McpAdapter();
    case 'vsix-websocket':
      return new WebSocketAdapter();
    default:
      throw new Error(`Unsupported client adapter connection type: ${connectionType}`);
  }
}

export function getAgentAdapter(clientId: ClientId): IClientAdapter | undefined {
  switch (clientId) {
    case 'claude-code':
      return new ClaudeAdapter();
    case 'codex':
      return new CodexAdapter();
    case 'cursor':
      return new CursorAdapter();
    case 'opencode':
      return new OpenCodeAdapter();
    case 'windsurf':
      return new WindsurfAdapter();
    case 'gemini-cli':
      return new GeminiCliAdapter();
    case 'kimi-code':
      return new KimiAdapter();
    case 'kiro-ide':
      return new KiroAdapter();
    case 'qwen-code':
      return new QwenAdapter();
    case 'kilocode':
    case 'vscode-copilot':
    case 'openclaw':
    case 'trae':
    case 'deepseek-tui':
    case 'pi': {
      const preset = PRESET_AGENTS[clientId];
      return preset ? createGenericAgent(preset) : undefined;
    }
    default:
      return undefined;
  }
}

export {
  KimiAdapter,
  KiroAdapter,
  QwenAdapter,
  GenericAgentAdapter,
  PRESET_AGENTS,
  createGenericAgent,
  ClaudeAdapter,
  CodexAdapter,
  CursorAdapter,
  OpenCodeAdapter,
  WindsurfAdapter,
  GeminiCliAdapter,
};
export type { GenericAgentConfig };
