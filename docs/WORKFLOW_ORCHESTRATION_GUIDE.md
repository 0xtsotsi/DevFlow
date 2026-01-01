# Workflow Orchestration Guide

The Workflow Orchestrator coordinates multi-step development workflows, integrating skills, hooks, and agent coordination.

## Overview

Workflows automate complex development processes:

1. **Research** - Gather context and requirements
2. **Planning** - Create implementation plan
3. **Implementation** - Write and modify code
4. **Validation** - Run tests and checks
5. **Documentation** - Update documentation

## Workflow Modes

### Auto Mode

Fully automated execution without human intervention:

```bash
WORKFLOW_MODE=auto
WORKFLOW_AUTO_START=true
```

**Characteristics:**

- No checkpoints
- No approval required
- Fast execution
- Best for: Routine tasks, bug fixes, small features

### Semi-Auto Mode

Automated with checkpoint approvals:

```bash
WORKFLOW_MODE=semi
WORKFLOW_CHECKPOINT_APPROVAL=true
```

**Characteristics:**

- Checkpoints at critical stages
- Human approval required
- Safer execution
- Best for: Features, refactors, important changes

## Workflow Stages

### 1. Research Stage

Gathers context from multiple sources:

```typescript
{
  stage: 'research',
  skills: ['research'],
  hooks: ['pre-research', 'post-research'],
  output: {
    findings: [...],
    recommendations: [...],
    context: {...}
  }
}
```

**Activities:**

- Codebase research
- Web research
- Memory queries
- Requirement analysis

### 2. Planning Stage

Creates implementation plan:

```typescript
{
  stage: 'planning',
  skills: [],
  hooks: ['pre-planning', 'post-planning'],
  output: {
    plan: {
      steps: [...],
      dependencies: [...],
      risks: [...]
    }
  }
}
```

**Activities:**

- Analyze requirements
- Define tasks
- Identify dependencies
- Estimate complexity

### 3. Implementation Stage

Writes and modifies code:

```typescript
{
  stage: 'implementation',
  skills: ['implementation'],
  hooks: ['pre-implementation', 'post-implementation'],
  output: {
    changes: [...],
    summary: '...'
  }
}
```

**Activities:**

- Generate code
- Modify files
- Apply patterns
- Handle errors

### 4. Validation Stage

Runs quality checks:

```typescript
{
  stage: 'validation',
  skills: ['cicd'],
  hooks: ['pre-validation', 'post-validation'],
  output: {
    tests: {...},
    lint: {...},
    build: {...}
  }
}
```

**Activities:**

- Run tests
- Execute linting
- Perform build
- Check quality

### 5. Documentation Stage

Updates documentation:

```typescript
{
  stage: 'documentation',
  skills: [],
  hooks: ['pre-documentation', 'post-documentation'],
  output: {
    docs: [...],
    updated: [...]
  }
}
```

**Activities:**

- Update docs
- Generate changelog
- Update API docs
- Create examples

## API Usage

### Execute Workflow

```bash
POST /api/skills/workflow
{
  "issueId": "issue-123",
  "projectPath": "/path/to/project",
  "mode": "semi"
}
```

**Response:**

```json
{
  "success": true,
  "result": {
    "success": true,
    "steps": [
      {
        "step": "research",
        "status": "completed",
        "result": {
          "findings": [...],
          "summary": "..."
        }
      },
      {
        "step": "implementation",
        "status": "completed",
        "result": {
          "changes": [...],
          "summary": "..."
        }
      },
      {
        "step": "validation",
        "status": "completed",
        "result": {
          "testsPassed": true,
          "lintPassed": true
        }
      }
    ],
    "summary": "Workflow completed successfully"
  }
}
```

### Monitor Workflow Progress

```typescript
// Listen to workflow events
events.on('workflow:started', (data) => {
  console.log(`Workflow ${data.workflowId} started`);
});

events.on('workflow:stage-started', (data) => {
  console.log(`Stage ${data.stage} started`);
});

events.on('workflow:stage-completed', (data) => {
  console.log(`Stage ${data.stage} completed`);
});

events.on('workflow:checkpoint', (data) => {
  console.log(`Checkpoint reached: ${data.checkpoint}`);
  // Prompt user for approval if needed
});

events.on('workflow:completed', (data) => {
  console.log(`Workflow completed in ${data.duration}ms`);
});

events.on('workflow:failed', (data) => {
  console.error(`Workflow failed: ${data.error}`);
});
```

## Checkpoints

In semi-auto mode, workflows pause at checkpoints:

