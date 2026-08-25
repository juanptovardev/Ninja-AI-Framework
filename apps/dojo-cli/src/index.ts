import { createLogger } from '@ninja/logging';
import { runLauncher } from './launcher.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { workspacesCommand } from './commands/workspaces.js';
import { setupCommand } from './commands/setup.js';
import { installCommand } from './commands/install.js';
import { syncCommand } from './commands/sync.js';
import { uninstallCommand } from './commands/uninstall.js';
import { doctorCommand } from './commands/doctor.js';
import { updateCommand } from './commands/update.js';
import { printBanner, printError, printInfo, printDivider } from './display.js';
import { viewSessionHistory, viewArtifactHistory } from './history-viewer.js';
import { submitEngineRequest } from './runtime-client.js';
import { CommandPipeline } from './pipeline/command-pipeline.js';
import { createCommandContext } from './commands/base-command.js';
import { allCommands } from './commands/command-handlers.js';

const log = createLogger('dojo-cli');

/** Modos operativos del Ninja AI Framework según Plan Maestro §7 */
type NinjaMode = 'build' | 'repair' | 'template' | 'workspace';

async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
      // Sin argumentos → launcher interactivo (experiencia principal)
      await runLauncher();
      return;
    }

    // Si el argumento comienza con una barra (/), lo ejecutamos directamente
    // en el CommandPipeline sin iniciar el menú del launcher.
    if (command.startsWith('/')) {
      const pipeline = new CommandPipeline();
      for (const cmd of allCommands) {
        pipeline.registerCommand(cmd);
      }
      const ctx = createCommandContext({
        model: 'gemini-3.5-flash',
      });
      const rawInput = args.join(' ');
      try {
        await pipeline.execute(rawInput, ctx);
      } catch (err) {
        process.exit(1);
      }
      process.exit(0);
    }

    switch (command) {
      // ── Arranque del runtime ──────────────────────────────────────────────
      case 'start':
        await startCommand();
        break;

      case 'setup':
        await setupCommand();
        break;

      // ── Estado del sistema ────────────────────────────────────────────────
      case 'status':
        await statusCommand();
        break;

      // ── Orchestration Installation (Gentle AI-compatible pipeline) ────────
      case 'install':
        await installCommand(args.slice(1));
        break;

      case 'sync':
        await syncCommand(args.slice(1));
        break;

      case 'uninstall':
        await uninstallCommand(args.slice(1));
        break;

      case 'doctor':
        await doctorCommand(args.slice(1));
        break;

      case 'update':
        await updateCommand(args.slice(1));
        break;

      // ── Gestión de workspaces ─────────────────────────────────────────────
      case 'workspaces':
      case 'ws': {
        const workspacesAction = args[1] as 'list' | 'select' | undefined;
        await workspacesCommand(workspacesAction);
        break;
      }

      // ── Modos operativos del Kage Engine ──────────────────────────────────
      case 'build': {
        printBanner();
        printInfo('Modo: Build — Construir software desde prompt/idea');
        printDivider();
        const buildPrompt = args.slice(1).join(' ');
        if (!buildPrompt) {
          printError('Uso: ninja build <prompt>');
          process.exit(1);
        }
        const buildRun = await submitEngineRequest({ mode: 'build', prompt: buildPrompt, workspaceId: 'default-workspace' });
        if (buildRun) {
          printInfo(`Solicitud aceptada. Run ID: ${buildRun.id} — Estado: ${buildRun.status}`);
        } else {
          printError('No se pudo enviar la solicitud al Kage Engine. ¿Está el runtime activo?');
          process.exit(1);
        }
        break;
      }

      case 'repair': {
        printBanner();
        printInfo('Modo: Repair — Corregir builds rotos y errores de calidad');
        printDivider();
        const repairPrompt = args.slice(1).join(' ') || 'repair';
        const repairRun = await submitEngineRequest({ mode: 'repair', prompt: repairPrompt, workspaceId: 'default-workspace' });
        if (repairRun) {
          printInfo(`Solicitud aceptada. Run ID: ${repairRun.id} — Estado: ${repairRun.status}`);
        } else {
          printError('No se pudo enviar la solicitud al Kage Engine. ¿Está el runtime activo?');
          process.exit(1);
        }
        break;
      }

      case 'template': {
        printBanner();
        printInfo('Modo: Template — Seleccionar y adaptar templates base');
        printDivider();
        printInfo('Implementación completa disponible en Fase 3.4 (Kage Engine).');
        break;
      }

      // ── Historial ─────────────────────────────────────────────────────────
      case 'history': {
        const subCmd = args[1] ?? 'sessions';
        const limit = parseInt(args[2] ?? '10', 10);

        if (subCmd === 'sessions') {
          await viewSessionHistory(limit);
        } else if (subCmd === 'artifacts') {
          await viewArtifactHistory(limit);
        } else {
          printError(`Subcomando de historial no reconocido: ${subCmd}`);
          printInfo('Uso: ninja history [sessions|artifacts] [limit]');
        }
        break;
      }

      // ── Ayuda ─────────────────────────────────────────────────────────────
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      // ── Desconocido ───────────────────────────────────────────────────────
      default:
        printError(`Comando no reconocido: ${command}`);
        showHelp();
        process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    log.error('Dojo CLI encountered a fatal error', err);
    process.exit(1);
  }
}

function showHelp(): void {
  printBanner();
  printInfo('Ninja AI Framework — Dojo CLI');
  printDivider();
  console.log('');
  console.log('  ORCHESTRATION (Gentle AI-compatible)');
  console.log('');
  console.log('    ninja install [agent|--all]       Install Ninja into AI agent(s)');
  console.log('    ninja sync [agent|--all]           Sync updated files to agent(s)');
  console.log('    ninja uninstall [agent|--all]      Remove Ninja from agent(s)');
  console.log('    ninja doctor [agent]               Diagnose agent configurations');
  console.log('    ninja update [--check]               Check/apply Ninja updates');
  console.log('');
  console.log('  Agents: claude-code | codex | cursor | opencode | gemini-cli | windsurf |');
  console.log('          vscode-copilot | kimi-code | kiro-ide | qwen-code | antigravity-2 | ...');
  console.log('');
  console.log('  COMANDOS PRINCIPALES');
  console.log('');
  console.log('    ninja                              Launcher interactivo (menú visual)');
  console.log('    ninja setup                        Configurar localmente Ninja y conectar IDEs');
  console.log('    ninja start                        Arrancar runtime + abrir dashboard');
  console.log('    ninja status                       Estado del sistema');
  console.log('    ninja workspaces [list|select]     Gestionar workspaces');
  console.log('');
  console.log('  MODOS OPERATIVOS (Kage Engine)');
  console.log('');
  console.log('    ninja build <prompt>               Build Mode: construir desde prompt');
  console.log('    ninja repair                       Repair Mode: corregir build roto');
  console.log('    ninja template                     Template Mode: usar template base');
  console.log('');
  console.log('  HISTORIAL');
  console.log('');
  console.log('    ninja history sessions [N]         Ver últimas N sesiones (default: 10)');
  console.log('    ninja history artifacts [N]        Ver últimos N artifacts');
  console.log('');
  console.log('  AYUDA');
  console.log('');
  console.log('    ninja help                         Mostrar esta ayuda');
  console.log('');
}

main();
