/**
 * @ninja/integrations-engram — engram-client.ts
 * Cliente para la capa WARM de memoria (Engram).
 * Persiste conversaciones, decisiones y contexto de sesión con compresión diferencial.
 */

import { BaseRepository, initDb, closeDb } from '@ninja/storage';
import type Database from 'better-sqlite3';
import type { ID, Result } from '@ninja/contracts';
import { ok, err } from '@ninja/contracts';
import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import type {
  MemoryEntry,
  MemoryQuery,
  CompressionResult,
  MemoryStoredPayload,
  MemoryRetrievedPayload,
  MemoryDeletedPayload,
} from './schema.js';

const log = createLogger('engram');

// ---------------------------------------------------------------------------
// EngramRepository
// ---------------------------------------------------------------------------

class EngramRepository extends BaseRepository<MemoryEntry> {
  constructor(db: Database.Database) {
    super(db, 'memories');
    this.createTable();
  }

  private createTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        agentId TEXT,
        content TEXT NOT NULL,
        compressed INTEGER DEFAULT 0,
        tokenCount INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        tags TEXT,
        FOREIGN KEY (sessionId) REFERENCES sessions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(sessionId);
      CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
    `);
  }

  mapRow(row: unknown): MemoryEntry {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      sessionId: r.sessionId as string,
      agentId: r.agentId as string | undefined,
      content: r.content as string,
      compressed: (r.compressed as number) === 1,
      tokenCount: r.tokenCount as number,
      timestamp: r.timestamp as string,
      tags: r.tags ? JSON.parse(r.tags as string) : [],
    };
  }

  insert(entry: Omit<MemoryEntry, 'id'>): MemoryEntry {
    const id = crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO memories (id, sessionId, agentId, content, compressed, tokenCount, timestamp, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      entry.sessionId,
      entry.agentId ?? null,
      entry.content,
      entry.compressed ? 1 : 0,
      entry.tokenCount,
      entry.timestamp,
      JSON.stringify(entry.tags)
    );
    return { ...entry, id };
  }

  findBySession(query: MemoryQuery): MemoryEntry[] {
    let sql = 'SELECT * FROM memories WHERE sessionId = ?';
    const params: unknown[] = [query.sessionId];

    if (query.agentId) {
      sql += ' AND agentId = ?';
      params.push(query.agentId);
    }

    if (query.tags && query.tags.length > 0) {
      sql += ' AND (';
      const tagConditions = query.tags.map(() => 'tags LIKE ?').join(' OR ');
      sql += tagConditions + ')';
      query.tags.forEach((tag) => {
        params.push(`%${tag}%`);
      });
    }

    if (query.fromTimestamp) {
      sql += ' AND timestamp >= ?';
      params.push(query.fromTimestamp);
    }

    sql += ' ORDER BY timestamp DESC';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map((row) => this.mapRow(row));
  }

  deleteById(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

// ---------------------------------------------------------------------------
// EngramClient
// ---------------------------------------------------------------------------

export class EngramClient {
  private repository: EngramRepository;
  private db: Database.Database;
  private eventBus: typeof eventBus;

  constructor(dbPath: string, eventBusInstance?: typeof eventBus) {
    this.db = initDb(dbPath);
    this.repository = new EngramRepository(this.db);
    this.eventBus = eventBusInstance ?? eventBus;
    log.info('EngramClient initialized', { dbPath });
  }

  /**
   * Almacena una entrada de memoria.
   */
  async store(entry: Omit<MemoryEntry, 'id'>): Promise<Result<MemoryEntry, Error>> {
    try {
      const stored = this.repository.insert(entry);
      const payload: MemoryStoredPayload = {
        id: stored.id,
        sessionId: stored.sessionId,
        tokenCount: stored.tokenCount,
      };
      const evt = createEvent('engram.memory.stored', 'integrations-engram', payload);
      this.eventBus.emit(evt);
      log.info('Memory stored', { id: stored.id, sessionId: stored.sessionId });
      return ok(stored);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to store memory', { error: errMessage });
      return err(new Error(`Failed to store memory: ${errMessage}`));
    }
  }

  /**
   * Recupera entradas de memoria según el query.
   */
  async retrieve(query: MemoryQuery): Promise<Result<MemoryEntry[], Error>> {
    try {
      const memories = this.repository.findBySession(query);
      const payload: MemoryRetrievedPayload = {
        sessionId: query.sessionId,
        count: memories.length,
      };
      const evt = createEvent('engram.memory.retrieved', 'integrations-engram', payload);
      this.eventBus.emit(evt);
      log.info('Memory retrieved', { sessionId: query.sessionId, count: memories.length });
      return ok(memories);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to retrieve memory', { error: errMessage });
      return err(new Error(`Failed to retrieve memory: ${errMessage}`));
    }
  }

  /**
   * Elimina una entrada de memoria por ID.
   */
  async delete(id: ID): Promise<Result<void, Error>> {
    try {
      const memory = this.repository.findById(id);
      if (!memory) {
        return err(new Error(`Memory not found: ${id}`));
      }
      const deleted = this.repository.deleteById(id);
      if (!deleted) {
        return err(new Error(`Failed to delete memory: ${id}`));
      }
      const payload: MemoryDeletedPayload = {
        id,
        sessionId: memory.sessionId,
      };
      const evt = createEvent('engram.memory.deleted', 'integrations-engram', payload);
      this.eventBus.emit(evt);
      log.info('Memory deleted', { id, sessionId: memory.sessionId });
      return ok(undefined);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to delete memory', { error: errMessage });
      return err(new Error(`Failed to delete memory: ${errMessage}`));
    }
  }

  /**
   * Comprime contenido de texto.
   */
  compress(content: string): CompressionResult {
    const originalTokens = this.estimateTokens(content);
    const compressed = this.compressText(content);
    const compressedTokens = this.estimateTokens(compressed);
    const ratio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

    return {
      original: content,
      compressed,
      originalTokens,
      compressedTokens,
      ratio,
    };
  }

  /**
   * Descomprime contenido de texto.
   */
  decompress(compressed: string): string {
    return this.decompressText(compressed);
  }

  /**
   * Registra una observación en la base de datos de Engram.
   */
  async recordObservation(tag: string, content: string, sessionId: string = 'default-session'): Promise<void> {
    await this.store({
      sessionId,
      agentId: 'kage-runtime',
      content,
      compressed: false,
      tokenCount: Math.ceil(content.length / 4),
      timestamp: new Date().toISOString(),
      tags: [tag],
    });
  }

  /**
   * Cierra la conexión a la base de datos.
   */
  close(): void {
    closeDb(this.db);
    log.info('EngramClient closed');
  }

  // ---------------------------------------------------------------------------
  // Métodos Privados
  // ---------------------------------------------------------------------------

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private compressText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\s([.,!?;:])/g, '$1')
      .trim();
  }

  private decompressText(text: string): string {
    return text
      .replace(/([.,!?;:])([a-zA-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const engramClient = new EngramClient(resolveDbPath());

function resolveDbPath(): string {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '.';
  return `${homeDir}/.ninja/engram.db`;
}
