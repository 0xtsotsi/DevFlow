# MCP (Model Context Protocol) Setup Guide

MCP servers extend DevFlow's capabilities by providing specialized tools for web research, code search, and browser automation.

## Overview

DevFlow integrates with three MCP servers:

1. **Exa MCP** - Web search and research capabilities
2. **Grep MCP** - Code pattern search across GitHub
3. **Playwright MCP** - Browser automation (optional)

## Quick Setup

### 1. Automatic Configuration

DevFlow can auto-configure MCP servers:

```bash
# Enable auto-configuration in .env
MCP_AUTO_CONFIGURE=true

# Restart server
npm run dev:server
```

The system will:

- Create `.mcp.json` configuration file
- Update `.claude/settings.json` permissions
- Configure all enabled MCP servers

### 2. Manual Configuration

If you prefer manual setup:

```bash
# Create .mcp.json
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "exa": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-exa"],
      "env": {
        "EXA_API_KEY": "${EXA_API_KEY}"
      }
    },
    "grep": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-grep"]
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@executeautomation/playwright-mcp-server"],
      "env": {
        "HEADLESS": "true"
      }
    }
  }
}
EOF

# Create .claude directory
mkdir -p .claude

# Create settings.json with permissions
cat > .claude/settings.json << 'EOF'
{
  "permissions": {
    "mcp__exa__get_code_context_exa": true,
    "mcp__exa__web_search_exa": true,
    "mcp__grep__searchGitHub": true,
    "mcp__zai-mcp-server__analyze_image": true,
    "mcp__zai-mcp-server__extract_text_from_screenshot": true
  }
}
EOF
```

## Exa MCP Server

### Capabilities

- Web search for current information
- Code documentation research
- API documentation lookup
- Best practices research

### Installation

```bash
# Get API key from https://dev.exa.ai
export EXA_API_KEY="your-api-key-here"
```

### Configuration

```bash
# .env
EXA_API_KEY=your-api-key-here

# Or in .mcp.json
{
  "mcpServers": {
    "exa": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-exa"],
      "env": {
        "EXA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Usage

```typescript
// Via Research Skill
await researchSkillService.execute({
  projectPath: process.cwd(),
  query: 'React hooks best practices 2024',
  maxResults: 10,
});

// Direct MCP call
await mcpBridge.callTool('mcp__exa__get_code_context_exa', {
  query: 'Express.js TypeScript error handling',
  tokensNum: 5000,
});
```

### Available Tools

- `mcp__exa__get_code_context_exa` - Get code documentation
- `mcp__exa__web_search_exa` - Web search

## Grep MCP Server

### Capabilities

- Search code across GitHub
- Find implementation examples
- Discover usage patterns
- Explore open source code

### Installation

```bash
# No API key required
# Grep MCP is enabled by default

# .env
GREP_MCP_ENABLED=true
```

### Configuration

```bash
# .mcp.json
{
  "mcpServers": {
    "grep": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-grep"]
    }
  }
}
```

### Usage

```typescript
// Search for code patterns
await mcpBridge.callTool('mcp__grep__searchGitHub', {
  query: 'useState(',
  language: ['TypeScript', 'JavaScript'],
  matchCase: false,
  useRegexp: false,
});
```

### Available Tools

- `mcp__grep__searchGitHub` - Search GitHub code

## Playwright MCP Server

### Capabilities

- Browser automation
- Screenshot capture
- Form testing
- E2E testing

### Installation

```bash
# Optional - disabled by default

# .env
PLAYWRIGHT_MCP_ENABLED=true
```

### Configuration

```bash
# .mcp.json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@executeautomation/playwright-mcp-server"],
      "env": {
        "HEADLESS": "true"
      }
    }
  }
}
```

### Usage

```typescript
// Capture screenshot
await mcpBridge.callTool('mcp__zai-mcp-server__analyze_image', {
  imageSource: 'https://example.com/screenshot.png',
  prompt: 'Describe the UI elements on this page',
});
```

### Available Tools

- `mcp__zai-mcp-server__analyze_image` - Image analysis
- `mcp__zai-mcp-server__diagnose_error_screenshot` - Error diagnosis
- `mcp__zai-mcp-server__extract_text_from_screenshot` - OCR
- `mcp__zai-mcp-server__ui_to_artifact` - UI to code

## Verification

### Check Configuration

```bash
# Verify MCP configuration
curl http://localhost:3008/api/mcp/status

