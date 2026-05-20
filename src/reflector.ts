import { getDb } from './db.js';
import { TaskReflectInput, toMCPResponse, type TaskRow } from './types.js';

export async function handleTaskReflect(args: unknown) {
  const input = TaskReflectInput.parse(args);
  const db = getDb();

  const tasks = db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT ? UNION ALL SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
    )
    SELECT * FROM tasks WHERE id IN (SELECT id FROM subtree) AND id != ?
    ORDER BY priority ASC
  `).all(input.task_id, input.task_id) as TaskRow[];

  if (tasks.length === 0) {
    return toMCPResponse({
      task_tree: [],
      summary: { total: 0, completed: 0, failed: 0, blocked: 0, pending_review: 0, needs_revision: 0, success_rate: 0, failed_tasks: [] },
      suggestions: ['No subtasks found for this task.'],
    });
  }

  const completed = tasks.filter(t => t.status === 'completed' || t.status === 'approved').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;
  const pendingReview = tasks.filter(t => t.status === 'pending_review').length;
  const needsRevision = tasks.filter(t => t.status === 'needs_revision').length;
  const successRate = tasks.length > 0 ? completed / tasks.length : 0;

  const failedTasks = tasks.filter(t => t.status === 'failed').map(t => t.title);
  const revisionTasks = tasks.filter(t => t.status === 'needs_revision').map(t => t.title);

  const suggestions: string[] = [];

  // Failed tasks → retry
  if (failed > 0) {
    for (const ft of failedTasks) {
      const task = tasks.find(t => t.title === ft)!;
      if (task.retry_count < task.max_retries) {
        suggestions.push(
          "Task '" + ft + "' failed (retry " + task.retry_count + "/" + task.max_retries + "). Consider retrying."
        );
      } else {
        suggestions.push(
          "Task '" + ft + "' exhausted retries (" + task.retry_count + "/" + task.max_retries + "). Consider skipping or replanning."
        );
      }
    }
  }

  // Needs revision → Agent B feedback loop
  if (needsRevision > 0) {
    for (const rt of revisionTasks) {
      const task = tasks.find(t => t.title === rt)!;
      const comment = task.review_comment ? ': ' + task.review_comment : '';
      suggestions.push(
        "Task '" + rt + "' needs revision (retry " + task.retry_count + "/" + task.max_retries + ")" + comment + ". Agent should re-execute with fixes."
      );
    }
  }

  // Pending review → waiting for Agent B
  if (pendingReview > 0) {
    const reviewTaskNames = tasks
      .filter(t => t.status === 'pending_review')
      .map(t => t.title)
      .join(', ');
    suggestions.push(
      'Tasks pending review: [' + reviewTaskNames + ']. Switch to reviewer mode (task_next mode=reviewer) to review them.'
    );
  }

  // Blocked tasks
  if (blocked > 0) {
    const blockedTasks = tasks.filter(t => t.status === 'blocked');
    for (const bt of blockedTasks) {
      const deps = JSON.parse(bt.depends_on || '[]');
      const unmetDeps = deps.filter((depId: string) => {
        const dep = tasks.find(t => t.id === depId);
        return !dep || (dep.status !== 'completed' && dep.status !== 'approved');
      });
      suggestions.push(
        "Task '" + bt.title + "' is blocked. Unmet dependencies: " + unmetDeps.length + "."
      );
    }
  }

  // Overall assessment
  if (successRate < 0.5) {
    suggestions.push('Success rate below 50%. Consider replanning the task tree.');
  }

  if (failed === 0 && blocked === 0 && pendingReview === 0 && needsRevision === 0 && completed === tasks.length) {
    suggestions.push('All tasks completed successfully. Goal achieved!');
  }

  return toMCPResponse({
    task_tree: tasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      result: t.result,
      error: t.error,
      review_comment: t.review_comment,
      retry_count: t.retry_count,
    })),
    summary: {
      total: tasks.length,
      completed,
      failed,
      blocked,
      pending_review: pendingReview,
      needs_revision: needsRevision,
      success_rate: Math.round(successRate * 100) / 100,
      failed_tasks: [...failedTasks, ...revisionTasks.map(t => t + ' (needs revision)')],
    },
    suggestions,
  });
}
