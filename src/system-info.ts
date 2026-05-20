import { getDb, DB_PATH } from './db.js';
import { toMCPResponse } from './types.js';
import { statSync, existsSync } from 'fs';

export async function handleSystemInfo(_args: unknown) {
  const db = getDb();

  const totalTasks = (db.prepare(
    'SELECT COUNT(*) as count FROM tasks'
  ).get() as { count: number }).count;

  const totalTools = (db.prepare(
    'SELECT COUNT(*) as count FROM tools'
  ).get() as { count: number }).count;

  const totalSnapshots = (db.prepare(
    'SELECT COUNT(*) as count FROM snapshots'
  ).get() as { count: number }).count;

  let databaseFileSizeBytes = 0;
  try {
    databaseFileSizeBytes = statSync(DB_PATH).size;
  } catch {
    databaseFileSizeBytes = -1;
  }

  const journalModeRow = db.pragma('journal_mode') as { journal_mode: string }[];
  const journalMode = journalModeRow[0]?.journal_mode ?? 'unknown';

  const walExists = existsSync(DB_PATH + '-wal');
  const shmExists = existsSync(DB_PATH + '-shm');

  let walCheckpointPages: number | null = null;
  try {
    const checkpointRows = db.pragma('wal_checkpoint(PASSIVE)') as unknown as Record<string, unknown>[];
    if (checkpointRows && checkpointRows.length > 0) {
      const row = checkpointRows[0];
      walCheckpointPages = Number(row['checkpointed'] ?? row['log'] ?? row['busy'] ?? 0);
    }
  } catch {
    walCheckpointPages = null;
  }

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { name: string }[];

  const tableRowCounts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const countRow = db.prepare(
        `SELECT COUNT(*) as count FROM "${table.name}"`
      ).get() as { count: number };
      tableRowCounts[table.name] = Number(countRow.count);
    } catch {
      tableRowCounts[table.name] = -1;
    }
  }

  const auditLogCount = (db.prepare(
    'SELECT COUNT(*) as count FROM audit_log'
  ).get() as { count: number }).count;

  return toMCPResponse({
    server: {
      name: 'task-orchestrator',
      version: '0.2.0',
    },
    total_tasks: Number(totalTasks),
    total_tools: Number(totalTools),
    total_snapshots: Number(totalSnapshots),
    total_audit_log_entries: Number(auditLogCount),
    database_file_size_bytes: databaseFileSizeBytes,
    database_file_path: DB_PATH,
    journal_mode: journalMode,
    wal_exists: walExists,
    shm_exists: shmExists,
    wal_checkpoint_pages: walCheckpointPages,
    table_row_counts: tableRowCounts,
  });
}
