---
name: workflow-orchestrator
description: Orchestrate complete development workflow (research → planning → implementation → CI/CD)
---

# Workflow Orchestrator Skill

Orchestrate complete development workflows with checkpoint-based approval system.

## Step 1: Parse Workflow Request

Extract workflow details:

- **Task**: What needs to be built
- **Mode**: auto (fully autonomous) or semi (checkpoint-based approval)
- **Phases**: Which phases to run (default: all)
- **Beads Issue**: Optional issue ID for coordination

Example:

```
Build JWT authentication system
Mode: semi
Phases: research, planning, implementation, cicd
```

## Step 2: Execute Workflow Phases

### Phase 1: Research

Spawn /research agents in parallel:

- Codebase research agent
- Web research agent
- Beads memory agent

Aggregate results and generate summary.

**Checkpoint (semi mode)**: Present research findings and wait for user approval before continuing.

### Phase 2: Planning

Spawn planning agent to:

- Decompose task into steps
- Identify dependencies
- Plan file structure
- Design architecture

**Checkpoint (semi mode)**: Present implementation plan and wait for approval.

### Phase 3: Implementation

Spawn /implement agents:

1. Planning agent (decompose task)
2. Research agent (gather context)
3. Implementation agent (write code)
4. Testing agent (write tests)

Auto-fix loop runs up to 3 iterations if errors are found.

**Checkpoint (semi mode)**: Present implementation summary and wait for approval.

### Phase 4: CI/CD

Run /cicd validation:

- Linting
- Type checking
- Tests
- Build
- E2E (if configured)
- Security scan

**Checkpoint (semi mode)**: Present CI/CD report and wait for approval.

## Step 3: Generate Workflow Summary

After all phases complete (or checkpoint rejected):

```markdown
# Workflow Complete: [Task]

**Mode**: [auto/semi]
**Status**: [SUCCESS/FAILED]
**Duration**: X minutes

## Phase Results

- Research: PASSED (2.5s)
- Planning: PASSED (1.8s)
- Implementation: PASSED (5m 30s, 2 errors fixed)
- CI/CD: PASSED (1m 15s)

## Checkpoints

1. Research - Approved ✓
2. Planning - Approved ✓
3. Implementation - Approved ✓
4. CI/CD - Approved ✓

## Artifacts

- Files modified: X
- Tests written: Y
- CI/CD report: .cicd-reports/cicd-report-123.html

## Next Steps

- [Optional actions]
```

## Checkpoint System

**Auto Mode**: All phases run without interruption

- Fastest execution
- Requires trust in AI agents
- Best for routine tasks

**Semi Mode**: Checkpoint after each phase

- User approval required
- Can cancel/modify workflow
- Best for critical features

**Checkpoint Interface**:

```
CHECKPOINT: [Phase Name]

[Summary of work completed]

Options:
[1] Approve - Continue to next phase
[2] Reject - Cancel workflow
[3] Modify - Adjust plan before continuing
```

## Multi-Agent Coordination via Beads

If `beadsIssueId` provided:

- Create subtasks for each agent
- Track agent assignments
- Coordinate parallel work
- Prevent duplicate assignments
- Report progress to Beads

## Error Handling

If any phase fails:

1. Log error details
2. Create Beads issue for tracking
3. Offer retry or manual intervention
4. Preserve completed work
5. Suggest fixes based on error type

## Workflow Resume

Support resuming workflows:

- Checkpoints track progress
- Can resume from last checkpoint
- Preserve context between runs
- Enable iterative refinement

## Notes

- Each phase emits events for monitoring
- Checkpoints stored in memory (can persist to disk)
- Multi-agent coordination via BeadsAgentCoordinator
- Full integration with VibeKanban for status tracking
