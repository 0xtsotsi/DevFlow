/**
 * Beads Orchestrator Service
 *
 * Coordinates multi-agent execution using Beads for dependency-aware task orchestration.
 * Handles cross-feature dependency resolution and epic-level task coordination.
 *
 * HYBRID-M2: Enables intelligent agent orchestration based on Beads issue tracking.
 */

import { BeadsService, type BeadsIssue } from './beads-service.js';
import type { EventEmitter } from '../lib/events.js';

export interface FeatureExecutionPlan {
  featureId: string;
  issueId: string;
  canStart: boolean;
  blockedBy: string[];
  priority: number;
  estimatedDuration?: number;
}

export interface EpicExecutionPlan {
  epicId: string;
  epicTitle: string;
  subtaskCount: number;
  completedCount: number;
  percentComplete: number;
  hasReadyTasks: boolean;
  readySubtasks: string[];
  priority: number;
}

export interface OrchestrationOptions {
  projectPath: string;
  maxConcurrent?: number;
  respectPriorities?: boolean;
  respectDependencies?: boolean;
}

/**
 * Cross-feature dependency resolution result
 */
export interface CrossFeatureResolution {
  featureId: string;
  readyToStart: boolean;
  blockingFeatures: string[];
  blockedByFeatures: string[];
}

/**
 * Beads Orchestrator
 *
 * Provides dependency-aware task orchestration using Beads issue tracking.
 */
export class BeadsOrchestrator {
  private beadsService: BeadsService;
  private eventEmitter: EventEmitter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private activeExecutions: Map<string, Promise<any>> = new Map();

  constructor(eventEmitter: EventEmitter, beadsService?: BeadsService) {
    this.eventEmitter = eventEmitter;
    this.beadsService = beadsService || new BeadsService();
  }

