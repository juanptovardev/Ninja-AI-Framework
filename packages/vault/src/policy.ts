import type { ID } from '@ninja/contracts';
import type { MemoryLayer } from './schema.js';

export interface LayerPolicy {
  /** Capa de memoria a la que se aplica la política */
  layer: MemoryLayer;
  /** Número máximo de tokens permitidos para esta capa */
  maxTokens: number;
  /** Indica si se requiere permiso explícito para acceder */
  requiresPermission: boolean;
  /** Indica si la capa es accesible por defecto para todos los agentes */
  defaultAccessible: boolean;
}

export interface AgentPermission {
  /** ID del agente al que se le otorga el permiso */
  agentId: ID;
  /** Capas a las que se permite acceder */
  layers: MemoryLayer[];
  /** Timestamp de cuando se otorgó el permiso */
  grantedAt: string;
  /** ID del agente o sistema que otorgó el permiso (opcional) */
  grantedBy?: ID;
}

export interface PolicyConfig {
  /** Políticas por capa, con valores por defecto si no se especifican */
  layerPolicies?: Partial<Record<MemoryLayer, Partial<LayerPolicy>>>;
}

/**
 * Gestor de políticas de acceso al Vault
 * Controla permisos y límites de tokens por capa de memoria
 */
export class VaultPolicy {
  private layerPolicies: Map<MemoryLayer, LayerPolicy>;
  private agentPermissions: Map<string, AgentPermission>;

  constructor(config?: PolicyConfig) {
    this.layerPolicies = this.getDefaultPolicies();
    this.agentPermissions = new Map();

    // Aplicar configuraciones personalizadas si se proporcionan
    if (config?.layerPolicies) {
      for (const [layer, policy] of Object.entries(config.layerPolicies)) {
        const currentPolicy = this.layerPolicies.get(layer as MemoryLayer);
        if (currentPolicy && policy) {
          Object.assign(currentPolicy, policy);
        }
      }
    }
  }

  /**
   * Obtiene el número máximo de tokens permitidos para una capa específica
   * @param layer Capa de memoria
   * @returns Número máximo de tokens permitidos
   */
  getMaxTokensForLayer(layer: MemoryLayer): number {
    return this.layerPolicies.get(layer)?.maxTokens ?? 0;
  }

  /**
   * Verifica si un agente puede acceder a una capa específica
   * @param agentId ID del agente
   * @param layer Capa de memoria
   * @returns true si el agente puede acceder, false en caso contrario
   */
  canAccessLayer(agentId: ID, layer: MemoryLayer): boolean {
    const layerPolicy = this.layerPolicies.get(layer);

    // Si la capa no existe o no está definida, denegar acceso
    if (!layerPolicy) {
      return false;
    }

    // Si la capa es accesible por defecto, permitir acceso
    if (layerPolicy.defaultAccessible) {
      return true;
    }

    // Verificar si el agente tiene permiso explícito
    const agentPermission = this.agentPermissions.get(agentId);
    if (agentPermission) {
      return agentPermission.layers.includes(layer);
    }

    // Si requiere permiso y no lo tiene, denegar acceso
    return !layerPolicy.requiresPermission;
  }

  /**
   * Otorga acceso explícito a un agente para una capa específica
   * @param agentId ID del agente
   * @param layer Capa de memoria
   * @param grantedBy ID del agente o sistema que otorga el permiso (opcional)
   */
  grantAccess(agentId: ID, layer: MemoryLayer, grantedBy?: ID): void {
    const key = agentId;
    const existingPermission = this.agentPermissions.get(key);

    if (existingPermission) {
      // Si ya existe permiso, agregar la capa si no está presente
      if (!existingPermission.layers.includes(layer)) {
        existingPermission.layers.push(layer);
      }
    } else {
      // Crear nuevo permiso para el agente
      const newPermission: AgentPermission = {
        agentId,
        layers: [layer],
        grantedAt: new Date().toISOString(),
        grantedBy,
      };
      this.agentPermissions.set(key, newPermission);
    }
  }

  /**
   * Revoca el acceso a una capa específica para un agente
   * @param agentId ID del agente
   * @param layer Capa de memoria
   */
  revokeAccess(agentId: ID, layer: MemoryLayer): void {
    const key = agentId;
    const existingPermission = this.agentPermissions.get(key);

    if (existingPermission) {
      existingPermission.layers = existingPermission.layers.filter((l) => l !== layer);

      // Si no quedan capas permitidas, eliminar el permiso
      if (existingPermission.layers.length === 0) {
        this.agentPermissions.delete(key);
      }
    }
  }

  /**
   * Obtiene las políticas por defecto para cada capa de memoria
   * @returns Mapa de políticas por capa
   */
  getDefaultPolicies(): Map<MemoryLayer, LayerPolicy> {
    const policies = new Map<MemoryLayer, LayerPolicy>();

    // HOT: accesible por todos, max ~4000 tokens
    policies.set('HOT', {
      layer: 'HOT',
      maxTokens: 4000,
      requiresPermission: false,
      defaultAccessible: true,
    });

    // WARM: accesible por todos, max ~8000 tokens
    policies.set('WARM', {
      layer: 'WARM',
      maxTokens: 8000,
      requiresPermission: false,
      defaultAccessible: true,
    });

    // COLD: requiere permiso explícito, max ~16000 tokens
    policies.set('COLD', {
      layer: 'COLD',
      maxTokens: 16000,
      requiresPermission: true,
      defaultAccessible: false,
    });

    // ANCHORS: accesible por todos (solo lectura), max ~2000 tokens
    policies.set('ANCHORS', {
      layer: 'ANCHORS',
      maxTokens: 2000,
      requiresPermission: false,
      defaultAccessible: true,
    });

    return policies;
  }
}
