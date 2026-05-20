import { z } from 'zod';
// ─── Shared enums ───
// Expanded: added pending_review, approved, needs_revision for dual-agent review
export const TaskStatus = z.enum([
    'pending', 'in_progress', 'pending_review', 'approved', 'needs_revision',
    'completed', 'failed', 'blocked', 'cancelled',
]);
export const UpdateAction = z.enum([
    'in_progress', 'pending_review', 'approved', 'needs_revision', 'completed', 'failed', 'blocked', 'cancelled',
]);
// ─── 1. task_plan ───
export const TaskPlanInput = z.object({
    goal: z.string().min(1).describe('Root goal description'),
    subtasks: z.array(z.object({
        title: z.string().min(1).describe('Subtask title'),
        description: z.string().optional().describe('Detailed description'),
        suggested_tool: z.string().optional().describe('Tool name that can execute this'),
        priority: z.number().int().min(1).max(5).optional().default(3),
        depends_on: z.array(z.string()).optional().describe('Subtask titles that must complete first'),
    })).min(1).describe('Decomposed subtasks'),
    context: z.string().optional().describe('Background context for the plan'),
});
export const TaskPlanOutput = z.object({
    root_task: z.object({
        id: z.string(),
        title: z.string(),
        goal: z.string(),
        status: z.string(),
        priority: z.number(),
        created_at: z.string(),
    }),
    subtasks: z.array(z.object({
        id: z.string(),
        parent_id: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        status: z.string(),
        tool_name: z.string().nullable(),
        priority: z.number(),
        retry_count: z.number(),
        max_retries: z.number(),
        depends_on: z.array(z.string()),
        created_at: z.string(),
    })),
});
// ─── 2. task_next ───
export const TaskNextInput = z.object({
    task_id: z.string().optional().describe('Root task ID; defaults to latest root'),
    mode: z.enum(['executor', 'reviewer']).optional().default('executor')
        .describe('executor: pick pending tasks; reviewer: pick pending_review tasks'),
    include_blocked: z.boolean().optional().default(false),
});
export const TaskNextOutput = z.object({
    next_task: z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        tool_name: z.string().nullable(),
        priority: z.number(),
        status: z.string(),
        depends_on: z.array(z.string()),
        dependencies_met: z.boolean(),
    }).nullable(),
    summary: z.object({
        total: z.number(),
        pending: z.number(),
        in_progress: z.number(),
        pending_review: z.number(),
        completed: z.number(),
        failed: z.number(),
        blocked: z.number(),
        cancelled: z.number(),
    }),
});
// ─── 3. task_update ───
export const TaskUpdateInput = z.object({
    task_id: z.string().describe('Task to update'),
    status: UpdateAction,
    result: z.string().optional().describe('Execution result'),
    error: z.string().optional().describe('Error message'),
    review_comment: z.string().optional().describe('Reviewer feedback (with needs_revision)'),
    tool_name: z.string().optional(),
});
export const TaskUpdateOutput = z.object({
    task: z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        retry_count: z.number(),
    }),
    parent_auto_completed: z.boolean().optional(),
    parent_status: z.string().optional(),
});
// ─── 4. task_reflect ───
export const TaskReflectInput = z.object({
    task_id: z.string().describe('Root or subtask to reflect on'),
    goal: z.string().optional(),
});
export const TaskReflectOutput = z.object({
    task_tree: z.array(z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        result: z.string().nullable(),
        error: z.string().nullable(),
        retry_count: z.number(),
    })),
    summary: z.object({
        total: z.number(),
        completed: z.number(),
        failed: z.number(),
        blocked: z.number(),
        pending_review: z.number(),
        needs_revision: z.number(),
        success_rate: z.number(),
        failed_tasks: z.array(z.string()),
    }),
    suggestions: z.array(z.string()),
});
// ─── 5. task_status ───
export const TaskStatusInput = z.object({
    task_id: z.string().optional().describe('Root task ID; defaults to latest root'),
    format: z.enum(['flat', 'tree']).optional().default('tree'),
});
// ─── 6. tool_register ───
export const ToolRegisterInput = z.object({
    name: z.string().min(1).regex(/^[a-z_][a-z0-9_]*$/).describe('Tool name (snake_case)'),
    description: z.string().min(1).describe('What this tool does'),
    schema: z.string().describe('JSON Schema string of input parameters'),
    provider: z.string().describe('Which MCP server or service provides this'),
    tags: z.array(z.string()).optional().default([]),
});
export const ToolRegisterOutput = z.object({
    name: z.string(),
    description: z.string(),
    provider: z.string(),
    tags: z.array(z.string()),
    created_at: z.string(),
});
// ─── tool_update ───
export const ToolUpdateInput = z.object({
    name: z.string().min(1).regex(/^[a-z_][a-z0-9_]*$/).describe('Tool name to update (snake_case)'),
    description: z.string().min(1).optional().describe('New description'),
    schema: z.string().optional().describe('New JSON Schema string'),
    provider: z.string().optional().describe('New provider'),
    tags: z.array(z.string()).optional().describe('New tags for searchability'),
});
export const ToolUpdateOutput = z.object({
    name: z.string(),
    description: z.string(),
    schema: z.string(),
    provider: z.string(),
    tags: z.array(z.string()),
    created_at: z.string(),
});
// ─── 7. tool_search ───
export const ToolSearchInput = z.object({
    query: z.string().min(1).describe('Natural language search query'),
    limit: z.number().int().min(1).max(50).optional().default(10),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
});
export const ToolSearchOutput = z.object({
    results: z.array(z.object({
        name: z.string(),
        description: z.string(),
        schema: z.string(),
        provider: z.string(),
        tags: z.array(z.string()),
        relevance_score: z.number().min(0).max(1),
    })),
});
// ─── tool_deprecate ───
export const ToolDeprecateInput = z.object({
    name: z.string().min(1).describe('Tool name to deprecate'),
    replacement: z.string().optional().describe('Recommended replacement tool name'),
});
export const ToolDeprecateOutput = z.object({
    name: z.string(),
    description: z.string(),
    schema: z.string(),
    provider: z.string(),
    tags: z.array(z.string()),
    created_at: z.string(),
    replacement: z.string().optional(),
});
// ─── 8. task_export ───
export const TaskExportInput = z.object({
    task_id: z.string().min(1).describe('Root task ID to export'),
    filepath: z.string().optional().default('/tmp/task_export.json')
        .describe('Output file path'),
    format: z.enum(['json', 'csv']).optional().default('json')
        .describe('Export format'),
});
export const TaskExportOutput = z.object({
    exported_to: z.string(),
    task_count: z.number(),
});
// ─── 9. task_import ───
export const TaskImportInput = z.object({
    filepath: z.string().min(1).describe('Path to the JSON file exported by task_export'),
});
export const TaskImportOutput = z.object({
    root_id: z.string().describe('New UUID of the imported root task'),
    imported_count: z.number().describe('Number of tasks imported'),
});
// ─── 10. task_duplicate ───
export const TaskDuplicateInput = z.object({
    task_id: z.string().min(1).describe('ID of the task tree root to duplicate'),
});
export const TaskDuplicateOutput = z.object({
    original_id: z.string().describe('The original task_id that was duplicated'),
    new_root_id: z.string().describe('The new UUID of the duplicated root task'),
    duplicated_count: z.number().describe('Number of tasks cloned (including root)'),
});
// ─── tool_export ───
export const ToolExportInput = z.object({
    filepath: z.string().optional().default('/tmp/tools_export.json')
        .describe('Output file path for the JSON export'),
    include_deprecated: z.boolean().optional().default(false)
        .describe('Whether to include deprecated tools'),
});
export const ToolExportOutput = z.object({
    exported_to: z.string(),
    tool_count: z.number(),
});
// ─── tool_import ───
export const ToolImportInput = z.object({
    filepath: z.string().min(1),
    mode: z.enum(['merge', 'replace']).optional().default('merge'),
});
export const ToolImportOutput = z.object({
    imported: z.number().int(),
    skipped: z.number().int(),
    errors: z.array(z.string()),
});
// ─── 11. task_batch_update ───
export const TaskBatchUpdateInput = z.object({
    task_ids: z.array(z.string()).min(1).describe('Array of task IDs to update'),
    status: UpdateAction,
    result: z.string().optional().describe('Execution result (applied to all)'),
    error: z.string().optional().describe('Error message (applied to all)'),
    review_comment: z.string().optional().describe('Reviewer feedback (with needs_revision)'),
    tool_name: z.string().optional(),
});
export const TaskBatchUpdateOutput = z.object({
    succeeded: z.number().int(),
    failed: z.number().int(),
    failures: z.array(z.object({ id: z.string(), reason: z.string() })),
    cascaded_parent_count: z.number().int().optional(),
});
// ─── MCP response helper ───
export function toMCPResponse(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
