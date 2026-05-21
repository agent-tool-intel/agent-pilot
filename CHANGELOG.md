# Changelog

## v1.0.0 (2026-05-22)

### Phase 1: Core Engine (#1-7)

- **`task_plan`** — Goal storage and subtask tree creation in SQLite. Subtasks with `depends_on` start as `blocked`. Returns root + subtasks with IDs, priorities, and retry metadata.
- **`task_next`** — Dual-mode next-action picker: `executor` picks highest-priority pending task with dependencies met; `reviewer` picks `pending_review` tasks. Optional `include_blocked` flag.
- **`task_update`** — State transition engine enforcing 9 states and 17 valid transitions via Zod + state machine. Auto-cascades parent completion recursively up the tree when all siblings done.
- **`task_reflect`** — Heuristic execution history and suggestion engine. Returns task tree, summary (completion rate, failures, blocked), and actionable suggestions. Zero LLM — pure SQL queries + rule-based thresholds.
- **`task_status`** — Flat or recursive tree task viewer. Tree format uses recursive CTE for efficient nested traversal. Defaults to latest root.
- **`tool_register`** — AI-native tool registry with FTS5 sync. Stores tool name, description, schema, provider, and tags. Upsert on duplicate.
- **`tool_search`** — Full-text search via FTS5 with BM25 relevance ranking and tag filtering. Falls back to LIKE if FTS5 unavailable. Returns normalized relevance scores.

### Phase 2: Task Lifecycle (#8-13)

- **`task_cancel`** — Cancel task with optional cascade to descendants. Only cancellable: `pending`, `in_progress`, `failed`, `blocked`. Stores reason. Reports cascaded count.
- **`task_export`** — Recursive task tree export to JSON (nested tree) or CSV (flat rows). Auto-creates parent directories. Counts total tasks exported.
- **`task_import`** — Transactional JSON import with full ID remapping. Re-maps all `parent_id` and `depends_on` references. Returns new root ID and imported count.
- **`task_duplicate`** — Deep-clone task tree with new UUIDs, reset all statuses to `pending`. Preserves tree structure and dependency relationships.
- **`task_batch_update`** — Multi-task transition with partial success. Validates each transition individually, reports per-task failures. Optional parent auto-cascade.
- **`task_dependency_graph`** — Dependency visualization in Mermaid flowchart, ASCII tree, or structured JSON (nodes + edges). Recursive tree walk with edge construction.

### Phase 3: Tool Registry Enhancement (#14-18)

- **`tool_update`** — Partial metadata update with FTS5 re-sync. Updates only provided fields. Automatically re-indexes on description/tag changes.
- **`tool_deprecate`** — Deprecation with `[DEPRECATED]` prefix and FTS5 removal. Data preserved in `tools` table. Optional replacement tool suggestion.
- **`tool_export`** — Bulk tool registry export to JSON with optional deprecated tool inclusion. Counts exported tools.
- **`tool_import`** — Bulk tool import with `merge` (upsert) or `replace` (clear then import) modes. Syncs FTS5 after import. Reports imported, skipped, and errors.
- **`tool_stats`** — Registry statistics: total/deprecated/active counts, per-provider breakdown, top tags, recently added tools. Read-only.

### Phase 4: Quality & Accountability (#19-21)

- **`task_audit_log`** — Automatic status change history via SQLite trigger (`AFTER UPDATE OF status ON tasks`). Queryable by task_id or globally with pagination. Records old/new status, timestamps.
- **`task_metrics`** — Aggregate cross-tree metrics: total roots, total tasks, status breakdown, avg completion rate, avg time, most failed titles, avg retries, pending_review vs approved ratio, tree summary. Read-only.
- **`task_rollback`** — Status revert using most recent audit log entry. Cannot rollback terminal states (`completed`, `cancelled`). Inserts rollback audit entry for traceability.

### Phase 5: Data Lifecycle (#22-25)

- **`task_snapshot`** — Point-in-time task tree snapshot for Git-like versioning. Stores full recursive JSON in `snapshots` table. Optional label (e.g. "v1.0", "before-refactor").
- **`system_info`** — Database introspection: table row counts, database file size, WAL status, journal mode, checkpoint pages. Server name and version. Read-only.
- **`data_integrity_check`** — 10-category integrity scan: invalid statuses, orphan parents, broken depends_on refs, circular dependencies, retry overflow, orphan snapshots, orphan audit entries, archived table integrity, orphan model_config, orphan tasks. Optional auto-repair mode.
- **`task_archive` / `task_archive_list` / `task_archive_restore`** — Full archive lifecycle. Moves completed trees to `archived_tasks` table, cleans up snapshots + audit log + depends_on refs. Cascade required for non-leaf nodes. Paginated listing with status filter. Restoration with ID conflict detection.

### Phase 5.5: Model Router (#26-28)

- **`model_classify`** — Zero-LLM keyword-based classification into 8 categories: `high_logic`, `code_generation`, `creative_writing`, `info_reading`, `simple_repeat`, `image_understanding`, `image_generation`, `video_audio`. Weighted keyword matching + input pattern matching + output type matching. Returns category, confidence (0-1), matched keywords, and all 8 category scores. Fallback to `high_logic` on low confidence.
- **`model_route`** — Plan-based model selection with fallback chain. Classifies internally, then matches against available models using active plan preset (A/B/C). Falls back: preferred -> fallback -> default_fallback. Returns model ID, routing reason, and estimated cost per 1M tokens.
- **`model_config`** — CRUD management of routing configuration. Actions: `list` (active plan + category mappings + available plans), `switch` (change active plan A/B/C), `set` (override category's model pair), `reset` (restore plan defaults). Plans stored in SQLite `model_config` table, seeded from `plan-b.json` on first run. Pure CRUD — no LLM.

### Phase 6: Integration (#29)

- Cross-feature consistency review: naming conventions unified, TypeScript types checked, enum values consistent, all tools properly registered in `index.ts` (imports + ListTools + CallTool switch), no orphaned imports, error handling patterns consistent, model router config files validated, all Phase 5+5.5 features integrated.

### Phase 7: Deployment Readiness (#30-32)

- **E2E test suite** (905 lines, 40+ tests): Full workflow coverage (plan -> classify -> route -> execute -> review -> approve -> reflect -> check -> info -> archive). Model config CRUD (list/switch/set/reset). Tool registry CRUD (register/search/update/deprecate/stats). Tool export/import. Task utilities (status/export/import/duplicate/batch/dependency graph). Audit log, metrics, rollback, cancel, archive lifecycle. Edge-case error handling.
- **README.md** with Infrastructure Moat First design philosophy, quick start, full API reference (28+ tools), state machine diagram (Mermaid), dual-review workflow, Model Router section (Plans A/B/C with cost analysis), architecture rationale (SQLite, state machine, FTS5, rule engine), Claude Code and OpenCode registration.
- **Package finalization**: version 1.0.0, npm metadata (description, keywords, repository, license), build/lint/test/dev scripts, verified build, git tag v1.0.0.
