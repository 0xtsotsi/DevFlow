# Gastown Quick Reference Guide

**Beads Autonomous Memory System** - DevFlow's intelligent agent coordination and memory system.

---

## CHEAT SHEET: Most Common Commands

### Beads Operations

```bash
# Initialize Beads in project
beads init

# Create issue
beads create --type bug --priority 1 "Fix authentication error"

# List issues
beads list

# Search issues
beads search "authentication"

# Get dependencies
beads deps <issue-id>

# Update issue
beads update <issue-id> --status closed
```

### Environment Variables

```bash
# Enable/disable features
export BEADS_AUTO_ISSUES_ENABLED=true
export BEADS_MEMORY_ENABLED=true
export BEADS_COORDINATION_ENABLED=true

# Rate limiting
export BEADS_MAX_AUTO_ISSUES_PER_HOUR=20
export BEADS_MEMORY_CACHE_TTL=300000  # 5 minutes

# Coordination
export BEADS_MAX_CONCURRENT_AGENTS=5
export BEADS_COORDINATION_INTERVAL=30000  # 30 seconds
```

### API Endpoints

```bash
# Memory query
POST /api/beads/memory
{ "projectPath": "...", "query": "...", "maxResults": 10 }

# Create issue
POST /api/beads/issues
{ "title": "...", "description": "...", "type": "bug", "priority": 1 }

# Agent coordination
POST /api/beads/coordinate
{ "projectPath": "..." }

# Helper agent
POST /api/beads/spawn-helper
{ "parentSessionId": "...", "helperType": "...", "taskDescription": "..." }
```

### Key Files

```
apps/server/src/services/
├── beads-service.ts              # Core Beads API (22KB)
├── beads-live-link-service.ts    # Auto-issue creation (14KB)
├── beads-memory-service.ts       # Memory queries (19KB)
└── beads-agent-coordinator.ts    # Agent coordination (25KB)

libs/@automaker/types/src/
└── beads.ts                      # TypeScript interfaces

apps/server/tests/unit/services/
├── beads-live-link-service.test.ts
├── beads-memory-service.test.ts
└── beads-agent-coordinator.test.ts
```

---

## QUICK REFERENCE CARDS

---

## CARD 1: Convoy (Beads Live Link)

**Automatic Error Tracking** - Converts agent errors into trackable issues.

### Key Concepts

- **Auto-Issue Creation**: Agent errors automatically become Beads issues
- **Severity Assessment**: Classifies errors as Critical (P0), High (P1), Medium (P2), Low (P3)
- **Rate Limiting**: Max 20 auto-issues/hour (configurable)
- **Deduplication**: 24-hour cache prevents duplicate issues
- **Error Hashing**: Normalizes errors (removes paths, line numbers, UUIDs)

### File Location

```
/home/codespace/DevFlow/apps/server/src/services/beads-live-link-service.ts
```

### Configuration Options

| Option                 | Type    | Default | Description                     |
| ---------------------- | ------- | ------- | ------------------------------- |
| `autoCreateOnErrors`   | boolean | `true`  | Create issues on agent errors   |
| `autoCreateOnRequests` | boolean | `true`  | Create issues on agent requests |
| `maxAutoIssuesPerHour` | number  | `20`    | Rate limit for auto-issues      |
| `enableDeduplication`  | boolean | `true`  | Enable duplicate detection      |

### Severity Assessment Patterns

**Critical (P0)**:

- Segmentation fault, segfault
- Database corrupted
- Out of memory
- Fatal error, heap corruption, stack overflow

**High (P1)**:

- Authentication failed
- Connection refused (ECONNREFUSED)
- Cannot find module
- Permission denied (EACCES)
- ENOTFOUND, ETIMEDOUT
- Unhandled exception/rejection

**Medium (P2)**:

- TypeError, ReferenceError, SyntaxError
- Validation error
- Parse error, invalid input
- Undefined is not, cannot read/set

**Low (P3)**:

- Everything else (warnings, info)

### Common Tasks

**Initialize for project:**

```typescript
const liveLink = new BeadsLiveLinkService(beadsService, events, {
  maxAutoIssuesPerHour: 20,
  enableDeduplication: true,
});
await liveLink.initialize(projectPath);
```

**Get statistics:**

```typescript
const stats = liveLink.getStats();
// { autoIssueCount, maxAutoIssuesPerHour, resetTime, cacheSize, config }
```

**Manually create issue:**

```typescript
// Agent can request issue creation via stream
stream.emit('agent:stream', {
  type: 'request',
  request: 'create-issue',
  title: 'Implement feature X',
  description: 'Details...',
  issueType: 'feature',
  priority: 2,
});
```

