import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { TaskImportInput, toMCPResponse } from './types.js';
function flattenTree(node, depth, idMap, result) {
    if (typeof node.id !== 'string' || !node.id) {
        throw new Error(`Node at depth ${depth} is missing a valid id`);
    }
    if (typeof node.title !== 'string') {
        throw new Error(`Node ${node.id} is missing a valid title`);
    }
    const newId = uuidv4();
    idMap.set(node.id, newId);
    result.push({
        newId,
        oldId: node.id,
        old_parent_id: node.parent_id ?? null,
        new_parent_id: null,
        title: node.title,
        description: node.description ?? null,
        goal: node.goal ?? null,
        status: node.status ?? 'pending',
        tool_name: node.tool_name ?? null,
        result: node.result ?? null,
        error: node.error ?? null,
        review_comment: node.review_comment ?? null,
        priority: typeof node.priority === 'number' ? node.priority : 3,
        retry_count: typeof node.retry_count === 'number' ? node.retry_count : 0,
        max_retries: typeof node.max_retries === 'number' ? node.max_retries : 3,
        original_depends_on: Array.isArray(node.depends_on) ? node.depends_on : [],
        depends_on: [],
        created_at: node.created_at ?? new Date().toISOString(),
        updated_at: node.updated_at ?? new Date().toISOString(),
        depth,
    });
    for (const child of node.children || []) {
        flattenTree(child, depth + 1, idMap, result);
    }
}
export async function handleTaskImport(args) {
    const input = TaskImportInput.parse(args);
    let root;
    try {
        const content = fs.readFileSync(input.filepath, 'utf-8');
        root = JSON.parse(content);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toMCPResponse({ error: `Failed to read import file: ${message}` });
    }
    if (!root || typeof root !== 'object') {
        return toMCPResponse({ error: 'Import file must contain a valid task tree object' });
    }
    if (typeof root.title !== 'string' || !root.title) {
        return toMCPResponse({ error: 'Root task must have a non-empty title' });
    }
    if (typeof root.id !== 'string' || !root.id) {
        return toMCPResponse({ error: 'Root task must have a valid id' });
    }
    const flatTasks = [];
    const idMap = new Map();
    flattenTree(root, 0, idMap, flatTasks);
    for (const task of flatTasks) {
        task.new_parent_id = task.old_parent_id ? (idMap.get(task.old_parent_id) ?? null) : null;
        task.depends_on = task.original_depends_on
            .map(oldId => idMap.get(oldId))
            .filter((id) => !!id);
    }
    flatTasks.sort((a, b) => a.depth - b.depth);
    const db = getDb();
    const insertAll = db.transaction((tasks) => {
        const stmt = db.prepare('INSERT INTO tasks (id, parent_id, title, description, goal, status, tool_name, result, error, review_comment, priority, retry_count, max_retries, depends_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const t of tasks) {
            stmt.run(t.newId, t.new_parent_id, t.title, t.description, t.goal, t.status, t.tool_name, t.result, t.error, t.review_comment, t.priority, t.retry_count, t.max_retries, JSON.stringify(t.depends_on), t.created_at, t.updated_at);
        }
    });
    insertAll(flatTasks);
    return toMCPResponse({
        root_id: flatTasks[0].newId,
        imported_count: flatTasks.length,
    });
}
