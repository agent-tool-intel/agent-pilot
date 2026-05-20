import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { TaskRollbackInput, toMCPResponse, type TaskRow, type AuditLogRow } from './types.js';

export async function handleTaskRollback(args: unknown) {
  const input = TaskRollbackInput.parse(args);
  const db = getDb();

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.task_id) as TaskRow | undefined;
  if (!task) {
    return toMCPResponse({ error: 'Task not found: ' + input.task_id });
  }

  if (task.status === 'completed' || task.status === 'cancelled') {
    return toMCPResponse({ error: `Cannot rollback: task is in terminal state '${task.status}'` });
  }

  const auditEntry = db.prepare(
    'SELECT * FROM audit_log WHERE task_id = ? ORDER BY changed_at DESC, rowid DESC LIMIT 1'
  ).get(input.task_id) as AuditLogRow | undefined;

  if (!auditEntry) {
    return toMCPResponse({ error: 'No audit entries found for this task' });
  }

  if (auditEntry.old_status === null) {
    return toMCPResponse({ error: 'Cannot rollback: no previous status recorded' });
  }

  if (auditEntry.old_status === task.status) {
    return toMCPResponse({
      task_id: task.id,
      rolled_back_from: task.status,
      rolled_back_to: task.status,
      message: 'Task is already at the previous status — no change made',
    });
  }

  const rolledBackFrom = task.status;
  const rolledBackTo = auditEntry.old_status;
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run(rolledBackTo, now, task.id);

    db.prepare(
      'INSERT INTO audit_log (id, task_id, old_status, new_status, changed_by, changed_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), task.id, rolledBackFrom, rolledBackTo, 'task_rollback_tool', now, JSON.stringify({ action: 'rollback' }));
  })();

  return toMCPResponse({
    task_id: task.id,
    rolled_back_from: rolledBackFrom,
    rolled_back_to: rolledBackTo,
  });
}
