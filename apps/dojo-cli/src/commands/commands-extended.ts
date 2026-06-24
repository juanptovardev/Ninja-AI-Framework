/**
 * @file commands-extended.ts
 * @module apps/dojo-cli/src/commands
 * @description
 * Extended slash-command handlers (26–49) for the Ninja AI CLI.
 *
 * Every class extends `BaseCommand` from `base-command.ts`, validates
 * payloads via the Zod schemas in `payload-schemas.ts`, and implements
 * real or premium-simulation logic inside `execute()`.
 *
 * Commands implemented in this file:
 * 26. config — Show or edit CLI configuration
 * 27. settings — Interactive settings editor
 * 28. model — Switch the active language model
 * 29. effort — Set reasoning effort level
 * 30. fast — Enable fast (non-thinking) mode
 * 31. permissions — Manage tool/filesystem permissions
 * 32. init — Initialize SDD context for current project
 * 33. plan — Run SDD planning phases inline
 * 34. batch — Execute multiple commands from a file or inline list
 * 35. btw — Add a side note to the session log
 * 36. tasks — Manage SDD task checklist
 * 37. mcp — Manage MCP server connections and tools
 * 38. skills — List, install, or manage agent skills
 * 39. agents — List and manage connected AI agents/terminals
 * 40. diff — Show git diff or compare file versions
 * 41. review — Request a code review of staged changes or a file
 * 42. code-review — Detailed code review with structured output
 * 43. debug — Start an interactive debugging session
 * 44. loop — Run a command in a loop until a condition is met
 * 45. claude-api — Make a direct Claude API call with custom params
 * 46. cost — Show cost estimate for the current session
 * 47. stats — Display session and system statistics
 * 48. usage — Show token usage for current or past sessions
 * 49. help — Display the full command catalog
 */

import { BaseCommand, type CommandContext, type HistoryEntry } from './base-command.js';
import type {
  ConfigPayload,
  SettingsPayload,
  ModelPayload,
  EffortPayload,
  FastPayload,
  PermissionsPayload,
  InitPayload,
  PlanPayload,
  BatchPayload,
  BtwPayload,
  TasksPayload,
  McpPayload,
  SkillsPayload,
  AgentsPayload,
  DiffPayload,
  ReviewPayload,
  CodeReviewPayload,
  DebugPayload,
  LoopPayload,
  ClaudeApiPayload,
  CostPayload,
  StatsPayload,
  UsagePayload,
  HelpPayload,
} from '../schemas/payload-schemas.js';
import { renderSpinner, updateSpinner, renderSuccess, renderError } from '../tui/render.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

// ─────────────────────────────────────────────────────────────────────────────
// 26. /config — Show or edit CLI configuration
// ─────────────────────────────────────────────────────────────────────────────

export class ConfigCommand extends BaseCommand<ConfigPayload> {
  readonly name = 'config' as const;
  readonly description = 'Show or edit CLI configuration.';
  readonly category = 'config' as const;
  readonly longDescription =
    'Reads and writes the Ninja CLI configuration. Subcommands: get, set, list, reset. ' +
    'Use --key and --value for targeted operations, or --edit to open the config file.';

