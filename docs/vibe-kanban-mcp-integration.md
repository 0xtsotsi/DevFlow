# VibeKanban MCP Integration

This document describes the integration between DevFlow and VibeKanban via the Model Context Protocol (MCP).

## Overview

VibeKanban is a task and project management system that integrates with Claude Code through MCP. This integration allows autonomous agents to:

- Create and manage tasks
- Track task status throughout the development lifecycle
- Start workspace sessions for task execution
- Synchronize with external issue trackers (Beads, GitHub)

## MCP Tools

The following MCP tools are available:

### 1. mcp**vibe_kanban**list_projects

List all available projects.

**Parameters:** None

**Returns:** Array of project objects

```typescript
interface MCPProject {
  id: string; // UUID
  name: string; // Project name
  created_at: string;
  updated_at: string;
}
```

**Example:**

```typescript
const projects = await listProjects();
// Returns: [{ id: "2f89fe1b-...", name: "DevFlow", ... }]
```

---

### 2. mcp**vibe_kanban**list_tasks

List tasks in a project with optional filtering.

**Parameters:**

- `project_id` (required): UUID of the project
- `status` (optional): Filter by status ('todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled')
- `limit` (optional): Maximum number of tasks (default: 50)

**Returns:** Array of task objects

```typescript
interface MCPTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
  created_at: string;
  updated_at: string;
  has_in_progress_attempt?: boolean;
  last_attempt_failed?: boolean;
}
```

**Example:**

```typescript
const tasks = await listTasks({
  project_id: 'b1dce003-...',
  status: 'todo',
  limit: 10,
});
```

---

### 3. mcp**vibe_kanban**get_task

Get detailed information about a specific task.

**Parameters:**

- `task_id` (required): UUID of the task

**Returns:** Task object with full details

**Example:**

```typescript
const task = await getTask('e35e9fab-...');
```

---

### 4. mcp**vibe_kanban**create_task

Create a new task in a project.

**Parameters:**

- `project_id` (required): UUID of the project
- `title` (required): Task title
- `description` (optional): Task description (supports markdown)

**Returns:** Created task object

**Example:**

```typescript
const task = await createTask({
  project_id: 'b1dce003-...',
  title: 'Implement authentication',
  description: `## Acceptance Criteria
- [ ] User can log in with email/password
- [ ] Session is persisted
- [ ] Logout functionality works`,
});
```

---

### 5. mcp**vibe_kanban**update_task

Update an existing task.

**Parameters:**

- `task_id` (required): UUID of the task
- `title` (optional): New task title
- `description` (optional): New task description
- `status` (optional): New status

**Returns:** void (success indicated by no error)

**Example:**

```typescript
await updateTask({
  task_id: 'e35e9fab-...',
  status: 'inprogress',
  description: 'Working on implementation...',
});
```

---

### 6. mcp**vibe_kanban**delete_task

Delete a task.

**Parameters:**

- `task_id` (required): UUID of the task

**Returns:** void (success indicated by no error)

**Example:**

```typescript
await deleteTask('e35e9fab-...');
```

---

### 7. mcp**vibe_kanban**list_repos

List repositories for a project.

**Parameters:**

- `project_id` (required): UUID of the project

**Returns:** Array of repository objects

```typescript
interface MCPRepo {
  id: string;
  name: string;
  project_id: string;
}
```

**Example:**

```typescript
const repos = await listRepos('b1dce003-...');
// Returns: [{ id: "20bbfe62-...", name: "DevFlow", ... }]
```

---

### 8. mcp**vibe_kanban**start_workspace_session

Start a workspace session for task execution.

**Parameters:**

- `task_id` (required): UUID of the task
- `executor` (required): Executor type
  - `'CLAUDE_CODE'`: Claude Code agent
  - `'CODEX'`: Codex agent
  - `'GEMINI'`: Gemini agent
  - `'CURSOR_AGENT'`: Cursor agent
  - `'OPENCODE'`: OpenCode agent
- `variant` (optional): Executor variant
- `repos` (required): Array of repositories
  - `repo_id`: UUID of the repository
  - `base_branch`: Base branch name

