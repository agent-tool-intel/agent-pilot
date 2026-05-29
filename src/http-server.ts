import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
import { handleTaskArchive, handleTaskArchiveList, handleTaskArchiveRestore } from './archiver.js';
import { handleTaskMetrics } from './metrics.js';
import { handleTaskRollback } from './rollback.js';
import { handleSystemInfo } from './system-info.js';
import { handleDataIntegrityCheck } from './integrity.js';

const server = new Server(
  { name: 'agent-pilot', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const toolHandlers: Record<string, (args: unknown) => Promise<any>> = {
  task_plan: handleTaskPlan,
  task_next: handleTaskNext,
  task_update: handleTaskUpdate,
  task_reflect: handleTaskReflect,
  task_status: handleTaskStatus,
  task_cancel: handleTaskCancel,
  task_export: handleTaskExport,
  task_import: handleTaskImport,
  task_duplicate: handleTaskDuplicate,
  task_snapshot: handleTaskSnapshot,
  task_batch_update: handleTaskBatchUpdate,
  task_dependency_graph: handleTaskDependencyGraph,
  task_audit_log: handleTaskAuditLog,
  task_archive: handleTaskArchive,
  task_archive_list: handleTaskArchiveList,
  task_archive_restore: handleTaskArchiveRestore,
  task_metrics: handleTaskMetrics,
  task_rollback: handleTaskRollback,
  tool_register: handleToolRegister,
  tool_search: handleToolSearch,
  tool_update: handleToolUpdate,
  tool_deprecate: handleToolDeprecate,
  tool_stats: handleToolStats,
  tool_export: handleToolExport,
  tool_import: handleToolImport,
  model_classify: handleModelClassify,
  model_route: handleModelRoute,
  model_config: handleModelConfig,
  system_info: handleSystemInfo,
  data_integrity_check: handleDataIntegrityCheck,
};

const toolDefs = [
  { name: 'task_plan', description: 'Create a task plan with subtasks', inputSchema: { type: 'object', properties: { goal: { type: 'string' }, subtasks: { type: 'array' } } } },
  { name: 'task_next', description: 'Get next pending task', inputSchema: { type: 'object' } },
  { name: 'task_update', description: 'Update task status', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, status: { type: 'string' } } } },
  { name: 'task_status', description: 'Get task status overview', inputSchema: { type: 'object' } },
  { name: 'tool_register', description: 'Register a new tool in the registry', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, schema: { type: 'string' }, provider: { type: 'string' } } } },
  { name: 'tool_search', description: 'Search for tools using Agent Tool Intel semantic search', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
  { name: 'tool_stats', description: 'Tool registry statistics', inputSchema: { type: 'object' } },
  { name: 'system_info', description: 'System information and health check', inputSchema: { type: 'object' } },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefs }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = toolHandlers[name];
  if (!handler) throw new Error('Unknown tool: ' + name);
  return await handler(args);
});

import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', name: 'agent-pilot', version: '1.0.0' }));
// MCP server card for Smithery discoveryapp.get("/.well-known/mcp/server-card.json", (_req, res) => {  res.json({    name: "agent-pilot",    version: "1.0.0",    description: "Task orchestrator & tool registry with built-in Agent Tool Intelligence. 28+ MCP tools: task management, semantic tool search with quality scoring, trust engine, model routing.",    tools: [      { name: "tool_search", description: "Search for MCP tools using Agent Tool Intel semantic search with quality scores" },      { name: "tool_register", description: "Register a new tool with canonical ID and auto-feedback" },      { name: "task_plan", description: "Create a task plan with subtasks" },      { name: "task_next", description: "Get next pending task" },      { name: "task_update", description: "Update task status" },      { name: "task_status", description: "Get task status overview" },      { name: "tool_stats", description: "Tool registry statistics" },      { name: "system_info", description: "System information and health check" }    ],    websiteUrl: "https://agent-tool-intel-production.up.railway.app",    repository: { url: "https://github.com/HMCHENGGH/agent-pilot" }  });});

// MCP endpoint for Smithery
app.post('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (e) {
    res.status(500).json({ error: 'MCP error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('AgentPilot HTTP MCP server on port ' + PORT);
});
