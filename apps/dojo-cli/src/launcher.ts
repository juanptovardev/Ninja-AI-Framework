import { select, text, isCancel, intro, outro } from '@clack/prompts';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { printBanner, printInfo, printSuccess, printError, printDivider } from './display.js';
import { checkRuntimeHealth, getRuntimeStatus, submitEngineRequest } from './runtime-client.js';
import type { EngineMode } from '@ninja/contracts';
import { CONSOLE_URL } from './constants.js';
import { selectOrCreateWorkspace, listAllWorkspaces } from './workspace-manager.js';
import { openInBrowser } from './utils/browser.js';
import { renderSpinner, updateSpinner, renderError, renderSuccess } from './tui/render.js';
import { CommandPipeline } from './pipeline/command-pipeline.js';
import { createCommandContext } from './commands/base-command.js';
import { allCommands } from './commands/command-handlers.js';
import { ninjaColors } from '@ninja/ui-kit';

export type LauncherAction = 'cli' | 'start' | 'status' | 'workspaces' | 'run' | 'open' | 'exit';

const MAIN_MENU_CHOICES = [
  {
    label: '🥷  Entrar a Ninja CLI (Interactivo Nativo)',
    value: 'cli',
  },
  {
    label: '🚀  Iniciar Ninja (Runtime + Dashboard)',
    value: 'start',
  },
  {
    label: '📊  Ver estado del sistema',
    value: 'status',
  },
  {
    label: '📁  Gestionar workspaces',
    value: 'workspaces',
  },
  {
    label: '🤖  Iniciar Operación (Agentic Run)',
    value: 'run',
  },
  {
    label: '🌐  Abrir dashboard en navegador',
    value: 'open',
  },
  {
    label: '🚪  Salir',
    value: 'exit',
  },
];

function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  while (true) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'ninja-ai-framework') {
          return dir;
        }
      } catch (e) {
        // ignore
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return startDir; // fallback
}