**Shutdown:**

```typescript
liveLink.shutdown(); // Unsubscribes from events, clears cache
```

### Troubleshooting

**Problem**: Issues not being created

- **Check**: `BEADS_AUTO_ISSUES_ENABLED=true`
- **Check**: Beads CLI installed: `beads --version`
- **Check**: Rate limit not exceeded: `getStats().autoIssueCount`
- **Check**: Event subscription active: service initialized

**Problem**: Too many duplicate issues

- **Fix**: Enable deduplication: `enableDeduplication: true`
- **Fix**: Check cache TTL (default 24 hours)
- **Fix**: Review error hashing normalization

**Problem**: Wrong priority assigned

- **Fix**: Customize severity patterns in `assessErrorSeverity()`
- **Fix**: Add custom patterns to critical/high/medium arrays
- **Fix**: Adjust priority mapping in `priorityMap`

### Events Emitted

| Event                         | Payload                           | Description                  |
| ----------------------------- | --------------------------------- | ---------------------------- |
| `beads:auto-issue-created`    | `{ issueId, severity, priority }` | New issue from error         |
| `beads:agent-request-created` | `{ issueId, sessionId }`          | New issue from agent request |

---

## CARD 2: MEOW (Beads Memory)

**Autonomous Agent Memory** - Queries past issues as context for current work.

### Key Concepts

- **Semantic Search**: Keyword-based similarity matching (>0.3 threshold)
- **Decision Extraction**: Finds past decisions in closed issues
- **Dependency Awareness**: Identifies blocking issues
- **Token Estimation**: Prevents context overflow (4 chars ≈ 1 token)
- **5-Minute Cache**: Performance optimization for repeated queries
- **Web Search Integration**: Exa MCP provides best practices

### File Location

```
/home/codespace/DevFlow/apps/server/src/services/beads-memory-service.ts
```

### Configuration Options

| Option              | Type    | Default  | Description                      |
| ------------------- | ------- | -------- | -------------------------------- |
| `maxResults`        | number  | `10`     | Maximum issues per category      |
| `includeClosed`     | boolean | `true`   | Include closed issues in results |
| `includeInProgress` | boolean | `true`   | Include in-progress issues       |
| `minSimilarity`     | number  | `0.3`    | Minimum similarity score (0-1)   |
| `CACHE_TTL`         | number  | `300000` | Cache duration (5 minutes)       |
| `MAX_CACHE_SIZE`    | number  | `100`    | Maximum cache entries            |

### Memory Context Structure

```typescript
interface MemoryContext {
  relatedBugs: BeadsIssue[]; // Bugs that might impact task
  relatedFeatures: BeadsIssue[]; // Features providing context
  pastDecisions: Array<{
    // Decisions from closed issues
    issue: BeadsIssue;
    decision: string;
  }>;
  blockedBy: BeadsIssue[]; // Issues with blockers
  similarIssues: BeadsIssue[]; // Semantically similar issues
  summary: string; // AI-generated summary
  totalTokenEstimate: number; // Estimated token count
}
```

### Common Tasks

**Query memory for task:**

```typescript
const memory = new BeadsMemoryService(beadsService, mcpBridge);

const context = await memory.queryRelevantContext(projectPath, 'Implement OAuth2 authentication', {
  maxResults: 10,
  includeClosed: true,
});

console.log(context.summary);
console.log(`Estimated tokens: ${context.totalTokenEstimate}`);
```

**Clear cache:**

```typescript
memory.clearCache();
```

**Get cache stats:**

```typescript
const stats = memory.getCacheStats();
// { size, entries: [{ key, age }] }
```

**Extract decisions manually:**

```typescript
// Look for markers in issue descriptions:
// - "decision:"
// - "resolution:"
// - "solution:"
```

### Similarity Scoring

Keyword matching algorithm:

- Title match: **+0.3** per keyword
- Description match: **+0.2** per keyword
- Threshold: **≥0.3** to be considered similar
- Top 5 similar issues returned

### Token Estimation

Rough calculation: `totalChars / 4`

Warning if >15,000 tokens (may overflow context)

### Troubleshooting

**Problem**: Empty results

- **Check**: Beads database has issues
- **Check**: Keywords extracted: `extractKeywords()` logs
- **Check**: Search not failing: check logs for "Search failed"
- **Fix**: Lower `minSimilarity` threshold
- **Fix**: Increase `maxResults`

**Problem**: Context too large

- **Check**: `totalTokenEstimate` in response
- **Fix**: Reduce `maxResults` (try 5 instead of 10)
- **Fix**: Set `includeClosed: false`
- **Fix**: Filter by specific issue types

