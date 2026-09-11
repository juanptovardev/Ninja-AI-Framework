import { createEvent } from '@ninja/events';
import type { EventBusLike } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import type { ID } from '@ninja/contracts';
import { VaultError, ErrorCodes } from '@ninja/contracts';
import type {
  MemoryLayer,
  VaultQuery,
  VaultResult,
  VaultEntry,
  VaultQueryExecutedPayload,
  VaultWritePayload,
  IHotMemoryProvider,
  ContextBudgetExceededPayload,
} from './schema.js';
import type { LightRAGDocument, LightRAGQuery } from '@ninja/integrations-lightrag';
import type { MemoryEntry } from '@ninja/integrations-engram';
import type { Artifact } from '@ninja/trace-ledger';
import { RelevanceScorer } from './scoring/relevance-scorer.js';
import { VaultBudgetManager } from './scoring/budget-manager.js';

/**
 * Vistas estructurales de los adaptadores externos que usa el VaultCoordinator.
 * Permiten inyectar mocks/tests sin acoplarse a las clases concretas.
 */
type EngramClientLike = Pick<
  import('@ninja/integrations-engram').EngramClient,
  'store' | 'retrieve'
>;
type LightRAGClientLike = Pick<
  import('@ninja/integrations-lightrag').LightRAGClient,
  'index' | 'query'
>;
type ArtifactRepositoryLike = Pick<
  import('@ninja/trace-ledger').ArtifactRepository,
  'create' | 'findByType'
>;

const log = createLogger('vault');

export class VaultCoordinator {
  private engramClient: EngramClientLike;
  private lightragClient: LightRAGClientLike;
  private traceLedgerArtifactRepo: ArtifactRepositoryLike;
  private hotMemoryProvider: IHotMemoryProvider;
  private eventBus: EventBusLike;
  private relevanceScorer: RelevanceScorer;
  private budgetManager: VaultBudgetManager;

  constructor(deps: {
    engram: EngramClientLike;
    lightrag: LightRAGClientLike;
    traceLedger: { artifactRepository: ArtifactRepositoryLike };
    hotMemoryProvider: IHotMemoryProvider;
    eventBus: EventBusLike;
    relevanceScorer?: RelevanceScorer;
    budgetManager?: VaultBudgetManager;
  }) {
    this.engramClient = deps.engram;
    this.lightragClient = deps.lightrag;
    this.traceLedgerArtifactRepo = deps.traceLedger.artifactRepository;
    this.hotMemoryProvider = deps.hotMemoryProvider;
    this.eventBus = deps.eventBus;
    this.relevanceScorer = deps.relevanceScorer ?? new RelevanceScorer();
    this.budgetManager = deps.budgetManager ?? new VaultBudgetManager();

    log.info('VaultCoordinator initialized');
  }

