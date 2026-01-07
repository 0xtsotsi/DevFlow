# DevFlow MCP Server

Model Context Protocol (MCP) server for DevFlow AI Development Studio. This server exposes DevFlow's capabilities as MCP tools that can be used in Claude Code and other MCP-compatible AI clients.

## Features

The DevFlow MCP Server provides the following tool categories:

### Agent Tools

- `start_agent` - Start or resume a conversation with a Claude AI agent
- `send_message` - Send a message to a running agent session
- `get_conversation_history` - Get conversation history for a session
- `stop_agent` - Stop a running agent session
- `clear_conversation` - Clear conversation history

### Session Tools

- `list_sessions` - List all DevFlow agent sessions
- `create_session` - Create a new session
- `update_session` - Update session metadata
- `archive_session` - Archive a session
- `delete_session` - Delete a session

### Feature Tools

- `list_features` - List Kanban features with filters
- `get_feature` - Get details of a specific feature
- `create_feature` - Create a new feature
- `update_feature` - Update an existing feature
- `delete_feature` - Delete a feature

### Beads Tools

- `list_beads_issues` - List Beads issues with filters
- `create_beads_issue` - Create a new Beads issue
- `update_beads_issue` - Update an existing issue
- `delete_beads_issue` - Delete a Beads issue
- `get_ready_work` - Get ready (unblocked) work items

### Skills Tools

- `execute_research` - Execute comprehensive research (codebase, web, memory)
- `execute_implementation` - Execute AI-powered code implementation
- `run_cicd` - Run CI/CD validation (linting, tests, build)
- `execute_workflow` - Execute workflow orchestration

### File System Tools

- `read_file` - Read file contents
- `write_file` - Write content to a file
- `read_directory` - List directory contents
- `path_exists` - Check if a path exists
- `get_file_stats` - Get file/directory statistics

### Worktree Tools

- `get_worktree_status` - Get current Git worktree status
- `get_git_diffs` - Get Git diffs for uncommitted changes
- `commit_changes` - Commit Git changes

### Resources

- `devflow:///events/latest` - Latest DevFlow events from the event stream

## Installation

### From Source

```bash
# Navigate to the MCP server directory
cd apps/mcp-server

# Install dependencies
npm install

# Build the server
npm run build

# The built server will be in build/index.js
```

### Global Installation

```bash
npm install -g @devflow/mcp-server
```

## Configuration

The MCP server is configured via environment variables:

| Variable                | Required | Default                 | Description                      |
| ----------------------- | -------- | ----------------------- | -------------------------------- |
| `DEVFLOW_SERVER_URL`    | No       | `http://localhost:3008` | DevFlow server URL               |
| `DEVFLOW_API_KEY`       | Yes\*    | -                       | API key for authentication       |
| `DEVFLOW_WS_URL`        | No       | Derived from SERVER_URL | WebSocket URL for events         |
| `DEVFLOW_TIMEOUT`       | No       | `30000`                 | Request timeout in milliseconds  |
| `DEVFLOW_ENABLE_EVENTS` | No       | `true`                  | Enable WebSocket event streaming |
| `DEVFLOW_MAX_RETRIES`   | No       | `3`                     | Maximum retry attempts           |
| `DEVFLOW_RETRY_DELAY`   | No       | `1000`                  | Retry delay in milliseconds      |

\*Required in production mode, optional in development

## Usage

### With Claude Code

Add the MCP server to your Claude Code configuration:

**For local development (stdio transport):**

```json
{
  "mcpServers": {
    "devflow": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/DevFlow/apps/mcp-server/build/index.js"],
      "env": {
        "DEVFLOW_SERVER_URL": "http://localhost:3008",
        "DEVFLOW_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**For HTTP transport:**

```json
{
  "mcpServers": {
    "devflow": {
      "type": "http",
      "url": "http://localhost:3009/sse",
      "headers": {
        "X-API-Key": "your-api-key-here"
      }
    }
  }
}
```

### Standalone Usage

You can run the MCP server as a standalone HTTP server:

```bash
# Set environment variables
export DEVFLOW_SERVER_URL="http://localhost:3008"
export DEVFLOW_API_KEY="your-api-key-here"

# Start the server (will auto-detect transport)
node build/index.js
```

The server will:

- Use stdio transport if run as a subprocess (stdin is not a TTY)
- Use SSE HTTP transport on port 3009 if run in a terminal

### HTTP SSE Mode

To run the server in HTTP SSE mode explicitly:

```bash
export DEVFLOW_SERVER_URL="http://localhost:3008"
export DEVFLOW_API_KEY="your-api-key-here"
export DEVFLOW_ENABLE_EVENTS="true"

node build/index.js
```

The SSE endpoint will be available at `http://localhost:3009/sse`

## Development

```bash
# Watch mode for development
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Build
npm run build
```

## Architecture

```
┌─────────────────┐     HTTP     ┌──────────────────┐
│  Claude Code    │◄────────────►│  DevFlow MCP     │
│   (MCP Client)  │              │     Server       │
└─────────────────┘              └────────┬─────────┘
                                          │
                                          │ WebSocket (optional)
                                          ▼
                                   ┌──────────────────┐
                                   │   DevFlow API    │
                                   │  (Port 3008)     │
                                   └──────────────────┘
```

The MCP server acts as a bridge between:

1. **MCP clients** (like Claude Code) using the Model Context Protocol
2. **DevFlow's HTTP API** for actual functionality
3. **DevFlow's WebSocket** for real-time event streaming

## WebSocket Events

When `DEVFLOW_ENABLE_EVENTS=true`, the server connects to DevFlow's WebSocket endpoint to receive real-time events. Events are forwarded to MCP clients that subscribe to the event resources.

Supported event types include:

- `agent:*` - Agent lifecycle events
- `feature:*` - Feature implementation events
- `beads:*` - Beads issue tracker events
- `skill:*` - Skill execution events
- `workflow:*` - Workflow orchestration events
- `hook:*` - Hook execution events

## Troubleshooting

### Connection Issues

If the MCP server can't connect to DevFlow:

1. Verify DevFlow is running: `curl http://localhost:3008/api/health`
2. Check your API key is valid
3. Ensure CORS is configured correctly in DevFlow

### Event Streaming Not Working

If events aren't being received:

1. Check `DEVFLOW_ENABLE_EVENTS=true` is set
2. Verify the WebSocket URL is correct
3. Check DevFlow logs for WebSocket connection errors

### Permission Errors

Some file operations may fail due to path restrictions. Ensure the project path is allowed in DevFlow's configuration.

## License

MIT
