#!/bin/bash
# build-all.sh — Full automated build pipeline for Task Orchestrator
#
# For each feature: Plan → Build → Explore → Score ≥98 → Git commit
# After all features: Integration Review → Fix cross-feature issues → Git commit
#
# Usage:
#   ./build-all.sh                    # Build ALL pending features + integration
#   ./build-all.sh --feature 9        # Build only feature #9
#   ./build-all.sh --phase 2          # Build all features in Phase 2
#   ./build-all.sh --from 9 --to 13   # Build features 9 through 13
#   ./build-all.sh --dry-run          # Show what would be built

set -e

PROJECT_DIR="/home/administrator/task-orchestrator"
DEVLOP="$PROJECT_DIR/../devloop.sh"
ROADMAP="$PROJECT_DIR/ROADMAP.md"
STATE_FILE="/tmp/build-all-state.json"
THRESHOLD=98
MAX_ITERATIONS=10

cd "$PROJECT_DIR"

# ─── Feature Definitions ───
declare -A FEATURES
FEATURES[9]="task_export:Add a task_export MCP tool. Input: task_id (required), filepath (optional, default /tmp/task_export.json), format (json|csv, default json). Logic: recursively walk the task tree, build nested JSON, write to filepath. Return: { exported_to: filepath, task_count: N }. Add to types.ts, new file src/exporter.ts, wire in index.ts."
FEATURES[10]="task_import:Add a task_import MCP tool. Input: filepath (required, JSON file from task_export). Logic: read JSON, validate structure, insert full task tree with new UUIDs, remap parent_id references. Return: { root_id, imported_count: N }. Use the same JSON format as task_export."
FEATURES[11]="task_duplicate:Add a task_duplicate MCP tool. Input: task_id (required). Logic: deep-clone the task tree, generate new UUIDs, remap parent_id and depends_on. Clone gets status=pending (all tasks reset). Return: { original_id, new_root_id, duplicated_count: N }."
FEATURES[12]="task_batch_update:Add a task_batch_update MCP tool. Input: task_ids (string array), status (required), result/error (optional). Logic: apply same update to all tasks, validate each transition. Partial success allowed — report which succeeded and which failed. Return: { succeeded: N, failed: N, failures: [{id, reason}] }."
FEATURES[13]="task_dependency_graph:Add a task_dependency_graph MCP tool. Input: task_id (optional), format (mermaid|ascii|json, default mermaid). Logic: walk tree, build dependency graph. Output valid Mermaid/ASCII/JSON. No changes needed beyond the handler itself."
FEATURES[14]="tool_update:Add a tool_update MCP tool. Input: name (required), description/schema/provider/tags (all optional). Logic: update only provided fields, sync FTS5 if description/tags changed. Return updated tool. Error if not found."
FEATURES[15]="tool_deprecate:Add a tool_deprecate MCP tool. Input: name (required), replacement (optional). Logic: prefix description with [DEPRECATED], remove from FTS5 index. Keep in tools table. Return deprecated tool info."
FEATURES[16]="tool_export:Add a tool_export MCP tool. Input: filepath (optional, default /tmp/tools_export.json), include_deprecated (boolean, default false). Logic: export all non-deprecated tools to JSON. Return: { exported_to: filepath, tool_count: N }."
FEATURES[17]="tool_import:Add a tool_import MCP tool. Input: filepath (required), mode (merge|replace, default merge). Logic: import tools from JSON. Merge: INSERT OR REPLACE. Replace: clear then import. Sync FTS5. Return: { imported: N, skipped: N, errors: [] }."
FEATURES[18]="tool_stats:Add a tool_stats MCP tool. No input. Logic: compute registry stats — total, deprecated, per provider, top tags, recently added. Return stats object. Read-only."
FEATURES[19]="task_audit_log:Add a task_audit_log MCP tool. Requires new SQLite audit_log table (id, task_id, old_status, new_status, changed_by, changed_at, metadata). Add DB trigger: UPDATE on tasks.status → INSERT audit_log. Tool input: task_id (optional), limit (default 50). Return audit entries ordered by changed_at DESC."
FEATURES[20]="task_metrics:Add a task_metrics MCP tool. No input. Logic: aggregate metrics across ALL task trees — total roots, avg completion rate, avg time, most failed titles, avg retries, pending_review vs approved ratio. Return metrics. Read-only."
FEATURES[21]="task_rollback:Add a task_rollback MCP tool. Input: task_id (required). Logic: query audit_log for most recent status change, revert to old_status. Insert audit entry for rollback. Return: { task_id, rolled_back_from, rolled_back_to }."
# Phase 5: Infrastructure Strengthening
FEATURES[22]="task_snapshot:Add a task_snapshot MCP tool. Input: task_id (required), label (optional). Logic: deep-clone the entire task tree state into a new snapshots table (id, task_id, label, tree_json, created_at). The tree_json stores the full recursive task tree as JSON at that point in time. This is Git-like versioning for task trees. Return: { snapshot_id, task_count, created_at }."
FEATURES[23]="system_info:Add a system_info MCP tool. No input required. Logic: query SQLite for database stats — total tasks, total tools, total snapshots, database file size, WAL status, table row counts, server version. Return all stats. Pure infrastructure — proves this is a real database-backed system."
FEATURES[24]="data_integrity_check:Add a data_integrity_check MCP tool. No input required. Logic: scan entire database for orphans, broken refs, inconsistent states. Return: { issues_found, issues: [{type, task_id, description}], healthy: boolean }. Optionally auto-repair with repair=true flag."
FEATURES[25]="task_archive:Add a task_archive MCP tool. Input: task_id (required). Logic: move completed task trees to archived_tasks table. Data lifecycle management. Also add task_archive_list and task_archive_restore."
# Phase 5.5: Model Router Integration
FEATURES[26]="model_classify:Add a model_classify MCP tool. This is a pure rule engine — keyword-based task classification with zero LLM dependency. Copy the classification logic from /mnt/f/auto-model-router/task-rules.json. Input: task_description (string). Logic: match keywords against 8 categories (high_logic, code_generation, creative_writing, info_reading, simple_repeat, image_understanding, image_generation, video_audio). Use weighted keyword matching + input_pattern matching. Return: { category, category_name, confidence (0-1), matched_keywords: [], all_scores: [{category, score}] }. If no match, fallback to 'high_logic'. New file: src/model-router.ts."
FEATURES[27]="model_route:Add a model_route MCP tool. Input: task_description (string), available_models (string array, optional — if empty, use all models from active plan), plan_preset (A|B|C, optional, default 'B'). Logic: 1) Call classify internally 2) Look up category in plan preset config 3) If preferred model in available_models → use it 4) Else try fallback 5) Else use default_fallback. Copy plan configs from /mnt/f/auto-model-router/config/plan-a.json, plan-b.json, plan-c.json — these were updated 2026-05-20 with latest models. Store plan configs in src/config/. Return: { model, category, confidence, reason, estimated_cost_per_1M, plan_used }."
FEATURES[28]="model_config:Add a model_config MCP tool. Input: action (list|switch|set|reset). For list: return current plan + all categories→model mapping + available plans. For switch: switch active plan (A/B/C). For set: override a specific category's model (e.g., set high_logic primary to anthropic/claude-opus-4-7). For reset: reset to plan defaults. Store config in a model_config SQLite table (plan, category, primary_model, fallback_model, updated_at). On first run, seed from plan-b.json (default). Return current config. This is pure CRUD — no LLM."
# Phase 6: Integration (shifted from #26)
FEATURES[29]="integration_review:INTEGRATION CONSISTENCY REVIEW. This is the FINAL combine step. Read ALL source files in /home/administrator/task-orchestrator/src/. Check for: 1) Duplicate function/variable names across files 2) Inconsistent naming patterns 3) All enum values consistent across types.ts and state-machine.ts 4) All tools properly registered in index.ts (import + ListTools + CallTool switch) — should now be 28+ tools 5) No orphaned imports 6) Error handling patterns consistent 7) Model router config files present and valid in src/config/ 8) All Phase 5+5.5 features properly integrated. Fix ALL issues. Build must pass. Score >= 98."
# Phase 7: Deployment Readiness (shifted from #27-29)
FEATURES[30]="e2e_test:Write a comprehensive end-to-end MCP test script at /home/administrator/task-orchestrator/test/test-all.ts. Test ALL tools including model router. Full workflow: task_plan -> model_classify -> model_route -> task_next -> task_update -> task_snapshot -> task_next(mode=reviewer) -> task_update(approved) -> task_reflect -> data_integrity_check -> system_info -> task_archive. Test model_config: list/switch/set/reset. Output PASS/FAIL for each of the 28+ tools. Add npm test command."
FEATURES[31]="documentation:Write README.md at /home/administrator/task-orchestrator/README.md. Must include: 1) Project overview with Infrastructure Moat First + Model Router design philosophy 2) Quick start 3) Full API reference — all 28+ tools 4) State machine diagram 5) Dual-review workflow 6) Model Router section: Plan A/B/C, how to switch, cost savings estimate 7) Architecture section: why SQLite+state machine+FTS5+rule engine cannot be absorbed by model updates 8) How to register in Claude Code and OpenCode."
FEATURES[32]="package_finalization:Finalize for deployment. 1) Update package.json version to 1.0.0, add description, keywords (mcp,task-orchestrator,ai-agent,infrastructure,sqlite,model-router), repository URL 2) Add scripts: test, lint, dev 3) Final npm run build 4) Final review: read ALL files, verify infrastructure moat + model router design principle evident, final score >= 98 5) Write CHANGELOG.md summarizing all 32 features across 7 phases 6) Confirm deploy-ready: git tag v1.0.0"

