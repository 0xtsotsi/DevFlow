/**
 * Checkpoint Service - Manages agent state checkpoints for recovery
 *
 * Provides:
 * - Checkpoint creation and management
 * - State snapshot and restore functionality
 * - Version tracking and lineage
 * - Rollback capabilities
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import { getAutomakerDir } from '@automaker/platform';

export interface AgentState {
  featureId: string;
  taskHistory: Array<{
    taskId: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    startTime?: string;
    endTime?: string;
  }>;
  filesModified: string[];
  context: string;
  timestamp: string;
}

export interface CheckpointMetadata {
  checkpointId: string;
  featureId: string;
  createdAt: string;
  parentCheckpointId?: string;
  version: number;
  agents: Array<{
    agentId: string;
    status: 'running' | 'completed' | 'failed' | 'stopped';
    taskHistory: AgentState['taskHistory'];
  }>;
  state: AgentState;
  description?: string;
}

export interface CheckpointDiff {
  checkpointId: string;
  changes: Array<{
    type: 'added' | 'modified' | 'deleted';
    path: string;
    timestamp?: string;
  }>;
}

export class CheckpointService {
  private checkpointsDir: string;

  constructor(projectPath: string) {
    const automakerDir = getAutomakerDir(projectPath);
    this.checkpointsDir = path.join(automakerDir, 'checkpoints');
  }

  /**
   * Create a new checkpoint with agent state
   */
  async createCheckpoint(
    checkpointId: string,
    agents: CheckpointMetadata['agents'],
    state: AgentState,
    description?: string
  ): Promise<CheckpointMetadata> {
    await secureFs.mkdir(this.checkpointsDir, { recursive: true });

    const checkpointPath = path.join(this.checkpointsDir, `${checkpointId}.json`);

    // Check if checkpoint already exists
    try {
      await secureFs.access(checkpointPath);
      throw new Error(`Checkpoint ${checkpointId} already exists`);
    } catch (error) {
      // If error is "already exists", re-throw it
      if ((error as Error).message.includes('already exists')) {
        throw error;
      }
      // Otherwise, file doesn't exist, continue
    }

    // Determine version based on parent checkpoints
    const version = await this.getNextVersion(state.featureId);

    const checkpoint: CheckpointMetadata = {
      checkpointId,
      featureId: state.featureId,
      createdAt: new Date().toISOString(),
      version,
      agents,
      state,
      description,
    };

    await secureFs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));

    return checkpoint;
  }

  /**
   * Restore a checkpoint and return its state
   */
  async restoreCheckpoint(checkpointId: string): Promise<CheckpointMetadata> {
    const checkpointPath = path.join(this.checkpointsDir, `${checkpointId}.json`);

    try {
      const data = (await secureFs.readFile(checkpointPath, 'utf-8')) as string;
      return JSON.parse(data) as CheckpointMetadata;
    } catch (error) {
      throw new Error(`Failed to restore checkpoint ${checkpointId}: ${(error as Error).message}`);
    }
  }

  /**
   * List all checkpoints, optionally filtered by feature
   */
  async listCheckpoints(featureId?: string): Promise<CheckpointMetadata[]> {
    try {
      const entries = await secureFs.readdir(this.checkpointsDir, {
        withFileTypes: true,
      });

      const checkpoints: CheckpointMetadata[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          try {
            const checkpointPath = path.join(this.checkpointsDir, entry.name);
            const data = (await secureFs.readFile(checkpointPath, 'utf-8')) as string;
            const checkpoint = JSON.parse(data) as CheckpointMetadata;

            // Filter by featureId if provided
            if (!featureId || checkpoint.featureId === featureId) {
              checkpoints.push(checkpoint);
            }
          } catch {
            // Skip invalid checkpoints
          }
        }
      }

      // Sort by creation time (newest first)
      return checkpoints.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const checkpointPath = path.join(this.checkpointsDir, `${checkpointId}.json`);

    try {
      await secureFs.unlink(checkpointPath);
    } catch (error) {
      throw new Error(`Failed to delete checkpoint ${checkpointId}: ${(error as Error).message}`);
    }
  }

  /**
   * Get lineage (history) of checkpoints for a feature
   */
  async getCheckpointLineage(featureId: string): Promise<CheckpointMetadata[]> {
    const checkpoints = await this.listCheckpoints(featureId);
    return checkpoints.sort((a, b) => a.version - b.version);
  }

  /**
   * Create a diff between two checkpoints
   */
  async diffCheckpoints(checkpointId1: string, checkpointId2: string): Promise<CheckpointDiff> {
    const cp1 = await this.restoreCheckpoint(checkpointId1);
    const cp2 = await this.restoreCheckpoint(checkpointId2);

    const changes: CheckpointDiff['changes'] = [];

    // Compare files modified
    const files1 = new Set(cp1.state.filesModified);
    const files2 = new Set(cp2.state.filesModified);

    // Find added files
    for (const file of files2) {
      if (!files1.has(file)) {
        changes.push({ type: 'added', path: file });
      }
    }

    // Find deleted files
    for (const file of files1) {
      if (!files2.has(file)) {
        changes.push({ type: 'deleted', path: file });
      }
    }

    // Find modified files (in both, but timestamp might indicate change)
    for (const file of files1) {
      if (files2.has(file)) {
        changes.push({ type: 'modified', path: file });
      }
    }

    return {
      checkpointId: checkpointId2,
      changes,
    };
  }

  /**
   * Merge checkpoint branches (conceptual - returns merge plan)
   */
  async mergeCheckpoints(
    sourceCheckpointId: string,
    targetCheckpointId: string
  ): Promise<{
    source: CheckpointMetadata;
    target: CheckpointMetadata;
    mergePlan: string[];
  }> {
    const source = await this.restoreCheckpoint(sourceCheckpointId);
    const target = await this.restoreCheckpoint(targetCheckpointId);

    const mergePlan: string[] = [];

    // Analyze differences and create merge plan
    const sourceFiles = new Set(source.state.filesModified);
    const targetFiles = new Set(target.state.filesModified);

    for (const file of sourceFiles) {
      if (!targetFiles.has(file)) {
        mergePlan.push(`Add file: ${file}`);
      }
    }

    for (const task of source.agents.flatMap((a) => a.taskHistory)) {
      mergePlan.push(`Restore task: ${task.taskId} - ${task.description}`);
    }

    return {
      source,
      target,
      mergePlan,
    };
  }

  /**
   * Get the next version number for a feature's checkpoints
   */
  private async getNextVersion(featureId: string): Promise<number> {
    const checkpoints = await this.listCheckpoints(featureId);

    if (checkpoints.length === 0) {
      return 1;
    }

    const maxVersion = Math.max(...checkpoints.map((cp) => cp.version));
    return maxVersion + 1;
  }
}
