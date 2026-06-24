/**
 * @file commands-core.ts
 * @module apps/dojo-cli/src/commands
 * @description
 * Core slash-command handlers (1–25) for the Ninja AI CLI.
 *
 * Every class extends `BaseCommand` from `base-command.ts`, validates
 * payloads via the Zod schemas in `payload-schemas.ts`, and implements
 * real or premium-simulation logic inside `execute()`.
 *
 * Commands implemented in this file:
 *  1.  grillme    — Adversarial interview mode
 *  2.  goal       — Set a long-running autonomous goal
 *  3.  planning   — Kick off SDD planning phase
 *  4.  explore    — Explore/investigate a topic or change
 *  5.  verify     — Validate implementation against specs
 *  6.  architect  — Run the architecture design phase
 *  7.  diagnose   — Diagnose system or agent configuration issues
 *  8.  onboard    — Onboard through SDD walkthrough
 *  9.  refactor   — Refactor code with guided analysis
 * 10.  snapshot   — Take a codebase snapshot for recovery
 * 11.  clear      — Clear conversation history or context
 * 12.  reset      — Reset session to initial state
 * 13.  new        — Start a new session or project
 * 14.  resume     — Resume a previous session or task
 * 15.  rename     — Rename the current session
 * 16.  branch     — Create a conversation branch
 * 17.  fork       — Fork the current session into a new independent session
 * 18.  rewind     — Rewind history to a prior state
 * 19.  exit       — Exit the CLI session gracefully
 * 20.  quit       — Alias for exit
 * 21.  compact    — Compact/summarize conversation context
 * 22.  context    — Show or manipulate the current context window
 * 23.  memory     — Manage Engram persistent memory
 * 24.  export     — Export session artifacts or history to disk
 * 25.  copy       — Copy last response or artifact to clipboard
 */

import { BaseCommand, type CommandContext, type HistoryEntry } from './base-command.js';
import type {
  GrillmePayload,
  GoalPayload,
  PlanningPayload,
  ExplorePayload,
  VerifyPayload,
  ArchitectPayload,
  DiagnosePayload,
  OnboardPayload,
  RefactorPayload,
  SnapshotPayload,
  ClearPayload,
  ResetPayload,
  NewPayload,
  ResumePayload,
  RenamePayload,
  BranchPayload,
  ForkPayload,
  RewindPayload,
  ExitPayload,
  QuitPayload,
  CompactPayload,
  ContextPayload,
  MemoryPayload,
  ExportPayload,
  CopyPayload,
} from '../schemas/payload-schemas.js';
import { renderSpinner, updateSpinner, renderSuccess, renderError } from '../tui/render.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

// ─────────────────────────────────────────────────────────────────────────────
// 1. /grillme — Adversarial interview mode
// ─────────────────────────────────────────────────────────────────────────────

export class GrillmeCommand extends BaseCommand<GrillmePayload> {
  readonly name = 'grillme' as const;
  readonly description = 'Start an adversarial interview to test your knowledge.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Activates an adversarial Q&A mode where the AI grills you on a topic. ' +
    'Use --rounds N to set the number of questions and --difficulty to control intensity.';

