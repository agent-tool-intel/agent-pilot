import { z } from 'zod';
import { getDb } from './db.js';
import { toMCPResponse } from './types.js';
const TaskArchiveInput = z.object({
    task_id: z.string().describe('Task ID to archive'),
    cascade: z.boolean().optional().default(true).describe('Also archive all descendant tasks'),
});
const ARCHIVABLE_STATUSES = ['completed', 'approved'];
export async function handleTaskArchive(args) {
    const input = TaskArchiveInput.parse(args);
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.task_id);
    if (!task) {
        return toMCPResponse({ error: 'Task not found: ' + input.task_id });
    }
    if (!ARCHIVABLE_STATUSES.includes(task.status)) {
        return toMCPResponse({
            error: 'Cannot archive task with status ' + task.status + '. Allowed: ' + ARCHIVABLE_STATUSES.join(', '),
        });
    }
    if (!input.cascade) {
        const childCount = db.prepare('SELECT COUNT(*) AS cnt FROM tasks WHERE parent_id = ?').get(input.task_id).cnt;
        if (childCount > 0) {
            return toMCPResponse({
                error: 'Cannot archive task with children without cascade=true. Move children first or use cascade=true.',
            });
        }
    }
    const allTasks = input.cascade
        ? db.prepare(`
        WITH RECURSIVE subtree(id) AS (
          SELECT ? UNION ALL SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
        )
        SELECT * FROM tasks WHERE id IN (SELECT id FROM subtree)
      `).all(input.task_id)
        : [task];
    const depthCache = new Map();
    function computeDepth(id, parentId) {
        const cached = depthCache.get(id);
        if (cached !== undefined)
            return cached;
        if (!parentId) {
            depthCache.set(id, 0);
            return 0;
        }
        const parent = allTasks.find(t => t.id === parentId);
        if (!parent) {
            depthCache.set(id, 0);
            return 0;
        }
        const d = 1 + computeDepth(parent.id, parent.parent_id);
        depthCache.set(id, d);
        return d;
    }
    for (const t of allTasks) {
        computeDepth(t.id, t.parent_id);
    }
    const sortedTasks = [...allTasks].sort((a, b) => depthCache.get(b.id) - depthCache.get(a.id));
    const now = new Date().toISOString();
    const archiveAll = db.transaction(() => {
        const insertStmt = db.prepare(`INSERT INTO archived_tasks (id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at, archived_at)
       SELECT id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at, ? FROM tasks WHERE id = ?`);
        const deleteSnapshots = db.prepare('DELETE FROM snapshots WHERE task_id = ?');
        const deleteAuditLog = db.prepare('DELETE FROM audit_log WHERE task_id = ?');
        const deleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');
        for (const { id } of sortedTasks) {
            insertStmt.run(now, id);
            deleteSnapshots.run(id);
            deleteAuditLog.run(id);
            deleteTask.run(id);
        }
    });
    archiveAll();
    return toMCPResponse({
        archived: task.id,
        title: task.title,
        subtrees_archived: allTasks.length,
        cascade: input.cascade,
    });
}
const TaskArchiveListInput = z.object({
    status: z.string().optional().describe('Filter by status'),
    limit: z.number().int().min(1).max(100).optional().default(50),
    offset: z.number().int().min(0).optional().default(0),
});
export async function handleTaskArchiveList(args) {
    const input = TaskArchiveListInput.parse(args);
    const db = getDb();
    let whereClause = '';
    const params = [];
    if (input.status) {
        whereClause = 'WHERE status = ?';
        params.push(input.status);
    }
    const tasks = db.prepare(`SELECT id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at, archived_at
     FROM archived_tasks ${whereClause}
     ORDER BY archived_at DESC
     LIMIT ? OFFSET ?`).all(...params, input.limit, input.offset);
    const totalRow = db.prepare(`SELECT COUNT(*) AS cnt FROM archived_tasks ${whereClause}`).get(...params);
    return toMCPResponse({
        tasks,
        total: totalRow.cnt,
    });
}
const TaskArchiveRestoreInput = z.object({
    task_id: z.string().describe('Task ID to restore from archive'),
    cascade: z.boolean().optional().default(true).describe('Also restore all descendant tasks'),
});
export async function handleTaskArchiveRestore(args) {
    const input = TaskArchiveRestoreInput.parse(args);
    const db = getDb();
    const task = db.prepare('SELECT * FROM archived_tasks WHERE id = ?').get(input.task_id);
    if (!task) {
        return toMCPResponse({ error: 'Archived task not found: ' + input.task_id });
    }
    const subtreeIds = input.cascade
        ? db.prepare(`
        WITH RECURSIVE subtree(id) AS (
          SELECT ? UNION ALL SELECT t.id FROM archived_tasks t JOIN subtree s ON t.parent_id = s.id
        )
        SELECT id FROM subtree
      `).all(input.task_id).map(r => r.id)
        : [input.task_id];
    const conflicts = [];
    for (const id of subtreeIds) {
        const exists = db.prepare('SELECT COUNT(*) AS cnt FROM tasks WHERE id = ?').get(id);
        if (exists.cnt > 0) {
            conflicts.push(id);
        }
    }
    if (conflicts.length > 0) {
        return toMCPResponse({
            error: 'ID conflict: the following task IDs already exist in the active tasks table: ' + conflicts.join(', '),
        });
    }
    const subtreeSet = new Set(subtreeIds);
    const restoreAll = db.transaction(() => {
        const getTask = db.prepare('SELECT * FROM archived_tasks WHERE id = ?');
        const checkParentExists = db.prepare('SELECT COUNT(*) AS cnt FROM tasks WHERE id = ?');
        const insertStmt = db.prepare(`INSERT INTO tasks (id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const deleteArchived = db.prepare('DELETE FROM archived_tasks WHERE id = ?');
        for (const id of subtreeIds) {
            const row = getTask.get(id);
            if (!row)
                continue;
            let resolvedParentId = row.parent_id;
            if (resolvedParentId && !subtreeSet.has(resolvedParentId)) {
                const parentInTasks = checkParentExists.get(resolvedParentId).cnt > 0;
                if (!parentInTasks) {
                    resolvedParentId = null;
                }
            }
            insertStmt.run(row.id, resolvedParentId, row.title, row.description, row.goal, row.status, row.tool_name, row.result, row.error, row.review_comment, row.priority, row.retry_count, row.max_retries, row.depends_on, row.created_at, row.updated_at);
            deleteArchived.run(id);
        }
    });
    restoreAll();
    return toMCPResponse({
        restored: task.id,
        title: task.title,
        subtrees_restored: subtreeIds.length,
    });
}
