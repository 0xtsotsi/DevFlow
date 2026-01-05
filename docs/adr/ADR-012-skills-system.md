# ADR-012: Skills System Architecture

**Status**: Accepted
**Date**: 2025-01-05
**Decision Makers**: DevFlow Team
**Related ADRs**: [ADR-010](ADR-010-workflow-orchestration.md), [ADR-011](ADR-011-hooks-system.md), [ADR-009](ADR-009-beads-architecture.md)

## Context and Problem Statement

DevFlow needs a modular system for specialized AI capabilities that can be invoked independently or orchestrated into workflows. Requirements include:

1. **Specialization**: Each skill should be optimized for specific tasks
2. **Composability**: Skills should work together in workflows
3. **Extensibility**: New skills should be easy to add
4. **Discoverability**: Users should be able to list and invoke skills
5. **Observability**: Skill execution should emit events for monitoring

## Decision Drivers

- **Modularity**: Skills should be independent, single-purpose units
- **Reusability**: Skills should be usable standalone or in workflows
- **Integration**: Skills should integrate with MCP servers (Exa, Grep, Beads)
- **Simplicity**: Adding new skills should be straightforward
- **Type Safety**: Skills should have well-defined interfaces

## Considered Options

### Option 1: Monolithic Agent System

Use a single general-purpose agent for all tasks with prompt variations.

**Good**:

- Simple to implement
- Single code path
- Easier to maintain

**Bad**:

- Prompts become complex
- No optimization for specific tasks
- Hard to reuse components
- Difficult to test individual capabilities

### Option 2: Modular Skills System

Define discrete skills with specialized prompts and execution logic.

**Good**:

- Each skill optimized for its task
- Easy to compose into workflows
- Simple to add new skills
- Clear ownership and testing
- Better prompt engineering per skill

**Bad**:

- More initial implementation
- Need coordination layer
- Some code duplication possible

### Option 3: External Skill Plugins

Load skills from external packages/modules.

**Good**:

- Extensible by users
- Clear plugin interface

**Bad**:

- Security concerns with arbitrary code
- Distribution complexity
- Dependency management overhead

## Decision Outcome

**Chosen option**: Option 2 - Modular Skills System

A modular skills system provides the best balance of specialization, composability, and maintainability for DevFlow's needs.

### Consequences

**Positive**:

- Each skill can be optimized for its specific task
- Skills compose naturally into workflows
- Easy to add new skills with clear patterns
- Better prompt engineering per skill
- Comprehensive MCP integration (Exa, Grep, Beads)

**Negative**:

- More initial implementation than monolithic approach
- Need skill registry and coordination
- Some duplication in skill boilerplate

**Neutral**:

- Skills are defined in codebase (not external plugins)
- SkillsService manages registration and execution
- Event system provides observability

## Architecture

### Core Skills

```
┌─────────────────────────────────────────────────────────────────┐
│                       Skills System                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────────┐   │
│  │  Research      │  │ Implementation │  │  CI/CD          │   │
│  │  Skill         │  │  Skill         │  │  Skill          │   │
│  └────────────────┘  └────────────────┘  └─────────────────┘   │
│           │                    │                    │            │
│           └────────────────────┴────────────────────┘            │
│                            │                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               Workflow Orchestrator                      │   │
│  │           (coordinates multiple skills)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   SkillsService                          │   │
│  │              (registration & execution)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Skill Interface

```typescript
interface Skill {
  /** Unique skill identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description of what skill does */
  description: string;

  /** Skill category */
  category: 'research' | 'implementation' | 'validation' | 'orchestration';

  /** Whether skill is enabled */
  enabled: boolean;

  /** Configuration options */
  config: SkillConfig;

  /** Execute function */
  execute(context: SkillContext): Promise<SkillResult>;
}

interface SkillContext {
  /** Project path */
  projectPath: string;

  /** Session ID */
  sessionId?: string;

  /** Task/query description */
  query?: string;

  /** Additional parameters */
  params?: Record<string, unknown>;
}

