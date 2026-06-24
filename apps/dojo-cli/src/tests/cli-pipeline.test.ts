import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandPipeline, tokenizeInput } from '../pipeline/command-pipeline.js';
import { BaseCommand, createCommandContext, type CommandContext } from '../commands/base-command.js';
import { ModelPayloadSchema, type ModelPayload } from '../schemas/payload-schemas.js';
import * as render from '../tui/render.js';

// Native vitest mocks for the UI utilities to prevent printing to stdout during tests
vi.mock('../tui/render.js', () => ({
  renderError: vi.fn(),
  renderSuccess: vi.fn(),
  renderSpinner: vi.fn(),
  updateSpinner: vi.fn(),
}));

// A dummy command specifically for testing the pipeline and schemas
class DummyModelCommand extends BaseCommand<ModelPayload> {
  readonly name = 'model';
  readonly description = 'Dummy model command for testing';

  async execute(ctx: CommandContext, payload: ModelPayload): Promise<void> {
    if (payload.args.length > 0) {
      ctx.model = payload.args[0];
    }
  }

  protected async getSchema() {
    return ModelPayloadSchema;
  }
}

describe('tokenizeInput', () => {
  it('tokenizes simple inputs', () => {
    expect(tokenizeInput('/model claude-3')).toEqual(['/model', 'claude-3']);
  });

  it('handles double quotes', () => {
    expect(tokenizeInput('/plan "my big feature"')).toEqual(['/plan', 'my big feature']);
  });

  it('handles single quotes', () => {
    expect(tokenizeInput("/commit 'fix: something'")).toEqual(['/commit', 'fix: something']);
  });

  it('handles escaped characters', () => {
    expect(tokenizeInput('/say hello\\ world')).toEqual(['/say', 'hello world']);
  });
});

describe('CommandPipeline', () => {
  let pipeline: CommandPipeline;
  let ctx: CommandContext;

  beforeEach(() => {
    pipeline = new CommandPipeline();
    ctx = createCommandContext();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseInput', () => {
    it('throws if input is empty', () => {
      expect(() => pipeline.parseInput('   ')).toThrow('El comando no puede estar vacío.');
    });

    it('throws if it does not start with a slash', () => {
      expect(() => pipeline.parseInput('model claude-3')).toThrow('Todos los comandos interactivos deben comenzar con una barra (/)');
    });

    it('throws on invalid command names', () => {
      expect(() => pipeline.parseInput('/invalidName!')).toThrow(/Nombre de comando inválido/);
    });

    it('parses basic command without args', () => {
      const result = pipeline.parseInput('/help');
      expect(result.commandName).toBe('help');
      expect(result.args).toEqual([]);
      expect(result.flags).toEqual({});
    });

    it('parses command with args and flags', () => {
      const result = pipeline.parseInput('/model claude-3 --fast --effort=max -v');
      expect(result.commandName).toBe('model');
      expect(result.args).toEqual(['claude-3']);
      expect(result.flags).toEqual({
        fast: true,
        effort: 'max',
        v: true,
      });
    });

    it('parses positional-only arguments after --', () => {
      const result = pipeline.parseInput('/batch --stop-on-error -- --fast --effort=max');
      expect(result.commandName).toBe('batch');
      expect(result.args).toEqual(['--fast', '--effort=max']);
      expect(result.flags).toEqual({
        'stop-on-error': true,
      });
    });
  });

  describe('execute', () => {
    let command: DummyModelCommand;

    beforeEach(() => {
      command = new DummyModelCommand();
      pipeline.registerCommand(command);
    });

    it('rejects unrecognized commands', async () => {
      await pipeline.execute('/unknown', ctx);
      expect(render.renderError).toHaveBeenCalledWith(expect.stringContaining('Comando no reconocido'));
    });

    it('rejects invalid payloads based on Zod schema', async () => {
      // ModelPayloadSchema expects args to have max length 1
      await pipeline.execute('/model gemini-3.5-flash extra-arg', ctx);
      expect(render.renderError).toHaveBeenCalledWith(expect.stringContaining('Error de validación'));
    });

    it('executes middleware pipeline sequentially', async () => {
      const order: string[] = [];
      
      pipeline.use(async (context, payload, next) => {
        order.push('mw1_before');
        await next();
        order.push('mw1_after');
      });

      pipeline.use(async (context, payload, next) => {
        order.push('mw2_before');
        await next();
        order.push('mw2_after');
      });

      // Override execute to track when it runs
      const executeSpy = vi.spyOn(command, 'execute').mockImplementation(async () => {
        order.push('execute');
      });

      await pipeline.execute('/model gemini-3.5-flash', ctx);

      expect(order).toEqual([
        'mw1_before',
        'mw2_before',
        'execute',
        'mw2_after',
        'mw1_after',
      ]);
      expect(executeSpy).toHaveBeenCalled();
    });

    it('executes command and modifies context successfully', async () => {
      expect(ctx.model).toBe('claude-sonnet-4-6'); // Default from createCommandContext
      
      await pipeline.execute('/model deepseek-v4-flash', ctx);
      
      expect(ctx.model).toBe('deepseek-v4-flash');
      expect(render.renderError).not.toHaveBeenCalled();
    });

    it('handles command execution errors gracefully', async () => {
      vi.spyOn(command, 'execute').mockRejectedValue(new Error('Test execution error'));
      
      // Since it's a test for an expected throw, we can expect the throw
      await expect(pipeline.execute('/model gemini-3.5-flash', ctx)).rejects.toThrow('Test execution error');
      expect(render.renderError).toHaveBeenCalledWith(expect.stringContaining('Error ejecutando /model: Test execution error'));
    });
  });
});
