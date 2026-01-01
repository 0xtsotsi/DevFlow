# Skills System Guide

The Skills System provides specialized AI capabilities for common development tasks. Each skill encapsulates specific functionality and can be invoked independently or orchestrated as part of larger workflows.

## Overview

DevFlow includes four core skills:

1. **Research Skill** - Comprehensive codebase and web research
2. **Implementation Skill** - AI-powered code implementation
3. **CI/CD Skill** - Automated validation and testing
4. **Workflow Orchestrator** - Multi-step workflow coordination

## Research Skill

### Capabilities

The Research Skill performs parallel research using multiple data sources:

- **Codebase Research** (via Grep MCP): Searches GitHub for code patterns and examples
- **Web Research** (via Exa MCP): Finds documentation, tutorials, and best practices
- **Memory Research** (via Beads): Queries past issues and decisions for context

### Usage

**Via API:**

```bash
POST /api/skills/research
{
  "projectPath": "/path/to/project",
  "query": "How to implement OAuth2 authentication",
  "maxResults": 10
}
```

**Response:**

```json
{
  "success": true,
  "result": {
    "success": true,
    "agents": {
      "codebase": {
        "agentType": "codebase",
        "success": true,
        "data": {
          "patterns": [...],
          "relatedFiles": [...],
          "totalMatches": 25
        },
        "duration": 1234
      },
      "web": {
        "agentType": "web",
        "success": true,
        "data": {
          "results": [...],
          "insights": [...],
          "totalResults": 10
        },
        "duration": 2345
      },
      "beads": {
        "agentType": "beads",
        "success": true,
        "data": {
          "issues": [...],
          "decisions": [...],
          "totalIssues": 5
        },
        "duration": 1234
      }
    },
    "summary": {
      "keyFindings": [
        "Found 25 code patterns in codebase",
        "Found 10 relevant web resources",
        "Found 5 related issues in memory"
      ],
      "recommendations": [
        "Use Passport.js for authentication",
        "Implement JWT tokens for session management"
      ],
      "relatedContext": [
        "Related files: src/auth.ts, src/middleware/auth.ts",
        "Past decisions: Use OAuth2 for third-party login"
      ],
      "estimatedTokens": 2500
    },
    "totalDuration": 4813,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

**Via Events:**

```typescript
events.emit('skill:research:execute', {
  query: 'Implement user authentication',
  projectPath: process.cwd(),
  maxResults: 10,
});

events.on('skill:completed', (result) => {
  console.log('Research completed:', result);
});
```

### Configuration

```bash
# .env
RESEARCH_SKILL_ENABLED=true
RESEARCH_MAX_RESULTS=10
RESEARCH_INCLUDE_CLOSED_ISSUES=true
```

### Examples

**Research a feature implementation:**

```bash
curl -X POST http://localhost:3008/api/skills/research \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/home/user/myapp",
    "query": "Implement real-time notifications with WebSocket",
    "maxResults": 15
  }'
```

**Research error patterns:**

```bash
curl -X POST http://localhost:3008/api/skills/research \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/home/user/myapp",
    "query": "Common causes of Memory Limit Exceeded error in Node.js"
  }'
```

## Implementation Skill

### Capabilities

The Implementation Skill executes code implementation tasks using AI agents:

- Analyzes task requirements
- Generates implementation code
- Applies changes to the codebase
- Provides summary of modifications

### Usage

**Via API:**

```bash
POST /api/skills/implement
{
  "taskId": "task-123",
  "sessionId": "session-456",
  "projectPath": "/path/to/project",
  "description": "Add user profile page with avatar upload"
}
```

**Response:**

```json
{
  "success": true,
  "result": {
    "success": true,
    "changes": ["src/pages/UserProfile.tsx", "src/components/AvatarUpload.tsx", "src/api/user.ts"],
    "summary": "Created user profile page with avatar upload functionality"
  }
}
```

### Configuration

```bash
# .env
IMPLEMENTATION_SKILL_ENABLED=true
IMPLEMENTATION_TIMEOUT=300000
```

### Examples

**Implement a feature:**

```bash
curl -X POST http://localhost:3008/api/skills/implement \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "feat-user-profile",
    "sessionId": "agent-session-1",
    "projectPath": "/home/user/myapp",
    "description": "Create user profile page with editable fields"
  }'
```

## CI/CD Skill

### Capabilities

The CI/CD Skill automates validation tasks:

- Runs test suites
- Executes linting
- Performs build validation
- Generates CI/CD reports

### Usage

**Via API:**

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

**Response:**

```json
{
  "success": true,
  "result": {
    "success": true,
    "testsPassed": true,
    "lintPassed": true,
    "buildPassed": true,
    "report": "All checks passed. Tests: 125 passed, 0 failed. Lint: No errors. Build: Successful."
  }
}
```

### Configuration

```bash
# .env
CICD_SKILL_ENABLED=true
CICD_DEFAULT_BRANCH=main
```

### Examples

**Run full CI/CD validation:**

```bash
curl -X POST http://localhost:3008/api/skills/cicd \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/home/user/myapp",
    "branch": "feature/user-profile",
    "runTests": true,
    "runLint": true,
    "runBuild": true
  }'
