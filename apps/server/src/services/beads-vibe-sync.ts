/**
 * Beads-VibeKanban Sync Service
 *
 * Synchronizes Beads issues with VibeKanban tasks for unified project tracking.
 * Provides bidirectional sync between local Beads database and remote VibeKanban.
 *
 * HYBRID-M2: Enables seamless integration between local issue tracking and remote kanban.
 */

import { BeadsService, type BeadsIssue } from './beads-service.js';
import { getVibeKanbanClient, type VibeKanbanTask } from './vibe-kanban-client.js';
import type { EventEmitter } from '../lib/events.js';
import fs from 'fs/promises';
import path from 'path';

// Status mapping between Beads and VibeKanban
const STATUS_MAPPING: Record<string, VibeKanbanTask['status']> = {
  open: 'todo',
  in_progress: 'inprogress',
  in_review: 'inreview',
  closed: 'done',
  blocked: 'todo',
  cancelled: 'cancelled',
};

const REVERSE_STATUS_MAPPING: Record<VibeKanbanTask['status'], string> = {
  todo: 'open',
  inprogress: 'in_progress',
  inreview: 'in_review',
  done: 'closed',
  cancelled: 'cancelled',
};

export interface SyncOptions {
  projectPath: string;
  vibeProjectId: string;
  autoSync?: boolean;
  syncInterval?: number; // milliseconds
  bidirectional?: boolean;
  issueLabelPrefix?: string; // e.g., "vk-" to tag synced issues
}

export interface SyncResult {
  beadsToVibe: {
    created: number;
    updated: number;
    failed: number;
  };
  vibeToBeads: {
    created: number;
    updated: number;
    failed: number;
  };
  syncedAt: string;
  duration: number;
}

export interface SyncMapping {
  beadsIssueId: string;
  vibeTaskId: string;
  lastSyncedAt: string;
  lastSyncDirection: 'beads-to-vibe' | 'vibe-to-beads' | 'bidirectional';
}

const MAPPINGS_FILE = '.beads/vibe-sync-mappings.json';

/**
 * Beads-VibeKanban Sync Service
 *
 * Manages bidirectional synchronization between Beads and VibeKanban.
 */
export class BeadsVibeSync {
  private beadsService: BeadsService;
  private eventEmitter: EventEmitter;
  private vibeClient = getVibeKanbanClient();
  private syncMappings: Map<string, SyncMapping> = new Map(); // beadsId -> mapping
  private syncInterval?: NodeJS.Timeout;
  private isSyncing = false;

  constructor(eventEmitter: EventEmitter, beadsService?: BeadsService) {
    this.eventEmitter = eventEmitter;
    this.beadsService = beadsService || new BeadsService();
  }

  /**
   * Initialize the sync service
   */
  async initialize(projectPath: string, vibeProjectId: string): Promise<void> {
    // Connect to VibeKanban
    await this.vibeClient.connect();

    // Set the project ID
    this.vibeClient.setProjectId(vibeProjectId);

    // Load existing mappings
    await this.loadMappings(projectPath);

    this.eventEmitter.emit('beads:sync-initialized', {
      timestamp: Date.now(),
      projectPath,
      vibeProjectId,
    });
  }

  /**
   * Perform a full bidirectional sync
   */
  async sync(options: SyncOptions): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    const startTime = Date.now();

    const result: SyncResult = {
      beadsToVibe: { created: 0, updated: 0, failed: 0 },
      vibeToBeads: { created: 0, updated: 0, failed: 0 },
      syncedAt: new Date().toISOString(),
      duration: 0,
    };