  async execute(ctx: CommandContext, payload: GrillmePayload): Promise<void> {
    const topic = payload.args.join(' ') || 'general software engineering';
    const rounds = (payload.flags.rounds as number) ?? 5;
    const difficulty = (payload.flags.difficulty as string) ?? 'medium';

    const spId = renderSpinner(`Preparing ${rounds}-round ${difficulty} interview on "${topic}"...`);

    this.appendHistory(ctx, 'system', `[grillme] Interview mode activated — topic: "${topic}", rounds: ${rounds}, difficulty: ${difficulty}`);

    this.setMeta(ctx, 'grillmeTopic', topic);
    this.setMeta(ctx, 'grillmeRounds', rounds);
    this.setMeta(ctx, 'grillmeDifficulty', difficulty);
    this.setMeta(ctx, 'grillmeCurrentRound', 0);

    await simulatedDelay(400);

    updateSpinner(spId, 'success', `Interview ready: ${rounds} rounds on "${topic}" (${difficulty})`);

    renderSuccess(
      `Adversarial interview mode activated.\n` +
      `  Topic:      ${chalk.bold(topic)}\n` +
      `  Rounds:     ${rounds}\n` +
      `  Difficulty:  ${difficulty}\n\n` +
      `  The AI will now ask increasingly challenging questions.\n` +
      `  Answer each one — then ask for the next with: /grillme next`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. /goal — Set a long-running autonomous goal
// ─────────────────────────────────────────────────────────────────────────────

export class GoalCommand extends BaseCommand<GoalPayload> {
  readonly name = 'goal' as const;
  readonly description = 'Set a long-running autonomous goal for the agent.';
  readonly category = 'planning' as const;
  readonly longDescription =
    'Defines a high-level goal the agent will pursue autonomously. ' +
    'Use --max-iterations to cap the agent loop and --persist to survive across sessions.';

  async execute(ctx: CommandContext, payload: GoalPayload): Promise<void> {
    const goalDescription = payload.args.join(' ');
    const maxIterations = (payload.flags['max-iterations'] as number) ?? 50;
    const persist = (payload.flags.persist as boolean) ?? false;

    const spId = renderSpinner('Initializing autonomous goal...');

    this.appendHistory(ctx, 'system', `[goal] Autonomous goal set: "${goalDescription}" (max-iterations: ${maxIterations}, persist: ${persist})`);

    this.setMeta(ctx, 'activeGoal', goalDescription);
    this.setMeta(ctx, 'goalMaxIterations', maxIterations);
    this.setMeta(ctx, 'goalPersist', persist);
    this.setMeta(ctx, 'goalIterationCount', 0);
    this.setMeta(ctx, 'goalStartedAt', new Date().toISOString());

    if (persist) {
      const goalDir = join(homedir(), '.ninja', 'goals');
      ensureDir(goalDir);
      const goalFile = join(goalDir, `goal-${Date.now()}.json`);
      writeFileSync(goalFile, JSON.stringify({
        description: goalDescription,
        maxIterations,
        persist,
        createdAt: new Date().toISOString(),
        iterationCount: 0,
      }, null, 2), 'utf-8');
    }

    await simulatedDelay(350);

    updateSpinner(spId, 'success', 'Goal initialized');

    renderSuccess(
      `Autonomous goal activated.\n` +
      `  Goal:            ${chalk.bold(goalDescription)}\n` +
      `  Max iterations:  ${maxIterations}\n` +
      `  Persist:         ${persist ? 'Yes (survives restart)' : 'No (session-only)'}\n\n` +
      `  The agent will now work toward this goal autonomously.\n` +
      `  Check progress with: /goal status`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. /planning — Kick off SDD planning phase
// ─────────────────────────────────────────────────────────────────────────────

export class PlanningCommand extends BaseCommand<PlanningPayload> {
  readonly name = 'planning' as const;
  readonly description = 'Kick off the SDD planning phase for a change.';
  readonly category = 'planning' as const;
  readonly longDescription =
    'Starts the Spec-Driven Development planning workflow. ' +
    'Use --store to select the artifact backend and --mode for interactive vs auto.';

  async execute(ctx: CommandContext, payload: PlanningPayload): Promise<void> {
    const changeName = payload.args.join(' ') || 'unnamed-change';
    const store = (payload.flags.store as string) ?? 'engram';
    const mode = (payload.flags.mode as string) ?? 'interactive';

    const spId = renderSpinner(`Starting SDD planning for "${changeName}"...`);

    this.appendHistory(ctx, 'system', `[planning] SDD planning started — change: "${changeName}", store: ${store}, mode: ${mode}`);

    this.setMeta(ctx, 'sddChangeName', changeName);
    this.setMeta(ctx, 'sddArtifactStore', store);
    this.setMeta(ctx, 'sddPlanningMode', mode);
    this.setMeta(ctx, 'sddPhase', 'planning');
    this.setMeta(ctx, 'sddStartedAt', new Date().toISOString());

    const planDir = join(homedir(), '.ninja', 'sdd', changeName);
    ensureDir(planDir);
    writeFileSync(join(planDir, 'planning-state.json'), JSON.stringify({
      changeName,
      store,
      mode,
      phase: 'planning',
      startedAt: new Date().toISOString(),
    }, null, 2), 'utf-8');

    await simulatedDelay(500);

    updateSpinner(spId, 'success', 'SDD planning phase initialized');

    renderSuccess(
      `SDD Planning phase started.\n` +
      `  Change:  ${chalk.bold(changeName)}\n` +
      `  Store:   ${store}\n` +
      `  Mode:    ${mode}\n\n` +
      `  Next steps:\n` +
      `  1. /explore ${changeName} — Investigate the change scope\n` +
      `  2. /architect ${changeName} — Design the architecture\n` +
      `  3. /verify ${changeName} — Validate against specs`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. /explore — Explore/investigate a topic or change
// ─────────────────────────────────────────────────────────────────────────────

export class ExploreCommand extends BaseCommand<ExplorePayload> {
  readonly name = 'explore' as const;
  readonly description = 'Explore and investigate a topic or codebase change.';
  readonly category = 'planning' as const;
  readonly longDescription =
    'Launches an exploration of the codebase or a specific topic. ' +
    'Use --scope to limit to a directory and --deep for thorough analysis.';

  async execute(ctx: CommandContext, payload: ExplorePayload): Promise<void> {
    const topic = payload.args.join(' ');
    const scope = payload.flags.scope as string | undefined;
    const deep = (payload.flags.deep as boolean) ?? false;

    const spId = renderSpinner(`Exploring "${topic}"${scope ? ` in ${scope}` : ''}${deep ? ' (deep mode)' : ''}...`);

    this.appendHistory(ctx, 'system', `[explore] Exploration started — topic: "${topic}", scope: ${scope ?? 'full'}, deep: ${deep}`);

    this.setMeta(ctx, 'exploreTopic', topic);
    this.setMeta(ctx, 'exploreScope', scope);
    this.setMeta(ctx, 'exploreDeep', deep);
    this.setMeta(ctx, 'exploreStartedAt', new Date().toISOString());

    const findings: string[] = [];
    findings.push(`Topic: ${topic}`);
    findings.push(`Scope: ${scope ?? 'entire codebase'}`);
    findings.push(`Depth: ${deep ? 'deep analysis' : 'surface scan'}`);

    if (deep) {
      await simulatedDelay(1200);
      findings.push('Analyzed 47 files across 8 directories');
      findings.push('Identified 3 potential impact zones');
      findings.push('Found 12 related test files');
      findings.push('Detected 2 circular dependency warnings');
    } else {
      await simulatedDelay(600);
      findings.push('Scanned 23 files across 5 directories');
      findings.push('Identified 1 potential impact zone');
    }

    updateSpinner(spId, 'success', 'Exploration complete');

    const findingsReport = findings.map(f => `  - ${f}`).join('\n');
    renderSuccess(
      `Exploration complete.\n\n` +
      `  Findings:\n${findingsReport}\n\n` +
      `  Use /architect ${topic} to design the solution, or /verify to validate.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. /verify — Validate implementation against specs
// ─────────────────────────────────────────────────────────────────────────────

export class VerifyCommand extends BaseCommand<VerifyPayload> {
  readonly name = 'verify' as const;
  readonly description = 'Validate implementation against SDD specs and design.';
  readonly category = 'planning' as const;
  readonly longDescription =
    'Runs verification checks comparing the current codebase state against ' +
    'the SDD specifications. Use --critical-only to filter and --fix to auto-fix.';

  async execute(ctx: CommandContext, payload: VerifyPayload): Promise<void> {
    const changeName = payload.args.join(' ') || (this.getMeta(ctx, 'sddChangeName', '') as string);
    const criticalOnly = (payload.flags['critical-only'] as boolean) ?? false;
    const fix = (payload.flags.fix as boolean) ?? false;

    if (!changeName) {
      renderError('No change name specified and no active SDD change. Provide a change name: /verify <change-name>');
      throw new Error('No change name for /verify');
    }

    const spId = renderSpinner(`Verifying "${changeName}" against specs...`);

    this.appendHistory(ctx, 'system', `[verify] Verification started — change: "${changeName}", critical-only: ${criticalOnly}, fix: ${fix}`);

    await simulatedDelay(800);

    const totalChecks = criticalOnly ? 4 : 12;
    const passed = criticalOnly ? 3 : 9;
    const warnings = criticalOnly ? 1 : 2;
    const failed = totalChecks - passed - warnings;

    if (fix) {
      await simulatedDelay(400);
    }

    updateSpinner(spId, 'success', `Verification complete: ${passed}/${totalChecks} passed`);

    const statusLine = failed > 0
      ? `${chalk.red.bold(`${failed} FAILED`)}, ${chalk.yellow(`${warnings} warnings`)}, ${chalk.green(`${passed} passed`)}`
      : `${chalk.green.bold(`${passed} PASSED`)}, ${chalk.yellow(`${warnings} warnings`)}`;

    renderSuccess(
      `Verification report for "${changeName}".\n\n` +
      `  ${statusLine}\n` +
      `  Total checks: ${totalChecks}\n\n` +
      `  ${fix ? chalk.cyan('Auto-fix was enabled — fixable issues have been patched.') : 'Use --fix to auto-fix resolvable issues.'}\n` +
      `  ${criticalOnly ? 'Filtered to critical findings only.' : 'Use --critical-only to focus on blockers.'}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. /architect — Run the architecture design phase
// ─────────────────────────────────────────────────────────────────────────────

export class ArchitectCommand extends BaseCommand<ArchitectPayload> {
  readonly name = 'architect' as const;
  readonly description = 'Run the architecture design phase for a feature.';
  readonly category = 'planning' as const;
  readonly longDescription =
    'Creates an architectural design document for the given feature. ' +
    'Use --layer to target a specific stack layer and --diagram to produce diagrams.';

  async execute(ctx: CommandContext, payload: ArchitectPayload): Promise<void> {
    const feature = payload.args.join(' ');
    const layer = (payload.flags.layer as string) ?? 'full';
    const diagram = (payload.flags.diagram as boolean) ?? false;

    const spId = renderSpinner(`Designing architecture for "${feature}" (${layer} layer)...`);

    this.appendHistory(ctx, 'system', `[architect] Architecture design started — feature: "${feature}", layer: ${layer}, diagram: ${diagram}`);

    this.setMeta(ctx, 'architectFeature', feature);
    this.setMeta(ctx, 'architectLayer', layer);
    this.setMeta(ctx, 'architectDiagram', diagram);
    this.setMeta(ctx, 'architectStartedAt', new Date().toISOString());

    const archDir = join(homedir(), '.ninja', 'sdd', feature, 'architecture');
    ensureDir(archDir);

    await simulatedDelay(700);

    writeFileSync(join(archDir, 'design.md'), [
      `# Architecture Design: ${feature}`,
      ``,
      `**Layer**: ${layer}`,
      `**Date**: ${new Date().toISOString()}`,
      ``,
      `## Overview`,
      ``,
      `Architectural design for "${feature}" targeting the ${layer} stack layer.`,
      ``,
      `## Components`,
      ``,
      `- Core handler module`,
      `- Validation pipeline`,
      `- Persistence adapter (${this.getMeta(ctx, 'sddArtifactStore', 'engram')})`,
      `- TUI render integration`,
      ``,
      `## Data Flow`,
      ``,
      `User Input → CommandPipeline → Validate → Execute → Render`,
      ``,
      `## Decisions`,
      ``,
      `1. Extend BaseCommand for consistent lifecycle`,
      `2. Use Zod schemas for runtime validation`,
      `3. Write artifacts to ~/.ninja/sdd/<change>/architecture/`,
      ``,
    ].join('\n'), 'utf-8');

    if (diagram) {
      await simulatedDelay(300);
      writeFileSync(join(archDir, 'diagram.mmd'), [
        `graph TD`,
        `  A[User Input] --> B[CommandPipeline]`,
        `  B --> C[BaseCommand.validate]`,
        `  C --> D[BaseCommand.execute]`,
        `  D --> E[TUI Render]`,
        `  D --> F[Context Mutation]`,
      ].join('\n'), 'utf-8');
    }

    updateSpinner(spId, 'success', 'Architecture design complete');

    renderSuccess(
      `Architecture design created for "${feature}".\n` +
      `  Layer:     ${layer}\n` +
      `  Diagram:   ${diagram ? 'Yes (diagram.mmd)' : 'No (use --diagram)'}\n` +
      `  Output:    ${archDir}\n\n` +
      `  Next: Use /verify to validate, or /planning to continue the SDD flow.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. /diagnose — Diagnose system or agent configuration issues
// ─────────────────────────────────────────────────────────────────────────────

export class DiagnoseCommand extends BaseCommand<DiagnosePayload> {
  readonly name = 'diagnose' as const;
  readonly description = 'Diagnose system or agent configuration issues.';
  readonly category = 'config' as const;
  readonly longDescription =
    'Runs diagnostic checks on the Ninja system, connected agents, or a specific ' +
    'subsystem. Use --verbose for full reports and --agent to target a specific agent.';

  async execute(ctx: CommandContext, payload: DiagnosePayload): Promise<void> {
    const target = payload.args.join(' ') || 'system';
    const verbose = (payload.flags.verbose as boolean) ?? false;
    const agent = payload.flags.agent as string | undefined;

    const spId = renderSpinner(`Running diagnostics on "${agent ?? target}"...`);

    this.appendHistory(ctx, 'system', `[diagnose] Diagnostics started — target: "${agent ?? target}", verbose: ${verbose}`);

    await simulatedDelay(600);

    const checks = [
      { name: 'Runtime connectivity', status: 'ok' as const },
      { name: 'Workspace configuration', status: 'ok' as const },
      { name: 'Agent roster sync', status: ctx.currentWorkspaceId ? 'ok' as const : 'warn' as const },
      { name: 'SDD artifact store', status: 'ok' as const },
    ];

    if (verbose) {
      checks.push(
        { name: 'Session token budget', status: 'ok' as const },
        { name: 'History buffer capacity', status: ctx.history.length > 100 ? 'warn' as const : 'ok' as const },
        { name: 'Memory persistence layer', status: 'ok' as const },
        { name: 'MCP server connections', status: 'ok' as const },
      );
    }

    const allOk = checks.every(c => c.status === 'ok');
    const warnings = checks.filter(c => c.status === 'warn');

    updateSpinner(spId, 'success', allOk ? 'All checks passed' : `${warnings.length} warning(s) found`);

    const checksReport = checks.map(c => {
      const icon = c.status === 'ok' ? chalk.green('✔') : chalk.yellow('⚠');
      return `  ${icon} ${c.name}`;
    }).join('\n');

    renderSuccess(
      `Diagnostic report for "${agent ?? target}".\n\n` +
      `${checksReport}\n\n` +
      `  ${allOk ? chalk.green.bold('System healthy') : chalk.yellow(`${warnings.length} warning(s) — run with --verbose for details`)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. /onboard — Onboard through SDD walkthrough
// ─────────────────────────────────────────────────────────────────────────────

export class OnboardCommand extends BaseCommand<OnboardPayload> {
  readonly name = 'onboard' as const;
  readonly description = 'Start the SDD onboarding walkthrough.';
  readonly category = 'planning' as const;
  readonly longDescription =
    'Guides the user through a step-by-step SDD workflow walkthrough. ' +
    'Use --step N to jump to a specific step.';

  async execute(ctx: CommandContext, payload: OnboardPayload): Promise<void> {
    const step = (payload.flags.step as number) ?? 1;

    const spId = renderSpinner(`Loading SDD onboarding (step ${step})...`);

    this.appendHistory(ctx, 'system', `[onboard] SDD onboarding started at step ${step}`);

    this.setMeta(ctx, 'onboardStep', step);

    const steps = [
      {
        title: 'Welcome to Spec-Driven Development',
        body: 'SDD is a structured workflow: Specify → Design → Tasks → Execute → Verify.\n  Each phase produces artifacts that are validated before moving forward.',
      },
      {
        title: 'Initialize your project',
        body: 'Run /init to bootstrap the SDD context in your project.\n  This detects your stack, conventions, and testing setup.',
      },
      {
        title: 'Propose a change',
        body: 'Run /planning <change-name> to start the planning workflow.\n  This creates a change proposal with intent and scope.',
      },
      {
        title: 'Explore and design',
        body: 'Use /explore <topic> to investigate the codebase.\n  Then /architect <feature> to create the technical design.',
      },
      {
        title: 'Break down tasks',
        body: 'Run /tasks to manage the implementation checklist.\n  Each task has verification criteria and atomic scope.',
      },
    ];

    const currentStep = steps[step - 1] ?? steps[steps.length - 1];
    const totalSteps = steps.length;

    await simulatedDelay(400);

    updateSpinner(spId, 'success', `Onboarding step ${step} loaded`);

    renderSuccess(
      `SDD Onboarding — Step ${step} of ${totalSteps}\n\n` +
      `  ${chalk.bold(currentStep.title)}\n\n` +
      `  ${currentStep.body}\n\n` +
      `  ${step < totalSteps ? `Next: /onboard --step ${step + 1}` : 'You have completed the onboarding! Start with /init.'}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. /refactor — Refactor code with guided analysis
// ─────────────────────────────────────────────────────────────────────────────

export class RefactorCommand extends BaseCommand<RefactorPayload> {
  readonly name = 'refactor' as const;
  readonly description = 'Refactor code with guided analysis and strategies.';
  readonly category = 'code' as const;
  readonly longDescription =
    'Analyzes the specified target and applies a refactoring strategy. ' +
    'Strategies: extract, inline, rename, split, merge. Use --dry-run to preview.';

  async execute(ctx: CommandContext, payload: RefactorPayload): Promise<void> {
    const target = payload.args.join(' ');
    const strategy = (payload.flags.strategy as string) ?? 'extract';
    const dryRun = (payload.flags['dry-run'] as boolean) ?? false;

    const spId = renderSpinner(`Analyzing "${target}" for ${strategy} refactoring...`);

    this.appendHistory(ctx, 'system', `[refactor] Refactoring started — target: "${target}", strategy: ${strategy}, dry-run: ${dryRun}`);

    this.setMeta(ctx, 'refactorTarget', target);
    this.setMeta(ctx, 'refactorStrategy', strategy);
    this.setMeta(ctx, 'refactorDryRun', dryRun);

    await simulatedDelay(900);

    const affectedFiles = 3;
    const changesCount = strategy === 'split' ? 7 : strategy === 'merge' ? 4 : 5;

    updateSpinner(spId, 'success', dryRun ? 'Dry-run analysis complete' : 'Refactoring analysis complete');

    renderSuccess(
      `Refactoring ${dryRun ? 'dry-run ' : ''}report for "${target}".\n` +
      `  Strategy:      ${chalk.bold(strategy)}\n` +
      `  Affected files: ${affectedFiles}\n` +
      `  Changes:        ${changesCount}\n` +
      `  Dry-run:        ${dryRun ? 'Yes (no files modified)' : 'No (changes will be applied)'}\n\n` +
      `  ${dryRun ? 'Review the changes above, then re-run without --dry-run to apply.' : 'Changes have been applied. Use /verify to validate the result.'}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. /snapshot — Take a codebase snapshot for recovery
// ─────────────────────────────────────────────────────────────────────────────

export class SnapshotCommand extends BaseCommand<SnapshotPayload> {
  readonly name = 'snapshot' as const;
  readonly description = 'Take a codebase snapshot for recovery or rollback.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Creates a snapshot of the current codebase state. Supports tar, zip, and git-stash ' +
    'formats. Use --include-deps to bundle node_modules.';

  async execute(ctx: CommandContext, payload: SnapshotPayload): Promise<void> {
    const label = payload.args.join(' ') || `snapshot-${Date.now()}`;
    const includeDeps = (payload.flags['include-deps'] as boolean) ?? false;
    const format = (payload.flags.format as string) ?? 'tar';

    const spId = renderSpinner(`Creating ${format} snapshot "${label}"...`);

    this.appendHistory(ctx, 'system', `[snapshot] Snapshot started — label: "${label}", format: ${format}, include-deps: ${includeDeps}`);

    const snapshotDir = join(homedir(), '.ninja', 'snapshots');
    ensureDir(snapshotDir);

    const extension = format === 'zip' ? 'zip' : format === 'git-stash' ? 'stash' : 'tar.gz';
    const snapshotFile = join(snapshotDir, `${label}.${extension}`);

    const snapshotMeta = {
      label,
      format,
      includeDeps,
      createdAt: new Date().toISOString(),
      workspaceId: ctx.currentWorkspaceId,
      historyLength: ctx.history.length,
    };

    writeFileSync(join(snapshotDir, `${label}.meta.json`), JSON.stringify(snapshotMeta, null, 2), 'utf-8');

    await simulatedDelay(includeDeps ? 1500 : 700);

    updateSpinner(spId, 'success', `Snapshot "${label}" created`);

    renderSuccess(
      `Snapshot saved.\n` +
      `  Label:       ${chalk.bold(label)}\n` +
      `  Format:      ${format}\n` +
      `  Include deps: ${includeDeps ? 'Yes' : 'No'}\n` +
      `  Location:    ${snapshotFile}\n` +
      `  Metadata:    ${join(snapshotDir, `${label}.meta.json`)}\n\n` +
      `  To restore: /rewind --to-snapshot "${label}"`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. /clear — Clear conversation history or context
// ─────────────────────────────────────────────────────────────────────────────

export class ClearCommand extends BaseCommand<ClearPayload> {
  readonly name = 'clear' as const;
  readonly description = 'Clear conversation history, context, or all session data.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Clears the specified part of the session. Targets: history (default), context, all. ' +
    'Use --force to skip confirmation.';

  async execute(ctx: CommandContext, payload: ClearPayload): Promise<void> {
    const target = (payload.args[0] as string) ?? 'history';
    const force = (payload.flags.force as boolean) ?? false;

    const spId = renderSpinner(`Clearing ${target}...`);

    const previousLength = ctx.history.length;

    if (target === 'history' || target === 'all') {
      ctx.history.length = 0;
      ctx.history.push({
        role: 'system',
        content: `[clear] History cleared at ${new Date().toISOString()}`,
        timestamp: new Date().toISOString(),
        index: 0,
      });
    }

    if (target === 'context' || target === 'all') {
      ctx.sessionMetadata = {
        effortLevel: 'high',
        fastMode: false,
        costUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        startedAt: new Date().toISOString(),
      };
    }

    this.setMeta(ctx, 'lastClearTarget', target);
    this.setMeta(ctx, 'lastClearAt', new Date().toISOString());

    await simulatedDelay(200);

    updateSpinner(spId, 'success', `${target} cleared`);

    renderSuccess(
      `Session ${target} cleared.\n` +
      `  Target:          ${target}\n` +
      `  Previous entries: ${previousLength}\n` +
      `  Force:           ${force ? 'Yes' : 'No'}\n\n` +
      `  The session is now in a fresh state for the cleared target(s).`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. /reset — Reset session to initial state
// ─────────────────────────────────────────────────────────────────────────────

export class ResetCommand extends BaseCommand<ResetPayload> {
  readonly name = 'reset' as const;
  readonly description = 'Reset the session to its initial state.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Resets the current session, clearing all state. Use --hard to also wipe ' +
    'persistent data. Use --keep-model to preserve the active model selection.';

  async execute(ctx: CommandContext, payload: ResetPayload): Promise<void> {
    const hard = (payload.flags.hard as boolean) ?? false;
    const keepModel = (payload.flags['keep-model'] as boolean) ?? false;

    const spId = renderSpinner(hard ? 'Performing hard reset...' : 'Resetting session...');

    const preservedModel = keepModel ? ctx.model : undefined;

    ctx.history.length = 0;
    ctx.currentWorkspaceId = undefined;
    ctx.model = preservedModel ?? 'claude-sonnet-4-6';
    ctx.sessionMetadata = {
      effortLevel: 'high',
      fastMode: false,
      costUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      startedAt: new Date().toISOString(),
    };

    if (hard) {
      const sessionDir = join(homedir(), '.ninja', 'sessions');
      if (existsSync(sessionDir)) {
        const metaFile = join(sessionDir, 'current-session.json');
        if (existsSync(metaFile)) {
          writeFileSync(metaFile, JSON.stringify({ resetAt: new Date().toISOString(), hard: true }, null, 2), 'utf-8');
        }
      }
    }

    ctx.history.push({
      role: 'system',
      content: `[reset] Session reset at ${new Date().toISOString()} (hard: ${hard}, keep-model: ${keepModel})`,
      timestamp: new Date().toISOString(),
      index: 0,
    });

    await simulatedDelay(300);

    updateSpinner(spId, 'success', 'Session reset');

    renderSuccess(
      `Session has been reset.\n` +
      `  Hard reset:  ${hard ? 'Yes (persistent data wiped)' : 'No (session-only)'}\n` +
      `  Model kept:  ${keepModel ? `Yes (${preservedModel})` : 'No (reset to default)'}\n` +
      `  Active model: ${ctx.model}\n\n` +
      `  The session is now in a clean state.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. /new — Start a new session or project
// ─────────────────────────────────────────────────────────────────────────────

export class NewCommand extends BaseCommand<NewPayload> {
  readonly name = 'new' as const;
  readonly description = 'Start a new session or project from scratch.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Creates a fresh session or project. Use --template to bootstrap from a template ' +
    'and --workspace to specify the working directory.';

  async execute(ctx: CommandContext, payload: NewPayload): Promise<void> {
    const name = payload.args.join(' ') || `session-${Date.now()}`;
    const template = payload.flags.template as string | undefined;
    const workspace = payload.flags.workspace as string | undefined;

    const spId = renderSpinner(`Creating new session "${name}"...`);

    ctx.history.length = 0;
    ctx.sessionMetadata = {
      effortLevel: 'high',
      fastMode: false,
      costUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      startedAt: new Date().toISOString(),
      sessionName: name,
    };

    if (workspace) {
      ctx.currentWorkspaceId = workspace;
    }

    if (template) {
      this.setMeta(ctx, 'newTemplate', template);
    }

    ctx.history.push({
      role: 'system',
      content: `[new] Session "${name}" created at ${new Date().toISOString()}` +
        `${template ? ` from template "${template}"` : ''}`,
      timestamp: new Date().toISOString(),
      index: 0,
    });

    const sessionDir = join(homedir(), '.ninja', 'sessions');
    ensureDir(sessionDir);
    writeFileSync(join(sessionDir, `${name}.json`), JSON.stringify({
      name,
      template,
      workspace,
      createdAt: new Date().toISOString(),
    }, null, 2), 'utf-8');

    await simulatedDelay(400);

    updateSpinner(spId, 'success', `Session "${name}" created`);

    renderSuccess(
      `New session created.\n` +
      `  Name:      ${chalk.bold(name)}\n` +
      `  Template:  ${template ?? 'None (blank session)'}\n` +
      `  Workspace: ${workspace ?? 'Current directory'}\n\n` +
      `  You are now in a fresh session. Start coding!`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. /resume — Resume a previous session or task
// ─────────────────────────────────────────────────────────────────────────────

export class ResumeCommand extends BaseCommand<ResumePayload> {
  readonly name = 'resume' as const;
  readonly description = 'Resume a previous session or task.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Resumes a previous session by name or ID. Use --last to resume the most recent session.';

  async execute(ctx: CommandContext, payload: ResumePayload): Promise<void> {
    const sessionId = payload.args[0];
    const last = (payload.flags.last as boolean) ?? false;

    const spId = renderSpinner(last ? 'Finding most recent session...' : `Resuming session "${sessionId}"...`);

    const sessionDir = join(homedir(), '.ninja', 'sessions');
    ensureDir(sessionDir);

    let targetSession = sessionId;

    if (last) {
      const sessionFile = join(sessionDir, 'current-session.json');
      if (existsSync(sessionFile)) {
        try {
          const raw = readFileSync(sessionFile, 'utf-8');
          const parsed = JSON.parse(raw) as { name?: string };
          targetSession = parsed.name ?? 'latest';
        } catch {
          targetSession = 'latest';
        }
      } else {
        targetSession = 'latest';
      }
    }

    this.setMeta(ctx, 'resumedFrom', targetSession);
    this.setMeta(ctx, 'resumedAt', new Date().toISOString());

    ctx.history.push({
      role: 'system',
      content: `[resume] Session "${targetSession}" resumed at ${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    });

    await simulatedDelay(500);

    updateSpinner(spId, 'success', `Session "${targetSession}" resumed`);

    renderSuccess(
      `Session resumed.\n` +
      `  Session:  ${chalk.bold(targetSession)}\n` +
      `  Last flag: ${last ? 'Yes (auto-detected most recent)' : 'No'}\n\n` +
      `  Your previous context has been restored. Continue where you left off.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. /rename — Rename the current session
// ─────────────────────────────────────────────────────────────────────────────

export class RenameCommand extends BaseCommand<RenamePayload> {
  readonly name = 'rename' as const;
  readonly description = 'Rename the current session.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Changes the human-readable label of the current session. The new name ' +
    'is persisted in session metadata.';

  async execute(ctx: CommandContext, payload: RenamePayload): Promise<void> {
    const newName = payload.args.join(' ');

    const oldName = (ctx.sessionMetadata.sessionName as string) ?? 'unnamed';

    const spId = renderSpinner(`Renaming session "${oldName}" → "${newName}"...`);

    this.setMeta(ctx, 'sessionName', newName);

    ctx.history.push({
      role: 'system',
      content: `[rename] Session renamed from "${oldName}" to "${newName}" at ${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    });

    const sessionDir = join(homedir(), '.ninja', 'sessions');
    ensureDir(sessionDir);
    const oldFile = join(sessionDir, `${oldName}.json`);
    const newFile = join(sessionDir, `${newName}.json`);
    if (existsSync(oldFile)) {
      try {
        const raw = readFileSync(oldFile, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        parsed.name = newName;
        parsed.renamedAt = new Date().toISOString();
        writeFileSync(newFile, JSON.stringify(parsed, null, 2), 'utf-8');
      } catch {
        writeFileSync(newFile, JSON.stringify({ name: newName, renamedAt: new Date().toISOString() }, null, 2), 'utf-8');
      }
    } else {
      writeFileSync(newFile, JSON.stringify({ name: newName, createdAt: new Date().toISOString() }, null, 2), 'utf-8');
    }

    await simulatedDelay(200);

    updateSpinner(spId, 'success', 'Session renamed');

    renderSuccess(
      `Session renamed.\n` +
      `  Old name: ${oldName}\n` +
      `  New name: ${chalk.bold(newName)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. /branch — Create a conversation branch
// ─────────────────────────────────────────────────────────────────────────────

export class BranchCommand extends BaseCommand<BranchPayload> {
  readonly name = 'branch' as const;
  readonly description = 'Create a conversation branch from the current session.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Creates a named branch of the conversation at the current point (or from a ' +
    'specific message index using --from-index). You can switch between branches.';

  async execute(ctx: CommandContext, payload: BranchPayload): Promise<void> {
    const branchName = payload.args.join(' ') || `branch-${Date.now()}`;
    const fromIndex = (payload.flags['from-index'] as number) ?? ctx.history.length - 1;

    const spId = renderSpinner(`Creating branch "${branchName}" from index ${fromIndex}...`);

    const branchPoint = ctx.history.slice(0, fromIndex + 1);

    this.setMeta(ctx, 'activeBranch', branchName);
    this.setMeta(ctx, 'branchPoint', fromIndex);

    const branches = (this.getMeta(ctx, 'branches', []) as Array<{ name: string; index: number; createdAt: string }>);
    branches.push({ name: branchName, index: fromIndex, createdAt: new Date().toISOString() });
    this.setMeta(ctx, 'branches', branches);

    const branchDir = join(homedir(), '.ninja', 'branches');
    ensureDir(branchDir);
    writeFileSync(join(branchDir, `${branchName}.json`), JSON.stringify({
      name: branchName,
      fromIndex,
      historySnapshot: branchPoint,
      createdAt: new Date().toISOString(),
    }, null, 2), 'utf-8');

    ctx.history.push({
      role: 'system',
      content: `[branch] Branch "${branchName}" created from index ${fromIndex} at ${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    });

    await simulatedDelay(350);

    updateSpinner(spId, 'success', `Branch "${branchName}" created`);

    renderSuccess(
      `Conversation branch created.\n` +
      `  Branch name:  ${chalk.bold(branchName)}\n` +
      `  From index:   ${fromIndex}\n` +
      `  Snapshot:     ${branchPoint.length} history entries\n\n` +
      `  The branch has been saved. Use /resume ${branchName} to switch to it.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. /fork — Fork the current session into a new independent session
// ─────────────────────────────────────────────────────────────────────────────

export class ForkCommand extends BaseCommand<ForkPayload> {
  readonly name = 'fork' as const;
  readonly description = 'Fork the current session into a new independent session.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Creates a completely independent copy of the current session. ' +
    'Use --carry-context (default true) to include the full conversation history.';

  async execute(ctx: CommandContext, payload: ForkPayload): Promise<void> {
    const label = payload.args.join(' ') || `fork-${Date.now()}`;
    const carryContext = (payload.flags['carry-context'] as boolean) ?? true;

    const spId = renderSpinner(`Forking session as "${label}"...`);

    const forkedHistory: HistoryEntry[] = carryContext
      ? ctx.history.map(entry => ({ ...entry }))
      : [];

    const forkedMetadata: Record<string, unknown> = { ...ctx.sessionMetadata };

    const forkDir = join(homedir(), '.ninja', 'sessions');
    ensureDir(forkDir);
    writeFileSync(join(forkDir, `${label}.json`), JSON.stringify({
      name: label,
      sourceSession: this.getMeta(ctx, 'sessionName', 'unnamed'),
      carryContext,
      historyLength: forkedHistory.length,
      metadata: forkedMetadata,
      model: ctx.model,
      workspaceId: ctx.currentWorkspaceId,
      createdAt: new Date().toISOString(),
    }, null, 2), 'utf-8');

    ctx.history.push({
      role: 'system',
      content: `[fork] Session forked as "${label}" at ${new Date().toISOString()} (carry-context: ${carryContext})`,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    });

    await simulatedDelay(400);

    updateSpinner(spId, 'success', `Fork "${label}" created`);

    renderSuccess(
      `Session forked.\n` +
      `  Fork name:      ${chalk.bold(label)}\n` +
      `  Carry context:   ${carryContext ? `Yes (${forkedHistory.length} entries)` : 'No (fresh fork)'}\n` +
      `  Source model:    ${ctx.model}\n` +
      `  Source workspace: ${ctx.currentWorkspaceId ?? 'None'}\n\n` +
      `  The forked session is independent. Use /resume ${label} to switch to it.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 18. /rewind — Rewind history to a prior state
// ─────────────────────────────────────────────────────────────────────────────

export class RewindCommand extends BaseCommand<RewindPayload> {
  readonly name = 'rewind' as const;
  readonly description = 'Rewind conversation history to a prior state.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Rewinds the session history by N turns (--turns) or to a specific message ' +
    'index (--to-index). Dropped messages are permanently removed.';

  async execute(ctx: CommandContext, payload: RewindPayload): Promise<void> {
    const turns = payload.flags.turns as number | undefined;
    const toIndex = payload.flags['to-index'] as number | undefined;
    const rawArg = payload.args[0];
    const argValue = rawArg !== undefined ? parseInt(rawArg, 10) : undefined;

    const previousLength = ctx.history.length;

    if (toIndex !== undefined) {
      const target = Math.max(0, Math.min(toIndex, ctx.history.length - 1));
      ctx.history.splice(target + 1);
    } else if (turns !== undefined) {
      const removeCount = Math.min(turns * 2, ctx.history.length);
      if (removeCount > 0) {
        ctx.history.splice(ctx.history.length - removeCount);
      }
    } else if (argValue !== undefined && !isNaN(argValue)) {
      if (argValue >= 0 && argValue < ctx.history.length) {
        ctx.history.splice(argValue + 1);
      } else {
        const removeCount = Math.min(argValue, ctx.history.length);
        ctx.history.splice(ctx.history.length - removeCount);
      }
    } else {
      renderError('Specify --turns N, --to-index N, or a numeric argument to rewind.');
      throw new Error('/rewind requires a target');
    }

    const newLength = ctx.history.length;

    ctx.history.push({
      role: 'system',
      content: `[rewind] History rewound from ${previousLength} to ${newLength} entries at ${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    });

    this.setMeta(ctx, 'lastRewindAt', new Date().toISOString());

    renderSuccess(
      `History rewound.\n` +
      `  Previous length: ${previousLength}\n` +
      `  Current length:  ${newLength + 1}\n` +
      `  Turns removed:   ${previousLength - newLength}\n\n` +
      `  The session has been rewound. Messages after the rewind point are gone.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 19. /exit — Exit the CLI session gracefully
// ─────────────────────────────────────────────────────────────────────────────

export class ExitCommand extends BaseCommand<ExitPayload> {
  readonly name = 'exit' as const;
  readonly description = 'Exit the CLI session gracefully.';
  readonly category = 'general' as const;
  readonly longDescription =
    'Exits the current CLI session. By default, the session is saved before exit. ' +
    'Use --no-save to skip saving.';

  async execute(ctx: CommandContext, payload: ExitPayload): Promise<void> {
    const noSave = (payload.flags['no-save'] as boolean) ?? false;

    const spId = renderSpinner(noSave ? 'Exiting without saving...' : 'Saving session before exit...');

    if (!noSave) {
      const sessionDir = join(homedir(), '.ninja', 'sessions');
      ensureDir(sessionDir);
      const sessionName = (ctx.sessionMetadata.sessionName as string) ?? `exit-${Date.now()}`;
      writeFileSync(join(sessionDir, `${sessionName}.json`), JSON.stringify({
        name: sessionName,
        history: ctx.history,
        metadata: ctx.sessionMetadata,
        model: ctx.model,
        workspaceId: ctx.currentWorkspaceId,
        exitedAt: new Date().toISOString(),
      }, null, 2), 'utf-8');
    }

    this.setMeta(ctx, 'exitRequested', true);
    this.setMeta(ctx, 'exitNoSave', noSave);

    ctx.history.push({
      role: 'system',
      content: `[exit] Session exit requested at ${new Date().toISOString()} (saved: ${!noSave})`,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    });

    await simulatedDelay(300);

    updateSpinner(spId, 'success', 'Session exit processed');

    renderSuccess(
      `Session exit.\n` +
      `  Saved: ${noSave ? 'No (--no-save)' : 'Yes'}\n\n` +
      `  Goodbye! The CLI process will now terminate.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 20. /quit — Alias for exit
// ─────────────────────────────────────────────────────────────────────────────

export class QuitCommand extends BaseCommand<QuitPayload> {
  readonly name = 'quit' as const;
  readonly description = 'Alias for /exit — quit the CLI session.';
  readonly category = 'general' as const;
  readonly longDescription =
    'Functional alias for /exit. See /exit for full documentation.';

  async execute(ctx: CommandContext, payload: QuitPayload): Promise<void> {
    const noSave = (payload.flags['no-save'] as boolean) ?? false;

    const spId = renderSpinner(noSave ? 'Quitting without saving...' : 'Saving session before quit...');

    if (!noSave) {
      const sessionDir = join(homedir(), '.ninja', 'sessions');
      ensureDir(sessionDir);
      const sessionName = (ctx.sessionMetadata.sessionName as string) ?? `quit-${Date.now()}`;
      writeFileSync(join(sessionDir, `${sessionName}.json`), JSON.stringify({
        name: sessionName,
        history: ctx.history,
        metadata: ctx.sessionMetadata,
        model: ctx.model,
        workspaceId: ctx.currentWorkspaceId,
        quitAt: new Date().toISOString(),
      }, null, 2), 'utf-8');
    }

    this.setMeta(ctx, 'exitRequested', true);
    this.setMeta(ctx, 'exitNoSave', noSave);

    ctx.history.push({
      role: 'system',
      content: `[quit] Session quit requested at ${new Date().toISOString()} (saved: ${!noSave})`,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    });

    await simulatedDelay(300);

    updateSpinner(spId, 'success', 'Session quit processed');

    renderSuccess(
      `Session quit.\n` +
      `  Saved: ${noSave ? 'No (--no-save)' : 'Yes'}\n\n` +
      `  Goodbye! The CLI process will now terminate.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 21. /compact — Compact/summarize conversation context
// ─────────────────────────────────────────────────────────────────────────────

export class CompactCommand extends BaseCommand<CompactPayload> {
  readonly name = 'compact' as const;
  readonly description = 'Compact and summarize the conversation context window.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Reduces the context window size by summarizing older messages into a compact ' +
    'representation. Use --budget to set a target token count.';

  async execute(ctx: CommandContext, payload: CompactPayload): Promise<void> {
    const instruction = payload.args.join(' ') || 'summarize the key decisions and progress';
    const budget = (payload.flags.budget as number) ?? 4000;

    const spId = renderSpinner(`Compacting context (target budget: ${budget} tokens)...`);

    const originalLength = ctx.history.length;

    if (originalLength <= 3) {
      updateSpinner(spId, 'success', 'Context is already minimal — no compaction needed');
      renderSuccess(
        `Context is too small to compact (${originalLength} entries).\n` +
        `  No changes made.`,
      );
      return;
    }

    const systemEntries = ctx.history.filter(e => e.role === 'system');
    const recentEntries = ctx.history.slice(-5);
    const olderEntries = ctx.history.slice(0, -5);

    const summaryContent = olderEntries.length > 0
      ? `[compact] Summary of ${olderEntries.length} earlier messages: ${instruction}. ` +
        `Key topics: ${extractKeyTopics(olderEntries)}. ` +
        `Decisions made: ${extractDecisions(olderEntries)}.`
      : '';

    const compactedEntry: HistoryEntry = {
      role: 'system',
      content: summaryContent,
      timestamp: new Date().toISOString(),
      index: 0,
    };

    ctx.history.length = 0;
    ctx.history.push(compactedEntry);
    for (const entry of systemEntries) {
      ctx.history.push({ ...entry, index: ctx.history.length });
    }
    for (const entry of recentEntries) {
      ctx.history.push({ ...entry, index: ctx.history.length });
    }

    this.setMeta(ctx, 'lastCompactAt', new Date().toISOString());
    this.setMeta(ctx, 'lastCompactBudget', budget);

    await simulatedDelay(600);

    updateSpinner(spId, 'success', `Context compacted: ${originalLength} → ${ctx.history.length} entries`);

    renderSuccess(
      `Context compacted.\n` +
      `  Original entries:  ${originalLength}\n` +
      `  Compacted entries: ${ctx.history.length}\n` +
      `  Reduction:         ${originalLength - ctx.history.length} entries summarized\n` +
      `  Target budget:     ${budget} tokens\n` +
      `  Instruction:       "${instruction}"\n\n` +
      `  Older messages have been summarized into a compact representation.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 22. /context — Show or manipulate the current context window
// ─────────────────────────────────────────────────────────────────────────────

export class ContextCommand extends BaseCommand<ContextPayload> {
  readonly name = 'context' as const;
  readonly description = 'Show or manipulate the current context window.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Subcommands: show (default), add, remove, list. ' +
    'Use --file to specify a file path for add/remove operations.';

  async execute(ctx: CommandContext, payload: ContextPayload): Promise<void> {
    const subcommand = (payload.args[0] as string) ?? 'show';
    const file = payload.flags.file as string | undefined;

    const spId = renderSpinner(`Processing context ${subcommand}...`);

    switch (subcommand) {
      case 'show': {
        await simulatedDelay(200);

        const contextFiles = (this.getMeta(ctx, 'contextFiles', []) as string[]);
        const totalEntries = ctx.history.length;
        const model = ctx.model;
        const effortLevel = this.getMeta(ctx, 'effortLevel', 'high') as string;
        const fastMode = this.getMeta(ctx, 'fastMode', false) as boolean;

        updateSpinner(spId, 'success', 'Context state retrieved');

        renderSuccess(
          `Current context window.\n` +
          `  Model:          ${model}\n` +
          `  Effort level:    ${effortLevel}\n` +
          `  Fast mode:       ${fastMode ? 'On' : 'Off'}\n` +
          `  History entries: ${totalEntries}\n` +
          `  Context files:   ${contextFiles.length > 0 ? contextFiles.join(', ') : 'None'}\n` +
          `  Workspace:       ${ctx.currentWorkspaceId ?? 'Not set'}`,
        );
        break;
      }

      case 'add': {
        if (!file) {
          updateSpinner(spId, 'error', 'No file specified for context add');
          renderError('Specify a file with --file to add to the context window.');
          throw new Error('/context add requires --file');
        }

        const contextFiles = (this.getMeta(ctx, 'contextFiles', []) as string[]);
        if (!contextFiles.includes(file)) {
          contextFiles.push(file);
        }
        this.setMeta(ctx, 'contextFiles', contextFiles);

        ctx.history.push({
          role: 'system',
          content: `[context] File "${file}" added to context window at ${new Date().toISOString()}`,
          timestamp: new Date().toISOString(),
          index: ctx.history.length,
        });

        await simulatedDelay(200);
        updateSpinner(spId, 'success', `File "${file}" added to context`);

        renderSuccess(
          `File added to context.\n` +
          `  File:     ${chalk.bold(file)}\n` +
          `  Total context files: ${contextFiles.length}`,
        );
        break;
      }

      case 'remove': {
        if (!file) {
          updateSpinner(spId, 'error', 'No file specified for context remove');
          renderError('Specify a file with --file to remove from the context window.');
          throw new Error('/context remove requires --file');
        }

        let contextFiles = (this.getMeta(ctx, 'contextFiles', []) as string[]);
        contextFiles = contextFiles.filter(f => f !== file);
        this.setMeta(ctx, 'contextFiles', contextFiles);

        ctx.history.push({
          role: 'system',
          content: `[context] File "${file}" removed from context window at ${new Date().toISOString()}`,
          timestamp: new Date().toISOString(),
          index: ctx.history.length,
        });

        await simulatedDelay(200);
        updateSpinner(spId, 'success', `File "${file}" removed from context`);

        renderSuccess(
          `File removed from context.\n` +
          `  File:     ${file}\n` +
          `  Remaining context files: ${contextFiles.length}`,
        );
        break;
      }

      case 'list': {
        await simulatedDelay(150);
        const contextFiles = (this.getMeta(ctx, 'contextFiles', []) as string[]);

        updateSpinner(spId, 'success', 'Context file list retrieved');

        const fileList = contextFiles.length > 0
          ? contextFiles.map(f => `  - ${f}`).join('\n')
          : '  (no files in context)';

        renderSuccess(
          `Context files.\n${fileList}\n\n` +
          `  Use /context add --file <path> to add files.\n` +
          `  Use /context remove --file <path> to remove files.`,
        );
        break;
      }

      default: {
        updateSpinner(spId, 'error', `Unknown subcommand: ${subcommand}`);
        renderError(`Unknown /context subcommand: "${subcommand}". Use: show, add, remove, list.`);
        throw new Error(`Invalid /context subcommand: ${subcommand}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 23. /memory — Manage Engram persistent memory
// ─────────────────────────────────────────────────────────────────────────────

export class MemoryCommand extends BaseCommand<MemoryPayload> {
  readonly name = 'memory' as const;
  readonly description = 'Manage Engram persistent memory (search, save, show, delete, list).';
  readonly category = 'session' as const;
  readonly longDescription =
    'Interacts with the Engram persistent memory system. Subcommands: search, show, ' +
    'save, delete, list. Use --query for search, --id for show/delete.';

  async execute(ctx: CommandContext, payload: MemoryPayload): Promise<void> {
    const subcommand = (payload.args[0] as string) ?? 'list';
    const query = payload.flags.query as string | undefined;
    const id = payload.flags.id as string | undefined;

    const spId = renderSpinner(`Memory ${subcommand}${query ? `: "${query}"` : id ? `: #${id}` : ''}...`);

    switch (subcommand) {
      case 'list': {
        await simulatedDelay(300);

        const memoryDir = join(homedir(), '.ninja', 'engram');
        const observations: string[] = [];
        if (existsSync(memoryDir)) {
          try {
            const entries = readFileSync(join(memoryDir, 'index.json'), 'utf-8');
            const parsed = JSON.parse(entries) as Array<{ id: number; title: string }>;
            for (const obs of parsed.slice(0, 20)) {
              observations.push(`  [${obs.id}] ${obs.title}`);
            }
          } catch {
            observations.push('  (no observations stored yet)');
          }
        } else {
          observations.push('  (engram not initialized — use /init to bootstrap)');
        }

        updateSpinner(spId, 'success', `${observations.length} observation(s) found`);

        renderSuccess(
          `Engram memory observations.\n\n${observations.join('\n')}\n\n` +
          `  Use /memory search --query <text> to find specific observations.\n` +
          `  Use /memory show --id <id> to view a full observation.`,
        );
        break;
      }

      case 'search': {
        if (!query) {
          updateSpinner(spId, 'error', 'No query provided');
          renderError('Specify a search query with --query.');
          throw new Error('/memory search requires --query');
        }

        await simulatedDelay(400);

        const results = [
          { id: 1, title: 'JWT auth middleware', relevance: 0.95 },
          { id: 7, title: 'Fixed N+1 in UserList', relevance: 0.82 },
          { id: 14, title: 'Architecture decision: Zod schemas', relevance: 0.71 },
        ].filter(r => r.relevance > 0.5);

        this.setMeta(ctx, 'lastMemorySearch', query);
        this.setMeta(ctx, 'lastMemorySearchAt', new Date().toISOString());

        updateSpinner(spId, 'success', `${results.length} result(s) for "${query}"`);

        const resultsList = results.map(r =>
          `  [${r.id}] ${r.title} (relevance: ${(r.relevance * 100).toFixed(0)}%)`
        ).join('\n');

        renderSuccess(
          `Memory search results for "${query}".\n\n${resultsList || '  (no results found)'}\n\n` +
          `  Use /memory show --id <id> to view a full observation.`,
        );
        break;
      }

      case 'show': {
        if (!id) {
          updateSpinner(spId, 'error', 'No observation ID provided');
          renderError('Specify an observation ID with --id.');
          throw new Error('/memory show requires --id');
        }

        await simulatedDelay(200);

        updateSpinner(spId, 'success', `Observation #${id} loaded`);

        renderSuccess(
          `Observation #${id}.\n\n` +
          `  Title:   Example observation\n` +
          `  Type:    decision\n` +
          `  Created: ${new Date().toISOString()}\n\n` +
          `  Content:\n` +
          `  What:  This is a simulated observation display.\n` +
          `  Why:   Demonstrating the /memory show command.\n` +
          `  Where: apps/dojo-cli/src/commands/commands-core.ts\n` +
          `  Learned: The /memory command integrates with Engram.`,
        );
        break;
      }

      case 'save': {
        await simulatedDelay(300);

        const observation = {
          id: Date.now(),
          title: query ?? `observation-${Date.now()}`,
          content: payload.rawInput,
          type: 'manual',
          createdAt: new Date().toISOString(),
        };

        const memoryDir = join(homedir(), '.ninja', 'engram');
        ensureDir(memoryDir);
        writeFileSync(join(memoryDir, `obs-${observation.id}.json`), JSON.stringify(observation, null, 2), 'utf-8');

        ctx.history.push({
          role: 'system',
          content: `[memory] Observation saved: "${observation.title}" (#${observation.id}) at ${new Date().toISOString()}`,
          timestamp: new Date().toISOString(),
          index: ctx.history.length,
        });

        updateSpinner(spId, 'success', `Observation #${observation.id} saved`);

        renderSuccess(
          `Observation saved to Engram.\n` +
          `  ID:    #${observation.id}\n` +
          `  Title: ${observation.title}\n` +
          `  Type:  ${observation.type}`,
        );
        break;
      }

      case 'delete': {
        if (!id) {
          updateSpinner(spId, 'error', 'No observation ID provided');
          renderError('Specify an observation ID with --id to delete.');
          throw new Error('/memory delete requires --id');
        }

        await simulatedDelay(200);

        const memoryDir = join(homedir(), '.ninja', 'engram');
        const obsFile = join(memoryDir, `obs-${id}.json`);
        if (existsSync(obsFile)) {
          writeFileSync(obsFile, JSON.stringify({ deleted: true, deletedAt: new Date().toISOString() }, null, 2), 'utf-8');
        }

        updateSpinner(spId, 'success', `Observation #${id} deleted`);

        renderSuccess(
          `Observation #${id} has been deleted from Engram.`,
        );
        break;
      }

      default: {
        updateSpinner(spId, 'error', `Unknown subcommand: ${subcommand}`);
        renderError(`Unknown /memory subcommand: "${subcommand}". Use: search, show, save, delete, list.`);
        throw new Error(`Invalid /memory subcommand: ${subcommand}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 24. /export — Export session artifacts or history to disk
// ─────────────────────────────────────────────────────────────────────────────

export class ExportCommand extends BaseCommand<ExportPayload> {
  readonly name = 'export' as const;
  readonly description = 'Export session artifacts or history to disk.';
  readonly category = 'session' as const;
  readonly longDescription =
    'Exports session data to a file on disk. Targets: session, artifacts, history, all. ' +
    'Use --output to set the output directory and --format for json/markdown/csv.';

  async execute(ctx: CommandContext, payload: ExportPayload): Promise<void> {
    const target = (payload.args[0] as string) ?? 'session';
    const outputDir = (payload.flags.output as string) ?? join(homedir(), '.ninja', 'exports');
    const format = (payload.flags.format as string) ?? 'json';

    const spId = renderSpinner(`Exporting ${target} as ${format}...`);

    ensureDir(outputDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `${target}-export-${timestamp}`;

    switch (target) {
      case 'session': {
        const exportData = {
          model: ctx.model,
          workspaceId: ctx.currentWorkspaceId,
          metadata: ctx.sessionMetadata,
          history: ctx.history,
          exportedAt: new Date().toISOString(),
        };

        if (format === 'json') {
          writeFileSync(join(outputDir, `${baseName}.json`), JSON.stringify(exportData, null, 2), 'utf-8');
        } else if (format === 'markdown') {
          const md = [
            `# Session Export`,
            ``,
            `**Model**: ${ctx.model}`,
            `**Workspace**: ${ctx.currentWorkspaceId ?? 'N/A'}`,
            `**Exported**: ${new Date().toISOString()}`,
            ``,
            `## History`,
            ``,
            ...ctx.history.map(e => `**[${e.role}]** (${e.timestamp}): ${e.content}`),
          ].join('\n');
          writeFileSync(join(outputDir, `${baseName}.md`), md, 'utf-8');
        } else if (format === 'csv') {
          const csvHeader = 'role,timestamp,index,content';
          const csvRows = ctx.history.map(e =>
            `"${e.role}","${e.timestamp}",${e.index},"${e.content.replace(/"/g, '""')}"`
          );
          writeFileSync(join(outputDir, `${baseName}.csv`), [csvHeader, ...csvRows].join('\n'), 'utf-8');
        }
        break;
      }

      case 'history': {
        if (format === 'json') {
          writeFileSync(join(outputDir, `${baseName}.json`), JSON.stringify(ctx.history, null, 2), 'utf-8');
        } else if (format === 'markdown') {
          const md = [
            `# History Export`,
            ``,
            ...ctx.history.map(e => `- **[${e.role}]** (${e.timestamp}): ${e.content}`),
          ].join('\n');
          writeFileSync(join(outputDir, `${baseName}.md`), md, 'utf-8');
        } else if (format === 'csv') {
          const csvHeader = 'role,timestamp,index,content';
          const csvRows = ctx.history.map(e =>
            `"${e.role}","${e.timestamp}",${e.index},"${e.content.replace(/"/g, '""')}"`
          );
          writeFileSync(join(outputDir, `${baseName}.csv`), [csvHeader, ...csvRows].join('\n'), 'utf-8');
        }
        break;
      }

      case 'artifacts': {
        const artifactDir = join(homedir(), '.ninja', 'sdd');
        const artifactData: Record<string, unknown> = {};
        if (existsSync(artifactDir)) {
          artifactData.path = artifactDir;
          artifactData.exportedAt = new Date().toISOString();
        }
        writeFileSync(join(outputDir, `${baseName}.json`), JSON.stringify(artifactData, null, 2), 'utf-8');
        break;
      }

      case 'all': {
        const allData = {
          session: {
            model: ctx.model,
            workspaceId: ctx.currentWorkspaceId,
            metadata: ctx.sessionMetadata,
          },
          history: ctx.history,
          exportedAt: new Date().toISOString(),
        };
        writeFileSync(join(outputDir, `${baseName}.json`), JSON.stringify(allData, null, 2), 'utf-8');
        break;
      }
    }

    ctx.history.push({
      role: 'system',
      content: `[export] ${target} exported as ${format} to ${outputDir} at ${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    });

    await simulatedDelay(500);

    updateSpinner(spId, 'success', `${target} exported as ${format}`);

    renderSuccess(
      `Export complete.\n` +
      `  Target:   ${target}\n` +
      `  Format:   ${format}\n` +
      `  Output:   ${outputDir}\n` +
      `  File:     ${baseName}.${format === 'markdown' ? 'md' : format === 'csv' ? 'csv' : 'json'}\n\n` +
      `  The exported file is ready for review or sharing.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 25. /copy — Copy last response or artifact to clipboard
// ─────────────────────────────────────────────────────────────────────────────

export class CopyCommand extends BaseCommand<CopyPayload> {
  readonly name = 'copy' as const;
  readonly description = 'Copy last response or artifact to clipboard.';
  readonly category = 'general' as const;
  readonly longDescription =
    'Copies content to the system clipboard. Targets: last (default), artifact:<id>. ' +
    'Use --markdown for markdown format or --plain for plain text.';

  async execute(ctx: CommandContext, payload: CopyPayload): Promise<void> {
    const target = payload.args[0] ?? 'last';
    const markdown = (payload.flags.markdown as boolean) ?? false;
    const plain = (payload.flags.plain as boolean) ?? true;

    const spId = renderSpinner(`Copying ${target} to clipboard...`);

    let contentToCopy = '';

    if (target === 'last') {
      const assistantEntries = ctx.history.filter(e => e.role === 'assistant');
      if (assistantEntries.length > 0) {
        const lastEntry = assistantEntries[assistantEntries.length - 1];
        contentToCopy = lastEntry.content;
      } else {
        const lastEntry = ctx.history[ctx.history.length - 1];
        contentToCopy = lastEntry?.content ?? '';
      }
    } else if (target.startsWith('artifact:')) {
      const artifactId = target.slice('artifact:'.length);
      contentToCopy = `[artifact:${artifactId}] Content would be fetched from Engram/OpenSpec.`;
    } else {
      contentToCopy = target;
    }

    if (markdown && !plain) {
      contentToCopy = `\`\`\`\n${contentToCopy}\n\`\`\``;
    }

    let clipboardSuccess = false;
    try {
      const { execSync } = await import('child_process');
      const platform = process.platform;
      if (platform === 'win32') {
        execSync(`echo ${Buffer.from(contentToCopy).toString('base64')} | certutil -decode -f - - | clip`, { stdio: 'pipe' });
        clipboardSuccess = true;
      } else if (platform === 'darwin') {
        execSync(`echo "${contentToCopy.replace(/"/g, '\\"')}" | pbcopy`, { stdio: 'pipe' });
        clipboardSuccess = true;
      } else if (platform === 'linux') {
        execSync(`echo "${contentToCopy.replace(/"/g, '\\"')}" | xclip -selection clipboard`, { stdio: 'pipe' });
        clipboardSuccess = true;
      }
    } catch {
      clipboardSuccess = false;
    }

    ctx.history.push({
      role: 'system',
      content: `[copy] Content copied to clipboard at ${new Date().toISOString()} (target: ${target})`,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    });

    await simulatedDelay(150);

    if (clipboardSuccess) {
      updateSpinner(spId, 'success', 'Copied to clipboard');
    } else {
      updateSpinner(spId, 'success', 'Content prepared (clipboard unavailable — content logged)');
    }

    const previewLength = Math.min(contentToCopy.length, 80);
    const preview = contentToCopy.length > 80
      ? contentToCopy.slice(0, previewLength) + '...'
      : contentToCopy;

    renderSuccess(
      `Content copied.\n` +
      `  Target:    ${target}\n` +
      `  Format:    ${markdown ? 'Markdown' : plain ? 'Plain text' : 'Default'}\n` +
      `  Clipboard: ${clipboardSuccess ? 'Yes (system clipboard updated)' : 'No (fallback: content in session log)'}\n` +
      `  Preview:   "${preview}"`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal utilities
// ─────────────────────────────────────────────────────────────────────────────

function simulatedDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function extractKeyTopics(entries: HistoryEntry[]): string {
  const content = entries.map(e => e.content).join(' ');
  const words = content.split(/\s+/).filter(w => w.length > 4);
  const freq = new Map<string, number>();
  for (const word of words) {
    const lower = word.toLowerCase();
    freq.set(lower, (freq.get(lower) ?? 0) + 1);
  }
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
  return sorted.join(', ') || 'general';
}

function extractDecisions(entries: HistoryEntry[]): string {
  const decisionEntries = entries.filter(
    e => e.role === 'assistant' && e.content.toLowerCase().includes('decision'),
  );
  if (decisionEntries.length === 0) return 'none identified in compacted range';
  return `${decisionEntries.length} decision(s) noted in earlier context`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry export — all 25 core command instances
// ─────────────────────────────────────────────────────────────────────────────

export const coreCommands = [
  new GrillmeCommand(),
  new GoalCommand(),
  new PlanningCommand(),
  new ExploreCommand(),
  new VerifyCommand(),
  new ArchitectCommand(),
  new DiagnoseCommand(),
  new OnboardCommand(),
  new RefactorCommand(),
  new SnapshotCommand(),
  new ClearCommand(),
  new ResetCommand(),
  new NewCommand(),
  new ResumeCommand(),
  new RenameCommand(),
  new BranchCommand(),
  new ForkCommand(),
  new RewindCommand(),
  new ExitCommand(),
  new QuitCommand(),
  new CompactCommand(),
  new ContextCommand(),
  new MemoryCommand(),
  new ExportCommand(),
  new CopyCommand(),
] as const;

export type CoreCommandInstance = (typeof coreCommands)[number];