```

**Run tests only:**

```bash
curl -X POST http://localhost:3008/api/skills/cicd \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/home/user/myapp",
    "runTests": true
  }'
```

## Workflow Orchestrator

### Capabilities

The Workflow Orchestrator coordinates multi-step workflows:

- Sequences multiple skills
- Manages checkpoints and approvals
- Handles errors and retries
- Tracks workflow progress

### Workflow Modes

**Auto Mode:**

- Fully automated execution
- No human intervention required
- Best for repetitive tasks

**Semi-Auto Mode:**

- Automated with checkpoint approvals
- Human approval at critical steps
- Best for important changes

### Usage

**Via API:**

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
        "result": { "findings": [...] }
      },
      {
        "step": "implementation",
        "status": "completed",
        "result": { "changes": [...] }
      },
      {
        "step": "validation",
        "status": "completed",
        "result": { "testsPassed": true }
      }
    ],
    "summary": "Workflow completed successfully"
  }
}
```

### Workflow Stages

Typical workflow includes:

1. **Research** - Gather context and requirements
2. **Planning** - Create implementation plan
3. **Implementation** - Write code
4. **Validation** - Run tests and checks
5. **Documentation** - Update docs

### Configuration

```bash
# .env
WORKFLOW_MODE=semi
WORKFLOW_AUTO_START=false
WORKFLOW_CHECKPOINT_APPROVAL=true
```

### Examples

**Execute workflow in semi-auto mode:**

```bash
curl -X POST http://localhost:3008/api/skills/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "issueId": "issue-123",
    "projectPath": "/home/user/myapp",
    "mode": "semi"
  }'
```

## Listing Available Skills

Get list of all available skills and their status:

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
      "available": true
    },
    {
      "id": "implementation",
      "name": "Implementation",
      "description": "Executes implementation tasks with AI agents",
      "available": true
    },
    {
      "id": "cicd",
      "name": "CI/CD",
      "description": "Runs CI/CD validation tasks",
      "available": true
    },
    {
      "id": "workflow",
      "name": "Workflow Orchestrator",
      "description": "Orchestrates multi-step workflows",
      "available": true
    }
  ]
}
```

## MCP Integration

Skills integrate with MCP (Model Context Protocol) servers:

- **Exa MCP** - Web search and research
- **Grep MCP** - Code search and pattern matching
- **Playwright MCP** - Browser automation (optional)

See [MCP_SETUP.md](./MCP_SETUP.md) for configuration details.

## Events

Skills emit events for monitoring:

```typescript
// Skill started
events.on('skill:started', (data) => {
  console.log(`Skill ${data.skill} started`);
});

// Skill completed
events.on('skill:completed', (data) => {
  console.log(`Skill ${data.skill} completed in ${data.duration}ms`);
});

// Skill failed
events.on('skill:failed', (data) => {
  console.error(`Skill ${data.skill} failed: ${data.error}`);
});

// Agent started
events.on('skill:agent-started', (data) => {
  console.log(`Agent ${data.agent} for skill ${data.skill} started`);
});

// Agent completed
events.on('skill:agent-completed', (data) => {
  console.log(`Agent ${data.agent} completed with ${data.resultsCount} results`);
});
```

## Best Practices

1. **Use Research First** - Always research before implementing
2. **Enable All Data Sources** - Leverage codebase, web, and memory
3. **Set Timeouts** - Prevent hanging operations
4. **Monitor Events** - Track skill execution progress
5. **Use Semi-Auto Mode** - For critical changes
6. **Validate Results** - Check skill outputs before proceeding

## Troubleshooting

**Skill not available:**

```bash
# Check if MCP servers are configured
curl http://localhost:3008/api/skills

# Verify environment variables
env | grep SKILL
```

**Research returns empty results:**

- Increase `maxResults` parameter
- Check MCP server connectivity
- Verify query specificity

**Implementation fails:**

- Check agent service logs
- Verify project path
- Ensure sufficient timeout

**Workflow hangs at checkpoint:**

- Use `auto` mode for testing
- Disable `WORKFLOW_CHECKPOINT_APPROVAL`
- Check event logs for errors

## See Also

- [Hooks Guide](./HOOKS_GUIDE.md) - Custom workflow hooks
- [Workflow Orchestration Guide](./WORKFLOW_ORCHESTRATION_GUIDE.md) - Advanced workflows
- [MCP Setup](./MCP_SETUP.md) - MCP server configuration
