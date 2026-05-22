# AgentPilot MCP Server — Full Roadmap v3

## Design Principle: Infrastructure Moat First
> Based on competitive research (2026-05-20): Model-layer features get absorbed by Anthropic/OpenAI within 6 months. Infrastructure-layer features (persistent state, database, state machine) are structurally defensible. **All features must be infrastructure-heavy, model-independent. No embedded LLM.**

---

## Phase 1: Core Engine ✅ DONE
| # | Feature | Status | Moat |
|---|---------|--------|------|
| 1 | task_plan — goal storage | ✅ done | 🟢 Storage |
| 2 | task_next — next action picker | ✅ done | 🟢 State Machine |
| 3 | task_update — state transitions | ✅ done | 🟢 State Machine |
| 4 | task_reflect — execution history | ✅ done | 🟢 Data Query |
| 5 | task_status — tree viewer | ✅ done | 🟢 Data Query |
| 6 | tool_register — tool registry add | ✅ done | 🟢 Registry |
| 7 | tool_search — FTS5 search | ✅ done | 🟢 Registry |

## Phase 2: Task Lifecycle
| # | Feature | Status | Moat |
|---|---------|--------|------|
| 8 | task_cancel — cancel with cascade | ✅ done | 🟢 State Machine |
| 9 | task_export — export task tree to JSON file | ✅ done | 🟢 Data Portability |
| 10 | task_import — import task tree from JSON file | ✅ done | 🟢 Data Portability |
| 11 | task_duplicate — clone existing task tree | ✅ done | 🟢 Data Operations |
| 12 | task_batch_update — update multiple tasks | ✅ done | 🟢 State Machine |
| 13 | task_dependency_graph — visual dep tree (Mermaid/ASCII) | ✅ done | 🟢 Data Query |

## Phase 3: Tool Registry Enhancement
| # | Feature | Status | Moat |
|---|---------|--------|------|
| 14 | tool_update — update tool metadata | ✅ done | 🟢 Registry |
| 15 | tool_deprecate — deprecate/remove tools | ✅ done | 🟢 Registry |
| 16 | tool_export — export all tools to JSON | ✅ done | 🟢 Data Portability |
| 17 | tool_import — bulk import tools from JSON | ✅ done | 🟢 Data Portability |
| 18 | tool_stats — registry statistics | ✅ done | 🟢 Data Query |

## Phase 4: Quality & Accountability
| # | Feature | Status | Moat |
|---|---------|--------|------|
| 19 | task_audit_log — full state change history (SQLite triggers) | ✅ done | 🟢🟢 Strong |
| 20 | task_metrics — aggregate stats across all task trees | ✅ done | 🟢 Data Query |
| 21 | task_rollback — revert task to previous state via audit log | ✅ done | 🟢🟢 Strong |

## Phase 5: Data Lifecycle
| # | Feature | Status | Moat |
|---|---------|--------|------|
| 22 | task_snapshot — point-in-time task tree snapshot | ✅ done | 🟢🟢 Strong |
| 23 | system_info — database introspection | ✅ done | 🟢 Data Query |
| 24 | data_integrity_check — 10-category scan with auto-repair | ✅ done | 🟢🟢 Strong |
| 25 | task_archive / task_archive_list / task_archive_restore — full archive lifecycle | ✅ done | 🟢🟢 Strong |

## Phase 5.5: Model Router Integration 🆕
| # | Feature | Status | Moat |
|---|---------|--------|------|
| 26 | model_classify — classify task into 8 categories via keyword matching | ✅ done | 🟢🟢 Rule Engine |
| 27 | model_route — route task to best model based on Plan A/B/C + available models | ✅ done | 🟢🟢 Rule Engine |
| 28 | model_config — manage model presets, switch plans, add custom models | ✅ done | 🟢 Config Storage |

## Phase 6: Integration (shifted)
| # | Feature | Status | Moat |
|---|---------|--------|------|
| 29 | Integration consistency review — read ALL code, fix cross-feature issues | ✅ done | — |

## Phase 7: Deployment Readiness (shifted)
| # | Feature | Status | Moat |
|---|---------|--------|------|
| 30 | E2E MCP test — register server, call every tool, verify responses | ✅ done | — |
| 31 | Documentation — README.md with all tools, examples, setup, design philosophy | ✅ done | — |
| 32 | Package finalization — version bump to 1.0.0, final build, git tag, deploy ready | ✅ done | — |

---

## ❌ CANCELLED: Option B — Embedded LLM
| Feature | Reason |
|---------|--------|
| task_autoplan (LLM-based decomposition) | Model-layer feature — would be absorbed by Anthropic within 6 months |
| task_autoreflect (LLM-based reflection) | Same — Claude already has native reasoning |
| Any embedded LLM integration | Violates "Infrastructure Moat First" principle |

**The server's value is SQLite + state machine + FTS5 + rule engine — not LLM reasoning.** AI agents bring their own intelligence. The server provides persistent, reliable, auditable infrastructure that no model upgrade can replace.

---

Progress: 32/32 (100%)
Target score per feature: 98/100
Max iterations per feature: 10
Auto-commit after each feature: YES
Deployable after: Feature #32
Design principle: Infrastructure Moat First
Model Router: Plan A (International), Plan B (China), Plan C (GLM Lazy) — all updated May 2026
