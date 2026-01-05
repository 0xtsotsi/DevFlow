# ADR-009: Beads Autonomous Memory System Architecture

**Status**: Accepted
**Date**: 2025-01-05
**Decision Makers**: DevFlow Team
**Related ADRs**: [ADR-001](ADR-001-adopt-gastown-features.md), [ADR-005](ADR-005-meow-workflow-hierarchy.md)

## Context and Problem Statement

DevFlow needs an autonomous system for tracking agent work, maintaining context across sessions, and coordinating multiple AI agents working in parallel. Key requirements:

1. **Error Tracking**: Agent errors should automatically become trackable issues
2. **Memory System**: Agents should query past work for relevant context
3. **Coordination**: Multiple agents need to work together without conflicts
4. **Integration**: Must work with standard Beads CLI (no proprietary fork)

## Decision Drivers

- **Beads Compatibility**: Must use standard Beads CLI, not a custom fork
- **Autonomy**: System should operate without human intervention
- **Performance**: Low latency for memory queries and agent assignment
- **Reliability**: Rate limiting, caching, and error recovery
- **Extensibility**: Easy to add new agent types and capabilities

## Considered Options

### Option 1: Custom Issue Tracking System

Build a custom database-backed issue tracking and agent coordination system.

**Good**:

- Complete control over features
- No external dependencies
- Can optimize for our exact use case

**Bad**:

- Reinventing the wheel
- High maintenance burden
- Lost benefits of Beads CLI tooling
- Would require custom CLI for manual operations

### Option 2: Beads Integration with Service Layer

Use standard Beads CLI for data storage, with Node.js services providing autonomous capabilities.

**Good**:

- Leverages mature Beads CLI for data layer
- Services provide autonomous features (auto-issues, memory, coordination)
- Can use Beads CLI directly for manual operations
- Compatible with standard Beads workflows
- Clear separation of concerns

**Bad**:

- Dependent on Beads CLI stability
- Some overhead from CLI invocation
- Must work within Beads data model

### Option 3: Direct Database Access

Access Beads SQLite database directly instead of using CLI.

**Good**:

- Faster than CLI invocation
- More direct control

**Bad**:

- Brittle (schema changes break integration)
- Bypasses Beads validation and business logic
- Risk of data corruption
- Not compatible with future Beads versions

## Decision Outcome

**Chosen option**: Option 2 - Beads Integration with Service Layer

Using standard Beads CLI as the data layer with autonomous services built on top provides the best balance of compatibility, maintainability, and feature completeness.

### Consequences

**Positive**:

- Users can use standard `beads` CLI for manual operations
- Automatic error tracking reduces manual triage
- Memory system provides agents with relevant historical context
- Agent coordination enables parallel work without conflicts
- System is resilient to individual agent failures

**Negative**:

- Some performance overhead from CLI invocations (mitigated by caching)
- Dependent on Beads CLI being installed and available
- Rate limiting required to prevent issue spam

**Neutral**:

- Beads database is source of truth
- Services emit events for monitoring and integration
- Configuration via environment variables

## Architecture

### Three Core Services

