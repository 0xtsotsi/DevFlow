/**
 * Board Hygiene Service
 *
 * Enforces board state consistency for Vibe-Kanban tasks.
 * Implements "Zero Fake Done" rule - tasks marked as done must
 * have actually landed (PR merged, CI green, description updated).
 *
 * Critical: This service only validates and corrects task states.
 * It never writes project source code.
 */

import type { VibeKanbanTask } from '@automaker/types';
import type { VibeKanbanClient } from './vibe-kanban-client.js';

/**
 * Result of board hygiene check
 */
export interface HygieneCheckResult {
  taskId: string;
  taskTitle: string;
  hasIssue: boolean;
  issues: string[];
  corrected: boolean;
}

/**
 * Board hygiene statistics
 */
export interface BoardHygieneStats {
  totalChecked: number;
  issuesFound: number;
  issuesCorrected: number;
  fakeDonesFound: number;
}

/**
 * Configuration for board hygiene service
 */
export interface BoardHygieneConfig {
  autoCorrect: boolean; // Automatically fix issues when found
  requirePR: boolean; // Require PR for done tasks
  requireMerge: boolean; // Require PR merged for done tasks
  requireCI: boolean; // Require CI passed for done tasks
  requireLandingSummary: boolean; // Require landing description
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BoardHygieneConfig = {
  autoCorrect: true,
  requirePR: true,
  requireMerge: true,
  requireCI: true,
  requireLandingSummary: true,
};

/**
 * Board Hygiene Service
 *
 * Enforces state consistency rules for Vibe-Kanban tasks.
 */
export class BoardHygieneService {
  private vibeKanban: VibeKanbanClient;
  private config: BoardHygieneConfig;
  private stats: BoardHygieneStats = {
    totalChecked: 0,
    issuesFound: 0,
    issuesCorrected: 0,
    fakeDonesFound: 0,
  };

  constructor(vibeKanban: VibeKanbanClient, config?: Partial<BoardHygieneConfig>) {
    this.vibeKanban = vibeKanban;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enforce "done" criteria on all tasks marked as done
   *
   * Checks that tasks marked as done:
   * - Have a PR created
   * - Have the PR merged
   * - Have CI passed
   * - Have a landing summary
   *
   * Moves tasks back to in_review if they don't meet criteria.
   */
  async enforceDoneCriteria(_projectId?: string): Promise<HygieneCheckResult[]> {
    console.log('[BoardHygiene] Checking done criteria...');

    const results: HygieneCheckResult[] = [];
    const doneTasks = await this.vibeKanban.listTasks({
      status: 'done',
      limit: 100,
    });

    for (const task of doneTasks) {
      const issues = await this.validateDoneCriteria(task);
      const hasIssue = issues.length > 0;

      const result: HygieneCheckResult = {
        taskId: task.id,
        taskTitle: task.title,
        hasIssue,
        issues,
        corrected: false,
      };

      if (hasIssue) {
        this.stats.issuesFound++;
        if (task.status === 'done') {
          this.stats.fakeDonesFound++;
        }

        if (this.config.autoCorrect) {
          try {
            await this.vibeKanban.updateTask(task.id, {
              status: 'inreview',
              appendToDescription: `\n\n**Board Hygiene Issue:** ${issues.join(', ')}\n\n_Task was moved back to in_review because it doesn't meet done criteria._`,
            });

            result.corrected = true;
            this.stats.issuesCorrected++;

            console.warn(
              `[BoardHygiene] Task ${task.id} moved back to in_review: ${issues.join(', ')}`
            );
          } catch (error) {
            console.error(`[BoardHygiene] Failed to correct task ${task.id}:`, error);
          }
        }
      }

      results.push(result);
      this.stats.totalChecked++;
    }

    console.log(
      `[BoardHygiene] Checked ${doneTasks.length} tasks, ${this.stats.issuesFound} issues, ${this.stats.issuesCorrected} corrected`
    );

    return results;
  }

  /**
   * Validate that a task meets "done" criteria
   *
   * @param task - Task to validate
   * @returns Array of issue descriptions (empty if valid)
   */
  async validateDoneCriteria(task: VibeKanbanTask): Promise<string[]> {
    const issues: string[] = [];
    const description = task.description || '';

    // Check for PR creation
    if (this.config.requirePR) {
      const hasPR = /PR Created:? #?\d+/i.test(description);
      if (!hasPR) {
        issues.push('No PR created');
      }
    }

    // Check for PR merge
    if (this.config.requireMerge) {
      const hasMerge = /Merged:/.test(description) || /merged.*true/i.test(description);
      if (!hasMerge) {
        issues.push('PR not merged');
      }
    }

    // Check for CI pass
    if (this.config.requireCI) {
      const hasCIPass = /CI passed|Status.*✅|All checks passed/i.test(description);
      if (!hasCIPass) {
        issues.push('CI status not confirmed');
      }
    }

    // Check for landing summary
    if (this.config.requireLandingSummary) {
      const hasLanding = /Landed:/.test(description) || /Landing summary:/i.test(description);
      if (!hasLanding) {
        issues.push('No landing summary');
      }
    }

    return issues;
  }

  /**
   * Check for stale tasks
   *
   * Finds tasks that have been in the same state for too long.
   *
   * @param status - Task status to check
   * @param staleThresholdDays - Days before considering a task stale
   */
  async findStaleTasks(
    status: 'todo' | 'inprogress' | 'inreview' | 'done',
    staleThresholdDays: number = 7
  ): Promise<VibeKanbanTask[]> {
    const tasks = await this.vibeKanban.listTasks({ status, limit: 100 });
    const threshold = Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000;

    return tasks.filter((task) => {
      const updatedAt = task.updatedAt ? new Date(task.updatedAt).getTime() : 0;
      return updatedAt < threshold;
    });
  }

  /**
   * Check for duplicate tasks
   *
   * Finds tasks with similar titles that might be duplicates.
   *
   * @param title - Title to search for
   * @returns Array of potentially duplicate tasks
   */
  async findDuplicates(title: string): Promise<VibeKanbanTask[]> {
    const allTasks = await this.vibeKanban.listTasks({ limit: 100 });

    // Simple similarity check - tasks with similar titles
    const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, '');

    return allTasks.filter((task) => {
      if (task.id === undefined) return false;
      const taskNormalized = task.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      return taskNormalized.includes(normalized) || normalized.includes(taskNormalized);
    });
  }

