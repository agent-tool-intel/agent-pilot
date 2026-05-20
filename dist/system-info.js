import { getDb, DB_PATH } from './db.js';
import { toMCPResponse } from './types.js';
import { statSync, existsSync } from 'fs';
export async function handleSystemInfo(_args) {
    const db = getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%\\_fts%' ESCAPE '\\' ORDER BY name").all();
    const tableRowCounts = {};
    for (const table of tables) {
        try {
            const row = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get();
            tableRowCounts[table.name] = Number(row?.count ?? 0);
        }
        catch (err) {
            console.error(`Failed to count rows for table ${table.name}:`, err);
            tableRowCounts[table.name] = -1;
        }
    }
    const totalTasks = tableRowCounts.tasks ?? -1;
    const totalTools = tableRowCounts.tools ?? -1;
    const totalSnapshots = tableRowCounts.snapshots ?? -1;
    const auditLogCount = tableRowCounts.audit_log ?? -1;
    let databaseFileSizeBytes = 0;
    try {
        databaseFileSizeBytes = statSync(DB_PATH).size;
    }
    catch (err) {
        console.error('Failed to stat database file:', err);
        databaseFileSizeBytes = -1;
    }
    const journalModeRow = db.pragma('journal_mode');
    const journalMode = journalModeRow[0]?.journal_mode ?? 'unknown';
    const walExists = existsSync(DB_PATH + '-wal');
    const shmExists = existsSync(DB_PATH + '-shm');
    let walCheckpointPages = null;
    try {
        const checkpointRows = db.pragma('wal_checkpoint(PASSIVE)');
        if (checkpointRows && checkpointRows.length > 0) {
            const row = checkpointRows[0];
            walCheckpointPages = Number(row.checkpointed ?? row.log ?? row.busy ?? 0);
        }
    }
    catch (err) {
        console.error('WAL checkpoint query failed:', err);
        walCheckpointPages = null;
    }
    return toMCPResponse({
        server: {
            name: 'task-orchestrator',
            version: '0.2.0',
        },
        total_tasks: totalTasks,
        total_tools: totalTools,
        total_snapshots: totalSnapshots,
        total_audit_log_entries: auditLogCount,
        database_file_size_bytes: databaseFileSizeBytes,
        database_file_path: DB_PATH,
        journal_mode: journalMode,
        wal_exists: walExists,
        shm_exists: shmExists,
        wal_checkpoint_pages: walCheckpointPages,
        table_row_counts: tableRowCounts,
    });
}
