# HYBRID Orchestration Implementation Plan

## Overview

This document outlines the implementation of HYBRID orchestration for DevFlow - a system that combines CodeMachine's provider registry, VC/Beads' issue-oriented execution, and DevFlow's rich UI with concurrent execution capabilities.

## Current State (Baseline)

### Already Implemented ✅

| Component              | Location                                        | Status                               |
| ---------------------- | ----------------------------------------------- | ------------------------------------ |
| Provider Architecture  | `apps/server/src/providers/`                    | Claude only, extensible              |
| ProviderFactory        | `apps/server/src/providers/provider-factory.ts` | Ready for multi-provider             |
| BaseProvider Interface | `apps/server/src/providers/base-provider.ts`    | Abstract base class defined          |
| AutoModeService        | `apps/server/src/services/auto-mode-service.ts` | Full feature execution               |
| Worktree Management    | `apps/server/src/lib/worktree-metadata.ts`      | Isolated concurrent work             |
| Planning Modes         | `auto-mode-service.ts:28-206`                   | skip/lite/spec/full with multi-agent |
| Checkpoint/Resume      | `auto-mode-service.ts:668-695`                  | Basic session persistence            |
| Beads Integration      | `apps/server/src/services/beads-service.ts`     | Task tracking                        |
| ReviewWatcherService   | `apps/server/src/services/review-watcher.ts`    | Framework with MCP placeholders      |
| Event System           | `apps/server/src/lib/events.ts`                 | Real-time coordination               |

### Implementation Gaps ❌

| Milestone | Gap                                     | Priority |
| --------- | --------------------------------------- | -------- |
| M1        | Additional providers (Cursor, OpenCode) | P0       |
| M1        | Agent monitoring with PID tracking      | P0       |
| M1        | Telemetry collection                    | P1       |
| M2        | Cross-feature dependency resolution     | P1       |
| M3        | Cross-agent checkpoint coordination     | P1       |
| M4        | Specialized worker agents               | P2       |
| M5        | VibeKanban MCP implementation           | P0       |

## Implementation Roadmap

### Milestone 1: Multi-Provider Foundation (P0)

**Goal:** Enable execution through multiple AI providers beyond Claude.

#### Tasks

1. **Research Multi-Provider Support** (`223ca287-e67f-4b0c-9c32-17ef2c4f2806`)
   - Document Cursor CLI capabilities
   - Document OpenCode SDK patterns
   - Define provider capability detection interface
   - Output: `docs/multi-provider-research.md`

2. **Implement Cursor Provider** (`7024ed3e-58a2-4f53-9101-de6efe2e5908`)
   - Create `apps/server/src/providers/cursor-provider.ts`
   - Extend `BaseProvider` class
   - Add to `ProviderFactory` routing
   - Implement auth cache integration

3. **Implement Agent Monitor Service** (`4c9549b5-49b6-4a27-8a4f-908f3f439298`)
   - Create `apps/server/src/services/agent-monitor-service.ts`
   - PID tracking for all running agents
   - Resource usage (CPU, memory)
   - Lifecycle events
   - Orphan process cleanup

4. **Implement Telemetry Service** (`9fd1c09e-dbb7-437b-af99-d452516b5d93`)
   - Create `apps/server/src/services/telemetry-service.ts`
   - Provider metrics (tokens, latency, errors)
   - Task completion metrics
   - Export to prometheus/statsd

#### API Endpoints

```
GET  /api/providers - List all providers
GET  /api/providers/:name/status - Check provider status
GET  /api/agents - List running agents
GET  /api/agents/:id - Get agent details
GET  /api/telemetry - Get metrics
```

---

### Milestone 2: Enhanced Beads Integration (P1)

**Goal:** Deepen integration with Beads for issue-oriented execution.

#### Tasks

5. **Enhance Beads Integration** (`706581ce-8b4f-4f1e-9315-a8ef68ec1efc`)
   - Cross-feature dependency resolution in `BeadsService`
   - Epic-level task coordination
   - Beads-to-VibeKanban status sync
   - Issue status automation

