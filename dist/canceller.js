import { z } from 'zod';
import { getDb } from './db.js';
import { toMCPResponse } from './types.js';
const TaskCancelInput = z.object({
    task_id: z.string().describe('Task ID to cancel'),
    cascade: z.boolean().optional().default(true).describe('Also cancel all descendant tasks'),
    reason: z.string().optional().describe('Why the task was cancelled'),
});
const CANCELLABLE_STATUSES = ['pending', 'in_progress', 'failed', 'blocked'];
export async function handleTaskCancel(args) {
    const input = TaskCancelInput.parse(args);
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.task_id);
    if (!task) {
        return toMCPResponse({ error: 'Task not found: ' + input.task_id });
    }
    if (!CANCELLABLE_STATUSES.includes(task.status)) {
        return toMCPResponse({
            error: 'Cannot cancel task with status ' + task.status + '. Allowed: ' + CANCELLABLE_STATUSES.join(', '),
        });
    }
    const now = new Date().toISOString();
    let cascadeCount = 0;
    if (input.cascade) {
        // Recursively cancel all descendants
        const descendants = db.prepare(`
      WITH RECURSIVE subtree(id) AS (
        SELECT ? UNION ALL SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
      )
      SELECT id FROM subtree WHERE id != ?
    `).all(input.task_id, input.task_id);
        for (const { id } of descendants) {
            const child = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
            if (CANCELLABLE_STATUSES.includes(child.status)) {
                db.prepare(`
          UPDATE tasks SET status = 'cancelled', error = ?, updated_at = ? WHERE id = ?
        `).run(input.reason || 'Parent task cancelled', now, id);
                cascadeCount++;
            }
        }
    }
    // Cancel the target task itself
    db.prepare(`
    UPDATE tasks SET status = 'cancelled', error = ?, updated_at = ? WHERE id = ?
  `).run(input.reason || null, now, input.task_id);
    return toMCPResponse({
        cancelled: { id: task.id, title: task.title, previous_status: task.status },
        cascaded_count: cascadeCount,
        reason: input.reason || null,
    });
}
