import { ArsenalRegistry } from './registry';
import { SkillDefinition, ToolDefinition } from './schema';
import { fsReadTool, fsWriteTool, fsListTool } from './native/fs-tools';
import { shellExecTool } from './native/shell-tools';
import { httpGetTool, httpPostTool } from './native/http-tools';
import { loadContentPack } from './content-pack-loader';

/**
 * Carga las herramientas nativas del framework
 */
export function loadNativeTools(registry: ArsenalRegistry): void {
  // Herramientas de filesystem
  registry.registerTool(fsReadTool);
  registry.registerTool(fsWriteTool);
  registry.registerTool(fsListTool);

  // Herramientas de shell
  registry.registerTool(shellExecTool);

  // Herramientas HTTP
  registry.registerTool(httpGetTool);
  registry.registerTool(httpPostTool);

  console.log(`Cargadas ${registry.listTools().length} herramientas nativas`);
}

/**
 * Carga las skills base del sistema
 */
export function loadNativeSkills(registry: ArsenalRegistry): void {
  // Skills base que combinan herramientas existentes
  const fileManagementSkill: SkillDefinition = {
    id: 'file-management',
    name: 'Gestión de Archivos',
    description: 'Skills para manipulación de archivos y directorios',
    tools: ['fs.read', 'fs.write', 'fs.list'],
    agentRole: 'developer',
    metadata: {
      priority: 'high',
      category: 'core',
    },
  };

  const shellExecutionSkill: SkillDefinition = {
    id: 'shell-execution',
    name: 'Ejecución de Comandos',
    description: 'Skills para ejecución de comandos del sistema',
    tools: ['shell.exec'],
    agentRole: 'system-admin',
    metadata: {
      priority: 'medium',
      category: 'system',
    },
  };

  const httpManagementSkill: SkillDefinition = {
    id: 'http-management',
    name: 'Gestión HTTP',
    description: 'Skills para operaciones HTTP',
    tools: ['http.get', 'http.post'],
    agentRole: 'developer',
    metadata: {
      priority: 'high',
      category: 'core',
    },
  };

  registry.registerSkill(fileManagementSkill);
  registry.registerSkill(shellExecutionSkill);
  registry.registerSkill(httpManagementSkill);

  console.log(`Cargadas ${registry.listSkills().length} skills nativas`);
}

/**
 * Bootstrap inicial del registry
 */
export function bootstrap(options?: { contentRoot?: string }): ArsenalRegistry {
  const registry = ArsenalRegistry.getInstance();

  loadNativeTools(registry);
  loadNativeSkills(registry);

  loadContentPack(registry, { contentRoot: options?.contentRoot });

  return registry;
}