**Returns:** void (session started asynchronously)

**Example:**

```typescript
await startWorkspaceSession({
  task_id: 'e35e9fab-...',
  executor: 'CLAUDE_CODE',
  repos: [
    {
      repo_id: '20bbfe62-...',
      base_branch: 'main',
    },
  ],
});
```

---

## Task Status Flow

```
todo → inprogress → inreview → done
                   ↓
              cancelled
```

| Status       | Description                      |
| ------------ | -------------------------------- |
| `todo`       | Task is not started              |
| `inprogress` | Task is being actively worked on |
| `inreview`   | Task is under review             |
| `done`       | Task is completed                |
| `cancelled`  | Task was cancelled               |

---

## Integration with DevFlow

### VibeKanbanClient

The `VibeKanbanClient` class wraps the MCP tools with additional functionality:

- Project auto-detection and creation
- State mapping between DevFlow and VibeKanban
- Retry logic with exponential backoff
- Error handling and logging

```typescript
import { getVibeKanbanClient } from './services/vibe-kanban-client.js';

const client = getVibeKanbanClient({ projectName: 'DevFlow' });
await client.connect();

// List tasks
const tasks = await client.listTasks({ status: 'todo' });

// Create task
const task = await client.createTask({
  title: 'New feature',
  description: 'Implementation details...',
});

// Update task status
await client.updateTask(task.id, { status: 'inprogress' });
```

### ReviewWatcherService

The `ReviewWatcherService` provides type definitions and documentation for VibeKanban MCP operations.

```typescript
import { ReviewWatcherService } from './services/review-watcher-service.js';

const service = new ReviewWatcherService(events);
await service.initialize();

// Validate UUIDs
const isValid = service.isValidUUID('some-uuid-string');

// Parse task descriptions
const parsed = service.parseTaskDescription(markdownDescription);
```

---

## State Mapping

DevFlow orchestrator states map to VibeKanban statuses:

| Orchestrator State | VibeKanban Status |
| ------------------ | ----------------- |
| `todo`             | `todo`            |
| `researching`      | `inprogress`      |
| `in_progress`      | `inprogress`      |
| `in_review`        | `inreview`        |
| `queue_for_pr`     | `inprogress`      |
| `pr_created`       | `inprogress`      |
| `pr_fixes_needed`  | `inprogress`      |
| `ready_for_merge`  | `inreview`        |
| `completed`        | `done`            |

---

## Best Practices

1. **Always validate UUIDs** before passing to MCP tools
2. **Use markdown in task descriptions** for better formatting
3. **Include acceptance criteria** as checkboxes in descriptions
4. **Update task status** as work progresses
5. **Handle errors gracefully** - MCP tools may be unavailable

---

## Error Handling

```typescript
try {
  const task = await client.createTask({ title: 'New Task' });
} catch (error) {
  if (error instanceof VibeKanbanError) {
    console.error(`Code: ${error.code}, Message: ${error.message}`);
    // Handle specific error codes
  }
}
```

Common error codes:

- `CONNECTION_ERROR`: Failed to connect to VibeKanban
- `NOT_CONNECTED`: Client not connected
- `NO_PROJECT`: No projects available
- `MCP_ERROR`: MCP tool call failed

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     DevFlow Server                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │              VibeKanbanClient                     │  │
│  │  - Project management                            │  │
│  │  - Task CRUD                                     │  │
│  │  - State mapping                                 │  │
│  │  - Retry logic                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│                          ▼                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │                 MCP Bridge                        │  │
│  │  - Tool call routing                              │  │
│  │  - Error handling                                 │  │
│  │  - Event emission                                 │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              VibeKanban MCP Server                      │
│  • list_projects  • list_tasks  • get_task             │
│  • create_task   • update_task • delete_task           │
│  • list_repos    • start_workspace_session             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 VibeKanban Backend                      │
│         Projects, Tasks, Repos, Workspaces              │
└─────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [Hybrid Orchestration Plan](./HYBRID_ORCHESTRATION_PLAN.md)
- [Checkpoint System](./checkpoint-system.md)
- [Beads Integration](../apps/server/src/services/beads-service.ts)
