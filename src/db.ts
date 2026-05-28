import Database from 'better-sqlite3';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.resolve(__dirname, '../data/orchestrator.db');

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

    CREATE TABLE IF NOT EXISTS snapshots (
      id          TEXT PRIMARY KEY,
      task_id     TEXT NOT NULL REFERENCES tasks(id),
      label       TEXT,
      tree_json   TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_task ON snapshots(task_id);

    CREATE TABLE IF NOT EXISTS tools (
      name        TEXT PRIMARY KEY,
      canonical_id TEXT,

      description TEXT NOT NULL,
      schema      TEXT NOT NULL,
      provider    TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id         TEXT PRIMARY KEY,
      task_id    TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by TEXT NOT NULL DEFAULT 'system',
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_task ON audit_log(task_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(changed_at);

    CREATE TABLE IF NOT EXISTS archived_tasks (
      id            TEXT PRIMARY KEY,
      parent_id     TEXT,
      title         TEXT NOT NULL,
      description   TEXT,
      goal          TEXT,
      status        TEXT NOT NULL,
      tool_name     TEXT,
      result        TEXT,
      error         TEXT,
      review_comment TEXT,
      priority      INTEGER NOT NULL DEFAULT 3,
      retry_count   INTEGER NOT NULL DEFAULT 0,
      max_retries   INTEGER NOT NULL DEFAULT 3,
      depends_on    TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_archived_tasks_parent ON archived_tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_archived_tasks_status ON archived_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_archived_tasks_archived ON archived_tasks(archived_at);

    CREATE TABLE IF NOT EXISTS model_config (
      plan      TEXT NOT NULL DEFAULT 'B',
      category  TEXT NOT NULL,
      primary_model   TEXT NOT NULL,
      fallback_model  TEXT NOT NULL,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (plan, category)
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS trg_tasks_status_audit
      AFTER UPDATE OF status ON tasks
      FOR EACH ROW
    BEGIN
      INSERT INTO audit_log (id, task_id, old_status, new_status)
      VALUES (
        lower(hex(randomblob(4))) || '-' ||
        lower(hex(randomblob(2))) || '-4' ||
        lower(hex(randomblob(2))) || '-' ||
        lower(hex(randomblob(2))) || '-' ||
        lower(hex(randomblob(6))),
        OLD.id, OLD.status, NEW.status
      );
    END;
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

  const existing = db!.prepare('SELECT COUNT(*) AS cnt FROM model_config').get() as { cnt: number } | undefined;
  if (!existing || existing.cnt === 0) {
    const planConfig = JSON.parse(
      readFileSync(path.resolve(__dirname, 'config', 'plan-b.json'), 'utf-8')
    );
    const insert = db!.prepare(
      'INSERT OR IGNORE INTO model_config (plan, category, primary_model, fallback_model, updated_at) VALUES (?, ?, ?, ?, ?)'
    );
    const now = new Date().toISOString();
    for (const [cat, cfg] of Object.entries(planConfig.task_models)) {
      insert.run('B', cat, (cfg as any).primary, (cfg as any).fallback, now);
    }
    db!.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run('active_plan', 'B');
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
