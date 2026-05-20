import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';
import { TaskExportInput, toMCPResponse } from './types.js';
function buildTaskTree(tasks, parentId) {
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
        children: buildTaskTree(tasks, t.id),
    }));
}
function flattenTree(tasks, rootId) {
    const rows = [];
    function walk(parentId, depth) {
        for (const t of tasks.filter(t => t.parent_id === parentId)) {
            rows.push({
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
                depends_on: t.depends_on,
                created_at: t.created_at,
                updated_at: t.updated_at,
                depth,
            });
            walk(t.id, depth + 1);
        }
    }
    walk(rootId, 0);
    return rows;
}
function escapeCSV(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}
function toCSV(rows) {
    const headers = [
        'id', 'parent_id', 'title', 'description', 'goal', 'status',
        'tool_name', 'result', 'error', 'review_comment', 'priority',
        'retry_count', 'max_retries', 'depends_on', 'created_at', 'updated_at', 'depth',
    ];
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map(h => escapeCSV(row[h])).join(','));
    }
    return lines.join('\n');
}
export async function handleTaskExport(args) {
    const input = TaskExportInput.parse(args);
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
    const absPath = path.resolve(input.filepath);
    const dir = path.dirname(absPath);
    fs.mkdirSync(dir, { recursive: true });
    if (input.format === 'csv') {
        const rootRow = {
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
            depends_on: root.depends_on,
            created_at: root.created_at,
            updated_at: root.updated_at,
            depth: 0,
        };
        const rows = [rootRow, ...flattenTree(allTasks, input.task_id)];
        const csv = toCSV(rows);
        fs.writeFileSync(absPath, csv, 'utf-8');
    }
    else {
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
            children: buildTaskTree(allTasks, input.task_id),
        };
        fs.writeFileSync(absPath, JSON.stringify(rootNode, null, 2), 'utf-8');
    }
    return toMCPResponse({
        exported_to: absPath,
        task_count: allTasks.length,
    });
}
