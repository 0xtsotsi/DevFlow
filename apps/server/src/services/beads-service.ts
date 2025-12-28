/**
 * Beads Service
 *
 * Wraps the Beads CLI (bd) to provide programmatic access to Beads functionality.
 * Beads is a dependency-aware issue tracker that gives AI agents long-term task memory.
 *
 * HYBRID-M2: Enhanced with event emission for orchestration and cross-feature coordination.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import type { EventEmitter } from '../lib/events.js';
import type { EventType } from '@automaker/types';

const execAsync = promisify(exec);

export interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  status: string;
  type: string;
  priority: number;
  labels?: string[];
  created_at?: string;
  updated_at?: string;
}

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
  private watchTimeout?: NodeJS.Timeout;
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
      const { stdout } = await execAsync('which bd');
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
      const { stdout } = await execAsync('bd --version');
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
  }> {
    const installed = await this.isBeadsInstalled();
    if (!installed) {
      return { installed: false, initialized: false, error: 'bd CLI not installed' };
    }

    const version = await this.getBeadsVersion();
    const dbPath = this.getDatabasePath(projectPath);

    try {
      await fs.access(dbPath);
      return { installed: true, initialized: true, version };
    } catch {
      return { installed: true, initialized: false, version };
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
      await execAsync('bd init --quiet', { cwd: projectPath });
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
  async listIssues(
    projectPath: string,
    filters?: {
      status?: string[];
      type?: string[];
      labels?: string[];
      priorityMin?: number;
      priorityMax?: number;
      titleContains?: string;
      descContains?: string;
      ids?: string[];
    }
  ): Promise<any[]> {
    try {
      let command = 'bd list --json';

      // Apply filters
      if (filters?.status?.length) {
        command += ` --status ${filters.status.join(',')}`;
      }
      if (filters?.type?.length) {
        command += ` --type ${filters.type.join(',')}`;
      }
      if (filters?.labels?.length) {
        command += ` --label ${filters.labels.join(',')}`;
      }
      if (filters?.priorityMin !== undefined) {
        command += ` --priority-min ${filters.priorityMin}`;
      }
      if (filters?.priorityMax !== undefined) {
        command += ` --priority-max ${filters.priorityMax}`;
      }
      if (filters?.titleContains) {
        command += ` --title-contains "${filters.titleContains}"`;
      }
      if (filters?.descContains) {
        command += ` --desc-contains "${filters.descContains}"`;
      }
      if (filters?.ids?.length) {
        command += ` --id ${filters.ids.join(',')}`;
      }

      const { stdout } = await execAsync(command, { cwd: projectPath });
      const issues = JSON.parse(stdout);
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
  async getIssue(projectPath: string, issueId: string): Promise<any> {
    try {
      const { stdout } = await execAsync(`bd show ${issueId} --json`, {
        cwd: projectPath,
      });
      const issue = JSON.parse(stdout);
      return issue;
    } catch (error) {
      throw new Error(`Failed to get issue ${issueId}: ${error}`);
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(
    projectPath: string,
    input: {
      title: string;
      description?: string;
      type?: string;
      priority?: number;
      labels?: string[];
    }
  ): Promise<BeadsIssue> {
    try {
      let command = `bd create "${input.title}" --json`;

      if (input.description) {
        command += ` --description "${input.description}"`;
      }
      if (input.type) {
        command += ` --type ${input.type}`;
      }
      if (input.priority !== undefined) {
        command += ` --priority ${input.priority}`;
      }
      if (input.labels?.length) {
        command += ` --labels ${input.labels.join(',')}`;
      }

      const { stdout } = await execAsync(command, { cwd: projectPath });
      const issue = JSON.parse(stdout);

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
    updates: {
      title?: string;
      description?: string;
      status?: string;
      type?: string;
      priority?: number;
      labels?: string[];
    }
  ): Promise<BeadsIssue> {
    try {
      let command = `bd update ${issueId} --json`;

      if (updates.title) {
        command += ` --title "${updates.title}"`;
      }
      if (updates.description) {
        command += ` --description "${updates.description}"`;
      }
      if (updates.status) {
        command += ` --status ${updates.status}`;
      }
      if (updates.type) {
        command += ` --type ${updates.type}`;
      }
      if (updates.priority !== undefined) {
        command += ` --priority ${updates.priority}`;
      }
      if (updates.labels) {
        command += ` --labels ${updates.labels.join(',')}`;
      }

      const { stdout } = await execAsync(command, { cwd: projectPath });
      const issue = JSON.parse(stdout);

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
      const command = force ? `bd delete ${issueId} --force` : `bd delete ${issueId}`;
      await execAsync(command, { cwd: projectPath });

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
      const command = `bd dep add ${issueId} ${depId} --type ${type}`;
      await execAsync(command, { cwd: projectPath });

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
      const command = `bd dep remove ${issueId} ${depId}`;
      await execAsync(command, { cwd: projectPath });

      // Emit event for orchestration
      this.emitEvent('beads:dependency-removed', { from: issueId, to: depId, projectPath });
    } catch (error) {
      throw new Error(`Failed to remove dependency: ${error}`);
    }
  }

  /**
   * Get ready work (issues with no open blockers)
   */
  async getReadyWork(projectPath: string, limit?: number): Promise<any[]> {
    try {
      let command = 'bd ready --json';
      if (limit) {
        command += ` --limit ${limit}`;
      }
      const { stdout } = await execAsync(command, { cwd: projectPath });
      const issues = JSON.parse(stdout);
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
  async getStats(projectPath: string): Promise<any> {
    try {
      const { stdout } = await execAsync('bd stats --json', { cwd: projectPath });
      const stats = JSON.parse(stdout);
      return stats;
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return {
          totalIssues: 0,
          openIssues: 0,
          inProgressIssues: 0,
          closedIssues: 0,
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
      await execAsync('bd sync', { cwd: projectPath });
    } catch (error) {
      throw new Error(`Failed to sync database: ${error}`);
    }
  }

  /**
   * Watch the database for changes
   */
  async watchDatabase(projectPath: string, callback: () => void): Promise<() => void> {
    const dbPath = this.getDatabasePath(projectPath);

    try {
      const watcher = fs.watch(dbPath, () => {
        // Debounce rapid changes
        if (this.watchTimeout) {
          clearTimeout(this.watchTimeout);
        }
        this.watchTimeout = setTimeout(() => {
          callback();
        }, 500);
      });

      // Return cleanup function
      return () => {
        watcher.close();
        if (this.watchTimeout) {
          clearTimeout(this.watchTimeout);
        }
      };
    } catch (error) {
      // If watching fails (e.g., database doesn't exist), return no-op cleanup
      return () => {};
    }
  }

  /**
   * Get all dependencies for an issue (both incoming and outgoing)
   */
  async getDependencies(projectPath: string, issueId: string): Promise<{
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

      // Parse dependencies from the issue
      const blocks: string[] = issue.dependencies?.filter((d: any) => d.type === 'blocks').map((d: any) => d.to) || [];
      const related: string[] = issue.dependencies?.filter((d: any) => d.type === 'related').map((d: any) => d.to) || [];
      const parent = issue.parentId || null;

      // Find incoming dependencies (issues that block this one)
      const blockedBy: string[] = [];
      const children: string[] = [];

      for (const other of issues) {
        if (other.id === issueId) continue;

        // Check if other issue blocks this one
        if (other.dependencies?.some((d: any) => d.type === 'blocks' && d.to === issueId)) {
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
      const epics = allIssues.filter((i: any) => i.type === 'epic');

      const epicData = await Promise.all(
        epics.map(async (epic: BeadsIssue) => {
          // Get subtasks (children)
          const subtasks = allIssues.filter((i: any) => i.parentId === epic.id);

          const completedCount = subtasks.filter((i: any) => i.status === 'closed').length;
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
        const hasReadyTask = readyWork.some((task: any) => task.parentId === epic.id);
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

      // Check if all blocking issues are closed
      const blockingIssues = await Promise.all(
        dependencies.blockedBy.map((id) => this.getIssue(projectPath, id))
      );

      const hasOpenBlockers = blockingIssues.some((i) => i.status !== 'closed');

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
  private isNotInitializedError(error: any): boolean {
    const errorMsg = error?.message || error?.toString() || '';
    return (
      errorMsg.includes('no such file') ||
      errorMsg.includes('database not found') ||
      errorMsg.includes('not initialized')
    );
  }
}