# ─── Parse args ───
MODE="all"
FEATURE_FROM=""
FEATURE_TO=""
PHASE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --feature) MODE="single"; FEATURE_FROM="$2"; shift 2 ;;
    --phase) MODE="phase"; PHASE="$2"; shift 2 ;;
    --from) MODE="range"; FEATURE_FROM="$2"; shift 2 ;;
    --to) FEATURE_TO="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# ─── Determine feature list ───
get_features() {
  case "$MODE" in
    all)
      for i in $(seq 9 32); do echo $i; done
      ;;
    single)
      echo "$FEATURE_FROM"
      ;;
    phase)
      case "$PHASE" in
        2) seq 9 13 ;;
        3) seq 14 18 ;;
        4) seq 19 21 ;;
        5) seq 22 25 ;;
        5.5|5-5) seq 26 28 ;;
        6) echo 29 ;;
        7) seq 30 32 ;;
        *) echo "Unknown phase: $PHASE. Valid: 2,3,4,5,5.5,6,7"; exit 1 ;;
      esac
      ;;
    range)
      seq "$FEATURE_FROM" "$FEATURE_TO"
      ;;
  esac
}

# ─── Load/save state ───
load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    python3 -c "import json; d=json.load(open('$STATE_FILE')); print(json.dumps(d))" 2>/dev/null || echo '{"completed":[],"current":null}'
  else
    echo '{"completed":[],"current":null}'
  fi
}

