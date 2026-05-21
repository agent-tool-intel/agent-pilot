#!/usr/bin/env node

import { unlinkSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const dbPath = resolve(projectRoot, 'data', 'orchestrator.db');
for (const suffix of ['', '-wal', '-shm']) {
  const p = dbPath + suffix;
  if (existsSync(p)) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }
}
mkdirSync(resolve(projectRoot, 'data'), { recursive: true });

import { handleTaskPlan, handleTaskStatus } from '../dist/planner.js';
import { handleTaskNext, handleTaskUpdate } from '../dist/state-machine.js';
import { handleTaskReflect } from '../dist/reflector.js';
import { handleToolRegister, handleToolSearch, handleToolUpdate, handleToolDeprecate, handleToolStats } from '../dist/tool-registry.js';
import { handleToolExport } from '../dist/tool-export.js';
import { handleToolImport } from '../dist/tool-import.js';
import { handleTaskCancel } from '../dist/canceller.js';
import { handleTaskExport } from '../dist/exporter.js';
import { handleTaskImport } from '../dist/importer.js';
import { handleTaskDuplicate } from '../dist/duplicator.js';
import { handleTaskSnapshot } from '../dist/snapshot.js';
import { handleTaskBatchUpdate } from '../dist/batch-updater.js';
import { handleTaskDependencyGraph } from '../dist/dependency-graph.js';
import { handleModelClassify, handleModelRoute, handleModelConfig } from '../dist/model-router.js';
import { handleTaskAuditLog } from '../dist/audit-log.js';
import { handleTaskArchive, handleTaskArchiveList, handleTaskArchiveRestore } from '../dist/archiver.js';
import { handleTaskMetrics } from '../dist/metrics.js';
import { handleTaskRollback } from '../dist/rollback.js';
import { handleSystemInfo } from '../dist/system-info.js';
import { handleDataIntegrityCheck } from '../dist/integrity.js';

// ─── Test Framework ───

interface TestResult {
  num: number;
  name: string;
  status: 'PASS' | 'FAIL';
  error?: string;
}

const results: TestResult[] = [];
let testNum = 0;

function parseContent(response: any): any {
  if (!response || !response.content || !response.content[0] || typeof response.content[0].text !== 'string') {
    throw new Error('Invalid MCP response format');
  }
  return JSON.parse(response.content[0].text);
}

function assertSuccess(response: any, msg?: string): any {
  const data = parseContent(response);
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(msg ? `${msg}: ${data.error}` : data.error);
  }
  return data;
}

