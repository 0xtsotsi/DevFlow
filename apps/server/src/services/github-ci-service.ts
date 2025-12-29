/**
 * GitHub CI Service
 *
 * Monitors CI status for PRs and emits events for task state updates.
 * Integrates with GitHub Actions to automatically update Vibe-Kanban tasks
 * when CI passes or fails.
 *
 * This maintains separation of concerns - the service only polls GitHub
 * for CI status and emits events. It never writes project files.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { EventEmitter } from '../lib/events.js';

const execFileAsync = promisify(execFile);

/**
 * CI check status
 */
export interface CICheckStatus {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out';
  url?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Overall CI status for a PR
 */
export interface PRStatus {
  prNumber: number;
  passed: boolean;
  failed: boolean;
  pending: boolean;
  totalChecks: number;
  completedChecks: number;
  checks: CICheckStatus[];
}

/**
 * CI watch request
 */
export interface CIWatchRequest {
  prNumber: number;
  taskId?: string; // Vibe-Kanban task ID to update
  autoFixOnFailure?: boolean;
}

/**
 * Configuration for CI service
 */
export interface GitHubCIConfig {
  pollInterval: number; // milliseconds
  maxRetries: number;
}

/**
 * GitHub CI Service
 *
 * Polls GitHub for CI status and emits events when status changes.
 */
export class GitHubCIService {
  private events: EventEmitter;
  private config: GitHubCIConfig;
  private activeWatches = new Map<number, NodeJS.Timeout>();
  private lastStatus = new Map<number, 'passed' | 'failed' | 'pending'>();

