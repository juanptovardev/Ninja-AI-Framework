import type { Logger } from '@ninja/logging';
import { BaseCommand, type CommandContext } from '../commands/base-command.js';
import type { BaseCommandPayload } from '../schemas/payload-schemas.js';
import { renderError } from '../tui/render.js';

export type CommandMiddleware = (
  ctx: CommandContext,
  payload: BaseCommandPayload,
  next: () => Promise<void>
) => Promise<void>;

export function tokenizeInput(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inDoubleQuotes = false;
  let inSingleQuotes = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (char === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if (char === ' ' && !inDoubleQuotes && !inSingleQuotes) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export class CommandPipeline {
  private readonly commands = new Map<string, BaseCommand>();
  private readonly middlewares: CommandMiddleware[] = [];

  constructor(logger?: Logger) {
    this.use(this.createTimingMiddleware());
    this.use(this.createLoggingMiddleware(logger));
  }

  public registerCommand(command: BaseCommand): void {
    const name = command.name.toLowerCase();
    if (this.commands.has(name)) {
      throw new Error(`El comando /${name} ya está registrado.`);
    }
    this.commands.set(name, command);
  }

  public use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware);
  }

  public getRegisteredCommands(): BaseCommand[] {
    return Array.from(this.commands.values());
  }

  public parseInput(rawInput: string): BaseCommandPayload {
    const trimmed = rawInput.trim();
    if (trimmed.length === 0) {
      throw new Error('El comando no puede estar vacío.');
    }

    const tokens = tokenizeInput(trimmed);
    if (tokens.length === 0) {
      throw new Error('El comando no puede estar vacío.');
    }

    const rawCommandName = tokens[0];
    if (!rawCommandName.startsWith('/')) {
      throw new Error(
        'Todos los comandos interactivos deben comenzar con una barra (/)',
      );
    }

    const commandName = rawCommandName.slice(1).toLowerCase();

    if (!/^[a-z][a-z0-9-]*$/.test(commandName)) {
      throw new Error(
        `Nombre de comando inválido: "/${commandName}". Usa kebab-case (ej. /code-review).`,
      );
    }

    const args: string[] = [];
    const flags: Record<string, string | boolean | number> = {};
    let positionalOnly = false;

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];

      if (token === '--' && !positionalOnly) {
        positionalOnly = true;
        continue;
      }

      if (positionalOnly) {
        args.push(token);
        continue;
      }

      if (token.startsWith('--')) {
        const flagPart = token.slice(2);
        if (flagPart.length === 0) {
          positionalOnly = true;
          continue;
        }
        this.parseLongFlag(flagPart, flags, tokens, i, args);
        if (i < tokens.length && !tokens[i].startsWith('-')) {
          i++;
        }
        continue;
      }

      if (token.startsWith('-') && !/^-\d+(\.\d+)?$/.test(token)) {
        const flagPart = token.slice(1);
        if (flagPart.length === 0) {
          args.push(token);
          continue;
        }
        this.parseShortFlags(flagPart, flags, tokens, i, args);
        if (i < tokens.length && !tokens[i].startsWith('-')) {
          i++;
        }
        continue;
      }

      args.push(token);
    }

    return {
      rawInput,
      commandName,
      args,
      flags,
    };
  }

  public async execute(
    rawInput: string,
    ctx: CommandContext,
  ): Promise<void> {
    let payload: BaseCommandPayload;
    try {
      payload = this.parseInput(rawInput);
    } catch (error) {
      renderError((error as Error).message);
      return;
    }

    const command = this.commands.get(payload.commandName);
    if (!command) {
      renderError(
        `Comando no reconocido: /${payload.commandName}. Escribe /help para ver la lista de comandos.`,
      );
      return;
    }

    const validationResult = await command.validate(payload);
    if (!validationResult.success) {
      const zodError = validationResult.error;
      const formattedErrors = zodError.errors
        .map(
          (err) =>
            `  - [${err.path.join('.') || 'payload'}]: ${err.message}`,
        )
        .join('\n');
      renderError(
        `Error de validación para el comando /${payload.commandName}:\n${formattedErrors}`,
      );
      return;
    }

    const validatedPayload = validationResult.data;

    let shouldProceed: boolean;
    try {
      shouldProceed = await command.beforeExecute(ctx, validatedPayload);
    } catch (error) {
      renderError(
        `Error en pre-ejecución de /${payload.commandName}: ${(error as Error).message}`,
      );
      return;
    }

    if (!shouldProceed) {
      return;
    }

    let executeError: Error | undefined;

    try {
      let mwIndex = 0;
      const runner = async (): Promise<void> => {
        if (mwIndex < this.middlewares.length) {
          const middleware = this.middlewares[mwIndex];
          mwIndex++;
          await middleware(ctx, validatedPayload, runner);
        } else {
          await command.execute(ctx, validatedPayload);
        }
      };

      await runner();
    } catch (error) {
      executeError = error as Error;
      renderError(
        `Error ejecutando /${payload.commandName}: ${executeError.message}`,
      );
    } finally {
      if (!executeError || command.executeAlwaysRunAfter) {
        try {
          await command.afterExecute(ctx, validatedPayload, executeError);
        } catch (postError) {
          console.error(
            'Error en post-ejecución del comando /' +
              payload.commandName +
              ':',
            postError,
          );
        }
      }
    }

    if (executeError) {
      throw executeError;
    }
  }

  private parseLongFlag(
    flagPart: string,
    flags: Record<string, string | boolean | number>,
    tokens: string[],
    i: number,
    _args: string[],
  ): void {
    if (flagPart.includes('=')) {
      const eqIdx = flagPart.indexOf('=');
      const key = flagPart.substring(0, eqIdx);
      const rawVal = flagPart.substring(eqIdx + 1);
      flags[key] = this.coerceFlagValue(rawVal);
      return;
    }

    const key = flagPart;
    if (
      i + 1 < tokens.length &&
      !tokens[i + 1].startsWith('-') &&
      tokens[i + 1] !== '--'
    ) {
      const rawVal = tokens[i + 1];
      flags[key] = this.coerceFlagValue(rawVal);
    } else {
      flags[key] = true;
    }
  }

  private parseShortFlags(
    flagPart: string,
    flags: Record<string, string | boolean | number>,
    tokens: string[],
    i: number,
    _args: string[],
  ): void {
    if (flagPart.includes('=')) {
      const eqIdx = flagPart.indexOf('=');
      const key = flagPart.substring(0, eqIdx);
      const rawVal = flagPart.substring(eqIdx + 1);
      flags[key] = this.coerceFlagValue(rawVal);
      return;
    }

    if (flagPart.length === 1) {
      if (
        i + 1 < tokens.length &&
        !tokens[i + 1].startsWith('-') &&
        tokens[i + 1] !== '--'
      ) {
        const rawVal = tokens[i + 1];
        flags[flagPart] = this.coerceFlagValue(rawVal);
      } else {
        flags[flagPart] = true;
      }
      return;
    }

    for (let j = 0; j < flagPart.length; j++) {
      flags[flagPart[j]] = true;
    }
  }

  private coerceFlagValue(val: string): string | boolean | number {
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;
    if (/^-?\d+$/.test(val)) return Number(val);
    if (/^-?\d+\.\d+$/.test(val)) return Number(val);
    return val;
  }

  private createTimingMiddleware(): CommandMiddleware {
    return async (ctx, _payload, next) => {
      const startTime = Date.now();
      try {
        await next();
      } finally {
        ctx.sessionMetadata.lastCommandDurationMs =
          Date.now() - startTime;
      }
    };
  }

  private createLoggingMiddleware(
    logger?: Logger,
  ): CommandMiddleware {
    if (!logger) {
      return async (_ctx, _payload, next) => next();
    }

    return async (ctx, payload, next) => {
      logger.info(`/${payload.commandName}`, {
        args: payload.args,
        flags: Object.keys(payload.flags),
        workspaceId: ctx.currentWorkspaceId,
      });
      try {
        await next();
      } finally {
        logger.debug(`/${payload.commandName} completado`, {
          durationMs: ctx.sessionMetadata.lastCommandDurationMs,
        });
      }
    };
  }
}