**Problem**: Cache not working

- **Check**: `CACHE_TTL = 300000` (5 minutes)
- **Check**: Cache not full: `MAX_CACHE_SIZE = 100`
- **Fix**: Clear cache manually if stale
- **Fix**: Restart service to reset

**Problem**: Web search failing

- **Check**: Exa MCP available: `mcpBridge.isAvailable()`
- **Check**: Network connectivity
- **Fallback**: Basic summary used automatically

### Decision Markers

Extract decisions from closed issues by including these in descriptions:

```markdown
## Decision

Use JWT tokens for authentication with 1-hour expiration.

## Resolution

Implemented OAuth2 with PKCE flow for security.

## Solution

Chose PostgreSQL over MongoDB for relational data requirements.
```

---

## CARD 3: Scoring (Agent Coordination)

**Intelligent Agent Selection** - Scores and assigns best agent for each task.

### Key Concepts

- **Multi-Factor Scoring**: Capability match (40%) + Success rate (40%) + Availability (20%)
- **Capability Matching**: Keyword-based match between agent capabilities and issue content
- **Success Rate Tracking**: Historical performance per agent type
- **Availability Calculation**: Based on active agent count vs. max concurrent
- **Auto-Assignment**: Automatically assigns ready work to best agents
- **Issue Locking**: Prevents duplicate assignments

### File Location

```
/home/codespace/DevFlow/apps/server/src/services/beads-agent-coordinator.ts
```

### Configuration Options

| Option                 | Type    | Default   | Description                       |
| ---------------------- | ------- | --------- | --------------------------------- |
| `coordinationInterval` | number  | `30000`   | Coordination loop frequency (30s) |
| `maxConcurrentAgents`  | number  | `5`       | Maximum simultaneous agents       |
| `enableAutoAssignment` | boolean | `true`    | Enable automatic task assignment  |
| `enableHelperSpawning` | boolean | `true`    | Enable helper agent spawning      |
| `maxAgentAge`          | number  | `7200000` | Agent stale timeout (2 hours)     |

### Scoring Formula

```
Score = (CapabilityMatch × 0.4) + (SuccessRate × 0.4) + (Availability × 0.2)

Where:
- CapabilityMatch: 0-1 (keyword matching)
- SuccessRate: 0-1 (historical, default 1.0)
- Availability: 0-1 (1 - activeCount/maxConcurrent)
- Threshold: ≥0.5 to be selected
```

### Agent Capability Structure

```typescript
interface AgentConfig {
  type: AgentType;
  capabilities: Array<{
    name: string; // e.g., "authentication"
    tools: string[]; // e.g., ["bcrypt", "jsonwebtoken"]
  }>;
  priority: number; // 1-10 (fallback if no capability match)
  autoSelectable: boolean; // Can be auto-assigned
}
```

### Common Tasks

**Start coordinator:**

```typescript
const coordinator = new BeadsAgentCoordinator(
  agentRegistry,
  beadsService,
  agentService,
  events,
  specializedAgentService,
  { maxConcurrentAgents: 5 }
);

await coordinator.start(projectPath);
```

**Get statistics:**

```typescript
const stats = coordinator.getStats();
// {
//   activeAgents: 3,
//   lockedIssues: 3,
//   totalAssignments: 25,
//   totalHelpersSpawned: 7,
//   lastCoordinationTime: 1234567890
// }
```

**Get active agents:**

```typescript
const agents = coordinator.getActiveAgents();
// [{ sessionId, agentType, issueId, startTime }, ...]
```

**Trigger manual coordination:**

```typescript
await coordinator.triggerCoordination(projectPath);
```

**Stop coordinator:**

```typescript
coordinator.stop(); // Clears intervals, agents, locks
```

### Coordination Flow

1. **Cleanup** stale agents (>2 hours old)
2. **Check** concurrent limit
3. **Get** ready work from Beads (no blockers)
4. **Filter** out locked/in-progress issues
5. **Score** each agent for each issue
6. **Select** top agent if score ≥0.5
7. **Assign** issue to agent (fire and forget)
8. **Lock** issue to prevent duplicates
9. **Track** active agent

### Helper Agent Spawning

```typescript
const result = await coordinator.spawnHelperAgent(
  parentSessionId, // Parent agent's session
  'testing', // Helper agent type
  'Write unit tests for auth module', // Task
  projectPath
);

// Returns: { helperSessionId, helperIssueId, parentIssueId, helperAgentType }
```

### Capability Matching Algorithm

1. Extract keywords from issue (title, description, type, labels)
2. For each agent capability:
   - Check if capability name matches issue keywords
   - Check if any capability tools match issue keywords