  /**
   * Create an execution plan for multiple features based on Beads dependencies
   */
  async createExecutionPlan(
    features: Array<{ id: string; issueId: string }>,
    options: OrchestrationOptions
  ): Promise<FeatureExecutionPlan[]> {
    try {
      const featureMap = new Map(features.map((f) => [f.id, f.issueId]));

      // Resolve cross-feature dependencies using Beads
      const resolutions = await this.resolveCrossFeatureDependencies(
        options.projectPath,
        featureMap
      );

      // Create execution plans with priorities
      const plans: FeatureExecutionPlan[] = [];

      for (const resolution of resolutions) {
        const issueId = featureMap.get(resolution.featureId)!;
        const issue = await this.beadsService.getIssue(options.projectPath, issueId);

        plans.push({
          featureId: resolution.featureId,
          issueId,
          canStart: resolution.readyToStart,
          blockedBy: resolution.blockingFeatures,
          priority: issue?.priority || 5,
        });
      }

      // Sort by priority (P0 first) and execution readiness
      if (options.respectPriorities) {
        plans.sort((a, b) => a.priority - b.priority);
      }

      // Put ready tasks first within each priority level
      plans.sort((a, b) => {
        if (a.canStart && !b.canStart) return -1;
        if (!a.canStart && b.canStart) return 1;
        return 0;
      });

      this.eventEmitter.emit('beads:execution-plan-created', {
        timestamp: Date.now(),
        plans,
      });

      return plans;
    } catch (error) {
      this.eventEmitter.emit('beads:error', {
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to create execution plan: ${error}`);
    }
  }

  /**
   * Execute features with orchestration based on dependencies
   */
  async executeWithOrchestration<T>(
    features: Array<{ id: string; issueId: string; executor: () => Promise<T> }>,
    options: OrchestrationOptions
  ): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const maxConcurrent = options.maxConcurrent || 3;

    // Create execution plan
    const plans = await this.createExecutionPlan(
      features.map((f) => ({ id: f.id, issueId: f.issueId })),
      options
    );

    // Separate ready and blocked features
    const readyFeatures = features.filter((f) =>
      plans.find((p) => p.featureId === f.id && p.canStart)
    );
    // Note: blockedFeatures tracked but not used in this simplified version
    features.filter((f) => plans.find((p) => p.featureId === f.id && !p.canStart));

    // Execute ready features with concurrency limit
    const executing = new Set<string>();

    const executeNext = async (): Promise<void> => {
      while (readyFeatures.length > 0 || executing.size > 0) {
        // Start ready features up to concurrency limit
        while (readyFeatures.length > 0 && executing.size < maxConcurrent) {
          const feature = readyFeatures.shift()!;
          executing.add(feature.id);

          this.activeExecutions.set(
            feature.id,
            (async () => {
              try {
                const result = await feature.executor();
                results.set(feature.id, result);
                this.eventEmitter.emit('beads:feature-completed', {
                  timestamp: Date.now(),
                  featureId: feature.id,
                });
              } catch (error) {
                this.eventEmitter.emit('beads:feature-failed', {
                  timestamp: Date.now(),
                  featureId: feature.id,
                  error: error instanceof Error ? error.message : String(error),
                });
                throw error;
              } finally {
                executing.delete(feature.id);
                this.activeExecutions.delete(feature.id);
              }
            })()
          );
        }

        // Wait for at least one to complete
        if (this.activeExecutions.size > 0) {
          await Promise.race(this.activeExecutions.values());
        }
      }
    };

    await executeNext();

    // Note: Blocked features would need to be re-checked and executed
    // when their dependencies complete. This is a simplified version.

    return results;
  }

  /**
   * Get execution plans for all epics in the project
   */
  async getEpicPlans(projectPath: string): Promise<EpicExecutionPlan[]> {
    try {
      // Get all issues
      const allIssues = await this.beadsService.listIssues(projectPath);

      // Group by parent (epic)
      const epicMap = new Map<string, BeadsIssue[]>();
      const standaloneIssues: BeadsIssue[] = [];

      for (const issue of allIssues) {
        if (issue.parentIssueId) {
          if (!epicMap.has(issue.parentIssueId)) {
            epicMap.set(issue.parentIssueId, []);
          }
          epicMap.get(issue.parentIssueId)!.push(issue);
        } else {
          standaloneIssues.push(issue);
        }
      }

      // Build epic plans
      const plans: EpicExecutionPlan[] = [];

      for (const [epicId, subtasks] of epicMap.entries()) {
        // Get the parent issue (epic)
        const epic = await this.beadsService.getIssue(projectPath, epicId);

        // Count completed subtasks
        const completedCount = subtasks.filter((t) => t.status === 'closed').length;

        // Get ready subtasks
        const readySubtasks: string[] = [];
        for (const subtask of subtasks) {
          const blockers = await this.getBlockingIssues(projectPath, subtask.id);
          if (blockers.length === 0) {
            readySubtasks.push(subtask.id);
          }
        }

        plans.push({
          epicId,
          epicTitle: epic?.title || epicId,
          subtaskCount: subtasks.length,
          completedCount,
          percentComplete: Math.round((completedCount / subtasks.length) * 100),
          hasReadyTasks: readySubtasks.length > 0,
          readySubtasks,
          priority: epic?.priority || 5,
        });
      }

      // Sort by priority
      plans.sort((a, b) => a.priority - b.priority);

      return plans;
    } catch (error) {
      throw new Error(`Failed to get epic plans: ${error}`);
    }
  }

  /**
   * Get recommended execution order for issues
   */
  async getRecommendedExecutionOrder(projectPath: string, issueIds?: string[]): Promise<string[]> {
    try {
      let issues: BeadsIssue[];

      if (issueIds && issueIds.length > 0) {
        // Get specific issues
        issues = await Promise.all(
          issueIds.map((id) => this.beadsService.getIssue(projectPath, id))
        );
        issues = issues.filter((i) => i !== null) as BeadsIssue[];
      } else {
        // Get all open issues
        issues = await this.beadsService.listIssues(projectPath, {
          status: ['open', 'in_progress'],
        });
      }

      // Calculate priority score for each issue
      const scored = issues.map((issue) => {
        let score = 0;

        // Priority (0-10, lower is more urgent)
        score += (10 - issue.priority) * 10;

        // Bonus for being ready
        this.getBlockingIssues(projectPath, issue.id).then((blockers) => {
          if (blockers.length === 0) {
            score += 50;
          }
        });

        return { issue, score };
      });

      // Sort by score
      scored.sort((a, b) => b.score - a.score);

      return scored.map((s) => s.issue.id);
    } catch (error) {
      throw new Error(`Failed to get recommended order: ${error}`);
    }
  }

  /**
   * Watch and orchestrate based on Beads changes
   */
  watchAndOrchestrate(
    projectPath: string,
    callback: (event: 'ready' | 'blocked', issue: BeadsIssue) => void
  ): () => void {
    const stopWatching = this.beadsService.watchDatabase(projectPath, async () => {
      try {
        // Get all ready work
        const readyIssues = await this.beadsService.getReadyWork(projectPath);

        for (const issue of readyIssues) {
          callback('ready', issue);
        }

        // Get blocked issues
        const blockedIssues = await this.beadsService.getBlockedIssues(projectPath);

        for (const issue of blockedIssues) {
          callback('blocked', issue);
        }
      } catch (error) {
        console.error('[BeadsOrchestrator] Error in watch callback:', error);
      }
    });

    return stopWatching;
  }

  /**
   * Resolve cross-feature dependencies
   */
  private async resolveCrossFeatureDependencies(
    projectPath: string,
    featureMap: Map<string, string>
  ): Promise<CrossFeatureResolution[]> {
    const resolutions: CrossFeatureResolution[] = [];

    for (const [featureId, issueId] of featureMap.entries()) {
      const blockingIssues = await this.getBlockingIssues(projectPath, issueId);

      // Check if any blockers belong to other features in the map
      const blockingFeatures: string[] = [];
      for (const blocker of blockingIssues) {
        for (const [otherFeatureId, otherIssueId] of featureMap.entries()) {
          if (blocker.id === otherIssueId && otherFeatureId !== featureId) {
            blockingFeatures.push(otherFeatureId);
          }
        }
      }

      resolutions.push({
        featureId,
        readyToStart: blockingFeatures.length === 0,
        blockingFeatures: [],
        blockedByFeatures: blockingFeatures,
      });
    }

    // Also populate which features this one blocks
    for (const resolution of resolutions) {
      resolution.blockingFeatures = resolutions
        .filter((r) => r.blockedByFeatures.includes(resolution.featureId))
        .map((r) => r.featureId);
    }

    return resolutions;
  }

  /**
   * Get issues that are blocking the given issue
   */
  private async getBlockingIssues(projectPath: string, issueId: string): Promise<BeadsIssue[]> {
    try {
      const issue = await this.beadsService.getIssue(projectPath, issueId);
      if (!issue) {
        return [];
      }

      // Get all dependencies and filter for blockers
      const blockers: BeadsIssue[] = [];

      for (const dep of issue.dependencies || []) {
        if (dep.type === 'blocks' || dep.type === 'parent') {
          const depIssue = await this.beadsService.getIssue(projectPath, dep.dependsOnId);
          if (depIssue) {
            // Check if the dependency is still open/in progress
            if (depIssue.status === 'open' || depIssue.status === 'in_progress') {
              blockers.push(depIssue);
            }
          }
        }
      }

      return blockers;
    } catch (error) {
      console.error(`[BeadsOrchestrator] Error getting blockers for ${issueId}:`, error);
      return [];
    }
  }

  /**
   * Stop all active executions
   */
  async stopAll(): Promise<void> {
    for (const [featureId] of this.activeExecutions.entries()) {
      try {
        // Note: This would require the executor to support cancellation
        // For now, we just remove from tracking
        this.activeExecutions.delete(featureId);
      } catch (error) {
        console.error(`[BeadsOrchestrator] Error stopping execution for ${featureId}:`, error);
      }
    }
  }
}

export { BeadsService };
