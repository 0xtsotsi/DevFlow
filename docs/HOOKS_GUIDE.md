# Hooks System Guide

The Hooks System allows custom code execution at key workflow points, enabling automation, validation, and integration with external tools.

## Overview

Hooks are JavaScript functions that execute at specific points in the development lifecycle:

- **Pre-Task Hooks** - Run before starting a task
- **Post-Task Hooks** - Run after completing a task
- **Pre-Commit Hooks** - Run before committing changes

## Hook Types

### Pre-Task Hooks

Execute before starting any development task:

```javascript
// Example: Check git status
{
  type: 'pre-task',
  name: 'Check Git Status',
  description: 'Verify git repository is in clean state',
  mode: 'blocking',
  enabled: true,
  priority: 100,
  timeout: 10000,
  implementation: `
    const { execSync } = require('child_process');
    try {
      const status = execSync('git status --porcelain', {
        cwd: context.projectPath,
        encoding: 'utf-8'
      });
      if (status.trim()) {
        return {
          success: false,
          message: 'Working directory has uncommitted changes'
        };
      }
      return { success: true, message: 'Git status clean' };
    } catch (error) {
      return { success: false, message: \`Git check failed: \${error.message}\` };
    }
  `
}
```

### Post-Task Hooks

Execute after completing a task:

```javascript
// Example: Summarize changes
{
  type: 'post-task',
  name: 'Summarize Changes',
  description: 'Show files modified and lines changed',
  mode: 'blocking',
  enabled: true,
  priority: 100,
  timeout: 15000,
  implementation: `
    const { execSync } = require('child_process');
    try {
      const diff = execSync('git diff --stat', {
        cwd: context.projectPath,
        encoding: 'utf-8'
      });
      return {
        success: true,
        message: 'Changes summarized',
        data: { diff: diff.trim() }
      };
    } catch (error) {
      return { success: true, message: 'No changes detected' };
    }
  `
}
```

### Pre-Commit Hooks

Execute before committing changes:

```javascript
// Example: Validate tests
{
  type: 'pre-commit',
  name: 'Validate Tests',
  description: 'Ensure all tests pass before committing',
  mode: 'blocking',
  enabled: true,
  priority: 100,
  timeout: 60000,
  implementation: `
    const { execSync } = require('child_process');
    try {
      execSync('npm run test:all', {
        cwd: context.projectPath,
        stdio: 'pipe'
      });
      return { success: true, message: 'Tests validated' };
    } catch (error) {
      return {
        success: false,
        message: 'Tests failed. Cannot commit with failing tests.'
      };
    }
  `
}
```

## Hook Context

Hooks receive a context object with:

```typescript
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
```

## Hook Return Values

Hooks should return:

```typescript
// Boolean success
return true;

// String message
return 'Hook passed';

// Object with data
return {
  success: true,
  message: 'Hook executed',
  data: { custom: 'value' },
};
```

## Hook Modes

### Blocking Mode

Stops execution if hook fails:

```javascript
{
  mode: 'blocking',
  // ... if this hook fails, workflow stops
}
```

### Non-Blocking Mode

Continues execution even if hook fails:

```javascript
{
  mode: 'non-blocking',
  // ... workflow continues regardless of result
}
```

## API Usage

### List Hooks

```bash
GET /api/hooks
```

**Response:**

```json
{
  "success": true,
  "hooks": [...],
  "stats": {
    "totalHooks": 10,
    "hooksByType": {
      "pre-task": 3,
      "post-task": 4,
      "pre-commit": 3
    },
    "enabledHooks": 8,
    "executionStats": {
      "total": 100,
      "passed": 95,
      "failed": 3,
      "blocked": 2,
      "avgExecutionTime": 250
    }
  }
}
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

**Response:**

```json
{
  "success": true,
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

## Default Hooks

DevFlow includes default hooks:

### Pre-Task Defaults

1. **Check Git Status** - Verify clean git state
2. **Check MCP Availability** - Verify MCP configuration

### Post-Task Defaults

1. **Summarize Changes** - Show git diff stats
2. **Check Test Status** - Verify tests pass

### Pre-Commit Defaults

1. **Validate Tests** - Run all tests
2. **Run Type Check** - TypeScript validation
3. **Check for Debug Code** - Prevent debug code commits

## Custom Hook Examples

### Slack Notification

```javascript
{
  type: 'post-task',
  name: 'Notify Slack',
  mode: 'non-blocking',
  enabled: true,
  priority: 50,
  timeout: 5000,
  implementation: `
    const https = require('https');

    async function sendNotification() {
      const data = JSON.stringify({
        text: \`Task completed in \${context.projectPath}\`
      });

      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'hooks.slack.com',
          path: process.env.SLACK_WEBHOOK_PATH,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(\`Failed: \${res.statusCode}\`));
        });

        req.on('error', reject);
        req.write(data);
        req.end();
      });

      return { success: true, message: 'Notification sent' };
    }

    return sendNotification();
  `
}
```

### Custom Validation

```javascript
{
  type: 'pre-commit',
  name: 'Check File Size',
  mode: 'blocking',
  enabled: true,
  priority: 80,
  timeout: 10000,
  implementation: `
    const fs = require('fs').promises;
    const path = require('path');

    async function checkFileSizes() {
      const files = await fs.readdir(context.projectPath, { recursive: true });
      const largeFiles = [];

      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          const filePath = path.join(context.projectPath, file);
          const stats = await fs.stat(filePath);
          if (stats.size > 10000) { // 10KB
            largeFiles.push({ file, size: stats.size });
          }
        }
      }

      if (largeFiles.length > 0) {
        return {
          success: false,
          message: \`Found \${largeFiles.length} files exceeding 10KB\`,
          data: { files: largeFiles }
        };
      }

      return { success: true, message: 'All files within size limits' };
    }

    return checkFileSizes();
  `
}
```

### Environment Check

```javascript
{
  type: 'pre-task',
  name: 'Check Environment',
  mode: 'blocking',
  enabled: true,
  priority: 100,
  timeout: 5000,
  implementation: `
    const requiredEnvVars = ['NODE_ENV', 'DATABASE_URL'];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        return {
          success: false,
          message: \`Missing environment variable: \${envVar}\`
        };
      }
    }

    return { success: true, message: 'Environment configured' };
  `
}
```

## Configuration

```bash
# .env
HOOKS_ENABLED=true
HOOKS_TIMEOUT=30000
HOOKS_DEFAULT_MODE=blocking
```

## Priority System

Hooks execute in priority order (higher priority first):

```javascript
// Priority 100: Critical hooks
{ name: 'Check Git Status', priority: 100 }

// Priority 90: High priority
{ name: 'Check MCP Availability', priority: 90 }

// Priority 50: Medium priority
{ name: 'Notify Slack', priority: 50 }

// Priority 0: Low priority (default)
{ name: 'Log Stats', priority: 0 }
```

## Best Practices

1. **Use Timeouts** - Prevent hanging hooks
2. **Handle Errors** - Return proper error messages
3. **Keep It Simple** - Don't overcomplicate hook logic
4. **Use Non-Blocking** - For non-critical hooks
5. **Set Priorities** - Control execution order
6. **Test Hooks** - Use validate endpoint before registering
7. **Provide Context** - Include useful data in return values

## Troubleshooting

**Hook timing out:**

- Increase timeout value
- Optimize hook implementation
- Use non-blocking mode

**Hook failing silently:**

- Check hook logs
- Enable verbose logging
- Test hook implementation manually

**Hooks not executing:**

- Verify hooks are enabled
- Check event listeners
- Confirm hook type matches event

## See Also

- [Skills Guide](./SKILLS_GUIDE.md) - Skills system
- [Workflow Orchestration Guide](./WORKFLOW_ORCHESTRATION_GUIDE.md) - Workflow integration