#### Changes to Existing Files

- `apps/server/src/services/beads-service.ts` - Extend dependency resolution
- `apps/server/src/services/auto-mode-service.ts` - Epic-aware execution

---

### Milestone 3: Enhanced Checkpointing (P1)

**Goal:** Enable cross-agent checkpoint coordination.

#### Tasks

6. **Enhanced Checkpoint System** (`708269d5-6516-4ede-8608-55e24970bfb8`)
   - Cross-agent checkpoint coordination
   - Shared state management
   - Recovery from partial failures
   - Checkpoint versioning

#### New Files

- `apps/server/src/services/checkpoint-service.ts`
- `apps/server/src/lib/checkpoint-metadata.ts`

---

### Milestone 4: Worker Agents (P2)

**Goal:** Implement specialized agents for different domains.

#### Tasks

7. **Specialized Worker Agents** (`361ab82a-01e1-4e33-b307-8eda1bf6a56b`)
   - Frontend specialist (React, CSS, UX)
   - Backend specialist (APIs, database)
   - Testing specialist (unit, integration, e2e)
   - Agent selection logic

#### New Files

- `apps/server/src/services/agent-orchestrator.ts`
- `apps/server/src/agents/frontend-agent.ts`
- `apps/server/src/agents/backend-agent.ts`
- `apps/server/src/agents/testing-agent.ts`

---

### Milestone 5: VibeKanban MCP Integration (P0)

**Goal:** Complete the MCP integration in ReviewWatcherService.

#### Tasks

8. **Complete VibeKanban MCP Integration** (`e35e9fab-fc20-4037-b3a8-9efbdb9d15a5`)
   - Implement `checkVibeKanbanMCP()`
   - Implement `listVibeKanbanTasks()`
   - Implement `fetchVibeKanbanComments()`
   - Implement `startWorkspaceSession()`
   - End-to-end review automation

#### Changes to Existing Files

- `apps/server/src/services/review-watcher.ts` - Replace TODO placeholders

---

## Execution Order

```
M1-T1 (Research) → M1-T2 (Cursor Provider)
                → M1-T3 (Agent Monitor)
                → M1-T4 (Telemetry)

M1-T2, M1-T3, M1-T4 can be done in parallel after T1

M5 (VibeKanban MCP) can be done in parallel with M1

M2 (Beads) depends on M1 completion

M3 (Checkpointing) depends on M1, M2

M4 (Worker Agents) depends on M1, M2, M3
```

---

## Code Quality Standards

After each task:

1. Run `npm run lint` - Fix all errors
2. Run `npm run test:server` - All tests pass
3. Run `npm run format` - Consistent formatting
4. Update this doc with completion status

---

## Task Tracking

| Task ID | Title                   | Status  | VibeKanban ID                          |
| ------- | ----------------------- | ------- | -------------------------------------- |
| M1-T1   | Research multi-provider | Pending | `223ca287-e67f-4b0c-9c32-17ef2c4f2806` |
| M1-T2   | Cursor Provider         | Pending | `7024ed3e-58a2-4f53-9101-de6efe2e5908` |
| M1-T3   | Agent Monitor           | Pending | `4c9549b5-49b6-4a27-8a4f-908f3f439298` |
| M1-T4   | Telemetry Service       | Pending | `9fd1c09e-dbb7-437b-af99-d452516b5d93` |
| M2-T1   | Enhance Beads           | Pending | `706581ce-8b4f-4f1e-9315-a8ef68ec1efc` |
| M3-T1   | Enhanced Checkpoint     | Pending | `708269d5-6516-4ede-8608-55e24970bfb8` |
| M4-T1   | Worker Agents           | Pending | `361ab82a-01e1-4e33-b307-8eda1bf6a56b` |
| M5-T1   | VibeKanban MCP          | Pending | `e35e9fab-fc20-4037-b3a8-9efbdb9d15a5` |
