import Database from 'better-sqlite3';
import { ID, Timestamp } from '@ninja/contracts';

/**
 * Interface representing an entry in the agent log.
 */
export interface AgentLogEntry {
  /** Unique identifier for the agent */
  agentId: string;
  /** Role of the agent in the system */
  role: string;
  /** Summary of the agent's activity or result */
  summary: string;
  /** ID of the run this log entry is associated with */
  runId: ID;
  /** Timestamp when the log entry was created */
  timestamp: Timestamp;
}

/**
 * Logs an agent result to the database.
 * @param db The database instance to log to
 * @param entry The agent log entry to persist
 */
export function logAgentResult(db: Database.Database, entry: AgentLogEntry): void {
  const stmt = db.prepare(`
    INSERT INTO agent_log (agentId, role, summary, runId, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(entry.agentId, entry.role, entry.summary, entry.runId, entry.timestamp);
}

/**
 * Retrieves all agent logs for a specific run.
 * @param db The database instance to query
 * @param runId The ID of the run to get logs for
 * @returns Array of agent log entries for the given run
 */
export function getAgentLogs(db: Database.Database, runId: string): AgentLogEntry[] {
  const stmt = db.prepare(`
    SELECT agentId, role, summary, runId, timestamp
    FROM agent_log
    WHERE runId = ?
    ORDER BY timestamp ASC
  `);

  const rows = stmt.all(runId) as Array<{
    agentId: string;
    role: string;
    summary: string;
    runId: string;
    timestamp: Timestamp;
  }>;

  return rows.map((row) => ({
    agentId: row.agentId,
    role: row.role,
    summary: row.summary,
    runId: row.runId,
    timestamp: row.timestamp,
  }));
}
