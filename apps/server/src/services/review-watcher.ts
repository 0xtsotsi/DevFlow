/**
 * Review Watcher Service
 *
 * Monitors Vibe Kanban tasks in `inreview` status and auto-iterates on feedback.
 * Integrates with Vibe Kanban MCP server to watch for review comments.
 *
 * Features:
 * - Polls Vibe Kanban for `inreview` tasks every 30s
 * - Extracts review comments from multiple sources (Vibe Kanban, GitHub PRs, Beads)
 * - Classifies comments by intent (blocking vs. suggestion)
 * - Starts iteration workspace for blocking feedback
 * - Auto-approves after timeout with no blocking comments
 * - Escalates to human after max iterations
 */

import type { EventEmitter } from '../lib/events.js';

// ============================================================================
// Types
// ============================================================================

export interface ReviewComment {
  id: string;
  source: 'vibe-kanban' | 'github' | 'beads';
  content: string;
  author: string;
  timestamp: Date;
  isBlocking: boolean;
  taskId: string;
}

export interface ReviewTask {
  id: string;
  projectId: string;
  status: 'inreview' | 'approved' | 'rejected' | 'iterating';
  iterationCount: number;
  inReviewSince: Date;
  lastCommentTime?: Date;
  blockingCommentCount: number;
  suggestionCount: number;
}

export interface ReviewWatcherConfig {
  enabled: boolean;
  pollIntervalMs: number;
  autoApproveTimeoutMs: number;
  maxIterations: number;
}

const DEFAULT_CONFIG: ReviewWatcherConfig = {
  enabled: true,
  pollIntervalMs: 30000, // 30 seconds
  autoApproveTimeoutMs: 30 * 60 * 1000, // 30 minutes
  maxIterations: 3,
};

// ============================================================================
// Review Watcher Service
// ============================================================================

export class ReviewWatcherService {
  private events: EventEmitter;
  private config: ReviewWatcherConfig;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private pollTimeout: NodeJS.Timeout | null = null;
  private watchedTasks = new Map<string, ReviewTask>();

  // MCP client references (lazy loaded)
  private vibeKanbanMCPAvailable = false;

  constructor(events: EventEmitter, config?: Partial<ReviewWatcherConfig>) {
    this.events = events;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the review watcher
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[ReviewWatcher] Already running');
      return;
    }

    // Check if Vibe Kanban MCP is available
    this.vibeKanbanMCPAvailable = await this.checkVibeKanbanMCP();

