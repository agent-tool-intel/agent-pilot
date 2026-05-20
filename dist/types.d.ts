import { z } from 'zod';
export declare const TaskStatus: z.ZodEnum<["pending", "in_progress", "pending_review", "approved", "needs_revision", "completed", "failed", "blocked", "cancelled"]>;
export type TaskStatus = z.infer<typeof TaskStatus>;
export declare const UpdateAction: z.ZodEnum<["in_progress", "pending_review", "approved", "needs_revision", "completed", "failed", "blocked", "cancelled"]>;
export declare const TaskPlanInput: z.ZodObject<{
    goal: z.ZodString;
    subtasks: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        suggested_tool: z.ZodOptional<z.ZodString>;
        priority: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        depends_on: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        priority: number;
        description?: string | undefined;
        suggested_tool?: string | undefined;
        depends_on?: string[] | undefined;
    }, {
        title: string;
        description?: string | undefined;
        suggested_tool?: string | undefined;
        priority?: number | undefined;
        depends_on?: string[] | undefined;
    }>, "many">;
    context: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    goal: string;
    subtasks: {
        title: string;
        priority: number;
        description?: string | undefined;
        suggested_tool?: string | undefined;
        depends_on?: string[] | undefined;
    }[];
    context?: string | undefined;
}, {
    goal: string;
    subtasks: {
        title: string;
        description?: string | undefined;
        suggested_tool?: string | undefined;
        priority?: number | undefined;
        depends_on?: string[] | undefined;
    }[];
    context?: string | undefined;
}>;
export type TaskPlanInput = z.infer<typeof TaskPlanInput>;
export declare const TaskPlanOutput: z.ZodObject<{
    root_task: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        goal: z.ZodString;
        status: z.ZodString;
        priority: z.ZodNumber;
        created_at: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: string;
        goal: string;
        title: string;
        priority: number;
        id: string;
        created_at: string;
    }, {
        status: string;
        goal: string;
        title: string;
        priority: number;
        id: string;
        created_at: string;
    }>;
    subtasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        parent_id: z.ZodString;
        title: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        status: z.ZodString;
        tool_name: z.ZodNullable<z.ZodString>;
        priority: z.ZodNumber;
        retry_count: z.ZodNumber;
        max_retries: z.ZodNumber;
        depends_on: z.ZodArray<z.ZodString, "many">;
        created_at: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: string;
        title: string;
        description: string | null;
        priority: number;
        depends_on: string[];
        id: string;
        created_at: string;
        parent_id: string;
        tool_name: string | null;
        retry_count: number;
        max_retries: number;
    }, {
        status: string;
        title: string;
        description: string | null;
        priority: number;
        depends_on: string[];
        id: string;
        created_at: string;
        parent_id: string;
        tool_name: string | null;
        retry_count: number;
        max_retries: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    subtasks: {
        status: string;
        title: string;
        description: string | null;
        priority: number;
        depends_on: string[];
        id: string;
        created_at: string;
        parent_id: string;
        tool_name: string | null;
        retry_count: number;
        max_retries: number;
    }[];
    root_task: {
        status: string;
        goal: string;
        title: string;
        priority: number;
        id: string;
        created_at: string;
    };
}, {
    subtasks: {
        status: string;
        title: string;
        description: string | null;
        priority: number;
        depends_on: string[];
        id: string;
        created_at: string;
        parent_id: string;
        tool_name: string | null;
        retry_count: number;
        max_retries: number;
    }[];
    root_task: {
        status: string;
        goal: string;
        title: string;
        priority: number;
        id: string;
        created_at: string;
    };
}>;
export declare const TaskNextInput: z.ZodObject<{
    task_id: z.ZodOptional<z.ZodString>;
    mode: z.ZodDefault<z.ZodOptional<z.ZodEnum<["executor", "reviewer"]>>>;
    include_blocked: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    mode: "executor" | "reviewer";
    include_blocked: boolean;
    task_id?: string | undefined;
}, {
    task_id?: string | undefined;
    mode?: "executor" | "reviewer" | undefined;
    include_blocked?: boolean | undefined;
}>;
export type TaskNextInput = z.infer<typeof TaskNextInput>;
export declare const TaskNextOutput: z.ZodObject<{
    next_task: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        tool_name: z.ZodNullable<z.ZodString>;
        priority: z.ZodNumber;
        status: z.ZodString;
        depends_on: z.ZodArray<z.ZodString, "many">;
        dependencies_met: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        status: string;
        title: string;
        description: string | null;
        priority: number;
        depends_on: string[];
        id: string;
        tool_name: string | null;
        dependencies_met: boolean;
    }, {
        status: string;
        title: string;
        description: string | null;
        priority: number;
        depends_on: string[];
        id: string;
        tool_name: string | null;
        dependencies_met: boolean;
    }>>;
    summary: z.ZodObject<{
        total: z.ZodNumber;
        pending: z.ZodNumber;
        in_progress: z.ZodNumber;
        pending_review: z.ZodNumber;
        completed: z.ZodNumber;
        failed: z.ZodNumber;
        blocked: z.ZodNumber;
        cancelled: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        pending: number;
        in_progress: number;
        pending_review: number;
        completed: number;
        failed: number;
        blocked: number;
        cancelled: number;
        total: number;
    }, {
        pending: number;
        in_progress: number;
        pending_review: number;
        completed: number;
        failed: number;
        blocked: number;
        cancelled: number;
        total: number;
    }>;
}, "strip", z.ZodTypeAny, {
    next_task: {
        status: string;
        title: string;
        description: string | null;
        priority: number;
        depends_on: string[];
        id: string;
        tool_name: string | null;
        dependencies_met: boolean;
    } | null;
    summary: {
        pending: number;
        in_progress: number;
        pending_review: number;
        completed: number;
        failed: number;
        blocked: number;
        cancelled: number;
        total: number;
    };
}, {
    next_task: {
        status: string;
        title: string;
        description: string | null;
        priority: number;
        depends_on: string[];
        id: string;
        tool_name: string | null;
        dependencies_met: boolean;
    } | null;
    summary: {
        pending: number;
        in_progress: number;
        pending_review: number;
        completed: number;
        failed: number;
        blocked: number;
        cancelled: number;
        total: number;
    };
}>;
export declare const TaskUpdateInput: z.ZodObject<{
    task_id: z.ZodString;
    status: z.ZodEnum<["in_progress", "pending_review", "approved", "needs_revision", "completed", "failed", "blocked", "cancelled"]>;
    result: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    review_comment: z.ZodOptional<z.ZodString>;
    tool_name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "in_progress" | "pending_review" | "approved" | "needs_revision" | "completed" | "failed" | "blocked" | "cancelled";
    task_id: string;
    tool_name?: string | undefined;
    result?: string | undefined;
    error?: string | undefined;
    review_comment?: string | undefined;
}, {
    status: "in_progress" | "pending_review" | "approved" | "needs_revision" | "completed" | "failed" | "blocked" | "cancelled";
    task_id: string;
    tool_name?: string | undefined;
    result?: string | undefined;
    error?: string | undefined;
    review_comment?: string | undefined;
}>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateInput>;
export declare const TaskUpdateOutput: z.ZodObject<{
    task: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
        retry_count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        status: string;
        title: string;
        id: string;
        retry_count: number;
    }, {
        status: string;
        title: string;
        id: string;
        retry_count: number;
    }>;
    parent_auto_completed: z.ZodOptional<z.ZodBoolean>;
    parent_status: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    task: {
        status: string;
        title: string;
        id: string;
        retry_count: number;
    };
    parent_auto_completed?: boolean | undefined;
    parent_status?: string | undefined;
}, {
    task: {
        status: string;
        title: string;
        id: string;
        retry_count: number;
    };
    parent_auto_completed?: boolean | undefined;
    parent_status?: string | undefined;
}>;
export declare const TaskReflectInput: z.ZodObject<{
    task_id: z.ZodString;
    goal: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    task_id: string;
    goal?: string | undefined;
}, {
    task_id: string;
    goal?: string | undefined;
}>;
export type TaskReflectInput = z.infer<typeof TaskReflectInput>;
export declare const TaskReflectOutput: z.ZodObject<{
    task_tree: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
        result: z.ZodNullable<z.ZodString>;
        error: z.ZodNullable<z.ZodString>;
        retry_count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        status: string;
        title: string;
        id: string;
        retry_count: number;
        result: string | null;
        error: string | null;
    }, {
        status: string;
        title: string;
        id: string;
        retry_count: number;
        result: string | null;
        error: string | null;
    }>, "many">;
    summary: z.ZodObject<{
        total: z.ZodNumber;
        completed: z.ZodNumber;
        failed: z.ZodNumber;
        blocked: z.ZodNumber;
        pending_review: z.ZodNumber;
        needs_revision: z.ZodNumber;
        success_rate: z.ZodNumber;
        failed_tasks: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        pending_review: number;
        needs_revision: number;
        completed: number;
        failed: number;
        blocked: number;
        total: number;
        success_rate: number;
        failed_tasks: string[];
    }, {
        pending_review: number;
        needs_revision: number;
        completed: number;
        failed: number;
        blocked: number;
        total: number;
        success_rate: number;
        failed_tasks: string[];
    }>;
    suggestions: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    summary: {
        pending_review: number;
        needs_revision: number;
        completed: number;
        failed: number;
        blocked: number;
        total: number;
        success_rate: number;
        failed_tasks: string[];
    };
    task_tree: {
        status: string;
        title: string;
        id: string;
        retry_count: number;
        result: string | null;
        error: string | null;
    }[];
    suggestions: string[];
}, {
    summary: {
        pending_review: number;
        needs_revision: number;
        completed: number;
        failed: number;
        blocked: number;
        total: number;
        success_rate: number;
        failed_tasks: string[];
    };
    task_tree: {
        status: string;
        title: string;
        id: string;
        retry_count: number;
        result: string | null;
        error: string | null;
    }[];
    suggestions: string[];
}>;
export declare const TaskStatusInput: z.ZodObject<{
    task_id: z.ZodOptional<z.ZodString>;
    format: z.ZodDefault<z.ZodOptional<z.ZodEnum<["flat", "tree"]>>>;
}, "strip", z.ZodTypeAny, {
    format: "flat" | "tree";
    task_id?: string | undefined;
}, {
    task_id?: string | undefined;
    format?: "flat" | "tree" | undefined;
}>;
export type TaskStatusInput = z.infer<typeof TaskStatusInput>;
export declare const ToolRegisterInput: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    schema: z.ZodString;
    provider: z.ZodString;
    tags: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    description: string;
    name: string;
    schema: string;
    provider: string;
    tags: string[];
}, {
    description: string;
    name: string;
    schema: string;
    provider: string;
    tags?: string[] | undefined;
}>;
export type ToolRegisterInput = z.infer<typeof ToolRegisterInput>;
export declare const ToolRegisterOutput: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    provider: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    description: string;
    created_at: string;
    name: string;
    provider: string;
    tags: string[];
}, {
    description: string;
    created_at: string;
    name: string;
    provider: string;
    tags: string[];
}>;
export declare const ToolUpdateInput: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    schema: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
    schema?: string | undefined;
    provider?: string | undefined;
    tags?: string[] | undefined;
}, {
    name: string;
    description?: string | undefined;
    schema?: string | undefined;
    provider?: string | undefined;
    tags?: string[] | undefined;
}>;
export type ToolUpdateInput = z.infer<typeof ToolUpdateInput>;
export declare const ToolUpdateOutput: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    schema: z.ZodString;
    provider: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    description: string;
    created_at: string;
    name: string;
    schema: string;
    provider: string;
    tags: string[];
}, {
    description: string;
    created_at: string;
    name: string;
    schema: string;
    provider: string;
    tags: string[];
}>;
export type ToolUpdateOutput = z.infer<typeof ToolUpdateOutput>;
export declare const ToolSearchInput: z.ZodObject<{
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    query: string;
    limit: number;
    tags?: string[] | undefined;
}, {
    query: string;
    tags?: string[] | undefined;
    limit?: number | undefined;
}>;
export type ToolSearchInput = z.infer<typeof ToolSearchInput>;
export declare const ToolSearchOutput: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        schema: z.ZodString;
        provider: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        relevance_score: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        description: string;
        name: string;
        schema: string;
        provider: string;
        tags: string[];
        relevance_score: number;
    }, {
        description: string;
        name: string;
        schema: string;
        provider: string;
        tags: string[];
        relevance_score: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    results: {
        description: string;
        name: string;
        schema: string;
        provider: string;
        tags: string[];
        relevance_score: number;
    }[];
}, {
    results: {
        description: string;
        name: string;
        schema: string;
        provider: string;
        tags: string[];
        relevance_score: number;
    }[];
}>;
export declare const ToolDeprecateInput: z.ZodObject<{
    name: z.ZodString;
    replacement: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    replacement?: string | undefined;
}, {
    name: string;
    replacement?: string | undefined;
}>;
export type ToolDeprecateInput = z.infer<typeof ToolDeprecateInput>;
export declare const ToolDeprecateOutput: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    schema: z.ZodString;
    provider: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    created_at: z.ZodString;
    replacement: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    created_at: string;
    name: string;
    schema: string;
    provider: string;
    tags: string[];
    replacement?: string | undefined;
}, {
    description: string;
    created_at: string;
    name: string;
    schema: string;
    provider: string;
    tags: string[];
    replacement?: string | undefined;
}>;
export type ToolDeprecateOutput = z.infer<typeof ToolDeprecateOutput>;
export declare const TaskExportInput: z.ZodObject<{
    task_id: z.ZodString;
    filepath: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    format: z.ZodDefault<z.ZodOptional<z.ZodEnum<["json", "csv"]>>>;
}, "strip", z.ZodTypeAny, {
    task_id: string;
    format: "json" | "csv";
    filepath: string;
}, {
    task_id: string;
    format?: "json" | "csv" | undefined;
    filepath?: string | undefined;
}>;
export type TaskExportInput = z.infer<typeof TaskExportInput>;
export declare const TaskExportOutput: z.ZodObject<{
    exported_to: z.ZodString;
    task_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    exported_to: string;
    task_count: number;
}, {
    exported_to: string;
    task_count: number;
}>;
export type TaskExportOutput = z.infer<typeof TaskExportOutput>;
export declare const TaskImportInput: z.ZodObject<{
    filepath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    filepath: string;
}, {
    filepath: string;
}>;
export type TaskImportInput = z.infer<typeof TaskImportInput>;
export declare const TaskImportOutput: z.ZodObject<{
    root_id: z.ZodString;
    imported_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    root_id: string;
    imported_count: number;
}, {
    root_id: string;
    imported_count: number;
}>;
export type TaskImportOutput = z.infer<typeof TaskImportOutput>;
export declare const TaskDuplicateInput: z.ZodObject<{
    task_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    task_id: string;
}, {
    task_id: string;
}>;
export declare const TaskDuplicateOutput: z.ZodObject<{
    original_id: z.ZodString;
    new_root_id: z.ZodString;
    duplicated_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    original_id: string;
    new_root_id: string;
    duplicated_count: number;
}, {
    original_id: string;
    new_root_id: string;
    duplicated_count: number;
}>;
export declare const ToolExportInput: z.ZodObject<{
    filepath: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    include_deprecated: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    filepath: string;
    include_deprecated: boolean;
}, {
    filepath?: string | undefined;
    include_deprecated?: boolean | undefined;
}>;
export type ToolExportInput = z.infer<typeof ToolExportInput>;
export declare const ToolExportOutput: z.ZodObject<{
    exported_to: z.ZodString;
    tool_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    exported_to: string;
    tool_count: number;
}, {
    exported_to: string;
    tool_count: number;
}>;
export type ToolExportOutput = z.infer<typeof ToolExportOutput>;
export declare const ToolImportInput: z.ZodObject<{
    filepath: z.ZodString;
    mode: z.ZodDefault<z.ZodOptional<z.ZodEnum<["merge", "replace"]>>>;
}, "strip", z.ZodTypeAny, {
    mode: "merge" | "replace";
    filepath: string;
}, {
    filepath: string;
    mode?: "merge" | "replace" | undefined;
}>;
export type ToolImportInput = z.infer<typeof ToolImportInput>;
export declare const ToolImportOutput: z.ZodObject<{
    imported: z.ZodNumber;
    skipped: z.ZodNumber;
    errors: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    imported: number;
    skipped: number;
    errors: string[];
}, {
    imported: number;
    skipped: number;
    errors: string[];
}>;
export type ToolImportOutput = z.infer<typeof ToolImportOutput>;
export interface ToolImportEntry {
    name: string;
    description: string;
    schema: string;
    provider: string;
    tags?: string[];
    created_at?: string;
}
export declare const TaskBatchUpdateInput: z.ZodObject<{
    task_ids: z.ZodArray<z.ZodString, "many">;
    status: z.ZodEnum<["in_progress", "pending_review", "approved", "needs_revision", "completed", "failed", "blocked", "cancelled"]>;
    result: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    review_comment: z.ZodOptional<z.ZodString>;
    tool_name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "in_progress" | "pending_review" | "approved" | "needs_revision" | "completed" | "failed" | "blocked" | "cancelled";
    task_ids: string[];
    tool_name?: string | undefined;
    result?: string | undefined;
    error?: string | undefined;
    review_comment?: string | undefined;
}, {
    status: "in_progress" | "pending_review" | "approved" | "needs_revision" | "completed" | "failed" | "blocked" | "cancelled";
    task_ids: string[];
    tool_name?: string | undefined;
    result?: string | undefined;
    error?: string | undefined;
    review_comment?: string | undefined;
}>;
export type TaskBatchUpdateInput = z.infer<typeof TaskBatchUpdateInput>;
export declare const TaskBatchUpdateOutput: z.ZodObject<{
    succeeded: z.ZodNumber;
    failed: z.ZodNumber;
    failures: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        reason: string;
    }, {
        id: string;
        reason: string;
    }>, "many">;
    cascaded_parent_count: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    failed: number;
    succeeded: number;
    failures: {
        id: string;
        reason: string;
    }[];
    cascaded_parent_count?: number | undefined;
}, {
    failed: number;
    succeeded: number;
    failures: {
        id: string;
        reason: string;
    }[];
    cascaded_parent_count?: number | undefined;
}>;
export type TaskBatchUpdateOutput = z.infer<typeof TaskBatchUpdateOutput>;
export declare const ToolStatsOutput: z.ZodObject<{
    total: z.ZodNumber;
    deprecated: z.ZodNumber;
    active: z.ZodNumber;
    per_provider: z.ZodArray<z.ZodObject<{
        provider: z.ZodString;
        count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        provider: string;
        count: number;
    }, {
        provider: string;
        count: number;
    }>, "many">;
    top_tags: z.ZodArray<z.ZodObject<{
        tag: z.ZodString;
        count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        count: number;
        tag: string;
    }, {
        count: number;
        tag: string;
    }>, "many">;
    recently_added: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        provider: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        created_at: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        created_at: string;
        name: string;
        provider: string;
        tags: string[];
    }, {
        created_at: string;
        name: string;
        provider: string;
        tags: string[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    total: number;
    deprecated: number;
    active: number;
    per_provider: {
        provider: string;
        count: number;
    }[];
    top_tags: {
        count: number;
        tag: string;
    }[];
    recently_added: {
        created_at: string;
        name: string;
        provider: string;
        tags: string[];
    }[];
}, {
    total: number;
    deprecated: number;
    active: number;
    per_provider: {
        provider: string;
        count: number;
    }[];
    top_tags: {
        count: number;
        tag: string;
    }[];
    recently_added: {
        created_at: string;
        name: string;
        provider: string;
        tags: string[];
    }[];
}>;
export type ToolStatsOutput = z.infer<typeof ToolStatsOutput>;
export declare const TaskMetricsOutput: z.ZodObject<{
    total_roots: z.ZodNumber;
    total_tasks: z.ZodNumber;
    avg_completion_rate: z.ZodNullable<z.ZodNumber>;
    avg_completion_time_days: z.ZodNullable<z.ZodNumber>;
    most_failed_titles: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        failures: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        title: string;
        failures: number;
    }, {
        title: string;
        failures: number;
    }>, "many">;
    avg_retries: z.ZodNumber;
    pending_review_count: z.ZodNumber;
    approved_count: z.ZodNumber;
    pending_review_vs_approved_ratio: z.ZodNullable<z.ZodNumber>;
    status_breakdown: z.ZodArray<z.ZodObject<{
        status: z.ZodString;
        count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        status: string;
        count: number;
    }, {
        status: string;
        count: number;
    }>, "many">;
    tree_count: z.ZodNumber;
    tree_summary: z.ZodObject<{
        avg_tree_size: z.ZodNumber;
        total_failed: z.ZodNumber;
        total_completed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        avg_tree_size: number;
        total_failed: number;
        total_completed: number;
    }, {
        avg_tree_size: number;
        total_failed: number;
        total_completed: number;
    }>;
}, "strip", z.ZodTypeAny, {
    total_roots: number;
    total_tasks: number;
    avg_completion_rate: number | null;
    avg_completion_time_days: number | null;
    most_failed_titles: {
        title: string;
        failures: number;
    }[];
    avg_retries: number;
    pending_review_count: number;
    approved_count: number;
    pending_review_vs_approved_ratio: number | null;
    status_breakdown: {
        status: string;
        count: number;
    }[];
    tree_count: number;
    tree_summary: {
        avg_tree_size: number;
        total_failed: number;
        total_completed: number;
    };
}, {
    total_roots: number;
    total_tasks: number;
    avg_completion_rate: number | null;
    avg_completion_time_days: number | null;
    most_failed_titles: {
        title: string;
        failures: number;
    }[];
    avg_retries: number;
    pending_review_count: number;
    approved_count: number;
    pending_review_vs_approved_ratio: number | null;
    status_breakdown: {
        status: string;
        count: number;
    }[];
    tree_count: number;
    tree_summary: {
        avg_tree_size: number;
        total_failed: number;
        total_completed: number;
    };
}>;
export type TaskMetricsOutput = z.infer<typeof TaskMetricsOutput>;
export declare const TaskRollbackInput: z.ZodObject<{
    task_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    task_id: string;
}, {
    task_id: string;
}>;
export type TaskRollbackInput = z.infer<typeof TaskRollbackInput>;
export declare const TaskRollbackOutput: z.ZodObject<{
    task_id: z.ZodString;
    rolled_back_from: z.ZodString;
    rolled_back_to: z.ZodString;
}, "strip", z.ZodTypeAny, {
    task_id: string;
    rolled_back_from: string;
    rolled_back_to: string;
}, {
    task_id: string;
    rolled_back_from: string;
    rolled_back_to: string;
}>;
export type TaskRollbackOutput = z.infer<typeof TaskRollbackOutput>;
export interface TaskRow {
    id: string;
    parent_id: string | null;
    title: string;
    description: string | null;
    goal: string | null;
    status: string;
    tool_name: string | null;
    result: string | null;
    error: string | null;
    review_comment: string | null;
    priority: number;
    retry_count: number;
    max_retries: number;
    depends_on: string;
    created_at: string;
    updated_at: string;
}
export interface ToolRow {
    name: string;
    description: string;
    schema: string;
    provider: string;
    tags: string;
    created_at: string;
    relevance_score?: number;
}
export declare const TaskAuditLogInput: z.ZodObject<{
    task_id: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    task_id?: string | undefined;
}, {
    task_id?: string | undefined;
    limit?: number | undefined;
}>;
export type TaskAuditLogInput = z.infer<typeof TaskAuditLogInput>;
export declare const TaskAuditLogOutput: z.ZodObject<{
    entries: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        task_id: z.ZodString;
        old_status: z.ZodNullable<z.ZodString>;
        new_status: z.ZodString;
        changed_by: z.ZodString;
        changed_at: z.ZodString;
        metadata: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        task_id: string;
        old_status: string | null;
        new_status: string;
        changed_by: string;
        changed_at: string;
        metadata: string | null;
    }, {
        id: string;
        task_id: string;
        old_status: string | null;
        new_status: string;
        changed_by: string;
        changed_at: string;
        metadata: string | null;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    entries: {
        id: string;
        task_id: string;
        old_status: string | null;
        new_status: string;
        changed_by: string;
        changed_at: string;
        metadata: string | null;
    }[];
}, {
    entries: {
        id: string;
        task_id: string;
        old_status: string | null;
        new_status: string;
        changed_by: string;
        changed_at: string;
        metadata: string | null;
    }[];
}>;
export interface AuditLogRow {
    id: string;
    task_id: string;
    old_status: string | null;
    new_status: string;
    changed_by: string;
    changed_at: string;
    metadata: string | null;
}
export declare const TaskSnapshotInput: z.ZodObject<{
    task_id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    task_id: string;
    label?: string | undefined;
}, {
    task_id: string;
    label?: string | undefined;
}>;
export type TaskSnapshotInput = z.infer<typeof TaskSnapshotInput>;
export declare const TaskSnapshotOutput: z.ZodObject<{
    snapshot_id: z.ZodString;
    task_count: z.ZodNumber;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    created_at: string;
    task_count: number;
    snapshot_id: string;
}, {
    created_at: string;
    task_count: number;
    snapshot_id: string;
}>;
export type TaskSnapshotOutput = z.infer<typeof TaskSnapshotOutput>;
export declare function toMCPResponse(data: unknown, isError?: boolean): {
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
};