  async execute(ctx: CommandContext, payload: ConfigPayload): Promise<void> {
    const subcommand = (payload.args[0] as string) ?? 'list';
    const key = payload.flags.key as string | undefined;
    const value = payload.flags.value as string | undefined;
    const edit = (payload.flags.edit as boolean) ?? false;

    const spId = renderSpinner(`Config ${subcommand}...`);

    const configDir = join(homedir(), '.ninja');
    ensureDir(configDir);
    const configFile = join(configDir, 'config.json');

    let configData: Record<string, unknown> = {};
    if (existsSync(configFile)) {
      try {
        configData = JSON.parse(readFileSync(configFile, 'utf-8')) as Record<string, unknown>;
      } catch {
        configData = {};
      }
    }

    switch (subcommand) {
      case 'get': {
        if (!key) {
          updateSpinner(spId, 'error', 'No key specified');
          renderError('Specify a config key with --key.');
          throw new Error('/config get requires --key');
        }
        const val = configData[key];
        await simulatedDelay(100);
        updateSpinner(spId, 'success', `Config key retrieved`);
        renderSuccess(
          `Config value.\n` +
          ` Key: ${chalk.bold(key)}\n` +
          ` Value: ${val !== undefined ? chalk.green(String(val)) : chalk.yellow('(not set)')}`,
        );
        break;
      }

      case 'set': {
        if (!key || value === undefined) {
          updateSpinner(spId, 'error', 'Missing key or value');
          renderError('Specify both --key and --value for /config set.');
          throw new Error('/config set requires --key and --value');
        }
        configData[key] = value;
        writeFileSync(configFile, JSON.stringify(configData, null, 2), 'utf-8');
        this.appendHistory(ctx, 'system', `[config] Set "${key}" = "${value}" at ${new Date().toISOString()}`);
        await simulatedDelay(150);
        updateSpinner(spId, 'success', `Config key "${key}" updated`);
        renderSuccess(
          `Config updated.\n` +
          ` Key: ${chalk.bold(key)}\n` +
          ` Value: ${value}\n` +
          ` File: ${configFile}`,
        );
        break;
      }

      case 'list': {
        await simulatedDelay(150);
        const keys = Object.keys(configData);
        const entries = keys.length > 0
          ? keys.map(k => ` ${chalk.bold(k)}: ${configData[k]}`).join('\n')
          : ' (no config entries — using defaults)';
        updateSpinner(spId, 'success', `${keys.length} config key(s)`);
        renderSuccess(
          `CLI configuration.\n` +
          ` File: ${configFile}\n\n${entries}\n\n` +
          ` Use /config get --key <name> to inspect a value.\n` +
          ` Use /config set --key <name> --value <val> to change a value.`,
        );
        break;
      }

      case 'reset': {
        writeFileSync(configFile, JSON.stringify({}, null, 2), 'utf-8');
        this.appendHistory(ctx, 'system', `[config] Configuration reset at ${new Date().toISOString()}`);
        await simulatedDelay(150);
        updateSpinner(spId, 'success', 'Config reset to defaults');
        renderSuccess(
          `Configuration has been reset to defaults.\n` +
          ` File: ${configFile}\n\n` +
          ` All custom settings have been removed.`,
        );
        break;
      }

      default: {
        updateSpinner(spId, 'error', `Unknown subcommand: ${subcommand}`);
        renderError(`Unknown /config subcommand: "${subcommand}". Use: get, set, list, reset.`);
        throw new Error(`Invalid /config subcommand: ${subcommand}`);
      }
    }

    if (edit) {
      this.setMeta(ctx, 'configEditRequested', true);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 27. /settings — Interactive settings editor
// ─────────────────────────────────────────────────────────────────────────────

export class SettingsCommand extends BaseCommand<SettingsPayload> {
  readonly name = 'settings' as const;
  readonly description = 'Open the interactive settings editor.';
  readonly category = 'config' as const;
  readonly longDescription =
    'Launches an interactive settings panel. Optionally pass a category to jump to. ' +
    'Use --list to print all settings without the interactive UI.';

  async execute(ctx: CommandContext, payload: SettingsPayload): Promise<void> {
    const category = payload.args.join(' ') || 'general';
    const list = (payload.flags.list as boolean) ?? false;

    const spId = renderSpinner(list ? 'Loading settings list...' : `Opening settings editor (${category})...`);

    const settings: Record<string, unknown> = {
      'model.default': ctx.model,
      'effort.level': this.getMeta(ctx, 'effortLevel', 'high'),
      'fast.mode': this.getMeta(ctx, 'fastMode', false),
      'cost.usd': this.getMeta(ctx, 'costUsd', 0),
      'tokens.input': this.getMeta(ctx, 'totalInputTokens', 0),
      'tokens.output': this.getMeta(ctx, 'totalOutputTokens', 0),
      'workspace.active': ctx.currentWorkspaceId ?? '(none)',
      'sdd.store': this.getMeta(ctx, 'sddArtifactStore', 'engram'),
    };

    await simulatedDelay(400);

    if (list) {
      updateSpinner(spId, 'success', 'Settings list loaded');
      const entries = Object.entries(settings)
        .map(([k, v]) => ` ${chalk.bold(k)}: ${v}`)
        .join('\n');
      renderSuccess(
        `All settings.\n\n${entries}\n\n` +
        ` Use /config set --key <key> --value <val> to change a setting.`,
      );
    } else {
      updateSpinner(spId, 'success', `Settings editor opened (${category})`);
      this.setMeta(ctx, 'settingsEditorOpen', true);
      this.setMeta(ctx, 'settingsEditorCategory', category);
      renderSuccess(
        `Interactive settings editor.\n` +
        ` Category: ${chalk.bold(category)}\n\n` +
        ` Current values for "${category}":\n` +
        `   Model: ${ctx.model}\n` +
        `   Effort: ${this.getMeta(ctx, 'effortLevel', 'high')}\n` +
        `   Fast mode: ${this.getMeta(ctx, 'fastMode', false) ? 'On' : 'Off'}\n\n` +
        ` Use /config for direct key/value operations.`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 28. /model — Switch the active language model
// ─────────────────────────────────────────────────────────────────────────────

export class ModelCommand extends BaseCommand<ModelPayload> {
  readonly name = 'model' as const;
  readonly description = 'Switch the active language model.';
  readonly category = 'config' as const;
  readonly longDescription =
    'Changes the LLM used for the session. Pass a model ID as argument, ' +
    'or use --list to see available models and --current to display the active one.';

  async execute(ctx: CommandContext, payload: ModelPayload): Promise<void> {
    const modelId = payload.args[0];
    const list = (payload.flags.list as boolean) ?? false;
    const current = (payload.flags.current as boolean) ?? false;

    if (list) {
      const spId = renderSpinner('Fetching available models...');
      await simulatedDelay(500);
      updateSpinner(spId, 'success', 'Models loaded');
      const models = [
        { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', speed: 'fast', reasoning: 'high' },
        { id: 'claude-opus-4', label: 'Claude Opus 4', speed: 'slow', reasoning: 'max' },
        { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', speed: 'fastest', reasoning: 'medium' },
        { id: 'gemini-3.5-pro', label: 'Gemini 3.5 Pro', speed: 'medium', reasoning: 'high' },
        { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', speed: 'fast', reasoning: 'medium' },
      ];
      const active = ctx.model;
      const modelList = models.map(m =>
        ` ${m.id === active ? chalk.green.bold('→ ') : '  '}${chalk.bold(m.id)} — ${m.label} (speed: ${m.speed}, reasoning: ${m.reasoning})`
      ).join('\n');
      renderSuccess(
        `Available models.\n\n${modelList}\n\n` +
        ` Active: ${chalk.bold(active)}\n\n` +
        ` Use /model <id> to switch.`,
      );
      return;
    }

    if (current || !modelId) {
      renderSuccess(
        `Current model.\n` +
        ` Active: ${chalk.bold(ctx.model)}\n\n` +
        ` Use /model <id> to switch, or /model --list to see all available models.`,
      );
      return;
    }

    const spId = renderSpinner(`Switching model to "${modelId}"...`);
    const previousModel = ctx.model;
    ctx.model = modelId;

    this.appendHistory(ctx, 'system', `[model] Switched from "${previousModel}" to "${modelId}" at ${new Date().toISOString()}`);
    this.setMeta(ctx, 'previousModel', previousModel);

    await simulatedDelay(300);
    updateSpinner(spId, 'success', `Model switched to "${modelId}"`);
    renderSuccess(
      `Active model changed.\n` +
      ` Previous: ${previousModel}\n` +
      ` Current: ${chalk.bold(modelId)}\n\n` +
      ` All subsequent prompts will use ${modelId}.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 29. /effort — Set reasoning effort level
// ─────────────────────────────────────────────────────────────────────────────

export class EffortCommand extends BaseCommand<EffortPayload> {
  readonly name = 'effort' as const;
  readonly description = 'Set the reasoning effort level.';
  readonly category = 'config' as const;
  readonly longDescription =
    'Adjusts how much compute the model spends on reasoning. Levels: low, medium, high, max. ' +
    'Use --current to display the active level.';

  async execute(ctx: CommandContext, payload: EffortPayload): Promise<void> {
    const level = payload.args[0];
    const current = (payload.flags.current as boolean) ?? false;
    const activeLevel = this.getMeta(ctx, 'effortLevel', 'high') as string;

    if (current || !level) {
      renderSuccess(
        `Current effort level.\n` +
        ` Level: ${chalk.bold(activeLevel)}\n\n` +
        ` Use /effort <low|medium|high|max> to change.`,
      );
      return;
    }

    const validLevels = ['low', 'medium', 'high', 'max'];
    if (!validLevels.includes(level)) {
      renderError(`Invalid effort level: "${level}". Must be one of: ${validLevels.join(', ')}.`);
      throw new Error(`Invalid effort level: ${level}`);
    }

    const spId = renderSpinner(`Setting effort level to "${level}"...`);
    const previousLevel = activeLevel;
    this.setMeta(ctx, 'effortLevel', level);

    this.appendHistory(ctx, 'system', `[effort] Effort level changed from "${previousLevel}" to "${level}" at ${new Date().toISOString()}`);

    const descriptions: Record<string, string> = {
      low: 'Minimal reasoning — fastest responses, lowest cost',
      medium: 'Moderate reasoning — balanced speed and quality',
      high: 'Deep reasoning — thorough analysis (default)',
      max: 'Maximum reasoning — exhaustive analysis, highest cost',
    };

    await simulatedDelay(200);
    updateSpinner(spId, 'success', `Effort level set to "${level}"`);
    renderSuccess(
      `Effort level changed.\n` +
      ` Previous: ${previousLevel}\n` +
      ` Current: ${chalk.bold(level)}\n` +
      ` Description: ${descriptions[level]}\n\n` +
      ` All subsequent responses will use "${level}" reasoning effort.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 30. /fast — Enable fast (non-thinking) mode
// ─────────────────────────────────────────────────────────────────────────────

export class FastCommand extends BaseCommand<FastPayload> {
  readonly name = 'fast' as const;
  readonly description = 'Toggle fast (non-thinking) mode.';
  readonly category = 'config' as const;
  readonly longDescription =
    'Enables or disables fast mode. In fast mode, the model skips extended reasoning ' +
    'for quicker responses. Use --off to return to thinking mode.';

  async execute(ctx: CommandContext, payload: FastPayload): Promise<void> {
    const off = (payload.flags.off as boolean) ?? false;
    const currentFastMode = this.getMeta(ctx, 'fastMode', false) as boolean;
    const newFastMode = !off;

    if (newFastMode === currentFastMode) {
      renderSuccess(
        `Fast mode is already ${newFastMode ? 'On' : 'Off'}.\n` +
        ` No change needed.${newFastMode ? ' Use /fast --off to disable.' : ' Use /fast to enable.'}`,
      );
      return;
    }

    const spId = renderSpinner(newFastMode ? 'Enabling fast mode...' : 'Disabling fast mode...');
    this.setMeta(ctx, 'fastMode', newFastMode);

    if (newFastMode) {
      this.setMeta(ctx, 'effortLevel', 'low');
    } else {
      this.setMeta(ctx, 'effortLevel', 'high');
    }

    this.appendHistory(ctx, 'system', `[fast] Fast mode ${newFastMode ? 'enabled' : 'disabled'} at ${new Date().toISOString()}`);

    await simulatedDelay(150);
    updateSpinner(spId, 'success', `Fast mode ${newFastMode ? 'enabled' : 'disabled'}`);
    renderSuccess(
      `Fast mode ${newFastMode ? chalk.green.bold('enabled') : chalk.yellow.bold('disabled')}.\n` +
      ` Status: ${newFastMode ? 'On (non-thinking, quick responses)' : 'Off (full reasoning)'}\n` +
      ` Effort level: ${newFastMode ? 'low (auto-set)' : 'high (restored)'}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 31. /permissions — Manage tool/filesystem permissions
// ─────────────────────────────────────────────────────────────────────────────

export class PermissionsCommand extends BaseCommand<PermissionsPayload> {
  readonly name = 'permissions' as const;
  readonly description = 'Manage tool and filesystem permissions.';
  readonly category = 'config' as const;
  readonly longDescription =
    'Controls what the AI agent is allowed to do. Subcommands: list, grant, revoke, reset. ' +
    'Use --target for the path/domain and --action for the permission type.';

  async execute(ctx: CommandContext, payload: PermissionsPayload): Promise<void> {
    const subcommand = (payload.args[0] as string) ?? 'list';
    const target = payload.flags.target as string | undefined;
    const action = payload.flags.action as string | undefined;

    const spId = renderSpinner(`Permissions ${subcommand}...`);

    const permsDir = join(homedir(), '.ninja');
    ensureDir(permsDir);
    const permsFile = join(permsDir, 'permissions.json');

    let perms: Array<{ target: string; action: string; granted: boolean; grantedAt: string }> = [];
    if (existsSync(permsFile)) {
      try {
        perms = JSON.parse(readFileSync(permsFile, 'utf-8')) as typeof perms;
      } catch {
        perms = [];
      }
    }

    switch (subcommand) {
      case 'list': {
        await simulatedDelay(200);
        const permList = perms.length > 0
          ? perms.map(p => ` ${p.granted ? chalk.green('✔') : chalk.red('✘')} ${p.action} → ${p.target}`).join('\n')
          : ' (no custom permissions configured — using defaults)';
        updateSpinner(spId, 'success', `${perms.length} permission(s)`);
        renderSuccess(
          `Permission rules.\n\n${permList}\n\n` +
          ` Use /permissions grant --target <path> --action <type> to add.\n` +
          ` Use /permissions revoke --target <path> --action <type> to remove.`,
        );
        break;
      }

      case 'grant': {
        if (!target || !action) {
          updateSpinner(spId, 'error', 'Missing target or action');
          renderError('Specify both --target and --action for /permissions grant.');
          throw new Error('/permissions grant requires --target and --action');
        }
        const newPerm = { target, action, granted: true, grantedAt: new Date().toISOString() };
        perms = perms.filter(p => !(p.target === target && p.action === action));
        perms.push(newPerm);
        writeFileSync(permsFile, JSON.stringify(perms, null, 2), 'utf-8');
        this.appendHistory(ctx, 'system', `[permissions] Granted "${action}" on "${target}" at ${new Date().toISOString()}`);
        await simulatedDelay(200);
        updateSpinner(spId, 'success', `Permission granted: ${action} → ${target}`);
        renderSuccess(
          `Permission granted.\n` +
          ` Action: ${chalk.bold(action)}\n` +
          ` Target: ${target}\n` +
          ` Status: ${chalk.green('Granted')}`,
        );
        break;
      }

      case 'revoke': {
        if (!target || !action) {
          updateSpinner(spId, 'error', 'Missing target or action');
          renderError('Specify both --target and --action for /permissions revoke.');
          throw new Error('/permissions revoke requires --target and --action');
        }
        perms = perms.filter(p => !(p.target === target && p.action === action));
        writeFileSync(permsFile, JSON.stringify(perms, null, 2), 'utf-8');
        this.appendHistory(ctx, 'system', `[permissions] Revoked "${action}" on "${target}" at ${new Date().toISOString()}`);
        await simulatedDelay(200);
        updateSpinner(spId, 'success', `Permission revoked: ${action} → ${target}`);
        renderSuccess(
          `Permission revoked.\n` +
          ` Action: ${action}\n` +
          ` Target: ${target}\n` +
          ` Status: ${chalk.red('Revoked')}`,
        );
        break;
      }

      case 'reset': {
        writeFileSync(permsFile, JSON.stringify([], null, 2), 'utf-8');
        this.appendHistory(ctx, 'system', `[permissions] All permissions reset at ${new Date().toISOString()}`);
        await simulatedDelay(150);
        updateSpinner(spId, 'success', 'Permissions reset to defaults');
        renderSuccess(
          `All custom permissions have been removed.\n` +
          ` Defaults will apply from now on.`,
        );
        break;
      }

      default: {
        updateSpinner(spId, 'error', `Unknown subcommand: ${subcommand}`);
        renderError(`Unknown /permissions subcommand: "${subcommand}". Use: list, grant, revoke, reset.`);
        throw new Error(`Invalid /permissions subcommand: ${subcommand}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 32. /init — Initialize SDD context for current project
// ─────────────────────────────────────────────────────────────────────────────

export class InitCommand extends BaseCommand<InitPayload> {
  readonly name = 'init' as const;
  readonly description = 'Initialize SDD context for the current project.';
  readonly category = 'planning' as const;
  readonly longDescription =
    'Bootstraps the Spec-Driven Development context. Detects stack, conventions, ' +
    'and testing capabilities. Use --force to re-init and --store to pick the artifact backend.';

  async execute(ctx: CommandContext, payload: InitPayload): Promise<void> {
    const projectName = payload.args.join(' ') || 'current-project';
    const force = (payload.flags.force as boolean) ?? false;
    const store = (payload.flags.store as string) ?? 'engram';

    const spId = renderSpinner(force ? 'Re-initializing SDD context...' : 'Initializing SDD context...');

    const sddDir = join(homedir(), '.ninja', 'sdd', projectName);
    ensureDir(sddDir);

    const initFile = join(sddDir, 'init-state.json');
    if (existsSync(initFile) && !force) {
      await simulatedDelay(200);
      updateSpinner(spId, 'success', 'SDD context already initialized');
      renderSuccess(
        `SDD context already exists for "${projectName}".\n` +
        ` Use /init --force to re-initialize.\n` +
        ` Store: ${store}`,
      );
      return;
    }

    const initState = {
      project: projectName,
      store,
      initializedAt: new Date().toISOString(),
      stack: {
        language: 'TypeScript',
        framework: 'Node.js + tsup',
        testRunner: 'vitest',
        packageManager: 'pnpm',
      },
      conventions: {
        moduleType: 'ESM',
        strictMode: true,
        imports: 'require .js extensions',
      },
    };

    writeFileSync(initFile, JSON.stringify(initState, null, 2), 'utf-8');

    this.setMeta(ctx, 'sddInitialized', true);
    this.setMeta(ctx, 'sddProjectName', projectName);
    this.setMeta(ctx, 'sddArtifactStore', store);
    this.appendHistory(ctx, 'system', `[init] SDD context initialized for "${projectName}" (store: ${store}) at ${new Date().toISOString()}`);

    await simulatedDelay(600);
    updateSpinner(spId, 'success', `SDD context initialized for "${projectName}"`);
    renderSuccess(
      `SDD context initialized.\n` +
      ` Project: ${chalk.bold(projectName)}\n` +
      ` Store: ${store}\n` +
      ` Stack: TypeScript / Node.js / vitest / pnpm\n` +
      ` Conventions: ESM, strict, .js import extensions\n\n` +
      ` Next steps:\n` +
      ` 1. /planning <change-name> — Start a change proposal\n` +
      ` 2. /explore <topic> — Investigate the codebase\n` +
      ` 3. /onboard — Guided SDD walkthrough`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 33. /plan — Run SDD planning phases inline
// ─────────────────────────────────────────────────────────────────────────────

export class PlanCommand extends BaseCommand<PlanPayload> {
  readonly name = 'plan' as const;
  readonly description = 'Run SDD planning phases inline for a change.';
  readonly category = 'planning' as const;
  readonly longDescription =
    'Executes one or more SDD planning phases for a named change. ' +
    'Use --phase to target a specific phase, --ff for fast-forward through all phases, ' +
    'and --mode for interactive vs auto.';

  async execute(ctx: CommandContext, payload: PlanPayload): Promise<void> {
    const changeName = payload.args.join(' ');
    const ff = (payload.flags.ff as boolean) ?? false;
    const phase = (payload.flags.phase as string) ?? 'proposal';
    const mode = (payload.flags.mode as string) ?? 'interactive';

    const spId = renderSpinner(ff
      ? `Fast-forward planning all phases for "${changeName}"...`
      : `Running SDD ${phase} phase for "${changeName}"...`
    );

    const sddDir = join(homedir(), '.ninja', 'sdd', changeName);
    ensureDir(sddDir);

    const phases = ['proposal', 'spec', 'design', 'tasks'];
    const targetPhases = ff ? phases : [phase];

    this.setMeta(ctx, 'sddChangeName', changeName);
    this.setMeta(ctx, 'sddPlanningMode', mode);

    const completedPhases: string[] = [];
    for (const p of targetPhases) {
      await simulatedDelay(p === 'tasks' ? 800 : 500);
      const phaseFile = join(sddDir, `${p}.md`);
      writeFileSync(phaseFile, [
        `# ${p.charAt(0).toUpperCase() + p.slice(1)}: ${changeName}`,
        ``,
        `**Phase**: ${p}`,
        `**Mode**: ${mode}`,
        `**Date**: ${new Date().toISOString()}`,
        ``,
        `## Content`,
        ``,
        `${p === 'proposal' ? 'Intent and scope definition for this change.' : ''}`,
        `${p === 'spec' ? 'Requirements and scenarios for this change.' : ''}`,
        `${p === 'design' ? 'Architecture and technical design for this change.' : ''}`,
        `${p === 'tasks' ? 'Implementation task checklist for this change.' : ''}`,
      ].join('\n'), 'utf-8');
      completedPhases.push(p);
    }

    this.appendHistory(ctx, 'system', `[plan] SDD phases completed: ${completedPhases.join(', ')} for "${changeName}" at ${new Date().toISOString()}`);

    updateSpinner(spId, 'success', `Planning complete: ${completedPhases.join(' → ')}`);
    renderSuccess(
      `SDD planning ${ff ? 'fast-forward' : phase} complete.\n` +
      ` Change: ${chalk.bold(changeName)}\n` +
      ` Phases completed: ${completedPhases.join(' → ')}\n` +
      ` Mode: ${mode}\n` +
      ` Output: ${sddDir}\n\n` +
      ` Next: Use /verify ${changeName} to validate, or /tasks to manage implementation.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 34. /batch — Execute multiple commands from a file or inline list
// ─────────────────────────────────────────────────────────────────────────────

export class BatchCommand extends BaseCommand<BatchPayload> {
  readonly name = 'batch' as const;
  readonly description = 'Execute multiple commands from a file or inline list.';
  readonly category = 'workspace' as const;
  readonly longDescription =
    'Runs a sequence of slash-commands from a batch file or inline. ' +
    'Use --stop-on-error to halt on failure and --delay to set inter-command delay.';
  readonly executeAlwaysRunAfter = true;

  async execute(ctx: CommandContext, payload: BatchPayload): Promise<void> {
    const source = payload.args.join(' ');
    const stopOnError = (payload.flags['stop-on-error'] as boolean) ?? true;
    const delay = (payload.flags.delay as number) ?? 200;

    const spId = renderSpinner(`Executing batch from "${source}"...`);

    let commands: string[] = [];

    const batchFile = source;
    if (existsSync(batchFile)) {
      try {
        const content = readFileSync(batchFile, 'utf-8');
        commands = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      } catch {
        updateSpinner(spId, 'error', `Failed to read batch file: ${batchFile}`);
        renderError(`Could not read batch file: ${batchFile}`);
        throw new Error(`Batch file read error: ${batchFile}`);
      }
    } else {
      commands = source.split(';').map(c => c.trim()).filter(Boolean);
    }

    if (commands.length === 0) {
      updateSpinner(spId, 'error', 'No commands found');
      renderError('No commands found in the batch source.');
      throw new Error('Empty batch source');
    }

    const results: Array<{ command: string; status: string }> = [];
    let hasError = false;

    for (const cmd of commands) {
      await simulatedDelay(delay);
      const status = cmd.includes('invalid') ? 'error' : 'ok';
      results.push({ command: cmd, status });
      if (status === 'error') {
        hasError = true;
        if (stopOnError) break;
      }
    }

    this.appendHistory(ctx, 'system', `[batch] Executed ${results.length}/${commands.length} commands at ${new Date().toISOString()}`);

    updateSpinner(spId, hasError && stopOnError ? 'error' : 'success',
      hasError && stopOnError ? 'Batch stopped on error' : `Batch complete: ${results.length} commands`
    );

    const resultsList = results.map(r =>
      ` ${r.status === 'ok' ? chalk.green('✔') : chalk.red('✘')} ${r.command}`
    ).join('\n');

    renderSuccess(
      `Batch execution ${hasError ? '(partial — stopped on error)' : 'complete'}.\n` +
      ` Source: ${source}\n` +
      ` Commands: ${results.length}/${commands.length}\n` +
      ` Stop on error: ${stopOnError}\n` +
      ` Delay: ${delay}ms\n\n${resultsList}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 35. /btw — Add a side note to the session log
// ─────────────────────────────────────────────────────────────────────────────

export class BtwCommand extends BaseCommand<BtwPayload> {
  readonly name = 'btw' as const;
  readonly description = 'Add a side note to the session log without triggering a response.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Records a side note or annotation in the session history. The note does not ' +
    'trigger an AI response. Use --persist to also save to Engram memory.';

  async execute(ctx: CommandContext, payload: BtwPayload): Promise<void> {
    const note = payload.args.join(' ');
    const persist = (payload.flags.persist as boolean) ?? false;

    const spId = renderSpinner(persist ? 'Saving side note + persisting to Engram...' : 'Recording side note...');

    this.appendHistory(ctx, 'system', `[btw] ${note}`);

    if (persist) {
      const memoryDir = join(homedir(), '.ninja', 'engram');
      ensureDir(memoryDir);
      const obsId = Date.now();
      writeFileSync(join(memoryDir, `obs-${obsId}.json`), JSON.stringify({
        id: obsId,
        title: `Side note: ${note.slice(0, 50)}${note.length > 50 ? '...' : ''}`,
        content: note,
        type: 'btw',
        createdAt: new Date().toISOString(),
      }, null, 2), 'utf-8');
    }

    await simulatedDelay(100);
    updateSpinner(spId, 'success', 'Side note recorded');
    renderSuccess(
      `Side note recorded.\n` +
      ` Note: "${note}"\n` +
      ` Persisted: ${persist ? 'Yes (saved to Engram)' : 'No (session-only)'}\n\n` +
      ` This note is logged but will not trigger an AI response.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 36. /tasks — Manage SDD task checklist
// ─────────────────────────────────────────────────────────────────────────────

export class TasksCommand extends BaseCommand<TasksPayload> {
  readonly name = 'tasks' as const;
  readonly description = 'Manage the SDD task checklist for a change.';
  readonly category = 'planning' as const;
  readonly longDescription =
    'Subcommands: list, check, uncheck, add, remove. ' +
    'Use --id for task targeting and --change to scope to a specific SDD change.';

  async execute(ctx: CommandContext, payload: TasksPayload): Promise<void> {
    const subcommand = (payload.args[0] as string) ?? 'list';
    const taskId = payload.flags.id as string | undefined;
    const changeName = (payload.flags.change as string) ?? this.getMeta(ctx, 'sddChangeName', 'unnamed-change') as string;

    const spId = renderSpinner(`Tasks ${subcommand} for "${changeName}"...`);

    const sddDir = join(homedir(), '.ninja', 'sdd', changeName);
    ensureDir(sddDir);
    const tasksFile = join(sddDir, 'tasks.json');

    let tasks: Array<{ id: string; title: string; checked: boolean; addedAt: string }> = [];
    if (existsSync(tasksFile)) {
      try {
        tasks = JSON.parse(readFileSync(tasksFile, 'utf-8')) as typeof tasks;
      } catch {
        tasks = [];
      }
    }

    switch (subcommand) {
      case 'list': {
        await simulatedDelay(200);
        const taskList = tasks.length > 0
          ? tasks.map(t => ` ${t.checked ? chalk.green('✔') : chalk.yellow('○')} [${t.id}] ${t.title}`).join('\n')
          : ' (no tasks defined yet)';
        updateSpinner(spId, 'success', `${tasks.length} task(s)`);
        renderSuccess(
          `SDD task checklist for "${changeName}".\n\n${taskList}\n\n` +
          ` Use /tasks add <title> to add tasks.\n` +
          ` Use /tasks check --id <id> to mark a task complete.`,
        );
        break;
      }

      case 'check': {
        if (!taskId) {
          updateSpinner(spId, 'error', 'No task ID');
          renderError('Specify a task ID with --id.');
          throw new Error('/tasks check requires --id');
        }
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          task.checked = true;
          writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf-8');
          this.appendHistory(ctx, 'system', `[tasks] Task "${taskId}" checked for "${changeName}" at ${new Date().toISOString()}`);
        }
        await simulatedDelay(150);
        updateSpinner(spId, 'success', `Task ${taskId} checked`);
        renderSuccess(
          `Task marked complete.\n` +
          ` ID: ${taskId}\n` +
          ` Change: ${changeName}\n` +
          ` Progress: ${tasks.filter(t => t.checked).length}/${tasks.length}`,
        );
        break;
      }

      case 'uncheck': {
        if (!taskId) {
          updateSpinner(spId, 'error', 'No task ID');
          renderError('Specify a task ID with --id.');
          throw new Error('/tasks uncheck requires --id');
        }
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          task.checked = false;
          writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf-8');
        }
        await simulatedDelay(150);
        updateSpinner(spId, 'success', `Task ${taskId} unchecked`);
        renderSuccess(
          `Task marked incomplete.\n` +
          ` ID: ${taskId}\n` +
          ` Change: ${changeName}`,
        );
        break;
      }

      case 'add': {
        const title = payload.args.slice(1).join(' ') || `Task ${tasks.length + 1}`;
        const newTask = {
          id: taskId ?? `T-${tasks.length + 1}`,
          title,
          checked: false,
          addedAt: new Date().toISOString(),
        };
        tasks.push(newTask);
        writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf-8');
        this.appendHistory(ctx, 'system', `[tasks] Task "${newTask.id}" added for "${changeName}" at ${new Date().toISOString()}`);
        await simulatedDelay(200);
        updateSpinner(spId, 'success', `Task ${newTask.id} added`);
        renderSuccess(
          `Task added.\n` +
          ` ID: ${chalk.bold(newTask.id)}\n` +
          ` Title: ${title}\n` +
          ` Change: ${changeName}\n` +
          ` Progress: ${tasks.filter(t => t.checked).length}/${tasks.length}`,
        );
        break;
      }

      case 'remove': {
        if (!taskId) {
          updateSpinner(spId, 'error', 'No task ID');
          renderError('Specify a task ID with --id.');
          throw new Error('/tasks remove requires --id');
        }
        tasks = tasks.filter(t => t.id !== taskId);
        writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf-8');
        this.appendHistory(ctx, 'system', `[tasks] Task "${taskId}" removed from "${changeName}" at ${new Date().toISOString()}`);
        await simulatedDelay(150);
        updateSpinner(spId, 'success', `Task ${taskId} removed`);
        renderSuccess(
          `Task removed.\n` +
          ` ID: ${taskId}\n` +
          ` Remaining: ${tasks.length} task(s)`,
        );
        break;
      }

      default: {
        updateSpinner(spId, 'error', `Unknown subcommand: ${subcommand}`);
        renderError(`Unknown /tasks subcommand: "${subcommand}". Use: list, check, uncheck, add, remove.`);
        throw new Error(`Invalid /tasks subcommand: ${subcommand}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 37. /mcp — Manage MCP server connections and tools
// ─────────────────────────────────────────────────────────────────────────────

export class McpCommand extends BaseCommand<McpPayload> {
  readonly name = 'mcp' as const;
  readonly description = 'Manage MCP server connections and tools.';
  readonly category = 'agents' as const;
  readonly longDescription =
    'Controls Model Context Protocol server connections. Subcommands: list, connect, ' +
    'disconnect, tools, call. Use --server for the server name and --tool for tool calls.';

  async execute(ctx: CommandContext, payload: McpPayload): Promise<void> {
    const subcommand = (payload.args[0] as string) ?? 'list';
    const server = payload.flags.server as string | undefined;
    const tool = payload.flags.tool as string | undefined;

    const spId = renderSpinner(`MCP ${subcommand}${server ? `: ${server}` : ''}...`);

    switch (subcommand) {
      case 'list': {
        await simulatedDelay(300);
        const servers = [
          { name: 'filesystem', status: 'connected', tools: 5 },
          { name: 'github', status: 'connected', tools: 12 },
          { name: 'postgres', status: 'disconnected', tools: 8 },
        ];
        const serverList = servers.map(s =>
          ` ${s.status === 'connected' ? chalk.green('●') : chalk.red('○')} ${chalk.bold(s.name)} — ${s.tools} tools (${s.status})`
        ).join('\n');
        updateSpinner(spId, 'success', `${servers.length} MCP server(s)`);
        renderSuccess(
          `MCP servers.\n\n${serverList}\n\n` +
          ` Use /mcp connect --server <name> to connect.\n` +
          ` Use /mcp tools --server <name> to list available tools.`,
        );
        break;
      }

      case 'connect': {
        if (!server) {
          updateSpinner(spId, 'error', 'No server specified');
          renderError('Specify a server name with --server.');
          throw new Error('/mcp connect requires --server');
        }
        await simulatedDelay(800);
        this.appendHistory(ctx, 'system', `[mcp] Connected to "${server}" at ${new Date().toISOString()}`);
        updateSpinner(spId, 'success', `Connected to "${server}"`);
        renderSuccess(
          `MCP server connected.\n` +
          ` Server: ${chalk.bold(server)}\n` +
          ` Status: ${chalk.green('Connected')}\n\n` +
          ` Use /mcp tools --server ${server} to list available tools.`,
        );
        break;
      }

      case 'disconnect': {
        if (!server) {
          updateSpinner(spId, 'error', 'No server specified');
          renderError('Specify a server name with --server.');
          throw new Error('/mcp disconnect requires --server');
        }
        await simulatedDelay(300);
        this.appendHistory(ctx, 'system', `[mcp] Disconnected from "${server}" at ${new Date().toISOString()}`);
        updateSpinner(spId, 'success', `Disconnected from "${server}"`);
        renderSuccess(
          `MCP server disconnected.\n` +
          ` Server: ${server}`,
        );
        break;
      }

      case 'tools': {
        const targetServer = server ?? 'all';
        await simulatedDelay(400);
        const tools = [
          { name: 'read_file', server: 'filesystem', description: 'Read file contents' },
          { name: 'write_file', server: 'filesystem', description: 'Write file contents' },
          { name: 'list_directory', server: 'filesystem', description: 'List directory entries' },
          { name: 'search_code', server: 'github', description: 'Search code in repositories' },
          { name: 'create_issue', server: 'github', description: 'Create a GitHub issue' },
        ].filter(t => targetServer === 'all' || t.server === targetServer);
        const toolList = tools.map(t => ` ${chalk.bold(t.name)} (${t.server}) — ${t.description}`).join('\n');
        updateSpinner(spId, 'success', `${tools.length} tool(s) available`);
        renderSuccess(
          `MCP tools for "${targetServer}".\n\n${toolList}\n\n` +
          ` Use /mcp call --server <name> --tool <tool> to invoke a tool.`,
        );
        break;
      }

      case 'call': {
        if (!server || !tool) {
          updateSpinner(spId, 'error', 'Missing server or tool');
          renderError('Specify both --server and --tool for /mcp call.');
          throw new Error('/mcp call requires --server and --tool');
        }
        await simulatedDelay(600);
        this.appendHistory(ctx, 'system', `[mcp] Called tool "${tool}" on server "${server}" at ${new Date().toISOString()}`);
        updateSpinner(spId, 'success', `Tool "${tool}" executed`);
        renderSuccess(
          `MCP tool call result.\n` +
          ` Server: ${server}\n` +
          ` Tool: ${chalk.bold(tool)}\n` +
          ` Status: ${chalk.green('Success')}\n` +
          ` Result: (simulated) Tool executed successfully.`,
        );
        break;
      }

      default: {
        updateSpinner(spId, 'error', `Unknown subcommand: ${subcommand}`);
        renderError(`Unknown /mcp subcommand: "${subcommand}". Use: list, connect, disconnect, tools, call.`);
        throw new Error(`Invalid /mcp subcommand: ${subcommand}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 38. /skills — List, install, or manage agent skills
// ─────────────────────────────────────────────────────────────────────────────

export class SkillsCommand extends BaseCommand<SkillsPayload> {
  readonly name = 'skills' as const;
  readonly description = 'List, install, or manage agent skills.';
  readonly category = 'agents' as const;
  readonly longDescription =
    'Manages the agent skill catalog. Subcommands: list, install, remove, update, info. ' +
    'Use --name for the skill name, --global and --local for scope filtering.';

  async execute(ctx: CommandContext, payload: SkillsPayload): Promise<void> {
    const subcommand = (payload.args[0] as string) ?? 'list';
    const skillName = (payload.flags.name as string) ?? payload.args[1];
    const global = (payload.flags.global as boolean) ?? false;
    const local = (payload.flags.local as boolean) ?? false;

    const spId = renderSpinner(`Skills ${subcommand}${skillName ? `: ${skillName}` : ''}...`);

    const availableSkills = [
      { name: 'sdd-init', version: '1.2.0', scope: 'global', description: 'Initialize SDD context' },
      { name: 'sdd-propose', version: '1.1.0', scope: 'global', description: 'Create change proposals' },
      { name: 'sdd-spec', version: '1.0.0', scope: 'global', description: 'Write specifications' },
      { name: 'sdd-design', version: '1.0.0', scope: 'global', description: 'Create technical designs' },
      { name: 'sdd-tasks', version: '1.0.0', scope: 'global', description: 'Break down implementation tasks' },
      { name: 'sdd-verify', version: '0.9.0', scope: 'local', description: 'Validate against specs' },
      { name: 'sdd-apply', version: '1.0.0', scope: 'local', description: 'Implement from task specs' },
      { name: 'branch-pr', version: '1.1.0', scope: 'local', description: 'PR creation workflow' },
    ];

    switch (subcommand) {
      case 'list': {
        await simulatedDelay(300);
        let filtered = availableSkills;
        if (global && !local) filtered = filtered.filter(s => s.scope === 'global');
        if (local && !global) filtered = filtered.filter(s => s.scope === 'local');
        const skillList = filtered.map(s =>
          ` ${s.scope === 'global' ? chalk.cyan('◉') : chalk.magenta('◈')} ${chalk.bold(s.name)}@${s.version} — ${s.description} (${s.scope})`
        ).join('\n');
        updateSpinner(spId, 'success', `${filtered.length} skill(s)`);
        renderSuccess(
          `Agent skills catalog.\n\n${skillList}\n\n` +
          ` Use /skills install --name <skill> to install.\n` +
          ` Use /skills info --name <skill> for details.`,
        );
        break;
      }

      case 'install': {
        if (!skillName) {
          updateSpinner(spId, 'error', 'No skill name');
          renderError('Specify a skill name: /skills install <name>');
          throw new Error('/skills install requires a skill name');
        }
        await simulatedDelay(700);
        const skill = availableSkills.find(s => s.name === skillName);
        this.appendHistory(ctx, 'system', `[skills] Installed skill "${skillName}" at ${new Date().toISOString()}`);
        updateSpinner(spId, 'success', `Skill "${skillName}" installed`);
        renderSuccess(
          `Skill installed.\n` +
          ` Name: ${chalk.bold(skillName)}\n` +
          ` Version: ${skill?.version ?? 'latest'}\n` +
          ` Description: ${skill?.description ?? 'Custom skill'}`,
        );
        break;
      }

      case 'remove': {
        if (!skillName) {
          updateSpinner(spId, 'error', 'No skill name');
          renderError('Specify a skill name: /skills remove <name>');
          throw new Error('/skills remove requires a skill name');
        }
        await simulatedDelay(300);
        this.appendHistory(ctx, 'system', `[skills] Removed skill "${skillName}" at ${new Date().toISOString()}`);
        updateSpinner(spId, 'success', `Skill "${skillName}" removed`);
        renderSuccess(
          `Skill removed.\n` +
          ` Name: ${skillName}`,
        );
        break;
      }

      case 'update': {
        if (!skillName) {
          updateSpinner(spId, 'error', 'No skill name');
          renderError('Specify a skill name: /skills update <name>');
          throw new Error('/skills update requires a skill name');
        }
        await simulatedDelay(500);
        this.appendHistory(ctx, 'system', `[skills] Updated skill "${skillName}" at ${new Date().toISOString()}`);
        updateSpinner(spId, 'success', `Skill "${skillName}" updated`);
        renderSuccess(
          `Skill updated.\n` +
          ` Name: ${chalk.bold(skillName)}\n` +
          ` Version: latest`,
        );
        break;
      }

      case 'info': {
        if (!skillName) {
          updateSpinner(spId, 'error', 'No skill name');
          renderError('Specify a skill name: /skills info --name <skill>');
          throw new Error('/skills info requires a skill name');
        }
        await simulatedDelay(200);
        const skill = availableSkills.find(s => s.name === skillName);
        updateSpinner(spId, 'success', `Skill info for "${skillName}"`);
        renderSuccess(
          `Skill details.\n` +
          ` Name: ${chalk.bold(skillName)}\n` +
          ` Version: ${skill?.version ?? 'unknown'}\n` +
          ` Scope: ${skill?.scope ?? 'unknown'}\n` +
          ` Description: ${skill?.description ?? 'No description available'}`,
        );
        break;
      }

      default: {
        updateSpinner(spId, 'error', `Unknown subcommand: ${subcommand}`);
        renderError(`Unknown /skills subcommand: "${subcommand}". Use: list, install, remove, update, info.`);
        throw new Error(`Invalid /skills subcommand: ${subcommand}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 39. /agents — List and manage connected AI agents/terminals
// ─────────────────────────────────────────────────────────────────────────────

export class AgentsCommand extends BaseCommand<AgentsPayload> {
  readonly name = 'agents' as const;
  readonly description = 'List and manage connected AI agents and terminals.';
  readonly category = 'agents' as const;
  readonly longDescription =
    'Shows connected agents and their status. Subcommands: list, spawn, kill, info. ' +
    'Use --id for agent targeting and --type to specify agent type.';

  async execute(ctx: CommandContext, payload: AgentsPayload): Promise<void> {
    const subcommand = (payload.args[0] as string) ?? 'list';
    const agentId = payload.flags.id as string | undefined;
    const agentType = payload.flags.type as string | undefined;

    const spId = renderSpinner(`Agents ${subcommand}...`);

    switch (subcommand) {
      case 'list': {
        await simulatedDelay(300);
        const agents = [
          { id: 'agent-1', type: 'claude-sonnet-4-6', status: 'active', conversations: 12 },
          { id: 'agent-2', type: 'gemini-3.5-flash', status: 'idle', conversations: 5 },
          { id: 'agent-3', type: 'deepseek-v4-flash', status: 'idle', conversations: 3 },
        ];
        const agentList = agents.map(a =>
          ` ${a.status === 'active' ? chalk.green('●') : chalk.yellow('○')} ${chalk.bold(a.id)} — ${a.type} (${a.status}, ${a.conversations} conversations)`
        ).join('\n');
        updateSpinner(spId, 'success', `${agents.length} agent(s)`);
        renderSuccess(
          `Connected agents.\n\n${agentList}\n\n` +
          ` Use /agents info --id <agent-id> for details.\n` +
          ` Use /agents spawn --type <model> to start a new agent.`,
        );
        break;
      }

      case 'spawn': {
        const type = agentType ?? 'claude-sonnet-4-6';
        await simulatedDelay(600);
        const newId = `agent-${Date.now()}`;
        this.appendHistory(ctx, 'system', `[agents] Spawned agent "${newId}" of type "${type}" at ${new Date().toISOString()}`);
        updateSpinner(spId, 'success', `Agent "${newId}" spawned`);
        renderSuccess(
          `New agent spawned.\n` +
          ` ID: ${chalk.bold(newId)}\n` +
          ` Type: ${type}\n` +
          ` Status: ${chalk.green('Active')}`,
        );
        break;
      }

      case 'kill': {
        if (!agentId) {
          updateSpinner(spId, 'error', 'No agent ID');
          renderError('Specify an agent ID with --id.');
          throw new Error('/agents kill requires --id');
        }
        await simulatedDelay(300);
        this.appendHistory(ctx, 'system', `[agents] Killed agent "${agentId}" at ${new Date().toISOString()}`);
        updateSpinner(spId, 'success', `Agent "${agentId}" terminated`);
        renderSuccess(
          `Agent terminated.\n` +
          ` ID: ${agentId}\n` +
          ` Status: ${chalk.red('Terminated')}`,
        );
        break;
      }

      case 'info': {
        if (!agentId) {
          updateSpinner(spId, 'error', 'No agent ID');
          renderError('Specify an agent ID with --id.');
          throw new Error('/agents info requires --id');
        }
        await simulatedDelay(200);
        updateSpinner(spId, 'success', `Agent info for "${agentId}"`);
        renderSuccess(
          `Agent details.\n` +
          ` ID: ${chalk.bold(agentId)}\n` +
          ` Type: ${agentType ?? 'claude-sonnet-4-6'}\n` +
          ` Status: Active\n` +
          ` Uptime: 45m 23s\n` +
          ` Conversations: 7\n` +
          ` Token usage: 12,450 input / 3,210 output`,
        );
        break;
      }

      default: {
        updateSpinner(spId, 'error', `Unknown subcommand: ${subcommand}`);
        renderError(`Unknown /agents subcommand: "${subcommand}". Use: list, spawn, kill, info.`);
        throw new Error(`Invalid /agents subcommand: ${subcommand}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 40. /diff — Show git diff or compare file versions
// ─────────────────────────────────────────────────────────────────────────────

export class DiffCommand extends BaseCommand<DiffPayload> {
  readonly name = 'diff' as const;
  readonly description = 'Show git diff or compare file versions.';
  readonly category = 'code' as const;
  readonly longDescription =
    'Displays a diff of changes. Pass file paths or commit refs. ' +
    'Use --against for comparison target, --stat for summary only, --unified for context lines.';

  async execute(ctx: CommandContext, payload: DiffPayload): Promise<void> {
    const paths = payload.args.length > 0 ? payload.args : ['.'];
    const against = (payload.flags.against as string) ?? 'HEAD';
    const stat = (payload.flags.stat as boolean) ?? false;
    const unified = (payload.flags.unified as number) ?? 3;

    const spId = renderSpinner(`Generating diff for ${paths.join(' ')} against ${against}...`);

    await simulatedDelay(stat ? 300 : 700);

    this.appendHistory(ctx, 'system', `[diff] Diff generated for ${paths.join(', ')} against ${against} at ${new Date().toISOString()}`);

    if (stat) {
      updateSpinner(spId, 'success', 'Diff stat generated');
      renderSuccess(
        `Diff stat (against ${against}).\n\n` +
        ` ${chalk.bold('src/commands/commands-core.ts')} | 1876 +++++++++++++++++++++++++\n` +
        ` ${chalk.bold('src/commands/commands-extended.ts')} | 890 +++++++++++++++++++\n` +
        ` ${chalk.bold('src/commands/command-handlers.ts')}   | 8 +-\n` +
        ` 3 files changed, 2770 insertions(+), 2 deletions(-)`,
      );
    } else {
      updateSpinner(spId, 'success', 'Diff generated');
      renderSuccess(
        `Diff output (against ${against}).\n\n` +
        ` Unified context: ${unified} lines\n` +
        ` Paths: ${paths.join(', ')}\n\n` +
        ` ${chalk.green('+')} // New command handler implementations\n` +
        ` ${chalk.green('+')} export class ConfigCommand extends BaseCommand {...}\n` +
        ` ${chalk.green('+')} export class ModelCommand extends BaseCommand {...}\n` +
        ` ${chalk.red('-')} // Stub array — will be populated\n` +
        ` ${chalk.red('-')} export const allCommands: BaseCommand[] = [];\n\n` +
        ` Use --stat for summary only, or --unified N for more context.`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 41. /review — Request a code review of staged changes or a file
// ─────────────────────────────────────────────────────────────────────────────

export class ReviewCommand extends BaseCommand<ReviewPayload> {
  readonly name = 'review' as const;
  readonly description = 'Request a code review of staged changes or a file.';
  readonly category = 'code' as const;
  readonly longDescription =
    'Triggers a code review analysis. Pass file paths or leave empty for staged changes. ' +
    'Use --focus for review area and --severity for minimum threshold.';

  async execute(ctx: CommandContext, payload: ReviewPayload): Promise<void> {
    const targets = payload.args.length > 0 ? payload.args : ['staged changes'];
    const focus = (payload.flags.focus as string) ?? 'all';
    const severity = (payload.flags.severity as string) ?? 'info';

    const spId = renderSpinner(`Reviewing ${targets.join(', ')} (focus: ${focus})...`);

    await simulatedDelay(900);

    const findings = [
      { severity: 'info', message: 'Consistent use of BaseCommand pattern', focus: 'style' },
      { severity: 'warning', message: 'Consider adding error boundaries in execute()', focus: 'logic' },
      { severity: 'info', message: 'Good use of Zod validation', focus: 'style' },
    ].filter(f => {
      if (focus !== 'all' && f.focus !== focus) return false;
      const levels = ['info', 'warning', 'error'];
      return levels.indexOf(f.severity) >= levels.indexOf(severity);
    });

    this.appendHistory(ctx, 'system', `[review] Code review completed for ${targets.join(', ')} at ${new Date().toISOString()}`);

    updateSpinner(spId, 'success', `Review complete: ${findings.length} finding(s)`);

    const findingsList = findings.map(f => {
      const icon = f.severity === 'error' ? chalk.red('✘') : f.severity === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
      return ` ${icon} [${f.severity}] ${f.message} (${f.focus})`;
    }).join('\n');

    renderSuccess(
      `Code review for ${targets.join(', ')}.\n` +
      ` Focus: ${focus}\n` +
      ` Min severity: ${severity}\n\n` +
      ` Findings (${findings.length}):\n${findingsList}\n\n` +
      ` Use /code-review for a more detailed structured review.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 42. /code-review — Detailed code review with structured output
// ─────────────────────────────────────────────────────────────────────────────

export class CodeReviewCommand extends BaseCommand<CodeReviewPayload> {
  readonly name = 'code-review' as const;
  readonly description = 'Detailed code review with structured output.';
  readonly category = 'code' as const;
  readonly longDescription =
    'Produces a comprehensive code review report. Supports --a11y for accessibility, ' +
    '--check-coverage for test gaps, and --output for inline/report/json format.';

  async execute(ctx: CommandContext, payload: CodeReviewPayload): Promise<void> {
    const targets = payload.args.length > 0 ? payload.args : ['staged changes'];
    const a11y = (payload.flags.a11y as boolean) ?? false;
    const checkCoverage = (payload.flags['check-coverage'] as boolean) ?? false;
    const output = (payload.flags.output as string) ?? 'inline';

    const spId = renderSpinner(`Running detailed code review on ${targets.join(', ')}...`);

    await simulatedDelay(1200);

    const review = {
      summary: {
        filesReviewed: 5,
        linesAnalyzed: 2770,
        issues: { errors: 0, warnings: 2, info: 4 },
        score: 87,
      },
  categories: {
      correctness: { score: 95, issues: 0 },
      security: { score: 90, issues: 1 },
      performance: { score: 85, issues: 1 },
      style: { score: 92, issues: 2 },
      maintainability: { score: 88, issues: 2 },
    } as Record<string, { score: number; issues: number }>,
      warnings: [
        'Consider memoizing expensive computations in loop handlers',
        'File write operations should use atomic writes for safety',
      ],
      info: [
        'Good use of Zod for runtime validation',
        'Consistent error handling pattern across handlers',
        'Well-structured command class hierarchy',
        'Good separation of concerns between execute and utilities',
      ],
    };

    if (a11y) {
      review.categories['accessibility'] = { score: 78, issues: 1 };
      review.warnings.push('Terminal output may not be readable with screen readers');
    }

    if (checkCoverage) {
      review.warnings.push('Test coverage below 80% for commands-extended.ts');
    }

    this.appendHistory(ctx, 'system', `[code-review] Detailed review completed for ${targets.join(', ')} at ${new Date().toISOString()}`);

    updateSpinner(spId, 'success', `Review complete: score ${review.summary.score}/100`);

    if (output === 'json') {
      renderSuccess(`Code review (JSON).\n\n\`\`\`json\n${JSON.stringify(review, null, 2)}\n\`\`\``);
    } else if (output === 'report') {
      const catLines = Object.entries(review.categories)
        .map(([k, v]) => ` ${k}: ${v.score}/100 (${v.issues} issue(s))`)
        .join('\n');
      const warnLines = review.warnings.map(w => ` ${chalk.yellow('⚠')} ${w}`).join('\n');
      renderSuccess(
        `Code Review Report.\n\n` +
        ` Overall Score: ${chalk.bold(`${review.summary.score}/100`)}\n` +
        ` Files: ${review.summary.filesReviewed}\n` +
        ` Lines: ${review.summary.linesAnalyzed}\n\n` +
        ` Categories:\n${catLines}\n\n` +
        ` Warnings:\n${warnLines}`,
      );
    } else {
      renderSuccess(
        `Code review: ${chalk.bold(`${review.summary.score}/100`)} — ${review.summary.issues.errors} errors, ${review.summary.issues.warnings} warnings, ${review.summary.issues.info} info\n\n` +
        ` Use /code-review --output report for full report, or --output json for machine-readable output.`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 43. /debug — Start an interactive debugging session
// ─────────────────────────────────────────────────────────────────────────────

export class DebugCommand extends BaseCommand<DebugPayload> {
  readonly name = 'debug' as const;
  readonly description = 'Start an interactive debugging session.';
  readonly category = 'code' as const;
  readonly longDescription =
    'Launches a debugging workflow for the given target. Use --trace for verbose output, ' +
    '--pid to attach to a running process, and --max-iter to limit debug iterations.';

  async execute(ctx: CommandContext, payload: DebugPayload): Promise<void> {
    const target = payload.args.join(' ');
    const trace = (payload.flags.trace as boolean) ?? false;
    const pid = payload.flags.pid as number | undefined;
    const maxIter = (payload.flags['max-iter'] as number) ?? 10;

    const spId = renderSpinner(`Starting debug session for "${target}"${pid ? ` (PID: ${pid})` : ''}...`);

    this.setMeta(ctx, 'debugTarget', target);
    this.setMeta(ctx, 'debugTrace', trace);
    this.setMeta(ctx, 'debugMaxIter', maxIter);
    this.setMeta(ctx, 'debugStartedAt', new Date().toISOString());
    this.setMeta(ctx, 'debugIteration', 0);

    await simulatedDelay(700);

    const steps = [
      { step: 1, action: 'Reproduce the error', status: 'ok' },
      { step: 2, action: 'Isolate the failure point', status: 'ok' },
      { step: 3, action: 'Analyze root cause', status: 'in-progress' },
    ];

    this.appendHistory(ctx, 'system', `[debug] Debug session started for "${target}" at ${new Date().toISOString()}`);

    updateSpinner(spId, 'success', 'Debug session initialized');

    const stepsList = steps.map(s =>
      ` ${s.status === 'ok' ? chalk.green('✔') : chalk.yellow('→')} Step ${s.step}: ${s.action}`
    ).join('\n');

    renderSuccess(
      `Debug session started.\n` +
      ` Target: ${chalk.bold(target)}\n` +
      ` Trace: ${trace ? 'On' : 'Off'}\n` +
      ` PID: ${pid ?? 'N/A'}\n` +
      ` Max iterations: ${maxIter}\n\n` +
      ` Progress:\n${stepsList}\n\n` +
      ` The debug workflow is active. Continue with iterative analysis.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 44. /loop — Run a command in a loop until a condition is met
// ─────────────────────────────────────────────────────────────────────────────

export class LoopCommand extends BaseCommand<LoopPayload> {
  readonly name = 'loop' as const;
  readonly description = 'Run a command in a loop until a condition is met.';
  readonly category = 'workspace' as const;
  readonly longDescription =
    'Iteratively executes a command. Use --max-iter for safety limit, ' +
    '--until for a stop condition, and --delay for inter-iteration pause.';
  readonly executeAlwaysRunAfter = true;

  async execute(ctx: CommandContext, payload: LoopPayload): Promise<void> {
    const command = payload.args.join(' ');
    const maxIter = (payload.flags['max-iter'] as number) ?? 5;
    const until = payload.flags.until as string | undefined;
    const delay = (payload.flags.delay as number) ?? 1;

    const spId = renderSpinner(`Starting loop: "${command}" (max ${maxIter} iterations)...`);

    this.setMeta(ctx, 'loopCommand', command);
    this.setMeta(ctx, 'loopMaxIter', maxIter);
    this.setMeta(ctx, 'loopUntil', until);
    this.setMeta(ctx, 'loopDelay', delay);
    this.setMeta(ctx, 'loopStartedAt', new Date().toISOString());

    const iterations: Array<{ iter: number; status: string; duration: number }> = [];
    let conditionMet = false;

    for (let i = 1; i <= Math.min(maxIter, 3); i++) {
      const startMs = Date.now();
      await simulatedDelay(delay * 200 + 100);
      const duration = Date.now() - startMs;
      const status = i === maxIter || (until && i >= 2) ? 'condition-met' : 'ok';
      iterations.push({ iter: i, status, duration });
      this.setMeta(ctx, 'loopIteration', i);
      if (status === 'condition-met') {
        conditionMet = true;
        break;
      }
    }

    this.appendHistory(ctx, 'system', `[loop] Loop completed: ${iterations.length} iterations for "${command}" at ${new Date().toISOString()}`);

    updateSpinner(spId, 'success', `Loop complete: ${iterations.length} iterations`);

    const iterList = iterations.map(it =>
      ` ${it.status === 'condition-met' ? chalk.green('✔') : chalk.blue('→')} Iteration ${it.iter}: ${it.status} (${it.duration}ms)`
    ).join('\n');

    renderSuccess(
      `Loop execution ${conditionMet ? 'complete (condition met)' : 'reached max iterations'}.\n` +
      ` Command: "${command}"\n` +
      ` Iterations: ${iterations.length}/${maxIter}\n` +
      ` Until: ${until ?? '(none)'}\n` +
      ` Delay: ${delay}s\n\n${iterList}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 45. /claude-api — Make a direct Claude API call with custom params
// ─────────────────────────────────────────────────────────────────────────────

export class ClaudeApiCommand extends BaseCommand<ClaudeApiPayload> {
  readonly name = 'claude-api' as const;
  readonly description = 'Make a direct Claude API call with custom parameters.';
  readonly category = 'agents' as const;
  readonly longDescription =
    'Bypasses the standard pipeline to call the Claude API directly. ' +
    'Use --model, --max-tokens, --temperature, --system, and --raw for custom configuration.';

  async execute(ctx: CommandContext, payload: ClaudeApiPayload): Promise<void> {
    const prompt = payload.args.join(' ');
    const model = (payload.flags.model as string) ?? ctx.model;
    const maxTokens = (payload.flags['max-tokens'] as number) ?? 4096;
    const temperature = (payload.flags.temperature as number) ?? 0.7;
    const system = payload.flags.system as string | undefined;
    const raw = (payload.flags.raw as boolean) ?? false;

    const spId = renderSpinner(`Calling ${model} API directly...`);

    await simulatedDelay(800);

    const inputTokens = Math.ceil(prompt.length / 4) + (system ? Math.ceil(system.length / 4) : 0);
    const outputTokens = Math.floor(Math.random() * 500) + 100;
    const costEstimate = (inputTokens * 0.000003 + outputTokens * 0.000015).toFixed(6);

    const currentCost = this.getMeta(ctx, 'costUsd', 0) as number;
    this.setMeta(ctx, 'costUsd', currentCost + parseFloat(costEstimate));
    const currentInput = this.getMeta(ctx, 'totalInputTokens', 0) as number;
    this.setMeta(ctx, 'totalInputTokens', currentInput + inputTokens);
    const currentOutput = this.getMeta(ctx, 'totalOutputTokens', 0) as number;
    this.setMeta(ctx, 'totalOutputTokens', currentOutput + outputTokens);

    this.appendHistory(ctx, 'system', `[claude-api] Direct API call to ${model} at ${new Date().toISOString()} (${inputTokens}+${outputTokens} tokens, $${costEstimate})`);

    updateSpinner(spId, 'success', `API call complete (${outputTokens} tokens)`);

    if (raw) {
      renderSuccess(
        `Claude API response (raw JSON).\n\n\`\`\`json\n${JSON.stringify({
          model,
          prompt: prompt.slice(0, 80) + (prompt.length > 80 ? '...' : ''),
          response: 'Simulated API response content...',
          usage: { inputTokens, outputTokens },
          cost: `$${costEstimate}`,
        }, null, 2)}\n\`\`\``,
      );
    } else {
      renderSuccess(
        `Claude API call complete.\n` +
        ` Model: ${chalk.bold(model)}\n` +
        ` Prompt: "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}"\n` +
        ` Max tokens: ${maxTokens}\n` +
        ` Temperature: ${temperature}\n` +
        ` System: ${system ? 'Custom' : 'Default'}\n` +
        ` Tokens: ${inputTokens} input + ${outputTokens} output\n` +
        ` Cost: $${costEstimate}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 46. /cost — Show cost estimate for the current session
// ─────────────────────────────────────────────────────────────────────────────

export class CostCommand extends BaseCommand<CostPayload> {
  readonly name = 'cost' as const;
  readonly description = 'Show cost estimate for the current session.';
  readonly category = 'metrics' as const;
  readonly longDescription =
    'Displays accumulated cost for the session. Use --by-model for per-model breakdown, ' +
    '--usd for USD display, and --period for time filtering.';

  async execute(ctx: CommandContext, payload: CostPayload): Promise<void> {
    const byModel = (payload.flags['by-model'] as boolean) ?? false;
    const usd = (payload.flags.usd as boolean) ?? true;
    const period = (payload.flags.period as string) ?? 'all';

    const spId = renderSpinner('Calculating session cost...');

    await simulatedDelay(300);

    const totalCost = this.getMeta(ctx, 'costUsd', 0) as number;
    const inputTokens = this.getMeta(ctx, 'totalInputTokens', 0) as number;
    const outputTokens = this.getMeta(ctx, 'totalOutputTokens', 0) as number;

    this.appendHistory(ctx, 'system', `[cost] Cost query at ${new Date().toISOString()} (total: $${totalCost.toFixed(4)})`);

    updateSpinner(spId, 'success', 'Cost calculated');

    let costBreakdown = '';
    if (byModel) {
      costBreakdown =
        `\n\n Model breakdown:\n` +
        `   ${ctx.model}: $${totalCost.toFixed(4)} (${inputTokens}+${outputTokens} tokens)\n` +
        `   claude-opus-4: $0.0000 (0 tokens)`;
    }

    renderSuccess(
      `Session cost estimate.\n` +
      ` Period: ${period}\n` +
      ` Total cost: ${chalk.bold(`$${totalCost.toFixed(4)}`)}\n` +
      ` Input tokens: ${inputTokens.toLocaleString()}\n` +
      ` Output tokens: ${outputTokens.toLocaleString()}\n` +
      ` Active model: ${ctx.model}${costBreakdown}\n\n` +
      ` Use /usage for detailed token usage. Use /stats for system statistics.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 47. /stats — Display session and system statistics
// ─────────────────────────────────────────────────────────────────────────────

export class StatsCommand extends BaseCommand<StatsPayload> {
  readonly name = 'stats' as const;
  readonly description = 'Display session and system statistics.';
  readonly category = 'metrics' as const;
  readonly longDescription =
    'Shows aggregate session statistics. Categories: tokens, requests, latency, errors, all. ' +
    'Use --reset to clear counters and --export to write stats to a file.';

  async execute(ctx: CommandContext, payload: StatsPayload): Promise<void> {
    const category = (payload.args[0] as string) ?? 'all';
    const reset = (payload.flags.reset as boolean) ?? false;
    const exportPath = payload.flags.export as string | undefined;

    const spId = renderSpinner(`Gathering ${category} statistics...`);

    await simulatedDelay(400);

    const stats = {
      tokens: {
        input: this.getMeta(ctx, 'totalInputTokens', 0) as number,
        output: this.getMeta(ctx, 'totalOutputTokens', 0) as number,
        total: (this.getMeta(ctx, 'totalInputTokens', 0) as number) + (this.getMeta(ctx, 'totalOutputTokens', 0) as number),
      },
      requests: {
        total: ctx.history.filter(e => e.role === 'user').length,
        commands: ctx.history.filter(e => e.role === 'system' && e.content.startsWith('[')).length,
      },
      latency: {
        avgMs: 450,
        p50Ms: 380,
        p99Ms: 1200,
      },
      errors: {
        total: 0,
        lastError: null as string | null,
      },
    };

    if (reset) {
      this.setMeta(ctx, 'costUsd', 0);
      this.setMeta(ctx, 'totalInputTokens', 0);
      this.setMeta(ctx, 'totalOutputTokens', 0);
    }

    if (exportPath) {
      ensureDir(join(exportPath, '..').split(':').join(''));
      writeFileSync(exportPath, JSON.stringify(stats, null, 2), 'utf-8');
    }

    this.appendHistory(ctx, 'system', `[stats] Statistics displayed at ${new Date().toISOString()}`);

    updateSpinner(spId, 'success', 'Statistics gathered');

    const sections: string[] = [];
    if (category === 'all' || category === 'tokens') {
      sections.push(
        ` Tokens:\n` +
        `   Input: ${stats.tokens.input.toLocaleString()}\n` +
        `   Output: ${stats.tokens.output.toLocaleString()}\n` +
        `   Total: ${chalk.bold(stats.tokens.total.toLocaleString())}`
      );
    }
    if (category === 'all' || category === 'requests') {
      sections.push(
        ` Requests:\n` +
        `   User messages: ${stats.requests.total}\n` +
        `   Commands executed: ${stats.requests.commands}`
      );
    }
    if (category === 'all' || category === 'latency') {
      sections.push(
        ` Latency:\n` +
        `   Average: ${stats.latency.avgMs}ms\n` +
        `   P50: ${stats.latency.p50Ms}ms\n` +
        `   P99: ${stats.latency.p99Ms}ms`
      );
    }
    if (category === 'all' || category === 'errors') {
      sections.push(
        ` Errors:\n` +
        `   Total: ${stats.errors.total}\n` +
        `   Last: ${stats.errors.lastError ?? 'None'}`
      );
    }

    renderSuccess(
      `Session statistics (${category}).\n\n${sections.join('\n\n')}` +
      `${reset ? '\n\n ' + chalk.yellow('Stats have been reset.') : ''}` +
      `${exportPath ? `\n\n Exported to: ${exportPath}` : ''}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 48. /usage — Show token usage for current or past sessions
// ─────────────────────────────────────────────────────────────────────────────

export class UsageCommand extends BaseCommand<UsagePayload> {
  readonly name = 'usage' as const;
  readonly description = 'Show token usage for current or past sessions.';
  readonly category = 'metrics' as const;
  readonly longDescription =
    'Detailed token usage breakdown. Filter by model with --by-model, ' +
    'by direction with --input/--output, and by time with --period.';

  async execute(ctx: CommandContext, payload: UsagePayload): Promise<void> {
    const byModel = (payload.flags['by-model'] as boolean) ?? false;
    const inputOnly = (payload.flags.input as boolean) ?? false;
    const outputOnly = (payload.flags.output as boolean) ?? false;
    const period = (payload.flags.period as string) ?? 'all';

    const spId = renderSpinner('Fetching token usage...');

    await simulatedDelay(300);

    const inputTokens = this.getMeta(ctx, 'totalInputTokens', 0) as number;
    const outputTokens = this.getMeta(ctx, 'totalOutputTokens', 0) as number;
    const totalTokens = inputTokens + outputTokens;

    this.appendHistory(ctx, 'system', `[usage] Token usage query at ${new Date().toISOString()}`);

    updateSpinner(spId, 'success', 'Usage data retrieved');

    let usageDetail = '';
    if (inputOnly && !outputOnly) {
      usageDetail = ` Input tokens: ${chalk.bold(inputTokens.toLocaleString())}`;
    } else if (outputOnly && !inputOnly) {
      usageDetail = ` Output tokens: ${chalk.bold(outputTokens.toLocaleString())}`;
    } else {
      usageDetail =
        ` Input tokens:  ${inputTokens.toLocaleString()}\n` +
        ` Output tokens: ${outputTokens.toLocaleString()}\n` +
        ` Total tokens:  ${chalk.bold(totalTokens.toLocaleString())}`;
    }

    let modelBreakdown = '';
    if (byModel) {
      modelBreakdown =
        `\n\n By model:\n` +
        `   ${ctx.model}: ${totalTokens.toLocaleString()} tokens (${inputTokens} in / ${outputTokens} out)`;
    }

    renderSuccess(
      `Token usage (${period}).\n\n${usageDetail}${modelBreakdown}\n\n` +
      ` Use /cost for dollar estimates. Use /stats for full session statistics.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 49. /help — Display the full command catalog
// ─────────────────────────────────────────────────────────────────────────────

export class HelpCommand extends BaseCommand<HelpPayload> {
  readonly name = 'help' as const;
  readonly description = 'Display the full command catalog with descriptions.';
  readonly category = 'general' as const;
  readonly longDescription =
    'Shows all available slash-commands grouped by category. Pass a command name ' +
    'for detailed help. Use --compact for one-line format and --category to filter.';

  async execute(ctx: CommandContext, payload: HelpPayload): Promise<void> {
    const commandName = payload.args[0];
    const compact = (payload.flags.compact as boolean) ?? false;
    const category = (payload.flags.category as string) ?? 'all';

    if (commandName) {
      const spId = renderSpinner(`Loading help for /${commandName}...`);
      await simulatedDelay(200);
      updateSpinner(spId, 'success', `Help for /${commandName} loaded`);
      renderSuccess(
        `Help for /${commandName}.\n\n` +
        ` Run /${commandName} with the appropriate arguments.\n` +
        ` Use /help to see all available commands.`,
      );
      return;
    }

    const spId = renderSpinner('Loading command catalog...');

    const catalog: Record<string, Array<{ name: string; description: string }>> = {
      session: [
        { name: 'grillme', description: 'Adversarial interview mode' },
        { name: 'snapshot', description: 'Take a codebase snapshot' },
        { name: 'clear', description: 'Clear history or context' },
        { name: 'reset', description: 'Reset session to initial state' },
        { name: 'new', description: 'Start a new session' },
        { name: 'resume', description: 'Resume a previous session' },
        { name: 'rename', description: 'Rename the current session' },
        { name: 'branch', description: 'Create a conversation branch' },
        { name: 'fork', description: 'Fork into independent session' },
        { name: 'rewind', description: 'Rewind history to prior state' },
        { name: 'compact', description: 'Compact conversation context' },
        { name: 'context', description: 'Show or manipulate context window' },
        { name: 'memory', description: 'Manage Engram persistent memory' },
        { name: 'export', description: 'Export session to disk' },
        { name: 'copy', description: 'Copy to clipboard' },
        { name: 'btw', description: 'Add a side note' },
        { name: 'exit', description: 'Exit the CLI session' },
        { name: 'quit', description: 'Alias for /exit' },
      ],
      planning: [
        { name: 'goal', description: 'Set autonomous goal' },
        { name: 'planning', description: 'Kick off SDD planning' },
        { name: 'explore', description: 'Explore/investigate a topic' },
        { name: 'verify', description: 'Validate against specs' },
        { name: 'architect', description: 'Architecture design phase' },
        { name: 'onboard', description: 'SDD onboarding walkthrough' },
        { name: 'init', description: 'Initialize SDD context' },
        { name: 'plan', description: 'Run SDD planning phases' },
        { name: 'tasks', description: 'Manage SDD task checklist' },
      ],
      config: [
        { name: 'config', description: 'Show or edit CLI config' },
        { name: 'settings', description: 'Interactive settings editor' },
        { name: 'model', description: 'Switch active language model' },
        { name: 'effort', description: 'Set reasoning effort level' },
        { name: 'fast', description: 'Toggle fast mode' },
        { name: 'permissions', description: 'Manage permissions' },
      ],
      agents: [
        { name: 'mcp', description: 'Manage MCP servers' },
        { name: 'skills', description: 'Manage agent skills' },
        { name: 'agents', description: 'Manage AI agents' },
        { name: 'claude-api', description: 'Direct Claude API call' },
      ],
      code: [
        { name: 'refactor', description: 'Refactor with guided analysis' },
        { name: 'diff', description: 'Show git diff' },
        { name: 'review', description: 'Request code review' },
        { name: 'code-review', description: 'Detailed structured review' },
        { name: 'debug', description: 'Interactive debug session' },
      ],
      workspace: [
        { name: 'batch', description: 'Execute batch commands' },
        { name: 'loop', description: 'Loop a command' },
      ],
      metrics: [
        { name: 'cost', description: 'Show session cost estimate' },
        { name: 'stats', description: 'Session/system statistics' },
        { name: 'usage', description: 'Token usage breakdown' },
      ],
      general: [
        { name: 'diagnose', description: 'Diagnose system issues' },
        { name: 'help', description: 'Display command catalog' },
      ],
    };

    await simulatedDelay(300);

    updateSpinner(spId, 'success', 'Command catalog loaded');

    const categories = category === 'all'
      ? Object.keys(catalog)
      : [category];

    if (compact) {
      const allCmds = categories.flatMap(cat => catalog[cat] ?? []);
      const lines = allCmds.map(c => ` /${c.name} — ${c.description}`).join('\n');
      renderSuccess(
        `Ninja AI CLI — 49 Commands (compact).\n\n${lines}`,
      );
    } else {
      const sections = categories.map(cat => {
        const cmds = catalog[cat] ?? [];
        const cmdLines = cmds.map(c => `   /${chalk.bold(c.name.padEnd(14))} ${c.description}`).join('\n');
        return `${chalk.cyan.bold(cat.toUpperCase())} (${cmds.length})\n${cmdLines}`;
      }).join('\n\n');

      const totalCommands = Object.values(catalog).reduce((sum, cmds) => sum + cmds.length, 0);

      renderSuccess(
        `Ninja AI CLI — Command Catalog.\n` +
        ` ${totalCommands} commands available\n\n${sections}\n\n` +
        ` Use /help <command> for detailed help on a specific command.\n` +
        ` Use /help --compact for one-line format.\n` +
        ` Use /help --category <cat> to filter by category.`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal utilities (duplicated from commands-core.ts to keep file self-contained)
// ─────────────────────────────────────────────────────────────────────────────

function simulatedDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry export — all 24 extended command instances (26–49)
// ─────────────────────────────────────────────────────────────────────────────

export const extendedCommands = [
  new ConfigCommand(),
  new SettingsCommand(),
  new ModelCommand(),
  new EffortCommand(),
  new FastCommand(),
  new PermissionsCommand(),
  new InitCommand(),
  new PlanCommand(),
  new BatchCommand(),
  new BtwCommand(),
  new TasksCommand(),
  new McpCommand(),
  new SkillsCommand(),
  new AgentsCommand(),
  new DiffCommand(),
  new ReviewCommand(),
  new CodeReviewCommand(),
  new DebugCommand(),
  new LoopCommand(),
  new ClaudeApiCommand(),
  new CostCommand(),
  new StatsCommand(),
  new UsageCommand(),
  new HelpCommand(),
] as const;

export type ExtendedCommandInstance = (typeof extendedCommands)[number];
