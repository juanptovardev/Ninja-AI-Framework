import inquirer from 'inquirer';
import { homedir } from 'os';
import { join } from 'path';
import { printSuccess, printError, printInfo, printDivider } from './display.js';

export async function selectOrCreateWorkspace(): Promise<any | null> {
  const { action } = await inquirer.prompt<{
    action: 'create' | 'open';
  }>([
    {
      type: 'list',
      name: 'action',
      message: '¿Qué deseas hacer?',
      choices: [
        { name: 'Crear nuevo workspace', value: 'create' },
        { name: 'Abrir workspace existente', value: 'open' },
      ],
    },
  ]);

  if (action === 'create') {
    return await createNewWorkspace();
  }

  return await openExistingWorkspace();
}

async function createNewWorkspace(): Promise<any | null> {
  const { name, path } = await inquirer.prompt<{
    name: string;
    path: string;
  }>([
    {
      type: 'input',
      name: 'name',
      message: 'Nombre del workspace:',
      validate: (input) => input.trim().length > 0 || 'El nombre es requerido',
    },
    {
      type: 'input',
      name: 'path',
      message: 'Ruta del workspace (dejar vacío para usar la predeterminada):',
      default: (answers: { name: string }) => join(homedir(), '.ninja', 'workspaces', answers.name),
    },
  ]);

  try {
    // In a real implementation, this would call the workbench API
    printSuccess(`Workspace "${name}" creado exitosamente en ${path}.`);
    printDivider();
    return { name: name.trim(), path: path.trim() };
  } catch (error) {
    printError(`Error al crear workspace: ${(error as Error).message}`);
    return null;
  }
}

async function openExistingWorkspace(): Promise<any | null> {
  const { path } = await inquirer.prompt<{
    path: string;
  }>([
    {
      type: 'input',
      name: 'path',
      message: 'Ruta del workspace:',
      validate: (input) => input.trim().length > 0 || 'La ruta es requerida',
    },
  ]);

  try {
    // In a real implementation, this would call the workbench API
    printSuccess(`Workspace en "${path}" abierto.`);
    printDivider();
    return { path: path.trim() };
  } catch (error) {
    printError(`Error al abrir workspace: ${(error as Error).message}`);
    return null;
  }
}

export async function listAllWorkspaces(): Promise<void> {
  printInfo('Gestión de workspaces:');
  console.log('');
  printInfo('Para crear o abrir workspaces, usa las opciones interactivas.');
  printInfo('Los workspaces se registran automáticamente cuando se crean/abren.');
}