# Response:
{
  "success": true,
  "configured": true,
  "servers": ["exa", "grep", "playwright"],
  "missing": []
}
```

### Test MCP Servers

```bash
# Test Exa
curl -X POST http://localhost:3008/api/skills/research \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "query": "TypeScript best practices"
  }'

# Test Grep
# (automatically tested when using Research skill)

# Test Playwright
curl -X POST http://localhost:3008/api/skills/implement \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-ui",
    "sessionId": "session-1",
    "projectPath": "/path/to/project",
    "description": "Analyze UI design"
  }'
```

## Environment Variables

```bash
# MCP Configuration
MCP_AUTO_CONFIGURE=true
MCP_TIMEOUT=30000

# Exa MCP
EXA_API_KEY=your-key-here

# Grep MCP
GREP_MCP_ENABLED=true

# Playwright MCP
PLAYWRIGHT_MCP_ENABLED=false
```

## Permissions

MCP tools require permissions in `.claude/settings.json`:

```json
{
  "permissions": {
    "mcp__exa__get_code_context_exa": true,
    "mcp__exa__web_search_exa": true,
    "mcp__grep__searchGitHub": true,
    "mcp__zai-mcp-server__analyze_image": true,
    "mcp__zai-mcp-server__analyze_video": true,
    "mcp__zai-mcp-server__diagnose_error_screenshot": true,
    "mcp__zai-mcp-server__extract_text_from_screenshot": true,
    "mcp__zai-mcp-server__ui_diff_check": true,
    "mcp__zai-mcp-server__ui_to_artifact": true,
    "mcp__zai-mcp-server__understand_technical_diagram": true
  }
}
```

## Troubleshooting

### MCP Server Not Starting

**Symptoms:**

- Skills fail with "MCP not available" error
- No search results

**Solutions:**

```bash
# Check .mcp.json exists
cat .mcp.json

# Verify npx is available
which npx

# Test MCP server manually
npx -y @modelcontextprotocol/server-exa

# Check logs
npm run dev:server
```

### Exa API Key Issues

**Symptoms:**

- Web search fails
- "Missing EXA_API_KEY" error

**Solutions:**

```bash
# Verify API key is set
echo $EXA_API_KEY

# Add to .env
echo "EXA_API_KEY=your-key" >> .env

# Restart server
npm run dev:server
```

### Permission Denied Errors

**Symptoms:**

- "Tool not allowed" errors
- MCP calls rejected

**Solutions:**

```bash
# Check permissions in .claude/settings.json
cat .claude/settings.json

# Ensure tools are enabled
# Use MCPConfigurationService to auto-configure
```

### Timeout Issues

**Symptoms:**

- MCP calls hang
- Skills timeout

**Solutions:**

```bash
# Increase timeout
export MCP_TIMEOUT=60000

# Or in .env
echo "MCP_TIMEOUT=60000" >> .env
```

## Best Practices

1. **Auto-Configure First** - Use built-in configuration
2. **Secure API Keys** - Use .env for sensitive data
3. **Enable Only Needed** - Disable unused MCP servers
4. **Set Timeouts** - Prevent hanging operations
5. **Monitor Usage** - Track API quota usage
6. **Cache Results** - Reduce redundant API calls
7. **Handle Failures** - Implement graceful degradation

## Advanced Configuration

### Custom MCP Servers

Add custom MCP servers to `.mcp.json`:

```json
{
  "mcpServers": {
    "custom-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "CUSTOM_VAR": "value"
      }
    }
  }
}
```

### MCP Bridge Direct Usage

```typescript
import { getMCPBridge } from './lib/mcp-bridge.js';

const mcpBridge = getMCPBridge(events);

// Call any MCP tool
const result = await mcpBridge.callTool(
  'tool-name',
  {
    /* parameters */
  },
  { timeout: 30000, throwOnError: true }
);
```

## See Also

- [Skills Guide](./SKILLS_GUIDE.md) - Using MCP with skills
- [Hooks Guide](./HOOKS_GUIDE.md) - Custom workflow automation
- [MCP Specification](https://modelcontextprotocol.io) - Protocol details
