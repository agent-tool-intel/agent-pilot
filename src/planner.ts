import { v4 as uuidv4 } from 'uuid';
import { getDb, getLatestRoot } from './db.js';
import { TaskPlanInput, TaskStatusInput, toMCPResponse, type TaskRow } from './types.js';

export async function handleTaskPlan(args: unknown) {
  const input = TaskPlanInput.parse(args);
  const db = getDb();
  const rootId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO tasks (id, title, goal, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(rootId, input.goal, input.context || null, 'pending', 1, now, now);

  const subtaskIds = new Map<string, string>();
  const subtaskEntries: Array<{
    id: string; parent_id: string; title: string; description: string | null;
    tool_name: string | null; priority: number; depends_on_titles: string[];
  }> = [];

  for (const st of input.subtasks) {
    const id = uuidv4();
    subtaskIds.set(st.title, id);
    subtaskEntries.push({
      id,
      parent_id: rootId,
      title: st.title,
      description: st.description || null,
      tool_name: st.suggested_tool || null,
      priority: st.priority ?? 3,
      depends_on_titles: st.depends_on || [],
    });
  }

  for (const entry of subtaskEntries) {
    const dependsOnIds = entry.depends_on_titles
      .map((t: string) => subtaskIds.get(t))
      .filter(Boolean) as string[];

    const status = dependsOnIds.length > 0 ? 'blocked' : 'pending';

    db.prepare(
      'INSERT INTO tasks (id, parent_id, title, description, status, tool_name, priority, depends_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      entry.id, entry.parent_id, entry.title, entry.description, status,
      entry.tool_name, entry.priority, JSON.stringify(dependsOnIds), now, now
    );
  }

  const output = buildTaskTreeOutput(db, rootId, input.goal);
  return toMCPResponse(output);
}

function buildTaskTreeOutput(db: ReturnType<typeof getDb>, rootId: string, goal: string) {
  const root = db.prepare('SELECT * FROM tasks WHERE id = ?').get(rootId) as TaskRow;
  const subtasks = db.prepare(
    'SELECT * FROM tasks WHERE parent_id = ? ORDER BY priority ASC, created_at ASC'
  ).all(rootId) as TaskRow[];

  return {
    root_task: {
      id: root.id,
      title: root.title,
      goal: goal,
      status: root.status,
      priority: root.priority,
      created_at: root.created_at,
    },
    subtasks: subtasks.map(st => ({
      id: st.id,
      parent_id: st.parent_id!,
      title: st.title,
      description: st.description,
      status: st.status,
      tool_name: st.tool_name,
      priority: st.priority,
      retry_count: st.retry_count,
      max_retries: st.max_retries,
      depends_on: JSON.parse(st.depends_on || '[]'),
      created_at: st.created_at,
    })),
  };
}

export async function handleTaskStatus(args: unknown) {
  const input = TaskStatusInput.parse(args);
  const db = getDb();

  const rootId = input.task_id || getLatestRoot(db);
  if (!rootId) {
    return toMCPResponse({ root: null, tasks: [], error: 'No tasks found' });
  }

  const root = db.prepare('SELECT * FROM tasks WHERE id = ?').get(rootId) as TaskRow;
  if (!root) {
    return toMCPResponse({ root: null, tasks: [], error: 'Task not found' });
  }

  const allTasks = db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT ? UNION ALL SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
    )
    SELECT * FROM tasks WHERE id IN (SELECT id FROM subtree) AND id != ?
    ORDER BY priority ASC, created_at ASC
  `).all(rootId, rootId) as TaskRow[];

  if (input.format === 'flat') {
    return toMCPResponse({
      root: formatRootOutput(root),
      tasks: allTasks.map(formatTaskRow),
    });
  }

  const tree = buildTree(allTasks, rootId);
  return toMCPResponse({
    root: formatRootOutput(root),
    tasks: tree,
  });
}

function formatRootOutput(root: TaskRow) {
  return {
    id: root.id,
    title: root.title,
    status: root.status,
    goal: root.goal || root.title,
    created_at: root.created_at,
    updated_at: root.updated_at,
  };
}

function formatTaskRow(t: TaskRow, depth = 0) {
  return {
    id: t.id,
    parent_id: t.parent_id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    tool_name: t.tool_name,
    result: t.result,
    error: t.error,
    retry_count: t.retry_count,
    depends_on: JSON.parse(t.depends_on || '[]'),
    created_at: t.created_at,
    updated_at: t.updated_at,
    depth,
  };
}

function buildTree(tasks: TaskRow[], parentId: string, depth = 0): any[] {
  const children = tasks.filter(t => t.parent_id === parentId);
  return children.map(t => ({
    ...formatTaskRow(t, depth),
    children: buildTree(tasks, t.id, depth + 1),
  }));
}
