# VibeKanban MCP Integration

## Overview

This document describes the VibeKanban MCP (Model Context Protocol) integration in DevFlow, which provides seamless connectivity between Claude Code and the VibeKanban project management system.

## Architecture

The VibeKanban MCP integration follows a direct tool invocation pattern:

1. **MCP Server**: VibeKanban provides an MCP server with tools for task and project management
2. **Claude Code Environment**: MCP tools are available directly in the Claude Code environment
3. **Service Layer**: `ReviewWatcherService` provides type definitions and documentation
4. **Direct Invocation**: Tools are invoked directly by Claude Code when executing tasks

## Available MCP Tools

### 1. List Projects
**Tool:** `mcp__vibe_kanban__list_projects`

**Description:** Retrieves all available projects from VibeKanban

**Parameters:** None

**Returns:**
```typescript
{
  projects: Array<{
    id: string;          // UUID
    name: string;
    created_at: string;  // ISO timestamp
    updated_at: string;  // ISO timestamp
  }>;
  count: number;
}
```

**Example Usage:**
```
mcp__vibe_kanban__list_projects
```

---

### 2. List Tasks
**Tool:** `mcp__vibe_kanban__list_tasks`

**Description:** Lists all tasks in a project with optional filtering

**Parameters:**
- `project_id` (required, string): UUID of the project
- `status` (optional, enum): 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled'
- `limit` (optional, number): Maximum tasks to return (default: 50)

**Returns:**
```typescript
{
  tasks: Array<{
    id: string;
    title: string;
    description?: string;
    status: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
    created_at: string;
    updated_at: string;
    has_in_progress_attempt?: boolean;
    last_attempt_failed?: boolean;
  }>;
  count: number;
  project_id: string;
  applied_filters?: {
    status?: string;
    limit?: number;
  };
}
```

**Example Usage:**
```
mcp__vibe_kanban__list_tasks
  project_id="b1dce003-a326-4994-bc0b-04b628cf1434"
  status="inreview"
  limit=10
```

---

### 3. Get Task
**Tool:** `mcp__vibe_kanban__get_task`

**Description:** Retrieves detailed information about a specific task

**Parameters:**
- `task_id` (required, string): UUID of the task

**Returns:**
```typescript
{
  task: {
    id: string;
    title: string;
    description?: string;
    status: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
    created_at: string;
    updated_at: string;
    has_in_progress_attempt?: boolean;
    last_attempt_failed?: boolean;
  };
}
```

**Example Usage:**
```
mcp__vibe_kanban__get_task
  task_id="e35e9fab-fc20-4037-b3a8-9efbdb9d15a5"
```

---

### 4. Create Task
**Tool:** `mcp__vibe_kanban__create_task`

**Description:** Creates a new task in a project

**Parameters:**
- `project_id` (required, string): UUID of the project
- `title` (required, string): Task title
- `description` (optional, string): Task description

**Returns:**
```typescript
{
  task: {
    id: string;
    title: string;
    description?: string;
    status: 'todo';
    created_at: string;
    updated_at: string;
  };
}
```

**Example Usage:**
```
mcp__vibe_kanban__create_task
  project_id="b1dce003-a326-4994-bc0b-04b628cf1434"
  title="Implement new feature"
  description="Add support for X"
```

---

### 5. Update Task
**Tool:** `mcp__vibe_kanban__update_task`

**Description:** Updates an existing task's title, description, or status

**Parameters:**
- `task_id` (required, string): UUID of the task
- `title` (optional, string): New title
- `description` (optional, string): New description
- `status` (optional, enum): 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled'

**Note:** At least one of title, description, or status must be provided

**Returns:**
```typescript
{
  task: {
    id: string;
    title: string;
    description?: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
}
```

**Example Usage:**
```
mcp__vibe_kanban__update_task
  task_id="e35e9fab-fc20-4037-b3a8-9efbdb9d15a5"
  status="done"
```

---

### 6. Delete Task
**Tool:** `mcp__vibe_kanban__delete_task`

**Description:** Deletes a task from a project

**Parameters:**
- `task_id` (required, string): UUID of the task

**Returns:** Success confirmation

**Example Usage:**
```
mcp__vibe_kanban__delete_task
  task_id="e35e9fab-fc20-4037-b3a8-9efbdb9d15a5"
```