  /**
   * Consulta las capas especificadas en paralelo
   * @param req Consulta de Vault con capas, presupuesto y filtros
   * @returns Resultados por capa rankeados y mezclados respetando tokenBudget
   */
  async query(req: VaultQuery): Promise<VaultResult[]> {
    const startTime = Date.now();
    const { agentId, sessionId, query, layers, tokenBudget } = req;

    if (!layers || layers.length === 0) {
      throw new VaultError(
        ErrorCodes.VAULT_LAYERS_EMPTY,
        'VaultQuery.layers must contain at least one layer'
      );
    }

    log.info('Vault query initiated', { agentId, sessionId, layers, tokenBudget });

    // Ejecutar consultas en paralelo para las capas solicitadas
    const layerPromises = layers.map((layer) =>
      this.queryLayer(layer, { agentId, sessionId, query })
    );
    const layerResults = await Promise.allSettled(layerPromises);

    // Procesar resultados, continuar aunque algunas capas fallen
    const results: VaultResult[] = [];
    let totalTokens = 0;

    layerResults.forEach((result, index) => {
      const layer = layers[index];
      if (result.status === 'fulfilled') {
        try {
          const vaultResult = result.value;
          results.push(vaultResult);
          totalTokens += vaultResult.totalTokens;
        } catch (error) {
          log.error(`Error processing result for layer ${layer}`, { error });
        }
      } else {
        log.error(`Layer ${layer} query failed`, { error: result.reason });
      }
    });

    // Rankeamos y mezclamos resultados respetando tokenBudget usando BudgetManager
    const allEntries: VaultEntry[] = results.flatMap((result) => result.entries);
    const trimResult = this.budgetManager.trimWithDetails(allEntries, tokenBudget);

    // Emitir evento si se excedió el presupuesto
    if (trimResult.trimmed > 0) {
      const actualTokens =
        trimResult.totalTokens + this.estimateTokensFromTrimmed(trimResult.trimmed);
      const payload: ContextBudgetExceededPayload = {
        agentId,
        sessionId,
        budget: tokenBudget,
        actualTokens,
        trimmedCount: trimResult.trimmed,
        remainingBudget: trimResult.remaining,
      };
      const evt = createEvent('context.budget.exceeded', 'vault', payload);
      this.eventBus.emit(evt);
    }

    const rankedEntries = trimResult.entries;

    // Agrupar por capa para mantener la estructura de resultado
    const groupedResults: VaultResult[] = [];
    const layerGroups = rankedEntries.reduce(
      (acc, entry) => {
        if (!acc[entry.layer]) {
          acc[entry.layer] = [];
        }
        acc[entry.layer].push(entry);
        return acc;
      },
      {} as Record<MemoryLayer, VaultEntry[]>
    );

    Object.entries(layerGroups).forEach(([layer, entries]) => {
      const layerTokens = this.budgetManager.estimateTotalTokens(entries);
      groupedResults.push({
        entries,
        layer: layer as MemoryLayer,
        totalTokens: layerTokens,
      });
    });

    const duration = Date.now() - startTime;

    // Emitir evento de ejecución
    const payload: VaultQueryExecutedPayload = {
      agentId,
      sessionId,
      layers,
      totalTokens: this.budgetManager.estimateTotalTokens(rankedEntries),
      duration,
    };

    const evt = createEvent('vault.query.executed', 'vault', payload);
    this.eventBus.emit(evt);

    log.info('Vault query completed', {
      agentId,
      sessionId,
      totalTokens: payload.totalTokens,
      duration,
      layersQueried: layers.length,
      layersSuccessful: results.length,
    });

    return groupedResults;
  }

