---
name: init
description: Initialize Vibe-Kanban board lifecycle automation system
---

# Vibe-Kanban Board Lifecycle Initialization

This command initializes the complete Vibe-Kanban board lifecycle automation system including webhooks, services, and orchestrator.

## IMPORTANT: Separation of Concerns

**This system is for Vibe-Kanban automations ONLY.** It is completely independent from any target project (e.g., DevFlow). The automation system:

- Lives entirely within Vibe-Kanban's ecosystem
- Uses Vibe-Kanban MCP tools for task coordination
- Can work with ANY GitHub repository (configured per project)
- Does NOT depend on or reuse target project internals

## Step 1: Verify Prerequisites

### Check Environment Variables

First verify that required environment variables are set in `.env`:

```bash
# Check if .env exists
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi

# Required variables
source .env 2>/dev/null || true

echo "Checking prerequisites..."
echo ""

# Check ANTHROPIC_API_KEY
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ ANTHROPIC_API_KEY not set"
  echo "   Add to .env: ANTHROPIC_API_KEY=sk-ant-..."
else
  echo "✅ ANTHROPIC_API_KEY is set"
fi

# Check PORT
PORT=${PORT:-3008}
echo "✅ Server port: $PORT"

# Check GitHub repo
ORCHESTRATOR_GITHUB_REPO=${ORCHESTRATOR_GITHUB_REPO:-$(git remote get-url origin 2>/dev/null | sed 's/.*:\(.*\)\.git/\1/' || echo "owner/repo")}
echo "✅ GitHub repo: $ORCHESTRATOR_GITHUB_REPO"
```

### Generate Webhook Secret (if missing)

```bash
# Generate webhook secret if not set
if [ -z "$GITHUB_WEBHOOK_SECRET" ]; then
  echo ""
  echo "🔐 Generating GITHUB_WEBHOOK_SECRET..."
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "GITHUB_WEBHOOK_SECRET=$SECRET" >> .env
  echo "✅ GITHUB_WEBHOOK_SECRET generated and added to .env"
else
  echo "✅ GITHUB_WEBHOOK_SECRET is set"
fi
```

## Step 2: Connect to Vibe-Kanban

Use the Vibe-Kanban MCP tools to verify connectivity and get project info:

```typescript
// Use mcp__vibe_kanban__list_projects to verify connectivity
// Expected result: List of available Vibe-Kanban projects
```

Ask user: "Which Vibe-Kanban project should be used for board lifecycle automation?"

**Available projects** (list from `mcp__vibe_kanban__list_projects`):

- Select the project or create a new one

## Step 3: Configure GitHub Webhook

### Option A: Manual Setup (GitHub UI)

1. Go to: https://github.com/[OWNER]/[REPO]/settings/hooks
2. Click "Add webhook"
3. Configure:
   - **Payload URL**: `https://your-domain.com/api/github/webhook`
   - For local development, use a tunnel (see Option C)
   - **Content type**: `application/json`
   - **Secret**: Use your `GITHUB_WEBHOOK_SECRET` value
   - **Events**: Select "Pull requests", "Workflow runs", "Pushes"
4. Click "Add webhook"

### Option B: GitHub CLI

```bash
# Register webhook via gh CLI
gh webhook create \
  --repo $ORCHESTRATOR_GITHUB_REPO \
  --url https://your-domain.com/api/github/webhook \
  --secret $GITHUB_WEBHOOK_SECRET \
  --events pull_request,push,workflow_run
```

### Option C: Local Development Tunnel

For local development, expose localhost via tunnel:

```bash
# Using cloudflare tunnel (recommended, free)
cloudflared tunnel --url http://localhost:3008

# Or using ngrok
ngrok http 3008

# Use the resulting HTTPS URL for webhook registration
```

## Step 4: Start the Server

```bash
# Start the DevFlow server (hosting the automation API)
npm run dev:server
```

Verify server is running:

```bash
# Check server health
curl http://localhost:3008/api/health

# Check orchestrator status
curl http://localhost:3008/api/orchestrator/status
```

## Step 5: Start the Orchestrator

### Via API:

```bash
curl -X POST http://localhost:3008/api/orchestrator/start
```

### Via UI:

Navigate to http://localhost:3008 and use the orchestrator controls.

## Step 6: Verify Board Hygiene

Run a board hygiene check to validate the system:

```bash
# This will check all "done" tasks meet criteria
curl http://localhost:3008/api/orchestrator/board-hygiene
```

## Step 7: List Repositories (for Workspace Sessions)

Get the repositories configured for the Vibe-Kanban project:

```typescript
// Use mcp__vibe_kanban__list_repos with the selected project_id
// This returns repositories that agents can work on via workspace sessions
```

## Configuration Summary

After initialization, the system will be configured with:

| Component      | Status        | Endpoint/Config              |
| -------------- | ------------- | ---------------------------- |
| GitHub Webhook | ✅ Registered | `/api/github/webhook`        |
| CI Service     | ✅ Monitoring | Polling every 30s            |
| Task State     | ✅ Persisted  | `.automaker/task-state.json` |
| Board Hygiene  | ✅ Enforcing  | Zero fake done rule          |
| Orchestrator   | ✅ Running    | Processing tasks             |

## Troubleshooting

**Webhook not receiving events:**

- Verify `GITHUB_WEBHOOK_SECRET` matches between GitHub and `.env`
- Test webhook URL accessibility: `curl -X POST https://your-webhook-url`
- Check server logs for signature verification errors

**Orchestrator not starting:**

- Verify `ANTHROPIC_API_KEY` is valid
- Check Vibe-Kanban project exists and is accessible
- Review server logs for connection errors

**Tasks not auto-completing on merge:**

- Verify webhook receives `pull_request` events
- Check task description contains `PR Created: #123` pattern
- Ensure orchestrator is tracking the task

## Next Steps

1. Create a task in Vibe-Kanban to test the full lifecycle
2. Monitor the orchestrator as it processes through all phases
3. Verify webhook events trigger state transitions
4. Confirm auto-completion when PR merges

The system is now ready for end-to-end automated task lifecycle management!
