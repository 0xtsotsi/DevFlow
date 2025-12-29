/**
 * Task State Service
 *
 * Persists task state for recovery on service restart.
 * Maintains separation of concerns - stores state in .automaker directory,
 * not in the Vibe-Kanban service itself.
 *
 * Critical: This service only persists task coordination state.
 * It never writes project source code.
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Task state record for persistence
 */
export interface TaskStateRecord {
  taskId: string;
  state: string;
  phase: string;
  prNumber?: number;
  lastUpdated: string;
  startedAt: string;
  completedAt?: string;
  metadata: Record<string, unknown>;
}

/**
 * Persistence configuration
 */
export interface TaskStateConfig {
  projectPath: string;
  stateDir: string; // Relative to projectPath
}

/**
 * Task State Service
 *
 * Provides persistence for orchestrator task state, enabling
 * recovery after service restarts.
 */
export class TaskStateService {
  private config: TaskStateConfig;
  private dbPath: string;
  private states = new Map<string, TaskStateRecord>();
  private isInitialized = false;

  constructor(config: TaskStateConfig) {
    this.config = config;
    this.dbPath = path.join(config.projectPath, config.stateDir, 'task-state.json');
  }

  /**
   * Initialize the service by loading existing state from disk
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (existsSync(this.dbPath)) {
        const data = await fs.readFile(this.dbPath, 'utf-8');
        const records = JSON.parse(data) as TaskStateRecord[];

        for (const record of records) {
          this.states.set(record.taskId, record);
        }

        console.log(`[TaskState] Loaded ${records.length} task states from ${this.dbPath}`);
      } else {
        console.log(`[TaskState] No existing state file, starting fresh`);
      }
    } catch (error) {
      console.error('[TaskState] Failed to load state:', error);
      // Continue with empty state
    }

    this.isInitialized = true;
  }

  /**
   * Save state for a task
   *
   * @param taskId - Vibe-Kanban task ID
   * @param state - Orchestrator task state
   * @param phase - Current orchestrator phase
   * @param metadata - Additional metadata (PR number, etc.)
   */
  async saveState(
    taskId: string,
    state: string,
    phase: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const existing = this.states.get(taskId);

    const record: TaskStateRecord = {
      taskId,
      state,
      phase,
      lastUpdated: new Date().toISOString(),
      startedAt: existing?.startedAt || new Date().toISOString(),
      prNumber: metadata.prNumber as number | undefined,
      metadata: { ...existing?.metadata, ...metadata },
    };

    // Add completion time if state is 'completed'
    if (state === 'completed' && !existing?.completedAt) {
      record.completedAt = new Date().toISOString();
    }

    this.states.set(taskId, record);
    await this.flush();
  }

  /**
   * Get state for a task
   *
   * @param taskId - Vibe-Kanban task ID
   * @returns Task state record or null if not found
   */
  getState(taskId: string): TaskStateRecord | null {
    return this.states.get(taskId) || null;
  }

  /**
   * Get all task states
   *
   * @returns Map of all task states
   */
  getAllStates(): Map<string, TaskStateRecord> {
    return new Map(this.states);
  }

  /**
   * Get states by filter
   *
   * @param filter - Filter function
   * @returns Array of matching task states
   */
  getStates(filter?: (record: TaskStateRecord) => boolean): TaskStateRecord[] {
    const all = Array.from(this.states.values());
    return filter ? all.filter(filter) : all;
  }

  /**
   * Get active tasks (not completed)
   *
   * @returns Array of active task states
   */
  getActiveTasks(): TaskStateRecord[] {
    return this.getStates((s) => s.state !== 'completed');
  }

  /**
   * Get tasks by PR number
   *
   * @param prNumber - Pull request number
   * @returns Array of task states with this PR number
   */
  getTasksByPR(prNumber: number): TaskStateRecord[] {
    return this.getStates((s) => s.prNumber === prNumber);
  }

  /**
   * Delete state for a task
   *
   * @param taskId - Vibe-Kanban task ID
   */
  async deleteState(taskId: string): Promise<void> {
    this.states.delete(taskId);
    await this.flush();
  }

  /**
   * Clear all task states (use with caution)
   */
  async clearAll(): Promise<void> {
    this.states.clear();
    await this.flush();
  }

  /**
   * Clean up old completed tasks
   *
   * @param olderThanDays - Remove tasks completed more than this many days ago
   */
  async cleanupOldTasks(olderThanDays: number = 7): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [taskId, record] of this.states.entries()) {
      if (
        record.state === 'completed' &&
        record.completedAt &&
        new Date(record.completedAt).getTime() < cutoff
      ) {
        this.states.delete(taskId);
        removed++;
      }
    }

    if (removed > 0) {
      await this.flush();
      console.log(`[TaskState] Cleaned up ${removed} old completed tasks`);
    }

    return removed;
  }

  /**
   * Persist states to disk
   */
  private async flush(): Promise<void> {
    try {
      const records = Array.from(this.states.values());
      const dir = path.dirname(this.dbPath);

      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });

      // Write to file
      await fs.writeFile(this.dbPath, JSON.stringify(records, null, 2));
    } catch (error) {
      console.error('[TaskState] Failed to save state:', error);
    }
  }

  /**
   * Export states as JSON
   *
   * Useful for debugging and inspection
   */
  exportAsJSON(): string {
    const records = Array.from(this.states.values());
    return JSON.stringify(records, null, 2);
  }

  /**
   * Import states from JSON
   *
   * Useful for recovery from backup
   */
  async importFromJSON(json: string): Promise<void> {
    try {
      const records = JSON.parse(json) as TaskStateRecord[];
      for (const record of records) {
        this.states.set(record.taskId, record);
      }
      await this.flush();
      console.log(`[TaskState] Imported ${records.length} task states`);
    } catch (error) {
      console.error('[TaskState] Failed to import states:', error);
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * Get statistics about task states
   */
  getStats(): {
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    tasksWithPR: number;
    oldestActiveTask?: TaskStateRecord;
  } {
    const states = Array.from(this.states.values());
    const active = states.filter((s) => s.state !== 'completed');
    const completed = states.filter((s) => s.state === 'completed');
    const withPR = states.filter((s) => s.prNumber);

    // Find oldest active task
    const oldestActive = active
      .filter((s) => s.startedAt)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())[0];

    return {
      totalTasks: states.length,
      activeTasks: active.length,
      completedTasks: completed.length,
      tasksWithPR: withPR.length,
      oldestActiveTask: oldestActive,
    };
  }

  /**
   * Destroy the service and clean up resources
   */
  async destroy(): Promise<void> {
    await this.flush();
    this.states.clear();
    this.isInitialized = false;
    console.log('[TaskState] Service destroyed');
  }
}

/**
 * Default state directory relative to project root
 */
export const DEFAULT_STATE_DIR = '.automaker';

/**
 * Create a singleton instance for a project
 */
const serviceInstances = new Map<string, TaskStateService>();

export function getTaskStateService(projectPath: string): TaskStateService {
  if (!serviceInstances.has(projectPath)) {
    serviceInstances.set(
      projectPath,
      new TaskStateService({
        projectPath,
        stateDir: DEFAULT_STATE_DIR,
      })
    );
  }
  return serviceInstances.get(projectPath)!;
}

export function resetTaskStateService(projectPath?: string): void {
  if (projectPath) {
    serviceInstances.delete(projectPath);
  } else {
    serviceInstances.clear();
  }
}
