import { z } from 'zod';
import { getDb } from './db.js';
import { toMCPResponse, type TaskRow, type ArchivedTaskRow, TaskStatus } from './types.js';

const TaskArchiveInput = z.object({
  task_id: z.string().describe('Task ID to archive'),
  cascade: z.boolean().optional().default(true).describe('Also archive all descendant tasks'),
});

const ARCHIVABLE_STATUSES = ['completed', 'approved'];

export async function handleTaskArchive(args: unknown) {
  const input = TaskArchiveInput.parse(args);
  const db = getDb();

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.task_id) as TaskRow | undefined;
  if (!task) {
    return toMCPResponse({ error: 'Task not found: ' + input.task_id });
  }

  if (!ARCHIVABLE_STATUSES.includes(task.status)) {
    return toMCPResponse({
      error: 'Cannot archive task with status ' + task.status + '. Allowed: ' + ARCHIVABLE_STATUSES.join(', '),
    });
  }

  if (!input.cascade) {
    const childCount = (db.prepare(
      'SELECT COUNT(*) AS cnt FROM tasks WHERE parent_id = ?'
    ).get(input.task_id) as { cnt: number }).cnt;
    if (childCount > 0) {
      return toMCPResponse({
        error: 'Cannot archive task with children without cascade=true. Move children first or use cascade=true.',
      });
    }
  }

  const result = db.transaction(() => {
    const allTasks = input.cascade
      ? db.prepare(`
          WITH RECURSIVE subtree(id) AS (
            SELECT ? UNION ALL SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
          )
          SELECT * FROM tasks WHERE id IN (SELECT id FROM subtree)
        `).all(input.task_id) as TaskRow[]
      : [task];

    const nonArchivable = allTasks.filter(t => !ARCHIVABLE_STATUSES.includes(t.status));
    if (nonArchivable.length > 0) {
      throw new Error(
        'Cannot archive tree: ' + nonArchivable.length + ' task(s) have non-archivable statuses: ' +
        nonArchivable.map(t => t.id + ' (' + t.status + ')').join(', '),
      );
    }

    const allTaskIds = allTasks.map(t => t.id);
    const taskMap = new Map(allTasks.map(t => [t.id, t]));

    const depthCache = new Map<string, number>();

    function computeDepth(id: string, parentId: string | null, visited = new Set<string>()): number {
      const cached = depthCache.get(id);
      if (cached !== undefined) return cached;
      if (visited.has(id) || !parentId) {
        depthCache.set(id, 0);
        return 0;
      }
      visited.add(id);
      const parent = taskMap.get(parentId);
      if (!parent) {
        depthCache.set(id, 0);
        return 0;
      }
      const d = 1 + computeDepth(parent.id, parent.parent_id, visited);
      depthCache.set(id, d);
      return d;
    }

    for (const t of allTasks) {
      computeDepth(t.id, t.parent_id);
    }

    const sortedTasks = [...allTasks].sort((a, b) => (depthCache.get(b.id) ?? 0) - (depthCache.get(a.id) ?? 0));

    const now = new Date().toISOString();

    const insertStmt = db.prepare(
      `INSERT INTO archived_tasks (id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at, archived_at)
       SELECT id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at, ? FROM tasks WHERE id = ?`
    );

    const deleteSnapshots = db.prepare('DELETE FROM snapshots WHERE task_id = ?');
    const deleteAuditLog = db.prepare('DELETE FROM audit_log WHERE task_id = ?');
    const deleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');

    for (const { id } of sortedTasks) {
      insertStmt.run(now, id);
      deleteSnapshots.run(id);
      deleteAuditLog.run(id);
      deleteTask.run(id);
    }

    const archivedSet = new Set(allTaskIds);
    const updateDepends = db.prepare('UPDATE tasks SET depends_on = ? WHERE id = ?');

    const BATCH_SIZE = 200;
    for (let i = 0; i < allTaskIds.length; i += BATCH_SIZE) {
      const batch = allTaskIds.slice(i, i + BATCH_SIZE);
      const likePatterns = batch.map(id => `%\"${id}\"%`);
      const likeClauses = likePatterns.map(() => 'depends_on LIKE ?').join(' OR ');
      const getTaskDepends = db.prepare(
        `SELECT id, depends_on FROM tasks WHERE depends_on != '[]' AND (${likeClauses})`
      );
      const remainingTasks = getTaskDepends.all(...likePatterns) as { id: string; depends_on: string }[];
      for (const rt of remainingTasks) {
        let deps: string[];
        try {
          deps = JSON.parse(rt.depends_on);
        } catch {
          throw new Error('Corrupted depends_on for task ' + rt.id + ': ' + rt.depends_on);
        }
        const cleaned = deps.filter(d => !archivedSet.has(d));
        if (cleaned.length !== deps.length) {
          updateDepends.run(JSON.stringify(cleaned), rt.id);
        }
      }
    }

    return {
      archived: task.id,
      title: task.title,
      subtrees_archived: allTasks.length,
      cascade: input.cascade,
      archived_at: now,
    };
  })();

  return toMCPResponse(result);
}