3. Calculate match percentage: `matchCount / totalCapabilities`
4. If no matches, use priority fallback: `0.1 + (priority × 0.04)`
5. Return score 0-1

### Troubleshooting

**Problem**: No agents being assigned

- **Check**: Auto-selectable agents exist: `agentRegistry.getAutoSelectableAgents()`
- **Check**: Ready work available: `beadsService.getReadyWork()`
- **Check**: Score threshold (0.5) not too high
- **Check**: Concurrent limit not reached
- **Check**: Issue locks not stuck

**Problem**: Wrong agent selected

- **Fix**: Adjust capability weights (default 40%)
- **Fix**: Improve agent capability definitions
- **Fix**: Add relevant tools to capabilities
- **Fix**: Adjust agent priority (1-10)

**Problem**: Agents not releasing

- **Check**: Agent completion events firing
- **Check**: Issue status updated to 'closed'
- **Check**: Locks cleared on completion
- **Fix**: Reduce `maxAgentAge` to force cleanup

**Problem**: Too many concurrent agents

- **Fix**: Reduce `maxConcurrentAgents` (default 5)
- **Fix**: Increase `coordinationInterval` (default 30s)
- **Fix**: Check for stale agents blocking slots

### Events Emitted

| Event                    | Payload                                                  | Description             |
| ------------------------ | -------------------------------------------------------- | ----------------------- |
| `beads:agent-assigned`   | `{ issueId, sessionId, agentType, issue }`               | Agent assigned to issue |
| `beads:agent-started`    | `{ issueId, sessionId, agentType, timestamp }`           | Agent started working   |
| `beads:agent-completed`  | `{ issueId, sessionId, agentType, success, timestamp }`  | Agent finished          |
| `beads:agent-failed`     | `{ issueId, sessionId, agentType, error }`               | Agent encountered error |
| `beads:agent-cleaned`    | `{ sessionId, issueId, agentType, age }`                 | Stale agent cleaned up  |
| `beads:helper-spawned`   | `{ helperIssueId, helperSessionId, parentIssueId, ... }` | Helper created          |
| `beads:helper-started`   | `{ issueId, sessionId, parentSessionId, agentType }`     | Helper started          |
| `beads:helper-completed` | `{ issueId, sessionId, parentSessionId, ... }`           | Helper finished         |
| `beads:helper-failed`    | `{ issueId, sessionId, parentSessionId, ... }`           | Helper failed           |

---

## CARD 4: Patrol (Agent Monitoring)

**PID-Based Agent Tracking** - Monitors all agent executions with telemetry aggregation.

### Key Concepts

- **PID Tracking**: Tracks agent processes by process ID
- **Parent-Child Relationships**: Maintains agent hierarchy
- **Process Death Detection**: Automatically detects terminated agents
- **Orphan Cleanup**: Cleans up agents without parent processes
- **Telemetry Aggregation**: Collects metrics per agent
- **SQLite Persistence**: Durable agent records

### File Location

```
/home/codespace/DevFlow/apps/server/src/services/agent-monitor.ts
```

### Agent Status Lifecycle

```
pending → starting → running → completed
                     ↘ failed
                     ↘ aborted
                     ↘ timeout
```

