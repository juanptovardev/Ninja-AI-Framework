import { BaseRepository, type Database } from '@ninja/storage';

export interface AgentCommitRow {
  id: string;
  runId: string;
  agentRole: string;
  summary: string;
  filesChanged: string; // JSON array
  timestampMs: number;
}

export class AgentCommitRepository extends BaseRepository<AgentCommitRow> {
  constructor(db: Database.Database) {
    super(db, 'agent_commits');
  }

  create(record: AgentCommitRow): AgentCommitRow {
    this.db
      .prepare(
        `INSERT INTO ${this.tableName} (id, runId, agentRole, summary, filesChanged, timestampMs)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.runId,
        record.agentRole,
        record.summary,
        record.filesChanged,
        record.timestampMs
      );
    return record;
  }

  findByRunId(runId: string): AgentCommitRow[] {
    return this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE runId = ? ORDER BY timestampMs ASC`)
      .all(runId)
      .map((r) => this.mapRow(r));
  }

  findAll(limit = 100): AgentCommitRow[] {
    return this.db
      .prepare(`SELECT * FROM ${this.tableName} ORDER BY timestampMs DESC LIMIT ?`)
      .all(limit)
      .map((r) => this.mapRow(r));
  }

  mapRow(row: unknown): AgentCommitRow {
    const r = row as Record<string, unknown>;
    return {
      id: r['id'] as string,
      runId: r['runId'] as string,
      agentRole: r['agentRole'] as string,
      summary: r['summary'] as string,
      filesChanged: r['filesChanged'] as string,
      timestampMs: r['timestampMs'] as number,
    };
  }
}
