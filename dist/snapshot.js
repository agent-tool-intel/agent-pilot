import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { TaskSnapshotInput, toMCPResponse } from './types.js';
function buildSnapshotTree(tasks, parentId) {
    return tasks
        .filter(t => t.parent_id === parentId)
        .map(t => ({
        id: t.id,
        parent_id: t.parent_id,
        title: t.title,
        description: t.description,
        goal: t.goal,
        status: t.status,
        tool_name: t.tool_name,
        result: t.result,
        error: t.error,
        review_comment: t.review_comment,
        priority: t.priority,
        retry_count: t.retry_count,
        max_retries: t.max_retries,
        depends_on: JSON.parse(t.depends_on || '[]'),
        created_at: t.created_at,
        updated_at: t.updated_at,
        children: buildSnapshotTree(tasks, t.id),
    }));
}
export async function handleTaskSnapshot(args) {
    const input = TaskSnapshotInput.parse(args);
    const db = getDb();
    const root = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.task_id);
    if (!root) {
        return toMCPResponse({ error: 'Task not found: ' + input.task_id });
    }
    const allTasks = db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT ? UNION ALL SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
    )
    SELECT * FROM tasks WHERE id IN (SELECT id FROM subtree) ORDER BY created_at ASC
  `).all(input.task_id);
    const rootNode = {
        id: root.id,
        parent_id: root.parent_id,
        title: root.title,
        description: root.description,
        goal: root.goal,
        status: root.status,
        tool_name: root.tool_name,
        result: root.result,
        error: root.error,
        review_comment: root.review_comment,
        priority: root.priority,
        retry_count: root.retry_count,
        max_retries: root.max_retries,
        depends_on: JSON.parse(root.depends_on || '[]'),
        created_at: root.created_at,
        updated_at: root.updated_at,
        children: buildSnapshotTree(allTasks, input.task_id),
    };
    const treeJson = JSON.stringify(rootNode);
    const snapshotId = uuidv4();
    const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO snapshots (id, task_id, label, tree_json, created_at) VALUES (?, ?, ?, ?, ?)').run(snapshotId, input.task_id, input.label ?? null, treeJson, createdAt);
    return toMCPResponse({
        snapshot_id: snapshotId,
        task_count: allTasks.length,
        created_at: createdAt,
    });
}
