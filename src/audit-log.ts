import { getDb } from './db.js';
import { TaskAuditLogInput, toMCPResponse, type AuditLogRow } from './types.js';

export async function handleTaskAuditLog(args: unknown) {
  const input = TaskAuditLogInput.parse(args);
  const db = getDb();

  let entries: AuditLogRow[];
  if (input.task_id) {
    entries = db.prepare(
      'SELECT * FROM audit_log WHERE task_id = ? ORDER BY changed_at DESC LIMIT ?'
    ).all(input.task_id, input.limit) as AuditLogRow[];
  } else {
    entries = db.prepare(
      'SELECT * FROM audit_log ORDER BY changed_at DESC LIMIT ?'
    ).all(input.limit) as AuditLogRow[];
  }

  return toMCPResponse({ entries });
}
