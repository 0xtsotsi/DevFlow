/**
 * Beads-VibeKanban Sync Service
 *
 * Synchronizes Beads issues with VibeKanban tasks for unified project tracking.
 * Provides bidirectional sync between local Beads database and remote VibeKanban.
 *
 * HYBRID-M2: Enables seamless integration between local issue tracking and remote kanban.
 */

import { BeadsService, type BeadsIssue } from './beads-service.js';
import type { EventEmitter } from '../lib/events.js';

// VibeKanban MCP interface (would use actual MCP client in production)
interface VibeKanbanTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
  project_id: string;
  created_at: string;
  updated_at: string;
}

interface VibeKanbanProject {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

// Status mapping between Beads and VibeKanban
const STATUS_MAPPING: Record<string, 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled'> = {
  open: 'todo',
  in_progress: 'inprogress',
  in_review: 'inreview',
  closed: 'done',
  blocked: 'todo',
  cancelled: 'cancelled',
};

const REVERSE_STATUS_MAPPING: Record<string, string> = {
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

export class BeadsVibeSync {
  private beadsService: BeadsService;
  private eventEmitter: EventEmitter;
  private syncMappings: Map<string, SyncMapping> = new Map(); // beadsId -> mapping
  private syncInterval?: NodeJS.Timeout;
  private isSyncing = false;

  // VibeKanban MCP client (placeholder - would inject actual MCP client)
  private vibeClient: {
    listProjects(): Promise<VibeKanbanProject[]>;
    listTasks(projectId: string): Promise<VibeKanbanTask[]>;
    createTask(projectId: string, title: string, description?: string): Promise<VibeKanbanTask>;
    updateTask(taskId: string, updates: { title?: string; description?: string; status?: string }): Promise<VibeKanbanTask>;
    deleteTask(taskId: string): Promise<void>;
  };

  constructor(eventEmitter: EventEmitter, beadsService?: BeadsService) {
    this.eventEmitter = eventEmitter;
    this.beadsService = beadsService || new BeadsService();
    this.beadsService.setEventEmitter(eventEmitter);

    // Placeholder VibeKanban MCP client
    // In production, this would be the actual MCP server client
    this.vibeClient = {
      listProjects: async () => [],
      listTasks: async () => [],
      createTask: async () => ({ id: '', title: '', project_id: '', created_at: '', updated_at: '' }),
      updateTask: async () => ({ id: '', title: '', project_id: '', created_at: '', updated_at: '' }),
      deleteTask: async () => {},
    };
  }

  /**
   * Set the VibeKanban MCP client
   */
  setVibeClient(client: BeadsVibeSync['vibeClient']): void {
    this.vibeClient = client;
  }

  /**
   * Load sync mappings from storage
   */
  async loadMappings(projectPath: string): Promise<void> {
    try {
      const mappingPath = `${projectPath}/.beads/vibe-sync-mappings.json`;
      const fs = await import('fs/promises');
      const data = await fs.readFile(mappingPath, 'utf-8');
      const mappings: SyncMapping[] = JSON.parse(data);

      this.syncMappings.clear();
      for (const mapping of mappings) {
        this.syncMappings.set(mapping.beadsIssueId, mapping);
      }
    } catch (error) {
      // No existing mappings - start fresh
      this.syncMappings.clear();
    }
  }

  /**
   * Save sync mappings to storage
   */
  private async saveMappings(projectPath: string): Promise<void> {
    try {
      const mappingPath = `${projectPath}/.beads/vibe-sync-mappings.json`;
      const fs = await import('fs/promises');
      const mappings = Array.from(this.syncMappings.values());
      await fs.writeFile(mappingPath, JSON.stringify(mappings, null, 2));
    } catch (error) {
      console.error('Failed to save sync mappings:', error);
    }
  }

  /**
   * Perform bidirectional sync between Beads and VibeKanban
   */
  async sync(options: SyncOptions): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    const startTime = Date.now();

    this.eventEmitter.emit('beads:sync-started', { projectPath: options.projectPath });

    try {
      // Load existing mappings
      await this.loadMappings(options.projectPath);

      const result: SyncResult = {
        beadsToVibe: { created: 0, updated: 0, failed: 0 },
        vibeToBeads: { created: 0, updated: 0, failed: 0 },
        syncedAt: new Date().toISOString(),
        duration: 0,
      };

      // Sync Beads -> VibeKanban
      const beadsResult = await this.syncBeadsToVibe(options);
      result.beadsToVibe = beadsResult;

      // Sync VibeKanban -> Beads (if bidirectional)
      if (options.bidirectional) {
        const vibeResult = await this.syncVibeToBeads(options);
        result.vibeToBeads = vibeResult;
      }

      // Save updated mappings
      await this.saveMappings(options.projectPath);

      result.duration = Date.now() - startTime;

      this.eventEmitter.emit('beads:sync-completed', { options, result });
      return result;
    } catch (error) {
      this.eventEmitter.emit('beads:sync-error', { options, error });
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync Beads issues to VibeKanban tasks
   */
  private async syncBeadsToVibe(options: SyncOptions): Promise<{ created: number; updated: number; failed: number }> {
    let created = 0;
    let updated = 0;
    let failed = 0;

    try {
      const issues = await this.beadsService.listIssues(options.projectPath);

      for (const issue of issues) {
        try {
          const mapping = this.syncMappings.get(issue.id);

          if (mapping) {
            // Update existing task
            const vibeStatus = STATUS_MAPPING[issue.status] || 'todo';
            await this.vibeClient.updateTask(mapping.vibeTaskId, {
              title: issue.title,
              description: issue.description,
              status: vibeStatus,
            });
            updated++;
          } else {
            // Create new task
            const vibeStatus = STATUS_MAPPING[issue.status] || 'todo';
            const task = await this.vibeClient.createTask(
              options.vibeProjectId,
              issue.title,
              issue.description
            );

            // Store mapping
            this.syncMappings.set(issue.id, {
              beadsIssueId: issue.id,
              vibeTaskId: task.id,
              lastSyncedAt: new Date().toISOString(),
              lastSyncDirection: 'beads-to-vibe',
            });
            created++;
          }
        } catch (error) {
          console.error(`Failed to sync issue ${issue.id}:`, error);
          failed++;
        }
      }
    } catch (error) {
      console.error('Failed to sync Beads to VibeKanban:', error);
    }

    return { created, updated, failed };
  }

  /**
   * Sync VibeKanban tasks to Beads issues
   */
  private async syncVibeToBeads(options: SyncOptions): Promise<{ created: number; updated: number; failed: number }> {
    let created = 0;
    let updated = 0;
    let failed = 0;

    try {
      const tasks = await this.vibeClient.listTasks(options.vibeProjectId);

      for (const task of tasks) {
        try {
          // Find if this task is already mapped
          let beadsIssueId: string | undefined;
          for (const [bId, mapping] of this.syncMappings.entries()) {
            if (mapping.vibeTaskId === task.id) {
              beadsIssueId = bId;
              break;
            }
          }

          const beadsStatus = REVERSE_STATUS_MAPPING[task.status] || 'open';

          if (beadsIssueId) {
            // Update existing issue
            await this.beadsService.updateIssue(options.projectPath, beadsIssueId, {
              title: task.title,
              description: task.description,
              status: beadsStatus,
            });
            updated++;
          } else {
            // Create new issue
            const issue = await this.beadsService.createIssue(options.projectPath, {
              title: task.title,
              description: task.description,
              status: beadsStatus,
              type: 'task',
              labels: options.issueLabelPrefix ? [options.issueLabelPrefix] : undefined,
            });

            // Store mapping
            this.syncMappings.set(issue.id, {
              beadsIssueId: issue.id,
              vibeTaskId: task.id,
              lastSyncedAt: new Date().toISOString(),
              lastSyncDirection: 'vibe-to-beads',
            });
            created++;
          }
        } catch (error) {
          console.error(`Failed to sync task ${task.id}:`, error);
          failed++;
        }
      }
    } catch (error) {
      console.error('Failed to sync VibeKanban to Beads:', error);
    }

    return { created, updated, failed };
  }

  /**
   * Start automatic sync at regular intervals
   */
  startAutoSync(options: SyncOptions): void {
    if (this.syncInterval) {
      this.stopAutoSync();
    }

    const interval = options.syncInterval || 60000; // Default: 1 minute

    this.syncInterval = setInterval(async () => {
      try {
        await this.sync(options);
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, interval);

    // Initial sync
    this.sync(options).catch(console.error);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
  }

  /**
   * Get sync status for all mappings
   */
  getSyncStatus(): SyncMapping[] {
    return Array.from(this.syncMappings.values());
  }

  /**
   * Get sync mapping for a specific Beads issue
   */
  getMappingForIssue(beadsIssueId: string): SyncMapping | undefined {
    return this.syncMappings.get(beadsIssueId);
  }

  /**
   * Get sync mapping for a specific VibeKanban task
   */
  getMappingForTask(vibeTaskId: string): SyncMapping | undefined {
    for (const mapping of this.syncMappings.values()) {
      if (mapping.vibeTaskId === vibeTaskId) {
        return mapping;
      }
    }
    return undefined;
  }

  /**
   * Manually create a sync mapping
   */
  async createMapping(
    projectPath: string,
    beadsIssueId: string,
    vibeTaskId: string,
    direction: 'beads-to-vibe' | 'vibe-to-beads' | 'bidirectional' = 'bidirectional'
  ): Promise<void> {
    this.syncMappings.set(beadsIssueId, {
      beadsIssueId,
      vibeTaskId,
      lastSyncedAt: new Date().toISOString(),
      lastSyncDirection: direction,
    });

    await this.saveMappings(projectPath);
  }

  /**
   * Remove a sync mapping
   */
  async removeMapping(projectPath: string, beadsIssueId: string): Promise<void> {
    this.syncMappings.delete(beadsIssueId);
    await this.saveMappings(projectPath);
  }

  /**
   * Clear all sync mappings
   */
  async clearMappings(projectPath: string): Promise<void> {
    this.syncMappings.clear();
    await this.saveMappings(projectPath);
  }

  /**
   * Check if syncing is currently in progress
   */
  isActive(): boolean {
    return this.isSyncing;
  }
}