    try {
      // Sync Beads -> VibeKanban
      await this.syncBeadsToVibe(options, result);

      // Sync VibeKanban -> Beads (if bidirectional)
      if (options.bidirectional) {
        await this.syncVibeToBeads(options, result);
      }

      // Save mappings
      await this.saveMappings(options.projectPath);

      result.duration = Date.now() - startTime;

      this.eventEmitter.emit('beads:sync-completed', {
        timestamp: Date.now(),
        result,
      });

      return result;
    } catch (error) {
      this.eventEmitter.emit('beads:sync-error', {
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Start automatic sync at regular intervals
   */
  async startAutoSync(options: SyncOptions): Promise<void> {
    await this.initialize(options.projectPath, options.vibeProjectId);

    // Do initial sync
    await this.sync(options);

    // Set up interval
    const interval = options.syncInterval || 5 * 60 * 1000; // 5 minutes default
    this.syncInterval = setInterval(async () => {
      try {
        await this.sync(options);
      } catch (error) {
        console.error('[BeadsVibeSync] Auto-sync error:', error);
      }
    }, interval);

    this.eventEmitter.emit('beads:auto-sync-started', {
      timestamp: Date.now(),
      interval,
    });
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }

    this.eventEmitter.emit('beads:auto-sync-stopped', {
      timestamp: Date.now(),
    });
  }

  /**
   * Get VibeKanban task ID for a Beads issue
   */
  getVibeTaskId(beadsIssueId: string): string | undefined {
    return this.syncMappings.get(beadsIssueId)?.vibeTaskId;
  }

  /**
   * Get Beads issue ID for a VibeKanban task
   */
  getBeadsIssueId(vibeTaskId: string): string | undefined {
    for (const mapping of this.syncMappings.values()) {
      if (mapping.vibeTaskId === vibeTaskId) {
        return mapping.beadsIssueId;
      }
    }
    return undefined;
  }

  /**
   * Sync a single Beads issue to VibeKanban
   */
  async syncIssueToVibe(
    projectPath: string,
    issue: BeadsIssue,
    _vibeProjectId: string
  ): Promise<VibeKanbanTask | null> {
    try {
      // Check if already synced
      const existingMapping = this.syncMappings.get(issue.id);

      if (existingMapping) {
        // Update existing task
        await this.vibeClient.updateTask(existingMapping.vibeTaskId, {
          title: issue.title,
          description: issue.description,
        });

        existingMapping.lastSyncedAt = new Date().toISOString();
        existingMapping.lastSyncDirection = 'beads-to-vibe';

        return await this.vibeClient.getTask(existingMapping.vibeTaskId);
      } else {
        // Create new task
        const task = await this.vibeClient.createTask({
          title: issue.title,
          description: this.buildTaskDescription(issue),
        });

        // Store mapping
        this.syncMappings.set(issue.id, {
          beadsIssueId: issue.id,
          vibeTaskId: task.id,
          lastSyncedAt: new Date().toISOString(),
          lastSyncDirection: 'beads-to-vibe',
        });

        return task;
      }
    } catch (error) {
      console.error(`[BeadsVibeSync] Error syncing issue ${issue.id}:`, error);
      return null;
    }
  }

  /**
   * Update Beads issue status from VibeKanban
   */
  async updateIssueStatusFromVibe(
    projectPath: string,
    vibeTaskId: string,
    vibeStatus: VibeKanbanTask['status']
  ): Promise<void> {
    const beadsIssueId = this.getBeadsIssueId(vibeTaskId);
    if (!beadsIssueId) {
      return;
    }

    const beadsStatus = REVERSE_STATUS_MAPPING[vibeStatus];
    if (!beadsStatus) {
      return;
    }

    await this.beadsService.updateIssue(projectPath, beadsIssueId, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: beadsStatus as any,
    });

    // Update mapping
    const mapping = this.syncMappings.get(beadsIssueId);
    if (mapping) {
      mapping.lastSyncedAt = new Date().toISOString();
      mapping.lastSyncDirection = 'vibe-to-beads';
    }
  }

  /**
   * Sync all Beads issues to VibeKanban
   */
  private async syncBeadsToVibe(options: SyncOptions, result: SyncResult): Promise<void> {
    const issues = await this.beadsService.listIssues(options.projectPath);

    for (const issue of issues) {
      try {
        const mapping = this.syncMappings.get(issue.id);

        if (mapping) {
          // Update existing task
          await this.vibeClient.updateTask(mapping.vibeTaskId, {
            title: issue.title,
            description: this.buildTaskDescription(issue),
            status: STATUS_MAPPING[issue.status] || 'todo',
          });

          mapping.lastSyncedAt = new Date().toISOString();
          mapping.lastSyncDirection = 'beads-to-vibe';
          result.beadsToVibe.updated++;
        } else {
          // Create new task
          const task = await this.vibeClient.createTask({
            title: issue.title,
            description: this.buildTaskDescription(issue),
          });

          this.syncMappings.set(issue.id, {
            beadsIssueId: issue.id,
            vibeTaskId: task.id,
            lastSyncedAt: new Date().toISOString(),
            lastSyncDirection: 'beads-to-vibe',
          });

          result.beadsToVibe.created++;
        }
      } catch (error) {
        console.error(`[BeadsVibeSync] Error syncing issue ${issue.id}:`, error);
        result.beadsToVibe.failed++;
      }
    }
  }

  /**
   * Sync all VibeKanban tasks to Beads
   */
  private async syncVibeToBeads(options: SyncOptions, result: SyncResult): Promise<void> {
    const tasks = await this.vibeClient.listTasks();

    for (const task of tasks) {
      try {
        const mapping = this.getBeadsIssueId(task.id);

        if (mapping) {
          // Update existing issue
          const beadsStatus = REVERSE_STATUS_MAPPING[task.status];
          if (beadsStatus) {
            await this.beadsService.updateIssue(options.projectPath, mapping, {
              title: task.title,
              description: task.description,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              status: beadsStatus as any,
            });

            result.vibeToBeads.updated++;
          }
        } else {
          // Create new issue
          await this.beadsService.createIssue(options.projectPath, {
            title: task.title,
            description: task.description,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status: REVERSE_STATUS_MAPPING[task.status] as any,
          });

          result.vibeToBeads.created++;
        }
      } catch (error) {
        console.error(`[BeadsVibeSync] Error syncing task ${task.id}:`, error);
        result.vibeToBeads.failed++;
      }
    }
  }

  /**
   * Build task description from Beads issue
   */
  private buildTaskDescription(issue: BeadsIssue): string {
    let description = issue.description || '';

    // Add metadata
    const metadata: string[] = [];

    if (issue.type) {
      metadata.push(`**Type:** ${issue.type}`);
    }

    if (issue.priority !== undefined) {
      metadata.push(`**Priority:** P${issue.priority}`);
    }

    if (issue.status) {
      metadata.push(`**Status:** ${issue.status}`);
    }

    if (issue.labels && issue.labels.length > 0) {
      metadata.push(`**Labels:** ${issue.labels.join(', ')}`);
    }

    if (metadata.length > 0) {
      description = `${metadata.join('\n')}\n\n${description}`;
    }

    return description;
  }

  /**
   * Load sync mappings from file
   */
  private async loadMappings(projectPath: string): Promise<void> {
    const mappingsPath = path.join(projectPath, MAPPINGS_FILE);

    try {
      const content = await fs.readFile(mappingsPath, 'utf-8');
      const data = JSON.parse(content);

      this.syncMappings = new Map(Object.entries(data).map(([k, v]) => [k, v as SyncMapping]));
    } catch {
      // File doesn't exist or is invalid - start fresh
      this.syncMappings = new Map();
    }
  }

  /**
   * Save sync mappings to file
   */
  private async saveMappings(projectPath: string): Promise<void> {
    const mappingsPath = path.join(projectPath, MAPPINGS_FILE);

    try {
      const data = Object.fromEntries(this.syncMappings);
      await fs.writeFile(mappingsPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[BeadsVibeSync] Error saving mappings:', error);
    }
  }

  /**
   * Get all sync mappings
   */
  getMappings(): Map<string, SyncMapping> {
    return new Map(this.syncMappings);
  }

  /**
   * Clear all sync mappings
   */
  clearMappings(): void {
    this.syncMappings.clear();
  }
}