async function startRuntimeInBackground(): Promise<boolean> {
  const spinnerId = renderSpinner('Arrancando Kage Runtime en segundo plano...');

  const rootDir = findWorkspaceRoot();
  
  // Determine OS and executable command
  const isWin = process.platform === 'win32';
  const command = isWin ? 'pnpm.cmd' : 'pnpm';

  try {
    const child = spawn(command, ['--filter', '@ninja/kage-runtime', 'dev'], {
      detached: true,
      stdio: 'ignore',
      shell: isWin,
      cwd: rootDir,
    });

    child.unref();
  } catch (error) {
    updateSpinner(spinnerId, 'error', `Error al spawnear el proceso de pnpm: ${(error as Error).message}`);
    return false;
  }

  // Poll healthcheck
  for (let i = 0; i < 30; i++) {
    updateSpinner(spinnerId, 'active', `Esperando a que el Runtime esté listo (${i + 1}/30s)...`);
    const isReady = await checkRuntimeHealth();
    if (isReady) {
      updateSpinner(spinnerId, 'success', 'Runtime iniciado con éxito.');
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  updateSpinner(spinnerId, 'error', 'El Runtime tardó demasiado en iniciar.');
  return false;
}

async function showStatus(): Promise<void> {
  const spinnerId = renderSpinner('Verificando estado del runtime...');
  const healthy = await checkRuntimeHealth();
  if (healthy) {
    updateSpinner(spinnerId, 'success', 'Runtime activo en http://127.0.0.1:3141');

    const status = await getRuntimeStatus();
    if (status) {
      console.log(`   Versión: ${status.version}`);
      console.log(`   Uptime: ${Math.floor(status.uptime)} segundos`);
    }
  } else {
    updateSpinner(spinnerId, 'error', 'Runtime no disponible. Usa "Iniciar Ninja" para arrancarlo.');
  }
}

async function openDashboard(): Promise<void> {
  printInfo(`Abriendo dashboard en ${CONSOLE_URL}`);
  try {
    await openInBrowser(CONSOLE_URL);
  } catch (error) {
    renderError('No se pudo abrir el dashboard automáticamente.');
    printInfo('Por favor, abre manualmente: ' + CONSOLE_URL);
    printInfo('Asegúrate de que el Forge Console esté corriendo en el puerto 3000');
  }
}

async function handleAgenticRun(): Promise<void> {
  const healthy = await checkRuntimeHealth();
  if (!healthy) {
    renderError('El runtime no está activo. Inícialo primero.');
    return;
  }

  const mode = await select({
    message: 'Selecciona el modo de operación:',
    options: [
      { label: 'Build (Crear algo nuevo)', value: 'build' },
      { label: 'Repair (Arreglar un error)', value: 'repair' },
      { label: 'Template (Usar plantilla)', value: 'template' },
      { label: 'Workspace (Gestionar espacio)', value: 'workspace' },
    ],
  });

  if (isCancel(mode)) return;

  const prompt = await text({
    message: '¿Qué orden deseas dar a Ninja?:',
    placeholder: 'ej. Crea un nuevo componente de login',
    validate: (input) => input.trim().length === 0 ? 'La orden es requerida' : undefined,
  });

  if (isCancel(prompt)) return;

  const spinnerId = renderSpinner('Enviando solicitud al Kage Engine...');
  
  // Por ahora usamos un workspace genérico o el actual si estuviera trackeado
  const run = await submitEngineRequest({
    prompt,
    mode: mode as EngineMode,
    workspaceId: 'default-workspace',
  });

  if (run) {
    updateSpinner(spinnerId, 'success', '¡Solicitud aceptada por el motor!');
    console.log(`   ID de Ejecución: ${run.id}`);
    console.log(`   Estado: ${run.status}`);
    printInfo('Ninja ha comenzado a planificar según tu instrucción.');
  } else {
    updateSpinner(spinnerId, 'error', 'No se pudo procesar la solicitud. Revisa los logs del runtime.');
  }
}

async function handleWorkspaces(): Promise<void> {
  const action = await select({
    message: '¿Qué quieres hacer con los workspaces?',
    options: [
      { label: 'Información sobre workspaces', value: 'list' },
      { label: 'Crear/abrir workspace', value: 'select' },
    ],
  });

  if (isCancel(action)) return;

  if (action === 'list') {
    await listAllWorkspaces();
  } else {
    await selectOrCreateWorkspace();
  }
}

export async function startNativeCLI(): Promise<void> {
  const pipeline = new CommandPipeline();
  
  // Register all commands
  for (const cmd of allCommands) {
    pipeline.registerCommand(cmd);
  }

  // Create context
  const ctx = createCommandContext({
    model: 'gemini-3.5-flash',
  });

  intro(chalk.bgHex(ninjaColors.background.primary).white(' NINJA INTERACTIVE CLI '));
  console.log(chalk.gray('Escribe un comando comenzando con / (ej. /help, /exit) para interactuar con el sistema.\n'));

  let inCliLoop = true;

  while (inCliLoop) {
    const input = await text({
      message: 'ninja-ai',
      placeholder: 'Escribe /help para ayuda o /exit para salir...',
      validate: (value) => {
        if (value === undefined) return undefined;
        return undefined; // Permit empty or any text, let pipeline handle it
      }
    });

    if (isCancel(input)) {
      break;
    }

    const commandStr = input.trim();
    if (!commandStr) continue;

    // Check if it starts with /
    if (!commandStr.startsWith('/')) {
      console.log(chalk.yellow('⚠️  Todos los comandos deben comenzar con "/" (ej. /help).'));
      continue;
    }

    // Execute through pipeline
    try {
      await pipeline.execute(commandStr, ctx);
    } catch (err) {
      // Errors are already formatted and rendered by the pipeline
    }

    const commandName = commandStr.split(' ')[0].slice(1).toLowerCase();
    if (commandName === 'exit' || commandName === 'quit' || ctx.sessionMetadata.exitRequested === true) {
      inCliLoop = false;
    }
  }

  outro(chalk.hex(ninjaColors.accent.secondary)('Saliendo de Ninja CLI. ¡Hasta pronto! 🥷'));
}

export async function runLauncher(): Promise<void> {
  printBanner();

  let running = true;

  while (running) {
    const action = await select({
      message: '¿Qué quieres hacer?',
      options: MAIN_MENU_CHOICES,
    });

    if (isCancel(action) || action === 'exit') {
      renderSuccess('Hasta pronto. 🥷');
      console.log('');
      running = false;
      break;
    }

    console.log('');

    switch (action) {
      case 'cli':
        await startNativeCLI();
        printDivider();
        break;

      case 'start':
        printInfo('Iniciando Ninja AI Framework...');
        const isHealthy = await checkRuntimeHealth();

        if (isHealthy) {
          renderSuccess('Runtime ya está activo');
          printInfo('Abriendo dashboard...');
          await openDashboard();
        } else {
          const started = await startRuntimeInBackground();
          if (started) {
            printInfo('Abriendo dashboard...');
            await openDashboard();
          } else {
            renderError('No se pudo iniciar el runtime automáticamente.');
            printInfo('El runtime se puede iniciar por separado con: pnpm runtime:dev');
          }
        }
        printDivider();
        break;

      case 'status':
        await showStatus();
        printDivider();
        break;

      case 'workspaces':
        await handleWorkspaces();
        printDivider();
        break;

      case 'run':
        await handleAgenticRun();
        printDivider();
        break;

      case 'open':
        await openDashboard();
        printDivider();
        break;
    }
  }
}
