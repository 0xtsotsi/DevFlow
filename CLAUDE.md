# DevFlow

An autonomous AI development studio where you describe features on a Kanban board and AI agents powered by Claude Code automatically implement them. Build entire applications in days by orchestrating AI agents as a team of developers.

**Note:** DevFlow is a fork of [Automaker](https://github.com/AutoMaker-Org/automaker) with additional features and enhancements.

**Target Users:** Software developers and teams adopting agentic coding workflows with AI agents while maintaining control over architecture and business logic.

## Table of Contents

- [Project Structure](#project-structure)
- [Organization Rules](#organization-rules)
- [Code Quality - Zero Tolerance](#code-quality---zero-tolerance)
- [Beads Autonomous Memory System](#beads-autonomous-memory-system)
- [Gastown-Inspired Features](#gastown-inspired-features)

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

## Gastown-Inspired Features

DevFlow includes a comprehensive automation system inspired by Gastown patterns, providing advanced workflow orchestration, custom hooks, and specialized AI skills.

### Core Components

The Gastown-inspired system consists of four major features:

1. **Workflow Orchestration** - Multi-stage automated development pipelines
2. **Hooks System** - Custom code execution at workflow checkpoints
3. **Skills System** - Specialized AI capabilities for common tasks
4. **Agent Coordination** - Intelligent agent selection and task assignment

### Feature Overview

#### 1. Workflow Orchestration

Automates complex development processes with multiple stages:

- **Research Stage** - Gather context from codebase, web, and memory
- **Planning Stage** - Create implementation plans with AI
- **Implementation Stage** - Write and modify code
- **Validation Stage** - Run tests, linting, and build checks
- **Documentation Stage** - Update documentation

**Modes:**

- `auto` - Fully automated execution (best for routine tasks)
- `semi` - Automated with checkpoint approvals (best for important changes)

**Documentation:** `/home/codespace/DevFlow/docs/WORKFLOW_ORCHESTRATION_GUIDE.md`

#### 2. Hooks System

Execute custom code at key workflow points:

- **Pre-Task Hooks** - Run before starting tasks
- **Post-Task Hooks** - Run after completing tasks
- **Pre-Commit Hooks** - Run before committing changes

**Features:**

- Blocking and non-blocking modes
- Priority-based execution
- Timeout handling
- Custom JavaScript implementations

**Default Hooks:**

- Check Git Status
- Summarize Changes
- Validate Tests
- Run Type Check
- Check for Debug Code

**Documentation:** `/home/codespace/DevFlow/docs/HOOKS_GUIDE.md`

#### 3. Skills System

Specialized AI capabilities for common development tasks:

**Research Skill:**

- Parallel research using codebase, web, and memory
- GitHub code search (via Grep MCP)
- Web documentation search (via Exa MCP)
- Beads memory queries

**Implementation Skill:**

- AI-powered code implementation
- Automated code generation
- Change tracking and summaries

**CI/CD Skill:**

- Automated testing
- Linting validation
- Build verification
- Comprehensive reports

**Workflow Orchestrator Skill:**

- Multi-skill coordination
- Checkpoint management
- Error handling and retries
- Progress tracking

**Documentation:** `/home/codespace/DevFlow/docs/SKILLS_GUIDE.md`

#### 4. Agent Coordination

Intelligent agent selection and task assignment (part of Beads system):

- Capability matching (40% weight)
- Success rate tracking (40% weight)
- Availability checking (20% weight)
- Helper agent spawning for subtasks
- Automatic issue assignment
- Stale agent cleanup (2-hour timeout)

### Implementation Status

**Completed Features:**

- [x] Workflow Orchestrator with multi-stage pipelines
- [x] Hooks System with pre-task, post-task, and pre-commit hooks
- [x] Research Skill with parallel agents
- [x] Implementation Skill for code generation
- [x] CI/CD Skill for validation
- [x] Workflow Skill for orchestration
- [x] Agent coordination and assignment
- [x] Checkpoint approval system
- [x] MCP integration (Exa, Grep)
- [x] Event-based monitoring

**File Locations:**

**Services:**

- `apps/server/src/services/workflow-orchestrator.ts` - Main workflow coordination
- `apps/server/src/services/skills-service.ts` - Skills management
- `apps/server/src/services/hooks-manager.ts` - Hooks execution
- `apps/server/src/services/beads-agent-coordinator.ts` - Agent coordination

**Routes:**

- `apps/server/src/routes/skills.ts` - Skills API endpoints
- `apps/server/src/routes/hooks.ts` - Hooks API endpoints
- `apps/server/src/routes/workflow.ts` - Workflow API endpoints

**Types:**

- `libs/types/src/skills.ts` - Skill type definitions
- `libs/types/src/hooks.ts` - Hook type definitions
- `libs/types/src/workflow.ts` - Workflow type definitions

**Tests:**

- `apps/server/tests/unit/services/workflow-orchestrator.test.ts`
- `apps/server/tests/unit/services/skills-service.test.ts`
- `apps/server/tests/unit/lib/hooks-manager.test.ts`

**Commands (Claude Skills):**

- `/.claude/commands/research.md` - Run research skill
- `/.claude/commands/implement.md` - Run implementation skill
- `/.claude/commands/cicd.md` - Run CI/CD validation
- `/.claude/commands/workflow-orchestrator.md` - Orchestrate workflows
- `/.claude/commands/fix.md` - Fix linting and type errors
- `/.claude/commands/commit.md` - Commit with AI-generated messages
- `/.claude/commands/update-app.md` - Update dependencies
- `/.claude/commands/cleanup-ai-slop.md` - Remove AI-generated code

### Quick Start Guide

**1. Enable Features:**

```bash
# .env configuration
WORKFLOW_MODE=semi                    # or 'auto'
WORKFLOW_AUTO_START=false
WORKFLOW_CHECKPOINT_APPROVAL=true
HOOKS_ENABLED=true
SKILLS_ENABLED=true
```

**2. Use Claude Commands:**

```bash
# Research a topic
/research How to implement OAuth2

# Implement a feature
/implement Add user authentication

# Run CI/CD checks
/cicd

# Fix all issues
/fix

# Commit changes
/commit
```

**3. API Usage:**

```bash
# Execute workflow
curl -X POST http://localhost:3008/api/skills/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "issueId": "issue-123",
    "projectPath": "/home/codespace/DevFlow",
    "mode": "semi"
  }'

# List skills
curl http://localhost:3008/api/skills

# List hooks
curl http://localhost:3008/api/hooks
```

**4. Monitor Events:**

```typescript
// Workflow events
events.on('workflow:started', (data) => console.log('Workflow started'));
events.on('workflow:completed', (data) => console.log('Workflow completed'));
events.on('workflow:checkpoint', (data) => console.log('Checkpoint reached'));

// Skill events
events.on('skill:started', (data) => console.log('Skill started'));
events.on('skill:completed', (data) => console.log('Skill completed'));

// Hook events
events.on('hook:executed', (data) => console.log('Hook executed'));
```

### Important Notes for AI Agents

**When Working on This Codebase:**

1. **Always Research First** - Use the Research skill before implementing features
2. **Follow Workflow Stages** - Research → Plan → Implement → Validate → Document
3. **Enable Hooks** - Hooks provide validation and quality checks
4. **Use Semi-Auto Mode** - For important changes, enable checkpoint approvals
5. **Monitor Events** - Listen to workflow/skill/hook events for progress tracking
6. **Run Quality Checks** - Use the CI/CD skill before committing
7. **Update Documentation** - Keep docs in sync with code changes

**Code Quality Requirements:**

- All features must have tests (unit and integration)
- TypeScript strict mode enabled
- ESLint and Prettier configured
- Zero tolerance for linting errors
- Test coverage > 80%

**Testing Before Committing:**

```bash
# Run all checks
npm run lint
npm run test:all
npm run build:packages
npm run format

# For server changes
npm run lint --workspace=apps/server
npm run test:server
npx tsc -p apps/server/tsconfig.json --noEmit

# For UI changes
npm run lint
npm run build --workspace=apps/ui
```

**Architecture Principles:**

- Single responsibility per file
- Clear separation of concerns
- Event-driven architecture
- Modular design (skills, hooks, workflows)
- Type safety with TypeScript
- Comprehensive error handling

### Integration Points

The Gastown-inspired features integrate with:

- **Beads** - Issue tracking and agent coordination
- **MCP Servers** - Exa (web search), Grep (code search)
- **Events System** - All components emit events for monitoring
- **Agent Service** - Underlying agent execution
- **Research Service** - Codebase and web research capabilities

### Documentation Links

- [Workflow Orchestration Guide](/home/codespace/DevFlow/docs/WORKFLOW_ORCHESTRATION_GUIDE.md)
- [Skills Guide](/home/codespace/DevFlow/docs/SKILLS_GUIDE.md)
- [Hooks Guide](/home/codespace/DevFlow/docs/HOOKS_GUIDE.md)
- [MCP Setup Guide](/home/codespace/DevFlow/docs/MCP_SETUP.md)

### Future Enhancements

Potential improvements to consider:

- [ ] Custom workflow templates
- [ ] Visual workflow editor
- [ ] Hook marketplace/sharing
- [ ] Skill composition and chaining
- [ ] Advanced retry strategies
- [ ] Workflow versioning
- [ ] Performance analytics dashboard
- [ ] Custom skill development kit