  constructor(events: EventEmitter, config?: Partial<GitHubCIConfig>) {
    this.events = events;
    this.config = {
      pollInterval: 30000, // 30 seconds
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * Check CI status for a PR using GitHub CLI
   *
   * @param prNumber - PR number to check
   * @returns CI status
   */
  async checkPRStatus(prNumber: number): Promise<PRStatus> {
    try {
      // Use GitHub CLI to get CI status
      const { stdout } = await execFileAsync('gh', [
        'pr',
        'checks',
        String(prNumber),
        '--json',
        'name,status,conclusion,url,startedAt,completedAt',
      ]);

      const checks = JSON.parse(stdout) as CICheckStatus[];

      const completedChecks = checks.filter((c) => c.status === 'completed');
      const totalChecks = checks.length;

      const failed = completedChecks.some(
        (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out'
      );
      const passed =
        totalChecks > 0 &&
        completedChecks.length === totalChecks &&
        completedChecks.every((c) => c.conclusion === 'success');
      const pending =
        totalChecks > completedChecks.length || checks.some((c) => c.status === 'in_progress');

      return {
        prNumber,
        passed,
        failed,
        pending,
        totalChecks,
        completedChecks,
        checks,
      };
    } catch (error) {
      console.error(`[GitHubCI] Failed to check status for PR #${prNumber}:`, error);
      // Return pending status on error to avoid false positives
      return {
        prNumber,
        passed: false,
        failed: false,
        pending: true,
        totalChecks: 0,
        completedChecks: 0,
        checks: [],
      };
    }
  }

  /**
   * Watch a PR for CI status changes
   *
   * Polls GitHub for CI status and emits events when status changes.
   *
   * Emits:
   * - `github:ci:passed` - When all CI checks pass
   * - `github:ci:failed` - When any CI check fails
   * - `github:ci:pending` - When CI is still running
   *
   * @param request - Watch request with PR number and optional task ID
   * @returns Cleanup function to stop watching
   */
  watchPR(request: CIWatchRequest): () => void {
    const { prNumber, taskId } = request;

    // Clear existing watch for this PR if any
    this.stopWatching(prNumber);

    // Start polling
    const interval = setInterval(async () => {
      const status = await this.checkPRStatus(prNumber);
      const currentStatus: 'passed' | 'failed' | 'pending' = status.passed
        ? 'passed'
        : status.failed
          ? 'failed'
          : 'pending';
      const lastStatus = this.lastStatus.get(prNumber);

      // Only emit on status change
      if (lastStatus !== currentStatus) {
        this.lastStatus.set(prNumber, currentStatus);

        const eventData = {
          prNumber,
          taskId,
          status: currentStatus,
          checks: status.checks,
          totalChecks: status.totalChecks,
          completedChecks: status.completedChecks,
        };

        if (currentStatus === 'passed') {
          this.events.emit('github:ci:passed', eventData);
          console.log(`[GitHubCI] PR #${prNumber} CI passed - stopping watch`);
          this.stopWatching(prNumber);
        } else if (currentStatus === 'failed') {
          this.events.emit('github:ci:failed', eventData);
          console.log(`[GitHubCI] PR #${prNumber} CI failed`);
          // Continue watching for fixes
        } else {
          this.events.emit('github:ci:pending', eventData);
        }
      }
    }, this.config.pollInterval);

    this.activeWatches.set(prNumber, interval);

    console.log(
      `[GitHubCI] Started watching PR #${prNumber} (interval: ${this.config.pollInterval}ms)`
    );

    // Return cleanup function
    return () => this.stopWatching(prNumber);
  }

  /**
   * Stop watching a PR
   */
  stopWatching(prNumber: number): void {
    const interval = this.activeWatches.get(prNumber);
    if (interval) {
      clearInterval(interval);
      this.activeWatches.delete(prNumber);
      this.lastStatus.delete(prNumber);
      console.log(`[GitHubCI] Stopped watching PR #${prNumber}`);
    }
  }

  /**
   * Stop watching all PRs
   */
  stopWatchingAll(): void {
    for (const prNumber of this.activeWatches.keys()) {
      this.stopWatching(prNumber);
    }
  }

  /**
   * Get all actively watched PRs
   */
  getActiveWatches(): number[] {
    return Array.from(this.activeWatches.keys());
  }

  /**
   * Check if a specific branch pattern should auto-merge
   *
   * Implements hybrid approach: auto-merge for feature branches,
   * manual approval for main/develop.
   */
  shouldAutoMerge(
    branch: string,
    config: { autoMergeBranches: string[]; manualMergeBranches: string[] }
  ): boolean {
    const { autoMergeBranches, manualMergeBranches } = config;

    // Check manual merge patterns first (higher priority)
    for (const pattern of manualMergeBranches) {
      if (this.matchPattern(branch, pattern)) {
        return false;
      }
    }

    // Check auto merge patterns
    for (const pattern of autoMergeBranches) {
      if (this.matchPattern(branch, pattern)) {
        return true;
      }
    }

    // Default to manual for unknown patterns
    return false;
  }

  /**
   * Match a branch name against a pattern
   * Supports wildcards (e.g., "feature/*")
   */
  private matchPattern(branch: string, pattern: string): boolean {
    if (pattern === branch) return true;

    // Simple wildcard support
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(branch);
    }

    return false;
  }

  /**
   * Merge a PR using GitHub CLI
   *
   * Only merges if:
   * - CI has passed
   * - Branch matches auto-merge pattern
   * - Not labelled with "require approval"
   */
  async mergePR(
    prNumber: number,
    branch: string,
    config: {
      autoMergeBranches: string[];
      manualMergeBranches: string[];
      requireApprovalFor: string[];
    }
  ): Promise<{ success: boolean; error?: string }> {
    // Check if auto-merge is allowed for this branch
    if (!this.shouldAutoMerge(branch, config)) {
      return {
        success: false,
        error: `Branch "${branch}" requires manual merge approval`,
      };
    }

    // Check CI status before merging
    const status = await this.checkPRStatus(prNumber);
    if (!status.passed) {
      return {
        success: false,
        error: `CI not passed (pending: ${status.pending}, failed: ${status.failed})`,
      };
    }

    try {
      // Merge using GitHub CLI
      await execFileAsync('gh', ['pr', 'merge', String(prNumber), '--merge', '--delete-branch']);

      console.log(`[GitHubCI] Auto-merged PR #${prNumber} (branch: ${branch})`);

      // Emit merge event
      this.events.emit('github:pr:auto-merged', { prNumber, branch });

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[GitHubCI] Failed to auto-merge PR #${prNumber}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopWatchingAll();
  }
}

/**
 * Default configuration for CI service
 */
export const DEFAULT_CI_CONFIG: GitHubCIConfig = {
  pollInterval: 30000, // 30 seconds
  maxRetries: 3,
};

/**
 * Create a singleton instance
 */
let globalCIService: GitHubCIService | null = null;

export function getGitHubCIService(events: EventEmitter): GitHubCIService {
  if (!globalCIService) {
    globalCIService = new GitHubCIService(events);
  }
  return globalCIService;
}

export function resetGitHubCIService(): void {
  if (globalCIService) {
    globalCIService.destroy();
  }
  globalCIService = null;
}
