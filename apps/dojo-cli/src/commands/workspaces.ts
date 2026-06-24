import { selectOrCreateWorkspace, listAllWorkspaces } from '../workspace-manager.js';
import { printInfo, printDivider } from '../display.js';

export async function workspacesCommand(action: 'list' | 'select' = 'list'): Promise<void> {
  printInfo('Gestión de Workspaces');
  printDivider();

  if (action === 'list') {
    await listAllWorkspaces();
  } else if (action === 'select') {
    await selectOrCreateWorkspace();
  }

  printDivider();
}
