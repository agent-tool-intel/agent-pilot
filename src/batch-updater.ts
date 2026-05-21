import { getDb } from './db.js';
import { TaskBatchUpdateInput, toMCPResponse, type TaskRow } from './types.js';
import { VALID_TRANSITIONS } from './state-machine.js';

export async function handleTaskBatchUpdate(args: unknown) {
  const input = TaskBatchUpdateInput.parse(args);
  const db = getDb();

  let succeeded = 0;
  const failures: Array<{ id: string; reason: string }> = [];
  let cascadedParentCount = 0;

  const updateStmt = db.prepare(`
    UPDATE tasks SET
      status = ?, result = ?, error = ?, review_comment = ?,
      tool_name = ?, retry_count = ?, updated_at = ?
    WHERE id = ?
  `);

  const now = new Date().toISOString();

  db.transaction(() => {
    for (const taskId of input.task_ids) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
      if (!task) {
        failures.push({ id: taskId, reason: 'Task not found' });
        continue;
      }

      const allowed = VALID_TRANSITIONS[task.status] || [];
      if (!allowed.includes(input.status)) {
        failures.push({
          id: taskId,
          reason: `Invalid transition: ${task.status} -> ${input.status}. Allowed: ${allowed.join(', ')}`,
        });
        continue;
      }

      let retryCount = task.retry_count;
      if (input.status === 'failed' || input.status === 'needs_revision') {
        retryCount += 1;
      }

      updateStmt.run(
        input.status, input.result ?? null, input.error ?? null,
        input.review_comment ?? null, input.tool_name ?? task.tool_name,
        retryCount, now, taskId
      );
      succeeded += 1;

      if ((input.status === 'completed' || input.status === 'approved') && task.parent_id) {
        let currentParentId: string | null = task.parent_id;
        while (currentParentId) {
          const parent = db.prepare('SELECT * FROM tasks WHERE id = ?').get(currentParentId) as TaskRow | undefined;
          if (!parent) break;

          const siblings = db.prepare(
            'SELECT id, status FROM tasks WHERE parent_id = ? AND id != ?'
          ).all(currentParentId, taskId) as Array<{ id: string; status: string }>;

          const allDone = siblings.every(s =>
            s.status === 'completed' || s.status === 'approved'
          );

          const parentTransitionValid = (VALID_TRANSITIONS[parent.status] || []).includes('completed');

          if (allDone && parentTransitionValid) {
            db.prepare("UPDATE tasks SET status = 'completed', updated_at = ? WHERE id = ?")
              .run(now, currentParentId);
            cascadedParentCount += 1;
            currentParentId = parent.parent_id;
          } else {
            break;
          }
        }
      }
    }
  })();

  return toMCPResponse({
    succeeded,
    failed: failures.length,
    failures,
    cascaded_parent_count: cascadedParentCount,
  });
}
