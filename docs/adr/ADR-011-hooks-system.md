# ADR-011: Hooks System Architecture

**Status**: Accepted
**Date**: 2025-01-05
**Decision Makers**: DevFlow Team
**Related ADRs**: [ADR-010](ADR-010-workflow-orchestration.md), [ADR-012](ADR-012-skills-system.md)

## Context and Problem Statement

DevFlow needs a flexible mechanism to execute custom code at key points in the development lifecycle. Requirements include:

1. **Validation**: Run checks before tasks and commits
2. **Automation**: Execute actions after tasks complete
3. **Customization**: Allow users to define their own hooks
4. **Safety**: Support blocking/non-blocking modes
5. **Observability**: Track hook execution and results

## Decision Drivers

- **Flexibility**: Users should be able to define custom hooks
- **Safety**: Blocking hooks should prevent harmful actions
- **Performance**: Hooks should timeout and not hang workflows
- **Composability**: Hooks should work with skills and workflows
- **Simplicity**: Hook definition should be straightforward

## Considered Options

### Option 1: Git-Style Hooks (Executable Files)

Store hooks as executable files in a `.hooks` directory, similar to Git's `.git/hooks`.

**Good**:

- Familiar pattern for developers
- Language agnostic (any executable)
- Simple to understand

**Bad**:

- Hard to manage dynamically (requires filesystem access)
- Difficult to enable/disable individual hooks
- No built-in validation
- Harder to integrate with in-memory workflows
- Security concerns with arbitrary executables

### Option 2: Configuration-Based JavaScript Hooks

Define hooks as JavaScript functions stored in configuration, executed in a sandboxed context.

**Good**:

- Easy to manage via API
- Can be enabled/disabled dynamically
- Built-in validation possible
- Consistent with existing DevFlow patterns
- Safe execution environment

**Bad**:

- Requires JavaScript knowledge
- Sandboxing complexity
- Potential for malicious code (mitigated by trust model)

### Option 3: Webhook System

Execute hooks by making HTTP requests to external endpoints.

**Good**:

- Language agnostic
- Easy to integrate with external services
- Decoupled from DevFlow process

**Bad**:

- Requires external service infrastructure
- Network dependency
- More complex setup for users
- Latency in execution

## Decision Outcome

**Chosen option**: Option 2 - Configuration-Based JavaScript Hooks

JavaScript hooks stored in configuration provide the best balance of flexibility, manageability, and integration with DevFlow's architecture.

### Consequences

**Positive**:

- Hooks can be managed via API
- Dynamic enable/disable without restart
- Built-in timeout handling
- Priority-based execution
- Consistent with existing DevFlow patterns
- Comprehensive default hooks provided

**Negative**:

- Requires JavaScript knowledge for custom hooks
- Sandboxing adds complexity
- Potential for infinite loops (mitigated by timeouts)

**Neutral**:

- Hooks execute in Node.js context with access to standard libraries
- Trust model: users control their own hook definitions
- Execution statistics tracked for observability

## Architecture

### Hook Types

```
┌─────────────────────────────────────────────────────────────────┐
│                       Hooks System                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Pre-Task Hooks                                          │   │
│  │  ─────────────────────────────────────────────────────   │   │
│  │  • Check Git Status                                      │   │
│  │  • Check MCP Availability                                │   │
│  │  • Custom Environment Checks                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    TASK EXECUTION                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Post-Task Hooks                                         │   │
│  │  ─────────────────────────────────────────────────────   │   │
│  │  • Summarize Changes                                     │   │
│  │  • Check Test Status                                     │   │
│  │  • Custom Notifications                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Pre-Commit Hooks                                        │   │
│  │  ─────────────────────────────────────────────────────   │   │
│  │  • Validate Tests                                        │   │
│  │  • Run Type Check                                        │   │
│  │  • Check for Debug Code                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    COMMIT                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Hook Interface

```typescript
interface Hook {
  /** Hook ID (generated) */
  id: string;

  /** Hook type */
  type: 'pre-task' | 'post-task' | 'pre-commit';

  /** Display name */
  name: string;

  /** Description of what hook does */
  description: string;

  /** Execution mode */
  mode: 'blocking' | 'non-blocking';

  /** Whether hook is enabled */
  enabled: boolean;

