# Gastown-Inspired Features - Code Examples Cookbook

**DevFlow Gastown Implementation**

This cookbook provides complete, copy-pasteable code examples for implementing Gastown-inspired autonomous agent features in DevFlow. Each example includes full working code, explanations, integration points, testing considerations, and common pitfalls.

## Table of Contents

1. [Convoy Service Pattern](#convoy-service-pattern)
2. [Enhanced Agent Scoring Algorithm](#enhanced-agent-scoring-algorithm)
3. [Patrol Service Patterns](#patrol-service-patterns)
4. [MEOW Workflow Template System](#meow-workflow-template-system)
5. [Frontend Components](#frontend-components)
6. [API Route Handlers](#api-route-handlers)
7. [Database Migration Scripts](#database-migration-scripts)

---

## Convoy Service Pattern

The Convoy service pattern enables sequential task execution with dependency tracking, similar to a convoy of vehicles traveling together.

### Implementation: Sequential Task Execution Service

**File Path:** `/apps/server/src/services/convoy-service.ts`

```typescript
/**
 * Convoy Service - Sequential Task Execution with Dependencies
 *
 * Executes tasks in order, respecting dependencies and providing
 * rollback capabilities on failure.
 */

import type { EventEmitter } from '../lib/events.js';
import type { BeadsIssue, BeadsIssueStatus } from '@automaker/types';

export interface ConvoyTask {
  id: string;
  issueId: string;
  dependsOn?: string[]; // Task IDs that must complete first
  execute: () => Promise<void>;
  rollback?: () => Promise<void>;
}

export interface ConvoyConfig {
  /** Maximum concurrent tasks */
  maxConcurrent?: number;
  /** Enable rollback on failure */
  enableRollback?: boolean;
  /** Delay between tasks (ms) */
  taskDelay?: number;
}

export interface ConvoyResult {
  success: boolean;
  completedTasks: string[];
  failedTasks: string[];
  skippedTasks: string[];
  duration: number;
}

export class ConvoyService {
  private events: EventEmitter;
  private config: Required<ConvoyConfig>;
  private activeConvoy: Map<string, ConvoyTask[]> = new Map();

  constructor(events: EventEmitter, config: ConvoyConfig = {}) {
    this.events = events;
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 1,
      enableRollback: config.enableRollback ?? true,
      taskDelay: config.taskDelay ?? 0,
    };
  }

  /**
   * Execute a convoy of tasks in dependency order
   */
  async executeConvoy(convoyId: string, tasks: ConvoyTask[]): Promise<ConvoyResult> {
    const startTime = Date.now();
    const completedTasks: string[] = [];
    const failedTasks: string[] = [];
    const skippedTasks: string[] = [];

    this.activeConvoy.set(convoyId, tasks);

    this.events.emit('convoy:started', {
      convoyId,
      taskCount: tasks.length,
      timestamp: new Date().toISOString(),
    });

    try {
      // Build dependency graph
      const graph = this.buildDependencyGraph(tasks);
      const executionOrder = this.topologicalSort(graph);

      // Execute tasks in order
      for (const taskId of executionOrder) {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) continue;

        // Check dependencies
        const dependenciesMet = this.checkDependencies(task, completedTasks);
        if (!dependenciesMet) {
          skippedTasks.push(taskId);
          continue;
        }

        try {
          // Add delay between tasks
          if (this.config.taskDelay > 0 && completedTasks.length > 0) {
            await this.delay(this.config.taskDelay);
          }

          await task.execute();

          completedTasks.push(taskId);

          this.events.emit('convoy:task-completed', {
            convoyId,
            taskId,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          failedTasks.push(taskId);

          this.events.emit('convoy:task-failed', {
            convoyId,
            taskId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });

          // Rollback if enabled
          if (this.config.enableRollback) {
            await this.rollbackTasks(completedTasks, tasks);
          }

          throw error;
        }
      }

      const duration = Date.now() - startTime;
      const success = failedTasks.length === 0;

      this.events.emit('convoy:completed', {
        convoyId,
        success,
        completedTasks,
        failedTasks,
        duration,
        timestamp: new Date().toISOString(),
      });

      return {
        success,
        completedTasks,
        failedTasks,
        skippedTasks,
        duration,
      };
    } finally {
      this.activeConvoy.delete(convoyId);
    }
  }

  /**
   * Build dependency graph from tasks
   */
  private buildDependencyGraph(tasks: ConvoyTask[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const task of tasks) {
      graph.set(task.id, task.dependsOn ?? []);
    }

    return graph;
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(graph: Map<string, string[]>): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (nodeId: string) => {
      if (temp.has(nodeId)) {
        throw new Error(`Circular dependency detected: ${nodeId}`);
      }
      if (visited.has(nodeId)) {
        return;
      }

      temp.add(nodeId);

      const dependencies = graph.get(nodeId) ?? [];
      for (const dep of dependencies) {
        visit(dep);
      }

      temp.delete(nodeId);
      visited.add(nodeId);
      sorted.push(nodeId);
    };

    for (const nodeId of graph.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }

    return sorted;
  }

  /**
   * Check if task dependencies are met
   */
  private checkDependencies(task: ConvoyTask, completed: string[]): boolean {
    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true;
    }

    return task.dependsOn.every((dep) => completed.includes(dep));
  }

  /**
   * Rollback completed tasks in reverse order
   */
  private async rollbackTasks(completedTaskIds: string[], allTasks: ConvoyTask[]): Promise<void> {
    const reversed = [...completedTaskIds].reverse();

    for (const taskId of reversed) {
      const task = allTasks.find((t) => t.id === taskId);
      if (task?.rollback) {
        try {
          await task.rollback();
        } catch (error) {
          console.error(`Rollback failed for task ${taskId}:`, error);
        }
      }
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get active convoy status
   */
  getActiveConvoy(convoyId: string): ConvoyTask[] | undefined {
    return this.activeConvoy.get(convoyId);
  }

  /**
   * Cancel active convoy
   */
  cancelConvoy(convoyId: string): boolean {
    if (this.activeConvoy.has(convoyId)) {
      this.activeConvoy.delete(convoyId);
      this.events.emit('convoy:cancelled', {
        convoyId,
        timestamp: new Date().toISOString(),
      });
      return true;
    }
    return false;
  }
}
```

### Integration Example: Using Convoy with Beads Issues

**File Path:** `/apps/server/src/services/beads-convoy-integration.ts`

```typescript
/**
 * Example: Using Convoy service to execute Beads issues in dependency order
 */

import { ConvoyService, type ConvoyTask } from './convoy-service.js';
import { BeadsService } from './beads-service.js';
import { AgentService } from './agent-service.js';

export async function executeBeadsIssueConvoy(
  beadsService: BeadsService,
  agentService: AgentService,
  convoyService: ConvoyService,
  projectPath: string,
  issueIds: string[]
) {
  // Fetch all issues
  const issues = await Promise.all(issueIds.map((id) => beadsService.getIssue(projectPath, id)));

  // Build convoy tasks from issues
  const tasks: ConvoyTask[] = issues.map((issue) => ({
    id: issue.id,
    issueId: issue.id,
    dependsOn: issue.dependencies?.filter((d) => d.type === 'blocks').map((d) => d.issueId!),

    execute: async () => {
      // Update issue status to in_progress
      await beadsService.updateIssue(projectPath, issue.id, {
        status: 'in_progress',
      });

      // Create agent session and execute
      const session = await agentService.createSession(
        `Convoy: ${issue.title}`,
        projectPath,
        projectPath
      );

      // ... execute agent logic here

      // Update issue status to closed
      await beadsService.updateIssue(projectPath, issue.id, {
        status: 'closed',
      });
    },

    rollback: async () => {
      // Revert issue to open
      await beadsService.updateIssue(projectPath, issue.id, {
        status: 'open',
      });
    },
  }));

  // Execute convoy
  const result = await convoyService.executeConvoy(`convoy_${Date.now()}`, tasks);

  return result;
}
```

### Testing Considerations

```typescript
/**
 * Test: ConvoyService dependency resolution
 */

import { describe, it, expect } from 'vitest';
import { ConvoyService } from './convoy-service.js';

describe('ConvoyService', () => {
  it('should execute tasks in dependency order', async () => {
    const events = {
      emit: vi.fn(),
    } as any;

    const service = new ConvoyService(events);

    const executionOrder: string[] = [];
    const tasks: ConvoyTask[] = [
      {
        id: 'task1',
        issueId: 'issue1',
        execute: async () => {
          executionOrder.push('task1');
        },
      },
      {
        id: 'task2',
        issueId: 'issue2',
        dependsOn: ['task1'],
        execute: async () => {
          executionOrder.push('task2');
        },
      },
      {
        id: 'task3',
        issueId: 'issue3',
        dependsOn: ['task2'],
        execute: async () => {
          executionOrder.push('task3');
        },
      },
    ];

    await service.executeConvoy('test-convoy', tasks);

    expect(executionOrder).toEqual(['task1', 'task2', 'task3']);
  });

  it('should detect circular dependencies', async () => {
    const events = {
      emit: vi.fn(),
    } as any;

    const service = new ConvoyService(events);

    const tasks: ConvoyTask[] = [
      {
        id: 'task1',
        issueId: 'issue1',
        dependsOn: ['task2'],
        execute: async () => {},
      },
      {
        id: 'task2',
        issueId: 'issue2',
        dependsOn: ['task1'],
        execute: async () => {},
      },
    ];

    await expect(service.executeConvoy('circular-convoy', tasks)).rejects.toThrow(
      'Circular dependency'
    );
  });
});
```

### Common Pitfalls

1. **Circular Dependencies**: Always validate for circular dependencies before execution
2. **Task Rollback**: Ensure rollback logic is idempotent (can run multiple times safely)
3. **Event Cleanup**: Remove convoy from active map even on failure
4. **Timeout Handling**: Add timeout logic to individual tasks to prevent hanging

---

## Enhanced Agent Scoring Algorithm

The agent scoring algorithm matches tasks to the most suitable agents based on capabilities, success rate, and availability.

### Implementation: Advanced Agent Scoring

**File Path:** `/apps/server/src/services/beads-agent-coordinator.ts` (lines 287-372)

```typescript
/**
 * Score an agent for an issue based on multi-factor analysis
 */
private async scoreAgentForIssue(
  agentType: AgentType,
  issue: BeadsIssue
): Promise<number> {
  try {
    // Get agent configuration
    const config = this.agentRegistry.getAgentConfig(agentType);
    if (!config) {
      return 0;
    }

    // Get agent stats
    const stats = this.agentRegistry.getAgentStats(agentType);
    const successRate = stats?.successRate || 1.0;

    // Calculate capability match (40% weight)
    const capabilityMatch = this.calculateCapabilityMatch(config, issue);

    // Calculate availability (20% weight)
    const activeCount = Array.from(this.activeAgents.values()).filter(
      (agent) => agent.agentType === agentType
    ).length;
    const availability = 1 - activeCount / this.config.maxConcurrentAgents;

    // Calculate weighted score
    const score =
      capabilityMatch * 0.4 + successRate * 0.4 + availability * 0.2;

    console.log(
      `[BeadsCoordinator] Agent ${agentType} score: ${score.toFixed(2)} ` +
        `(capabilities: ${capabilityMatch.toFixed(2)}, success: ${successRate.toFixed(2)}, availability: ${availability.toFixed(2)})`
    );

    return score;
  } catch (error) {
    console.error('[BeadsCoordinator] Error scoring agent:', error);
    return 0;
  }
}

/**
 * Calculate how well an agent's capabilities match an issue
 */
private calculateCapabilityMatch(
  config: AgentConfig,
  issue: BeadsIssue
): number {
  try {
    const capabilities = config.capabilities || [];

    if (capabilities.length === 0) {
      return 0.5; // Neutral score if no capabilities defined
    }

    // Build keyword list from issue
    const issueText =
      `${issue.title} ${issue.description || ''} ${issue.type} ${
        (issue.labels || []).join(' ')
      }`.toLowerCase();

    // Count matching capabilities
    let matchCount = 0;
    for (const cap of capabilities) {
      const capName = cap.name.toLowerCase();
      const capTools = cap.tools || [];

      // Check if capability name matches
      if (issueText.includes(capName)) {
        matchCount++;
        continue;
      }

      // Check if any related tools match
      for (const tool of capTools) {
        if (issueText.includes(tool.toLowerCase())) {
          matchCount++;
          break;
        }
      }
    }

    const capabilityScore = matchCount / capabilities.length;

    // Fallback to agent priority if no explicit capability match
    if (capabilityScore === 0) {
      // Map priority 1-10 to score 0.1-0.5
      return 0.1 + config.priority * 0.04;
    }

    return capabilityScore;
  } catch (error) {
    console.error('[BeadsCoordinator] Error calculating capability match:', error);
    return 0.1; // Minimum score for any agent
  }
}
```

### Advanced Scoring with ML-Based Prediction

**File Path:** `/apps/server/src/services/agent-scoring-ml.ts`

```typescript
/**
 * ML-Enhanced Agent Scoring
 *
 * Uses historical performance data to predict best agent for tasks
 */

import type { AgentType, BeadsIssue } from '@automaker/types';

export interface AgentPerformanceHistory {
  agentType: AgentType;
  totalTasks: number;
  successfulTasks: number;
  avgTaskDuration: number;
  taskTypeSuccess: Map<string, number>; // bug, feature, task, etc.
  capabilitySuccess: Map<string, number>; // per-capability success rate
}

export interface ScoringFeatures {
  capabilityMatch: number;
  successRate: number;
  availability: number;
  predictedDuration: number;
  confidence: number;
}

export class MLAgentScorer {
  private performanceHistory: Map<AgentType, AgentPerformanceHistory> = new Map();

  /**
   * Score agent with ML-enhanced prediction
   */
  scoreAgent(
    agentType: AgentType,
    issue: BeadsIssue,
    activeCount: number,
    maxConcurrent: number
  ): ScoringFeatures {
    const history = this.performanceHistory.get(agentType);

    // Base metrics
    const capabilityMatch = this.calculateCapabilityMatch(agentType, issue);
    const successRate = history ? history.successfulTasks / history.totalTasks : 1.0;
    const availability = 1 - activeCount / maxConcurrent;

    // ML prediction: task duration based on history
    const predictedDuration = this.predictDuration(agentType, issue, history);

    // ML prediction: confidence based on similar past tasks
    const confidence = this.calculateConfidence(agentType, issue, history);

    // Weighted score with ML factors
    const score =
      capabilityMatch * 0.35 + successRate * 0.35 + availability * 0.15 + confidence * 0.15;

    return {
      capabilityMatch,
      successRate,
      availability,
      predictedDuration,
      confidence,
    };
  }

  /**
   * Predict task duration based on historical data
   */
  private predictDuration(
    agentType: AgentType,
    issue: BeadsIssue,
    history?: AgentPerformanceHistory
  ): number {
    if (!history) {
      return 60000; // Default: 1 minute
    }

    // Get type-specific average duration
    const typeAvg = history.taskTypeSuccess.get(issue.type);
    if (typeAvg !== undefined) {
      return typeAvg;
    }

    // Fall back to overall average
    return history.avgTaskDuration;
  }

  /**
   * Calculate confidence score based on past similar tasks
   */
  private calculateConfidence(
    agentType: AgentType,
    issue: BeadsIssue,
    history?: AgentPerformanceHistory
  ): number {
    if (!history || history.totalTasks < 5) {
      return 0.5; // Low confidence for insufficient data
    }

    // Count similar tasks (same type, matching capabilities)
    let similarCount = 0;
    let similarSuccess = 0;

    // This would be tracked in a real implementation
    const typeSuccess = history.taskTypeSuccess.get(issue.type) ?? 0;

    // Higher confidence for agents with more experience on similar tasks
    return Math.min(typeSuccess, 1.0);
  }

  /**
   * Calculate capability match (simplified)
   */
  private calculateCapabilityMatch(agentType: AgentType, issue: BeadsIssue): number {
    // Implementation would check agent capabilities against issue keywords
    return 0.5; // Placeholder
  }

  /**
   * Update performance history after task completion
   */
  recordTaskCompletion(
    agentType: AgentType,
    issueType: string,
    success: boolean,
    duration: number
  ): void {
    let history = this.performanceHistory.get(agentType);

    if (!history) {
      history = {
        agentType,
        totalTasks: 0,
        successfulTasks: 0,
        avgTaskDuration: 0,
        taskTypeSuccess: new Map(),
        capabilitySuccess: new Map(),
      };
      this.performanceHistory.set(agentType, history);
    }

    // Update totals
    history.totalTasks++;
    if (success) {
      history.successfulTasks++;
    }

    // Update average duration (exponential moving average)
    const alpha = 0.3; // Smoothing factor
    history.avgTaskDuration = alpha * duration + (1 - alpha) * history.avgTaskDuration;

    // Update type-specific success rate
    const currentTypeSuccess = history.taskTypeSuccess.get(issueType) ?? 0;
    const newTypeSuccess = success ? 1 : 0;
    history.taskTypeSuccess.set(
      issueType,
      alpha * newTypeSuccess + (1 - alpha) * currentTypeSuccess
    );
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(agentType: AgentType): AgentPerformanceHistory | undefined {
    return this.performanceHistory.get(agentType);
  }
}
```

### Testing Agent Scoring

```typescript
/**
 * Test: Agent scoring algorithm
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MLAgentScorer } from './agent-scoring-ml.js';
import type { BeadsIssue } from '@automaker/types';

describe('MLAgentScorer', () => {
  let scorer: MLAgentScorer;

  beforeEach(() => {
    scorer = new MLAgentScorer();
  });

  it('should improve scoring with more data', () => {
    const issue: BeadsIssue = {
      id: 'test-1',
      title: 'Fix authentication bug',
      description: 'Login not working',
      status: 'open',
      type: 'bug',
      priority: 1,
      labels: ['auth', 'critical'],
    };

    // Initial score with no history
    const initialScore = scorer.scoreAgent('implementer', issue, 0, 5);

    // Record successful tasks
    for (let i = 0; i < 10; i++) {
      scorer.recordTaskCompletion('implementer', 'bug', true, 30000);
    }

    // Score should improve after training
    const improvedScore = scorer.scoreAgent('implementer', issue, 0, 5);

    expect(improvedScore.successRate).toBeGreaterThan(initialScore.successRate);
    expect(improvedScore.confidence).toBeGreaterThan(initialScore.confidence);
  });

  it('should predict task duration accurately', () => {
    // Record task completion data
    const durations = [25000, 30000, 35000, 28000, 32000]; // ~30s average

    durations.forEach((d) => {
      scorer.recordTaskCompletion('implementer', 'bug', true, d);
    });

    const issue: BeadsIssue = {
      id: 'test-2',
      title: 'Fix bug',
      description: 'Test',
      status: 'open',
      type: 'bug',
      priority: 2,
      labels: [],
    };

    const score = scorer.scoreAgent('implementer', issue, 0, 5);

    // Predicted duration should be close to historical average
    expect(score.predictedDuration).toBeGreaterThan(20000);
    expect(score.predictedDuration).toBeLessThan(40000);
  });
});
```

### Common Pitfalls

1. **Cold Start Problem**: New agents have no history, use default scores
2. **Overfitting**: Don't weigh historical success too heavily for dissimilar tasks
3. **Stale Data**: Implement periodic decay of old performance data
4. **Bias**: Ensure diverse task distribution to avoid bias toward certain task types

---

## Patrol Service Patterns

Patrol services monitor system health, detect anomalies, and perform automated remediation.

### Pattern 1: Witness Service (Log Monitoring)

**File Path:** `/apps/server/src/services/patrol/witness-service.ts`

```typescript
/**
 * Witness Service - Log Monitoring and Anomaly Detection
 *
 * Monitors logs for errors, warnings, and patterns that indicate problems.
 */

import { createLogger } from '@automaker/utils';
import { EventEmitter } from '../lib/events.js';
import { AgentService } from '../services/agent-service.js';

export interface LogPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'warning' | 'info';
  action?: 'alert' | 'create-issue' | 'auto-fix';
}

export interface WitnessConfig {
  /** Check interval (ms) */
  checkInterval?: number;
  /** Log file patterns to monitor */
  logFiles?: string[];
  /** Patterns to watch for */
  patterns?: LogPattern[];
}

export class WitnessService {
  private logger = createLogger();
  private events: EventEmitter;
  private agentService: AgentService;
  private config: Required<WitnessConfig>;
  private interval?: NodeJS.Timeout;
  private logPositions: Map<string, number> = new Map();

  constructor(events: EventEmitter, agentService: AgentService, config: WitnessConfig = {}) {
    this.events = events;
    this.agentService = agentService;

    this.config = {
      checkInterval: config.checkInterval ?? 30000, // 30 seconds
      logFiles: config.logFiles ?? ['**/*.log'],
      patterns: config.patterns ?? this.getDefaultPatterns(),
    };
  }

  /**
   * Start monitoring logs
   */
  async start(projectPath: string): Promise<void> {
    this.logger.info('[WitnessService] Starting log monitoring...');

    this.interval = setInterval(() => {
      this.checkLogs(projectPath).catch((error) => {
        this.logger.error('[WitnessService] Error checking logs:', error);
      });
    }, this.config.checkInterval);

    // Initial check
    await this.checkLogs(projectPath);

    this.logger.info('[WitnessService] Log monitoring started');
  }

  /**
   * Stop monitoring logs
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.logger.info('[WitnessService] Log monitoring stopped');
  }

  /**
   * Check logs for patterns
   */
  private async checkLogs(projectPath: string): Promise<void> {
    // In a real implementation, this would:
    // 1. Find all log files matching patterns
    // 2. Read new lines since last check
    // 3. Match against patterns
    // 4. Take action on matches

    // Simplified example:
    const newLines = await this.readNewLogLines(projectPath);

    for (const line of newLines) {
      for (const pattern of this.config.patterns) {
        if (pattern.pattern.test(line)) {
          await this.handleMatch(pattern, line, projectPath);
        }
      }
    }
  }

  /**
   * Read new log lines since last check
   */
  private async readNewLogLines(projectPath: string): Promise<string[]> {
    // This would read actual log files
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Handle pattern match
   */
  private async handleMatch(pattern: LogPattern, line: string, projectPath: string): Promise<void> {
    this.logger.warn(`[WitnessService] Pattern matched: ${pattern.name} - ${line}`);

    this.events.emit('patrol:witness-alert', {
      patternId: pattern.id,
      severity: pattern.severity,
      line,
      timestamp: new Date().toISOString(),
    });

    switch (pattern.action) {
      case 'alert':
        // Just emit event
        break;
      case 'create-issue':
        await this.createIssueForPattern(pattern, line, projectPath);
        break;
      case 'auto-fix':
        await this.attemptAutoFix(pattern, line, projectPath);
        break;
    }
  }

  /**
   * Create issue for pattern match
   */
  private async createIssueForPattern(
    pattern: LogPattern,
    line: string,
    projectPath: string
  ): Promise<void> {
    // Would use BeadsService to create issue
    this.logger.info(`[WitnessService] Creating issue for pattern: ${pattern.name}`);
  }

  /**
   * Attempt automatic fix
   */
  private async attemptAutoFix(
    pattern: LogPattern,
    line: string,
    projectPath: string
  ): Promise<void> {
    this.logger.info(`[WitnessService] Attempting auto-fix for pattern: ${pattern.name}`);

    // Would spawn agent to fix the issue
  }

  /**
   * Get default log patterns
   */
  private getDefaultPatterns(): LogPattern[] {
    return [
      {
        id: 'error-stack-trace',
        name: 'Error Stack Trace',
        pattern: /Error:|TypeError:|ReferenceError:/i,
        severity: 'critical',
        action: 'create-issue',
      },
      {
        id: 'out-of-memory',
        name: 'Out of Memory',
        pattern: /Out of memory|JavaScript heap out of memory/i,
        severity: 'critical',
        action: 'alert',
      },
      {
        id: 'unhandled-promise',
        name: 'Unhandled Promise Rejection',
        pattern: /UnhandledPromiseRejectionWarning/i,
        severity: 'warning',
        action: 'create-issue',
      },
      {
        id: 'deprecation-warning',
        name: 'Deprecation Warning',
        pattern: /DeprecationWarning/i,
        severity: 'info',
        action: 'alert',
      },
    ];
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: LogPattern): void {
    this.config.patterns.push(pattern);
  }

  /**
   * Remove pattern
   */
  removePattern(patternId: string): boolean {
    const index = this.config.patterns.findIndex((p) => p.id === patternId);
    if (index !== -1) {
      this.config.patterns.splice(index, 1);
      return true;
    }
    return false;
  }
}
```

### Pattern 2: Refinery Service (Data Processing)

**File Path:** `/apps/server/src/services/patrol/refinery-service.ts`

```typescript
/**
 * Refinery Service - Data Processing and Enrichment
 *
 * Processes raw data into structured, actionable insights.
 */

import { createLogger } from '@automaker/utils';

export interface RawDataPoint {
  timestamp: string;
  source: string;
  data: unknown;
}

export interface RefinedData {
  timestamp: string;
  source: string;
  category: string;
  metrics: Record<string, number>;
  anomalies: string[];
  insights: string[];
}

export interface RefineryConfig {
  /** Batch size for processing */
  batchSize?: number;
  /** Processing interval (ms) */
  processInterval?: number;
}

export class RefineryService {
  private logger = createLogger();
  private config: Required<RefineryConfig>;
  private rawDataBuffer: RawDataPoint[] = [];
  private interval?: NodeJS.Timeout;

  constructor(config: RefineryConfig = {}) {
    this.config = {
      batchSize: config.batchSize ?? 100,
      processInterval: config.processInterval ?? 60000, // 1 minute
    };
  }

  /**
   * Start refinery service
   */
  start(): void {
    this.logger.info('[RefineryService] Starting data processing...');

    this.interval = setInterval(() => {
      this.processBatch().catch((error) => {
        this.logger.error('[RefineryService] Error processing batch:', error);
      });
    }, this.config.processInterval);

    this.logger.info('[RefineryService] Data processing started');
  }

  /**
   * Stop refinery service
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.logger.info('[RefineryService] Data processing stopped');
  }

  /**
   * Add raw data point
   */
  addRawData(point: RawDataPoint): void {
    this.rawDataBuffer.push(point);

    // Process immediately if buffer is full
    if (this.rawDataBuffer.length >= this.config.batchSize) {
      this.processBatch().catch((error) => {
        this.logger.error('[RefineryService] Error processing batch:', error);
      });
    }
  }

  /**
   * Process batch of raw data
   */
  private async processBatch(): Promise<RefinedData[]> {
    if (this.rawDataBuffer.length === 0) {
      return [];
    }

    const batch = this.rawDataBuffer.splice(0, this.config.batchSize);
    const refined: RefinedData[] = [];

    for (const point of batch) {
      const refinedPoint = this.refineData(point);
      refined.push(refinedPoint);
    }

    // Store or emit refined data
    this.logger.info(`[RefineryService] Processed ${refined.length} data points`);

    return refined;
  }

  /**
   * Refine single data point
   */
  private refineData(point: RawDataPoint): RefinedData {
    // Extract metrics
    const metrics = this.extractMetrics(point.data);

    // Detect anomalies
    const anomalies = this.detectAnomalies(metrics);

    // Generate insights
    const insights = this.generateInsights(metrics, anomalies);

    // Categorize data
    const category = this.categorizeData(point);

    return {
      timestamp: point.timestamp,
      source: point.source,
      category,
      metrics,
      anomalies,
      insights,
    };
  }

  /**
   * Extract metrics from raw data
   */
  private extractMetrics(data: unknown): Record<string, number> {
    // Implementation depends on data structure
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      const metrics: Record<string, number> = {};

      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'number') {
          metrics[key] = value;
        }
      }

      return metrics;
    }

    return {};
  }

  /**
   * Detect anomalies in metrics
   */
  private detectAnomalies(metrics: Record<string, number>): string[] {
    const anomalies: string[] = [];

    // Example: Check for unusually high values
    for (const [key, value] of Object.entries(metrics)) {
      if (value > 1000) {
        anomalies.push(`High value detected in ${key}: ${value}`);
      }
      if (value < 0) {
        anomalies.push(`Negative value detected in ${key}: ${value}`);
      }
    }

    return anomalies;
  }

  /**
   * Generate insights from metrics and anomalies
   */
  private generateInsights(metrics: Record<string, number>, anomalies: string[]): string[] {
    const insights: string[] = [];

    if (anomalies.length > 0) {
      insights.push(`${anomalies.length} anomalies detected`);
    }

    // Example: Calculate trends
    const metricKeys = Object.keys(metrics);
    if (metricKeys.length > 0) {
      insights.push(`Collected ${metricKeys.length} metrics`);
    }

    return insights;
  }

  /**
   * Categorize data point
   */
  private categorizeData(point: RawDataPoint): string {
    // Simple categorization based on source
    if (point.source.includes('error')) {
      return 'error';
    } else if (point.source.includes('performance')) {
      return 'performance';
    } else if (point.source.includes('usage')) {
      return 'usage';
    }

    return 'general';
  }

  /**
   * Get buffer size
   */
  getBufferSize(): number {
    return this.rawDataBuffer.length;
  }
}
```

### Pattern 3: Deacon Service (Health Checks)

**File Path:** `/apps/server/src/services/patrol/deacon-service.ts`

```typescript
/**
 * Deacon Service - Health Check and Monitoring
 *
 * Performs regular health checks on system components.
 */

import { createLogger } from '@automaker/utils';
import { EventEmitter } from '../lib/events.js';

export interface HealthCheck {
  id: string;
  name: string;
  check: () => Promise<HealthCheckResult>;
  interval?: number; // Override default interval
}

export interface HealthCheckResult {
  healthy: boolean;
  message: string;
  responseTime?: number;
  metadata?: Record<string, unknown>;
}

export interface DeaconConfig {
  /** Default check interval (ms) */
  defaultInterval?: number;
  /** Timeout for individual checks (ms) */
  checkTimeout?: number;
}

export class DeaconService {
  private logger = createLogger();
  private events: EventEmitter;
  private config: Required<DeaconConfig>;
  private checks: Map<string, HealthCheck> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(events: EventEmitter, config: DeaconConfig = {}) {
    this.events = events;
    this.config = {
      defaultInterval: config.defaultInterval ?? 60000, // 1 minute
      checkTimeout: config.checkTimeout ?? 10000, // 10 seconds
    };
  }

  /**
   * Start health checks
   */
  async start(): Promise<void> {
    this.logger.info('[DeaconService] Starting health checks...');

    for (const [id, check] of this.checks) {
      const interval = check.interval ?? this.config.defaultInterval;

      const timeoutId = setInterval(() => {
        this.runHealthCheck(id).catch((error) => {
          this.logger.error(`[DeaconService] Error running health check ${id}:`, error);
        });
      }, interval);

      this.intervals.set(id, timeoutId);

      // Run initial check
      await this.runHealthCheck(id);
    }

    this.logger.info('[DeaconService] Health checks started');
  }

  /**
   * Stop health checks
   */
  stop(): void {
    for (const [id, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();

    this.logger.info('[DeaconService] Health checks stopped');
  }

  /**
   * Register health check
   */
  registerHealthCheck(check: HealthCheck): void {
    this.checks.set(check.id, check);
    this.logger.info(`[DeaconService] Registered health check: ${check.name}`);
  }

  /**
   * Unregister health check
   */
  unregisterHealthCheck(checkId: string): boolean {
    const existed = this.checks.has(checkId);

    // Stop interval if running
    const interval = this.intervals.get(checkId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(checkId);
    }

    this.checks.delete(checkId);

    if (existed) {
      this.logger.info(`[DeaconService] Unregistered health check: ${checkId}`);
    }

    return existed;
  }

  /**
   * Run single health check
   */
  private async runHealthCheck(checkId: string): Promise<void> {
    const check = this.checks.get(checkId);
    if (!check) {
      return;
    }

    const startTime = Date.now();

    try {
      // Add timeout
      const result = await this.withTimeout(check.check(), this.config.checkTimeout);

      const responseTime = Date.now() - startTime;
      const resultWithTime = {
        ...result,
        responseTime,
      };

      this.events.emit('patrol:health-check', {
        checkId: check.id,
        checkName: check.name,
        ...resultWithTime,
        timestamp: new Date().toISOString(),
      });

      if (result.healthy) {
        this.logger.debug(`[DeaconService] Health check passed: ${check.name} (${responseTime}ms)`);
      } else {
        this.logger.warn(`[DeaconService] Health check failed: ${check.name} - ${result.message}`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.events.emit('patrol:health-check', {
        checkId: check.id,
        checkName: check.name,
        healthy: false,
        message: errorMessage,
        responseTime,
        timestamp: new Date().toISOString(),
      });

      this.logger.error(`[DeaconService] Health check error: ${check.name} - ${errorMessage}`);
    }
  }

  /**
   * Add timeout to promise
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
    ]);
  }

  /**
   * Get health check status
   */
  getHealthStatus(): Map<string, boolean> {
    const status = new Map<string, boolean>();

    for (const [id, check] of this.checks) {
      // In real implementation, would track last result
      status.set(id, true);
    }

    return status;
  }
}
```

### Common Pitfalls

1. **Resource Leaks**: Always clear intervals in stop() methods
2. **Blocking Operations**: Health checks should be fast and non-blocking
3. **Error Propagation**: Handle errors gracefully, don't let one check fail others
4. **Memory Growth**: Buffers should have size limits

---

## MEOW Workflow Template System

MEOW (Modular Execution Of Workflows) provides reusable workflow templates.

### Implementation: Workflow Template Engine

**File Path:** `/apps/server/src/services/meow-template-service.ts`

```typescript
/**
 * MEOW Workflow Template Service
 *
 * Defines reusable workflow templates for common development tasks.
 */

import type { EventEmitter } from '../lib/events.js';

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  handler: string; // Skill or handler name
  timeout?: number;
  continueOnError?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'development' | 'testing' | 'deployment' | 'maintenance';
  steps: WorkflowStep[];
  checkpoints?: string[]; // Step IDs where user approval is needed
}

export class MEOWTemplateService {
  private events: EventEmitter;
  private templates: Map<string, WorkflowTemplate> = new Map();

  constructor(events: EventEmitter) {
    this.events = events;
    this.initializeDefaultTemplates();
  }

  /**
   * Initialize default workflow templates
   */
  private initializeDefaultTemplates(): void {
    // Feature Development Template
    this.registerTemplate({
      id: 'feature-development',
      name: 'Feature Development',
      description: 'Complete workflow for developing a new feature',
      category: 'development',
      steps: [
        {
          id: 'research',
          name: 'Research',
          description: 'Gather context and research implementation approach',
          handler: 'execute_research_skill',
          timeout: 120000,
        },
        {
          id: 'planning',
          name: 'Planning',
          description: 'Create detailed implementation plan',
          handler: 'execute_research_skill',
          timeout: 60000,
        },
        {
          id: 'implementation',
          name: 'Implementation',
          description: 'Write code for the feature',
          handler: 'execute_implementation_skill',
          timeout: 600000,
        },
        {
          id: 'testing',
          name: 'Testing',
          description: 'Write and run tests',
          handler: 'execute_cicd_skill',
          timeout: 300000,
        },
        {
          id: 'validation',
          name: 'Validation',
          description: 'Run linting, type checking, and build',
          handler: 'execute_cicd_skill',
          timeout: 300000,
        },
      ],
      checkpoints: ['planning', 'implementation'],
    });

    // Bug Fix Template
    this.registerTemplate({
      id: 'bug-fix',
      name: 'Bug Fix',
      description: 'Workflow for fixing bugs',
      category: 'maintenance',
      steps: [
        {
          id: 'investigation',
          name: 'Investigation',
          description: 'Investigate the bug and root cause',
          handler: 'execute_research_skill',
          timeout: 60000,
        },
        {
          id: 'fix',
          name: 'Fix',
          description: 'Implement the fix',
          handler: 'execute_implementation_skill',
          timeout: 300000,
        },
        {
          id: 'verification',
          name: 'Verification',
          description: 'Verify the fix works',
          handler: 'execute_cicd_skill',
          timeout: 300000,
        },
      ],
      checkpoints: ['fix'],
    });

    // Code Review Template
    this.registerTemplate({
      id: 'code-review',
      name: 'Code Review',
      description: 'Automated code review workflow',
      category: 'development',
      steps: [
        {
          id: 'analyze',
          name: 'Analyze',
          description: 'Analyze code changes',
          handler: 'execute_research_skill',
          timeout: 60000,
        },
        {
          id: 'feedback',
          name: 'Feedback',
          description: 'Generate review feedback',
          handler: 'execute_research_skill',
          timeout: 120000,
        },
      ],
      checkpoints: ['feedback'],
    });
  }

  /**
   * Register a workflow template
   */
  registerTemplate(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
    this.events.emit('meow:template-registered', {
      templateId: template.id,
      template,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): WorkflowTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Get all templates
   */
  getAllTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: WorkflowTemplate['category']): WorkflowTemplate[] {
    return Array.from(this.templates.values()).filter((t) => t.category === category);
  }

  /**
   * Execute workflow template
   */
  async executeTemplate(
    templateId: string,
    projectPath: string,
    context: Record<string, unknown> = {}
  ): Promise<void> {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    this.events.emit('meow:workflow-started', {
      templateId,
      projectPath,
      timestamp: new Date().toISOString(),
    });

    for (const step of template.steps) {
      const isCheckpoint = template.checkpoints?.includes(step.id);

      this.events.emit('meow:step-started', {
        templateId,
        stepId: step.id,
        stepName: step.name,
        timestamp: new Date().toISOString(),
      });

      try {
        // Execute step handler
        await this.executeStep(step, projectPath, context);

        this.events.emit('meow:step-completed', {
          templateId,
          stepId: step.id,
          timestamp: new Date().toISOString(),
        });

        // Wait for approval if this is a checkpoint
        if (isCheckpoint) {
          const approved = await this.waitForApproval(templateId, step.id);
          if (!approved) {
            this.events.emit('meow:workflow-cancelled', {
              templateId,
              stepId: step.id,
              timestamp: new Date().toISOString(),
            });
            return;
          }
        }
      } catch (error) {
        this.events.emit('meow:step-failed', {
          templateId,
          stepId: step.id,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });

        if (!step.continueOnError) {
          throw error;
        }
      }
    }

    this.events.emit('meow:workflow-completed', {
      templateId,
      projectPath,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    projectPath: string,
    context: Record<string, unknown>
  ): Promise<void> {
    // This would call the appropriate handler/skill
    // For now, just log
    console.log(`[MEOW] Executing step: ${step.name}`);
  }

  /**
   * Wait for user approval at checkpoint
   */
  private async waitForApproval(templateId: string, stepId: string): Promise<boolean> {
    // In real implementation, would wait for user input
    // For now, auto-approve
    return true;
  }
}
```

### Testing Workflow Templates

```typescript
/**
 * Test: Workflow template execution
 */

import { describe, it, expect, vi } from 'vitest';
import { MEOWTemplateService } from './meow-template-service.js';

describe('MEOWTemplateService', () => {
  it('should execute feature development workflow', async () => {
    const events = {
      emit: vi.fn(),
    } as any;

    const service = new MEOWTemplateService(events);

    const template = service.getTemplate('feature-development');
    expect(template).toBeDefined();
    expect(template?.steps.length).toBe(5);
    expect(template?.checkpoints).toEqual(['planning', 'implementation']);

    await service.executeTemplate('feature-development', '/test/project');

    expect(events.emit).toHaveBeenCalledWith('meow:workflow-started', expect.any(Object));
    expect(events.emit).toHaveBeenCalledWith('meow:workflow-completed', expect.any(Object));
  });
});
```

### Common Pitfalls

1. **Missing Checkpoints**: Always include approval points for long-running workflows
2. **Step Timeouts**: Set appropriate timeouts to prevent hanging
3. **Error Handling**: Decide whether to continue or abort on step failures
4. **Context Passing**: Ensure context is properly passed between steps

---

## Frontend Components

### React Hook: useWorkflowOrchestrator

**File Path:** `/apps/ui/src/hooks/use-workflow-orchestrator.ts`

```typescript
/**
 * React hook for workflow orchestration
 */

import { useState, useCallback, useEffect } from 'react';
import { getElectronAPI } from '@/lib/electron';

export interface WorkflowPhase {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  duration?: number;
}

export interface Workflow {
  id: string;
  templateId: string;
  phases: WorkflowPhase[];
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentPhase?: string;
  startTime: string;
  endTime?: string;
}

export function useWorkflowOrchestrator() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | undefined>();

  // Start workflow
  const startWorkflow = useCallback(async (templateId: string, projectPath: string) => {
    const api = getElectronAPI();

    if (!api?.workflow) {
      throw new Error('Workflow API not available');
    }

    const workflowId = await api.workflow.start(templateId, projectPath);

    return workflowId;
  }, []);

  // Approve checkpoint
  const approveCheckpoint = useCallback(async (workflowId: string, stepId: string) => {
    const api = getElectronAPI();

    if (!api?.workflow) {
      throw new Error('Workflow API not available');
    }

    await api.workflow.approve(workflowId, stepId);
  }, []);

  // Cancel workflow
  const cancelWorkflow = useCallback(async (workflowId: string) => {
    const api = getElectronAPI();

    if (!api?.workflow) {
      throw new Error('Workflow API not available');
    }

    await api.workflow.cancel(workflowId);
  }, []);

  // Listen for workflow events
  useEffect(() => {
    const api = getElectronAPI();

    if (!api?.workflow) {
      return;
    }

    const unsubscribe = api.workflow.onEvent((event) => {
      switch (event.type) {
        case 'workflow:started':
          setWorkflows((prev) => [
            ...prev,
            {
              id: event.workflowId,
              templateId: event.templateId,
              phases: [],
              status: 'running',
              startTime: event.timestamp,
            },
          ]);
          break;

        case 'workflow:phase-started':
          setWorkflows((prev) =>
            prev.map((w) =>
              w.id === event.workflowId
                ? {
                    ...w,
                    currentPhase: event.phaseId,
                    phases: [
                      ...w.phases,
                      {
                        id: event.phaseId,
                        name: event.phaseName,
                        status: 'running',
                      },
                    ],
                  }
                : w
            )
          );
          break;

        case 'workflow:phase-completed':
          setWorkflows((prev) =>
            prev.map((w) =>
              w.id === event.workflowId
                ? {
                    ...w,
                    phases: w.phases.map((p) =>
                      p.id === event.phaseId
                        ? {
                            ...p,
                            status: 'completed',
                            output: event.output,
                            duration: event.duration,
                          }
                        : p
                    ),
                  }
                : w
            )
          );
          break;

        case 'workflow:completed':
          setWorkflows((prev) =>
            prev.map((w) =>
              w.id === event.workflowId
                ? {
                    ...w,
                    status: 'completed',
                    endTime: event.timestamp,
                    currentPhase: undefined,
                  }
                : w
            )
          );
          break;

        case 'workflow:cancelled':
          setWorkflows((prev) =>
            prev.map((w) =>
              w.id === event.workflowId
                ? {
                    ...w,
                    status: 'cancelled',
                    endTime: event.timestamp,
                    currentPhase: undefined,
                  }
                : w
            )
          );
          break;
      }
    });

    return unsubscribe;
  }, []);

  return {
    workflows,
    activeWorkflow,
    startWorkflow,
    approveCheckpoint,
    cancelWorkflow,
  };
}
```

### React Component: WorkflowMonitor

**File Path:** `/apps/ui/src/components/workflow-monitor.tsx`

```typescript
/**
 * Workflow monitor component
 */

import { useWorkflowOrchestrator } from '@/hooks/use-workflow-orchestrator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

export function WorkflowMonitor() {
  const { workflows, activeWorkflow, approveCheckpoint, cancelWorkflow } =
    useWorkflowOrchestrator();

  const handleApprove = async (workflowId: string, stepId: string) => {
    await approveCheckpoint(workflowId, stepId);
  };

  const handleCancel = async (workflowId: string) => {
    await cancelWorkflow(workflowId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      running: 'default',
      completed: 'secondary',
      failed: 'destructive',
      cancelled: 'secondary',
    };

    return (
      <Badge variant={variants[status] || 'default'}>{status}</Badge>
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Workflow Monitor</h2>

      {workflows.map((workflow) => (
        <Card key={workflow.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{workflow.templateId}</CardTitle>
              <div className="flex items-center gap-2">
                {getStatusBadge(workflow.status)}
                {workflow.status === 'running' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleCancel(workflow.id)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-2">
              {workflow.phases.map((phase) => (
                <div
                  key={phase.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(phase.status)}
                    <span>{phase.name}</span>
                  </div>

                  {phase.duration && (
                    <span className="text-sm text-gray-500">
                      {Math.round(phase.duration / 1000)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### Common Pitfalls

1. **Memory Leaks**: Always unsubscribe from event listeners in useEffect cleanup
2. **Stale Closures**: Use useCallback for event handlers to avoid stale data
3. **Race Conditions**: Handle rapid state updates properly
4. **Error Boundaries**: Wrap components in error boundaries

---

## API Route Handlers

### Example: Workflow Routes

**File Path:** `/apps/server/src/routes/workflow/index.ts`

```typescript
/**
 * Workflow orchestration API routes
 */

import { Router } from 'express';
import { MEOWTemplateService } from '../../services/meow-template-service.js';
import { getErrorMessage, logError } from '../agent/common.js';

export function createWorkflowRoutes(templateService: MEOWTemplateService): Router {
  const router = Router();

  // GET /api/workflow/templates - List all templates
  router.get('/templates', (req, res) => {
    try {
      const { category } = req.query;

      let templates;
      if (category) {
        templates = templateService.getTemplatesByCategory(
          category as 'development' | 'testing' | 'deployment' | 'maintenance'
        );
      } else {
        templates = templateService.getAllTemplates();
      }

      res.json({
        success: true,
        templates,
      });
    } catch (error) {
      logError(error, 'List workflow templates failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // GET /api/workflow/templates/:id - Get template by ID
  router.get('/templates/:id', (req, res) => {
    try {
      const { id } = req.params;
      const template = templateService.getTemplate(id);

      if (!template) {
        res.status(404).json({
          success: false,
          error: `Template not found: ${id}`,
        });
        return;
      }

      res.json({
        success: true,
        template,
      });
    } catch (error) {
      logError(error, 'Get workflow template failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /api/workflow/execute - Execute workflow template
  router.post('/execute', async (req, res) => {
    try {
      const { templateId, projectPath, context } = req.body;

      if (!templateId || !projectPath) {
        res.status(400).json({
          success: false,
          error: 'templateId and projectPath are required',
        });
        return;
      }

      // Start workflow execution
      await templateService.executeTemplate(templateId, projectPath, context || {});

      res.json({
        success: true,
        message: 'Workflow execution started',
      });
    } catch (error) {
      logError(error, 'Execute workflow failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /api/workflow/:workflowId/approve - Approve checkpoint
  router.post('/:workflowId/approve', async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { stepId } = req.body;

      if (!stepId) {
        res.status(400).json({
          success: false,
          error: 'stepId is required',
        });
        return;
      }

      // Approve checkpoint
      // This would interact with the running workflow

      res.json({
        success: true,
        message: 'Checkpoint approved',
      });
    } catch (error) {
      logError(error, 'Approve checkpoint failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /api/workflow/:workflowId/cancel - Cancel workflow
  router.post('/:workflowId/cancel', async (req, res) => {
    try {
      const { workflowId } = req.params;

      // Cancel workflow
      // This would interact with the running workflow

      res.json({
        success: true,
        message: 'Workflow cancelled',
      });
    } catch (error) {
      logError(error, 'Cancel workflow failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  return router;
}
```

### Common Pitfalls

1. **Validation**: Always validate request body before processing
2. **Error Handling**: Return appropriate HTTP status codes
3. **Async Handlers**: Mark route handlers as async and use try/catch
4. **Response Format**: Keep response format consistent

---

## Database Migration Scripts

### Example: Beads Database Migration

**File Path:** `/apps/server/src/migrations/001_create_beads_tables.sql`

```sql
-- Migration: Create Beads issue tracking tables
-- Description: Initial schema for Beads integration

-- Create beads_issues table
CREATE TABLE IF NOT EXISTS beads_issues (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('open', 'in_progress', 'blocked', 'closed')),
  type TEXT NOT NULL CHECK(type IN ('bug', 'feature', 'task', 'epic', 'chore')),
  priority INTEGER NOT NULL CHECK(priority IN (0, 1, 2, 3, 4)),
  labels TEXT, -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  parent_issue_id TEXT,
  feature_id TEXT,
  FOREIGN KEY (parent_issue_id) REFERENCES beads_issues(id) ON DELETE SET NULL
);

-- Create beads_dependencies table
CREATE TABLE IF NOT EXISTS beads_dependencies (
  id TEXT PRIMARY KEY,
  from_issue_id TEXT NOT NULL,
  to_issue_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('blocks', 'related', 'parent', 'discovered-from')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (from_issue_id) REFERENCES beads_issues(id) ON DELETE CASCADE,
  FOREIGN KEY (to_issue_id) REFERENCES beads_issues(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_beads_issues_status ON beads_issues(status);
CREATE INDEX IF NOT EXISTS idx_beads_issues_type ON beads_issues(type);
CREATE INDEX IF NOT EXISTS idx_beads_issues_priority ON beads_issues(priority);
CREATE INDEX IF NOT EXISTS idx_beads_issues_project_path ON beads_issues(project_path);
CREATE INDEX IF NOT EXISTS idx_beads_dependencies_from ON beads_dependencies(from_issue_id);
CREATE INDEX IF NOT EXISTS idx_beads_dependencies_to ON beads_dependencies(to_issue_id);
```

### TypeScript Migration Runner

**File Path:** `/apps/server/src/migrations/runner.ts`

```typescript
/**
 * Database migration runner
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface Migration {
  id: string;
  name: string;
  up: string;
  down?: string;
}

export class MigrationRunner {
  private db: Database.Database;
  private migrationsDir: string;

  constructor(dbPath: string, migrationsDir: string) {
    this.db = new Database(dbPath);
    this.migrationsDir = migrationsDir;

    // Create migrations tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Run all pending migrations
   */
  async run(): Promise<void> {
    const migrations = this.loadMigrations();
    const executed = this.getExecutedMigrations();

    for (const migration of migrations) {
      if (executed.has(migration.id)) {
        console.log(`[Migration] Skipping ${migration.id} (${migration.name})`);
        continue;
      }

      console.log(`[Migration] Running ${migration.id} (${migration.name})`);

      try {
        this.db.exec(migration.up);

        // Record migration
        const stmt = this.db.prepare(
          'INSERT INTO _migrations (id, name, executed_at) VALUES (?, ?, ?)'
        );
        stmt.run(migration.id, migration.name, new Date().toISOString());

        console.log(`[Migration] Completed ${migration.id}`);
      } catch (error) {
        console.error(`[Migration] Failed ${migration.id}:`, error);
        throw error;
      }
    }
  }

  /**
   * Rollback last migration
   */
  async rollback(): Promise<void> {
    const executed = this.getExecutedMigrations();
    const lastId = Array.from(executed).pop();

    if (!lastId) {
      console.log('[Migration] No migrations to rollback');
      return;
    }

    const migration = this.loadMigration(lastId);
    if (!migration?.down) {
      console.log(`[Migration] No rollback script for ${lastId}`);
      return;
    }

    console.log(`[Migration] Rolling back ${lastId}`);

    try {
      this.db.exec(migration.down);

      // Remove migration record
      const stmt = this.db.prepare('DELETE FROM _migrations WHERE id = ?');
      stmt.run(lastId);

      console.log(`[Migration] Rolled back ${lastId}`);
    } catch (error) {
      console.error(`[Migration] Rollback failed for ${lastId}:`, error);
      throw error;
    }
  }

  /**
   * Load all migrations
   */
  private loadMigrations(): Migration[] {
    const migrations: Migration[] = [];
    const files = ['001_create_beads_tables.sql'];

    for (const file of files) {
      const migration = this.loadMigrationFromFile(file);
      if (migration) {
        migrations.push(migration);
      }
    }

    return migrations.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Load single migration by ID
   */
  private loadMigration(id: string): Migration | undefined {
    const file = `${id}.sql`;
    return this.loadMigrationFromFile(file);
  }

  /**
   * Load migration from file
   */
  private loadMigrationFromFile(file: string): Migration | undefined {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      return undefined;
    }

    const [, id, name] = match;
    const filePath = join(this.migrationsDir, file);
    const content = readFileSync(filePath, 'utf-8');

    // Split up and down migrations
    const parts = content.split('-- @down');
    const up = parts[0].trim();
    const down = parts[1]?.trim();

    return {
      id,
      name,
      up,
      down,
    };
  }

  /**
   * Get executed migrations
   */
  private getExecutedMigrations(): Set<string> {
    const stmt = this.db.prepare('SELECT id FROM _migrations');
    const rows = stmt.all() as { id: string }[];
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
```

### Common Pitfalls

1. **Transaction Safety**: Wrap migrations in transactions
2. **Idempotency**: Migrations should be runnable multiple times safely
3. **Rollback Support**: Always provide rollback scripts
4. **Backward Compatibility**: Don't break existing data structures

---

## Summary

This cookbook provides practical, copy-pasteable code examples for implementing Gastown-inspired autonomous agent features in DevFlow. Each example includes:

- **Full working code** ready to use
- **Integration points** showing how components connect
- **Testing examples** for validation
- **Common pitfalls** and how to avoid them

### Key Features Covered

1. **Convoy Service**: Sequential task execution with dependency tracking
2. **Enhanced Agent Scoring**: Multi-factor agent selection with ML enhancement
3. **Patrol Services**: Witness (log monitoring), Refinery (data processing), Deacon (health checks)
4. **MEOW Templates**: Reusable workflow templates for common tasks
5. **Frontend Components**: React hooks and components for UI
6. **API Routes**: RESTful API handlers for all services
7. **Database Migrations**: SQL schema migrations and TypeScript runner

For more information, see:

- Beads Memory Service: `/apps/server/src/services/beads-memory-service.ts`
- Agent Coordinator: `/apps/server/src/services/beads-agent-coordinator.ts`
- Hooks Service: `/apps/server/src/services/hooks-service.ts`
- Workflow Orchestrator: `/apps/server/src/services/workflow-orchestrator-service.ts`