save_state() {
  local state="$1"
  echo "$state" > "$STATE_FILE"
}

# ─── Git helpers ───
git_commit_feature() {
  local feature_num="$1"
  local feature_name="$2"
  cd "$PROJECT_DIR"
  git add -A
  git commit -m "feat(#${feature_num}): ${feature_name}

Auto-built via build-all.sh quality loop. Score >= ${THRESHOLD}/100." || echo "  (nothing to commit or commit skipped)"
}

# ─── Initialize git if needed ───
cd "$PROJECT_DIR"
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "Initializing git repository..."
  git init
  git add -A
  git commit -m "initial: Task Orchestrator MCP Server v0.2.0 (features 1-8 done)"
fi

# ─── Main ───
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  TASK ORCHESTRATOR — AUTOMATED BUILD PIPELINE"
echo "  Threshold: $THRESHOLD/100 | Max iterations: $MAX_ITERATIONS"
echo "  Auto-commit: YES | Integration review: YES (feature #22)"
echo "  Mode: $MODE"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Summary tracking ───
SUMMARY_FILE="/tmp/build-all-summary.txt"
echo "FEATURE | NAME | SCORE | ITERATIONS | STATUS | TIME" > "$SUMMARY_FILE"
PIPELINE_START=$(date +%s)

FEATURES_TO_BUILD=$(get_features)
STATE=$(load_state)
COMPLETED=$(echo "$STATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(str(x) for x in d['completed']))" 2>/dev/null || echo "")

echo "Features to build:"
for f in $FEATURES_TO_BUILD; do
  DESC="${FEATURES[$f]}"
  NAME="${DESC%%:*}"
  if echo "$COMPLETED" | grep -q "$f"; then
    echo "  #$f $NAME — ✅ already done"
  elif [[ $f -eq 22 ]]; then
    echo "  #$f $NAME — 🔗 INTEGRATION REVIEW (combine step)"
  else
    echo "  #$f $NAME — ⬜ pending"
  fi
done
echo ""

if $DRY_RUN; then
  echo "Dry run complete. Exiting."
  exit 0