  /**
   * Get board statistics
   *
   * @returns Current board hygiene stats
   */
  getStats(): BoardHygieneStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalChecked: 0,
      issuesFound: 0,
      issuesCorrected: 0,
      fakeDonesFound: 0,
    };
  }

  /**
   * Run full board health check
   *
   * Performs all hygiene checks and returns a comprehensive report.
   */
  async runHealthCheck(): Promise<{
    doneCriteriaResults: HygieneCheckResult[];
    staleTasks: {
      todo: VibeKanbanTask[];
      inprogress: VibeKanbanTask[];
      inreview: VibeKanbanTask[];
    };
    stats: BoardHygieneStats;
  }> {
    console.log('[BoardHygiene] Running full health check...');

    const doneCriteriaResults = await this.enforceDoneCriteria();

    const staleTasks = {
      todo: await this.findStaleTasks('todo', 14), // 14 days for todo
      inprogress: await this.findStaleTasks('inprogress', 7), // 7 days for in progress
      inreview: await this.findStaleTasks('inreview', 3), // 3 days for review
    };

    return {
      doneCriteriaResults,
      staleTasks,
      stats: this.getStats(),
    };
  }

  /**
   * Format health check results as markdown
   */
  formatHealthCheckAsMarkdown(
    healthCheck: Awaited<ReturnType<BoardHygieneService['runHealthCheck']>>
  ): string {
    const lines: string[] = [];

    lines.push('# Board Health Check Report');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    // Statistics
    lines.push('## Statistics');
    lines.push(`- Total Checked: ${healthCheck.stats.totalChecked}`);
    lines.push(`- Issues Found: ${healthCheck.stats.issuesFound}`);
    lines.push(`- Issues Corrected: ${healthCheck.stats.issuesCorrected}`);
    lines.push(`- Fake Dones Found: ${healthCheck.stats.fakeDonesFound}`);
    lines.push('');

    // Done criteria issues
    const doneIssues = healthCheck.doneCriteriaResults.filter((r) => r.hasIssue);
    if (doneIssues.length > 0) {
      lines.push('## Done Criteria Issues');
      lines.push('');
      for (const result of doneIssues) {
        lines.push(`### ${result.taskTitle}`);
        lines.push(`- **Task ID:** ${result.taskId}`);
        lines.push(`- **Issues:** ${result.issues.join(', ')}`);
        lines.push(`- **Corrected:** ${result.corrected ? 'Yes ✅' : 'No ❌'}`);
        lines.push('');
      }
    } else {
      lines.push('## Done Criteria Issues');
      lines.push('No issues found! ✅');
      lines.push('');
    }

    // Stale tasks
    lines.push('## Stale Tasks');
    lines.push('');

    if (healthCheck.staleTasks.todo.length > 0) {
      lines.push('### Stale Todo (14+ days)');
      for (const task of healthCheck.staleTasks.todo) {
        lines.push(`- ${task.title} (${task.id}) - updated ${task.updatedAt}`);
      }
      lines.push('');
    }

    if (healthCheck.staleTasks.inprogress.length > 0) {
      lines.push('### Stale In Progress (7+ days)');
      for (const task of healthCheck.staleTasks.inprogress) {
        lines.push(`- ${task.title} (${task.id}) - updated ${task.updatedAt}`);
      }
      lines.push('');
    }

    if (healthCheck.staleTasks.inreview.length > 0) {
      lines.push('### Stale In Review (3+ days)');
      for (const task of healthCheck.staleTasks.inreview) {
        lines.push(`- ${task.title} (${task.id}) - updated ${task.updatedAt}`);
      }
      lines.push('');
    }

    if (
      healthCheck.staleTasks.todo.length === 0 &&
      healthCheck.staleTasks.inprogress.length === 0 &&
      healthCheck.staleTasks.inreview.length === 0
    ) {
      lines.push('No stale tasks! ✅');
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Create a singleton instance
 */
let globalInstance: BoardHygieneService | null = null;

export function getBoardHygieneService(
  vibeKanban: VibeKanbanClient,
  config?: Partial<BoardHygieneConfig>
): BoardHygieneService {
  if (!globalInstance) {
    globalInstance = new BoardHygieneService(vibeKanban, config);
  }
  return globalInstance;
}

export function resetBoardHygieneService(): void {
  globalInstance = null;
}