const TaskArchiveListInput = z.object({
  status: z.string().optional().describe('Filter by status'),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

export async function handleTaskArchiveList(args: unknown) {
  const input = TaskArchiveListInput.parse(args);
  const db = getDb();

  let whereClause = '';
  const params: unknown[] = [];

  if (input.status) {
    const parsed = TaskStatus.safeParse(input.status);
    if (!parsed.success) {
      return toMCPResponse({ error: 'Invalid status: ' + input.status + '. Valid: ' + TaskStatus.options.join(', ') });
    }
    whereClause = 'WHERE status = ?';
    params.push(input.status);
  }

  const tasks = db.prepare(
    `SELECT id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at, archived_at
     FROM archived_tasks ${whereClause}
     ORDER BY archived_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, input.limit, input.offset) as ArchivedTaskRow[];

  const totalRow = db.prepare(
    `SELECT COUNT(*) AS cnt FROM archived_tasks ${whereClause}`
  ).get(...params) as { cnt: number };

  return toMCPResponse({
    tasks,
    total: totalRow.cnt,
  });
}

const TaskArchiveRestoreInput = z.object({
  task_id: z.string().describe('Task ID to restore from archive'),
  cascade: z.boolean().optional().default(true).describe('Also restore all descendant tasks'),
});

export async function handleTaskArchiveRestore(args: unknown) {
  const input = TaskArchiveRestoreInput.parse(args);
  const db = getDb();

  const task = db.prepare('SELECT * FROM archived_tasks WHERE id = ?').get(input.task_id) as ArchivedTaskRow | undefined;
  if (!task) {
    return toMCPResponse({ error: 'Archived task not found: ' + input.task_id });
  }

  const result = db.transaction(() => {
    const subtreeRows = input.cascade
      ? db.prepare(`
          WITH RECURSIVE subtree(id) AS (
            SELECT ? UNION ALL SELECT t.id FROM archived_tasks t JOIN subtree s ON t.parent_id = s.id
          )
          SELECT * FROM archived_tasks WHERE id IN (SELECT id FROM subtree)
        `).all(input.task_id) as ArchivedTaskRow[]
      : [task];

    const subtreeIds = subtreeRows.map(r => r.id);

    const placeholders = subtreeIds.map(() => '?').join(',');
    const conflicts = (db.prepare(
      `SELECT id FROM tasks WHERE id IN (${placeholders})`
    ).all(...subtreeIds) as { id: string }[]).map(r => r.id);

    if (conflicts.length > 0) {
      throw new Error(
        'ID conflict: the following task IDs already exist in the active tasks table: ' + conflicts.join(', ') +
        '. Remove active tasks first or use task_duplicate on the conflicting tasks before retrying restore.',
      );
    }

    const depthCache = new Map<string, number>();
    const restoreTaskMap = new Map(subtreeRows.map(t => [t.id, t]));

    function computeRestoreDepth(id: string, parentId: string | null, visited = new Set<string>()): number {
      const cached = depthCache.get(id);
      if (cached !== undefined) return cached;
      if (visited.has(id) || !parentId) {
        depthCache.set(id, 0);
        return 0;
      }
      visited.add(id);
      const parent = restoreTaskMap.get(parentId);
      if (!parent) {
        depthCache.set(id, 0);
        return 0;
      }
      const d = 1 + computeRestoreDepth(parent.id, parent.parent_id, visited);
      depthCache.set(id, d);
      return d;
    }

    for (const t of subtreeRows) {
      computeRestoreDepth(t.id, t.parent_id);
    }

    const sortedRows = [...subtreeRows].sort((a, b) => (depthCache.get(a.id) ?? 0) - (depthCache.get(b.id) ?? 0));

    const subtreeSet = new Set(subtreeIds);

    const checkParentExists = db.prepare('SELECT COUNT(*) AS cnt FROM tasks WHERE id = ?');

    const insertStmt = db.prepare(
      `INSERT INTO tasks (id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const deleteArchived = db.prepare('DELETE FROM archived_tasks WHERE id = ?');
    const depExistsInTasks = db.prepare('SELECT COUNT(*) AS cnt FROM tasks WHERE id = ?');

    for (const row of sortedRows) {
      let resolvedParentId = row.parent_id;
      if (resolvedParentId && !subtreeSet.has(resolvedParentId)) {
        const parentInTasks = (checkParentExists.get(resolvedParentId) as { cnt: number }).cnt > 0;
        if (!parentInTasks) {
          resolvedParentId = null;
        }
      }

      let resolvedDependsOn = row.depends_on;
      if (row.depends_on !== '[]') {
        let deps: string[];
        try {
          deps = JSON.parse(row.depends_on);
        } catch {
          throw new Error('Corrupted depends_on for archived task ' + row.id + ': ' + row.depends_on);
        }
        const validDeps = deps.filter(d => {
          if (subtreeSet.has(d)) return true;
          return (depExistsInTasks.get(d) as { cnt: number }).cnt > 0;
        });
        if (validDeps.length !== deps.length) {
          resolvedDependsOn = JSON.stringify(validDeps);
        }
      }

      insertStmt.run(
        row.id, resolvedParentId, row.title, row.description, row.goal,
        row.status, row.tool_name, row.result, row.error, row.review_comment,
        row.priority, row.retry_count, row.max_retries, resolvedDependsOn,
        row.created_at, row.updated_at,
      );
      deleteArchived.run(row.id);
    }

    const restoredSet = new Set(subtreeIds);
    const updateArchivedDepends = db.prepare('UPDATE archived_tasks SET depends_on = ? WHERE id = ?');

    const BATCH_SIZE = 200;
    for (let i = 0; i < subtreeIds.length; i += BATCH_SIZE) {
      const batch = subtreeIds.slice(i, i + BATCH_SIZE);
      const likeRestorePatterns = batch.map(id => `%\"${id}\"%`);
      const likeRestoreClauses = likeRestorePatterns.map(() => 'depends_on LIKE ?').join(' OR ');
      const getArchivedDepends = db.prepare(
        `SELECT id, depends_on FROM archived_tasks WHERE depends_on != '[]' AND (${likeRestoreClauses})`
      );
      const remainingArchived = getArchivedDepends.all(...likeRestorePatterns) as { id: string; depends_on: string }[];
      for (const ra of remainingArchived) {
        let deps: string[];
        try {
          deps = JSON.parse(ra.depends_on);
        } catch {
          throw new Error('Corrupted depends_on for archived task ' + ra.id + ': ' + ra.depends_on);
        }
        const cleaned = deps.filter(d => !restoredSet.has(d));
        if (cleaned.length !== deps.length) {
          updateArchivedDepends.run(JSON.stringify(cleaned), ra.id);
        }
      }
    }

    return {
      restored: task.id,
      title: task.title,
      subtrees_restored: subtreeIds.length,
      cascade: input.cascade,
    };
  })();

  return toMCPResponse(result);
}
