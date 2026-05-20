import { getDb } from './db.js';
import { toMCPResponse } from './types.js';
export async function handleTaskMetrics(_args) {
    const db = getDb();
    const totalRoots = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE parent_id IS NULL').get().count;
    const totalTasks = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
    const statusRows = db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all();
    const statusBreakdown = statusRows.map(r => ({ status: r.status, count: Number(r.count) }));
    const pendingReviewCount = Number(statusRows.find(r => r.status === 'pending_review')?.count ?? 0);
    const approvedCount = Number(statusRows.find(r => r.status === 'approved')?.count ?? 0);
    const completedCount = Number(statusRows.find(r => r.status === 'completed')?.count ?? 0);
    const failedCount = Number(statusRows.find(r => r.status === 'failed')?.count ?? 0);
    const totalCompleted = completedCount + approvedCount;
    const pendingReviewVsApprovedRatio = approvedCount > 0
        ? Math.round((pendingReviewCount / approvedCount) * 100) / 100
        : null;
    const mostFailedTitles = db.prepare('SELECT title, COUNT(*) as count FROM tasks WHERE status = ? GROUP BY title ORDER BY count DESC LIMIT 10').all('failed');
    const avgRetriesRow = db.prepare('SELECT AVG(retry_count) as avg FROM tasks').get();
    const avgRetries = avgRetriesRow.avg !== null ? Math.round(Number(avgRetriesRow.avg) * 100) / 100 : 0;
    const avgCompletionTimeRow = db.prepare("SELECT AVG(julianday(updated_at) - julianday(created_at)) as avg FROM tasks WHERE status IN ('completed', 'approved')").get();
    const avgCompletionTimeDays = avgCompletionTimeRow.avg !== null
        ? Math.round(Number(avgCompletionTimeRow.avg) * 100) / 100
        : null;
    const roots = db.prepare('SELECT id FROM tasks WHERE parent_id IS NULL').all();
    let totalCompletionRate = 0;
    let treesWithData = 0;
    for (const root of roots) {
        const subtree = db.prepare(`
      WITH RECURSIVE tree(id) AS (
        SELECT ? UNION ALL SELECT t.id FROM tasks t JOIN tree ON t.parent_id = tree.id
      )
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('completed', 'approved') THEN 1 ELSE 0 END) as completed
      FROM tasks WHERE id IN (SELECT id FROM tree)
    `).get(root.id);
        if (subtree.total > 0) {
            totalCompletionRate += subtree.completed / subtree.total;
            treesWithData++;
        }
    }
    const avgCompletionRate = treesWithData > 0
        ? Math.round((totalCompletionRate / treesWithData) * 100) / 100
        : null;
    const treeCount = totalRoots;
    const avgTreeSize = treeCount > 0 ? Math.round((totalTasks / treeCount) * 100) / 100 : 0;
    return toMCPResponse({
        total_roots: totalRoots,
        total_tasks: totalTasks,
        avg_completion_rate: avgCompletionRate,
        avg_completion_time_days: avgCompletionTimeDays,
        most_failed_titles: mostFailedTitles.map(r => ({
            title: r.title,
            failures: Number(r.count),
        })),
        avg_retries: avgRetries,
        pending_review_count: pendingReviewCount,
        approved_count: approvedCount,
        pending_review_vs_approved_ratio: pendingReviewVsApprovedRatio,
        status_breakdown: statusBreakdown,
        tree_count: treeCount,
        tree_summary: {
            avg_tree_size: avgTreeSize,
            total_failed: failedCount,
            total_completed: totalCompleted,
        },
    });
}