### Database Schema

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  parentId TEXT,
  status TEXT,
  engine TEXT,
  model TEXT,
  pid INTEGER,
  workingDir TEXT,
  featureId TEXT,
  beadsId TEXT,
  prompt TEXT,
  createdAt INTEGER,
  startedAt INTEGER,
  completedAt INTEGER,
  error TEXT,
  telemetry TEXT,  -- JSON
  sessionId TEXT,
  metadata TEXT    -- JSON
);
```

### Common Tasks

**Initialize monitor:**

```typescript
const monitor = new AgentMonitor(databasePath);
await monitor.initialize();
```

**Register agent:**

```typescript
await monitor.registerAgent({
  id: 'agent-123',
  parentId: null,
  status: 'pending',
  engine: 'claude',
  model: 'claude-3-5-sonnet-20241022',
  pid: 12345,
  workingDir: '/path/to/project',
  prompt: 'Implement feature X',
});
```

**Update status:**

```typescript
await monitor.updateAgentStatus('agent-123', 'running', {
  startedAt: Date.now(),
});
```

**Get agent:**

```typescript
const agent = await monitor.getAgent('agent-123');
```

**Get agent tree:**

```typescript
const tree = await monitor.getAgentTree('root-agent-id');
// Returns hierarchical tree with children
```

**Get statistics:**

```typescript
const stats = await monitor.getStatistics();
// { totalAgents, byStatus, byEngine, byModel, ... }
```

**Cleanup orphans:**

```typescript
const cleaned = await monitor.cleanupOrphans();
// Returns count of cleaned-up agents
```

**Shutdown:**

```typescript
await monitor.shutdown();
```

### Troubleshooting

**Problem**: Agents not being tracked

- **Check**: Database initialized: `initialize()` called
- **Check**: PID provided when registering
- **Check**: `registerAgent()` called after agent creation
- **Fix**: Ensure unique agent IDs

**Problem**: Stale agents accumulating

- **Fix**: Run `cleanupOrphans()` periodically
- **Fix**: Check process death detection working
- **Fix**: Verify parent-child relationships correct

**Problem**: Telemetry missing

- **Check**: Telemetry being passed to `updateAgentStatus()`
- **Check**: JSON serialization working
- **Fix**: Ensure telemetry structure matches `ParsedTelemetry`

**Problem**: Database locked

- **Check**: Multiple monitor instances not running
- **Check**: Database file permissions
- **Fix**: Close previous connections properly

---

## SYSTEM ARCHITECTURE

### Service Interaction Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Event Emitter                             │
│                    (events.ts)                               │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│   Live Link  │ │  Memory  │ │Agent Mon │ │ Coordinator  │
│              │ │          │ │          │ │              │
│ Auto-issues  │ │ Context  │ │ Tracking │ │ Assignment   │
│ on errors    │ │ queries  │ │ PIDs     │ │ Helper spawn │
└──────┬───────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘
       │              │            │               │
       └──────────────┴────────────┴───────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  Beads Service│
              │  (Core API)   │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │  Beads CLI    │
              │  .beads.db    │
              └───────────────┘
```

### Event Flow

**Error Handling Flow:**

```
Agent Error → agent:stream event → Live Link → Assess Severity
                                              → Check Deduplication
                                              → Create Issue
                                              → Emit beads:auto-issue-created
```

**Memory Query Flow:**

```
Agent Request → Memory Service → Extract Keywords
                                → Search Beads (keyword matching)
                                → Categorize Issues
                                → Extract Decisions
                                → Check Blockers
                                → Estimate Tokens
                                → Generate Summary (with web search)
                                → Cache Result (5 min TTL)
                                → Return Context
```

**Coordination Flow:**

```
Timer (30s) → Coordinator → Get Ready Work
                          → Score Agents
                          → Select Best (score ≥0.5)
                          → Assign Issue
                          → Lock Issue
                          → Start Agent (fire & forget)
                          → Track Active Agent
                          → Emit beads:agent-assigned
```

**Helper Spawn Flow:**

```
Agent Request → Coordinator.spawnHelperAgent() → Create Helper Issue
                                            → Lock Issue
                                            → Start Helper Agent
                                            → Track Helper
                                            → Emit beads:helper-spawned
```

---

## AGENT TOOLS INTEGRATION

### Available via ClaudeProvider

**1. create_beads_issue**

```typescript
await mcpBridge.callTool('create_beads_issue', {
  title: 'Fix authentication bug',
  description: 'Users unable to login',
  type: 'bug',
  priority: 1, // P0 (critical) to P3 (low)
});
```

**2. query_beads_memory**

```typescript
await mcpBridge.callTool('query_beads_memory', {
  query: 'How to implement OAuth2',
  maxResults: 10, // Optional, default 10
});
// Returns: relatedBugs, relatedFeatures, pastDecisions, blockedBy,
//          similarIssues, summary, totalTokenEstimate
```

**3. spawn_helper_agent**

```typescript
await mcpBridge.callTool('spawn_helper_agent', {
  helperType: 'testing', // Agent type from registry
  taskDescription: 'Write unit tests for auth module',
});
// Returns: helperSessionId, helperIssueId, parentIssueId, helperAgentType
```

---

## CONFIGURATION REFERENCE

### Environment Variables

```bash
# Beads Live Link
BEADS_AUTO_ISSUES_ENABLED=true         # Enable auto-issue creation
BEADS_MAX_AUTO_ISSUES_PER_HOUR=20      # Rate limit
BEADS_DEDUPLICATION_ENABLED=true       # Deduplication

# Beads Memory
BEADS_MEMORY_CACHE_TTL=300000          # 5 minutes
BEADS_MEMORY_MAX_RESULTS=10            # Max results per category
BEADS_MEMORY_INCLUDE_CLOSED=true       # Include closed issues

# Beads Coordinator
BEADS_COORDINATION_ENABLED=true        # Enable coordination
BEADS_COORDINATION_INTERVAL=30000      # 30 seconds
BEADS_MAX_CONCURRENT_AGENTS=5          # Max parallel agents
BEADS_HELPER_SPAWNING_ENABLED=true     # Helper agent spawning
```

