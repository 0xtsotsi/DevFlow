# ADR-010: Workflow Orchestration System

**Status**: Accepted
**Date**: 2025-01-05
**Decision Makers**: DevFlow Team
**Related ADRs**: [ADR-009](ADR-009-beads-architecture.md), [ADR-012](ADR-012-skills-system.md), [ADR-011](ADR-011-hooks-system.md)

## Context and Problem Statement

DevFlow needs a system to orchestrate complex multi-stage development workflows that coordinate skills, hooks, and agent coordination. Key requirements:

1. **Multi-Stage Pipelines**: Support sequential stages (research → plan → implement → validate → document)
2. **Execution Modes**: Both fully automated and human-supervised workflows
3. **Checkpoint System**: Allow approval checkpoints for important changes
4. **Error Recovery**: Retry logic and graceful failure handling
5. **Beads Integration**: Track workflow progress in Beads issues

## Decision Drivers

- **Flexibility**: Support both automated and supervised modes
- **Observability**: Real-time progress tracking via events
- **Safety**: Checkpoints for human approval on important changes
- **Composability**: Integrate existing skills and hooks
- **Reliability**: Retry logic and error recovery

## Considered Options

### Option 1: Hardcoded Workflow Functions

Implement each workflow as a hardcoded TypeScript function.

**Good**:

- Simple to implement
- Full control over execution
- Type-safe

**Bad**:

- Not customizable by users
- Difficult to modify workflows
- Code duplication for similar workflows
- Hard to test individual stages

### Option 2: Configuration-Based Orchestrator

Define workflows as JSON configuration with a generic execution engine.

**Good**:

- User-customizable workflows
- Reusable execution engine
- Easy to add new workflows
- Composable stages

**Bad**:

- More complex implementation
- Need validation framework
- Less type safety

### Option 3: External Workflow Engine

Use an external workflow engine like GitHub Actions or Apache Airflow.

**Good**:

- Mature, battle-tested
- Rich feature set
- External tooling support

**Bad**:

- Heavy dependency
- Overkill for our needs
- Doesn't integrate well with in-memory agent execution
- Additional infrastructure complexity

## Decision Outcome

**Chosen option**: Option 2 - Configuration-Based Orchestrator

A configuration-based orchestrator with defined stages provides the right balance of flexibility, maintainability, and integration with existing DevFlow systems.

### Consequences

**Positive**:

- Users can define custom workflows
- Stages are reusable across workflows
- Clear separation of concerns
- Easy to test individual stages
- Integrates with skills and hooks systems

**Negative**:

- More complex than hardcoded functions
- Requires configuration validation
- Additional learning curve for custom workflows

**Neutral**:

- Workflows defined as TypeScript interfaces (compiled, not runtime JSON)
- Default workflows provided out of the box
- Checkpoint system adds overhead for safety-critical workflows

## Architecture

### Workflow Stages

```
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow Orchestrator                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐   ┌─────────┐   ┌────────────┐   ┌───────────┐   │
│  │ Research│ → │ Planning│ → │Implementation│→ │Validation│→ │
│  └─────────┘   └─────────┘   └────────────┘   └───────────┘   │
│       ↓             ↓              ↓                ↓           │
│   ┌───────┐     ┌───────┐      ┌───────┐       ┌───────┐      │
│   │ Hooks │     │ Hooks │      │ Hooks │       │ Hooks │      │
│   └───────┘     └───────┘      └───────┘       └───────┘      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Checkpoint System                       │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Pause at checkpoints → Approve → Continue              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Execution Modes

**Auto Mode** (`WORKFLOW_MODE=auto`)

- No checkpoints
- No approval required
- Fast execution
- Best for: Routine tasks, bug fixes, small features

**Semi-Auto Mode** (`WORKFLOW_MODE=semi`)

- Checkpoints at critical stages
- Human approval required
- Safer execution
- Best for: Features, refactors, important changes

### Stage Definitions

```typescript
interface WorkflowStage {
  name: string;
  skills: string[];
  hooks: string[];
  timeout: number;
  checkpoint?: boolean;
}

const DEFAULT_STAGES: WorkflowStage[] = [
  {
    name: 'research',
    skills: ['research'],
    hooks: ['pre-research', 'post-research'],
    timeout: 60000,
    checkpoint: true,
  },
  {
    name: 'planning',
    skills: [],
    hooks: ['pre-planning', 'post-planning'],
    timeout: 30000,
  },
  {
    name: 'implementation',
    skills: ['implementation'],
    hooks: ['pre-implementation', 'post-implementation'],
    timeout: 300000,
    checkpoint: true,
  },
  {
    name: 'validation',
    skills: ['cicd'],
    hooks: ['pre-validation', 'post-validation'],
    timeout: 120000,
  },
  {
    name: 'documentation',
    skills: [],
    hooks: ['pre-documentation', 'post-documentation'],
    timeout: 60000,
  },
];
```

### Event System

```typescript
// Workflow lifecycle events
events.on('workflow:started', (data) => {
  console.log(`Workflow ${data.workflowId} started for issue ${data.issueId}`);
});

events.on('workflow:stage-started', (data) => {
  console.log(`Stage ${data.stage} started`);
});

events.on('workflow:stage-completed', (data) => {
  console.log(`Stage ${data.stage} completed`);
});

events.on('workflow:checkpoint', (data) => {
  console.log(`Checkpoint reached: ${data.checkpoint}`);
  // Prompt user for approval in semi-auto mode
});

events.on('workflow:completed', (data) => {
  console.log(`Workflow completed in ${data.duration}ms`);
});

events.on('workflow:failed', (data) => {
  console.error(`Workflow failed: ${data.error}`);
});
```

### Retry Logic

```typescript
interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2,
  retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_FAILURE'],
};
```

## Configuration

Environment variables:

```bash
# Workflow mode: auto | semi
WORKFLOW_MODE=semi

# Auto-start workflows on issue creation
WORKFLOW_AUTO_START=false

# Enable checkpoint approval system
WORKFLOW_CHECKPOINT_APPROVAL=true

# Timeout per stage (milliseconds)
WORKFLOW_STAGE_TIMEOUT=300000

# Maximum retry attempts
WORKFLOW_MAX_RETRIES=3

# Retry delay (milliseconds)
WORKFLOW_RETRY_DELAY=1000
```

## API

### Execute Workflow

```bash
POST /api/skills/workflow
{
  "issueId": "issue-123",
  "projectPath": "/path/to/project",
  "mode": "semi"
}
```

### Handle Checkpoint

```bash
# Approve checkpoint
POST /api/workflows/:id/checkpoints/:checkpointId/approve

# Reject checkpoint
POST /api/workflows/:id/checkpoints/:checkpointId/reject

# Modify and continue
POST /api/workflows/:id/checkpoints/:checkpointId/modify
{
  "modifications": {...}
}
```

## File Locations

| File                                                            | Purpose           |
| --------------------------------------------------------------- | ----------------- |
| `apps/server/src/services/workflow-orchestrator.ts`             | Main orchestrator |
| `apps/server/src/routes/workflow.ts`                            | API endpoints     |
| `libs/types/src/workflow.ts`                                    | Type definitions  |
| `apps/server/tests/unit/services/workflow-orchestrator.test.ts` | Tests             |

## Related Links

- [Workflow Orchestration Guide](../WORKFLOW_ORCHESTRATION_GUIDE.md) - Detailed usage guide
- [Skills System ADR](ADR-012-skills-system.md) - Skill architecture
- [Hooks System ADR](ADR-011-hooks-system.md) - Hook architecture
- [Beads Architecture ADR](ADR-009-beads-architecture.md) - Integration with Beads