```typescript
interface WorkflowCheckpoint {
  /** Checkpoint ID */
  id: string;

  /** Checkpoint name */
  name: string;

  /** Stage completed */
  stage: string;

  /** Result from stage */
  result: any;

  /** Approval required */
  requiresApproval: boolean;

  /** Actions available */
  actions: ['approve', 'reject', 'modify'];
}
```

### Handling Checkpoints

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

## Workflow Configuration

### Environment Variables

```bash
# Workflow mode
WORKFLOW_MODE=semi

# Auto-start workflows
WORKFLOW_AUTO_START=false

# Checkpoint approval
WORKFLOW_CHECKPOINT_APPROVAL=true

# Timeout per stage (milliseconds)
WORKFLOW_STAGE_TIMEOUT=300000

# Maximum retry attempts
WORKFLOW_MAX_RETRIES=3
```

### Custom Workflows

Define custom workflow in project:

```json
{
  "workflow": {
    "name": "custom-feature-workflow",
    "stages": [
      {
        "name": "research",
        "skills": ["research"],
        "hooks": ["custom-research-hook"],
        "timeout": 60000
      },
      {
        "name": "implement",
        "skills": ["implementation"],
        "hooks": ["custom-impl-hook"],
        "timeout": 300000
      },
      {
        "name": "validate",
        "skills": ["cicd"],
        "hooks": [],
        "timeout": 120000
      }
    ],
    "checkpoints": [
      {
        "after": "research",
        "requireApproval": true
      },
      {
        "after": "implement",
        "requireApproval": true
      }
    ]
  }
}
```

## Error Handling

### Retry Logic

```typescript
interface WorkflowRetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;

  /** Retry delay (milliseconds) */
  retryDelay: number;

  /** Backoff multiplier */
  backoffMultiplier: number;

  /** Retryable errors */
  retryableErrors: string[];
}
```

### Failure Recovery

```typescript
// Workflow fails at stage
events.on('workflow:stage-failed', async (data) => {
  const { workflowId, stage, error } = data;

  // Log error
  console.error(`Stage ${stage} failed: ${error}`);

  // Decide whether to retry
  if (data.retryCount < data.maxRetries) {
    await retryStage(workflowId, stage);
  } else {
    await abortWorkflow(workflowId);
  }
});
```

## Integration with Beads

Workflows integrate with Beads issue tracker:

```typescript
// Auto-start workflow on issue creation
events.on('beads:issue-created', async (issue) => {
  if (issue.type === 'feature' && WORKFLOW_MODE === 'auto') {
    await workflowOrchestrator.executeWorkflow({
      issueId: issue.id,
      projectPath: process.cwd(),
      mode: 'auto',
    });
  }
});

// Update issue on workflow completion
events.on('workflow:completed', async (data) => {
  await beadsService.updateIssue(data.issueId, {
    status: 'completed',
    summary: data.result.summary,
  });
});
```

## Examples

### Simple Bug Fix Workflow

```bash
curl -X POST http://localhost:3008/api/skills/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "issueId": "bug-123",
    "projectPath": "/home/user/myapp",
    "mode": "auto"
  }'
```

**Flow:**

1. Research error patterns
2. Implement fix
3. Run tests
4. Update documentation

### Feature Development Workflow

```bash
curl -X POST http://localhost:3008/api/skills/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "issueId": "feature-456",
    "projectPath": "/home/user/myapp",
    "mode": "semi"
  }'
```

**Flow:**

1. Research requirements (checkpoint)
2. Create implementation plan (checkpoint)
3. Implement feature (checkpoint)
4. Run validation (checkpoint)
5. Update documentation

## Best Practices

1. **Use Semi-Auto for Features** - Safety first
2. **Enable Checkpoints** - Review critical stages
3. **Set Timeouts** - Prevent hanging stages
4. **Monitor Events** - Track workflow progress
5. **Handle Failures** - Implement retry logic
6. **Update Issues** - Sync with Beads
7. **Document Workflows** - Keep custom workflows documented

## Troubleshooting

**Workflow stuck at checkpoint:**

```bash
# Check pending checkpoints
GET /api/workflows/:id/checkpoints

# Approve manually
POST /api/workflows/:id/checkpoints/:id/approve
```

**Stage timing out:**

```bash
# Increase timeout
export WORKFLOW_STAGE_TIMEOUT=600000

# Or configure per-stage in workflow.json
```

**Workflow fails repeatedly:**

- Check error logs
- Verify skill availability
- Test skills independently
- Check hook configurations

## See Also

- [Skills Guide](./SKILLS_GUIDE.md) - Skill system
- [Hooks Guide](./HOOKS_GUIDE.md) - Hook system
- [Beads Integration](../CLAUDE.md#beads-autonomous-memory-system) - Issue tracking
