import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import { lightragClient } from './lightrag-client.js';
import type { LightRAGResult } from './schema.js';

export interface QueryExecutedPayload {
  query: string;
  resultCount: number;
  latencyMs: number;
}

export class LightRAGRetriever {
  private logger: ReturnType<typeof createLogger>;

  constructor() {
    this.logger = createLogger('LightRAG-Retriever');
  }

  /**
   * Recupera documentos relevantes para una query.
   * Si LightRAG no está disponible → retorna [] con log de advertencia.
   */
  async retrieve(query: string, limit?: number): Promise<LightRAGResult[]> {
    const startTime = performance.now();

    // Verificar disponibilidad
    if (!lightragClient.isAvailable) {
      this.logger.warn('LightRAG not available, returning empty results', {
        query,
      });
      return [];
    }

    try {
      const results = await lightragClient.query({
        text: query,
        limit,
      });

      const latencyMs = Math.round(performance.now() - startTime);

      // Emitir evento de query ejecutada
      const payload: QueryExecutedPayload = {
        query,
        resultCount: results.length,
        latencyMs,
      };

      eventBus.emit(createEvent('lightrag.query.executed', 'integrations-lightrag', payload));

      this.logger.debug('Query executed', {
        query,
        results: results.length,
        latencyMs,
      });

      return results;
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startTime);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.warn('Query failed', {
        query,
        error: errorMessage,
        latencyMs,
      });

      // Retornar vacío sin lanzar excepción
      return [];
    }
  }
}

// Instancia singleton
export const lightragRetriever = new LightRAGRetriever();
