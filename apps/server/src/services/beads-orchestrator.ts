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

export class BeadsOrchestrator {
  private beadsService: BeadsService;
  private eventEmitter: EventEmitter;
  private activeExecutions: Map<string, Promise<any>> = new Map();

  constructor(eventEmitter: EventEmitter, beadsService?: BeadsService) {
    this.eventEmitter = eventEmitter;
    this.beadsService = beadsService || new BeadsService();
    this.beadsService.setEventEmitter(eventEmitter);
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
      const resolutions = await this.beadsService.resolveCrossFeatureDependencies(
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
          priority: issue.priority,
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

      return plans;
    } catch (error) {
      throw new Error(`Failed to create execution plan: ${error}`);
    }
  }

  /**
   * Get epic-level execution plans for coordinated multi-agent work
   */
  async getEpicPlans(projectPath: string): Promise<EpicExecutionPlan[]> {
    try {
      const coordination = await this.beadsService.getEpicCoordination(projectPath);

      return coordination.epics.map((epicData) => {
        const readySubtasks = epicData.subtasks
          .filter((task) => {
            // Check if task has no blockers
            // This is a simplified check - in real implementation, would check dependencies
            return task.status === 'open' || task.status === 'in_progress';
          })
          .map((task) => task.id);

        return {
          epicId: epicData.epic.id,
          epicTitle: epicData.epic.title,
          subtaskCount: epicData.totalCount,
          completedCount: epicData.completedCount,
          percentComplete: epicData.percentComplete,
          hasReadyTasks: readySubtasks.length > 0,
          readySubtasks,
          priority: epicData.epic.priority,
        };
      });
    } catch (error) {
      throw new Error(`Failed to get epic plans: ${error}`);
    }
  }

  /**
   * Execute features with intelligent orchestration based on dependencies
   */
  async executeWithOrchestration(
    features: Array<{ id: string; issueId: string; executor: () => Promise<any> }>,
    options: OrchestrationOptions
  ): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const maxConcurrent = options.maxConcurrent || 3;

    try {
      // Create execution plan
      const plan = await this.createExecutionPlan(features, options);

      // Separate ready and blocked features
      const readyFeatures = plan.filter((p) => p.canStart);
      const blockedFeatures = plan.filter((p) => !p.canStart);

      // Execute ready features with concurrency limit
      const executionQueue = readyFeatures.map((planItem) => {
        const feature = features.find((f) => f.id === planItem.featureId)!;
        return {
          feature,
          plan: planItem,
        };
      });

      let activeCount = 0;
      let currentIndex = 0;

      const executeNext = async (): Promise<void> => {
        if (currentIndex >= executionQueue.length) return;

        const { feature, plan } = executionQueue[currentIndex++];
        activeCount++;

        try {
          // Update issue status to in_progress
          await this.beadsService.updateIssue(options.projectPath, feature.issueId, {
            status: 'in_progress',
          });

          // Execute the feature
          const result = await feature.executor();
          results.set(feature.id, result);

          // Mark issue as completed
          await this.beadsService.updateIssue(options.projectPath, feature.issueId, {
            status: 'closed',
          });

          // Check if any blocked features are now ready
          await this.checkBlockedFeatures(blockedFeatures, options, results);
        } catch (error) {
          // Mark issue as failed/blocked
          await this.beadsService.updateIssue(options.projectPath, feature.issueId, {
            status: 'open',
          });
          throw error;
        } finally {
          activeCount--;
        }
      };

      // Execute with concurrency control
      const workers: Promise<void>[] = [];
      for (let i = 0; i < maxConcurrent; i++) {
        workers.push(
          (async () => {
            while (currentIndex < executionQueue.length || activeCount > 0) {
              if (currentIndex < executionQueue.length && activeCount < maxConcurrent) {
                await executeNext();
              } else {
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
            }
          })()
        );
      }

      await Promise.all(workers);

      return results;
    } catch (error) {
      throw new Error(`Orchestration execution failed: ${error}`);
    }
  }

  /**
   * Check if blocked features can now start after completing some features
   */
  private async checkBlockedFeatures(
    blockedFeatures: FeatureExecutionPlan[],
    options: OrchestrationOptions,
    completedResults: Map<string, any>
  ): Promise<void> {
    for (const blocked of blockedFeatures) {
      // Check if all blocking features are complete
      const allBlockersComplete = blocked.blockedBy.every((blockerId) =>
        completedResults.has(blockerId)
      );

      if (allBlockersComplete) {
        // This feature is now ready - emit event
        this.eventEmitter.emit('beads:task-ready', {
          featureId: blocked.featureId,
          issueId: blocked.issueId,
          projectPath: options.projectPath,
        });

        // Auto-update status in Beads
        await this.beadsService.automateIssueStatus(options.projectPath, blocked.issueId);
      }
    }
  }

  /**
   * Get recommended execution order based on dependencies and priorities
   */
  async getRecommendedOrder(projectPath: string): Promise<BeadsIssue[]> {
    try {
      // Get ready work (no blockers)
      const readyWork = await this.beadsService.getReadyWork(projectPath);

      // Sort by priority and type
      readyWork.sort((a: any, b: any) => {
        // P0 first, then P1, etc.
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        // Within same priority: bugs first, then features, then tasks
        const typeOrder = { bug: 0, feature: 1, task: 2, chore: 3, epic: 4 };
        const typeA = typeOrder[a.type as keyof typeof typeOrder] ?? 99;
        const typeB = typeOrder[b.type as keyof typeof typeOrder] ?? 99;

        return typeA - typeB;
      });

      return readyWork;
    } catch (error) {
      throw new Error(`Failed to get recommended order: ${error}`);
    }
  }

  /**
   * Watch for Beads changes and trigger orchestration updates
   */
  async watchAndOrchestrate(
    projectPath: string,
    onChange: (readyIssues: BeadsIssue[]) => Promise<void>
  ): Promise<() => void> {
    return this.beadsService.watchDatabase(projectPath, async () => {
      try {
        const readyWork = await this.getRecommendedOrder(projectPath);
        await onChange(readyWork);
      } catch (error) {
        this.eventEmitter.emit('beads:sync-error', { projectPath, error });
      }
    });
  }

  /**
   * Get execution status for all active features
   */
  getExecutionStatus(): Map<string, 'running' | 'completed' | 'failed'> {
    const status = new Map<string, 'running' | 'completed' | 'failed'>();

    for (const [id, promise] of this.activeExecutions) {
      // Check promise state (simplified - in real impl would use promise status tracking)
      status.set(id, 'running');
    }

    return status;
  }

  /**
   * Stop all active executions
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.activeExecutions.values());
    this.activeExecutions.clear();

    // In real implementation, would cancel ongoing operations
    await Promise.allSettled(promises);
  }
}
