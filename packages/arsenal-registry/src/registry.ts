import type { NinjaEvent, ID } from '@ninja/contracts';
import type { Logger } from '@ninja/logging';
import { createLogger } from '@ninja/logging';
import {
  ToolDefinition,
  SkillDefinition,
  ToolCategory,
  ToolPermission,
  ArsenalSnapshot,
} from './schema';

/**
 * Clase principal del registro de herramientas
 */
export class ArsenalRegistry {
  private static instance: ArsenalRegistry;
  private readonly logger: Logger;
  private readonly tools: Map<string, ToolDefinition<unknown, unknown>>;
  private readonly skills: Map<string, SkillDefinition>;
  private readonly eventBus: any; // Referencia al bus de eventos

  private constructor(eventBus?: any) {
    this.logger = createLogger('ArsenalRegistry');
    this.tools = new Map<string, ToolDefinition<unknown, unknown>>();
    this.skills = new Map();
    this.eventBus = eventBus;

    this.logger.info('Arsenal Registry iniciado');
  }

  /**
   * Singleton pattern para acceso global
   */
  static getInstance(eventBus?: any): ArsenalRegistry {
    if (!ArsenalRegistry.instance) {
      ArsenalRegistry.instance = new ArsenalRegistry(eventBus);
    }
    return ArsenalRegistry.instance;
  }

  /**
   * Registra una nueva herramienta en el registry
   */
  registerTool<TInput = unknown, TOutput = unknown>(
    definition: ToolDefinition<TInput, TOutput>
  ): void {
    if (this.tools.has(definition.id)) {
      throw new Error(`Tool con ID ${definition.id} ya existe`);
    }

    this.tools.set(definition.id, definition as ToolDefinition<unknown, unknown>);

    // Emitir evento de registro
    if (this.eventBus) {
      const event: NinjaEvent = {
        id: crypto.randomUUID() as ID,
        type: 'arsenal.tool.registered',
        source: 'arsenal-registry',
        timestamp: new Date().toISOString(),
        payload: { toolId: definition.id, category: definition.category },
      };
      // this.eventBus.emit(event); // Implementación pendiente
    }

    this.logger.debug(`Herramienta registrada: ${definition.id}`);
  }

  /**
   * Registra una nueva skill en el registry
   */
  registerSkill(definition: SkillDefinition): void {
    if (this.skills.has(definition.id)) {
      throw new Error(`Skill con ID ${definition.id} ya existe`);
    }

    this.skills.set(definition.id, definition);

    // Emitir evento de registro
    if (this.eventBus) {
      const event: NinjaEvent = {
        id: crypto.randomUUID() as ID,
        type: 'arsenal.skill.registered',
        source: 'arsenal-registry',
        timestamp: new Date().toISOString(),
        payload: { skillId: definition.id, role: definition.agentRole },
      };
      // this.eventBus.emit(event); // Implementación pendiente
    }

    this.logger.debug(`Skill registrada: ${definition.id}`);
  }

  /**
   * Obtiene una herramienta por ID
   */
  getTool<TInput = unknown, TOutput = unknown>(id: string): ToolDefinition<TInput, TOutput> | null {
    const tool = this.tools.get(id);
    return tool as ToolDefinition<TInput, TOutput> | null;
  }

  /**
   * Obtiene una skill por ID
   */
  getSkill(id: string): SkillDefinition | null {
    return this.skills.get(id) || null;
  }

  /**
   * Busca herramientas por nombre descriptivo
   */
  findByFriendlyName(query: string): ToolDefinition<unknown, unknown>[] {
    const normalizedQuery = query.toLowerCase();
    return Array.from(this.tools.values()).filter(
      (tool) =>
        tool.friendlyName.toLowerCase().includes(normalizedQuery) ||
        tool.name.toLowerCase().includes(normalizedQuery)
    );
  }

  /**
   * Busca herramientas por categoría
   */
  findByCategory(category: ToolCategory): ToolDefinition<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.category === category);
  }

  /**
   * Busca herramientas por nivel de permiso
   */
  findByPermission(permission: ToolPermission): ToolDefinition<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.permission === permission);
  }

  /**
   * Lista todas las herramientas disponibles
   */
  listTools(): ToolDefinition<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Lista todas las skills disponibles
   */
  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Obtiene un snapshot del estado actual del registry
   */
  getSnapshot(): ArsenalSnapshot {
    return {
      timestamp: new Date().toISOString(),
      tools: new Map(this.tools) as Map<string, ToolDefinition>,
      skills: new Map(this.skills),
    };
  }
}