### TypeScript Configuration

```typescript
// Live Link Config
interface BeadsLiveLinkConfig {
  autoCreateOnErrors: boolean;
  autoCreateOnRequests: boolean;
  maxAutoIssuesPerHour: number;
  enableDeduplication: boolean;
}

// Memory Query Options
interface MemoryQueryOptions {
  maxResults?: number; // Default: 10
  includeClosed?: boolean; // Default: true
  includeInProgress?: boolean; // Default: true
  minSimilarity?: number; // Default: 0.3
}

// Coordinator Config
interface CoordinatorConfig {
  coordinationInterval: number; // Default: 30000 (30s)
  maxConcurrentAgents: number; // Default: 5
  enableAutoAssignment: boolean; // Default: true
  enableHelperSpawning: boolean; // Default: true
  maxAgentAge: number; // Default: 7200000 (2h)
}
```

---

## MONITORING & DEBUGGING

### Live Link Monitoring

```typescript
const stats = liveLink.getStats();
console.log(`Auto-issues: ${stats.autoIssueCount}/${stats.maxAutoIssuesPerHour}`);
console.log(`Cache size: ${stats.cacheSize}`);
console.log(`Reset time: ${stats.resetTime}`);
```

### Memory Monitoring

```typescript
const cacheStats = memory.getCacheStats();
console.log(`Cache entries: ${cacheStats.size}`);
cacheStats.entries.forEach((entry) => {
  console.log(`  ${entry.key} (${Math.round(entry.age / 1000)}s old)`);
});
```

### Coordinator Monitoring

```typescript
const stats = coordinator.getStats();
console.log(`Active agents: ${stats.activeAgents}`);
console.log(`Locked issues: ${stats.lockedIssues}`);
console.log(`Total assignments: ${stats.totalAssignments}`);
console.log(`Total helpers: ${stats.totalHelpersSpawned}`);

const activeAgents = coordinator.getActiveAgents();
activeAgents.forEach((agent) => {
  const age = Date.now() - agent.startTime;
  console.log(`  ${agent.agentType}: ${agent.issueId} (${Math.round(age / 1000)}s)`);
});
```

### Event Monitoring

```typescript
events.subscribe((type, payload) => {
  if (type.startsWith('beads:')) {
    console.log(`[Beads Event] ${type}:`, payload);
  }
});
```

---

## TROUBLESHOOTING GUIDE

### General Issues

**Beads CLI not found**

```bash
# Install Beads CLI
npm install -g @beads/cli

# Verify installation
beads --version

# Initialize in project
cd /path/to/project
beads init
```

**Database locked**

```bash
# Check for running processes
ps aux | grep beads

# Remove lock file (cautiously)
rm .beads/.lock

# Verify database integrity
beads check
```

**Events not firing**

```typescript
// Verify event emitter initialized
console.log('Events:', events);

// Check subscription active
// Unsubscribe function should be saved
const unsubscribe = events.subscribe(handler);
```

### Performance Issues

**Slow memory queries**

- Reduce `maxResults` (try 5)
- Disable closed issues: `includeClosed: false`
- Clear cache: `memory.clearCache()`
- Check cache hit rate in logs

**Coordination loop too frequent**

- Increase `coordinationInterval` (try 60000 for 1 minute)
- Reduce `maxConcurrentAgents` to process fewer in parallel

**Database growing large**

- Archive old closed issues
- Vacuum database: `beads vacuum`
- Prune old records: `beads prune --older-than 30d`

### Integration Issues

**Agent not getting context**

- Check memory query being called before agent starts
- Verify `query_beads_memory` tool available
- Check query not empty (log keywords)
- Reduce context size if too large

**Helper agents not spawning**

- Check `enableHelperSpawning: true`
- Verify parent agent session ID valid
- Check helper agent type registered
- Review agent registry for available types

**Issues not auto-creating**

- Verify `autoCreateOnErrors: true`
- Check event subscription active
- Review rate limit (20/hour default)
- Check Beads CLI installed

---

## BEST PRACTICES

### Writing Effective Issue Descriptions

**For bugs:**

```markdown
## Error

TypeError: Cannot read property 'x' of undefined

## Reproduction

1. Open settings page
2. Click "Save" button
3. Error occurs

## Context

Happens when user object is null
```

**For features:**

```markdown
## Goal

Add user authentication with OAuth2

## Requirements

- Support Google and GitHub providers
- JWT token management
- Session persistence

## Decision

Use passport.js for OAuth2 handling
```

