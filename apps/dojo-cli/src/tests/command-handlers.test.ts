import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCommandContext, type CommandContext, type HistoryEntry } from '../commands/base-command.js';
import { ClearCommand, ExportCommand } from '../commands/commands-core.js';
import { ModelCommand, HelpCommand } from '../commands/commands-extended.js';
import { writeFileSync } from 'fs';
import * as render from '../tui/render.js';

vi.mock('../tui/render.js', () => ({
  renderError: vi.fn(),
  renderSuccess: vi.fn(),
  renderSpinner: vi.fn(() => 'mock-spinner-id'),
  updateSpinner: vi.fn(),
}));

vi.mock('fs', () => {
  const writeFileSyncMock = vi.fn();
  const mkdirSyncMock = vi.fn();
  const existsSyncMock = vi.fn(() => true);
  const readFileSyncMock = vi.fn(() => '{}');
  const readdirSyncMock = vi.fn(() => []);
  const statSyncMock = vi.fn(() => ({
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  }));
  return {
    writeFileSync: writeFileSyncMock,
    mkdirSync: mkdirSyncMock,
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
    readdirSync: readdirSyncMock,
    statSync: statSyncMock,
  };
});

function makeHistoryEntry(
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
  index: number,
): HistoryEntry {
  return { role, content, timestamp: new Date().toISOString(), index };
}

