/**
 * Beads Service
 *
 * Wraps the Beads CLI (bd) to provide programmatic access to Beads functionality.
 * Beads is a dependency-aware issue tracker that gives AI agents long-term task memory.
 *
 * HYBRID-M2: Enhanced with event emission for orchestration and cross-feature coordination.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import fsCallback from 'fs';
import type { EventEmitter } from '../lib/events.js';
import type { EventType } from '@automaker/types';
import type {
  BeadsIssue,
  BeadsStats,
  CreateBeadsIssueInput,
  UpdateBeadsIssueInput,
  ListBeadsIssuesFilters,
} from '@automaker/types';
import { safeJsonParse } from '../lib/json-parser.js';

const execFileAsync = promisify(execFile);

export interface BeadsDependency {
  from: string;
  to: string;
  type: 'blocks' | 'related' | 'parent' | 'discovered-from';
}

export interface CrossFeatureResolution {
  featureId: string;
  blockingFeatures: string[];
  readyToStart: boolean;
  resolvedAt: string;
}

export class BeadsService {
  // Note: watchTimeout removed from instance to prevent race conditions
  // when watchDatabase is called multiple times on the same instance
  private eventEmitter?: EventEmitter;

  /**
   * Set the event emitter for broadcasting Beads events
   */
  setEventEmitter(emitter: EventEmitter): void {
    this.eventEmitter = emitter;
  }

  /**
   * Emit a Beads event if emitter is available
   */
  private emitEvent(type: EventType, payload: unknown): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(type, payload);
    }
  }

  /**
   * Check if bd CLI is installed
   */
  async isBeadsInstalled(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('which', ['bd']);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get bd CLI version
   */
  async getBeadsVersion(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('bd', ['--version']);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Validate Beads in a project
   */
  async validateBeadsInProject(projectPath: string): Promise<{
    installed: boolean;
    initialized: boolean;
    version?: string;
    error?: string;
    cliPath?: string;
    dbPath?: string;
    dbExists?: boolean;
    canInitialize?: boolean;
  }> {
    const installed = await this.isBeadsInstalled();
    if (!installed) {
      return { installed: false, initialized: false, error: 'bd CLI not installed' };
    }

    const version = await this.getBeadsVersion();
    const cliPath = await this.getBeadsCliPath();
    const dbPath = this.getDatabasePath(projectPath);
    const dbExists = await this.checkDatabaseExists(dbPath);
    const canInitialize = await this.canInitializeBeads(projectPath);

    return {
      installed: true,
      initialized: dbExists,
      version: version ?? undefined,
      cliPath,
      dbPath,
      dbExists,
      canInitialize,
    };
  }

  /**
   * Get the path to the bd CLI executable
   */
  private async getBeadsCliPath(): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync('which', ['bd']);
      return stdout.trim();
    } catch {
      return undefined;
    }
  }

  /**
   * Check if the database file exists
   */
  private async checkDatabaseExists(dbPath: string): Promise<boolean> {
    try {
      await fs.access(dbPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if Beads can be initialized in the project directory
   */
  private async canInitializeBeads(projectPath: string): Promise<boolean> {
    try {
      const beadsDir = path.join(projectPath, '.beads');
      await fs.access(beadsDir, fs.constants.W_OK);
      return true;
    } catch {
      // Directory doesn't exist or isn't writable
      // Check if parent directory is writable
      try {
        await fs.access(projectPath, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Initialize Beads in a project
   */
  async initializeBeads(projectPath: string): Promise<void> {
    const beadsDir = path.join(projectPath, '.beads');

    try {
      await fs.access(beadsDir);
      // Already initialized
      return;
    } catch {
      // Not initialized, run bd init
      await execFileAsync('bd', ['init', '--quiet'], { cwd: projectPath });
    }
  }

  /**
   * Get the database path for a project
   */
  getDatabasePath(projectPath: string): string {
    return path.join(projectPath, '.beads/beads.db');
  }

  /**
   * List all issues in a project
   */
  async listIssues(projectPath: string, filters?: ListBeadsIssuesFilters): Promise<BeadsIssue[]> {
    try {
      const args = ['list', '--json'];

      // Apply filters
      if (filters?.status?.length) {
        args.push('--status', filters.status.join(','));
      }
      if (filters?.type?.length) {
        args.push('--type', filters.type.join(','));
      }
      if (filters?.labels?.length) {
        args.push('--label', filters.labels.join(','));
      }
      if (filters?.priorityMin !== undefined) {
        args.push('--priority-min', String(filters.priorityMin));
      }
      if (filters?.priorityMax !== undefined) {
        args.push('--priority-max', String(filters.priorityMax));
      }
      if (filters?.titleContains) {
        args.push('--title-contains', filters.titleContains);
      }
      if (filters?.descContains) {
        args.push('--desc-contains', filters.descContains);
      }
      if (filters?.ids?.length) {
        args.push('--id', filters.ids.join(','));
      }

      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issues = safeJsonParse<BeadsIssue[]>(stdout, 'listIssues');
      return issues;
    } catch (error) {
      // If beads not initialized, return empty array
      if (this.isNotInitializedError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a single issue by ID
   */
  async getIssue(projectPath: string, issueId: string): Promise<BeadsIssue | null> {
    try {
      const { stdout } = await execFileAsync('bd', ['show', issueId, '--json'], {
        cwd: projectPath,
      });
      const issue = safeJsonParse<BeadsIssue>(stdout, 'getIssue');
      return issue;
    } catch (error) {
      throw new Error(`Failed to get issue ${issueId}: ${error}`);
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(projectPath: string, input: CreateBeadsIssueInput): Promise<BeadsIssue> {
    try {
      const args = ['create', input.title, '--json'];

      if (input.description) {
        args.push('--description', input.description);
      }
      if (input.type) {
        args.push('--type', input.type);
      }
      if (input.priority !== undefined) {
        args.push('--priority', String(input.priority));
      }
      if (input.labels?.length) {
        args.push('--labels', input.labels.join(','));
      }
      if (input.parentIssueId) {
        args.push('--parent', input.parentIssueId);
      }

      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issue = safeJsonParse<BeadsIssue>(stdout, 'createIssue');

      // Emit event for orchestration
      this.emitEvent('beads:issue-created', { issue, projectPath });

      // Check if this is an epic starting
      if (input.type === 'epic') {
        this.emitEvent('beads:epic-started', { issue, projectPath });
      }
      return issue;
    } catch (error) {
      throw new Error(`Failed to create issue: ${error}`);
    }
  }

  /**
   * Update an existing issue
   */
  async updateIssue(
    projectPath: string,
    issueId: string,
    updates: UpdateBeadsIssueInput
  ): Promise<BeadsIssue> {
    try {
      const args = ['update', issueId, '--json'];

      if (updates.title) {
        args.push('--title', updates.title);
      }
      if (updates.description) {
        args.push('--description', updates.description);
      }
      if (updates.status) {
        args.push('--status', updates.status);
      }
      if (updates.type) {
        args.push('--type', updates.type);
      }
      if (updates.priority !== undefined) {
        args.push('--priority', String(updates.priority));
      }
      if (updates.labels) {
        args.push('--labels', updates.labels.join(','));
      }

      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issue = safeJsonParse<BeadsIssue>(stdout, 'updateIssue');

      // Emit event for orchestration
      this.emitEvent('beads:issue-updated', { issue, projectPath, updates });

      // Check if epic completed
      if (updates.status === 'closed' && issue.type === 'epic') {
        this.emitEvent('beads:epic-completed', { issue, projectPath });
      }

      // Check task status changes
      if (updates.status === 'in_progress') {
        this.emitEvent('beads:task-ready', { issue, projectPath });
      } else if (updates.status === 'open') {
        this.emitEvent('beads:task-blocked', { issue, projectPath });
      }
      return issue;
    } catch (error) {
      throw new Error(`Failed to update issue ${issueId}: ${error}`);
    }
  }

  /**
   * Delete an issue
   */
  async deleteIssue(projectPath: string, issueId: string, force = false): Promise<void> {
    try {
      const args = ['delete', issueId];
      if (force) {
        args.push('--force');
      }
      await execFileAsync('bd', args, { cwd: projectPath });

      // Emit event for orchestration
      this.emitEvent('beads:issue-deleted', { issueId, projectPath, force });
    } catch (error) {
      throw new Error(`Failed to delete issue ${issueId}: ${error}`);
    }
  }

  /**
   * Add a dependency between two issues
   */
  async addDependency(
    projectPath: string,
    issueId: string,
    depId: string,
    type: 'blocks' | 'related' | 'parent' | 'discovered-from'
  ): Promise<void> {
    try {
      const args = ['dep', 'add', issueId, depId, '--type', type];
      await execFileAsync('bd', args, { cwd: projectPath });

      // Emit event for orchestration
      this.emitEvent('beads:dependency-added', { from: issueId, to: depId, type, projectPath });
    } catch (error) {
      throw new Error(`Failed to add dependency: ${error}`);
    }
  }

  /**
   * Remove a dependency between two issues
   */
  async removeDependency(projectPath: string, issueId: string, depId: string): Promise<void> {
    try {
      const args = ['dep', 'remove', issueId, depId];
      await execFileAsync('bd', args, { cwd: projectPath });

      // Emit event for orchestration
      this.emitEvent('beads:dependency-removed', { from: issueId, to: depId, projectPath });
    } catch (error) {
      throw new Error(`Failed to remove dependency: ${error}`);
    }
  }

  /**
   * Get ready work (issues with no open blockers)
   */
  async getReadyWork(projectPath: string, limit?: number): Promise<BeadsIssue[]> {
    try {
      const args = ['ready', '--json'];
      if (limit) {
        args.push('--limit', String(limit));
      }
      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issues = safeJsonParse<BeadsIssue[]>(stdout, 'getReadyWork');
      return issues;
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get statistics about the database
   */
  async getStats(projectPath: string): Promise<BeadsStats> {
    try {
      const { stdout } = await execFileAsync('bd', ['stats', '--json'], { cwd: projectPath });
      const stats = safeJsonParse<BeadsStats>(stdout, 'getStats');
      return stats;
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return {
          totalIssues: 0,
          openIssues: 0,
          inProgressIssues: 0,
          closedIssues: 0,
          readyIssues: 0,
          blockedIssues: 0,
        };
      }
      throw error;
    }
  }

  /**
   * Sync the database (flush changes to JSONL)
   */
  async sync(projectPath: string): Promise<void> {
    try {
      await execFileAsync('bd', ['sync'], { cwd: projectPath });
    } catch (error) {
      throw new Error(`Failed to sync database: ${error}`);
    }
  }

  /**
   * Search issues by text query
   */
  async searchIssues(
    projectPath: string,
    query: string,
    options?: {
      limit?: number;
      inComments?: boolean;
    }
  ): Promise<BeadsIssue[]> {
    try {
      const args = ['search', query, '--json'];
      if (options?.limit) {
        args.push('--limit', String(options.limit));
      }
      if (options?.inComments) {
        args.push('--comments');
      }

      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issues = safeJsonParse<BeadsIssue[]>(stdout, 'searchIssues');
      return issues;
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get blocked issues (issues with open blockers)
   */
  async getBlockedIssues(projectPath: string): Promise<BeadsIssue[]> {
    try {
      const { stdout } = await execFileAsync('bd', ['blocked', '--json'], {
        cwd: projectPath,
      });
      const issues = safeJsonParse<BeadsIssue[]>(stdout, 'getBlockedIssues');
      return issues;
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get stale issues (not updated recently)
   */
  async getStaleIssues(projectPath: string, days?: number): Promise<BeadsIssue[]> {
    try {
      const args = ['stale', '--json'];
      if (days) {
        args.push('--days', String(days));
      }

      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issues = safeJsonParse<BeadsIssue[]>(stdout, 'getStaleIssues');
      return issues;
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Watch the database for changes
   *
   * Uses a local timeout variable (not instance property) to avoid race conditions
   * when watchDatabase is called multiple times concurrently on the same instance.
   */
  async watchDatabase(projectPath: string, callback: () => void): Promise<() => void> {
    const dbPath = this.getDatabasePath(projectPath);

    try {
      let watchTimeout: NodeJS.Timeout | undefined;

      const watcher = fsCallback.watch(dbPath, () => {
        // Debounce rapid changes
        if (watchTimeout) {
          clearTimeout(watchTimeout);
        }
        watchTimeout = setTimeout(() => {
          try {
            callback();
          } catch (error) {
            // Log error but don't stop watching
            console.error('[BeadsService] Error in watchDatabase callback:', error);
          }
        }, 500);
      });

      // Return cleanup function
      return () => {
        watcher.close();
        if (watchTimeout) {
          clearTimeout(watchTimeout);
        }
      };
    } catch (error) {
      // If watching fails (e.g., database doesn't exist), return no-op cleanup
      console.error('[BeadsService] Failed to watch database:', error);
      return () => {};
    }
  }

  /**
   * Get all dependencies for an issue (both incoming and outgoing)
   */
  async getDependencies(
    projectPath: string,
    issueId: string
  ): Promise<{
    blocks: string[];
    blockedBy: string[];
    related: string[];
    parent: string | null;
    children: string[];
  }> {
    try {
      const issues = await this.listIssues(projectPath);

      // Get the issue to find its outgoing dependencies
      const issue = await this.getIssue(projectPath, issueId);

      if (!issue) {
        throw new Error(`Issue ${issueId} not found`);
      }

      // Parse dependencies from the issue
      const blocks: string[] =
        issue.dependencies?.filter((d) => d.type === 'blocks').map((d) => d.to || '') || [];
      const related: string[] =
        issue.dependencies?.filter((d) => d.type === 'related').map((d) => d.to || '') || [];
      const parent = issue.parentId || null;

      // Find incoming dependencies (issues that block this one)
      const blockedBy: string[] = [];
      const children: string[] = [];

      for (const other of issues) {
        if (other.id === issueId) continue;

        // Check if other issue blocks this one
        if (other.dependencies?.some((d) => d.type === 'blocks' && d.to === issueId)) {
          blockedBy.push(other.id);
        }

        // Check if other issue is a child of this one
        if (other.parentId === issueId) {
          children.push(other.id);
        }
      }

      return { blocks, blockedBy, related, parent, children };
    } catch (error) {
      throw new Error(`Failed to get dependencies for ${issueId}: ${error}`);
    }
  }

  /**
   * Resolve cross-feature dependencies by analyzing blocking relationships
   * Returns which features are blocked by which other features
   */
  async resolveCrossFeatureDependencies(
    projectPath: string,
    featureToIssueMap: Map<string, string> // featureId -> issueId
  ): Promise<CrossFeatureResolution[]> {
    try {
      const resolutions: CrossFeatureResolution[] = [];

      for (const [featureId, issueId] of featureToIssueMap.entries()) {
        const dependencies = await this.getDependencies(projectPath, issueId);

        // Find which features are blocking this feature
        const blockingFeatures: string[] = [];

        for (const blockedById of dependencies.blockedBy) {
          // Find which feature this blocking issue belongs to
          for (const [otherFeatureId, otherIssueId] of featureToIssueMap.entries()) {
            if (otherIssueId === blockedById) {
              blockingFeatures.push(otherFeatureId);
              break;
            }
          }
        }

        const readyToStart = blockingFeatures.length === 0;

        resolutions.push({
          featureId,
          blockingFeatures,
          readyToStart,
          resolvedAt: new Date().toISOString(),
        });
      }

      // Emit event for orchestration
      this.emitEvent('beads:cross-feature-resolved', { resolutions, projectPath });

      return resolutions;
    } catch (error) {
      throw new Error(`Failed to resolve cross-feature dependencies: ${error}`);
    }
  }

  /**
   * Get epic-level task coordination information
   * Returns epics with their subtasks and completion status
   */
  async getEpicCoordination(projectPath: string): Promise<{
    epics: Array<{
      epic: BeadsIssue;
      subtasks: BeadsIssue[];
      completedCount: number;
      totalCount: number;
      percentComplete: number;
      isComplete: boolean;
    }>;
    readyEpics: string[]; // Epic IDs that have ready tasks
  }> {
    try {
      const allIssues = await this.listIssues(projectPath);

      // Get all epics
      const epics = allIssues.filter((i: BeadsIssue) => i.type === 'epic');

      const epicData = await Promise.all(
        epics.map(async (epic: BeadsIssue) => {
          // Get subtasks (children)
          const subtasks = allIssues.filter((i: BeadsIssue) => i.parentId === epic.id);

          const completedCount = subtasks.filter((i: BeadsIssue) => i.status === 'closed').length;
          const totalCount = subtasks.length;
          const percentComplete = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
          const isComplete = completedCount === totalCount && totalCount > 0;

          return {
            epic,
            subtasks,
            completedCount,
            totalCount,
            percentComplete,
            isComplete,
          };
        })
      );

      // Find epics with ready tasks (no open blockers)
      const readyEpics: string[] = [];
      for (const epic of epics) {
        const readyWork = await this.getReadyWork(projectPath);
        const hasReadyTask = readyWork.some((task: BeadsIssue) => task.parentId === epic.id);
        if (hasReadyTask) {
          readyEpics.push(epic.id);
        }
      }

      return { epics: epicData, readyEpics };
    } catch (error) {
      throw new Error(`Failed to get epic coordination: ${error}`);
    }
  }

  /**
   * Automatically update issue status based on dependencies
   * If all blockers are closed, set to open (ready to work)
   * If has open blockers, set to blocked (if supported) or keep open
   */
  async automateIssueStatus(projectPath: string, issueId: string): Promise<BeadsIssue> {
    try {
      const issue = await this.getIssue(projectPath, issueId);
      const dependencies = await this.getDependencies(projectPath, issueId);

      if (!issue) {
        throw new Error(`Issue ${issueId} not found`);
      }

      // Check if all blocking issues are closed
      const blockingIssues = await Promise.all(
        dependencies.blockedBy.map((id) => this.getIssue(projectPath, id))
      );

      const hasOpenBlockers = blockingIssues.some((i) => i?.status !== 'closed');

      // Auto-update status if needed
      if (!hasOpenBlockers && issue.status === 'blocked') {
        // All blockers resolved, ready to work
        return await this.updateIssue(projectPath, issueId, { status: 'open' });
      } else if (hasOpenBlockers && issue.status === 'in_progress') {
        // New blockers appeared, should wait
        return await this.updateIssue(projectPath, issueId, { status: 'open' });
      }

      return issue;
    } catch (error) {
      throw new Error(`Failed to automate issue status: ${error}`);
    }
  }

  /**
   * Check if error is due to beads not being initialized
   */
  private isNotInitializedError(error: unknown): boolean {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return (
      errorMsg.includes('no such file') ||
      errorMsg.includes('database not found') ||
      errorMsg.includes('not initialized')
    );
  }
}
