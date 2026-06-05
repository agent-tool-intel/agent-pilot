// agent-pilot db.ts — sql.js with better-sqlite3 compatibility wrapper
// Pure JavaScript SQLite — NO native binaries — works on any GLIBC
import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.resolve(__dirname, '../data/orchestrator.db');
// ── Compatibility wrapper: sql.js → better-sqlite3 API ──
class CompatStatement {
    stmt;
    sql;
    constructor(sqlLib, db, sql) {
        this.sql = sqlLib;
        this.stmt = db.prepare(sql);
    }
    run(...params) {
        if (params.length > 0)
            this.stmt.bind(params);
        this.stmt.step();
        const changes = this.sql.getModifiedRows();
        // sql.js doesn't track lastInsertRowid easily — return 0
        this.stmt.free();
        return { changes, lastInsertRowid: 0 };
    }
    get(...params) {
        if (params.length > 0)
            this.stmt.bind(params);
        if (this.stmt.step()) {
            const row = this.stmt.getAsObject();
            this.stmt.free();
            return row;
        }
        this.stmt.free();
        return undefined;
    }
    all(...params) {
        if (params.length > 0)
            this.stmt.bind(params);
        const rows = [];
        while (this.stmt.step()) {
            rows.push(this.stmt.getAsObject());
        }
        this.stmt.free();
        return rows;
    }
    free() {
        try {
            this.stmt.free();
        }
        catch { }
    }
}
class CompatDatabase {
    sqlLib;
    db;
    filePath;
    constructor(filePath, sqlLib) {
        this.sqlLib = sqlLib;
        this.filePath = filePath;
        if (filePath && fs.existsSync(filePath)) {
            const buffer = fs.readFileSync(filePath);
            this.db = new sqlLib.Database(buffer);
        }
        else {
            this.db = new sqlLib.Database();
        }
    }
    prepare(sql) {
        return new CompatStatement(this.sqlLib, this.db, sql);
    }
    exec(sql) {
        this.db.run(sql);
        this.save();
    }
    pragma(key, _value) {
        if (key === 'journal_mode')
            return;
        if (key === 'foreign_keys') {
            if (_value)
                this.db.run('PRAGMA foreign_keys = ' + _value);
            return;
        }
        // sql.js is in-memory, pragmas are mostly no-ops
    }
    transaction(fn) {
        const self = this;
        return (...args) => {
            const result = fn(...args);
            self.save();
            return result;
        };
    }
    close() {
        this.save();
        this.db.close();
    }
    export() {
        return this.db.export();
    }
    get name() { return this.filePath || ":memory:"; }
    save() {
        if (!this.filePath)
            return;
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        const data = this.db.export();
        fs.writeFileSync(this.filePath, Buffer.from(data));
    }
}
// ── Singleton ──
let db = null;
let sqlLib = null;
export async function initDb() {
    if (db)
        return db;
    sqlLib = await initSqlJs();
    db = new CompatDatabase(DB_PATH, sqlLib);
    db.pragma('foreign_keys', 'ON');
    initSchema();
    return db;
}
export function getDb() {
    if (!db)
        throw new Error('Database not initialized. Call initDb() first.');
    return db;
}
export function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}
// ── Schema ──
function initSchema() {
    if (!db)
        return;
    db.exec(`
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
  `);
    // Add review_comment column if upgrading
    try {
        db.exec('ALTER TABLE tasks ADD COLUMN review_comment TEXT');
    }
    catch { /* exists */ }
    // Seed model config
    const cnt = db.prepare('SELECT COUNT(*) AS cnt FROM model_config').get();
    if (!cnt || cnt.cnt === 0) {
        try {
            const planConfig = JSON.parse(readFileSync(path.resolve(__dirname, 'config', 'plan-b.json'), 'utf-8'));
            const now = new Date().toISOString();
            for (const [cat, cfg] of Object.entries(planConfig.task_models)) {
                db.prepare('INSERT OR IGNORE INTO model_config (plan, category, primary_model, fallback_model, updated_at) VALUES (?, ?, ?, ?, ?)').run('B', cat, cfg.primary, cfg.fallback, now);
            }
            db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)").run('active_plan', 'B');
        }
        catch { /* config file missing */ }
    }
}
export function getLatestRoot() {
    if (!db)
        return null;
    if (!db)
        return null;
    const row = db.prepare('SELECT id FROM tasks WHERE parent_id IS NULL ORDER BY created_at DESC LIMIT 1').get();
    return row?.id ?? null;
}