    if (!this.vibeKanbanMCPAvailable) {
      console.warn('[ReviewWatcher] Vibe Kanban MCP not available, watcher disabled');
      return;
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    this.events.emit('review-watcher:started', {
      message: 'Review watcher started',
      config: this.config,
    });

    console.log('[ReviewWatcher] Started with config:', this.config);

    // Start polling loop
    this.pollLoop().catch((error) => {
      console.error('[ReviewWatcher] Poll loop error:', error);
      this.events.emit('review-watcher:error', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Stop the review watcher
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    this.events.emit('review-watcher:stopped', {
      message: 'Review watcher stopped',
    });

    console.log('[ReviewWatcher] Stopped');
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    watchedTasks: number;
    config: ReviewWatcherConfig;
  } {
    return {
      isRunning: this.isRunning,
      watchedTasks: this.watchedTasks.size,
      config: this.config,
    };
  }

  /**
   * Get all watched tasks
   */
  getWatchedTasks(): ReviewTask[] {
    return Array.from(this.watchedTasks.values());
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Main polling loop
   */
  private async pollLoop(): Promise<void> {
    while (
      this.isRunning &&
      this.abortController &&
      !this.abortController.signal.aborted
    ) {
      try {
        await this.checkForInReviewTasks();
        await this.processWatchedTasks();
      } catch (error) {
        console.error('[ReviewWatcher] Poll error:', error);
      }

      // Wait for next poll
      await this.sleep(this.config.pollIntervalMs, this.abortController.signal);
    }

    this.isRunning = false;
    console.log('[ReviewWatcher] Poll loop ended');
  }

  /**
   * Check for new inreview tasks
   */
  private async checkForInReviewTasks(): Promise<void> {
    try {
      // Query Vibe Kanban for tasks with status 'inreview'
      const inReviewTasks = await this.listVibeKanbanTasks('inreview');

      for (const task of inReviewTasks) {
        // Skip if already watching
        if (this.watchedTasks.has(task.id)) {
          continue;
        }

        // Add to watched tasks
        const reviewTask: ReviewTask = {
          id: task.id,
          projectId: task.projectId,
          status: 'inreview',
          iterationCount: 0,
          inReviewSince: new Date(),
          blockingCommentCount: 0,
          suggestionCount: 0,
        };

        this.watchedTasks.set(task.id, reviewTask);

        this.events.emit('review-watcher:task-found', {
          taskId: task.id,
          projectId: task.projectId,
        });

        console.log(`[ReviewWatcher] Found inreview task: ${task.id}`);
      }
    } catch (error) {
      console.error('[ReviewWatcher] Failed to check for inreview tasks:', error);
    }
  }

  /**
   * Process all watched tasks
   */
  private async processWatchedTasks(): Promise<void> {
    const tasksToProcess = Array.from(this.watchedTasks.values());

    for (const task of tasksToProcess) {
      try {
        await this.processTask(task);
      } catch (error) {
        console.error(`[ReviewWatcher] Error processing task ${task.id}:`, error);
      }
    }
  }

  /**
   * Process a single watched task
   */
  private async processTask(task: ReviewTask): Promise<void> {
    // Fetch latest comments for this task
    const comments = await this.fetchComments(task);

    // Classify comments
    const blockingComments = comments.filter((c) => c.isBlocking);
    const suggestions = comments.filter((c) => !c.isBlocking);

    // Update counts
    task.blockingCommentCount = blockingComments.length;
    task.suggestionCount = suggestions.length;
    task.lastCommentTime =
      comments.length > 0
        ? new Date(Math.max(...comments.map((c) => c.timestamp.getTime())))
        : task.lastCommentTime;

    // Check for auto-approval timeout
    const timeInReview = Date.now() - task.inReviewSince.getTime();
    const hasBlockingComments = blockingComments.length > 0;
    const hasRecentActivity = task.lastCommentTime
      ? Date.now() - task.lastCommentTime.getTime() < this.config.autoApproveTimeoutMs
      : false;

    if (!hasBlockingComments && !hasRecentActivity && timeInReview > this.config.autoApproveTimeoutMs) {
      // Auto-approve
      await this.autoApproveTask(task);
      return;
    }

    // If blocking comments exist, start iteration
    if (hasBlockingComments) {
      await this.startIteration(task, blockingComments);
      return;
    }

    // Emit status update
    this.events.emit('review-watcher:task-status', {
      taskId: task.id,
      blockingCount: task.blockingCommentCount,
      suggestionCount: task.suggestionCount,
      timeInReview: Math.floor(timeInReview / 1000),
    });
  }

  /**
   * Auto-approve a task (no blocking comments, timeout reached)
   */
  private async autoApproveTask(task: ReviewTask): Promise<void> {
    console.log(`[ReviewWatcher] Auto-approving task ${task.id}`);

    try {
      // Update Vibe Kanban task status
      await this.updateVibeKanbanTaskStatus(task.id, 'done');

      // Remove from watched tasks
      this.watchedTasks.delete(task.id);

      this.events.emit('review-watcher:task-approved', {
        taskId: task.id,
        reason: 'timeout',
        timeInReview: Date.now() - task.inReviewSince.getTime(),
      });
    } catch (error) {
      console.error(`[ReviewWatcher] Failed to auto-approve task ${task.id}:`, error);
    }
  }

  /**
   * Start iteration workspace for a task with blocking comments
   */
  private async startIteration(task: ReviewTask, comments: ReviewComment[]): Promise<void> {
    // Check max iterations
    if (task.iterationCount >= this.config.maxIterations) {
      await this.escalateToHuman(task, comments);
      return;
    }

    console.log(
      `[ReviewWatcher] Starting iteration ${task.iterationCount + 1} for task ${task.id}`
    );

    try {
      // Update task status
      task.status = 'iterating';
      task.iterationCount++;

      // Start workspace session via Vibe Kanban MCP
      await this.startWorkspaceSession(task, comments);

      this.events.emit('review-watcher:iteration-started', {
        taskId: task.id,
        iteration: task.iterationCount,
        commentCount: comments.length,
      });
    } catch (error) {
      console.error(`[ReviewWatcher] Failed to start iteration for task ${task.id}:`, error);
      task.status = 'inreview';
    }
  }

  /**
   * Escalate to human (max iterations reached)
   */
  private async escalateToHuman(task: ReviewTask, comments: ReviewComment[]): Promise<void> {
    console.log(`[ReviewWatcher] Escalating task ${task.id} to human (max iterations reached)`);

    try {
      // Update Vibe Kanban task status to indicate human intervention needed
      await this.updateVibeKanbanTaskStatus(task.id, 'inreview');
      await this.addVibeKanbanTaskComment(
        task.id,
        `⚠️ Maximum iterations (${this.config.maxIterations}) reached. Human intervention required.\n\n` +
          `Blocking comments:\n${comments.map((c) => `- ${c.content}`).join('\n')}`
      );

      // Remove from watched tasks (human will handle)
      this.watchedTasks.delete(task.id);

      this.events.emit('review-watcher:task-escalated', {
        taskId: task.id,
        iterationCount: task.iterationCount,
        commentCount: comments.length,
      });
    } catch (error) {
      console.error(`[ReviewWatcher] Failed to escalate task ${task.id}:`, error);
    }
  }

  /**
   * Fetch comments from all sources for a task
   */
  private async fetchComments(task: ReviewTask): Promise<ReviewComment[]> {
    const comments: ReviewComment[] = [];

    try {
      // Fetch from Vibe Kanban
      const vkComments = await this.fetchVibeKanbanComments(task);
      comments.push(...vkComments);

      // TODO: Fetch from GitHub PRs (if linked)
      // const githubComments = await this.fetchGitHubComments(task);
      // comments.push(...githubComments);

      // TODO: Fetch from Beads (if linked)
      // const beadsComments = await this.fetchBeadsComments(task);
      // comments.push(...beadsComments);
    } catch (error) {
      console.error(`[ReviewWatcher] Failed to fetch comments for task ${task.id}:`, error);
    }

    return comments;
  }

  /**
   * Classify a comment as blocking or suggestion
   */
  private classifyComment(content: string): boolean {
    const lowerContent = content.toLowerCase();

    // Blocking keywords
    const blockingKeywords = [
      'must fix',
      'blocking',
      'critical',
      'failed',
      'error',
      'bug',
      'incorrect',
      'wrong',
      'missing',
      'broken',
      'doesn\'t work',
      'does not work',
      'needs to be fixed',
      'required change',
    ];

    // Suggestion keywords
    const suggestionKeywords = [
      'suggest',
      'consider',
      'could improve',
      'optional',
      'nice to have',
      'minor',
      'nitpick',
      'prefer',
    ];

    // Check for blocking keywords
    for (const keyword of blockingKeywords) {
      if (lowerContent.includes(keyword)) {
        return true;
      }
    }

    // If has suggestion keywords, likely not blocking
    for (const keyword of suggestionKeywords) {
      if (lowerContent.includes(keyword)) {
        return false;
      }
    }

    // Default: treat as blocking if uncertain
    return true;
  }

  // ========================================================================
  // Vibe Kanban MCP Integration (placeholder)
  // ========================================================================

  /**
   * Check if Vibe Kanban MCP server is available
   */
  private async checkVibeKanbanMCP(): Promise<boolean> {
    // TODO: Implement actual MCP availability check
    // For now, return true to allow the service to start
    // In production, this would call the MCP server's health check
    return true;
  }

  /**
   * List tasks from Vibe Kanban
   */
  private async listVibeKanbanTasks(status: string): Promise<Array<{ id: string; projectId: string }>> {
    // TODO: Implement via mcp__vibe_kanban__list_tasks
    // This is a placeholder - actual implementation will use the MCP tool
    console.log(`[ReviewWatcher] Listing Vibe Kanban tasks with status: ${status}`);
    return [];
  }

  /**
   * Fetch comments from Vibe Kanban for a task
   */
  private async fetchVibeKanbanComments(task: ReviewTask): Promise<ReviewComment[]> {
    // TODO: Implement via MCP tool
    // Placeholder - would fetch from Vibe Kanban's comment system
    return [];
  }

  /**
   * Update task status in Vibe Kanban
   */
  private async updateVibeKanbanTaskStatus(taskId: string, status: string): Promise<void> {
    // TODO: Implement via mcp__vibe_kanban__update_task
    console.log(`[ReviewWatcher] Updating task ${taskId} status to ${status}`);
  }

  /**
   * Add comment to task in Vibe Kanban
   */
  private async addVibeKanbanTaskComment(taskId: string, comment: string): Promise<void> {
    // TODO: Implement via MCP tool
    console.log(`[ReviewWatcher] Adding comment to task ${taskId}: ${comment}`);
  }

  /**
   * Start workspace session via Vibe Kanban
   */
  private async startWorkspaceSession(task: ReviewTask, comments: ReviewComment[]): Promise<void> {
    // TODO: Implement via mcp__vibe_kanban__start_workspace_session
    console.log(
      `[ReviewWatcher] Starting workspace session for task ${task.id} with ${comments.length} comments`
    );

    // Build feedback prompt from blocking comments
    const feedback = comments
      .map((c) => `- ${c.author}: ${c.content}`)
      .join('\n');

    const prompt = `## Review Feedback

The following blocking issues were identified during review:

${feedback}

Please address these issues and submit an updated implementation.`;

    // Would call MCP tool to start workspace with this prompt
    // await mcp__vibe_kanban__start_workspace_session({
    //   task_id: task.id,
    //   executor: 'CLAUDE_CODE',
    //   repos: [...],
    // });

    console.log(`[ReviewWatcher] Workspace prompt: ${prompt}`);
  }

  // ========================================================================
  // Utilities
  // ========================================================================

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      if (signal?.aborted) {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
        return;
      }

      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new Error('Aborted'));
        },
        { once: true }
      );
    });
  }
}
