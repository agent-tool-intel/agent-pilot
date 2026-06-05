import { getDb, getLatestRoot } from './db.js';
import { toMCPResponse, TaskDependencyGraphInput, type TaskRow } from './types.js';

interface GraphNode {
  id: string;
  title: string;
  status: string;
  depth: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: 'parent_child' | 'depends_on';
}

interface Graph {
  root_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function buildGraph(tasks: TaskRow[], rootId: string): Graph {
  const taskMap = new Map<string, TaskRow>();
  for (const t of tasks) {
    taskMap.set(t.id, t);
  }

  const childrenMap = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parent_id) continue;
    const arr = childrenMap.get(t.parent_id) || [];
    arr.push(t.id);
    childrenMap.set(t.parent_id, arr);
  }

  const depthMap = new Map<string, number>();
  function computeDepth(id: string, depth: number) {
    if (depthMap.has(id)) return;
    depthMap.set(id, depth);
    for (const childId of childrenMap.get(id) || []) {
      computeDepth(childId, depth + 1);
    }
  }
  computeDepth(rootId, 0);

  const nodes: GraphNode[] = tasks.map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    depth: depthMap.get(t.id) ?? 0,
  }));

  const edges: GraphEdge[] = [];
  for (const t of tasks) {
    if (t.parent_id && taskMap.has(t.parent_id)) {
      edges.push({ from: t.parent_id, to: t.id, type: 'parent_child' });
    }
    const deps: string[] = JSON.parse(t.depends_on || '[]');
    for (const depId of deps) {
      if (taskMap.has(depId)) {
        edges.push({ from: depId, to: t.id, type: 'depends_on' });
      }
    }
  }

  return { root_id: rootId, nodes, edges };
}

function sanitizeMermaidId(id: string): string {
  return 'T_' + id.replace(/[^a-zA-Z0-9]/g, '_');
}

function escapeMermaidLabel(text: string): string {
  return text.replace(/"/g, '#quot;');
}

function buildMermaid(graph: Graph): string {
  const lines: string[] = ['graph TD'];
  for (const node of graph.nodes) {
    const mid = sanitizeMermaidId(node.id);
    const label = escapeMermaidLabel(node.title);
    const statusBadge = node.status !== 'pending' ? ` (${node.status})` : '';
    lines.push(`    ${mid}[${JSON.stringify(label + statusBadge)}]`);
  }
  for (const edge of graph.edges) {
    const from = sanitizeMermaidId(edge.from);
    const to = sanitizeMermaidId(edge.to);
    if (edge.type === 'parent_child') {
      lines.push(`    ${from}-->${to}`);
    } else {
      lines.push(`    ${from}-.->${to}`);
    }
  }
  return lines.join('\n');
}

function buildAscii(graph: Graph): string {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of graph.nodes) nodeMap.set(n.id, n);

  const childrenMap = new Map<string, GraphNode[]>();
  for (const e of graph.edges) {
    if (e.type === 'parent_child') {
      const kids = childrenMap.get(e.from) || [];
      const childNode = nodeMap.get(e.to);
      if (childNode) kids.push(childNode);
      childrenMap.set(e.from, kids);
    }
  }

  const depMap = new Map<string, GraphNode[]>();
  for (const e of graph.edges) {
    if (e.type === 'depends_on') {
      const deps = depMap.get(e.to) || [];
      const depNode = nodeMap.get(e.from);
      if (depNode) deps.push(depNode);
      depMap.set(e.to, deps);
    }
  }

  const rootNode = nodeMap.get(graph.root_id)!;
  const lines: string[] = [];

  function render(node: GraphNode, prefix: string, isLast: boolean) {
    const connector = isLast ? '└── ' : '├── ';
    const deps = depMap.get(node.id);
    const depPart = deps && deps.length > 0
      ? ' (depends_on: ' + deps.map(d => d.title).join(', ') + ')'
      : '';
    lines.push(prefix + connector + node.title + ' [' + node.status + ']' + depPart);
    const kids = childrenMap.get(node.id) || [];
    for (let i = 0; i < kids.length; i++) {
      render(kids[i], prefix + (isLast ? '    ' : '│   '), i === kids.length - 1);
    }
  }

  const rootDeps = depMap.get(graph.root_id);
  const rootDepPart = rootDeps && rootDeps.length > 0
    ? ' (depends_on: ' + rootDeps.map(d => d.title).join(', ') + ')'
    : '';
  lines.push(rootNode.title + ' [' + rootNode.status + ']' + rootDepPart);
  const rootKids = childrenMap.get(graph.root_id) || [];
  for (let i = 0; i < rootKids.length; i++) {
    render(rootKids[i], '', i === rootKids.length - 1);
  }

  return lines.join('\n');
}

function buildJson(graph: Graph) {
  return {
    root_id: graph.root_id,
    nodes: graph.nodes,
    edges: graph.edges,
  };
}

export async function handleTaskDependencyGraph(args: unknown) {
  const input = TaskDependencyGraphInput.parse(args);
  const db = getDb();

  const rootId = input.task_id || getLatestRoot();
  if (!rootId) {
    return toMCPResponse({ error: 'No root task found. Create a plan first with task_plan.' });
  }

  const root = db.prepare('SELECT id FROM tasks WHERE id = ?').get(rootId) as { id: string } | undefined;
  if (!root) {
    return toMCPResponse({ error: 'Task not found: ' + rootId });
  }

  const allTasks = db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT ? UNION ALL SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
    )
    SELECT * FROM tasks WHERE id IN (SELECT id FROM subtree) ORDER BY created_at ASC
  `).all(rootId) as TaskRow[];

  if (allTasks.length === 0) {
    return toMCPResponse({ error: 'No tasks found in the tree.' });
  }

  const graph = buildGraph(allTasks, rootId);

  switch (input.format) {
    case 'mermaid':
      return toMCPResponse({ graph: buildMermaid(graph), format: 'mermaid' });
    case 'ascii':
      return toMCPResponse({ graph: buildAscii(graph), format: 'ascii' });
    case 'json':
      return toMCPResponse({ graph: buildJson(graph), format: 'json' });
  }
}