fi

TOTAL=0
SUCCESS=0
FAILED_LIST=""

for f in $FEATURES_TO_BUILD; do
  if echo "$COMPLETED" | grep -q "$f"; then
    continue
  fi

  DESC="${FEATURES[$f]}"
  NAME="${DESC%%:*}"
  TASK_DESC="${DESC#*:}"

  TOTAL=$((TOTAL + 1))

  if [[ $f -eq 29 ]]; then
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  🔗 FEATURE #29: INTEGRATION CONSISTENCY REVIEW"
    echo "  (Combine step — reviewing ALL features together)"
    echo "═══════════════════════════════════════════════════════"
    echo ""
  elif [[ $f -ge 22 ]] && [[ $f -le 25 ]]; then
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  FEATURE #$f: $NAME  🏗️ INFRASTRUCTURE MOAT"
    echo "  ($TOTAL features processed so far)"
    echo "═══════════════════════════════════════════════════════"
    echo ""
  else
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  FEATURE #$f: $NAME"
    echo "  ($TOTAL features processed so far)"
    echo "═══════════════════════════════════════════════════════"
    echo ""
  fi

  STATE=$(python3 -c "import json; d=json.loads('$STATE'); d['current']=$f; print(json.dumps(d))")
  save_state "$STATE"

  echo "Running quality loop..."
  if bash "$DEVLOP" "$TASK_DESC" --threshold "$THRESHOLD" --max-iterations "$MAX_ITERATIONS"; then
    SUCCESS=$((SUCCESS + 1))

    # Git commit after each successful feature
    git_commit_feature "$f" "$NAME"

    echo ""
    # Save summary
LOOP_LOG=$(ls -t /tmp/devloop-*/iter*-review.txt 2>/dev/null | head -1)
F_SCORE=$(grep "Final Score:" "$LOOP_LOG" 2>/dev/null | tail -1 | grep -oP "\d+" | head -1)
F_ITERS=$(grep -c "ITERATION" "$LOOP_LOG" 2>/dev/null || echo "?")
echo "#$f | $NAME | ${F_SCORE:-?}/100 | ${F_ITERS:-?} | PASSED | $(date +%H:%M)" >> "$SUMMARY_FILE"

echo "  ✅ Feature #$f $NAME — PASSED & COMMITTED"

    STATE=$(python3 -c "import json; d=json.loads('$STATE'); d['completed'].append($f); d['current']=None; print(json.dumps(d))")
    save_state "$STATE"
  else
    FAILED_LIST="$FAILED_LIST #$f($NAME)"
    echo ""
    echo "#$f | $NAME | ?/100 | $MAX_ITERATIONS | FAILED | $(date +%H:%M)" >> "$SUMMARY_FILE"
echo "  ❌ Feature #$f $NAME — FAILED"
    echo "  Continuing with next feature..."
  fi
done

# ─── Print Summary Table ───
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  📊 BUILD SUMMARY"
echo "═══════════════════════════════════════════════════════"
if [[ -f "$SUMMARY_FILE" ]]; then
  echo ""
  column -t -s'|' "$SUMMARY_FILE" 2>/dev/null || cat "$SUMMARY_FILE"
  echo ""
fi

# ─── Final Report ───
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  BUILD PIPELINE COMPLETE"
echo "═══════════════════════════════════════════════════════"
echo "  Total features (9-32):      24"
echo "  Total features attempted: $TOTAL"
echo "  Passed (≥${THRESHOLD}/100): $SUCCESS"
echo "  Failed:                  $((TOTAL - SUCCESS))"

if [[ -n "$FAILED_LIST" ]]; then
  echo "  Failed features:$FAILED_LIST"
  echo ""
  echo "  Re-run failed features with:"
  echo "  ./build-all.sh --feature <number>"
fi

echo ""
echo "  Git log:"
git log --oneline -5
echo ""
echo "  State: $STATE_FILE"
echo "═══════════════════════════════════════════════════════"

if [[ $SUCCESS -eq $TOTAL ]]; then
  echo ""
  echo "  🎉 ALL FEATURES PASSED + INTEGRATION REVIEW DONE!"
  echo ""
  # Check if feature 25 is in the completed list
  if echo "$COMPLETED" | grep -q "32" || [[ $f -eq 32 ]]; then
    echo "  🚀 DEPLOYABLE! v1.0.0 is ready."
    echo "  Run: cd ~/task-orchestrator && npm start"
  fi
fi
