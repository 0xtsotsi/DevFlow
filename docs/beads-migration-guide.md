# Beads Autonomous Agent System - Migration & Rollback Guide

This guide provides comprehensive migration and rollback procedures for the Beads-inspired autonomous agent memory system and related features deployed in DevFlow.

**Last Updated:** 2025-01-02
**Version:** 1.0.0
**Features Covered:** Beads Live Link, Beads Memory, Beads Coordinator, Specialized Agents, Skills, Hooks, Workflow Orchestrator

---

## Table of Contents

1. [Pre-Migration Checklist](#pre-migration-checklist)
2. [Feature Overview](#feature-overview)
3. [Migration Process](#migration-process)
4. [Feature-Specific Rollback Procedures](#feature-specific-rollback-procedures)
5. [Data Migration Strategies](#data-migration-strategies)
6. [Testing & Verification](#testing--verification)
7. [Monitoring & Validation](#monitoring--validation)
8. [Emergency Rollback Procedures](#emergency-rollback-procedures)
9. [Troubleshooting](#troubleshooting)
10. [Appendix: Rollback Scripts](#appendix-rollback-scripts)

---

## Pre-Migration Checklist

### Environment Validation

Before enabling any Beads-related features, ensure:

- [ ] **Beads CLI Installed**: Verify `bd` command is available

  ```bash
  which bd
  bd --version
  ```

- [ ] **Node.js Version**: Node.js 18+ installed

  ```bash
  node --version  # Should be v18+
  ```

- [ ] **Database Backup**: Current `.beads.db` backed up (if exists)

  ```bash
  cp .beads.db .beads.db.backup.$(date +%Y%m%d_%H%M%S)
  ```

- [ ] **Environment Variables**: Review and document current `.env` settings

  ```bash
  cat .env
  ```

- [ ] **Git Status**: Clean working directory
  ```bash
  git status
  git stash save "pre-migration state"
  ```

### Feature Flag Audit

Document current feature states:

```bash
# Check current Beads-related environment variables
grep -E "(BEADS|COORDINATION|MEMORY|LIVE_LINK|SKILL|HOOK|WORKFLOW)" .env || echo "No Beads features configured yet"
```

### Resource Requirements

Ensure sufficient resources:

- **Disk Space**: 100MB+ for Beads database growth
- **Memory**: 512MB+ additional RAM for agent coordination
- **API Quotas**: Sufficient Anthropic API tokens for agent operations
- **Rate Limits**: MCP server rate limits checked (Exa, Grep)

---

## Feature Overview

### 1. Beads Live Link Service

**Purpose:** Automatically creates Beads issues from agent errors and requests

**File Location:** `/apps/server/src/services/beads-live-link-service.ts` (485 lines)

**Key Capabilities:**

- Auto-creates issues on agent errors with severity assessment
- Rate limiting: 20 issues/hour (configurable)
- Deduplication with 24-hour cache
- Smart priority assignment (P0-P3)

**Environment Variables:**

```bash
BEADS_AUTO_ISSUES_ENABLED=true
BEADS_MAX_AUTO_ISSUES_PER_HOUR=20
BEADS_DEDUPLICATION_ENABLED=true
```

**What Changes:**

- Subscribes to `agent:stream` and `agent:request` events
- Creates issues in Beads database
- Maintains in-memory cache for deduplication

### 2. Beads Memory Service

**Purpose:** Queries past issues as agent context for better decision-making

**File Location:** `/apps/server/src/services/beads-memory-service.ts` (627 lines)

**Key Capabilities:**

- Semantic similarity search (>0.3 threshold)
- Extracts past decisions from closed issues
- AI-generated summaries with web search
- 5-minute cache for performance
- Token estimation to prevent context overflow

**Environment Variables:**

```bash
BEADS_MEMORY_CACHE_TTL=300000  # 5 minutes
BEADS_MEMORY_MAX_RESULTS=10
BEADS_MEMORY_INCLUDE_CLOSED=true
```

**What Changes:**

- Adds `query_beads_memory` tool to agents
- Caches query results
- Calls Exa MCP for web research

### 3. Beads Agent Coordinator

**Purpose:** Autonomous agent coordination without central orchestrator

**File Location:** `/apps/server/src/services/beads-agent-coordinator.ts` (803 lines)

**Key Capabilities:**

- Agent selection scoring: capability match (40%) + success rate (40%) + availability (20%)
- Auto-assigns ready work (issues with no blockers)
- Helper agent spawning for subtasks
- Issue locking prevents duplicate assignments
- Stale agent cleanup (2-hour timeout)

**Environment Variables:**

```bash
BEADS_COORDINATION_ENABLED=true
BEADS_COORDINATION_INTERVAL=30000  # 30 seconds
BEADS_MAX_CONCURRENT_AGENTS=5
BEADS_HELPER_SPAWNING_ENABLED=true
```

**What Changes:**

- Runs coordination loop every 30 seconds
- Auto-assigns agents to Beads issues
- Spawns helper agents for subtasks
- Tracks active agents in memory

### 4. Specialized Agent System

**Purpose:** Task-specific AI agents for different development phases

**File Locations:**

- `/apps/server/src/agents/specialized-agent-service.ts`
- `/apps/server/src/agents/agent-registry.ts`
- `/apps/server/src/agents/task-classifier.ts`
- `/apps/server/src/agents/agent-prompts.ts`

**Key Capabilities:**

- 8 specialized agents: planning, implementation, testing, review, debug, documentation, refactoring, generic
- Intelligent task classification
- Performance tracking and statistics
- Multi-agent workflows

**Environment Variables:**

```bash
SPECIALIZED_AGENTS_ENABLED=true
SPECIALIZED_AGENTS_AUTO_CLASSIFY=true
```

**What Changes:**

- Adds specialized agent types to AgentRegistry
- Routes tasks to appropriate agents
- Tracks performance metrics

### 5. Skills System

**Purpose:** Specialized AI capabilities for common development tasks

**File Locations:**

- `/apps/server/src/services/research-skill-service.ts`
- `/apps/server/src/services/implementation-skill-service.ts`
- `/apps/server/src/services/cicd-skill-service.ts`
- `/apps/server/src/services/workflow-orchestrator-service.ts`

**Key Capabilities:**

- **Research Skill**: Codebase + web + memory research
- **Implementation Skill**: AI-powered code implementation
- **CI/CD Skill**: Automated validation and testing
- **Workflow Orchestrator**: Multi-step workflow coordination

**Environment Variables:**

```bash
# Research
RESEARCH_SKILL_ENABLED=true
RESEARCH_MAX_RESULTS=10
RESEARCH_INCLUDE_CLOSED_ISSUES=true

# Implementation
IMPLEMENTATION_SKILL_ENABLED=true
IMPLEMENTATION_TIMEOUT=300000

# CI/CD
CICD_SKILL_ENABLED=true
CICD_DEFAULT_BRANCH=main

# Workflow
WORKFLOW_MODE=semi
WORKFLOW_AUTO_START=false
WORKFLOW_CHECKPOINT_APPROVAL=true
```

**What Changes:**

- Adds skill endpoints to API
- Registers skill event listeners
- Creates skill service instances

### 6. Hooks System

**Purpose:** Custom code execution at key workflow points

**File Location:** `/apps/server/src/services/hooks-service.ts`

**Key Capabilities:**

- Pre-task, post-task, pre-commit hooks
- Blocking and non-blocking modes
- Hook timeout management
- Priority-based execution

**Environment Variables:**

```bash
HOOKS_ENABLED=true
HOOKS_TIMEOUT=30000
HOOKS_DEFAULT_MODE=blocking
```

**What Changes:**

- Executes hooks at workflow points
- Stores hook configurations in data directory
- Emits hook execution events

---

## Migration Process

### Step 1: Baseline Establishment (5 minutes)

**Purpose:** Document current system state before migration.

```bash
#!/bin/bash
# scripts/baseline-system.sh

BASELINE_DIR="./migration-baseline-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BASELINE_DIR"

# Backup environment
cp .env "$BASELINE_DIR/.env.backup"

# Backup Beads database (if exists)
if [ -f .beads.db ]; then
  cp .beads.db "$BASELINE_DIR/.beads.db.backup"
fi

# Document current issues (if Beads initialized)
if command -v bd &> /dev/null; then
  bd list --format json > "$BASELINE_DIR/issues-before.json" 2>/dev/null || echo "No issues yet"
fi

# Save package state
npm list --depth=0 > "$BASELINE_DIR/npm-packages.txt"

# Git state
git rev-parse HEAD > "$BASELINE_DIR/git-commit.txt"
git diff > "$BASELINE_DIR/git-diff.patch"

echo "Baseline saved to: $BASELINE_DIR"
```

### Step 2: Feature Installation (10 minutes)

**Install Beads CLI (if not already installed):**

```bash
# Check if already installed
if ! command -v bd &> /dev/null; then
  echo "Installing Beads CLI..."
  cargo install beads-ui
else
  echo "Beads CLI already installed: $(bd --version)"
fi
```

**Initialize Beads in Project:**

```bash
# Initialize Beads database
bd init

# Verify initialization
bd list
```

### Step 3: Feature Enablement (15 minutes)

**Update `.env` file with feature flags:**

```bash
# Beads Live Link
echo "BEADS_AUTO_ISSUES_ENABLED=true" >> .env
echo "BEADS_MAX_AUTO_ISSUES_PER_HOUR=20" >> .env
echo "BEADS_DEDUPLICATION_ENABLED=true" >> .env

# Beads Memory
echo "BEADS_MEMORY_CACHE_TTL=300000" >> .env
echo "BEADS_MEMORY_MAX_RESULTS=10" >> .env
echo "BEADS_MEMORY_INCLUDE_CLOSED=true" >> .env

# Beads Coordinator
echo "BEADS_COORDINATION_ENABLED=true" >> .env
echo "BEADS_COORDINATION_INTERVAL=30000" >> .env
echo "BEADS_MAX_CONCURRENT_AGENTS=5" >> .env
echo "BEADS_HELPER_SPAWNING_ENABLED=true" >> .env

# Specialized Agents
echo "SPECIALIZED_AGENTS_ENABLED=true" >> .env
echo "SPECIALIZED_AGENTS_AUTO_CLASSIFY=true" >> .env

# Skills
echo "RESEARCH_SKILL_ENABLED=true" >> .env
echo "IMPLEMENTATION_SKILL_ENABLED=true" >> .env
echo "CICD_SKILL_ENABLED=true" >> .env
echo "WORKFLOW_MODE=semi" >> .env

# Hooks
echo "HOOKS_ENABLED=true" >> .env
```

### Step 4: Server Restart (2 minutes)

```bash
# Stop existing server
pkill -f "node.*server" || echo "No server running"

# Wait for cleanup
sleep 3

# Start server with new features
npm run dev:server

# Verify services initialized in logs
# Look for:
# - "[Server] ✓ Beads LiveLink initialized"
# - "[Server] ✓ Beads Memory Service initialized"
# - "[Server] ✓ Beads Agent Coordinator initialized"
# - "[Server] ✓ Hooks service initialized"
# - "[Server] ✓ Skill services initialized"
```

### Step 5: Verification (10 minutes)

Run verification scripts from [Testing & Verification](#testing--verification) section.

---

## Feature-Specific Rollback Procedures

### Rollback: Beads Live Link Service

**Disable Feature:**

```bash
# Method 1: Environment variable (Recommended - no restart needed if using hot reload)
echo "BEADS_AUTO_ISSUES_ENABLED=false" >> .env

# Method 2: Code modification (Requires restart)
# Edit /apps/server/src/index.ts, line 229:
# Change: autoCreateOnErrors: true
# To:     autoCreateOnErrors: false
```

**What Gets Rolled Back:**

- Automatic issue creation from agent errors stops
- Agent-requested issue creation stops
- Existing issues remain in database
- Deduplication cache clears from memory

**Verify Rollback:**

```bash
# Check logs for "BeadsLiveLink" activity
grep -i "BeadsLiveLink" logs/server.log | tail -20

# Should see: "Auto-issue creation disabled"
# Should NOT see: "Auto-created issue"
```

**Complete Removal (if needed):**

```bash
# 1. Disable in .env
sed -i 's/BEADS_AUTO_ISSUES_ENABLED=true/BEADS_AUTO_ISSUES_ENABLED=false/' .env

# 2. Remove service initialization (requires code change)
# In /apps/server/src/index.ts, comment out lines 229-236

# 3. Restart server
npm run dev:server
```

### Rollback: Beads Memory Service

**Disable Feature:**

```bash
# Method 1: Remove tool from agent provider
# Edit /apps/server/src/providers/claude-provider.ts
# Remove 'query_beads_memory' from tools array

# Method 2: Disable via environment
echo "BEADS_MEMORY_ENABLED=false" >> .env
```

**What Gets Rolled Back:**

- Agents can no longer query past issues
- Memory cache cleared
- Existing issues remain accessible via CLI

**Verify Rollback:**

```bash
# Try querying memory
curl -X POST http://localhost:3008/api/agent/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test",
    "message": "Can you query beads memory for me?"
  }'

# Should receive error or ignore request
```

### Rollback: Beads Agent Coordinator

**Disable Feature:**

```bash
# Method 1: Stop coordination loop
echo "BEADS_COORDINATION_ENABLED=false" >> .env

# Method 2: Increase interval to effectively disable
echo "BEADS_COORDINATION_INTERVAL=999999999" >> .env
```

**What Gets Rolled Back:**

- Automatic agent assignment stops
- Helper agent spawning stops
- Active agents continue running until completion
- Issue locks remain until timeout

**Immediate Stop (Emergency):**

```bash
# Send SIGUSR2 to trigger graceful shutdown
pkill -USR2 -f "node.*server"

# Or kill coordination interval directly
# Find interval ID in logs and clearInterval()
```

**Verify Rollback:**

```bash
# Check logs for coordination activity
grep -i "Coordinator" logs/server.log | tail -20

# Should see: "Coordination disabled"
# Should NOT see: "Assigning agent to issue"
```

### Rollback: Specialized Agent System

**Disable Feature:**

```bash
# Disable specialized agents
echo "SPECIALIZED_AGENTS_ENABLED=false" >> .env

# Forces all tasks to use generic agent
```

**What Gets Rolled Back:**

- Task classification disabled
- All tasks route to generic agent
- Performance statistics still tracked
- Agent registry still available

**Selective Rollback (Specific Agents):**

```bash
# Edit /apps/server/src/agents/agent-registry.ts
# Set `autoSelectable: false` for specific agent types

# Example: Disable debug agent
# In AgentRegistry constructor, find debug agent config and change:
# autoSelectable: true → autoSelectable: false
```

**Verify Rollback:**

```bash
# Check agent assignments
curl http://localhost:3008/api/agents/registry

# All tasks should use "generic" agent
```

### Rollback: Skills System

**Disable All Skills:**

```bash
# Disable all skill endpoints
echo "RESEARCH_SKILL_ENABLED=false" >> .env
echo "IMPLEMENTATION_SKILL_ENABLED=false" >> .env
echo "CICD_SKILL_ENABLED=false" >> .env
echo "WORKFLOW_MODE=manual" >> .env
```

**Disable Individual Skills:**

```bash
# Disable Research Skill only
echo "RESEARCH_SKILL_ENABLED=false" >> .env

# Disable Implementation Skill only
echo "IMPLEMENTATION_SKILL_ENABLED=false" >> .env

# Disable CI/CD Skill only
echo "CICD_SKILL_ENABLED=false" >> .env
```

**What Gets Rolled Back:**

- Skill endpoints return 503 Service Unavailable
- Event listeners for skills stop processing
- In-flight skill executions complete

**Verify Rollback:**

```bash
# Try calling skill endpoint
curl -X POST http://localhost:3008/api/skills/research \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/project", "query": "test"}'

# Should receive: {"error": "Skill disabled"}
```

### Rollback: Hooks System

**Disable Feature:**

```bash
# Disable hooks execution
echo "HOOKS_ENABLED=false" >> .env
```

**What Gets Rolled Back:**

- Hooks no longer execute
- Hook configurations preserved in data directory
- In-flight hooks complete

**Disable Specific Hooks:**

```bash
# Edit hooks configuration directly
# Located at: $DATA_DIR/hooks/hooks.json
# Set "enabled": false for specific hooks

# Example:
{
  "type": "pre-task",
  "name": "Check Git Status",
  "enabled": false,  // Disable this hook
  ...
}
```

**Verify Rollback:**

```bash
# Check hooks configuration
cat ./data/hooks/hooks.json | jq '.hooks[] | select(.enabled == true)'

# Should show no enabled hooks if all disabled
```

---

## Data Migration Strategies

### Beads Database Migration

**Scenario:** Migrating existing issues to new Beads instance

```bash
#!/bin/bash
# scripts/migrate-beads-db.sh

SOURCE_DB=".beads.db"
DEST_DIR="./beads-backup-$(date +%Y%m%d)"
BACKUP_FILE="$DEST_DIR/beads-export.json"

mkdir -p "$DEST_DIR"

# Export existing issues
if [ -f "$SOURCE_DB" ]; then
  echo "Exporting issues from $SOURCE_DB..."

  # Method 1: Using Beads CLI export (if available)
  bd export --format json > "$BACKUP_FILE" 2>/dev/null || echo "CLI export not available"

  # Method 2: Direct SQLite export
  sqlite3 "$SOURCE_DB" ".dump" > "$DEST_DIR/beads-schema.sql"

  # Method 3: Issues list
  bd list --format json > "$DEST_DIR/issues-list.json" 2>/dev/null || echo "No issues to list"

  echo "Export complete: $BACKUP_FILE"
else
  echo "No existing Beads database found"
fi
```

### Agent Registry Migration

**Scenario:** Migrating agent statistics to new instance

```bash
#!/bin/bash
# scripts/migrate-agent-registry.sh

REGISTRY_FILE="./data/agent-registry-state.json"
BACKUP_DIR="./migration-backup-$(date +%Y%m%d)"

mkdir -p "$BACKUP_DIR"

# Export agent registry state
# Note: This requires API endpoint or manual export
# Add endpoint to AgentRegistry if needed:

# curl http://localhost:3008/api/agents/registry/export > "$BACKUP_DIR/agent-registry.json"

echo "Agent registry migration not yet automated"
echo "Manual export required via API or direct file copy"
```

### Hooks Configuration Migration

**Scenario:** Migrating hooks between environments

```bash
#!/bin/bash
# scripts/migrate-hooks.sh

HOOKS_SOURCE="./data/hooks/hooks.json"
BACKUP_DIR="./migration-backup-$(date +%Y%m%d)"

mkdir -p "$BACKUP_DIR"

# Backup hooks configuration
if [ -f "$HOOKS_SOURCE" ]; then
  cp "$HOOKS_SOURCE" "$BACKUP_DIR/hooks-backup.json"
  echo "Hooks backed up to: $BACKUP_DIR/hooks-backup.json"

  # Validate JSON
  jq empty "$BACKUP_DIR/hooks-backup.json" && echo "Valid JSON" || echo "Invalid JSON"
else
  echo "No hooks configuration found"
fi
```

---

## Testing & Verification

### Pre-Migration Tests

```bash
#!/bin/bash
# scripts/test-pre-migration.sh

echo "=== Pre-Migration Test Suite ==="

# Test 1: Beads CLI availability
echo "Test 1: Checking Beads CLI..."
if command -v bd &> /dev/null; then
  echo "✓ Beads CLI installed: $(bd --version)"
else
  echo "✗ Beads CLI not found"
  exit 1
fi

# Test 2: Node.js version
echo "Test 2: Checking Node.js version..."
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 18 ]; then
  echo "✓ Node.js version compatible: $(node --version)"
else
  echo "✗ Node.js version too old: $(node --version)"
  exit 1
fi

# Test 3: Environment variables
echo "Test 3: Checking environment..."
if [ -f .env ]; then
  echo "✓ .env file exists"
else
  echo "✗ .env file not found"
  exit 1
fi

# Test 4: Disk space
echo "Test 4: Checking disk space..."
AVAILABLE_SPACE=$(df . | tail -1 | awk '{print $4}')
if [ "$AVAILABLE_SPACE" -gt 102400 ]; then  # > 100MB
  echo "✓ Sufficient disk space: ${AVAILABLE_SPACE}KB"
else
  echo "✗ Insufficient disk space: ${AVAILABLE_SPACE}KB"
  exit 1
fi

# Test 5: Git status
echo "Test 5: Checking git status..."
if [ -z "$(git status --porcelain)" ]; then
  echo "✓ Git working directory clean"
else
  echo "⚠ Git working directory has uncommitted changes"
  git status --short
fi

echo "=== Pre-Migration Tests Complete ==="
```

### Post-Migration Tests

```bash
#!/bin/bash
# scripts/test-post-migration.sh

echo "=== Post-Migration Test Suite ==="

# Test 1: Server health
echo "Test 1: Checking server health..."
HEALTH=$(curl -s http://localhost:3008/api/health)
if echo "$HEALTH" | jq -e '.status == "ok"' > /dev/null; then
  echo "✓ Server is healthy"
else
  echo "✗ Server health check failed"
  exit 1
fi

# Test 2: Beads initialization
echo "Test 2: Checking Beads initialization..."
if [ -f .beads.db ]; then
  echo "✓ Beads database initialized"
else
  echo "✗ Beads database not found"
  exit 1
fi

# Test 3: Agent registry
echo "Test 3: Checking agent registry..."
REGISTRY=$(curl -s http://localhost:3008/api/agents/registry)
if echo "$REGISTRY" | jq -e '.agents | length > 0' > /dev/null; then
  echo "✓ Agent registry accessible: $(echo "$REGISTRY" | jq '.agents | length') agents"
else
  echo "✗ Agent registry check failed"
  exit 1
fi

# Test 4: Skills availability
echo "Test 4: Checking skills availability..."
SKILLS=$(curl -s http://localhost:3008/api/skills/status)
if echo "$SKILLS" | jq -e '.skills | length > 0' > /dev/null; then
  echo "✓ Skills available: $(echo "$SKILLS" | jq '.skills | length') skills"
else
  echo "✗ Skills check failed"
  exit 1
fi

# Test 5: Hooks system
echo "Test 5: Checking hooks system..."
HOOKS=$(curl -s http://localhost:3008/api/hooks)
if echo "$HOOKS" | jq -e '.hooks != null' > /dev/null; then
  echo "✓ Hooks system accessible"
else
  echo "⚠ Hooks system check returned unexpected response"
fi

# Test 6: Beads coordinator
echo "Test 6: Checking Beads coordinator..."
COORDINATOR=$(curl -s http://localhost:3008/api/beads/coordinator/stats)
if echo "$COORDINATOR" | jq -e '.activeAgents != null' > /dev/null; then
  echo "✓ Beads coordinator accessible"
else
  echo "⚠ Beads coordinator check returned unexpected response"
fi

echo "=== Post-Migration Tests Complete ==="
```

### Feature-Specific Verification

#### Beads Live Link Verification

```bash
#!/bin/bash
# scripts/verify-live-link.sh

echo "Testing Beads Live Link..."

# Trigger an agent error to test auto-issue creation
SESSION_ID="test-live-link-$(date +%s)"

curl -X POST http://localhost:3008/api/agent/start \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"workingDirectory\": \"$(pwd)\",
    \"message\": \"This is a test error for Live Link verification\"
  }"

# Wait a few seconds
sleep 5

# Check if issue was created
ISSUE_COUNT=$(bd list --format json 2>/dev/null | jq 'length')
echo "Issues in database: $ISSUE_COUNT"

if [ "$ISSUE_COUNT" -gt 0 ]; then
  echo "✓ Beads Live Link is working"
else
  echo "⚠ No issues found - may need manual verification"
fi
```

#### Beads Memory Verification

```bash
#!/bin/bash
# scripts/verify-beads-memory.sh

echo "Testing Beads Memory Service..."

# First, create a test issue
bd create \
  --title "Test Issue for Memory Verification" \
  --description "This is a test issue to verify memory queries" \
  --type feature \
  --priority 2

# Now query memory
curl -X POST http://localhost:3008/api/agent/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-memory",
    "message": "Can you query beads memory for test issues?"
  }'

echo "Check agent response for memory query results"
```

#### Agent Coordinator Verification

```bash
#!/bin/bash
# scripts/verify-coordinator.sh

echo "Testing Agent Coordinator..."

# Create a ready issue (no dependencies)
ISSUE_ID=$(bd create \
  --title "Coordinator Test Issue" \
  --description "Test issue for coordinator verification" \
  --type task \
  --priority 3 \
  --format json | jq -r '.id')

echo "Created issue: $ISSUE_ID"

# Wait for coordination cycle (30 seconds)
echo "Waiting for coordination cycle..."
sleep 35

# Check if agent was assigned
ISSUE_DETAILS=$(bd show "$ISSUE_ID" --format json)
ASSIGNED_AGENT=$(echo "$ISSUE_DETAILS" | jq -r '.agent // empty')

if [ -n "$ASSIGNED_AGENT" ]; then
  echo "✓ Agent assigned: $ASSIGNED_AGENT"
else
  echo "⚠ No agent assigned - check coordinator logs"
fi
```

---

## Monitoring & Validation

### Health Check Endpoints

```bash
# Overall system health
curl http://localhost:3008/api/health

# Beads-specific health
curl http://localhost:3008/api/beads/health

# Skills status
curl http://localhost:3008/api/skills/status

# Coordinator stats
curl http://localhost:3008/api/beads/coordinator/stats
```

### Log Monitoring

```bash
# Real-time log monitoring
tail -f /var/log/devflow/server.log | grep -E "(Beads|Coordinator|Skill|Hook)"

# Search for errors
grep -i "error.*beads" /var/log/devflow/server.log

# Monitor agent activity
grep -i "agent:" /var/log/devflow/server.log | tail -50

# Check coordinator activity
grep -i "Coordinator" /var/log/devflow/server.log | tail -50
```

### Performance Metrics

```bash
# Check agent performance
curl http://localhost:3008/api/agents/registry/stats | jq '.'

# Check coordinator stats
curl http://localhost:3008/api/beads/coordinator/stats | jq '.'

# Check skill execution times
curl http://localhost:3008/api/skills/stats | jq '.skills | to_entries | sort_by(.value.avgDuration)'

# Database size
du -sh .beads.db
```

### Alerting Thresholds

Set up monitoring for:

- **Beads Database Size**: Alert if > 50MB
- **Coordinator Active Agents**: Alert if > BEADS_MAX_CONCURRENT_AGENTS
- **Auto-Issue Rate**: Alert if approaching 20/hour limit
- **Memory Cache Hit Rate**: Alert if < 70%
- **Agent Success Rate**: Alert if < 80%

```bash
#!/bin/bash
# scripts/check-metrics.sh

# Check database size
DB_SIZE=$(du -m .beads.db | cut -f1)
if [ "$DB_SIZE" -gt 50 ]; then
  echo "⚠ ALERT: Beads database size: ${DB_SIZE}MB (threshold: 50MB)"
fi

# Check active agents
ACTIVE_AGENTS=$(curl -s http://localhost:3008/api/beads/coordinator/stats | jq '.activeAgents')
MAX_AGENTS=${BEADS_MAX_CONCURRENT_AGENTS:-5}
if [ "$ACTIVE_AGENTS" -ge "$MAX_AGENTS" ]; then
  echo "⚠ ALERT: Active agents: $ACTIVE_AGENTS (max: $MAX_AGENTS)"
fi

echo "Metrics check complete"
```

---

## Emergency Rollback Procedures

### Complete Feature Rollback

**Scenario:** Critical issue requiring immediate rollback of all Beads features

```bash
#!/bin/bash
# scripts/emergency-rollback.sh

echo "=== EMERGENCY ROLLBACK INITIATED ==="
echo "Timestamp: $(date)"

# 1. Stop server immediately
echo "Step 1: Stopping server..."
pkill -9 -f "node.*server" || echo "Server not running"
sleep 2

# 2. Disable all Beads features
echo "Step 2: Disabling Beads features..."
cat >> .env <<EOF
# Emergency rollback - $(date)
BEADS_AUTO_ISSUES_ENABLED=false
BEADS_MEMORY_ENABLED=false
BEADS_COORDINATION_ENABLED=false
SPECIALIZED_AGENTS_ENABLED=false
RESEARCH_SKILL_ENABLED=false
IMPLEMENTATION_SKILL_ENABLED=false
CICD_SKILL_ENABLED=false
HOOKS_ENABLED=false
WORKFLOW_MODE=manual
EOF

echo "✓ Features disabled in .env"

# 3. Backup current state
BACKUP_DIR="./emergency-rollback-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Step 3: Backing up current state..."
cp .env "$BACKUP_DIR/.env.disabled"
cp .beads.db "$BACKUP_DIR/.beads.db" 2>/dev/null || echo "No Beads DB to backup"
cp -r data "$BACKUP_DIR/data" 2>/dev/null || echo "No data directory to backup"

echo "✓ Backup saved to: $BACKUP_DIR"

# 4. Restore baseline (if exists)
if [ -f ".env.pre-migration" ]; then
  echo "Step 4: Restoring pre-migration .env..."
  cp .env.pre-migration .env
  echo "✓ Pre-migration .env restored"
else
  echo "Step 4: No pre-migration .env found, keeping disabled state"
fi

# 5. Restart server
echo "Step 5: Restarting server..."
npm run dev:server > /dev/null 2>&1 &

sleep 5

# 6. Verify server started
if curl -s http://localhost:3008/api/health > /dev/null; then
  echo "✓ Server restarted successfully"
else
  echo "✗ Server failed to start - check logs"
  exit 1
fi

echo "=== EMERGENCY ROLLBACK COMPLETE ==="
echo "Review logs: tail -f /var/log/devflow/server.log"
```

### Database Rollback

**Scenario:** Beads database corruption or data loss

```bash
#!/bin/bash
# scripts/rollback-database.sh

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file.db>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "=== Database Rollback ==="
echo "From: $BACKUP_FILE"
echo "To: .beads.db"

# Stop server
echo "Stopping server..."
pkill -f "node.*server" || echo "Server not running"

# Backup current database (even if corrupted)
echo "Backing up current database..."
cp .beads.db ".beads.db.corrupted.$(date +%Y%m%d_%H%M%S)"

# Restore backup
echo "Restoring backup..."
cp "$BACKUP_FILE" .beads.db

# Verify database integrity
echo "Verifying database integrity..."
sqlite3 .beads.db "PRAGMA integrity_check;"
if [ $? -eq 0 ]; then
  echo "✓ Database integrity verified"
else
  echo "✗ Database integrity check failed"
  exit 1
fi

# Restart server
echo "Restarting server..."
npm run dev:server > /dev/null 2>&1 &

sleep 5

# Verify
if curl -s http://localhost:3008/api/beads/health > /dev/null; then
  echo "✓ Database rollback successful"
else
  echo "✗ Beads service not responding after rollback"
  exit 1
fi

echo "=== Database Rollback Complete ==="
```

### Partial Rollback (Specific Features)

**Scenario:** Individual feature causing issues

```bash
#!/bin/bash
# scripts/rollback-feature.sh

FEATURE="$1"

if [ -z "$FEATURE" ]; then
  echo "Usage: $0 <feature-name>"
  echo "Available features:"
  echo "  - live-link (Beads Live Link)"
  echo "  - memory (Beads Memory)"
  echo "  - coordinator (Agent Coordinator)"
  echo "  - specialized-agents (Specialized Agent System)"
  echo "  - skills (Skills System)"
  echo "  - hooks (Hooks System)"
  echo "  - all (Complete rollback)"
  exit 1
fi

case "$FEATURE" in
  live-link)
    echo "Rolling back Beads Live Link..."
    sed -i 's/BEADS_AUTO_ISSUES_ENABLED=true/BEADS_AUTO_ISSUES_ENABLED=false/' .env
    echo "✓ Beads Live Link disabled"
    echo "Restart server to apply changes"
    ;;

  memory)
    echo "Rolling back Beads Memory Service..."
    sed -i 's/BEADS_MEMORY_ENABLED=true/BEADS_MEMORY_ENABLED=false/' .env
    echo "✓ Beads Memory Service disabled"
    echo "Restart server to apply changes"
    ;;

  coordinator)
    echo "Rolling back Agent Coordinator..."
    sed -i 's/BEADS_COORDINATION_ENABLED=true/BEADS_COORDINATION_ENABLED=false/' .env
    echo "✓ Agent Coordinator disabled"
    echo "Restart server to apply changes"
    ;;

  specialized-agents)
    echo "Rolling back Specialized Agents..."
    sed -i 's/SPECIALIZED_AGENTS_ENABLED=true/SPECIALIZED_AGENTS_ENABLED=false/' .env
    echo "✓ Specialized Agents disabled"
    echo "Restart server to apply changes"
    ;;

  skills)
    echo "Rolling back Skills System..."
    sed -i 's/RESEARCH_SKILL_ENABLED=true/RESEARCH_SKILL_ENABLED=false/' .env
    sed -i 's/IMPLEMENTATION_SKILL_ENABLED=true/IMPLEMENTATION_SKILL_ENABLED=false/' .env
    sed -i 's/CICD_SKILL_ENABLED=true/CICD_SKILL_ENABLED=false/' .env
    echo "✓ Skills System disabled"
    echo "Restart server to apply changes"
    ;;

  hooks)
    echo "Rolling back Hooks System..."
    sed -i 's/HOOKS_ENABLED=true/HOOKS_ENABLED=false/' .env
    echo "✓ Hooks System disabled"
    echo "Restart server to apply changes"
    ;;

  all)
    ./scripts/emergency-rollback.sh
    ;;

  *)
    echo "Unknown feature: $FEATURE"
    exit 1
    ;;
esac
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: Beads CLI Not Found

**Symptoms:**

- Error: `bd: command not found`
- Service logs show "Beads CLI not installed"

**Solutions:**

```bash
# Solution 1: Install Beads CLI
cargo install beads-ui

# Solution 2: Add to PATH if installed in custom location
export PATH="$HOME/.cargo/bin:$PATH"

# Solution 3: Set custom path in .env
echo "BD_BIN=/custom/path/to/bd" >> .env
```

#### Issue 2: Database Locked

**Symptoms:**

- Error: "database is locked"
- Issues cannot be created or updated

**Solutions:**

```bash
# Solution 1: Check for running processes
lsof .beads.db

# Solution 2: Stop all Beads-related processes
pkill -f beads-ui
pkill -f "node.*server"

# Solution 3: Remove lock file (caution - may cause data loss)
rm .beads.db-wal
rm .beads.db-shm

# Solution 4: Restart server
npm run dev:server
```

#### Issue 3: High Memory Usage

**Symptoms:**

- Server process using > 1GB RAM
- Slow response times

**Solutions:**

```bash
# Solution 1: Reduce cache sizes
echo "BEADS_MEMORY_CACHE_TTL=60000" >> .env  # Reduce to 1 minute
echo "BEADS_MAX_CONCURRENT_AGENTS=2" >> .env  # Reduce concurrent agents

# Solution 2: Disable memory-intensive features
echo "BEADS_DEDUPLICATION_ENABLED=false" >> .env

# Solution 3: Restart server
pkill -f "node.*server"
npm run dev:server
```

#### Issue 4: Agent Not Assigning

**Symptoms:**

- Issues remain in "ready" state
- No agent assignments in logs

**Solutions:**

```bash
# Solution 1: Check coordinator status
curl http://localhost:3008/api/beads/coordinator/stats

# Solution 2: Verify coordination enabled
grep BEADS_COORDINATION_ENABLED .env

# Solution 3: Manually trigger coordination
curl -X POST http://localhost:3008/api/beads/coordinator/trigger \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/project"}'

# Solution 4: Check for blocked dependencies
bd list --format json | jq '.[] | select(.status == "ready")'
```

#### Issue 5: Skill Execution Timeout

**Symptoms:**

- Skills timing out after 30 seconds
- Incomplete research or implementation

**Solutions:**

```bash
# Solution 1: Increase timeout
echo "HOOKS_TIMEOUT=60000" >> .env  # 60 seconds
echo "IMPLEMENTATION_TIMEOUT=600000" >> .env  # 10 minutes

# Solution 2: Disable slow skills
echo "RESEARCH_SKILL_ENABLED=false" >> .env

# Solution 3: Reduce concurrent operations
echo "ORCHESTRATOR_MAX_CONCURRENT_RESEARCH=1" >> .env
```

#### Issue 6: Duplicate Issues Created

**Symptoms:**

- Multiple similar issues in database
- Deduplication not working

**Solutions:**

```bash
# Solution 1: Check deduplication enabled
grep BEADS_DEDUPLICATION_ENABLED .env

# Solution 2: Clear error cache by restarting server
pkill -f "node.*server"
npm run dev:server

# Solution 3: Manually merge duplicates
bd merge <source-issue-id> <target-issue-id>
```

### Diagnostic Commands

```bash
# Full system diagnostics
curl http://localhost:3008/api/health | jq '.'

# Beads diagnostics
curl http://localhost:3008/api/beads/health | jq '.'

# Check database integrity
sqlite3 .beads.db "PRAGMA integrity_check;"

# Check database size
du -sh .beads.db

# List all issues
bd list

# Check agent registry
curl http://localhost:3008/api/agents/registry | jq '.'

# Check active agents
curl http://localhost:3008/api/beads/coordinator/stats | jq '.activeAgents'

# Check recent errors
grep -i "error" /var/log/devflow/server.log | tail -50

# Check coordinator activity
grep -i "Coordinator" /var/log/devflow/server.log | tail -50
```

---

## Appendix: Rollback Scripts

### Script 1: Pre-Migration Snapshot

```bash
#!/bin/bash
# scripts/snapshot-pre-migration.sh

SNAPSHOT_DIR="./pre-migration-snapshot-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$SNAPSHOT_DIR"

echo "Creating pre-migration snapshot..."

# Backup environment
cp .env "$SNAPSHOT_DIR/.env"
cp .env.pre-migration "$SNAPSHOT_DIR/.env.pre-migration" 2>/dev/null || true

# Backup Beads database
if [ -f .beads.db ]; then
  cp .beads.db "$SNAPSHOT_DIR/"
  echo "Beads database backed up"
fi

# Export issues
if command -v bd &> /dev/null; then
  bd list --format json > "$SNAPSHOT_DIR/issues.json" 2>/dev/null || true
fi

# Backup data directory
if [ -d data ]; then
  cp -r data "$SNAPSHOT_DIR/"
fi

# Git state
git rev-parse HEAD > "$SNAPSHOT_DIR/git-commit.txt"
git status --porcelain > "$SNAPSHOT_DIR/git-status.txt"
git diff > "$SNAPSHOT_DIR/git-diff.patch"

# Package info
npm list --depth=0 > "$SNAPSHOT_DIR/npm-packages.txt"

# System info
uname -a > "$SNAPSHOT_DIR/system-info.txt"
df -h > "$SNAPSHOT_DIR/disk-usage.txt"

echo "Snapshot saved to: $SNAPSHOT_DIR"
echo "To restore: cp $SNAPSHOT_DIR/.env .env"
```

### Script 2: Post-Migration Validation

```bash
#!/bin/bash
# scripts/validate-post-migration.sh

ERRORS=0

echo "=== Post-Migration Validation ==="

# Test 1: Server health
echo -n "Server health... "
if curl -s http://localhost:3008/api/health | jq -e '.status == "ok"' > /dev/null; then
  echo "✓"
else
  echo "✗"
  ERRORS=$((ERRORS + 1))
fi

# Test 2: Beads initialization
echo -n "Beads initialization... "
if [ -f .beads.db ]; then
  echo "✓"
else
  echo "✗"
  ERRORS=$((ERRORS + 1))
fi

# Test 3: Agent registry
echo -n "Agent registry... "
if curl -s http://localhost:3008/api/agents/registry | jq -e '.agents | length > 0' > /dev/null; then
  echo "✓"
else
  echo "✗"
  ERRORS=$((ERRORS + 1))
fi

# Test 4: Skills
echo -n "Skills system... "
if curl -s http://localhost:3008/api/skills/status | jq -e '.skills | length > 0' > /dev/null; then
  echo "✓"
else
  echo "✗"
  ERRORS=$((ERRORS + 1))
fi

# Test 5: Hooks
echo -n "Hooks system... "
if curl -s http://localhost:3008/api/hooks | jq -e '.hooks != null' > /dev/null; then
  echo "✓"
else
  echo "✗"
  ERRORS=$((ERRORS + 1))
fi

# Test 6: Coordinator
echo -n "Agent coordinator... "
if curl -s http://localhost:3008/api/beads/coordinator/stats | jq -e '.activeAgents != null' > /dev/null; then
  echo "✓"
else
  echo "✗"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✓ All validation tests passed"
  exit 0
else
  echo "✗ $ERRORS validation test(s) failed"
  exit 1
fi
```

### Script 3: Feature Status Report

```bash
#!/bin/bash
# scripts/feature-status-report.sh

echo "=== Beads Feature Status Report ==="
echo "Generated: $(date)"
echo ""

# Environment variables
echo "Environment Variables:"
grep -E "(BEADS_|SPECIALIZED_|SKILL|HOOK|WORKFLOW)" .env | sort
echo ""

# Server health
echo "Server Health:"
curl -s http://localhost:3008/api/health | jq '.'
echo ""

# Beads status
echo "Beads Status:"
curl -s http://localhost:3008/api/beads/health | jq '.'
echo ""

# Database info
echo "Beads Database:"
if [ -f .beads.db ]; then
  echo "  Size: $(du -sh .beads.db | cut -f1)"
  ISSUE_COUNT=$(bd list 2>/dev/null | wc -l)
  echo "  Issues: $ISSUE_COUNT"
else
  echo "  Status: Not initialized"
fi
echo ""

# Agent registry
echo "Agent Registry:"
curl -s http://localhost:3008/api/agents/registry | jq '.agents | length' | xargs -I {} echo "  Registered agents: {}"
echo ""

# Coordinator stats
echo "Coordinator Stats:"
curl -s http://localhost:3008/api/beads/coordinator/stats | jq '.'
echo ""

# Skills status
echo "Skills Status:"
curl -s http://localhost:3008/api/skills/status | jq '.'
echo ""

# Hooks status
echo "Hooks Status:"
curl -s http://localhost:3008/api/hooks | jq '.'
echo ""

# Recent errors
echo "Recent Errors (last 10):"
grep -i "error" /var/log/devflow/server.log 2>/dev/null | tail -10 || echo "  No errors found"
```

### Script 4: Complete Rollback

```bash
#!/bin/bash
# scripts/complete-rollback.sh

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     COMPLETE BEADS FEATURE ROLLBACK                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  WARNING: This will disable ALL Beads-related features"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

# Create rollback backup
ROLLBACK_DIR="./rollback-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$ROLLBACK_DIR"

echo "Creating rollback backup..."
cp .env "$ROLLBACK_DIR/.env.before-rollback"
cp .beads.db "$ROLLBACK_DIR/" 2>/dev/null || true
cp -r data "$ROLLBACK_DIR/" 2>/dev/null || true

# Stop server
echo "Stopping server..."
pkill -f "node.*server" || true
sleep 3

# Disable all features
echo "Disabling Beads features..."

# Remove or comment out Beads-related env vars
grep -v -E "(BEADS_|SPECIALIZED_AGENTS|RESEARCH_SKILL|IMPLEMENTATION_SKILL|CICD_SKILL|HOOKS_|WORKFLOW_)" .env > .env.tmp
mv .env.tmp .env

# Add explicit disable flags
cat >> .env <<EOF

# Beads features disabled via rollback on $(date)
BEADS_AUTO_ISSUES_ENABLED=false
BEADS_MEMORY_ENABLED=false
BEADS_COORDINATION_ENABLED=false
SPECIALIZED_AGENTS_ENABLED=false
RESEARCH_SKILL_ENABLED=false
IMPLEMENTATION_SKILL_ENABLED=false
CICD_SKILL_ENABLED=false
HOOKS_ENABLED=false
WORKFLOW_MODE=manual
EOF

echo "Features disabled"
echo ""

# Ask if user wants to keep database
read -p "Keep Beads database? (yes/no): " keep_db

if [ "$keep_db" != "yes" ]; then
  echo "Moving database to backup..."
  mv .beads.db "$ROLLBACK_DIR/.beads.db.archived"
else
  echo "Database preserved"
fi

# Restart server
echo "Restarting server..."
npm run dev:server > /dev/null 2>&1 &

sleep 5

# Verify
if curl -s http://localhost:3008/api/health > /dev/null; then
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║     ROLLBACK COMPLETE                                      ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Backup saved to: $ROLLBACK_DIR"
  echo ""
  echo "Server restarted successfully"
  echo ""
  echo "To restore features:"
  echo "  1. Copy backup: cp $ROLLBACK_DIR/.env.before-rollback .env"
  echo "  2. Restore database: cp $ROLLBACK_DIR/.beads.db .beads.db (if archived)"
  echo "  3. Restart server: npm run dev:server"
else
  echo ""
  echo "✗ Server failed to start"
  echo "Restore from backup: cp $ROLLBACK_DIR/.env.before-rollback .env"
  exit 1
fi
```

---

## Quick Reference Cards

### Migration Checklist (One-Page)

```
PRE-MIGRATION:
□ Install Beads CLI: cargo install beads-ui
□ Backup .env and .beads.db
□ Clean git status: git stash
□ Verify resources: 100MB disk, 512MB RAM
□ Document current state

MIGRATION:
□ Update .env with feature flags
□ Initialize Beads: bd init
□ Restart server: npm run dev:server
□ Watch logs for initialization
□ Run post-migration tests

POST-MIGRATION:
□ Verify server health
□ Check Beads initialized
□ Test agent registry
□ Test skills endpoints
□ Monitor for 1 hour

ROLLBACK (IF NEEDED):
□ Disable features in .env
□ Restart server
□ Verify health endpoint
□ Check logs for errors
```

### Rollback Commands (Quick Reference)

```bash
# Disable specific features
sed -i 's/BEADS_AUTO_ISSUES_ENABLED=true/BEADS_AUTO_ISSUES_ENABLED=false/' .env
sed -i 's/BEADS_COORDINATION_ENABLED=true/BEADS_COORDINATION_ENABLED=false/' .env

# Stop coordination
kill $(ps aux | grep '[c]oordinator' | awk '{print $1}')

# Restore database
cp .beads.db.backup .beads.db

# Complete rollback
./scripts/complete-rollback.sh
```

### Monitoring Commands (Quick Reference)

```bash
# Health checks
curl http://localhost:3008/api/health
curl http://localhost:3008/api/beads/health

# Statistics
curl http://localhost:3008/api/beads/coordinator/stats
curl http://localhost:3008/api/agents/registry

# Logs
tail -f /var/log/devflow/server.log | grep -i error
grep "Coordinator" /var/log/devflow/server.log | tail -20

# Database
du -sh .beads.db
sqlite3 .beads.db "PRAGMA integrity_check;"
```

---

## Support and Resources

### Documentation

- **Beads CLI Documentation**: `bd --help`
- **Skills System Guide**: `/docs/SKILLS_GUIDE.md`
- **Hooks System Guide**: `/docs/HOOKS_GUIDE.md`
- **Workflow Orchestration Guide**: `/docs/WORKFLOW_ORCHESTRATION_GUIDE.md`

### Issue Tracking

Report issues or ask questions:

- Create issue in Beads: `bd create --title "Migration issue"`
- Check existing issues: `bd list`
- Search past issues: `bd search "migration"`

### Getting Help

If you encounter issues during migration:

1. Check troubleshooting section above
2. Review logs: `tail -f /var/log/devflow/server.log`
3. Run diagnostics: `./scripts/feature-status-report.sh`
4. Create rollback backup: `./scripts/snapshot-pre-migration.sh`
5. Contact support with diagnostic output

---

**Document Version:** 1.0.0
**Last Updated:** 2025-01-02
**Maintained By:** DevFlow Team