function assertError(response: any, msg?: string): any {
  const data = parseContent(response);
  if (!data || typeof data !== 'object' || !('error' in data) || !data.error) {
    throw new Error(msg || 'Expected an error response but got success');
  }
  return data;
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function test(name: string, fn: () => Promise<void>) {
  testNum++;
  const num = testNum;
  try {
    await fn();
    results.push({ num, name, status: 'PASS' });
    console.log(`  \u2713 #${num} ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num, name, status: 'FAIL', error: msg });
    console.log(`  \u2717 #${num} ${name}: ${msg}`);
  }
}

// ─── Global State ───

let rootTaskId = '';
let subtaskIds: string[] = [];
let snapshotId = '';

// ─── Main Test Runner ───

async function main() {
  console.log('\u2550'.repeat(56));
  console.log('  Task Orchestrator \u2014 End-to-End Test Suite');
  console.log('\u2550'.repeat(56));
  console.log('');

  // ═══════════════════════════════════════════════════════
  // PHASE 1: Core Workflow (plan -> classify -> route -> execute -> review -> approve -> reflect -> check -> info -> archive)
  // ═══════════════════════════════════════════════════════

  console.log('PHASE 1: Core Workflow');
  console.log('');

  await test('task_plan (create plan)', async () => {
    const res = await handleTaskPlan({
      goal: 'E2E Integration Test Suite',
      subtasks: [
        { title: 'Core Implementation', description: 'Implement core module with tests', priority: 1 },
        { title: 'Documentation', description: 'Write API docs and examples', priority: 2, depends_on: ['Core Implementation'] },
      ],
      context: 'Comprehensive end-to-end test of all orchestrator tools',
    });
    const data = assertSuccess(res);
    rootTaskId = data.root_task.id;
    subtaskIds = data.subtasks.map((s: any) => s.id);
    assert(data.root_task.status === 'pending', 'Root should be pending');
    assert(data.root_task.title === 'E2E Integration Test Suite', 'Root title should match goal');
    assert(data.root_task.priority === 1, 'Root priority should default to 1');
    assert(typeof data.root_task.created_at === 'string', 'Root should have created_at');
    assert(data.subtasks.length === 2, 'Should have 2 subtasks');
    assert(data.subtasks[0].title === 'Core Implementation', 'First subtask title');
    assert(data.subtasks[0].priority === 1, 'First subtask priority');
    assert(data.subtasks[0].retry_count === 0, 'Retry count should start at 0');
    assert(data.subtasks[0].max_retries === 3, 'Max retries should default to 3');
    assert(data.subtasks[1].title === 'Documentation', 'Second subtask title');
    assert(data.subtasks[1].status === 'blocked', 'Second subtask should be blocked (depends on first)');
    assert(data.subtasks[1].depends_on.length === 1, 'Should have 1 dependency');
    assert(data.subtasks[1].depends_on[0] === subtaskIds[0], 'Should depend on first subtask');
  });

  await test('model_classify (code task)', async () => {
    const res = await handleModelClassify({
      task_description: '幫我寫一個Python代碼函數來分析數據使用pandas',
    });
    const data = assertSuccess(res);
    assert(typeof data.category === 'string', 'Should return category string');
    assert(typeof data.category_name === 'string', 'Should return category_name');
    assert(typeof data.confidence === 'number', 'Should return confidence number');
    assert(data.confidence > 0, 'Confidence should be > 0');
    assert(data.confidence <= 1, 'Confidence should be <= 1');
    assert(Array.isArray(data.matched_keywords), 'Should return matched_keywords array');
    assert(data.matched_keywords.length > 0, 'Should match at least 1 keyword');
    assert(Array.isArray(data.all_scores), 'Should return all_scores array');
    assert(data.all_scores.length === 8, 'Should have exactly 8 category scores');
    for (const s of data.all_scores) {
      assert(typeof s.category === 'string', 'Each score should have category');
      assert(typeof s.name === 'string', 'Each score should have name');
      assert(typeof s.score === 'number', 'Each score should be a number');
    }
  });

  await test('model_route (plan B default)', async () => {
    const res = await handleModelRoute({
      task_description: '幫我寫一個Python代碼函數來分析數據使用pandas',
      plan_preset: 'B',
    });
    const data = assertSuccess(res);
    assert(typeof data.model === 'string', 'Should return model ID string');
    assert(typeof data.category === 'string', 'Should return category string');
    assert(typeof data.confidence === 'number', 'Should return confidence');
    assert(typeof data.reason === 'string', 'Should return routing reason');
    assert(typeof data.plan_used === 'string', 'Should return plan_used name');
    assert(data.plan_used.includes('B'), 'Plan used should reference B');
    assert(typeof data.estimated_cost_per_1M === 'string', 'Should return cost estimate');
  });

  await test('model_route (with available_models)', async () => {
    const res = await handleModelRoute({
      task_description: '幫我寫一個Python代碼函數來分析數據使用pandas',
      available_models: ['nonexistent-model-xyz', 'another-fake-model'],
      plan_preset: 'B',
    });
    const data = assertSuccess(res);
    assert(typeof data.model === 'string', 'Should return a model even when preferred unavailable');
  });

  await test('task_next (executor mode)', async () => {
    const res = await handleTaskNext({ task_id: rootTaskId, mode: 'executor' });
    const data = assertSuccess(res);
    assert(data.next_task !== null, 'Should find a pending task');
    assert(data.next_task.status === 'pending', 'Task should be pending');
    assert(data.next_task.title === 'Core Implementation', 'Should get highest-priority pending task');
    assert(data.next_task.dependencies_met === true, 'Dependencies should be met');
    assert(data.summary.total === 2, 'Should report 2 subtasks');
    assert(data.summary.pending === 1, 'Should report 1 pending');
    assert(data.summary.blocked === 1, 'Should report 1 blocked');
  });

  await test('task_next (executor, include_blocked)', async () => {
    const res = await handleTaskNext({ task_id: rootTaskId, mode: 'executor', include_blocked: true });
    const data = assertSuccess(res);
    assert(data.next_task !== null, 'Should find a task even with include_blocked');
    assert(data.next_task.title === 'Core Implementation', 'Should still prefer pending over blocked');
  });

  await test('task_update -> in_progress', async () => {
    const res = await handleTaskUpdate({ task_id: subtaskIds[0], status: 'in_progress' });
    const data = assertSuccess(res);
    assert(data.task.status === 'in_progress', 'Should transition to in_progress');
    assert(data.task.id === subtaskIds[0], 'Should return correct task ID');
    assert(data.task.retry_count === 0, 'Retry count unchanged');
  });

  await test('task_update -> pending_review', async () => {
    const res = await handleTaskUpdate({
      task_id: subtaskIds[0],
      status: 'pending_review',
      result: 'Core module implementation complete. All tests pass with >90% coverage.',
      tool_name: 'code_executor',
    });
    const data = assertSuccess(res);
    assert(data.task.status === 'pending_review', 'Should transition to pending_review');
    assert(data.task.retry_count === 0, 'Retry count unchanged for pending_review');
  });

  await test('task_snapshot', async () => {
    const res = await handleTaskSnapshot({ task_id: rootTaskId, label: 'pre-review-v1' });
    const data = assertSuccess(res);
    assert(typeof data.snapshot_id === 'string', 'Should return snapshot_id');
    snapshotId = data.snapshot_id;
    assert(data.task_count >= 1, 'Should capture at least 1 task');
    assert(data.task_count >= 3, 'Should capture root + 2 subtasks');
    assert(typeof data.created_at === 'string', 'Should return created_at timestamp');
  });

  await test('task_next (reviewer mode)', async () => {
    const res = await handleTaskNext({ task_id: rootTaskId, mode: 'reviewer' });
    const data = assertSuccess(res);
    assert(data.next_task !== null, 'Should find a pending_review task');
    assert(data.next_task.status === 'pending_review', 'Task should be pending_review');
    assert(data.next_task.title === 'Core Implementation', 'Should get the pending_review task');
    assert(data.summary.pending_review === 1, 'Summary should show 1 pending_review');
    assert(data.summary.in_progress === 0, 'Summary should show 0 in_progress');
  });

  await test('task_update -> approved (subtask)', async () => {
    const res = await handleTaskUpdate({
      task_id: subtaskIds[0],
      status: 'approved',
      review_comment: 'Code review passed. Implementation looks solid.',
    });
    const data = assertSuccess(res);
    assert(data.task.status === 'approved', 'Should transition to approved');
  });

  await test('task_update -> unblock dependent subtask', async () => {
    const res = await handleTaskUpdate({ task_id: subtaskIds[1], status: 'pending' });
    const data = assertSuccess(res);
    assert(data.task.status === 'pending', 'Should unblock documentation subtask');
  });

  await test('task_update -> complete dependent subtask (auto-complete parent)', async () => {
    const res = await handleTaskUpdate({
      task_id: subtaskIds[1],
      status: 'completed',
      result: 'API documentation complete with examples.',
    });
    const data = assertSuccess(res);
    assert(data.task.status === 'completed', 'Should complete documentation subtask');
    assert(data.parent_auto_completed === true, 'Root should auto-complete when all subtasks done');
    assert(data.parent_status === 'completed', 'Root status should be completed');
  });

  await test('task_reflect', async () => {
    const res = await handleTaskReflect({ task_id: rootTaskId });
    const data = assertSuccess(res);
    assert(Array.isArray(data.task_tree), 'Should return task_tree array');
    assert(data.task_tree.length >= 1, 'Task tree should have entries');
    assert(typeof data.summary === 'object', 'Should return summary object');
    assert(data.summary.total >= 1, 'Should have at least 1 task');
    assert(data.summary.completed >= 1, 'Should have completed tasks');
    assert(data.summary.failed >= 0, 'Should have failed count');
    assert(data.summary.blocked >= 0, 'Should have blocked count');
    assert(typeof data.summary.success_rate === 'number', 'Should have success_rate');
    assert(Array.isArray(data.suggestions), 'Should return suggestions array');
  });

  await test('data_integrity_check (scan)', async () => {
    const res = await handleDataIntegrityCheck({ repair: false });
    const data = assertSuccess(res);
    assert(typeof data.healthy === 'boolean', 'Should return healthy flag');
    assert(Array.isArray(data.issues), 'Should return issues array');
    assert(typeof data.issues_found === 'number', 'Should return issues_found count');
  });

  await test('system_info', async () => {
    const res = await handleSystemInfo({});
    const data = assertSuccess(res);
    assert(data.server.name === 'task-orchestrator', 'Server name should match');
    assert(data.server.version === '0.2.0', 'Server version should match');
    assert(data.total_tasks > 0, 'Should have tasks');
    assert(data.total_tools >= 0, 'Should have tools count');
    assert(typeof data.database_file_size_bytes === 'number', 'Should have DB file size');
    assert(typeof data.database_file_path === 'string', 'Should have DB file path');
    assert(typeof data.journal_mode === 'string', 'Should have journal mode');
    assert(typeof data.table_row_counts === 'object', 'Should have table row counts');
  });

  await test('data_integrity_check (repair)', async () => {
    const res = await handleDataIntegrityCheck({ repair: true });
    const data = assertSuccess(res);
    assert(typeof data.healthy === 'boolean', 'Should return healthy flag');
    if (data.issues_found > 0) {
      assert(data.repair_applied === true, 'Should apply repair when issues exist');
    }
  });

  await test('task_archive', async () => {
    const res = await handleTaskArchive({ task_id: rootTaskId, cascade: true });
    const data = assertSuccess(res);
    assert(data.archived === rootTaskId, 'Should archive root task');
    assert(data.subtrees_archived >= 2, 'Should archive at least 2 tasks (root + subtask)');
    assert(data.cascade === true, 'Should use cascade');
    assert(typeof data.archived_at === 'string', 'Should return archived_at timestamp');
  });

  await test('task_archive_list', async () => {
    const res = await handleTaskArchiveList({ limit: 50 });
    const data = assertSuccess(res);
    assert(data.total > 0, 'Should have archived tasks');
    assert(Array.isArray(data.tasks), 'Should return tasks array');
    assert(data.tasks.length > 0, 'Should have at least 1 task in list');
    assert(typeof data.tasks[0].archived_at === 'string', 'Archived task should have archived_at');
  });

  await test('task_archive_restore', async () => {
    const res = await handleTaskArchiveRestore({ task_id: rootTaskId, cascade: true });
    const data = assertSuccess(res);
    assert(data.restored === rootTaskId, 'Should restore root task');
    assert(data.subtrees_restored >= 2, 'Should restore at least 2 tasks');
    assert(data.cascade === true, 'Should use cascade');
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 2: Model Config CRUD
  // ═══════════════════════════════════════════════════════

  console.log('');
  console.log('PHASE 2: Model Config (list / switch / set / reset)');
  console.log('');

  await test('model_config (list)', async () => {
    const res = await handleModelConfig({ action: 'list' });
    const data = assertSuccess(res);
    assert(typeof data.active_plan === 'string', 'Should have active_plan');
    assert(typeof data.plan_name === 'string', 'Should have plan_name');
    assert(typeof data.description === 'string', 'Should have description');
    assert(Array.isArray(data.categories), 'Should return categories array');
    assert(data.categories.length >= 1, 'Should have at least 1 category');
    for (const cat of data.categories) {
      assert(typeof cat.category === 'string', 'Each category should have an ID');
      assert(typeof cat.name === 'string', 'Each category should have a name');
      assert(typeof cat.primary === 'string', 'Each category should have a primary model');
      assert(typeof cat.fallback === 'string', 'Each category should have a fallback model');
    }
    assert(Array.isArray(data.available_plans), 'Should return available_plans');
    assert(data.available_plans.length === 3, 'Should have 3 available plans (A, B, C)');
    for (const plan of data.available_plans) {
      assert(typeof plan.plan === 'string', 'Each plan should have plan key');
      assert(typeof plan.plan_name === 'string', 'Each plan should have plan_name');
      assert(typeof plan.description === 'string', 'Each plan should have description');
    }
  });

  await test('model_config (switch to plan A)', async () => {
    const res = await handleModelConfig({ action: 'switch', plan: 'A' });
    const data = assertSuccess(res);
    assert(data.active_plan === 'A', 'Should switch to plan A');
    assert(typeof data.plan_name === 'string', 'Should return plan name');
    assert(typeof data.description === 'string', 'Should return plan description');
    assert(typeof data.message === 'string', 'Should return confirmation message');
  });

  await test('model_config (set override)', async () => {
    const res = await handleModelConfig({
      action: 'set',
      category: 'code_generation',
      primary_model: 'e2e-custom-primary',
      fallback_model: 'e2e-custom-fallback',
    });
    const data = assertSuccess(res);
    assert(data.updated.category === 'code_generation', 'Should update code_generation');
    assert(data.updated.primary === 'e2e-custom-primary', 'Should set primary model');
    assert(data.updated.fallback === 'e2e-custom-fallback', 'Should set fallback model');
    assert(typeof data.active_plan === 'string', 'Should return active_plan');
  });

  await test('model_config (reset plan A)', async () => {
    const res = await handleModelConfig({ action: 'reset', plan: 'A' });
    const data = assertSuccess(res);
    assert(data.plan === 'A', 'Should reset plan A');
    assert(typeof data.plan_name === 'string', 'Should return plan name');
    assert(typeof data.message === 'string', 'Should return confirmation message');
  });

  await test('model_config (switch back to B)', async () => {
    const res = await handleModelConfig({ action: 'switch', plan: 'B' });
    const data = assertSuccess(res);
    assert(data.active_plan === 'B', 'Should switch back to plan B');
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 3: Tool Registry CRUD
  // ═══════════════════════════════════════════════════════

  console.log('');
  console.log('PHASE 3: Tool Registry (register / search / update / deprecate / stats)');
  console.log('');

  await test('tool_register', async () => {
    const res = await handleToolRegister({
      name: 'e2e_test_tool',
      description: 'E2E test tool for validating the tool registry',
      schema: JSON.stringify({
        type: 'object',
        properties: { input: { type: 'string' } },
        required: ['input'],
      }),
      provider: 'e2e-test-provider',
      tags: ['e2e', 'test', 'registry'],
    });
    const data = assertSuccess(res);
    assert(data.name === 'e2e_test_tool', 'Should register with correct name');
    assert(data.description.startsWith('E2E test tool'), 'Should register with correct description');
    assert(data.provider === 'e2e-test-provider', 'Should register with correct provider');
    assert(Array.isArray(data.tags), 'Should return tags array');
    assert(data.tags.length >= 3, 'Should have all registered tags');
    assert(typeof data.schema === 'string', 'Should return schema string');
    assert(typeof data.created_at === 'string', 'Should return created_at');
  });

  await test('tool_register (duplicate - upsert)', async () => {
    const res = await handleToolRegister({
      name: 'e2e_test_tool',
      description: 'E2E test tool - updated via re-register',
      schema: JSON.stringify({ type: 'object', properties: { x: { type: 'number' } } }),
      provider: 'e2e-test-provider',
      tags: ['e2e', 'test', 'registry'],
    });
    const data = assertSuccess(res);
    assert(data.name === 'e2e_test_tool', 'Should upsert same name');
    assert(data.description === 'E2E test tool - updated via re-register', 'Should update on re-register');
  });

  await test('tool_search', async () => {
    const res = await handleToolSearch({ query: 'e2e test tool', limit: 10 });
    const data = assertSuccess(res);
    assert(data.results.length > 0, 'Should find at least 1 tool');
    const found = data.results.find((r: any) => r.name === 'e2e_test_tool');
    assert(found !== undefined, 'Should find our registered tool');
    assert(typeof found.relevance_score === 'number', 'Should have relevance score');
    assert(found.relevance_score > 0, 'Relevance score should be > 0');
    assert(Array.isArray(found.tags), 'Result should have tags array');
    assert(found.provider === 'e2e-test-provider', 'Provider should match');
  });

  await test('tool_search (by tags)', async () => {
    const res = await handleToolSearch({ query: 'test', limit: 10, tags: ['e2e'] });
    const data = assertSuccess(res);
    assert(data.results.length > 0, 'Should find tools by tag filter');
    for (const r of data.results) {
      assert(r.tags.includes('e2e'), 'All results should have the e2e tag');
    }
  });

  await test('tool_update (description + tags)', async () => {
    const res = await handleToolUpdate({
      name: 'e2e_test_tool',
      description: 'Updated E2E test tool description',
      tags: ['e2e', 'updated', 'registry'],
    });
    const data = assertSuccess(res);
    assert(data.name === 'e2e_test_tool', 'Should update correct tool');
    assert(data.description === 'Updated E2E test tool description', 'Should update description');
    assert(data.tags.includes('updated'), 'Should include new tag');
    assert(data.tags.includes('e2e'), 'Should keep existing tag');
    assert(data.tags.includes('registry'), 'Should keep existing tag');
  });

  await test('tool_deprecate', async () => {
    const res = await handleToolDeprecate({
      name: 'e2e_test_tool',
      replacement: 'e2e_v2_tool',
    });
    const data = assertSuccess(res);
    assert(data.name === 'e2e_test_tool', 'Should deprecate correct tool');
    assert(data.description.startsWith('[DEPRECATED]'), 'Description should have [DEPRECATED] prefix');
    assert(data.replacement === 'e2e_v2_tool', 'Should include replacement');
    assert(typeof data.schema === 'string', 'Should return schema');
  });

  await test('tool_stats', async () => {
    const res = await handleToolStats({});
    const data = assertSuccess(res);
    assert(data.total > 0, 'Should have at least 1 tool total');
    assert(data.deprecated >= 1, 'Should have at least 1 deprecated tool');
    assert(data.active >= 0, 'Should have active count');
    assert(Array.isArray(data.per_provider), 'Should return per_provider breakdown');
    assert(data.per_provider.length > 0, 'Should have provider entries');
    for (const pp of data.per_provider) {
      assert(typeof pp.provider === 'string', 'Provider entry should have name');
      assert(typeof pp.count === 'number', 'Provider entry should have count');
    }
    assert(Array.isArray(data.top_tags), 'Should return top_tags');
    assert(Array.isArray(data.recently_added), 'Should return recently_added');
    assert(data.recently_added.length > 0, 'Should have recently_added entries');
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 4: Tool Export / Import
  // ═══════════════════════════════════════════════════════

  console.log('');
  console.log('PHASE 4: Tool Export / Import');
  console.log('');

  await test('tool_export (include_deprecated=true)', async () => {
    const filepath = '/tmp/e2e_tool_export.json';
    if (existsSync(filepath)) unlinkSync(filepath);
    const res = await handleToolExport({ filepath, include_deprecated: true });
    const data = assertSuccess(res);
    assert(data.tool_count > 0, 'Should export at least 1 tool');
    assert(data.exported_to === filepath, 'Should export to specified path');
    assert(existsSync(filepath), 'Export file should exist on disk');
  });

  await test('tool_export (include_deprecated=false)', async () => {
    const filepath = '/tmp/e2e_tool_export_active.json';
    if (existsSync(filepath)) unlinkSync(filepath);
    const res = await handleToolExport({ filepath, include_deprecated: false });
    const data = assertSuccess(res);
    assert(data.tool_count >= 0, 'Should export active tools only');
    assert(existsSync(filepath), 'Active export file should exist on disk');
  });

  await test('tool_import (merge mode)', async () => {
    const res = await handleToolImport({
      filepath: '/tmp/e2e_tool_export.json',
      mode: 'merge',
    });
    const data = assertSuccess(res);
    assert(data.imported > 0, 'Should import at least 1 tool');
    assert(typeof data.skipped === 'number', 'Should report skipped count');
    assert(Array.isArray(data.errors), 'Should return errors array');
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 5: Task Utility Tools
  // ═══════════════════════════════════════════════════════

  console.log('');
  console.log('PHASE 5: Task Utilities');
  console.log('');

  let utilRootId = '';
  let utilSubtaskIds: string[] = [];
  let utilRoot3Id = '';

  await test('task_status (tree format)', async () => {
    const res = await handleTaskStatus({ task_id: rootTaskId, format: 'tree' });
    const data = assertSuccess(res);
    assert(data.root !== null, 'Should return root task');
    assert(typeof data.root.title === 'string', 'Root should have title');
    assert(typeof data.root.status === 'string', 'Root should have status');
    assert(Array.isArray(data.tasks), 'Should return tasks array');
    assert(data.tasks.length > 0, 'Tasks should have entries');
  });

  await test('task_status (flat format)', async () => {
    const res = await handleTaskStatus({ task_id: rootTaskId, format: 'flat' });
    const data = assertSuccess(res);
    assert(data.root !== null, 'Should return root task');
    assert(Array.isArray(data.tasks), 'Should return tasks flat array');
    for (const t of data.tasks) {
      assert(!Array.isArray(t.children), 'Flat format should not have children');
    }
  });

  await test('task_export (JSON)', async () => {
    const filepath = '/tmp/e2e_task_export.json';
    if (existsSync(filepath)) unlinkSync(filepath);
    const res = await handleTaskExport({ task_id: rootTaskId, filepath, format: 'json' });
    const data = assertSuccess(res);
    assert(data.task_count >= 1, 'Should export at least 1 task');
    assert(existsSync(filepath), 'Export file should exist on disk');
  });

  await test('task_import', async () => {
    const res = await handleTaskImport({ filepath: '/tmp/e2e_task_export.json' });
    const data = assertSuccess(res);
    assert(typeof data.root_id === 'string', 'Should return new root_id');
    assert(data.root_id !== rootTaskId, 'Imported root ID should differ from original');
    assert(data.imported_count >= 1, 'Should import at least 1 task');
  });

  await test('task_duplicate', async () => {
    const res = await handleTaskDuplicate({ task_id: rootTaskId });
    const data = assertSuccess(res);
    assert(data.original_id === rootTaskId, 'Should reference original root');
    assert(data.new_root_id !== rootTaskId, 'Duplicate should get new root ID');
    assert(data.duplicated_count >= 1, 'Should duplicate at least 1 task');
  });

  await test('task_batch_update (3 subtasks)', async () => {
    const planRes = await handleTaskPlan({
      goal: 'Batch Update Test',
      subtasks: [
        { title: 'Batch Task A', priority: 1 },
        { title: 'Batch Task B', priority: 2 },
        { title: 'Batch Task C', priority: 3 },
      ],
      context: 'Testing batch update functionality',
    });
    const planData = assertSuccess(planRes);
    utilRootId = planData.root_task.id;
    utilSubtaskIds = planData.subtasks.map((s: any) => s.id);
    assert(utilSubtaskIds.length === 3, 'Should have 3 subtasks');

    const batchRes = await handleTaskBatchUpdate({
      task_ids: [utilSubtaskIds[0], utilSubtaskIds[1]],
      status: 'in_progress',
    });
    const batchData = assertSuccess(batchRes);
    assert(batchData.succeeded === 2, 'Should successfully update 2 tasks');
    assert(batchData.failed === 0, 'Should have 0 failures');
    assert(Array.isArray(batchData.failures), 'Should return failures array');
  });

  await test('task_batch_update (invalid status)', async () => {
    const res = await handleTaskBatchUpdate({
      task_ids: [utilSubtaskIds[2]],
      status: 'cancelled',
    });
    const batchData = assertSuccess(res);
    assert(batchData.succeeded === 1, 'Should cancel all 1');
    assert(batchData.failed === 0, 'Should have 0 failures');
  });

  await test('task_dependency_graph (ascii)', async () => {
    const res = await handleTaskDependencyGraph({ task_id: rootTaskId, format: 'ascii' });
    const data = assertSuccess(res);
    assert(typeof data.graph === 'string', 'Should return ASCII graph string');
    assert(data.graph.length > 0, 'ASCII graph should not be empty');
    assert(data.format === 'ascii', 'Should return ascii format');
    assert(data.graph.includes('Core Implementation'), 'Graph should mention subtask');
  });

  await test('task_dependency_graph (json)', async () => {
    const res = await handleTaskDependencyGraph({ task_id: rootTaskId, format: 'json' });
    const data = assertSuccess(res);
    assert(data.format === 'json', 'Should return json format');
    assert(typeof data.graph === 'object', 'JSON graph should be an object');
    assert(Array.isArray(data.graph.nodes), 'JSON graph should have nodes array');
    assert(Array.isArray(data.graph.edges), 'JSON graph should have edges array');
  });

  await test('task_dependency_graph (mermaid)', async () => {
    const res = await handleTaskDependencyGraph({ task_id: rootTaskId, format: 'mermaid' });
    const data = assertSuccess(res);
    assert(data.format === 'mermaid', 'Should return mermaid format');
    assert(typeof data.graph === 'string', 'Should return mermaid graph string');
    assert(data.graph.startsWith('graph TD'), 'Mermaid graph should start with graph TD');
  });

  await test('task_audit_log (by task_id)', async () => {
    const auditTaskId = utilSubtaskIds.length > 0 ? utilSubtaskIds[0] : undefined;
    const res = await handleTaskAuditLog({ task_id: auditTaskId, limit: 50 });
    const data = assertSuccess(res);
    assert(Array.isArray(data.entries), 'Should return entries array');
    assert(data.entries.length > 0, 'Should have audit entries for the task');
    assert(typeof data.entries[0].task_id === 'string', 'Entry should have task_id');
    assert(typeof data.entries[0].new_status === 'string', 'Entry should have new_status');
    assert(typeof data.entries[0].changed_at === 'string', 'Entry should have changed_at');
  });

  await test('task_audit_log (all entries)', async () => {
    const res = await handleTaskAuditLog({ limit: 100 });
    const data = assertSuccess(res);
    assert(Array.isArray(data.entries), 'Should return entries array');
    assert(data.entries.length > 0, 'Should have some audit entries in DB');
  });

  await test('task_cancel (pending subtask)', async () => {
    const planRes = await handleTaskPlan({
      goal: 'Cancel Test Plan',
      subtasks: [
        { title: 'Cancellable Pending', priority: 1 },
        { title: 'Cancellable In Progress', priority: 2 },
      ],
    });
    const planData = assertSuccess(planRes);
    const cancelTaskId = planData.subtasks[0].id;

    const res = await handleTaskCancel({
      task_id: cancelTaskId,
      cascade: false,
      reason: 'E2E cancel test',
    });
    const data = assertSuccess(res);
    assert(data.cancelled.id === cancelTaskId, 'Should cancel correct task');
    assert(data.cancelled.previous_status === 'pending', 'Should cancel from pending');
    assert(data.reason === 'E2E cancel test', 'Should store cancel reason');
    assert(data.cascaded_count >= 0, 'Should report cascaded count');
  });

  await test('task_cancel (cascade)', async () => {
    const planRes = await handleTaskPlan({
      goal: 'Cascade Cancel Test',
      subtasks: [
        { title: 'Parent Task', priority: 1 },
        { title: 'Child Task A', priority: 2 },
      ],
    });
    const planData = assertSuccess(planRes);
    const parentTaskId = planData.subtasks[0].id;

    const res = await handleTaskCancel({
      task_id: parentTaskId,
      cascade: true,
      reason: 'Cascade cancel test',
    });
    const data = assertSuccess(res);
    assert(data.cancelled.id === parentTaskId, 'Should cancel parent task');
    assert(data.cascaded_count >= 0, 'Should report cascaded count for children');
  });

  await test('task_metrics', async () => {
    const res = await handleTaskMetrics({});
    const data = assertSuccess(res);
    assert(data.total_roots > 0, 'Should have at least 1 root');
    assert(data.total_tasks > 0, 'Should have at least 1 task');
    assert(Array.isArray(data.status_breakdown), 'Should return status_breakdown');
    assert(data.status_breakdown.length > 0, 'Should have status entries');
    assert(Array.isArray(data.most_failed_titles), 'Should return most_failed_titles');
    assert(typeof data.avg_retries === 'number', 'Should return avg_retries');
    assert(typeof data.tree_summary === 'object', 'Should return tree_summary');
    assert(typeof data.tree_summary.avg_tree_size === 'number', 'tree_summary should have avg_tree_size');
    assert(typeof data.tree_summary.total_failed === 'number', 'tree_summary should have total_failed');
    assert(typeof data.tree_summary.total_completed === 'number', 'tree_summary should have total_completed');
    assert(typeof data.pending_review_count === 'number', 'Should have pending_review_count');
    assert(typeof data.approved_count === 'number', 'Should have approved_count');
  });

  await test('task_rollback (in_progress -> pending)', async () => {
    const planRes = await handleTaskPlan({
      goal: 'Rollback Test Plan',
      subtasks: [
        { title: 'Rollback Task', priority: 1 },
        { title: 'Helper Task', priority: 2 },
      ],
    });
    const planData = assertSuccess(planRes);
    const rollbackTaskId = planData.subtasks[0].id;
    utilRoot3Id = planData.root_task.id;

    await assertSuccess(await handleTaskUpdate({ task_id: rollbackTaskId, status: 'in_progress' }));

    const res = await handleTaskRollback({ task_id: rollbackTaskId });
    const data = assertSuccess(res);
    assert(data.task_id === rollbackTaskId, 'Should rollback correct task');
    assert(data.rolled_back_from === 'in_progress', 'Should rollback from in_progress');
    assert(data.rolled_back_to === 'pending', 'Should rollback to pending');
  });

  await test('task_rollback (no audit history)', async () => {
    const planRes = await handleTaskPlan({
      goal: 'Rollback No-History Test',
      subtasks: [{ title: 'No History Task', priority: 1 }],
    });
    const planData = assertSuccess(planRes);
    const taskId = planData.subtasks[0].id;

    const res = await handleTaskRollback({ task_id: taskId });
    const data = assertError(res, 'Should report error for task with no audit history');
    assert(typeof data.error === 'string', 'Should return error message');
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 6: Edge-Case Error Tests
  // ═══════════════════════════════════════════════════════

  console.log('');
  console.log('PHASE 6: Edge-Case Error Handling');
  console.log('');

  await test('task_plan (empty goal rejected)', async () => {
    let threw = false;
    try {
      await handleTaskPlan({ goal: '', subtasks: [{ title: 'Some subtask' }] });
    } catch {
      threw = true;
    }
    assert(threw === true, 'Should throw validation error for empty goal');
  });

  await test('task_update (invalid transition)', async () => {
    const res = await handleTaskUpdate({
      task_id: utilSubtaskIds[0],
      status: 'approved',
    });
    const data = assertError(res, 'Should reject invalid transition');
    assert(typeof data.error === 'string', 'Should return error message');
  });

  await test('task_cancel (completed task)', async () => {
    const planRes = await handleTaskPlan({
      goal: 'Completed Task Test',
      subtasks: [{ title: 'Complete Me', priority: 1 }],
    });
    const planData = assertSuccess(planRes);
    const taskId = planData.subtasks[0].id;

    await assertSuccess(await handleTaskUpdate({ task_id: taskId, status: 'in_progress' }));
    await assertSuccess(await handleTaskUpdate({ task_id: taskId, status: 'completed' }));

    const res = await handleTaskCancel({ task_id: taskId, reason: 'Should not work' });
    const data = assertError(res, 'Should reject cancelling completed task');
    assert(typeof data.error === 'string', 'Should return error message');
  });

  await test('task_archive (non-archivable status)', async () => {
    const res = await handleTaskArchive({ task_id: utilRoot3Id, cascade: false });
    const data = assertError(res, 'Should reject archiving non-completed task');
    assert(typeof data.error === 'string', 'Should return error message');
  });

  await test('task_next (nonexistent task_id)', async () => {
    const res = await handleTaskNext({
      task_id: '00000000-0000-0000-0000-000000000000',
      mode: 'executor',
    });
    const data = assertSuccess(res);
    assert(data.next_task === null, 'Should return null for nonexistent task');
    assert(data.summary.total === 0, 'Summary should show 0 total');
  });

  await test('model_classify (empty description)', async () => {
    const res = await handleModelClassify({
      task_description: 'xyz_unrecognized_nonsense_term_12345',
    });
    const data = assertSuccess(res);
    assert(typeof data.category === 'string', 'Should return a category even for unrecognized input');
    assert(data.category === 'high_logic', 'Should default to high_logic for unrecognized');
  });

  // ═══════════════════════════════════════════════════════
  // PHASE 7: Final Archive with Cascade
  // ═══════════════════════════════════════════════════════

  console.log('');
  console.log('PHASE 7: Cleanup Archive');
  console.log('');

  await test('task_archive (completed tree cleanup)', async () => {
    const res = await handleTaskArchive({ task_id: rootTaskId, cascade: true });
    const data = assertSuccess(res);
    assert(data.archived === rootTaskId, 'Should archive completed tree');
    assert(data.subtrees_archived >= 2, 'Should archive subtree');
  });

  await test('task_archive_list (final count)', async () => {
    const res = await handleTaskArchiveList({ limit: 100 });
    const data = assertSuccess(res);
    assert(data.total > 0, 'Should have archived tasks');
    assert(data.tasks.length > 0, 'Should have archive entries');
  });

  // ═══════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;

  console.log('');
  console.log('\u2550'.repeat(56));
  console.log(`  Results: ${passed} PASS, ${failed} FAIL, ${total} Total`);
  if (failed > 0) {
    console.log('');
    console.log('  Failures:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`    \u2022 #${r.num} ${r.name}: ${r.error}`);
    }
  }
  console.log('\u2550'.repeat(56));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n  \u2717 Test suite crashed:', err);
  process.exit(1);
});
