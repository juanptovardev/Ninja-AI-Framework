import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import { lightragClient } from './lightrag-client.js';
import type { LightRAGDocument } from './schema.js';

export interface IndexBatchResult {
  indexed: number;
  failed: number;
  errors: Array<{ docId: string; error: string }>;
}

export interface DocumentIndexedPayload {
  docId: string;
  chunkCount: number;
}

export interface IndexFailedPayload {
  docId: string;
  error: string;
}

export class LightRAGIndexer {
  private logger: ReturnType<typeof createLogger>;

  constructor() {
    this.logger = createLogger('LightRAG-Indexer');
  }

  /**
   * Indexa un contenido simple con metadata.
   * Genera un ID único automáticamente.
   */
  async indexContent(content: string, metadata: Record<string, unknown>): Promise<void> {
    const docId = this.generateId();

    const doc: LightRAGDocument = {
      id: docId,
      content,
      metadata,
    };

    await this.indexDocument(doc);
  }

  /**
   * Indexa un batch de documentos.
   * Retorna conteo de exitosos y fallidos.
   */
  async indexBatch(docs: LightRAGDocument[]): Promise<IndexBatchResult> {
    const result: IndexBatchResult = {
      indexed: 0,
      failed: 0,
      errors: [],
    };

    // Procesar en paralelo pero capturar errores individuales
    const promises = docs.map(async (doc) => {
      try {
        await this.indexDocument(doc);
        result.indexed++;
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          docId: doc.id,
          error: errorMessage,
        });
      }
    });

    await Promise.allSettled(promises);

    return result;
  }

  /**
   * Indexa un documento individual.
   * Emite eventos de éxito o fallo.
   */
  private async indexDocument(doc: LightRAGDocument): Promise<void> {
    try {
      await lightragClient.index(doc);

      // Estimar chunk count (aproximación simple)
      const estimatedChunks = Math.ceil(doc.content.length / 500);

      const payload: DocumentIndexedPayload = {
        docId: doc.id,
        chunkCount: estimatedChunks,
      };

      eventBus.emit(createEvent('lightrag.document.indexed', 'integrations-lightrag', payload));

      this.logger.debug('Document indexed', { docId: doc.id, chunks: estimatedChunks });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const payload: IndexFailedPayload = {
        docId: doc.id,
        error: errorMessage,
      };

      eventBus.emit(createEvent('lightrag.index.failed', 'integrations-lightrag', payload));

      this.logger.warn('Failed to index document', {
        docId: doc.id,
        error: errorMessage,
      });

      // Relanzar para que el caller maneje el error
      throw error;
    }
  }

  /**
   * Genera un ID único simple.
   */
  private generateId(): string {
    return `doc-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

// Instancia singleton
export const lightragIndexer = new LightRAGIndexer();
