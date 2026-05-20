import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../data/orchestrator.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db!.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      parent_id   TEXT REFERENCES tasks(id),
      title       TEXT NOT NULL,
      description TEXT,
      goal        TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      tool_name   TEXT,
      result      TEXT,
      error       TEXT,
      review_comment TEXT,
      priority    INTEGER NOT NULL DEFAULT 3,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      depends_on  TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

    CREATE TABLE IF NOT EXISTS tools (
      name        TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      schema      TEXT NOT NULL,
      provider    TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Add review_comment column if upgrading from v0.1.0
  try {
    db!.exec(`ALTER TABLE tasks ADD COLUMN review_comment TEXT`);
  } catch {
    // Column already exists (v0.2.0+)
  }

  try {
    db!.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS tools_fts USING fts5(
        name, description, tags,
        content='tools',
        content_rowid='rowid'
      );
    `);
  } catch {
    console.error('FTS5 not available, falling back to LIKE search');
  }
}

export function getLatestRoot(database: Database.Database): string | null {
  const row = database.prepare(
    'SELECT id FROM tasks WHERE parent_id IS NULL ORDER BY created_at DESC LIMIT 1'
  ).get() as { id: string } | undefined;
  return row?.id ?? null;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
