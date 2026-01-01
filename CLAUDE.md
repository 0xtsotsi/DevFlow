# DevFlow

An autonomous AI development studio where you describe features on a Kanban board and AI agents powered by Claude Code automatically implement them. Build entire applications in days by orchestrating AI agents as a team of developers.

**Note:** DevFlow is a fork of [Automaker](https://github.com/AutoMaker-Org/automaker) with additional features and enhancements.

**Target Users:** Software developers and teams adopting agentic coding workflows with AI agents while maintaining control over architecture and business logic.

## Project Structure

```
apps/
  ├── server/              # Backend API server (Express + WebSocket)
  │   ├── src/
  │   │   ├── index.ts     # Main entry point (port 3008)
  │   │   ├── routes/      # API endpoints (fs, agent, worktree, terminal, etc.)
  │   │   ├── services/    # Business logic (agent-service, auto-mode, etc.)
  │   │   └── lib/         # Core libraries (auth, events, middleware)
  │   └── tests/           # Unit and integration tests
  │
  └── ui/                  # Frontend React application (Electron + Web)
      ├── src/
      │   ├── main.ts      # Electron main process entry
      │   ├── components/  # React components (views, dialogs, ui, layout)
      │   ├── hooks/       # Custom React hooks
      │   ├── lib/         # Frontend utilities
      │   ├── store/       # Zustand state management
      │   └── types/       # TypeScript type definitions
      └── tests/           # E2E tests (Playwright)

libs/                      # Shared libraries (monorepo)
  ├── @automaker/types     # Shared TypeScript type definitions
  ├── @automaker/utils     # Utility functions and helpers
  ├── @automaker/platform  # Platform-specific utilities (Node.js, paths)
  ├── @automaker/prompts   # AI prompt templates
  ├── @automaker/model-resolver   # Model resolution and config
  ├── @automaker/dependency-resolver  # Dependency management
  └── @automaker/git-utils # Git operation utilities

test/                      # Test configuration and fixtures
  ├── config/              # Test configs (claude-settings, gitignore, etc.)
  └── fixtures/            # Sample data for testing

scripts/                   # Build and utility scripts
init.mjs                   # Development launcher (web/electron modes)
vitest.config.ts           # Test configuration
```

## Organization Rules

**Keep code organized and modularized:**

- API routes → `apps/server/src/routes/`, one file per route/resource
- Services → `apps/server/src/services/`, one service per file
- React components → `apps/ui/src/components/`, grouped by feature
- Shared types → `libs/@automaker/types/src/`
- Utilities → Group in appropriate lib package or `lib/` folders
- Tests → Next to source code or in `tests/` directories

**Modularity principles:**

- Single responsibility per file
- Clear, descriptive file names
- Group related functionality together
- Avoid monolithic files (>300 lines)
- Export types from `@automaker/types` for shared use

## Code Quality - Zero Tolerance

After editing ANY file, run:

```bash
# UI changes
npm run lint

# Server changes
npm run lint --workspace=apps/server
npm run test:server

# Library changes
npm run build:packages
npm run test:packages

# Format all changes
npm run format
```

Fix ALL errors/warnings before continuing.

**If server changes require restart:**

1. Stop server (Ctrl+C or kill process)
2. Restart: `npm run dev:server`
3. Check for startup warnings/errors
4. Fix ALL issues before continuing

**TypeScript compilation:**

```bash
# Server typecheck
npx tsc -p apps/server/tsconfig.json --noEmit

# UI typecheck (via Vite build)
npm run build --workspace=apps/ui
```

**Before committing:**

1. Run linting: `npm run lint`
2. Run tests: `npm run test:all`
3. Format code: `npm run format`

**Lockfile validation:**

```bash
npm run lint:lockfile
```

## Beads Autonomous Memory System

DevFlow includes an autonomous agent memory system built on Beads that provides:

### Core Services

1. **BeadsLiveLinkService** (`apps/server/src/services/beads-live-link-service.ts`)
   - Automatically creates Beads issues from agent errors
   - Supports agent-requested issue creation
   - Rate limiting: 20 auto-issues/hour (configurable)
   - Intelligent deduplication with 24-hour cache
   - Severity assessment: Critical (P0), High (P1), Medium (P2), Low (P3)

2. **BeadsMemoryService** (`apps/server/src/services/beads-memory-service.ts`)
   - Queries past issues as agent context
   - Semantic similarity search (>0.3 threshold)
   - Extracts past decisions from closed issues
   - AI-generated summaries with web search (via Exa MCP)
   - 5-minute cache for performance
   - Token estimation to prevent context overflow

3. **BeadsAgentCoordinator** (`apps/server/src/services/beads-agent-coordinator.ts`)
   - Autonomous agent coordination without central orchestrator
   - Agent selection scoring: capability match (40%) + success rate (40%) + availability (20%)
   - Auto-assigns ready work (issues with no blockers)
   - Helper agent spawning for subtasks
   - Issue locking prevents duplicate assignments
   - Stale agent cleanup (2-hour timeout)

### Agent Tools

Agents can access these tools through ClaudeProvider:

1. **create_beads_issue**: Track work items, bugs, or findings
   - Input: `title`, `description?`, `type?`, `priority?`
   - Automatically creates issues in Beads

2. **query_beads_memory**: Search past issues for relevant context
   - Input: `query`, `maxResults?` (default: 10)
   - Returns categorized issues and AI summary

3. **spawn_helper_agent**: Spawn specialized helper agents
   - Input: `helperType`, `taskDescription`
   - Creates helper agent with dedicated issue

### Research Integration

The ResearchService (`apps/server/src/services/research-service.ts`) now includes `researchForIssue()`:

- Searches codebase for implementation examples (via Exa MCP)
- Finds similar GitHub issues (via Grep MCP)
- Analyzes dependencies (via TypeScript LSP)
- Synthesizes actionable recommendations

### Configuration

Environment variables for customization:

```bash
# Beads Live Link
BEADS_AUTO_ISSUES_ENABLED=true
BEADS_MAX_AUTO_ISSUES_PER_HOUR=20
BEADS_DEDUPLICATION_ENABLED=true

# Beads Memory
BEADS_MEMORY_CACHE_TTL=300000  # 5 minutes
BEADS_MEMORY_MAX_RESULTS=10
BEADS_MEMORY_INCLUDE_CLOSED=true

# Beads Coordinator
BEADS_COORDINATION_ENABLED=true
BEADS_COORDINATION_INTERVAL=30000  # 30 seconds
BEADS_MAX_CONCURRENT_AGENTS=5
BEADS_HELPER_SPAWNING_ENABLED=true
```

### Architecture

```
Agent Error → Event Emitter → BeadsLiveLink → Auto-creates Issue
                                            ↓
Agent Query → BeadsMemory → Searches Issues → Returns Context
                                            ↓
Beads Issue → BeadsAgentCoordinator → Selects Agent → Assigns Work
                                              ↓
                                    Spawns Helper Agent
```

### Usage Examples

**Automatic Error Tracking:**

```typescript
// When an agent encounters an error, BeadsLiveLink automatically
// creates an issue with appropriate severity and priority
```

**Querying Memory:**

```typescript
const context = await beadsMemoryService.queryRelevantContext(
  projectPath,
  'Implement user authentication',
  { maxResults: 10, includeClosed: true }
);
// Returns: related bugs, features, decisions, blockers, summary
```

**Spawning Helpers:**

```typescript
const result = await coordinator.spawnHelperAgent(
  parentSessionId,
  'testing',
  'Write unit tests for auth module',
  projectPath
);
```

### Monitoring

Services emit events for monitoring:

- `beads:auto-issue-created` - New issue from agent
- `beads:memory-query` - Memory query executed
- `beads:agent-assigned` - Agent assigned to issue
- `beads:helper-spawned` - Helper agent created
- `beads:agent-completed` - Agent finished successfully
- `beads:agent-failed` - Agent encountered error

### Integration Points

- **Events**: `apps/server/src/lib/events.ts` - All services use EventEmitter
- **BeadsService**: `apps/server/src/services/beads-service.ts` - Core Beads API
- **AgentService**: `apps/server/src/services/agent-service.ts` - Agent execution
- **AgentRegistry**: `apps/server/src/agents/agent-registry.ts` - Available agents
- **MCPBridge**: `apps/server/src/lib/mcp-bridge.ts` - Tool integration

### File Locations

**Services:**

- `apps/server/src/services/beads-live-link-service.ts` (485 lines)
- `apps/server/src/services/beads-memory-service.ts` (627 lines)
- `apps/server/src/services/beads-agent-coordinator.ts` (803 lines)

**Modified Files:**

- `apps/server/src/providers/claude-provider.ts` - Added 3 tools
- `apps/server/src/services/research-service.ts` - Added researchForIssue()
- `apps/server/src/index.ts` - Service initialization
- `libs/types/src/beads.ts` - Added 4 new interfaces

**Tests:**

- `apps/server/tests/unit/services/beads-live-link-service.test.ts`
- `apps/server/tests/unit/services/beads-memory-service.test.ts`
- `apps/server/tests/unit/services/beads-agent-coordinator.test.ts`