```
┌─────────────────────────────────────────────────────────────────┐
│                    Beads Autonomous Memory System              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │  BeadsLiveLink   │  │  BeadsMemory     │  │   Coordinator  ││
│  │   Service        │  │    Service       │  │    Service     ││
│  └──────────────────┘  └──────────────────┘  └────────────────┘│
│           │                     │                     │         │
│           └─────────────────────┴─────────────────────┘         │
│                            │                                   │
│                   ┌────────▼────────┐                          │
│                   │  BeadsService   │                          │
│                   │   (Core API)    │                          │
│                   └────────┬────────┘                          │
│                            │                                   │
│                   ┌────────▼────────┐                          │
│                   │  Beads CLI      │                          │
│                   │  (.beads.db)     │                          │
│                   └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### Service Details

**1. BeadsLiveLinkService** (`apps/server/src/services/beads-live-link-service.ts`)

- **Purpose**: Automatic error tracking and agent-requested issues
- **Size**: 485 lines
- **Key Features**:
  - Auto-creates issues from agent errors
  - Severity assessment: Critical (P0), High (P1), Medium (P2), Low (P3)
  - Rate limiting: 20 auto-issues/hour
  - Deduplication: 24-hour cache
  - Agents can request issue creation via stream

**2. BeadsMemoryService** (`apps/server/src/services/beads-memory-service.ts`)

- **Purpose**: Query past issues as agent context
- **Size**: 627 lines
- **Key Features**:
  - Semantic similarity search (>0.3 threshold)
  - Extracts decisions from closed issues
  - AI-generated summaries (via Exa MCP web search)
  - Token estimation (prevents context overflow)
  - 5-minute cache for performance

**3. BeadsAgentCoordinator** (`apps/server/src/services/beads-agent-coordinator.ts`)

- **Purpose**: Intelligent agent selection and task assignment
- **Size**: 803 lines
- **Key Features**:
  - Multi-factor scoring: capability (40%) + success rate (40%) + availability (20%)
  - Auto-assigns ready work (no blockers)
  - Helper agent spawning for subtasks
  - Issue locking prevents duplicate assignments
  - Stale agent cleanup (2-hour timeout)

### Agent Tools

Agents access Beads functionality through ClaudeProvider tools:

```typescript
// Available to all agents via ClaudeProvider
create_beads_issue(title, description?, type?, priority?)
query_beads_memory(query, maxResults?)
spawn_helper_agent(helperType, taskDescription)
```

## Configuration

Environment variables:

```bash
# Beads Live Link
BEADS_AUTO_ISSUES_ENABLED=true
BEADS_MAX_AUTO_ISSUES_PER_HOUR=20
BEADS_DEDUPLICATION_ENABLED=true

# Beads Memory
BEADS_MEMORY_CACHE_TTL=300000  # 5 minutes
BEADS_MEMORY_MAX_RESULTS=10
BEADS_MEMORY_INCLUDE_CLOSED=true

# Beads Coordinator
BEADS_COORDINATION_ENABLED=true
BEADS_COORDINATION_INTERVAL=30000  # 30 seconds
BEADS_MAX_CONCURRENT_AGENTS=5
BEADS_HELPER_SPAWNING_ENABLED=true
```

## Event System

All services emit events for monitoring:

| Event                         | Payload                             | Source                |
| ----------------------------- | ----------------------------------- | --------------------- |
| `beads:auto-issue-created`    | `{ issueId, severity, priority }`   | BeadsLiveLinkService  |
| `beads:agent-request-created` | `{ issueId, sessionId }`            | BeadsLiveLinkService  |
| `beads:memory-query`          | `{ query, resultCount }`            | BeadsMemoryService    |
| `beads:agent-assigned`        | `{ sessionId, agentType, issueId }` | BeadsAgentCoordinator |
| `beads:helper-spawned`        | `{ helperSessionId, parentIssue }`  | BeadsAgentCoordinator |
| `beads:agent-completed`       | `{ sessionId, success }`            | BeadsAgentCoordinator |
| `beads:agent-failed`          | `{ sessionId, error }`              | BeadsAgentCoordinator |

## Testing

Comprehensive test coverage:

- `apps/server/tests/unit/services/beads-live-link-service.test.ts`
- `apps/server/tests/unit/services/beads-memory-service.test.ts`
- `apps/server/tests/unit/services/beads-agent-coordinator.test.ts`

Target coverage: >82% (see [gastown-testing-guide.md](../gastown-testing-guide.md))

## Related Links

- [Beads CLI Documentation](https://github.com/beads-dev/beads)
- [Gastown Quick Reference](../gastown-quick-reference.md) - Detailed system documentation
- [Gastown Testing Guide](../gastown-testing-guide.md) - Test strategy
- [Beads Migration Guide](../beads-migration-guide.md) - Migration from legacy system