interface SkillResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Result data */
  data?: unknown;

  /** Summary message */
  summary?: string;

  /** Execution duration (ms) */
  duration?: number;
}
```

### Core Skills

| Skill          | ID               | Description                                 | MCP Integration  |
| -------------- | ---------------- | ------------------------------------------- | ---------------- |
| Research       | `research`       | Parallel codebase, web, and memory research | Exa, Grep, Beads |
| Implementation | `implementation` | AI-powered code implementation              | None             |
| CI/CD          | `cicd`           | Automated validation and testing            | None             |
| Workflow       | `workflow`       | Multi-step workflow coordination            | All              |

### Research Skill

Executes parallel research using multiple agents:

```typescript
interface ResearchResult {
  codebase: {
    patterns: string[];
    relatedFiles: string[];
    totalMatches: number;
  };
  web: {
    results: Array<{ title: string; url: string; summary: string }>;
    insights: string[];
    totalResults: number;
  };
  beads: {
    issues: Array<{ id: string; title: string; type: string }>;
    decisions: Array<{ issue: string; decision: string }>;
    totalIssues: number;
  };
  summary: {
    keyFindings: string[];
    recommendations: string[];
    relatedContext: string[];
    estimatedTokens: number;
  };
}
```

**MCP Integration:**

- **Grep MCP**: GitHub code search for patterns
- **Exa MCP**: Web search for documentation
- **Beads**: Past issues and decisions

### Implementation Skill

Executes code implementation tasks:

```typescript
interface ImplementationResult {
  success: boolean;
  changes: string[];
  summary: string;
}
```

### CI/CD Skill

Automated validation:

```typescript
interface CICDResult {
  success: boolean;
  testsPassed: boolean;
  lintPassed: boolean;
  buildPassed: boolean;
  report: string;
}
```

### Workflow Skill

Coordinates multi-step workflows (see [ADR-010](ADR-010-workflow-orchestration.md)).

## API

### List Skills

```bash
GET /api/skills
```

**Response:**

```json
{
  "success": true,
  "skills": [
    {
      "id": "research",
      "name": "Research",
      "description": "Performs comprehensive research using codebase, web, and memory",
      "category": "research",
      "enabled": true
    },
    {
      "id": "implementation",
      "name": "Implementation",
      "description": "AI-powered code implementation",
      "category": "implementation",
      "enabled": true
    },
    {
      "id": "cicd",
      "name": "CI/CD",
      "description": "Automated validation and testing",
      "category": "validation",
      "enabled": true
    },
    {
      "id": "workflow",
      "name": "Workflow Orchestrator",
      "description": "Coordinates multi-step development workflows",
      "category": "orchestration",
      "enabled": true
    }
  ]
}
```

### Execute Research Skill

```bash
POST /api/skills/research
{
  "projectPath": "/path/to/project",
  "query": "How to implement OAuth2",
  "maxResults": 10
}
```

### Execute Implementation Skill

```bash
POST /api/skills/implement
{
  "taskId": "task-123",
  "sessionId": "session-456",
  "projectPath": "/path/to/project",
  "description": "Add user profile page"
}
```

### Execute CI/CD Skill

```bash
POST /api/skills/cicd
{
  "projectPath": "/path/to/project",
  "branch": "feature/new-auth",
  "runTests": true,
  "runLint": true,
  "runBuild": true
}
```

### Execute Workflow Skill

```bash
POST /api/skills/workflow
{
  "issueId": "issue-123",
  "projectPath": "/path/to/project",
  "mode": "semi"
}
```

## Configuration

Environment variables:

```bash
# Skills system
SKILLS_ENABLED=true

# Research skill
RESEARCH_SKILL_ENABLED=true
RESEARCH_MAX_RESULTS=10
RESEARCH_INCLUDE_CLOSED_ISSUES=true

# Implementation skill
IMPLEMENTATION_SKILL_ENABLED=true
IMPLEMENTATION_TIMEOUT=300000

# CI/CD skill
CICD_SKILL_ENABLED=true
CICD_DEFAULT_BRANCH=main

# Workflow skill
WORKFLOW_MODE=semi
WORKFLOW_AUTO_START=false
WORKFLOW_CHECKPOINT_APPROVAL=true
```

## Event System

```typescript
// Skill lifecycle events
events.on('skill:started', (data) => {
  console.log(`Skill ${data.skillId} started`);
});

events.on('skill:completed', (data) => {
  console.log(`Skill ${data.skillId} completed in ${data.duration}ms`);
});

events.on('skill:failed', (data) => {
  console.error(`Skill ${data.skillId} failed: ${data.error}`);
});
```

## File Locations

| File                                                     | Purpose                          |
| -------------------------------------------------------- | -------------------------------- |
| `apps/server/src/services/skills-service.ts`             | Skill registration and execution |
| `apps/server/src/routes/skills.ts`                       | API endpoints                    |
| `libs/types/src/skills.ts`                               | Type definitions                 |
| `apps/server/tests/unit/services/skills-service.test.ts` | Tests                            |

## Related Links

- [Skills Guide](../SKILLS_GUIDE.md) - Detailed usage guide
- [Workflow Orchestration ADR](ADR-010-workflow-orchestration.md) - Workflow skill
- [Hooks System ADR](ADR-011-hooks-system.md) - Hook integration
- [Beads Architecture ADR](ADR-009-beads-architecture.md) - Beads memory integration