### Defining Agent Capabilities

```typescript
{
  type: 'auth-expert',
  capabilities: [
    {
      name: 'authentication',
      tools: ['passport', 'jsonwebtoken', 'bcrypt']
    },
    {
      name: 'authorization',
      tools: ['acl', 'rbac']
    }
  ],
  priority: 8,  // High priority
  autoSelectable: true
}
```

### Memory Query Optimization

**Good queries:**

- "Implement OAuth2 authentication" (specific keywords)
- "Fix database connection timeout" (clear intent)
- "Add user profile management" (action-oriented)

**Poor queries:**

- "Do the thing" (too vague)
- "Fix it" (no keywords)
- "Work on feature" (generic)

### Rate Limit Management

```typescript
// Monitor rate limit
const stats = liveLink.getStats();
const utilization = stats.autoIssueCount / stats.maxAutoIssuesPerHour;
if (utilization > 0.8) {
  console.warn('Approaching rate limit');
  // Consider increasing maxAutoIssuesPerHour
}
```

---

## TESTING

### Unit Tests

```bash
# Run all Beads tests
npm test -- beads

# Run specific test file
npm test -- beads-live-link-service.test.ts
npm test -- beads-memory-service.test.ts
npm test -- beads-agent-coordinator.test.ts

# Run with coverage
npm test -- --coverage beads
```

### Integration Tests

```bash
# Test Beads integration
cd /tmp/test-project
beads init
beads create --type bug --priority 1 "Test issue"
beads list

# Test coordinator
curl -X POST http://localhost:3008/api/beads/coordinate \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/tmp/test-project"}'
```

### Manual Testing

**Test Live Link:**

```typescript
// Trigger agent error
events.emit('agent:stream', {
  type: 'error',
  sessionId: 'test-session',
  error: 'TypeError: Cannot read property',
  message: { id: '1', content: '...', timestamp: '...' },
});

// Check issue created
const issues = await beadsService.listIssues(projectPath);
console.log(
  'Auto-created issues:',
  issues.filter((i) => i.labels?.includes('auto-created'))
);
```

**Test Memory:**

```typescript
const context = await memory.queryRelevantContext(projectPath, 'Implement authentication feature');

console.log('Summary:', context.summary);
console.log('Token estimate:', context.totalTokenEstimate);
console.log('Related bugs:', context.relatedBugs.length);
```

**Test Coordinator:**

```typescript
await coordinator.start(projectPath);

// Wait for coordination loop
await new Promise((resolve) => setTimeout(resolve, 35000));

const stats = coordinator.getStats();
console.log('Agents assigned:', stats.totalAssignments);
```

---

## API REFERENCE

### BeadsService

```typescript
class BeadsService {
  // Initialize Beads in project
  async initializeBeads(projectPath: string): Promise<void>;

  // Validate Beads installation
  async validateBeadsInProject(projectPath: string): Promise<{
    installed: boolean;
    initialized: boolean;
    canInitialize: boolean;
  }>;

  // Create issue
  async createIssue(projectPath: string, input: CreateBeadsIssueInput): Promise<BeadsIssue>;

  // Get issue
  async getIssue(projectPath: string, issueId: string): Promise<BeadsIssue>;

  // Update issue
  async updateIssue(
    projectPath: string,
    issueId: string,
    updates: Partial<BeadsIssue>
  ): Promise<void>;

  // List issues
  async listIssues(projectPath: string, filters?: IssueFilters): Promise<BeadsIssue[]>;

  // Search issues
  async searchIssues(
    projectPath: string,
    query: string,
    options?: SearchOptions
  ): Promise<BeadsIssue[]>;

  // Get dependencies
  async getDependencies(
    projectPath: string,
    issueId: string
  ): Promise<{
    blocks: string[]; // Issues this issue blocks
    blockedBy: string[]; // Issues blocking this
  }>;

  // Get ready work (no blockers)
  async getReadyWork(projectPath: string): Promise<BeadsIssue[]>;
}
```

### BeadsLiveLinkService

```typescript
class BeadsLiveLinkService {
  constructor(
    beadsService: BeadsService,
    events: EventEmitter,
    config?: Partial<BeadsLiveLinkConfig>
  );

  // Initialize for project
  async initialize(projectPath: string): Promise<void>;

  // Shutdown service
  shutdown(): void;

  // Get statistics
  getStats(): {
    autoIssueCount: number;
    maxAutoIssuesPerHour: number;
    resetTime: string;
    cacheSize: number;
    config: BeadsLiveLinkConfig;
  };
}
```

### BeadsMemoryService