  /**
   * Escribe contenido en la capa especificada
   * @param agentId ID del agente
   * @param sessionId ID de la sesión
   * @param content Contenido a escribir
   * @param layer Capa de memoria destino
   */
  async write(agentId: ID, sessionId: ID, content: string, layer: MemoryLayer): Promise<void> {
    log.info('Vault write initiated', { agentId, sessionId, layer, contentLength: content.length });

    try {
      switch (layer) {
        case 'HOT':
          // HOT se gestiona externamente vía Agent Runtime, no se escribe directamente aquí
          log.warn('Write to HOT layer delegated to Agent Runtime');
          break;

        case 'WARM': {
          const memoryEntry = {
            sessionId,
            agentId,
            content,
            compressed: false, // Se comprimirá posteriormente vía compressor
            tokenCount: this.estimateTokens(content),
            timestamp: new Date().toISOString(),
            tags: [],
          };

          const result = await this.engramClient.store(memoryEntry);
          if (!result.success) {
            throw result.error;
          }

          const writePayload: VaultWritePayload = {
            agentId,
            sessionId,
            layer: 'WARM',
            tokenCount: result.data.tokenCount,
          };

          const evt = createEvent('vault.write.executed', 'vault', writePayload);
          this.eventBus.emit(evt);
          break;
        }

        case 'COLD': {
          if (!this.lightragClient || !process.env.LIGHTRAG_API_URL) {
            log.warn(
              'LightRAG client not configured or LIGHTRAG_API_URL is missing, skipping COLD write'
            );
            break;
          }
          try {
            const document: LightRAGDocument = {
              id: crypto.randomUUID(),
              content,
              metadata: {
                agentId,
                sessionId,
                timestamp: new Date().toISOString(),
              },
            };

            await this.lightragClient.index(document);

            const writePayload: VaultWritePayload = {
              agentId,
              sessionId,
              layer: 'COLD',
              tokenCount: this.estimateTokens(content),
            };

            const evt = createEvent('vault.write.executed', 'vault', writePayload);
            this.eventBus.emit(evt);
          } catch (error) {
            log.warn('LightRAG index failed, skipping COLD write', { error });
          }
          break;
        }

        case 'ANCHORS': {
          // Crear un artifact con tipo 'anchor' para persistencia en Trace Ledger
          const artifactOptions = {
            runId: sessionId,
            name: `vault-anchor-${Date.now()}`,
            content,
            type: 'anchor' as const,
          };

          // Insertar directamente en el repositorio de artifacts
          const insertedArtifact = this.traceLedgerArtifactRepo.create(artifactOptions);

          const writePayload: VaultWritePayload = {
            agentId,
            sessionId,
            layer: 'ANCHORS',
            tokenCount: this.estimateTokens(content),
          };

          const evt = createEvent('vault.write.executed', 'vault', writePayload);
          this.eventBus.emit(evt);
          break;
        }
      }

      log.info('Vault write completed', { agentId, sessionId, layer });
    } catch (error) {
      log.error('Vault write failed', {
        agentId,
        sessionId,
        layer,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Consulta una capa específica de memoria
   */
  private async queryLayer(
    layer: MemoryLayer,
    baseQuery: { agentId: ID; sessionId: ID; query: string }
  ): Promise<VaultResult> {
    const startTime = Date.now();

    switch (layer) {
      case 'HOT': {
        const entries = await this.hotMemoryProvider.getEntries(
          baseQuery.agentId,
          baseQuery.sessionId
        );

        // Simular relevancia basada en recencia para HOT
        const vaultEntries = entries.map((entry, index) => ({
          ...entry,
          relevance: 1.0 - index * 0.1, // Relevancia decreciente por orden
        }));

        const totalTokens = this.budgetManager.estimateTotalTokens(vaultEntries);

        return {
          entries: vaultEntries,
          layer: 'HOT',
          totalTokens,
        };
      }

      case 'WARM': {
        const memoryQuery = {
          sessionId: baseQuery.sessionId,
          agentId: baseQuery.agentId,
          limit: 50,
        };

        const result = await this.engramClient.retrieve(memoryQuery);
        if (!result.success) {
          throw result.error;
        }

        const vaultEntries = result.data.map((entry) => ({
          content: entry.content,
          layer: 'WARM' as const,
          relevance: this.relevanceScorer.score(
            {
              content: entry.content,
              layer: 'WARM',
              relevance: 0,
              timestamp: entry.timestamp,
            },
            baseQuery.query
          ),
          timestamp: entry.timestamp,
        }));

        const totalTokens = this.budgetManager.estimateTotalTokens(vaultEntries);

        return {
          entries: vaultEntries,
          layer: 'WARM',
          totalTokens,
        };
      }

      case 'COLD': {
        if (!this.lightragClient || !process.env.LIGHTRAG_API_URL) {
          log.warn(
            'LightRAG client not configured or LIGHTRAG_API_URL is missing, skipping COLD layer'
          );
          return {
            entries: [],
            layer: 'COLD',
            totalTokens: 0,
          };
        }

        try {
          const lightragQuery: LightRAGQuery = {
            text: baseQuery.query,
            limit: 20,
          };

          const results = await this.lightragClient.query(lightragQuery);

          const vaultEntries = results.map((result) => ({
            content: result.chunk,
            layer: 'COLD' as const,
            relevance: result.score, // Ya viene normalizado de LightRAG
            timestamp: new Date().toISOString(), // LightRAG no devuelve timestamp, usamos actual
          }));

          const totalTokens = this.budgetManager.estimateTotalTokens(vaultEntries);

          return {
            entries: vaultEntries,
            layer: 'COLD',
            totalTokens,
          };
        } catch (error) {
          log.warn('LightRAG query failed, falling back to empty COLD entries', { error });
          return {
            entries: [],
            layer: 'COLD',
            totalTokens: 0,
          };
        }
      }

      case 'ANCHORS': {
        // Consultar artifacts con tipo 'anchor'
        const artifacts = this.traceLedgerArtifactRepo.findByType('anchor');

        const vaultEntries = artifacts.map((artifact) => ({
          content: artifact.content,
          layer: 'ANCHORS' as const,
          relevance: 1.0, // Los anchors tienen máxima relevancia por definición
          timestamp: artifact.createdAt,
        }));

        const totalTokens = this.budgetManager.estimateTotalTokens(vaultEntries);

        return {
          entries: vaultEntries,
          layer: 'ANCHORS',
          totalTokens,
        };
      }

      default:
        throw new VaultError(
          ErrorCodes.VAULT_UNSUPPORTED_LAYER,
          `Unsupported memory layer: ${layer}`
        );
    }
  }

  /**
   * Estimación simple de tokens (4 caracteres ≈ 1 token)
   * En el futuro esto podría delegarse a Model Gateway o usar un estimator más sofisticado
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estima tokens para entries eliminados en trim (usando promedio)
   */
  private estimateTokensFromTrimmed(trimmedCount: number): number {
    // Estimación conservadora: 100 tokens promedio por entry eliminado
    return trimmedCount * 100;
  }
}
