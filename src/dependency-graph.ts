import { z } from 'zod';
import { getDb, getLatestRoot } from './db.js';
import { toMCPResponse, type TaskRow } from './types.js';

const DepGraphInput = z.object({
  task_id: z.string().optional().describe('Root task ID; defaults to latest root'),
  format: z.enum(['mermaid', 'ascii', 'json']).optional().default('mermaid'),
});

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

  const depthMap = new Map<string, number>();
  function computeDepth(id: string, depth: number) {
    if (depthMap.has(id)) return;
    depthMap.set(id, depth);
    for (const t of tasks) {
      if (t.parent_id === id) computeDepth(t.id, depth + 1);
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

function buildMermaid(graph: Graph): string {
  const lines: string[] = ['graph TD'];
  for (const node of graph.nodes) {
    const mid = sanitizeMermaidId(node.id);
    const statusBadge = node.status !== 'pending' ? ` (${node.status})` : '';
    lines.push(`    ${mid}["${node.title}${statusBadge}"]`);
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
  const input = DepGraphInput.parse(args);
  const db = getDb();

  const rootId = input.task_id || getLatestRoot(db);
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