```typescript
class BeadsMemoryService {
  constructor(beadsService: BeadsService, mcpBridge: MCPBridge);

  // Query relevant context
  async queryRelevantContext(
    projectPath: string,
    currentTask: string,
    options?: MemoryQueryOptions
  ): Promise<MemoryContext>;

  // Clear cache
  clearCache(): void;

  // Get cache stats
  getCacheStats(): {
    size: number;
    entries: Array<{ key: string; age: number }>;
  };
}
```

### BeadsAgentCoordinator

```typescript
class BeadsAgentCoordinator {
  constructor(
    agentRegistry: AgentRegistry,
    beadsService: BeadsService,
    agentService: AgentService,
    events: EventEmitter,
    specializedAgentService: SpecializedAgentService,
    config?: Partial<CoordinatorConfig>
  );

  // Start coordination
  async start(projectPath: string): Promise<void>;

  // Stop coordination
  stop(): void;

  // Spawn helper agent
  async spawnHelperAgent(
    parentSessionId: string,
    helperType: AgentType,
    taskDescription: string,
    projectPath: string
  ): Promise<HelperAgentResult>;

  // Get statistics
  getStats(): CoordinatorStats;

  // Get active agents
  getActiveAgents(): ActiveAgent[];

  // Get locked issues
  getLockedIssues(): Map<string, string>;

  // Manual coordination trigger
  async triggerCoordination(projectPath: string): Promise<void>;
}
```

---

## QUICK COMMANDS REFERENCE

### Beads CLI

```bash
# Initialization
beads init                          # Initialize Beads in project
beads check                         # Verify installation

# Issue Management
beads create -t bug -p 1 "Error"    # Create issue
beads list                          # List all issues
beads show <id>                     # Show issue details
beads update <id> -s closed         # Update issue status
beads delete <id>                   # Delete issue

# Search & Query
beads search "keyword"              # Search issues
beads list --status open            # Filter by status
beads list --type bug               # Filter by type
beads list --priority 0             # Filter by priority

# Dependencies
beads deps <id>                     # Show dependencies
beads block <id1> <id2>             # Add blocker
beads unblock <id1> <id2>           # Remove blocker

# Database
beads vacuum                        # Compact database
beads prune --older-than 30d        # Delete old records
```

### DevFlow Server API

```bash
# Memory Query
curl -X POST http://localhost:3008/api/beads/memory \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "query": "authentication",
    "maxResults": 10
  }'

# Create Issue
curl -X POST http://localhost:3008/api/beads/issues \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "title": "Fix bug",
    "description": "...",
    "type": "bug",
    "priority": 1
  }'

# Trigger Coordination
curl -X POST http://localhost:3008/api/beads/coordinate \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/project"}'

# Spawn Helper
curl -X POST http://localhost:3008/api/beads/spawn-helper \
  -H "Content-Type: application/json" \
  -d '{
    "parentSessionId": "...",
    "helperType": "testing",
    "taskDescription": "Write tests",
    "projectPath": "/path/to/project"
  }'
```

---

## GLOSSARY

- **Beads**: Dependency-aware issue tracking system
- **Convoy**: Automatic error-to-issue conversion (Live Link)
- **MEOW**: Memory context extraction and querying
- **Patrol**: PID-based agent monitoring
- **Issue Lock**: Mechanism preventing duplicate assignments
- **Ready Work**: Issues with no unresolved dependencies
- **Helper Agent**: Sub-agent spawned for specific tasks
- **Capability Match**: Score indicating agent suitability (0-1)
- **Similarity Threshold**: Minimum score for issue similarity (default 0.3)
- **Token Estimate**: Rough character/4 calculation for context size
- **Deduplication Cache**: 24-hour cache preventing duplicate issues
- **Coordination Loop**: Periodic (30s) agent assignment cycle
- **Stale Agent**: Agent running longer than maxAgentAge (2h)
- **Orphan**: Agent without parent process or cleanup handler

---

## RESOURCES

- **Beads CLI**: https://github.com/beads-dev/beads
- **Project Root**: `/home/codespace/DevFlow`
- **Documentation**: `/home/codespace/DevFlow/docs/`
- **Tests**: `/home/codespace/DevFlow/apps/server/tests/unit/services/`
- **Types**: `/home/codespace/DevFlow/libs/@automaker/types/src/beads.ts`

---

## VERSION HISTORY

- **v1.0** (2025-01-02): Initial quick reference guide
- Based on Beads integration commit: b145bd9
- Services: Live Link (485 lines), Memory (627 lines), Coordinator (803 lines)

---

**Last Updated**: 2025-01-02
**Maintained By**: DevFlow Team
**Feedback**: Open issue in project Beads tracker
