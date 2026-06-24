import type { ID } from '@ninja/contracts';

export interface CacheConfig {
  /** Máximo número de entradas en el caché */
  maxSize?: number;
  /** Tiempo de vida por defecto en milisegundos */
  defaultTtlMs?: number;
  /** Límite de memoria en bytes (opcional) */
  maxMemoryBytes?: number;
  /** Overrides de TTL por tipo de dato (ej. { 'ANCHORS': Infinity, 'HOT': 30000 }) */
  ttlOverrides?: Record<string, number>;
}

export interface CacheEntry<TEntry = unknown> {
  entries: TEntry[];
  timestamp: number;
  expiresAt: number;
  hitCount: number;
  layer?: string;
}

export interface CacheStats {
  /** Número total de entradas en el caché */
  size: number;
  /** Número máximo de entradas permitidas */
  maxSize: number;
  /** Número de veces que se ha accido al caché */
  hits: number;
  /** Número de veces que se ha fallado al acceder al caché */
  misses: number;
  /** Número de veces que se ha eliminado una entrada por LRU */
  evictions: number;
}

/**
 * Implementación de caché LRU en memoria para el Vault
 * Optimiza el acceso a entradas frecuentes del Vault
 * 
 * - LRU O(1) usando Map nativo (mantiene orden de inserción)
 * - Genérico VaultCache<TEntry> para type safety
 * - TTL configurable por tipo de dato (layer)
 */
export class VaultCache<TEntry = unknown> {
  private cache: Map<string, CacheEntry<TEntry>> = new Map();
  private config: Required<CacheConfig>;
  private stats: CacheStats;
  private ttlOverrides: Map<string, number>;

  constructor(config?: Partial<CacheConfig>) {
    const defaultConfig: Required<CacheConfig> = {
      maxSize: 100,
      defaultTtlMs: 60000, // 60 segundos por defecto
      maxMemoryBytes: 50 * 1024 * 1024, // 50MB por defecto
      ttlOverrides: { 'ANCHORS': Infinity },
    };

    this.config = { ...defaultConfig, ...config };
    
    // Inicializar TTL overrides con defaults + config
    this.ttlOverrides = new Map<string, number>([
      ['ANCHORS', Infinity],
      ...Object.entries(this.config.ttlOverrides || {}),
    ]);

    this.stats = {
      size: 0,
      maxSize: this.config.maxSize,
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Genera una clave única para una consulta de caché
   * @param agentId ID del agente
   * @param sessionId ID de la sesión
   * @param query Texto de consulta
   * @param layers Capas solicitadas
   * @returns Clave única para el caché
   */
  generateKey(agentId: ID, sessionId: ID, query: string, layers: string[]): string {
    return `${agentId}:${sessionId}:${query}:${layers.sort().join(',')}`;
  }

  /**
   * Obtiene entradas del caché
   * @param key Clave de búsqueda
   * @returns Entradas del caché o null si no se encuentran
   */
  get(key: string): TEntry[] | null {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Verificar si la entrada ha expirado
    if (entry.expiresAt < now) {
      this.cache.delete(key);
      this.accessOrderUpdate(key); // remover del orden de acceso
      this.stats.misses++;
      return null;
    }

    // Actualizar LRU: mover al final (más reciente)
    this.accessOrderUpdate(key);
    
    this.stats.hits++;
    entry.hitCount++;
    // NO actualizar timestamp — debe reflejar creación, no acceso

    return entry.entries;
  }

  /**
   * Almacena entradas en el caché
   * @param key Clave única
   * @param entries Entradas a almacenar
   * @param ttlMs Tiempo de vida en milisegundos (opcional)
   * @param layer Capa de dato para TTL override (opcional)
   */
  set(key: string, entries: TEntry[], ttlMs?: number, layer?: string): void {
    const now = Date.now();
    
    // Determinar TTL: explícito > override por layer > default
    let ttl: number;
    if (ttlMs !== undefined) {
      ttl = ttlMs;
    } else if (layer && this.ttlOverrides.has(layer)) {
      ttl = this.ttlOverrides.get(layer)!;
    } else {
      ttl = this.config.defaultTtlMs;
    }
    
    const expiresAt = ttl === Infinity ? Infinity : now + ttl;

    // Verificar límite de tamaño y aplicar política LRU si es necesario
    if (this.stats.size >= this.config.maxSize) {
      this.evictLRU();
    }

    // Almacenar nueva entrada
    this.cache.set(key, {
      entries,
      timestamp: now,
      expiresAt,
      hitCount: 0,
      layer,
    });

    this.accessOrderUpdate(key);
    this.stats.size = this.cache.size;
  }

  /**
   * Configura override de TTL para un tipo de dato específico
   * @param layer Nombre de la capa/tipo
   * @param ttlMs Tiempo de vida en milisegundos (Infinity para nunca expirar)
   */
  setTtlOverride(layer: string, ttlMs: number): void {
    this.ttlOverrides.set(layer, ttlMs);
  }

  /**
   * Obtiene el TTL para una capa específica
   * @param layer Nombre de la capa
   * @returns TTL en milisegundos o undefined si no hay override
   */
  getTtlForLayer(layer: string): number | undefined {
    return this.ttlOverrides.get(layer);
  }

  /**
   * Invalida todas las entradas de un agente específico
   * @param agentId ID del agente
   */
  invalidate(agentId: ID): void {
    const agentPattern = `${agentId}:`;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(agentPattern)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.accessOrderUpdate(key, true); // remover sin agregar
    }

    this.stats.size = this.cache.size;
  }

  /**
   * Invalida todas las entradas del caché
   */
  invalidateAll(): void {
    this.cache.clear();
    this.stats.size = 0;
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
  }

  /**
   * Obtiene estadísticas del caché
   * @returns Estadísticas actuales del caché
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Calcula el hit rate del caché
   * @returns Hit rate (hits / (hits + misses)) o 0 si no hay operaciones
   */
  hitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }

  /**
   * Obtiene el número de entradas en el caché
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Mueve una clave al final del orden de acceso (LRU)
   * O(1) gracias a Map nativo
   * @param key Clave a mover
   * @param removeOnly Si es true, solo remueve (para invalidar)
   */
  private accessOrderUpdate(key: string, removeOnly: boolean = false): void {
    if (!removeOnly && this.cache.has(key)) {
      // Mover al final: delete + set
      const entry = this.cache.get(key);
      if (entry) {
        this.cache.delete(key);
        this.cache.set(key, entry);
      }
    } else if (removeOnly) {
      // Solo remover si existe
      this.cache.delete(key);
    }
  }

  /**
   * Elimina la entrada menos recientemente usada (LRU)
   * O(1) gracias a Map nativo
   */
  private evictLRU(): void {
    const lruKey = this.cache.keys().next().value;
    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }
}