describe('ClearCommand', () => {
  let cmd: ClearCommand;
  let ctx: CommandContext;

  beforeEach(() => {
    cmd = new ClearCommand();
    ctx = createCommandContext();
    ctx.history.push(
      makeHistoryEntry('user', 'tell me a joke', 0),
      makeHistoryEntry('assistant', 'why did the chicken cross the road?', 1),
      makeHistoryEntry('user', 'i give up', 2),
      makeHistoryEntry('assistant', 'to get to the other side', 3),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears history by default when no args are passed', async () => {
    expect(ctx.history.length).toBe(4);

    await cmd.execute(ctx, {
      rawInput: '/clear',
      commandName: 'clear',
      args: [],
      flags: {},
    });

    expect(ctx.history.length).toBe(1);
    expect(ctx.history[0].content).toContain('[clear]');
    expect(ctx.sessionMetadata.lastClearTarget).toBe('history');
    expect(render.renderSuccess).toHaveBeenCalled();
    expect(render.renderError).not.toHaveBeenCalled();
  });

  it('resets sessionMetadata when clearing context', async () => {
    ctx.sessionMetadata.effortLevel = 'max';
    ctx.sessionMetadata.fastMode = true;
    ctx.sessionMetadata.customKey = 'custom-value';

    await cmd.execute(ctx, {
      rawInput: '/clear context',
      commandName: 'clear',
      args: ['context'],
      flags: {},
    });

    expect(ctx.sessionMetadata.effortLevel).toBe('high');
    expect(ctx.sessionMetadata.fastMode).toBe(false);
    expect(ctx.sessionMetadata.customKey).toBeUndefined();
    expect(ctx.sessionMetadata.lastClearTarget).toBe('context');
    expect(ctx.history.length).toBe(4);
    expect(render.renderSuccess).toHaveBeenCalled();
  });

  it('clears both history and context when target is all', async () => {
    ctx.sessionMetadata.effortLevel = 'low';
    ctx.sessionMetadata.fastMode = true;
    ctx.sessionMetadata.totalInputTokens = 5000;

    await cmd.execute(ctx, {
      rawInput: '/clear all --force',
      commandName: 'clear',
      args: ['all'],
      flags: { force: true },
    });

    expect(ctx.history.length).toBe(1);
    expect(ctx.sessionMetadata.effortLevel).toBe('high');
    expect(ctx.sessionMetadata.fastMode).toBe(false);
    expect(ctx.sessionMetadata.totalInputTokens).toBe(0);
    expect(ctx.sessionMetadata.lastClearTarget).toBe('all');
    expect(render.renderSuccess).toHaveBeenCalled();
  });

  it('stores metadata about the clear operation', async () => {
    await cmd.execute(ctx, {
      rawInput: '/clear',
      commandName: 'clear',
      args: [],
      flags: {},
    });

    expect(ctx.sessionMetadata.lastClearTarget).toBe('history');
    expect(ctx.sessionMetadata.lastClearAt).toBeDefined();
    expect(typeof ctx.sessionMetadata.lastClearAt).toBe('string');
  });
});

describe('ModelCommand', () => {
  let cmd: ModelCommand;
  let ctx: CommandContext;

  beforeEach(() => {
    cmd = new ModelCommand();
    ctx = createCommandContext();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('switches the active model', async () => {
    expect(ctx.model).toBe('claude-sonnet-4-6');

    await cmd.execute(ctx, {
      rawInput: '/model deepseek-v4-flash',
      commandName: 'model',
      args: ['deepseek-v4-flash'],
      flags: {},
    });

    expect(ctx.model).toBe('deepseek-v4-flash');
    expect(render.renderSuccess).toHaveBeenCalled();
    expect(render.renderError).not.toHaveBeenCalled();
  });

  it('lists all available models without changing the active model', async () => {
    const originalModel = ctx.model;

    await cmd.execute(ctx, {
      rawInput: '/model --list',
      commandName: 'model',
      args: [],
      flags: { list: true },
    });

    expect(ctx.model).toBe(originalModel);
    expect(render.renderSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Available models'),
    );
    expect(render.renderError).not.toHaveBeenCalled();
  });

  it('displays the current model without changing it', async () => {
    await cmd.execute(ctx, {
      rawInput: '/model --current',
      commandName: 'model',
      args: [],
      flags: { current: true },
    });

    expect(ctx.model).toBe('claude-sonnet-4-6');
    expect(render.renderSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Current model'),
    );
    expect(render.renderError).not.toHaveBeenCalled();
  });

  it('shows current model when no args or flags are provided', async () => {
    await cmd.execute(ctx, {
      rawInput: '/model',
      commandName: 'model',
      args: [],
      flags: {},
    });

    expect(ctx.model).toBe('claude-sonnet-4-6');
    expect(render.renderSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Current model'),
    );
  });

  it('appends a history entry when switching models', async () => {
    await cmd.execute(ctx, {
      rawInput: '/model gemini-3.5-pro',
      commandName: 'model',
      args: ['gemini-3.5-pro'],
      flags: {},
    });

    const sysEntry = ctx.history.find(
      (e) => e.role === 'system' && e.content.includes('[model]'),
    );
    expect(sysEntry).toBeDefined();
    expect(sysEntry!.content).toContain('gemini-3.5-pro');
  });

  it('stores the previous model in metadata after a switch', async () => {
    await cmd.execute(ctx, {
      rawInput: '/model gemini-3.5-flash',
      commandName: 'model',
      args: ['gemini-3.5-flash'],
      flags: {},
    });

    expect(ctx.sessionMetadata.previousModel).toBe('claude-sonnet-4-6');
  });
});

describe('ExportCommand', () => {
  let cmd: ExportCommand;
  let ctx: CommandContext;

  beforeEach(() => {
    cmd = new ExportCommand();
    ctx = createCommandContext();
    ctx.model = 'deepseek-v4-flash';
    ctx.currentWorkspaceId = 'ws-test-01';
    ctx.history.push(
      makeHistoryEntry('user', 'hello', 0),
      makeHistoryEntry('assistant', 'world', 1),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports the session as JSON by default', async () => {
    await cmd.execute(ctx, {
      rawInput: '/export',
      commandName: 'export',
      args: [],
      flags: {},
    });

    expect(writeFileSync).toHaveBeenCalled();
    expect(render.renderSpinner).toHaveBeenCalledWith(
      expect.stringContaining('Exporting session as json'),
    );
    expect(render.renderSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Export complete'),
    );
  });

  it('exports history as markdown when format is markdown', async () => {
    await cmd.execute(ctx, {
      rawInput: '/export history --format markdown',
      commandName: 'export',
      args: ['history'],
      flags: { format: 'markdown' },
    });

    const firstCallPath = vi.mocked(writeFileSync).mock.calls[0][0] as string;
    expect(firstCallPath).toContain('.md');
    expect(render.renderSpinner).toHaveBeenCalledWith(
      expect.stringContaining('Exporting history as markdown'),
    );
  });

  it('exports all data as JSON when target is all', async () => {
    await cmd.execute(ctx, {
      rawInput: '/export all',
      commandName: 'export',
      args: ['all'],
      flags: {},
    });

    expect(writeFileSync).toHaveBeenCalled();
    const firstCallData = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(firstCallData);
    expect(parsed.session.model).toBe('deepseek-v4-flash');
    expect(parsed.history).toHaveLength(2);
    expect(parsed.exportedAt).toBeDefined();
  });

  it('exports history as CSV when format is csv', async () => {
    await cmd.execute(ctx, {
      rawInput: '/export history --format csv',
      commandName: 'export',
      args: ['history'],
      flags: { format: 'csv' },
    });

    expect(writeFileSync).toHaveBeenCalled();
    const firstCallData = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(firstCallData).toContain('role,timestamp,index,content');
    expect(firstCallData).toContain('"user"');
    expect(firstCallData).toContain('"assistant"');
  });

  it('appends a history entry tracking the export', async () => {
    await cmd.execute(ctx, {
      rawInput: '/export session --format json',
      commandName: 'export',
      args: ['session'],
      flags: { format: 'json' },
    });

    const sysEntry = ctx.history.find(
      (e) => e.role === 'system' && e.content.includes('[export]'),
    );
    expect(sysEntry).toBeDefined();
    expect(sysEntry!.content).toContain('session exported as json');
  });
});

describe('HelpCommand', () => {
  let cmd: HelpCommand;
  let ctx: CommandContext;

  beforeEach(() => {
    cmd = new HelpCommand();
    ctx = createCommandContext();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the full command catalog by default', async () => {
    await cmd.execute(ctx, {
      rawInput: '/help',
      commandName: 'help',
      args: [],
      flags: {},
    });

    expect(render.renderSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Command Catalog'),
    );
    expect(render.renderError).not.toHaveBeenCalled();
  });

  it('shows the catalog in compact one-line format', async () => {
    await cmd.execute(ctx, {
      rawInput: '/help --compact',
      commandName: 'help',
      args: [],
      flags: { compact: true },
    });

    expect(render.renderSuccess).toHaveBeenCalledWith(
      expect.stringContaining('compact'),
    );
  });

  it('filters the catalog by category', async () => {
    await cmd.execute(ctx, {
      rawInput: '/help --category config',
      commandName: 'help',
      args: [],
      flags: { category: 'config' },
    });

    expect(render.renderSuccess).toHaveBeenCalledWith(
      expect.stringContaining('CONFIG'),
    );
  });

  it('shows detailed help for a specific command when a name is given', async () => {
    await cmd.execute(ctx, {
      rawInput: '/help model',
      commandName: 'help',
      args: ['model'],
      flags: {},
    });

    expect(render.renderSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Help for /model'),
    );
  });

  it('preserves ctx.model across help invocation', async () => {
    const originalModel = ctx.model;

    await cmd.execute(ctx, {
      rawInput: '/help',
      commandName: 'help',
      args: [],
      flags: {},
    });

    expect(ctx.model).toBe(originalModel);
  });
});