---

### 7. List Repositories
**Tool:** `mcp__vibe_kanban__list_repos`

**Description:** Lists all repositories associated with a project

**Parameters:**
- `project_id` (required, string): UUID of the project

**Returns:**
```typescript
{
  repos: Array<{
    id: string;      // UUID
    name: string;
    project_id: string;
  }>;
  count: number;
  project_id: string;
}
```

**Example Usage:**
```
mcp__vibe_kanban__list_repos
  project_id="b1dce003-a326-4994-bc0b-04b628cf1434"
```

---

### 8. Start Workspace Session
**Tool:** `mcp__vibe_kanban__start_workspace_session`

**Description:** Starts a workspace session for a task, launching a coding agent to work on the task

**Parameters:**
- `task_id` (required, string): UUID of the task
- `executor` (required, enum): 'CLAUDE_CODE' | 'CODEX' | 'GEMINI' | 'CURSOR_AGENT' | 'OPENCODE'
- `variant` (optional, string): Executor variant if needed
- `repos` (required, array): Array of repository configurations
  - `repo_id` (string): UUID of the repository
  - `base_branch` (string): Base branch for the repository

**Returns:** Workspace session information

**Example Usage:**
```
mcp__vibe_kanban__start_workspace_session
  task_id="e35e9fab-fc20-4037-b3a8-9efbdb9d15a5"
  executor="CLAUDE_CODE"
  repos=[{"repo_id": "20bbfe62-675d-48b0-acff-23370fbdb5ed", "base_branch": "main"}]
```

---

## Service Implementation

The `ReviewWatcherService` (`apps/server/src/services/review-watcher-service.ts`) provides:

1. **Type Definitions**: TypeScript interfaces for all VibeKanban entities
2. **Documentation**: Comprehensive JSDoc comments for each MCP tool
3. **Validation**: Helper methods for UUID validation
4. **Integration**: EventEmitter-based error handling and logging

### Usage Pattern

The service is designed to be used as follows:

1. Import types from the service
2. Reference JSDoc documentation for tool usage
3. Call MCP tools directly in Claude Code
4. Use service methods for validation and error handling

```typescript
import type {
  MCPTask,
  MCPProject,
  ListTasksOptions,
  UpdateTaskOptions
} from './services/review-watcher-service.js';

// When implementing features, Claude Code will directly invoke MCP tools
// The service provides type safety and documentation
```

## Task Status Flow

Tasks in VibeKanban follow this status progression:

```
todo → inprogress → inreview → (done | cancelled)
                    ↓
                 inprogress (for revisions)
```

- **todo**: Task is not yet started
- **inprogress**: Task is being actively worked on
- **inreview**: Task is pending review
- **done**: Task is completed
- **cancelled**: Task was cancelled

## Best Practices

1. **Always validate UUIDs** before making MCP calls
2. **Use status filters** when listing tasks to reduce response size
3. **Update task status** when moving between workflow stages
4. **Use workspace sessions** for multi-step task execution
5. **Handle errors gracefully** using try-catch blocks

## Error Handling

MCP tools may throw errors in the following cases:

- Invalid UUID format
- Missing required parameters
- Network connectivity issues
- Permission denied
- Resource not found

Always wrap MCP tool calls in try-catch blocks:

```typescript
try {
  const result = await mcp__vibe_kanban__get_task({
    task_id: taskId
  });
  // Process result
} catch (error) {
  console.error('Failed to get task:', error);
  // Handle error
}
```

## Testing

The MCP integration has been tested and verified:

- ✅ All 8 MCP tools are functional
- ✅ Type definitions are accurate
- ✅ Error handling works correctly
- ✅ Integration with EventEmitter works

## Future Enhancements

Potential improvements to consider:

1. **Retry Logic**: Automatic retry on transient failures
2. **Caching**: Cache frequently accessed data (projects, repos)
3. **Batch Operations**: Support for bulk task operations
4. **Webhooks**: Real-time notifications for task changes
5. **Advanced Filtering**: More sophisticated task query options

## Related Documentation

- [VibeKanban Documentation](https://docs.vibekanban.com)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [Claude Code MCP Integration Guide](https://claude.ai/mcp-integration)
