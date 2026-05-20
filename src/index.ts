import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getDb } from './db.js';
import { handleTaskPlan, handleTaskStatus } from './planner.js';
import { handleTaskNext, handleTaskUpdate } from './state-machine.js';
import { handleTaskReflect } from './reflector.js';
import { handleToolRegister, handleToolSearch, handleToolUpdate, handleToolDeprecate, handleToolStats } from './tool-registry.js';
import { handleTaskCancel } from './canceller.js';
import { handleTaskExport } from './exporter.js';
import { handleTaskImport } from './importer.js';
import { handleTaskDuplicate } from './duplicator.js';
import { handleTaskSnapshot } from './snapshot.js';
import { handleTaskBatchUpdate } from './batch-updater.js';
import { handleTaskDependencyGraph } from './dependency-graph.js';
import { handleToolExport } from './tool-export.js';
import { handleToolImport } from './tool-import.js';
import { handleModelClassify, handleModelRoute, handleModelConfig } from './model-router.js';
import { handleTaskAuditLog } from './audit-log.js';
import { handleTaskMetrics } from './metrics.js';
import { handleTaskRollback } from './rollback.js';
import { handleSystemInfo } from './system-info.js';

const server = new Server(
  { name: 'task-orchestrator', version: '0.2.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'task_plan',
      description: 'Create a new task plan: store a goal + decomposed subtasks as a tree in SQLite',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The root goal description' },
          subtasks: {
            type: 'array',
            description: 'Array of subtasks the AI agent has already decomposed',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Subtask title' },
                description: { type: 'string', description: 'Detailed description' },
                suggested_tool: { type: 'string', description: 'Tool name for execution' },
                priority: { type: 'number', description: 'Priority 1-5 (1=highest)' },
                depends_on: { type: 'array', items: { type: 'string' }, description: 'Titles of tasks to complete first' },
              },
              required: ['title'],
            },
          },
          context: { type: 'string', description: 'Background context for the plan' },
        },
        required: ['goal', 'subtasks'],
      },
    },
    {
      name: 'task_next',
      description: 'Get the next action. Two modes: executor (pick pending) or reviewer (pick pending_review)',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Root task ID; defaults to latest' },
          mode: { type: 'string', enum: ['executor', 'reviewer'], description: 'executor: work on tasks. reviewer: review completed tasks' },
          include_blocked: { type: 'boolean', description: 'Also consider blocked tasks' },
        },
      },
    },
    {
      name: 'task_update',
      description: 'Update task status. Supports dual-review: in_progress -> pending_review -> approved/needs_revision',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to update' },
          status: {
            type: 'string',
            enum: ['in_progress', 'pending_review', 'approved', 'needs_revision', 'completed', 'failed', 'blocked', 'cancelled'],
            description: 'New status',
          },
          result: { type: 'string', description: 'Execution result' },
          error: { type: 'string', description: 'Error message (if failed)' },
          review_comment: { type: 'string', description: 'Reviewer feedback (with needs_revision)' },
          tool_name: { type: 'string', description: 'Tool used for execution' },
        },
        required: ['task_id', 'status'],
      },
    },
    {
      name: 'task_reflect',
      description: 'Gather execution history for reflection. Returns summary + heuristic suggestions including review status',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to reflect on' },
          goal: { type: 'string', description: 'Original goal for context' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'task_status',
      description: 'View the current state of a task tree in flat or tree format',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Root task ID; defaults to latest' },
          format: { type: 'string', enum: ['flat', 'tree'], description: 'Output format' },
        },
      },
    },
    {
      name: 'tool_register',
      description: 'Register a new tool in the AI-native tool registry (A+B platform growth mechanism)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Tool name in snake_case' },
          description: { type: 'string', description: 'What this tool does' },
          schema: { type: 'string', description: 'JSON Schema string of input parameters' },
          provider: { type: 'string', description: 'MCP server or service provider' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for searchability' },
        },
        required: ['name', 'description', 'schema', 'provider'],
      },
    },
    {
      name: 'tool_search',
      description: 'Search tool registry by natural language query using FTS5 full-text search',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What capability are you looking for?' },
          limit: { type: 'number', description: 'Max results (default 10)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
        },
        required: ['query'],
      },
    },
    {
      name: 'tool_update',
      description: 'Update an existing tool in the registry. Only provided fields are changed.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Tool name to update' },
          description: { type: 'string', description: 'New description' },
          schema: { type: 'string', description: 'New JSON Schema string' },
          provider: { type: 'string', description: 'New MCP server or service provider' },
          tags: { type: 'array', items: { type: 'string' }, description: 'New tags for searchability' },
        },
        required: ['name'],
      },
    },
    {
      name: 'tool_deprecate',
      description: 'Deprecate a tool in the registry. Prefixes description with [DEPRECATED] and removes from search index. The tool data is preserved in the database.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the tool to deprecate' },
          replacement: { type: 'string', description: 'Recommended replacement tool name' },
        },
        required: ['name'],
      },
    },
    {
      name: 'tool_stats',
      description: 'Get registry statistics: total tools, deprecated count, per-provider breakdown, top tags, and recently added tools. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'tool_export',
      description: 'Export all registered tools to a JSON file. Optionally include deprecated tools.',
      inputSchema: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Output file path (default: /tmp/tools_export.json)' },
          include_deprecated: { type: 'boolean', description: 'Include deprecated tools (default: false)' },
        },
      },
    },
    {
      name: 'tool_import',
      description: 'Import tools from a JSON file (output of tool_export). Supports merge (INSERT OR REPLACE) and replace (clear DB then import).',
      inputSchema: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to the JSON file containing tool definitions' },
          mode: { type: 'string', enum: ['merge', 'replace'], description: 'Import mode: merge (upsert) or replace (clear + import). Default: merge' },
        },
        required: ['filepath'],
      },
    },
    {
      name: 'task_cancel',
      description: 'Cancel a task and optionally all its descendants. Only cancellable: pending, in_progress, failed, blocked.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to cancel' },
          cascade: { type: 'boolean', description: 'Also cancel all descendant tasks (default true)' },
          reason: { type: 'string', description: 'Why the task was cancelled' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'task_export',
      description: 'Export a task tree to a JSON or CSV file. Walks the entire subtree recursively.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Root task ID to export' },
          filepath: { type: 'string', description: 'Output file path (default: /tmp/task_export.json)' },
          format: { type: 'string', enum: ['json', 'csv'], description: 'Export format (default: json)' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'task_import',
      description: 'Import a task tree from a JSON file (produced by task_export). Re-IDs all nodes and inserts into the database.',
      inputSchema: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to the JSON export file' },
        },
        required: ['filepath'],
      },
    },
    {
      name: 'task_duplicate',
      description: 'Deep-clone an existing task tree. Generates new UUIDs for all tasks, remaps parent_id and depends_on, and resets all statuses to pending.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to duplicate' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'task_batch_update',
      description: 'Update multiple tasks in one call. Partial success allowed — reports per-task failures.',
      inputSchema: {
        type: 'object',
        properties: {
          task_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of task IDs to update',
          },
          status: {
            type: 'string',
            enum: ['in_progress', 'pending_review', 'approved', 'needs_revision', 'completed', 'failed', 'blocked', 'cancelled'],
            description: 'New status for all tasks',
          },
          result: { type: 'string', description: 'Execution result (applied to all)' },
          error: { type: 'string', description: 'Error message (applied to all)' },
          review_comment: { type: 'string', description: 'Reviewer feedback (with needs_revision)' },
          tool_name: { type: 'string', description: 'Tool used for execution' },
        },
        required: ['task_ids', 'status'],
      },
    },
    {
      name: 'task_dependency_graph',
      description: 'Generate a visual dependency graph of a task tree. Output formats: Mermaid flowchart, ASCII tree, or structured JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Root task ID; defaults to latest root' },
          format: { type: 'string', enum: ['mermaid', 'ascii', 'json'], description: 'Output format (default: mermaid)' },
        },
      },
    },
    {
      name: 'task_audit_log',
      description: 'Retrieve task status change audit trail. Optionally filter by task_id.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Filter by task ID (optional)' },
          limit: { type: 'number', description: 'Max entries (default 50, max 500)' },
        },
      },
    },
    {
      name: 'task_metrics',
      description: 'Aggregate metrics across ALL task trees — total roots, avg completion rate, avg time, most failed titles, avg retries, pending_review vs approved ratio. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'task_rollback',
      description: 'Roll back a task to its previous status using the audit log. Uses the most recent status change entry. Cannot rollback terminal statuses (completed, cancelled).',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to roll back to its previous status' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'task_snapshot',
      description: 'Create a point-in-time snapshot of a task tree. Deep-clones the entire subtree into a snapshots table for versioning and rollback.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Root task ID to snapshot' },
          label: { type: 'string', description: 'Optional label for this snapshot (e.g. "v1.0", "before-refactor")' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'system_info',
      description: 'Get database infrastructure statistics: table row counts, database file size, WAL status, and server version. Read-only introspection.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'task_plan':     return await handleTaskPlan(args);
      case 'task_next':     return await handleTaskNext(args);
      case 'task_update':   return await handleTaskUpdate(args);
      case 'task_reflect':  return await handleTaskReflect(args);
      case 'task_status':   return await handleTaskStatus(args);
      case 'tool_register': return await handleToolRegister(args);
      case 'tool_search':   return await handleToolSearch(args);
      case 'tool_update':   return await handleToolUpdate(args);
      case 'tool_deprecate': return await handleToolDeprecate(args);
      case 'tool_stats':    return await handleToolStats(args);
      case 'tool_export':   return await handleToolExport(args);
      case 'tool_import':   return await handleToolImport(args);
      case 'task_cancel':   return await handleTaskCancel(args);
      case 'task_export':   return await handleTaskExport(args);
      case 'task_import':   return await handleTaskImport(args);
      case 'task_duplicate': return await handleTaskDuplicate(args);
      case 'task_batch_update': return await handleTaskBatchUpdate(args);
      case 'task_dependency_graph': return await handleTaskDependencyGraph(args);
      case 'model_classify': return await handleModelClassify(args);
      case 'model_route':    return await handleModelRoute(args);
      case 'model_config':   return await handleModelConfig(args);
      case 'task_audit_log': return await handleTaskAuditLog(args);
      case 'task_metrics':  return await handleTaskMetrics(args);
      case 'task_rollback': return await handleTaskRollback(args);
      case 'task_snapshot': return await handleTaskSnapshot(args);
      case 'system_info':  return await handleSystemInfo(args);
      default:
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Unknown tool: ' + name }) }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
});

async function main() {
  const db = getDb();
  console.error('Task Orchestrator MCP Server v0.2.0 running on stdio');
  console.error('Database:', db.name);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
