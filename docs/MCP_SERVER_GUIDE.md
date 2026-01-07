# DevFlow MCP Server - Integration Guide

This guide explains how to integrate and use the DevFlow MCP Server with Claude Code and other MCP-compatible clients.

## Overview

The DevFlow MCP Server exposes DevFlow's AI development capabilities as MCP (Model Context Protocol) tools, allowing Claude Code and other AI clients to interact with DevFlow's features directly.

## Quick Start

### 1. Build the MCP Server

```bash
cd /path/to/DevFlow

# Install dependencies
npm install

# Build the MCP server
npm run build --workspace=@devflow/mcp-server
```

### 2. Configure Claude Code

Add the MCP server to your Claude Code settings:

**For Claude Code Desktop:**

Edit `~/.claude.json` (create if doesn't exist):

```json
{
  "mcpServers": {
    "devflow": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/DevFlow/apps/mcp-server/build/index.js"],
      "env": {
        "DEVFLOW_SERVER_URL": "http://localhost:3008",
        "DEVFLOW_API_KEY": "your-api-key"
      }
    }
  }
}
```

**For VSCode Extension:**

Edit `.claude/config.json` in your project:

```json
{
  "mcpServers": {
    "devflow": {
      "command": "node",
      "args": ["${workspaceFolder}/apps/mcp-server/build/index.js"],
      "env": {
        "DEVFLOW_SERVER_URL": "http://localhost:3008",
        "DEVFLOW_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 3. Start DevFlow Server

```bash
# In one terminal
cd /path/to/DevFlow
npm run dev:server
```

### 4. Restart Claude Code

Restart Claude Code to load the new MCP server. You should see "devflow-mcp-server" in the MCP servers list.

## Available Tools

### Agent Operations

```typescript
// Start a new agent session
start_agent({
  workingDirectory: '/path/to/project',
  message: 'Help me understand this codebase',
  model: 'claude-sonnet-4.5',
});

// Send a message
send_message({
  sessionId: 'session-123',
  message: 'What are the main components?',
});

// Get conversation history
get_conversation_history({ sessionId: 'session-123' });

// Stop the agent
stop_agent({ sessionId: 'session-123' });
```

### Session Management

```typescript
// List all sessions
list_sessions();

// Create a new session
create_session({
  workingDirectory: '/path/to/project',
  name: 'API Refactoring',
  tags: ['backend', 'api'],
});

// Update session
update_session({
  sessionId: 'session-123',
  name: 'New Name',
  tags: ['updated'],
});
```

### Feature Management

```typescript
// List features
list_features({
  status: ['backlog', 'in-progress'],
  limit: 20,
});

// Create a feature
create_feature({
  title: 'Add user authentication',
  description: 'Implement OAuth2 login',
  type: 'feature',
  priority: 1,
});

// Update feature
update_feature({
  id: 'feature-123',
  status: 'in-progress',
});
```

### Beads Issue Tracking

```typescript
// List issues
list_beads_issues({
  status: ['open', 'in_progress'],
  type: ['bug', 'feature'],
  priorityMin: 0,
  priorityMax: 2,
});

// Create an issue
create_beads_issue({
  title: 'Fix memory leak',
  description: 'Memory usage increases over time',
  type: 'bug',
  priority: 0,
  labels: ['critical', 'performance'],
});

// Get ready work
get_ready_work();
```

### Skills Execution

```typescript
// Research
execute_research({
  projectPath: '/path/to/project',
  query: 'How does the authentication work?',
  maxResults: 10,
});

// Implementation
execute_implementation({
  projectPath: '/path/to/project',
  featureId: 'feature-123',
  description: 'Add JWT token validation',
});

// CI/CD
run_cicd({
  projectPath: '/path/to/project',
  skipE2E: false,
});

// Workflow
execute_workflow({
  issueId: 'beads-456',
  projectPath: '/path/to/project',
  mode: 'semi', // or "auto"
});
```

### File Operations

```typescript
// Read a file
read_file({ path: '/path/to/file.ts' });

// Write a file
write_file({
  path: '/path/to/file.ts',
  content: "export function hello() { return 'world'; }",
});

// List directory
read_directory({ path: '/path/to/dir' });

// Check path exists
path_exists({ path: '/path/to/file' });

// Get file stats
get_file_stats({ path: '/path/to/file' });
```

### Git Operations

```typescript
// Get worktree status
get_worktree_status({ path: '/path/to/project' });

// Get diffs
get_git_diffs({ path: '/path/to/project' });

// Commit changes
commit_changes({
  path: '/path/to/project',
  message: 'feat: add new feature',
});
```

## Example Workflows

### 1. Research and Implement a Feature

```
You: I need to add user authentication to my project

Claude: I'll help you implement user authentication. Let me start by researching
the existing codebase to understand the current architecture.

[Calls: execute_research with query about current auth]

Claude: Based on my research, I can see you're using Express.js with JWT tokens.
Let me create a Beads issue to track this work.

[Calls: create_beads_issue with title and description]

Claude: Now let me create a feature on the Kanban board and start implementation.

[Calls: create_feature, then execute_workflow]
```

### 2. Debug an Issue

```
You: I'm getting a memory leak in production

Claude: Let me investigate this. First, I'll create a bug report in Beads.

[Calls: create_beads_issue with type: "bug", priority: 0]

Claude: Now let me search the codebase for memory-related patterns.

[Calls: execute_research with query about memory usage]

Claude: I found several potential issues. Let me read the relevant files and
create a fix.

[Calls: read_file, write_file, then commit_changes]
```

### 3. Code Review Workflow

```
You: Review my changes before I commit

Claude: I'll run CI/CD validation on your changes.

[Calls: run_cicd]

Claude: The linting found 3 issues. Let me fix them and run again.

[Calls: read_file, write_file, run_cicd]

Claude: All checks pass now. Ready to commit!

[Calls: get_git_diffs to review, then commit_changes]
```

## WebSocket Event Streaming

When enabled, the MCP server receives real-time events from DevFlow:

```typescript
// Events are available as resources
devflow:///events/latest
```

To enable event streaming, set in your MCP server config:

```json
{
  "env": {
    "DEVFLOW_ENABLE_EVENTS": "true"
  }
}
```

### Event Categories

- **Agent Events**: `agent:started`, `agent:completed`, `agent:error`
- **Feature Events**: `feature:started`, `feature:completed`, `feature:progress`
- **Beads Events**: `beads:issue-created`, `beads:agent-assigned`, `beads:helper-spawned`
- **Skill Events**: `skill:started`, `skill:completed`, `skill:stage-changed`
- **Workflow Events**: `workflow:checkpoint-created`, `workflow:completed`
- **Hook Events**: `hook:executed`, `hook:blocked`

## Troubleshooting

### MCP Server Not Starting

1. Check if DevFlow is running:

   ```bash
   curl http://localhost:3008/api/health
   ```

2. Verify the MCP server built successfully:

   ```bash
   ls apps/mcp-server/build/index.js
   ```

3. Check for API key issues:
   ```bash
   # In DevFlow server logs, look for auth errors
   ```

### Tools Not Available in Claude Code

1. Restart Claude Code after adding the MCP server
2. Check Claude Code's MCP server list for connection status
3. Verify the path in `args` is absolute, not relative
4. Check Claude Code's developer console for errors

### Permission Errors

File operations may fail if the path isn't in DevFlow's allowed paths:

1. Check DevFlow's `ALLOWED_PATHS` setting
2. Use paths within your workspace/project directory
3. For system paths, configure in DevFlow settings

### WebSocket Events Not Received

1. Ensure `DEVFLOW_ENABLE_EVENTS=true`
2. Check that the WebSocket URL is correct
3. Verify DevFlow's WebSocket server is running on `/api/events`
4. Check for firewall issues blocking WebSocket connections

## Advanced Configuration

### Custom Server URL

For remote DevFlow instances:

```json
{
  "env": {
    "DEVFLOW_SERVER_URL": "https://devflow.example.com",
    "DEVFLOW_WS_URL": "wss://devflow.example.com"
  }
}
```

### Timeout and Retry Settings

```json
{
  "env": {
    "DEVFLOW_TIMEOUT": "60000",
    "DEVFLOW_MAX_RETRIES": "5",
    "DEVFLOW_RETRY_DELAY": "2000"
  }
}
```

### Multiple DevFlow Instances

You can configure multiple MCP servers for different DevFlow instances:

```json
{
  "mcpServers": {
    "devflow-local": {
      "command": "node",
      "args": ["~/projects/DevFlow/apps/mcp-server/build/index.js"],
      "env": {
        "DEVFLOW_SERVER_URL": "http://localhost:3008"
      }
    },
    "devflow-staging": {
      "command": "node",
      "args": ["~/projects/DevFlow/apps/mcp-server/build/index.js"],
      "env": {
        "DEVFLOW_SERVER_URL": "https://staging.example.com"
      }
    }
  }
}
```

## Security Best Practices

1. **API Key Storage**: Use environment variables, never hardcode API keys
2. **HTTPS Only**: Use HTTPS for remote DevFlow instances
3. **Path Restrictions**: Configure allowed paths in DevFlow settings
4. **Rate Limiting**: DevFlow's built-in rate limiting applies to MCP calls
5. **Audit Logs**: Check DevFlow logs for MCP tool usage

## Support

For issues or questions:

- Check DevFlow logs at `./data/logs/`
- Enable MCP debug logging: set `DEBUG=mcp:*`
- Report issues at: https://github.com/0xtsotsi/DevFlow/issues
