import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import { CircuitBreaker, CircuitOpenError } from '@ninja/common-utils';
import { NinjaError } from '@ninja/contracts';
import type { LightRAGDocument, LightRAGQuery, LightRAGResult } from './schema.js';

const DEFAULT_BASE_URL = 'http://localhost:9621';
const DEFAULT_TIMEOUT_MS = 10000; // 10s

const HTTP_STATUS_CODES: Record<number, string> = {
  400: 'LIGHTRAG_BAD_REQUEST',
  401: 'LIGHTRAG_AUTH',
  403: 'LIGHTRAG_AUTH',
  404: 'LIGHTRAG_NOT_FOUND',
  429: 'LIGHTRAG_RATE_LIMITED',
  500: 'LIGHTRAG_SERVER',
  502: 'LIGHTRAG_SERVER',
  503: 'LIGHTRAG_SERVER',
  504: 'LIGHTRAG_SERVER',
};

/**
 * Mapea errores de HTTP/transporte a NinjaError tipado (dominio `vault` = capa COLD).
 * - HTTP status → código LIGHTRAG_* según el status
 * - AbortError (timeout) → LIGHTRAG_TIMEOUT
 * - Error de red → LIGHTRAG_NETWORK_ERROR
 * Nunca lanza errores crudos: todo lo que sale del cliente es NinjaError.
 */
function toLightRAGError(operation: string, error: unknown, timeoutMs: number): NinjaError {
  if (error instanceof NinjaError) return error;

  if (error instanceof Error && error.name === 'AbortError') {
    return new NinjaError(
      'LIGHTRAG_TIMEOUT',
      `LightRAG ${operation} timed out after ${timeoutMs}ms`,
      'vault',
      {
        retryable: true,
        context: { operation, timeoutMs },
      }
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/HTTP (\d{3})/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
  const code = (status !== undefined && HTTP_STATUS_CODES[status]) || 'LIGHTRAG_NETWORK_ERROR';

  return new NinjaError(code, `LightRAG ${operation} failed: ${message}`, 'vault', {
    retryable: code === 'LIGHTRAG_RATE_LIMITED' || code === 'LIGHTRAG_SERVER',
    context: { operation, status },
  });
}

export class LightRAGClient {
  private _baseUrl: string;
  private _timeoutMs: number;
  private logger: ReturnType<typeof createLogger>;
  private _isAvailable: boolean;
  private _lastHealthCheck: number;
  private circuitBreaker: CircuitBreaker;

  constructor(baseUrl?: string, timeoutMs?: number) {
    this._baseUrl = baseUrl ?? DEFAULT_BASE_URL;
    this._timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.logger = createLogger('LightRAG');
    this._isAvailable = true;
    this._lastHealthCheck = 0;
    this.circuitBreaker = new CircuitBreaker('lightrag', {
      failureThreshold: 3,
      resetTimeoutMs: 30_000,
      successThreshold: 2,
      onStateChange: (from, to) => {
        eventBus.emit(
          createEvent('lightrag.circuit.state_changed', 'integrations-lightrag', {
            from,
            to,
          })
        );
      },
    });
  }

  /**
   * Indica si el servicio LightRAG está disponible.
   * Se actualiza después de cada health check o request fallido.
   */
  get isAvailable(): boolean {
    return this._isAvailable;
  }

  /**
   * Timestamp del último health check.
   */
  get lastHealthCheck(): number {
    return this._lastHealthCheck;
  }

  /**
   * Configura el timeout para requests.
   */
  setTimeout(ms: number): void {
    this._timeoutMs = ms;
  }

  /**
   * Indexa un documento en LightRAG.
   * POST /index
   */
  async index(doc: LightRAGDocument): Promise<void> {
    eventBus.emit(
      createEvent('lightrag.index.started', 'integrations-lightrag', {
        documentId: doc.id,
      })
    );

    if (!this._isAvailable) {
      this.logger.warn('LightRAG service unavailable, skipping index');
      return;
    }

    try {
      await this.circuitBreaker.execute(() => this.rawIndex(doc));
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        this._isAvailable = false;
        this.logger.warn('LightRAG circuit breaker OPEN, skipping index');
        return;
      }
      throw this._handleError('index', error);
    }
  }

  private async rawIndex(doc: LightRAGDocument): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeoutMs);

    const response = await globalThis.fetch(`${this._baseUrl}/index`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(doc),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    eventBus.emit(
      createEvent('lightrag.index.completed', 'integrations-lightrag', {
        documentId: doc.id,
      })
    );
  }

  /**
   * Realiza una búsqueda semántica en LightRAG.
   * POST /query
   * Si el servicio no está disponible, retorna array vacío sin lanzar excepción.
   */
  async query(q: LightRAGQuery): Promise<LightRAGResult[]> {
    if (!this._isAvailable) {
      this.logger.warn('LightRAG service unavailable, returning empty results');
      return [];
    }

    try {
      return await this.circuitBreaker.execute(() => this.rawQuery(q));
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        this._isAvailable = false;
        this.logger.warn('LightRAG circuit breaker OPEN, returning empty results');
        return [];
      }
      throw this._handleError('query', error);
    }
  }

  private async rawQuery(q: LightRAGQuery): Promise<LightRAGResult[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeoutMs);

    const response = await globalThis.fetch(`${this._baseUrl}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(q),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const results: LightRAGResult[] = await response.json();

    eventBus.emit(
      createEvent('lightrag.query.completed', 'integrations-lightrag', {
        query: q.text,
        resultCount: results.length,
      })
    );

    return results;
  }

  /**
   * Verifica la salud del servicio LightRAG.
   * GET /health
   * Actualiza la propiedad isAvailable.
   */
  async health(): Promise<boolean> {
    try {
      return await this.circuitBreaker.execute(() => this.rawHealth());
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        this._lastHealthCheck = Date.now();
        this._isAvailable = false;
        return false;
      }

      this._lastHealthCheck = Date.now();
      this._isAvailable = false;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('LightRAG service unavailable', { error: errorMessage });

      eventBus.emit(
        createEvent('lightrag.service.unavailable', 'integrations-lightrag', {
          error: errorMessage,
        })
      );

      return false;
    }
  }

  private async rawHealth(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await globalThis.fetch(`${this._baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    this._lastHealthCheck = Date.now();
    this._isAvailable = response.ok;

    if (!response.ok) {
      this.logger.warn('LightRAG health check failed', {
        status: response.status,
      });
    }

    return this._isAvailable;
  }

  /**
   * Maneja errores de requests.
   * Marca el servicio como no disponible, emite evento y devuelve
   * un NinjaError tipado listo para ser lanzado por el caller.
   */
  private _handleError(operation: string, error: unknown): NinjaError {
    this._isAvailable = false;

    const typed = toLightRAGError(operation, error, this._timeoutMs);
    const errorMessage = typed.message;

    this.logger.warn(`LightRAG ${operation} failed`, { error: errorMessage });

    eventBus.emit(
      createEvent('lightrag.service.unavailable', 'integrations-lightrag', {
        operation,
        error: errorMessage,
      })
    );

    return typed;
  }
}

// Instancia singleton para uso global
export const lightragClient = new LightRAGClient();
