import { getDb } from './db.js';
import { toMCPResponse, TaskStatus, DataIntegrityCheckInput } from './types.js';
const VALID_STATUSES = [...TaskStatus.options];
function runAllChecks(db) {
    const issues = [];
    const allTaskIds = new Set();
    const taskIdRows = db.prepare('SELECT id FROM tasks').all();
    for (const r of taskIdRows)
        allTaskIds.add(r.id);
    const allToolNames = new Set();
    const toolNameRows = db.prepare('SELECT name FROM tools').all();
    for (const r of toolNameRows)
        allToolNames.add(r.name);
    const allTasks = db.prepare('SELECT * FROM tasks').all();
    // ── 1. Invalid status ──
    for (const task of allTasks) {
        if (!VALID_STATUSES.includes(task.status)) {
            issues.push({
                type: 'invalid_status',
                task_id: task.id,
                description: `Task ${task.id} has invalid status '${task.status}'`,
            });
        }
    }
    // ── 2. Orphan parent_id & self-ref ──
    for (const task of allTasks) {
        if (task.parent_id === null)
            continue;
        if (task.id === task.parent_id) {
            issues.push({
                type: 'orphan_parent_id',
                task_id: task.id,
                description: `Task ${task.id} references itself as parent_id`,
            });
        }
        else if (!allTaskIds.has(task.parent_id)) {
            issues.push({
                type: 'orphan_parent_id',
                task_id: task.id,
                description: `Task ${task.id} has orphan parent_id '${task.parent_id}' (task not found)`,
            });
        }
    }
    // ── 3. Broken depends_on & 4. Duplicate depends_on ──
    for (const task of allTasks) {
        try {
            const deps = JSON.parse(task.depends_on);
            if (!Array.isArray(deps)) {
                issues.push({
                    type: 'malformed_depends_on',
                    task_id: task.id,
                    description: `Task ${task.id} depends_on is not an array: '${task.depends_on}'`,
                });
                continue;
            }
            for (const depId of deps) {
                if (typeof depId !== 'string') {
                    issues.push({
                        type: 'malformed_depends_on',
                        task_id: task.id,
                        description: `Task ${task.id} depends_on contains non-string entry: '${String(depId)}'`,
                    });
                    continue;
                }
                if (!allTaskIds.has(depId)) {
                    issues.push({
                        type: 'broken_depends_on',
                        task_id: task.id,
                        description: `Task ${task.id} depends_on non-existent task '${depId}'`,
                    });
                }
                else if (depId === task.id) {
                    issues.push({
                        type: 'broken_depends_on',
                        task_id: task.id,
                        description: `Task ${task.id} depends_on itself`,
                    });
                }
            }
            const seen = new Set();
            const dupes = new Set();
            for (const d of deps) {
                if (typeof d !== 'string')
                    continue;
                if (seen.has(d))
                    dupes.add(d);
                seen.add(d);
            }
            if (dupes.size > 0) {
                issues.push({
                    type: 'duplicate_depends_on',
                    task_id: task.id,
                    description: `Task ${task.id} has duplicate depends_on entries: [${[...dupes].join(', ')}]`,
                });
            }
        }
        catch {
            issues.push({
                type: 'malformed_depends_on',
                task_id: task.id,
                description: `Task ${task.id} has malformed depends_on JSON: '${task.depends_on}'`,
            });
        }
    }
    // ── 5. Retry count exceeded ──
    for (const task of allTasks) {
        if (task.retry_count > task.max_retries) {
            issues.push({
                type: 'retry_exceeded',
                task_id: task.id,
                description: `Task ${task.id} retry_count (${task.retry_count}) exceeds max_retries (${task.max_retries})`,
            });
        }
    }
    // ── 6. Orphan snapshots ──
    const orphanSnapshots = db.prepare('SELECT id, task_id FROM snapshots WHERE task_id NOT IN (SELECT id FROM tasks)').all();
    for (const row of orphanSnapshots) {
        issues.push({
            type: 'orphan_snapshot',
            description: `Snapshot ${row.id} references non-existent task '${row.task_id}'`,
        });
    }
    // ── 7. Orphan audit_log ──
    const orphanAudit = db.prepare('SELECT id, task_id FROM audit_log WHERE task_id NOT IN (SELECT id FROM tasks)').all();
    for (const row of orphanAudit) {
        issues.push({
            type: 'orphan_audit_log',
            description: `Audit log entry ${row.id} references non-existent task '${row.task_id}'`,
        });
    }
    // ── 8. Broken tool_name refs ──
    for (const task of allTasks) {
        if (task.tool_name !== null && !allToolNames.has(task.tool_name)) {
            issues.push({
                type: 'broken_tool_ref',
                task_id: task.id,
                description: `Task ${task.id} references non-existent tool '${task.tool_name}'`,
            });
        }
    }
    // ── 9. Circular parent refs ──
    const tasksWithParent = allTasks.filter(t => t.parent_id !== null);
    for (const t of tasksWithParent) {
        const visited = new Set([t.id]);
        let current = t.parent_id;
        while (current !== null) {
            if (visited.has(current)) {
                issues.push({
                    type: 'circular_parent_ref',
                    task_id: t.id,
                    description: `Task ${t.id} is part of a circular parent_id chain involving task ${current}`,
                });
                break;
            }
            visited.add(current);
            const nextTask = allTasks.find(x => x.id === current);
            current = nextTask?.parent_id ?? null;
        }
    }
    // ── 10. Circular dependency (depends_on) ──
    const depGraph = new Map();
    for (const task of allTasks) {
        depGraph.set(task.id, []);
    }
    for (const task of allTasks) {
        try {
            const deps = JSON.parse(task.depends_on);
            if (Array.isArray(deps)) {
                depGraph.set(task.id, deps.filter(d => typeof d === 'string' && allTaskIds.has(d) && d !== task.id));
            }
        }
        catch { /* malformed — already reported above */ }
    }
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    for (const nodeId of depGraph.keys())
        color.set(nodeId, WHITE);
    function dfs(node) {
        color.set(node, GRAY);
        const deps = depGraph.get(node) || [];
        for (const dep of deps) {
            const c = color.get(dep) ?? WHITE;
            if (c === GRAY) {
                return [node, dep];
            }
            if (c === WHITE) {
                const cycle = dfs(dep);
                if (cycle)
                    return [node, ...cycle];
            }
        }
        color.set(node, BLACK);
        return null;
    }
    const foundCycles = new Set();
    for (const nodeId of depGraph.keys()) {
        if (color.get(nodeId) === WHITE) {
            const cycle = dfs(nodeId);
            if (cycle) {
                for (const n of cycle)
                    foundCycles.add(n);
            }
        }
    }
    for (const taskId of foundCycles) {
        issues.push({
            type: 'circular_dependency',
            task_id: taskId,
            description: `Task ${taskId} is part of a circular dependency chain in depends_on`,
        });
    }
    return issues;
}
function performRepairs(db) {
    const placeholders = VALID_STATUSES.map(() => '?').join(',');
    db.prepare(`UPDATE tasks SET status = 'pending', updated_at = datetime('now') WHERE status NOT IN (${placeholders})`).run(...VALID_STATUSES);
    db.prepare(`UPDATE tasks SET parent_id = NULL, updated_at = datetime('now')
     WHERE parent_id IS NOT NULL
       AND (parent_id NOT IN (SELECT id FROM tasks) OR id = parent_id)`).run();
    const allTasks = db.prepare('SELECT id, depends_on FROM tasks').all();
    const allIds = new Set(allTasks.map(t => t.id));
    const fixDepStmt = db.prepare('UPDATE tasks SET depends_on = ?, updated_at = datetime(\'now\') WHERE id = ?');
    for (const task of allTasks) {
        try {
            let deps = JSON.parse(task.depends_on);
            if (!Array.isArray(deps)) {
                fixDepStmt.run('[]', task.id);
                continue;
            }
            deps = deps.filter((d) => typeof d === 'string' && d !== task.id && allIds.has(d));
            deps = [...new Set(deps)];
            fixDepStmt.run(JSON.stringify(deps), task.id);
        }
        catch {
            fixDepStmt.run('[]', task.id);
        }
    }
    db.prepare('UPDATE tasks SET retry_count = max_retries WHERE retry_count > max_retries').run();
    db.prepare('DELETE FROM snapshots WHERE task_id NOT IN (SELECT id FROM tasks)').run();
    db.prepare('DELETE FROM audit_log WHERE task_id NOT IN (SELECT id FROM tasks)').run();
    db.prepare("UPDATE tasks SET tool_name = NULL, updated_at = datetime('now') WHERE tool_name IS NOT NULL AND tool_name NOT IN (SELECT name FROM tools)").run();
}
export async function handleDataIntegrityCheck(args) {
    const input = DataIntegrityCheckInput.parse(args);
    const db = getDb();
    let issues = runAllChecks(db);
    if (input.repair && issues.length > 0) {
        db.transaction(() => {
            performRepairs(db);
        })();
        issues = runAllChecks(db);
        return toMCPResponse({
            issues_found: issues.length,
            issues,
            healthy: issues.length === 0,
            repair_applied: true,
        });
    }
    return toMCPResponse({
        issues_found: issues.length,
        issues,
        healthy: issues.length === 0,
    });
}
