# AgentPilot — Universal MCP Agent Infrastructure

> Stateful task engine + AI-native tool registry + execution. Part of the Agent Tool Platform.

[![Powered by Agent Tool Intel](https://img.shields.io/badge/powered%20by-Agent%20Tool%20Intel-7c9ff5)](https://agent-tool-intel-production.up.railway.app)

AgentPilot is an MCP (Model Context Protocol) server that gives AI agents persistent, auditable task infrastructure: task trees in SQLite, deterministic state machine, tool registry with semantic search integration, and autonomous execution capability.

---

## 🗺️ Part of the Agent Tool Platform

| Module | What it does | Status |
|--------|-------------|:---:|
| [**Agent Tool Intel**](https://github.com/agent-tool-intel/agent-tool-intel) | Quality scoring + search + trust for MCP tools | ✅ |
| **AgentPilot** ← you are here | Task orchestration + tool registry + execution | ✅ |
| AutoMine | Automated tool discovery from content | 🔧 |

All three share a unified **Canonical ID** system: `tool:{source}:{namespace}/{name}@version`

---

## Quick Start

```bash
git clone https://github.com/agent-tool-intel/agent-pilot.git
cd agent-pilot
npm install
npm run build
npm start
```

Runs on stdio. Auto-creates SQLite database on first launch.

---

## Architecture

```
Agent request → State Machine → Task Tree → Tool Registry → Execute → Feedback
                   │                │            │
                   ▼                ▼            ▼
              SQLite DB        FTS Search    Agent Tool Intel API
              (sql.js)         (LIKE)        (quality scores)
```

### Key Components

- **State Machine** — Deterministic task state transitions (pending → in-progress → done/failed)
- **Task Trees** — Parent/child task hierarchy with dependency tracking
- **Tool Registry** — Persistent tool store with canonical IDs and Agent Tool Intel integration
- **Model Router** — Zero-LLM rule engine for task-to-model routing
- **Audit Log** — Full state change tracking with timestamps

---

## Features

- 30 MCP tools for task orchestration
- SQLite-backed persistence (sql.js — pure JS, no native deps)
- FTS-based tool search
- Automated task status transitions
- Snapshot/restore for task trees
- Archival system for completed tasks
- Model configuration per task category
- Batch task operations

---

## Integration

AgentPilot integrates with [Agent Tool Intel](https://github.com/agent-tool-intel/agent-tool-intel) for:
- Tool quality scoring
- Semantic tool search
- Execution analytics tracking

---

## License

MIT
