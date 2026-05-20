import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { TaskDuplicateInput, TaskDuplicateOutput, toMCPResponse, } from './types.js';
export async function handleTaskDuplicate(args) {
    const input = TaskDuplicateInput.parse(args);
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
    const idMap = new Map();
    const flatTasks = [];
    const now = new Date().toISOString();
    for (const task of allTasks) {
        const newId = uuidv4();
        idMap.set(task.id, newId);
        const originalDependsOn = (() => {
            try {
                return JSON.parse(task.depends_on || '[]');
            }
            catch {
                return [];
            }
        })();
        flatTasks.push({
            old_id: task.id,
            new_id: newId,
            old_parent_id: task.parent_id,
            new_parent_id: null,
            title: task.title,
            description: task.description,
            goal: task.goal,
            tool_name: task.tool_name,
            priority: task.priority,
            max_retries: task.max_retries,
            depends_on: [],
            original_depends_on_ids: originalDependsOn,
            depth: 0,
        });
    }
    const depthCache = new Map();
    function computeDepth(taskId) {
        const cached = depthCache.get(taskId);
        if (cached !== undefined)
            return cached;
        const task = allTasks.find(t => t.id === taskId);
        if (!task || !task.parent_id) {
            depthCache.set(taskId, 0);
            return 0;
        }
        const d = 1 + computeDepth(task.parent_id);
        depthCache.set(taskId, d);
        return d;
    }
    for (const task of flatTasks) {
        task.depth = computeDepth(task.old_id);
        task.new_parent_id = task.old_parent_id ? (idMap.get(task.old_parent_id) ?? null) : null;
        task.depends_on = task.original_depends_on_ids
            .map(oldDepId => idMap.get(oldDepId))
            .filter((id) => !!id && id !== task.new_id);
    }
    flatTasks.sort((a, b) => a.depth - b.depth);
    const insertAll = db.transaction((tasks) => {
        const stmt = db.prepare('INSERT INTO tasks (id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const t of tasks) {
            stmt.run(t.new_id, t.new_parent_id, t.title, t.description, t.goal, 'pending', t.tool_name, null, null, null, t.priority, 0, t.max_retries, JSON.stringify(t.depends_on), now, now);
        }
    });
    insertAll(flatTasks);
    return toMCPResponse(TaskDuplicateOutput.parse({
        original_id: input.task_id,
        new_root_id: flatTasks[0].new_id,
        duplicated_count: flatTasks.length,
    }));
}
