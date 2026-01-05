# Gastown-Inspired Features Implementation Guide

## Quick Start

This guide documents the **autonomous agent memory and coordination system** in DevFlow, inspired by Gastown's concepts of persistent task tracking and agent collaboration. The system consists of three core services:

1. **BeadsLiveLinkService** - Auto-creates issues from agent errors
2. **BeadsMemoryService** - Queries past issues as agent context
3. **BeadsAgentCoordinator** - Orchestrates autonomous agent assignment

### Immediate Setup

```bash
# 1. Install Beads CLI (dependency-aware task tracker)
npm install -g @beads-cli/core

# 2. Initialize Beads in your project
cd /path/to/project
bd init

# 3. Enable environment variables
cp apps/server/.env.example apps/server/.env
# Edit apps/server/.env and set:
BEADS_AUTO_ISSUES_ENABLED=true
BEADS_MEMORY_CACHE_TTL=300000
BEADS_COORDINATION_ENABLED=true

# 4. Restart server
npm run dev:server
```

### Key Concepts

- **Beads Issues** - Dependency-aware tasks that track blockers and ready work
- **Agent Memory** - Past issues provide context for current tasks
- **Autonomous Coordination** - Agents self-assign work based on capabilities
- **Error Tracking** - Automatic issue creation from agent failures

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Type Definitions](#type-definitions)
4. [Service Implementation](#service-implementation)
   - [BeadsLiveLinkService](#beadslivelinkservice)
   - [BeadsMemoryService](#beadsmemoryservice)
   - [BeadsAgentCoordinator](#beadsagentcoordinator)
5. [API Routes](#api-routes)
6. [Integration Points](#integration-points)
7. [Configuration](#configuration)
8. [Testing](#testing)
9. [Monitoring](#monitoring)
10. [File Structure](#file-structure)

---

## Prerequisites

### System Requirements

- **Node.js** >= 18.0.0
- **Beads CLI** >= 1.0.0 (`@beads-cli/core`)
- **DevFlow Server** running on port 3008

### Dependencies

```json
{
  "@automaker/types": "workspace:*",
  "@beads-cli/core": "^1.0.0",
  "crypto": "built-in",
  "events": "built-in"
}
```

### MCP Tools (Optional but Recommended)

- **Exa MCP** - For web search in memory summaries
- **Grep MCP** - For code search in research
- **Greptile MCP** - For semantic code search

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     DevFlow Server                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Event Emitter (lib/events.ts)              │  │
│  │  - agent:stream                                       │  │
│  │  - beads:issue-updated                                │  │
│  │  - beads:task-ready                                   │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                           │
│    ┌────────────┴────────────┬────────────┬─────────────┐  │
│    │                         │            │             │  │
│    ▼                         ▼            ▼             ▼  │
│  ┌────────┐            ┌──────────┐  ┌─────────┐  ┌───────────┐  │
│  │ Live   │            │  Memory  │  │  Coord  │  │  Beads    │  │
│  │  Link  │───────────▶│ Service  │  │inator   │  │  Service  │  │
│  └────────┘            └──────────┘  └─────────┘  └───────────┘  │
│  Errors ──▶ Issues      Context      Agent       Core API      │
│  Requests ─▶ Issues     Queries      Assignment  (bd CLI)      │
│                                                                  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Agent Error
    │
    ▼
[Event Emitter] ──▶ [BeadsLiveLinkService]
                           │
                           ▼
                    Auto-create Issue
                           │
                           ▼
                    [Beads Database]

Agent Query ──▶ [BeadsMemoryService]
                     │
                     ├─▶ Search Past Issues
                     ├─▶ Extract Decisions
                     ├─▶ Web Search (Exa)
                     │
                     ▼
              Return Context

Issue Ready ──▶ [Event Emitter] ──▶ [BeadsAgentCoordinator]
                                                │
                                                ├─▶ Select Agent
                                                ├─▶ Assign Work
                                                ├─▶ Spawn Helpers
                                                │
                                                ▼
                                         Execute Task
```

---

## Type Definitions

### Core Beads Types

Location: `/home/codespace/DevFlow/libs/types/src/beads.ts`

```typescript
/**
 * Issue status in Beads
 */
export type BeadsIssueStatus = 'open' | 'in_progress' | 'blocked' | 'closed';

/**
 * Issue type in Beads
 */
export type BeadsIssueType = 'bug' | 'feature' | 'task' | 'epic' | 'chore';

/**
 * Issue priority (0=highest, 4=lowest)
 */
export type BeadsIssuePriority = 0 | 1 | 2 | 3 | 4;

/**
 * Dependency types in Beads
 * - blocks: Hard blocker (must complete before)
 * - related: Soft relationship (connected work)
 * - parent: Hierarchical (epic -> feature -> task)
 * - discovered-from: Discovered during work on another issue
 */
export type BeadsDependencyType = 'blocks' | 'related' | 'parent' | 'discovered-from';

/**
 * A Beads issue
 */
export interface BeadsIssue {
  /** Issue ID (e.g., bd-a1b2 or bd-a1b2.1 for child issues) */
  id: string;
  /** Issue title */
  title: string;
  /** Detailed description */
  description: string;
  /** Current status */
  status: BeadsIssueStatus;
  /** Issue type */
  type: BeadsIssueType;
  /** Priority (0=highest, 4=lowest) */
  priority: BeadsIssuePriority;
  /** Labels for categorization */
  labels: string[];
  /** Dependencies on other issues */
  dependencies?: BeadsDependency[];
  /** ISO timestamp of creation */
  createdAt?: string;
  /** ISO timestamp of last update */
  updatedAt?: string;
  /** ISO timestamp of closure (if closed) */
  closedAt?: string;
  /** Parent issue ID (for child issues) */
  parentIssueId?: string;
  /** Alias for parentIssueId for CLI compatibility */
  parentId?: string;
  /** Child issue IDs (for parent issues) */
  childIssueIds?: string[];
  /** Optional link to DevFlow feature */
  featureId?: string;
}

/**
 * A dependency relationship
 */
export interface BeadsDependency {
  /** ID of the issue this depends on */
  issueId?: string;
  /** Type of dependency */
  type?: BeadsDependencyType;
  /** Target issue ID (as returned by CLI) */
  to?: string;
  /** From issue ID (as returned by CLI) */
  from?: string;
}

/**
 * Input for creating a new issue
 */
export interface CreateBeadsIssueInput {
  title: string;
  description?: string;
  status?: BeadsIssueStatus;
  type?: BeadsIssueType;
  priority?: number;
  labels?: string[];
  dependencies?: Array<{ issueId: string; type: BeadsDependencyType }>;
  parentIssueId?: string;
}

/**
 * Agent assignment status for a Beads issue
 */
export interface AgentAssignment {
  issueId: string;
  agentType: string;
  sessionId: string;
  status: 'working' | 'waiting' | 'blocked';
  assignedAt: string;
  agentName?: string;
}

/**
 * Map of issue IDs to their agent assignments
 */
export type AgentAssignments = Record<string, AgentAssignment>;
```

### Service-Specific Types

```typescript
/**
 * Memory context returned to agents
 */
export interface MemoryContext {
  relatedBugs: BeadsIssue[];
  relatedFeatures: BeadsIssue[];
  pastDecisions: Array<{ issue: BeadsIssue; decision: string }>;
  blockedBy: BeadsIssue[];
  similarIssues: BeadsIssue[];
  summary: string;
  totalTokenEstimate: number;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  coordinationInterval: number; // How often to run coordination (ms)
  maxConcurrentAgents: number; // Maximum concurrent agents
  enableAutoAssignment: boolean; // Enable automatic task assignment
  enableHelperSpawning: boolean; // Enable helper agent spawning
  maxAgentAge: number; // Maximum age for agent (ms)
}

/**
 * Live Link configuration
 */
export interface BeadsLiveLinkConfig {
  autoCreateOnErrors: boolean;
  autoCreateOnRequests: boolean;
  maxAutoIssuesPerHour: number;
  enableDeduplication: boolean;
}
```

---

## Service Implementation

### BeadsLiveLinkService

**Purpose:** Automatically creates Beads issues from agent errors and requests.

**Location:** `/home/codespace/DevFlow/apps/server/src/services/beads-live-link-service.ts`

#### Key Features

1. **Error Severity Assessment**
   - Critical: Segfaults, OOM, fatal errors → P0
   - High: Auth failures, connection refused → P1
   - Medium: Type errors, validation → P2
   - Low: Warnings → P3

2. **Rate Limiting**
   - Default: 20 auto-issues/hour
   - Resets after hour elapsed
   - Configurable via `BEADS_MAX_AUTO_ISSUES_PER_HOUR`

3. **Deduplication**
   - 24-hour cache of error hashes
   - Normalizes errors (removes paths, line numbers, UUIDs)
   - Checks for similar open issues before creating

#### Implementation

```typescript
import { BeadsService } from './beads-service.js';
import type { EventEmitter } from '../lib/events.js';
import type { BeadsIssue, CreateBeadsIssueInput } from '@automaker/types';

export class BeadsLiveLinkService {
  private beadsService: BeadsService;
  private events: EventEmitter;
  private config: BeadsLiveLinkConfig;
  private projectPath?: string;
  private autoIssueCount: number = 0;
  private autoIssueResetTime: number;
  private errorCache: Map<string, { issueId: string; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    beadsService: BeadsService,
    events: EventEmitter,
    config: Partial<BeadsLiveLinkConfig> = {}
  ) {
    this.beadsService = beadsService;
    this.events = events;
    this.config = {
      autoCreateOnErrors: config.autoCreateOnErrors ?? true,
      autoCreateOnRequests: config.autoCreateOnRequests ?? true,
      maxAutoIssuesPerHour: config.maxAutoIssuesPerHour ?? 20,
      enableDeduplication: config.enableDeduplication ?? true,
    };
    this.autoIssueResetTime = Date.now() + 60 * 60 * 1000;
  }

  /**
   * Initialize the live link service for a project
   */
  async initialize(projectPath: string): Promise<void> {
    this.projectPath = projectPath;

    // Validate Beads is installed
    const validation = await this.beadsService.validateBeadsInProject(projectPath);
    if (!validation.installed) {
      console.warn('[BeadsLiveLink] Beads CLI not installed, auto-issue creation disabled');
      return;
    }

    // Auto-initialize Beads if needed
    if (!validation.initialized && validation.canInitialize) {
      await this.beadsService.initializeBeads(projectPath);
    }

    // Subscribe to agent events
    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'agent:stream') {
        this.handleAgentStream(payload).catch((error) => {
          console.error('[BeadsLiveLink] Error handling agent stream:', error);
        });
      }
    });
  }

  /**
   * Handle agent error events
   */
  private async handleAgentError(data: AgentErrorData): Promise<BeadsIssue | null> {
    // Check rate limiting
    if (!this.canCreateAutoIssue()) {
      return null;
    }

    // Check for duplicates if enabled
    if (this.config.enableDeduplication) {
      const existingIssue = await this.findExistingIssue(data.error);
      if (existingIssue) {
        return existingIssue;
      }
    }

    // Assess error severity
    const severity = this.assessErrorSeverity(data.error);

    // Map severity to priority
    const priorityMap: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    const priority = priorityMap[severity] ?? 2;

    // Create issue
    const issueInput: CreateBeadsIssueInput = {
      title: this.extractErrorTitle(data.error),
      description: this.formatErrorDescription(data),
      type: 'bug',
      priority,
      labels: ['auto-created', 'agent-error', severity],
    };

    const issue = await this.beadsService.createIssue(this.projectPath, issueInput);

    // Cache for deduplication
    const errorHash = this.hashError(data.error);
    this.errorCache.set(errorHash, {
      issueId: issue.id,
      timestamp: Date.now(),
    });

    this.autoIssueCount++;
    return issue;
  }

  /**
   * Assess error severity based on error message content
   */
  private assessErrorSeverity(error: string): 'low' | 'medium' | 'high' | 'critical' {
    const normalizedError = error.toLowerCase();

    const criticalPatterns = [
      'segmentation fault',
      'segfault',
      'database corrupted',
      'out of memory',
      'fatal error',
    ];

    const highPatterns = [
      'authentication failed',
      'connection refused',
      'cannot find module',
      'permission denied',
      'unhandled exception',
    ];

    const mediumPatterns = ['typeerror', 'referenceerror', 'validation', 'parse error'];

    if (criticalPatterns.some((p) => normalizedError.includes(p))) return 'critical';
    if (highPatterns.some((p) => normalizedError.includes(p))) return 'high';
    if (mediumPatterns.some((p) => normalizedError.includes(p))) return 'medium';
    return 'low';
  }

  /**
   * Hash error message for deduplication
   * Normalizes error by removing numbers, paths, and line numbers
   */
  private hashError(error: string): string {
    const normalized = error
      .toLowerCase()
      .replace(/\b\d+\b/g, 'N')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
      .replace(/0x[a-f0-9]+/gi, 'ADDR')
      .replace(/[/\\][\w./\\-]+/g, 'PATH')
      .replace(/:\d+/g, ':LINE')
      .replace(/\s+/g, ' ')
      .trim();

    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
}
```

#### Events Emitted

```typescript
// Auto-issue created
events.emit('beads:auto-issue-created', {
  issueId: string,
  severity: string,
  priority: number,
  timestamp: string,
});

// Rate limit reached
events.emit('beads:rate-limit-reached', {
  count: number,
  max: number,
  resetTime: string,
});
```

---

### BeadsMemoryService

**Purpose:** Queries past Beads issues as context for agents.

**Location:** `/home/codespace/DevFlow/apps/server/src/services/beads-memory-service.ts`

#### Key Features

1. **Semantic Search**
   - Keyword extraction from task descriptions
   - Similarity scoring (>0.3 threshold)
   - Categorized results (bugs, features, decisions)

2. **Decision Extraction**
   - Scans closed issues for decision markers
   - Keywords: "decision:", "resolution:", "solution:"
   - Returns up to 5 past decisions

3. **Web Search Integration**
   - Uses Exa MCP for best practices research
   - Adds external resources to context
   - Graceful degradation if unavailable

4. **Performance Caching**
   - 5-minute TTL
   - Max 100 cached queries
   - Automatic cleanup

#### Implementation

```typescript
import { BeadsService } from './beads-service.js';
import { MCPBridge } from '../lib/mcp-bridge.js';
import type { BeadsIssue } from '@automaker/types';

export class BeadsMemoryService {
  private beadsService: BeadsService;
  private mcpBridge: MCPBridge;
  private cache: Map<string, { context: MemoryContext; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;

  constructor(beadsService: BeadsService, mcpBridge: MCPBridge) {
    this.beadsService = beadsService;
    this.mcpBridge = mcpBridge;
  }

  /**
   * Query relevant context for a task
   */
  async queryRelevantContext(
    projectPath: string,
    currentTask: string,
    options: MemoryQueryOptions = {}
  ): Promise<MemoryContext> {
    // Check cache first
    const cacheKey = this.hashQuery(projectPath, currentTask, options);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.context;
    }

    // Extract keywords from task
    const keywords = this.extractKeywords(currentTask);
    const maxResults = options.maxResults || 10;

    // Search issues by keywords
    let allIssues: BeadsIssue[] = [];
    for (const keyword of keywords.slice(0, 2)) {
      const results = await this.beadsService.searchIssues(projectPath, keyword, {
        limit: maxResults * 2,
      });
      allIssues = allIssues.concat(results);
    }

    // Deduplicate by ID
    const uniqueIssues = Array.from(new Map(allIssues.map((i) => [i.id, i])).values());

    // Filter by status
    const filteredIssues = uniqueIssues.filter((issue) => {
      if (issue.status === 'open' || issue.status === 'blocked') return true;
      if (issue.status === 'closed' && options.includeClosed !== false) return true;
      if (issue.status === 'in_progress' && options.includeInProgress !== false) return true;
      return false;
    });

    // Categorize issues
    const relatedBugs = filteredIssues.filter((i) => i.type === 'bug').slice(0, maxResults);
    const relatedFeatures = filteredIssues
      .filter((i) => i.type === 'feature' || i.type === 'epic')
      .slice(0, maxResults);

    // Find similar issues
    const minSimilarity = options.minSimilarity ?? 0.3;
    const similarIssues = this.findSimilarIssues(currentTask, filteredIssues, minSimilarity);

    // Extract decisions from closed issues
    const pastDecisions = await this.extractDecisions(
      filteredIssues.filter((i) => i.status === 'closed')
    );

    // Find blocking issues
    const blockedBy = await this.findBlockingIssues(projectPath, filteredIssues);

    // Build context
    const context: MemoryContext = {
      relatedBugs,
      relatedFeatures,
      pastDecisions,
      blockedBy,
      similarIssues,
      summary: '',
      totalTokenEstimate: 0,
    };

    // Estimate tokens
    context.totalTokenEstimate = this.estimateTokens(context);

    // Generate summary (with web search if available)
    context.summary = await this.generateSummary(currentTask, context);

    // Cache the result
    this.cache.set(cacheKey, { context, timestamp: Date.now() });

    return context;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter((word) => !['this', 'that', 'with', 'from'].includes(word));

    const unique = Array.from(new Set(words));
    return unique.slice(0, 5);
  }

  /**
   * Estimate token count (rough estimate: 4 characters per token)
   */
  private estimateTokens(context: Partial<MemoryContext>): number {
    let totalChars = 0;
    for (const bug of context.relatedBugs || []) {
      totalChars += bug.title.length + (bug.description?.length || 0);
    }
    // ... similar for other categories
    return Math.ceil(totalChars / 4);
  }

  /**
   * Generate summary with web search results
   */
  private async generateSummary(task: string, context: MemoryContext): Promise<string> {
    // Try to use Exa MCP for web search if available
    if (this.mcpBridge.isAvailable()) {
      try {
        const keywords = this.extractKeywords(task).slice(0, 3);
        const searchQuery = `${keywords.join(' ')} best practices implementation`;

        const result = await this.mcpBridge.callTool('mcp__exa__web_search_exa', {
          query: searchQuery,
          numResults: 3,
          type: 'auto',
        });

        if (result.success && result.data) {
          const webResults = result.data as Array<{ title: string; url: string }>;
          return this.formatSummaryWithWebSearch(task, context, webResults);
        }
      } catch (error) {
        console.warn('[BeadsMemory] Exa MCP search failed, falling back to basic summary');
      }
    }

    return this.formatBasicSummary(task, context);
  }
}
```

#### Output Format

```markdown
## Memory Context for: "Implement user authentication"

### Related Bugs (3)

- **bd-a1b2**: Login fails with invalid credentials (closed)
- **bd-c3d4**: Session timeout too short (open)
- **bd-e5f6**: Password reset not working (blocked)

### Related Features (2)

- **bd-g7h8**: OAuth integration (in_progress)
- **bd-i9j0**: Two-factor authentication (open)

### Past Decisions

- Use bcrypt for password hashing with cost factor 12 (bd-k1l2)
- Store sessions in Redis with 30-minute expiration (bd-m3n4)
- Implement JWT for API authentication (bd-o5p6)

### Relevant Resources

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
```

---

### BeadsAgentCoordinator

**Purpose:** Orchestrates autonomous agent coordination using Beads for task management.

**Location:** `/home/codespace/DevFlow/apps/server/src/services/beads-agent-coordinator.ts`

#### Key Features

1. **Autonomous Agent Selection**
   - Scoring algorithm: capability match (40%) + success rate (40%) + availability (20%)
   - Minimum score threshold: 0.5
   - Fallback to agent priority if no capabilities defined

2. **Helper Agent Spawning**
   - Creates subtasks as child issues
   - Spawns specialized agents for specific work
   - Tracks parent-child relationships

3. **Issue Locking**
   - Prevents duplicate assignments
   - Automatic cleanup on completion
   - Stale agent removal (2-hour timeout)

4. **Event-Driven Coordination**
   - Listens for `beads:task-ready` events
   - Triggers immediate coordination on issue updates
   - Periodic coordination loop (30-second default)

#### Implementation

```typescript
import { AgentService } from './agent-service.js';
import { BeadsService } from './beads-service.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { SpecializedAgentService } from '../agents/specialized-agent-service.js';

export class BeadsAgentCoordinator {
  private beadsService: BeadsService;
  private agentService: AgentService;
  private agentRegistry: AgentRegistry;
  private specializedAgentService: SpecializedAgentService;
  private events: EventEmitter;
  private config: CoordinatorConfig;

  private coordinationInterval?: NodeJS.Timeout;
  private activeAgents: Map<string, ActiveAgent> = new Map();
  private issueLocks: Map<string, string> = new Map();

  constructor(
    agentRegistry: AgentRegistry,
    beadsService: BeadsService,
    agentService: AgentService,
    events: EventEmitter,
    specializedAgentService: SpecializedAgentService,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.agentRegistry = agentRegistry;
    this.beadsService = beadsService;
    this.agentService = agentService;
    this.events = events;
    this.specializedAgentService = specializedAgentService;

    this.config = {
      coordinationInterval: config.coordinationInterval || 30000,
      maxConcurrentAgents: config.maxConcurrentAgents || 5,
      enableAutoAssignment: config.enableAutoAssignment !== false,
      enableHelperSpawning: config.enableHelperSpawning !== false,
      maxAgentAge: config.maxAgentAge || 7200000, // 2 hours
    };
  }

  /**
   * Start the coordinator
   */
  async start(projectPath: string): Promise<void> {
    // Subscribe to beads events
    this.eventUnsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'beads:issue-updated') {
        this.handleIssueUpdate(payload);
      } else if (type === 'beads:task-ready') {
        this.handleTaskReady(payload);
      }
    });

    // Start coordination loop
    this.coordinationInterval = setInterval(() => {
      this.coordinateAgents(projectPath).catch(error => {
        console.error('[BeadsCoordinator] Error in coordination loop:', error);
      });
    }, this.config.coordinationInterval);

    // Run initial coordination
    await this.coordinateAgents(projectPath);
  }

  /**
   * Main coordination loop - assigns work to available agents
   */
  async coordinateAgents(projectPath: string): Promise<void> {
    // Clean up stale agents
    this.cleanupStaleAgents();

    // Check if we can start more agents
    if (this.activeAgents.size >= this.config.maxConcurrentAgents) {
      return;
    }

    // Get ready work from Beads
    const readyWork = await this.beadsService.getReadyWork(projectPath);

    // Filter out locked issues and in-progress issues
    const availableWork = readyWork.filter(
      issue => !this.issueLocks.has(issue.id) && issue.status !== 'in_progress'
    );

    // Assign work to agents
    for (const issue of availableWork) {
      if (this.activeAgents.size >= this.config.maxConcurrentAgents) break;

      const agentType = await this.selectAgentForIssue(issue);
      if (agentType) {
        await this.assignIssueToAgent(issue, agentType, projectPath);
      }
    }
  }

  /**
   * Select the best agent for an issue
   */
  private async selectAgentForIssue(issue: BeadsIssue): Promise<AgentType | null> {
    const autoSelectableAgents = this.agentRegistry.getAutoSelectableAgents();
    if (autoSelectableAgents.length === 0) {
      return null;
    }

    // Score each agent for this issue
    const scores: AgentScore[] = [];
    for (const agentType of autoSelectableAgents) {
      const score = await this.scoreAgentForIssue(agentType, issue);
      scores.push({ agentType, score, ... });
    }

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    // Return top agent if score is above threshold
    const topScore = scores[0];
    if (topScore.score >= 0.5) {
      return topScore.agentType;
    }

    return null;
  }

  /**
   * Score an agent for an issue (0-1)
   */
  private async scoreAgentForIssue(agentType: AgentType, issue: BeadsIssue): Promise<number> {
    const config = this.agentRegistry.getAgentConfig(agentType);
    if (!config) return 0;

    const stats = this.agentRegistry.getAgentStats(agentType);
    const successRate = stats?.successRate || 1.0;

    // Calculate capability match (40% weight)
    const capabilityMatch = this.calculateCapabilityMatch(config, issue);

    // Calculate availability (20% weight)
    const activeCount = Array.from(this.activeAgents.values())
      .filter(agent => agent.agentType === agentType).length;
    const availability = 1 - activeCount / this.config.maxConcurrentAgents;

    // Calculate weighted score
    const score = capabilityMatch * 0.4 + successRate * 0.4 + availability * 0.2;

    return score;
  }

  /**
   * Calculate capability match score
   */
  private calculateCapabilityMatch(config: AgentConfig, issue: BeadsIssue): number {
    const capabilities = config.capabilities || [];
    if (capabilities.length === 0) {
      return 0.5; // Neutral score
    }

    const issueText = `${issue.title} ${issue.description || ''} ${issue.type}`.toLowerCase();
    let matchCount = 0;

    for (const cap of capabilities) {
      const capName = cap.name.toLowerCase();
      if (issueText.includes(capName)) {
        matchCount++;
        continue;
      }

      // Check related tools
      for (const tool of cap.tools || []) {
        if (issueText.includes(tool.toLowerCase())) {
          matchCount++;
          break;
        }
      }
    }

    return matchCount / capabilities.length;
  }

  /**
   * Spawn a helper agent for a subtask
   */
  async spawnHelperAgent(
    parentSessionId: string,
    helperType: AgentType,
    taskDescription: string,
    projectPath: string
  ): Promise<HelperAgentResult> {
    const parentAgent = this.activeAgents.get(parentSessionId);
    if (!parentAgent) {
      throw new Error(`Parent session ${parentSessionId} not found`);
    }

    // Create helper issue via Beads
    const helperIssue = await this.beadsService.createIssue(projectPath, {
      title: `Helper: ${taskDescription.substring(0, 50)}...`,
      description: taskDescription,
      type: 'task',
      priority: 2,
      parentIssueId: parentAgent.issueId,
    });

    // Lock the helper issue
    this.issueLocks.set(helperIssue.id, 'assigning');

    // Update status to in_progress
    await this.beadsService.updateIssue(projectPath, helperIssue.id, {
      status: 'in_progress',
    });

    // Create and execute helper agent
    const session = await this.agentService.createSession(
      `Helper: ${helperIssue.title}`,
      projectPath,
      projectPath
    );

    const context = {
      featureId: helperIssue.featureId || helperIssue.id,
      projectPath,
      cwd: projectPath,
      currentTask: helperIssue.title,
      abortController: new AbortController(),
    };

    // Execute with specialized agent (fire and forget)
    this.specializedAgentService
      .executeTaskWithAgent(context, this.buildAgentPrompt(helperIssue), undefined, undefined, {
        forceAgentType: helperType,
      })
      .then(result => {
        // Update issue status based on result
        this.beadsService.updateIssue(projectPath, helperIssue.id, {
          status: result.success ? 'closed' : 'open',
        });

        // Clear lock
        this.issueLocks.delete(helperIssue.id);

        // Remove from active agents
        this.activeAgents.delete(session.id);

        // Emit helper completion event
        this.events.emit('beads:helper-completed', {
          issueId: helperIssue.id,
          sessionId: session.id,
          parentSessionId,
          agentType: helperType,
          success: result.success,
        });
      });

    // Track helper agent
    this.activeAgents.set(session.id, {
      sessionId: session.id,
      agentType: helperType,
      issueId: helperIssue.id,
      startTime: Date.now(),
    });

    this.totalHelpersSpawned++;

    return {
      helperSessionId: session.id,
      helperIssueId: helperIssue.id,
      parentIssueId: parentAgent.issueId,
      helperAgentType: helperType,
    };
  }
}
```

#### Events Emitted

```typescript
// Agent started working on issue
events.emit('beads:agent-started', {
  issueId: string,
  sessionId: string,
  agentType: AgentType,
  timestamp: string,
});

// Agent assigned to issue
events.emit('beads:agent-assigned', {
  issueId: string,
  sessionId: string,
  agentType: AgentType,
  issue: BeadsIssue,
});

// Agent completed successfully
events.emit('beads:agent-completed', {
  issueId: string,
  sessionId: string,
  agentType: AgentType,
  success: boolean,
  timestamp: string,
});

// Agent failed
events.emit('beads:agent-failed', {
  issueId: string,
  sessionId: string,
  agentType: AgentType,
  error: string,
});

// Helper agent spawned
events.emit('beads:helper-spawned', {
  helperIssueId: string,
  helperSessionId: string,
  parentIssueId: string,
  parentSessionId: string,
  agentType: AgentType,
  timestamp: string,
});
```

---

## API Routes

### Beads Routes

**Base Path:** `/api/beads`

#### GET /api/beads/assignments

Get current agent assignments.

**Response:**

```json
{
  "success": true,
  "assignments": [
    {
      "issueId": "bd-a1b2",
      "agentType": "implementation",
      "assignedAt": "2025-01-02T10:30:00Z"
    }
  ]
}
```

#### GET /api/beads/list

List Beads issues with optional filters.

**Query Parameters:**

- `status` - Filter by status (comma-separated)
- `type` - Filter by type (comma-separated)
- `priorityMin` - Minimum priority (0-4)
- `priorityMax` - Maximum priority (0-4)
- `titleContains` - Search in title
- `ids` - Specific issue IDs (comma-separated)

**Response:**

```json
{
  "success": true,
  "issues": [
    {
      "id": "bd-a1b2",
      "title": "Implement user authentication",
      "status": "open",
      "type": "feature",
      "priority": 1,
      "labels": ["backend", "security"],
      "dependencies": [],
      "createdAt": "2025-01-02T10:00:00Z"
    }
  ]
}
```

#### POST /api/beads/create

Create a new Beads issue.

**Request Body:**

```json
{
  "title": "Fix login bug",
  "description": "Users cannot login with valid credentials",
  "type": "bug",
  "priority": 0,
  "labels": ["critical", "auth"],
  "dependencies": [{ "issueId": "bd-c3d4", "type": "blocks" }]
}
```

**Response:**

```json
{
  "success": true,
  "issue": {
    "id": "bd-e5f6",
    "title": "Fix login bug",
    "status": "open",
    "type": "bug",
    "priority": 0,
    "labels": ["critical", "auth"],
    "createdAt": "2025-01-02T11:00:00Z"
  }
}
```

#### GET /api/beads/ready

Get ready work (issues with no blockers).

**Response:**

```json
{
  "success": true,
  "readyIssues": [
    {
      "id": "bd-a1b2",
      "title": "Implement user authentication",
      "status": "open",
      "type": "feature",
      "priority": 1
    }
  ]
}
```

#### PUT /api/beads/update/:issueId

Update an existing issue.

**Request Body:**

```json
{
  "status": "in_progress",
  "labels": ["backend", "in-progress"]
}
```

**Response:**

```json
{
  "success": true,
  "issue": {
    "id": "bd-a1b2",
    "title": "Implement user authentication",
    "status": "in_progress",
    "updatedAt": "2025-01-02T12:00:00Z"
  }
}
```

#### DELETE /api/beads/delete/:issueId

Delete an issue.

**Response:**

```json
{
  "success": true,
  "deleted": "bd-a1b2"
}
```

---

## Integration Points

### Server Initialization

**Location:** `/home/codespace/DevFlow/apps/server/src/index.ts`

```typescript
import { BeadsService } from './services/beads-service.js';
import { BeadsLiveLinkService } from './services/beads-live-link-service.js';
import { BeadsMemoryService } from './services/beads-memory-service.js';
import { BeadsAgentCoordinator } from './services/beads-agent-coordinator.js';
import { MCPBridge } from './lib/mcp-bridge.js';
import { AgentRegistry } from './agents/agent-registry.js';
import { AgentService } from './services/agent-service.js';
import { SpecializedAgentService } from './agents/specialized-agent-service.js';

// Initialize services
const beadsService = new BeadsService();
const mcpBridge = new MCPBridge(events);
const beadsLiveLink = new BeadsLiveLinkService(beadsService, events, {
  autoCreateOnErrors: process.env.BEADS_AUTO_ISSUES_ENABLED === 'true',
  maxAutoIssuesPerHour: parseInt(process.env.BEADS_MAX_AUTO_ISSUES_PER_HOUR || '20'),
  enableDeduplication: process.env.BEADS_DEDUPLICATION_ENABLED !== 'false',
});

const beadsMemory = new BeadsMemoryService(beadsService, mcpBridge);

const agentRegistry = new AgentRegistry();
const agentService = new AgentService(/* ... */);
const specializedAgentService = new SpecializedAgentService();

const beadsCoordinator = new BeadsAgentCoordinator(
  agentRegistry,
  beadsService,
  agentService,
  events,
  specializedAgentService,
  {
    coordinationInterval: parseInt(process.env.BEADS_COORDINATION_INTERVAL || '30000'),
    maxConcurrentAgents: parseInt(process.env.BEADS_MAX_CONCURRENT_AGENTS || '5'),
    enableAutoAssignment: process.env.BEADS_COORDINATION_ENABLED === 'true',
    enableHelperSpawning: process.env.BEADS_HELPER_SPAWNING_ENABLED !== 'false',
  }
);

// Initialize services for project
const projectPath = process.cwd();
await beadsLiveLink.initialize(projectPath);
await beadsCoordinator.start(projectPath);
```

### ClaudeProvider Tools

**Location:** `/home/codespace/DevFlow/apps/server/src/providers/claude-provider.ts`

```typescript
import { BeadsMemoryService } from '../services/beads-memory-service.js';
import { BeadsAgentCoordinator } from '../services/beads-agent-coordinator.js';

class ClaudeProvider {
  private beadsMemory?: BeadsMemoryService;
  private beadsCoordinator?: BeadsAgentCoordinator;

  constructor(/* ... */) {
    // Initialize services
    this.beadsMemory = beadsMemory;
    this.beadsCoordinator = beadsCoordinator;
  }

  /**
   * Query Beads memory for relevant context
   */
  private async handleQueryBeadsMemory(args: any) {
    if (!this.beadsMemory) {
      throw new Error('BeadsMemoryService not available');
    }

    const context = await this.beadsMemory.queryRelevantContext(
      this.context.projectPath,
      args.query,
      {
        maxResults: args.maxResults || 10,
        includeClosed: args.includeClosed !== false,
        includeInProgress: args.includeInProgress !== false,
        minSimilarity: args.minSimilarity || 0.3,
      }
    );

    return {
      relatedBugs: context.relatedBugs.length,
      relatedFeatures: context.relatedFeatures.length,
      pastDecisions: context.pastDecisions.length,
      summary: context.summary,
      tokenEstimate: context.totalTokenEstimate,
    };
  }

  /**
   * Spawn a helper agent
   */
  private async handleSpawnHelperAgent(args: any) {
    if (!this.beadsCoordinator) {
      throw new Error('BeadsAgentCoordinator not available');
    }

    const result = await this.beadsCoordinator.spawnHelperAgent(
      this.sessionId,
      args.helperType,
      args.taskDescription,
      this.context.projectPath
    );

    return {
      helperSessionId: result.helperSessionId,
      helperIssueId: result.helperIssueId,
      parentIssueId: result.parentIssueId,
    };
  }

  /**
   * Create a Beads issue
   */
  private async handleCreateBeadsIssue(args: any) {
    const issue = await beadsService.createIssue(this.context.projectPath, {
      title: args.title,
      description: args.description,
      type: args.type || 'task',
      priority: args.priority || 2,
      labels: args.labels,
    });

    return {
      issueId: issue.id,
      status: issue.status,
      url: `${this.context.projectPath}/.beads/issues/${issue.id}`,
    };
  }
}
```

---

## Configuration

### Environment Variables

Add to `/home/codespace/DevFlow/apps/server/.env`:

```bash
# ============================================
# Beads Live Link Configuration
# ============================================

# Enable automatic issue creation from agent errors
BEADS_AUTO_ISSUES_ENABLED=true

# Maximum auto-issues per hour (rate limiting)
BEADS_MAX_AUTO_ISSUES_PER_HOUR=20

# Enable deduplication (prevent duplicate issues)
BEADS_DEDUPLICATION_ENABLED=true

# ============================================
# Beads Memory Configuration
# ============================================

# Cache TTL in milliseconds (5 minutes)
BEADS_MEMORY_CACHE_TTL=300000

# Maximum results to return from memory queries
BEADS_MEMORY_MAX_RESULTS=10

# Include closed issues in memory queries
BEADS_MEMORY_INCLUDE_CLOSED=true

# ============================================
# Beads Coordinator Configuration
# ============================================

# Enable autonomous agent coordination
BEADS_COORDINATION_ENABLED=true

# Coordination interval in milliseconds (30 seconds)
BEADS_COORDINATION_INTERVAL=30000

# Maximum concurrent agents
BEADS_MAX_CONCURRENT_AGENTS=5

# Enable helper agent spawning
BEADS_HELPER_SPAWNING_ENABLED=true
```

### Service Configuration

```typescript
// BeadsLiveLink configuration
const liveLinkConfig: Partial<BeadsLiveLinkConfig> = {
  autoCreateOnErrors: true,
  autoCreateOnRequests: true,
  maxAutoIssuesPerHour: 20,
  enableDeduplication: true,
};

// BeadsMemory configuration
const memoryOptions: MemoryQueryOptions = {
  maxResults: 10,
  includeClosed: true,
  includeInProgress: true,
  minSimilarity: 0.3,
};

// Coordinator configuration
const coordinatorConfig: Partial<CoordinatorConfig> = {
  coordinationInterval: 30000, // 30 seconds
  maxConcurrentAgents: 5,
  enableAutoAssignment: true,
  enableHelperSpawning: true,
  maxAgentAge: 7200000, // 2 hours
};
```

---

## Testing

### Unit Tests

**Location:** `/home/codespace/DevFlow/apps/server/tests/unit/services/`

```bash
# Run all Beads-related tests
npm test -- beads

# Run specific service tests
npm test -- beads-live-link-service.test.ts
npm test -- beads-memory-service.test.ts
npm test -- beads-agent-coordinator.test.ts
```

### Integration Tests

```typescript
// Example: Test BeadsLiveLinkService
describe('BeadsLiveLinkService', () => {
  let service: BeadsLiveLinkService;
  let mockBeadsService: jest.Mocked<BeadsService>;
  let mockEvents: EventEmitter;

  beforeEach(() => {
    mockBeadsService = createMockBeadsService();
    mockEvents = new EventEmitter();
    service = new BeadsLiveLinkService(mockBeadsService, mockEvents);
  });

  it('should create issue on agent error', async () => {
    const errorData = {
      sessionId: 'test-session',
      type: 'error',
      error: 'TypeError: Cannot read property of undefined',
      message: { id: 'msg-1', content: '', timestamp: new Date().toISOString() },
    };

    await service.initialize('/test/project');
    mockEvents.emit('agent:stream', errorData);

    await waitFor(() => {
      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          type: 'bug',
          priority: 2, // Medium priority for TypeError
        })
      );
    });
  });

  it('should respect rate limiting', async () => {
    const config = { maxAutoIssuesPerHour: 2 };
    service = new BeadsLiveLinkService(mockBeadsService, mockEvents, config);

    await service.initialize('/test/project');

    // Create 3 errors
    for (let i = 0; i < 3; i++) {
      mockEvents.emit('agent:stream', createErrorData(`Error ${i}`));
    }

    // Only 2 should be created
    expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(2);
  });
});
```

### Manual Testing

```bash
# 1. Initialize Beads in test project
cd /tmp/test-project
bd init

# 2. Create some test issues
bd create "Test feature 1" --type feature --priority 1
bd create "Test bug 1" --type bug --priority 0
bd create "Test task 1" --type task --priority 2

# 3. Add dependencies
bd link bd-a1b2 bd-c3d4 --type blocks

# 4. Start DevFlow server
cd /home/codespace/DevFlow
npm run dev:server

# 5. Test API endpoints
curl http://localhost:3008/api/beads/list
curl http://localhost:3008/api/beads/ready
curl http://localhost:3008/api/beads/assignments

# 6. Create an issue via API
curl -X POST http://localhost:3008/api/beads/create \
  -H "Content-Type: application/json" \
  -d '{"title": "API test issue", "type": "task", "priority": 2}'
```

---

## Monitoring

### Events to Monitor

```typescript
// Subscribe to all Beads events
events.subscribe((type, payload) => {
  switch (type) {
    case 'beads:auto-issue-created':
      console.log(`[Auto-Issue] ${payload.issueId} (${payload.severity})`);
      break;

    case 'beads:memory-query':
      console.log(`[Memory] Query completed, ${payload.resultCount} results`);
      break;

    case 'beads:agent-assigned':
      console.log(`[Coordinator] ${payload.agentType} → ${payload.issueId}`);
      break;

    case 'beads:helper-spawned':
      console.log(`[Helper] ${payload.helperAgentType} for ${payload.parentIssueId}`);
      break;

    case 'beads:agent-completed':
      console.log(`[Agent] ${payload.agentType} completed ${payload.issueId}`);
      break;

    case 'beads:agent-failed':
      console.error(`[Agent] ${payload.agentType} failed on ${payload.issueId}: ${payload.error}`);
      break;

    case 'beads:rate-limit-reached':
      console.warn(`[RateLimit] ${payload.count}/${payload.max} issues created`);
      break;
  }
});
```

### Statistics API

```typescript
// Get Live Link stats
const liveLinkStats = beadsLiveLink.getStats();
console.log('Live Link Stats:', liveLinkStats);
// {
//   autoIssueCount: 15,
//   maxAutoIssuesPerHour: 20,
//   resetTime: "2025-01-02T12:00:00Z",
//   cacheSize: 42,
//   config: { ... }
// }

// Get Memory stats
const memoryStats = beadsMemory.getCacheStats();
console.log('Memory Cache Stats:', memoryStats);
// {
//   size: 15,
//   entries: [
//     { key: "/project:implement auth...", age: 120000 },
//     ...
//   ]
// }

// Get Coordinator stats
const coordinatorStats = beadsCoordinator.getStats();
console.log('Coordinator Stats:', coordinatorStats);
// {
//   activeAgents: 3,
//   lockedIssues: 3,
//   totalAssignments: 42,
//   totalHelpersSpawned: 7,
//   lastCoordinationTime: 1704206400000
// }
```

### Health Checks

```bash
# Check if Beads CLI is installed
bd --version

# Validate Beads in project
curl http://localhost:3008/api/beads/validate

# Get system status
curl http://localhost:3008/api/status
```

---

## File Structure

```
DevFlow/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   ├── beads-service.ts                 # Core Beads API wrapper
│   │   │   │   ├── beads-live-link-service.ts       # Auto-issue creation (485 lines)
│   │   │   │   ├── beads-memory-service.ts          # Memory context queries (642 lines)
│   │   │   │   ├── beads-agent-coordinator.ts       # Agent orchestration (841 lines)
│   │   │   │   └── research-service.ts              # Research integration
│   │   │   ├── routes/
│   │   │   │   └── beads/
│   │   │   │       ├── index.ts                     # Route registration
│   │   │   │       ├── routes/
│   │   │   │       │   ├── create.ts                # POST /create
│   │   │   │       │   ├── list.ts                  # GET /list
│   │   │   │       │   ├── update.ts                # PUT /update/:id
│   │   │   │       │   ├── delete.ts                # DELETE /delete/:id
│   │   │   │       │   ├── ready.ts                 # GET /ready
│   │   │   │       │   ├── validate.ts              # GET /validate
│   │   │   │       │   └── assignments.ts           # GET /assignments
│   │   │   │       └── client/
│   │   │   │           ├── cli-wrapper.ts           # Beads CLI execution
│   │   │   │           └── subscription-registry.ts # WebSocket subscriptions
│   │   │   ├── providers/
│   │   │   │   └── claude-provider.ts               # Tool integration
│   │   │   ├── agents/
│   │   │   │   ├── agent-registry.ts                # Agent type registry
│   │   │   │   ├── specialized-agent-service.ts     # Agent execution
│   │   │   │   └── task-classifier.ts               # Task classification
│   │   │   └── index.ts                             # Server initialization
│   │   └── tests/
│   │       └── unit/
│   │           └── services/
│   │               ├── beads-live-link-service.test.ts
│   │               ├── beads-memory-service.test.ts
│   │               └── beads-agent-coordinator.test.ts
│   └── ui/
│       └── src/
│           └── components/
│               └── views/
│                   └── board-view.tsx                # Agent assignment display
├── libs/
│   └── types/
│       └── src/
│           ├── beads.ts                             # Beads type definitions
│           └── agent-types.ts                       # Agent type definitions
├── docs/
│   └── gastown-implementation-guide.md              # This document
├── apps/server/.env.example                         # Environment variables
└── CLAUDE.md                                        # Project documentation
```

---

## Dependencies Between Features

### Dependency Graph

```
BeadsService (Core)
    │
    ├── BeadsLiveLinkService ──▶ Auto-create issues from errors
    │                              │
    │                              └─▶ EventEmitter
    │
    ├── BeadsMemoryService ──▶ Query past issues
    │                           │
    │                           ├─▶ BeadsService
    │                           └─▶ MCPBridge (Exa)
    │
    └── BeadsAgentCoordinator ──▶ Orchestrate agents
                                │
                                ├─▶ BeadsService
                                ├─▶ AgentRegistry
                                ├─▶ AgentService
                                └─▶ SpecializedAgentService
                                         │
                                         └─▶ ProviderFactory
```

### Integration Order

When implementing from scratch, follow this order:

1. **BeadsService** - Core API wrapper (lowest level)
2. **EventEmitter** - Event bus for all services
3. **MCPBridge** - Optional MCP tool integration
4. **BeadsLiveLinkService** - Error tracking
5. **BeadsMemoryService** - Context queries
6. **AgentRegistry** - Agent type definitions
7. **SpecializedAgentService** - Agent execution
8. **BeadsAgentCoordinator** - Orchestration (highest level)
9. **API Routes** - HTTP endpoints
10. **UI Components** - Agent assignment display

---

## Troubleshooting

### Common Issues

#### 1. Beads CLI Not Installed

**Error:** `Beads CLI not installed, auto-issue creation disabled`

**Solution:**

```bash
npm install -g @beads-cli/core
bd --version  # Verify installation
```

#### 2. Beads Not Initialized in Project

**Error:** `Beads database not found`

**Solution:**

```bash
cd /path/to/project
bd init
ls -la .beads/  # Verify initialization
```

#### 3. Rate Limit Exceeded

**Error:** `Rate limit reached, skipping error issue creation`

**Solution:**

- Wait for rate limit to reset (default: 1 hour)
- Increase `BEADS_MAX_AUTO_ISSUES_PER_HOUR` in config
- Check if duplicate issues are being created (deduplication issue)

#### 4. No Ready Work Available

**Error:** `No available work`

**Solution:**

```bash
# Check for blocked issues
bd list --status blocked

# Check for open issues
bd list --status open

# Verify no blockers
bd show <issue-id>
```

#### 5. Agent Not Auto-Selecting

**Error:** `No suitable agent found for issue <id>`

**Solution:**

- Check agent capabilities: `agentRegistry.getAutoSelectableAgents()`
- Verify agent scores are above 0.5 threshold
- Check if agent has `autoSelectable: true` in config
- Review capability matching logic in `calculateCapabilityMatch()`

---

## Best Practices

### 1. Issue Naming

```typescript
// Good
title: 'Fix authentication failure on login';
description: 'Users receive 401 errors with valid credentials';

// Bad
title: 'Fix bug';
description: "It's broken";
```

### 2. Dependency Management

```bash
# Use 'blocks' for hard dependencies
bd link bd-feature bd-blocker --type blocks

# Use 'related' for soft relationships
bd link bd-feature bd-related --type related

# Use 'parent' for hierarchy
bd link bd-epic bd-feature --type parent
```

### 3. Agent Capabilities

```typescript
// Define clear capabilities
const config: AgentConfig = {
  type: 'implementation',
  capabilities: [
    {
      name: 'write-code',
      description: 'Write and modify code',
      tools: ['Edit', 'Write', 'Read'],
      confidence: 0.9,
    },
    {
      name: 'run-tests',
      description: 'Execute test suites',
      tools: ['Bash'],
      confidence: 0.8,
    },
  ],
};
```

### 4. Memory Queries

```typescript
// Specific queries for better results
const context = await beadsMemory.queryRelevantContext(
  projectPath,
  'Implement OAuth2 authentication with JWT tokens',
  {
    maxResults: 10, // Limit results
    includeClosed: true, // Include past decisions
    minSimilarity: 0.4, // Higher threshold
  }
);
```

### 5. Helper Agent Spawning

```typescript
// Create focused helper tasks
const result = await coordinator.spawnHelperAgent(
  parentSessionId,
  'testing', // Specialized agent type
  'Write unit tests for auth module', // Clear description
  projectPath
);
```

---

## Future Enhancements

### Planned Features

1. **Hierarchical Agent Coordination**
   - Multi-level helper spawning
   - Agent teams for complex tasks
   - Collaborative decision making

2. **Advanced Memory**
   - Embedding-based semantic search
   - Cross-project context sharing
   - Learned preferences from history

3. **Adaptive Rate Limiting**
   - Dynamic rate limits based on issue severity
   - Burst allowances for critical errors
   - Throttle back during high activity

4. **Predictive Assignment**
   - ML-based agent selection
   - Estimated completion times
   - Risk assessment for tasks

5. **Visualization Dashboard**
   - Real-time agent activity monitor
   - Issue dependency graph
   - Memory query analytics

---

## References

### External Documentation

- **Beads CLI:** https://github.com/beads-cli/beads
- **DevFlow:** https://github.com/oxtsotsi/DevFlow
- **Agent System:** `/home/codespace/DevFlow/libs/types/src/agent-types.ts`
- **Event System:** `/home/codespace/DevFlow/apps/server/src/lib/events.ts`

### Internal Documentation

- **CLAUDE.md** - Project overview and architecture
- **BEADS_TOOL_TESTING_GUIDE.md** - Testing procedures
- **HYBRID_ORCHESTRATION_PLAN.md** - Orchestrator integration

### Related Services

- **AutoModeService** - Automatic task execution
- **ResearchService** - Code research and analysis
- **OrchestratorService** - Workflow orchestration

---

## Changelog

### Version 1.0.0 (2025-01-02)

- Initial implementation of BeadsLiveLinkService
- Initial implementation of BeadsMemoryService
- Initial implementation of BeadsAgentCoordinator
- API routes for all Beads operations
- Agent assignment tracking in UI
- Comprehensive test coverage

---

## Support

For issues or questions:

1. Check this guide's troubleshooting section
2. Review test files for usage examples
3. Check server logs: `apps/server/logs/`
4. Open an issue on GitHub

---

**Document Version:** 1.0.0
**Last Updated:** 2025-01-02
**Maintained By:** DevFlow Team