  /** Execution priority (higher = earlier) */
  priority: number;

  /** Timeout in milliseconds */
  timeout: number;

  /** JavaScript implementation */
  implementation: string;

  /** Creation time */
  createdAt: Date;

  /** Last update time */
  updatedAt: Date;
}

interface HookContext {
  /** Hook being executed */
  hook: Hook;

  /** Session ID */
  sessionId: string;

  /** Project path */
  projectPath: string;

  /** Task description */
  taskDescription?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

interface HookResult {
  /** Whether hook passed */
  success: boolean;

  /** Result message */
  message: string;

  /** Optional data returned */
  data?: Record<string, unknown>;

  /** Execution time */
  executionTime?: number;
}
```

### Execution Modes

**Blocking Mode** (`mode: 'blocking'`)

- Stops workflow if hook fails
- Used for critical validations
- Example: Pre-commit test validation

**Non-Blocking Mode** (`mode: 'non-blocking'`)

- Continues regardless of result
- Used for notifications and logging
- Example: Post-task Slack notification

### Default Hooks

| Type       | Name                   | Priority | Mode         | Description                   |
| ---------- | ---------------------- | -------- | ------------ | ----------------------------- |
| pre-task   | Check Git Status       | 100      | blocking     | Verify clean git state        |
| pre-task   | Check MCP Availability | 90       | non-blocking | Verify MCP servers configured |
| post-task  | Summarize Changes      | 100      | non-blocking | Show git diff stats           |
| post-task  | Check Test Status      | 90       | blocking     | Verify tests pass             |
| pre-commit | Validate Tests         | 100      | blocking     | Run all tests                 |
| pre-commit | Run Type Check         | 90       | blocking     | TypeScript validation         |
| pre-commit | Check for Debug Code   | 80       | blocking     | Prevent debug code commits    |

### Priority-Based Execution

Hooks execute in priority order (higher priority first):

```typescript
// Example: Pre-task hooks execution order
1. Check Git Status (priority: 100)
2. Check MCP Availability (priority: 90)
3. Custom Environment Check (priority: 50)
```

## API

### List Hooks

```bash
GET /api/hooks
```

### Register Hook

```bash
POST /api/hooks
{
  "type": "pre-task",
  "name": "My Custom Hook",
  "description": "Does something useful",
  "mode": "blocking",
  "enabled": true,
  "priority": 50,
  "timeout": 30000,
  "implementation": "return { success: true };"
}
```

### Update Hook

```bash
PUT /api/hooks/:id
{
  "enabled": false
}
```

### Delete Hook

```bash
DELETE /api/hooks/:id
```

### Validate Hook

```bash
POST /api/hooks/validate
{
  "type": "pre-task",
  "name": "Test Hook",
  "implementation": "return true;"
}
```

## Configuration

Environment variables:

```bash
# Enable hooks system
HOOKS_ENABLED=true

# Default hook timeout (milliseconds)
HOOKS_DEFAULT_TIMEOUT=30000

# Maximum hook execution time
HOOKS_MAX_TIMEOUT=120000
```

## Event System

```typescript
// Hook execution events
events.on('hook:executing', (data) => {
  console.log(`Executing hook: ${data.hookName}`);
});

events.on('hook:completed', (data) => {
  console.log(`Hook completed: ${data.hookName}, success: ${data.success}`);
});

events.on('hook:failed', (data) => {
  console.error(`Hook failed: ${data.hookName}, error: ${data.error}`);
});

events.on('hook:blocked', (data) => {
  console.log(`Workflow blocked by hook: ${data.hookName}`);
});
```

## File Locations

| File                                               | Purpose               |
| -------------------------------------------------- | --------------------- |
| `apps/server/src/lib/hooks-manager.ts`             | Hook execution engine |
| `apps/server/src/routes/hooks.ts`                  | API endpoints         |
| `libs/types/src/hooks.ts`                          | Type definitions      |
| `apps/server/tests/unit/lib/hooks-manager.test.ts` | Tests                 |

## Related Links

- [Hooks Guide](../HOOKS_GUIDE.md) - Detailed usage guide
- [Workflow Orchestration ADR](ADR-010-workflow-orchestration.md) - Integration with workflows
- [Skills System ADR](ADR-012-skills-system.md) - Skill integration
