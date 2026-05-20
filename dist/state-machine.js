import { getDb, getLatestRoot } from './db.js';
import { TaskNextInput, TaskUpdateInput, toMCPResponse } from './types.js';
// Expanded state transitions with dual-review
export const VALID_TRANSITIONS = {
    'pending': ['in_progress', 'cancelled'],
    'in_progress': ['pending_review', 'completed', 'failed', 'blocked', 'cancelled'],
    'pending_review': ['approved', 'needs_revision'],
    'approved': ['completed'],
    'needs_revision': ['pending'],
    'failed': ['pending', 'cancelled'],
    'blocked': ['pending', 'cancelled'],
    'completed': [],
    'cancelled': [],
};
export async function handleTaskNext(args) {
    const input = TaskNextInput.parse(args);
    const db = getDb();
    const rootId = input.task_id || getLatestRoot(db);
    if (!rootId) {
        return toMCPResponse({
            next_task: null,
            summary: { total: 0, pending: 0, in_progress: 0, pending_review: 0, completed: 0, failed: 0, blocked: 0, cancelled: 0 }
        });
    }
    const allTasks = db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT ? UNION ALL SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
    )
    SELECT * FROM tasks WHERE id IN (SELECT id FROM subtree) AND parent_id IS NOT NULL
  `).all(rootId);
    const summary = {
        total: allTasks.length,
        pending: allTasks.filter(t => t.status === 'pending').length,
        in_progress: allTasks.filter(t => t.status === 'in_progress').length,
        pending_review: allTasks.filter(t => t.status === 'pending_review').length,
        completed: allTasks.filter(t => t.status === 'completed').length,
        failed: allTasks.filter(t => t.status === 'failed').length,
        blocked: allTasks.filter(t => t.status === 'blocked').length,
        cancelled: allTasks.filter(t => t.status === 'cancelled').length,
    };
    // Reviewer mode: pick tasks waiting for review
    if (input.mode === 'reviewer') {
        const reviewCandidates = allTasks
            .filter(t => t.status === 'pending_review')
            .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
        if (reviewCandidates.length > 0) {
            const task = reviewCandidates[0];
            return toMCPResponse({
                next_task: {
                    id: task.id, title: task.title, description: task.description,
                    tool_name: task.tool_name, priority: task.priority, status: task.status,
                    depends_on: JSON.parse(task.depends_on || '[]'), dependencies_met: true,
                },
                summary,
            });
        }
        return toMCPResponse({ next_task: null, summary });
    }
    // Executor mode: find first pending with deps met
    const candidates = allTasks
        .filter(t => t.status === 'pending' || (input.include_blocked && t.status === 'blocked'))
        .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
    for (const task of candidates) {
        const dependsOn = JSON.parse(task.depends_on || '[]');
        const depsMet = dependsOn.every(depId => {
            const depTask = allTasks.find(t => t.id === depId);
            return depTask && (depTask.status === 'completed' || depTask.status === 'approved');
        });
        if (depsMet) {
            return toMCPResponse({
                next_task: {
                    id: task.id, title: task.title, description: task.description,
                    tool_name: task.tool_name, priority: task.priority, status: task.status,
                    depends_on: dependsOn, dependencies_met: true,
                },
                summary,
            });
        }
    }
    return toMCPResponse({ next_task: null, summary });
}
export async function handleTaskUpdate(args) {
    const input = TaskUpdateInput.parse(args);
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.task_id);
    if (!task) {
        return toMCPResponse({ error: 'Task not found' });
    }
    // Use VALID_TRANSITIONS at module scope
    const allowed = VALID_TRANSITIONS[task.status] || [];
    if (!allowed.includes(input.status)) {
        const errMsg = 'Invalid transition: ' + task.status + ' -> ' + input.status +
            '. Allowed: ' + allowed.join(', ');
        return toMCPResponse({ error: errMsg });
    }
    const now = new Date().toISOString();
    let retryCount = task.retry_count;
    // needs_revision = reviewer sent it back → retry
    if (input.status === 'needs_revision') {
        retryCount += 1;
    }
    if (input.status === 'failed') {
        retryCount += 1;
    }
    db.prepare(`
    UPDATE tasks SET
      status = ?, result = ?, error = ?, review_comment = ?,
      tool_name = COALESCE(?, tool_name),
      retry_count = ?, updated_at = ?
    WHERE id = ?
  `).run(input.status, input.result || null, input.error || null, input.review_comment || null, input.tool_name || null, retryCount, now, input.task_id);
    // Parent cascade: if approved or completed, check siblings
    let parentAutoCompleted = false;
    let parentStatus;
    if ((input.status === 'completed' || input.status === 'approved') && task.parent_id) {
        const siblings = db.prepare('SELECT * FROM tasks WHERE parent_id = ? AND id != ?').all(task.parent_id, input.task_id);
        const allDone = siblings.every(s => s.status === 'completed' || s.status === 'approved');
        if (allDone) {
            db.prepare("UPDATE tasks SET status = 'completed', updated_at = ? WHERE id = ?")
                .run(now, task.parent_id);
            parentAutoCompleted = true;
            parentStatus = 'completed';
        }
    }
    if (input.status === 'failed' && task.parent_id) {
        parentStatus = 'partial_failure';
    }
    // needs_revision → auto-transition back to pending for executor
    if (input.status === 'needs_revision') {
        parentStatus = 'retry_issued';
    }
    return toMCPResponse({
        task: { id: task.id, title: task.title, status: input.status, retry_count: retryCount },
        ...(parentAutoCompleted ? { parent_auto_completed: true, parent_status: parentStatus } : {}),
        ...(!parentAutoCompleted && parentStatus ? { parent_status: parentStatus } : {}),
    });
}
