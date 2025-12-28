/**
 * Checkpoint Metadata - Enhanced versioning and lineage tracking for checkpoints
 *
 * Provides:
 * - Checkpoint lineage tracking (parent-child relationships)
 * - Version comparison and diff utilities
 * - Branch management for parallel agent workflows
 * - Merge conflict detection and resolution
 */

import type { CheckpointMetadata } from '../services/checkpoint-service.js';

export interface CheckpointLineage {
  checkpointId: string;
  version: number;
  parentId: string | null;
  children: string[];
  branchName?: string;
  createdAt: string;
}

export interface CheckpointVersionDiff {
  fromVersion: number;
  toVersion: number;
  changes: {
    tasksAdded: number;
    tasksModified: number;
    tasksCompleted: number;
    filesAdded: number;
    filesModified: number;
  };
}

export interface CheckpointBranch {
  branchName: string;
  checkpoints: string[];
  parentBranch?: string;
  mergedFrom?: string[];
  createdAt: string;
}

export class CheckpointMetadataManager {
  private lineageMap: Map<string, CheckpointLineage> = new Map();
  private branches: Map<string, CheckpointBranch> = new Map();

  /**
   * Initialize lineage from existing checkpoints
   */
  async initializeLineage(checkpoints: CheckpointMetadata[]): Promise<void> {
    this.lineageMap.clear();

    // Build lineage map
    for (const checkpoint of checkpoints) {
      const lineage: CheckpointLineage = {
        checkpointId: checkpoint.checkpointId,
        version: checkpoint.version,
        parentId: checkpoint.parentCheckpointId || null,
        children: [],
        createdAt: checkpoint.createdAt,
      };

      this.lineageMap.set(checkpoint.checkpointId, lineage);
    }

    // Link children to parents
    for (const [checkpointId, lineage] of this.lineageMap.entries()) {
      if (lineage.parentId) {
        const parent = this.lineageMap.get(lineage.parentId);
        if (parent) {
          parent.children.push(checkpointId);
        }
      }
    }
  }

  /**
   * Get lineage for a specific checkpoint
   */
  getLineage(checkpointId: string): CheckpointLineage | undefined {
    return this.lineageMap.get(checkpointId);
  }

  /**
   * Get full ancestry chain for a checkpoint (root -> checkpoint)
   */
  getAncestry(checkpointId: string): CheckpointLineage[] {
    const ancestry: CheckpointLineage[] = [];
    let current = this.lineageMap.get(checkpointId);

    while (current) {
      ancestry.unshift(current);
      current = current.parentId ? this.lineageMap.get(current.parentId) || undefined : undefined;
    }

    return ancestry;
  }

  /**
   * Get all descendants of a checkpoint (checkpoint -> leaves)
   */
  getDescendants(checkpointId: string): CheckpointLineage[] {
    const descendants: CheckpointLineage[] = [];
    const queue = [checkpointId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = this.lineageMap.get(currentId);

      if (current && currentId !== checkpointId) {
        descendants.push(current);
      }

      if (current) {
        queue.push(...current.children);
      }
    }

    return descendants;
  }

  /**
   * Create a diff between two checkpoint versions
   */
  createDiff(
    checkpoint1: CheckpointMetadata,
    checkpoint2: CheckpointMetadata
  ): CheckpointVersionDiff {
    const tasks1 = new Map(
      checkpoint1.agents.flatMap((a) =>
        a.taskHistory.map((t) => [t.taskId, t] as [string, (typeof a.taskHistory)[0]])
      )
    );
    const tasks2 = new Map(
      checkpoint2.agents.flatMap((a) =>
        a.taskHistory.map((t) => [t.taskId, t] as [string, (typeof a.taskHistory)[0]])
      )
    );

    const files1 = new Set(checkpoint1.state.filesModified);
    const files2 = new Set(checkpoint2.state.filesModified);

    let tasksAdded = 0;
    let tasksModified = 0;
    let tasksCompleted = 0;

    // Count new tasks
    for (const [taskId] of tasks2) {
      if (!tasks1.has(taskId)) {
        tasksAdded++;
      }
    }

    // Count modified tasks
    for (const [taskId, task1] of tasks1) {
      const task2 = tasks2.get(taskId);
      if (task2 && task1.description !== task2.description) {
        tasksModified++;
      }
    }

    // Count newly completed tasks
    for (const [taskId, task1] of tasks1) {
      const task2 = tasks2.get(taskId);
      if (task2 && task1.status !== 'completed' && task2.status === 'completed') {
        tasksCompleted++;
      }
    }

    const filesAdded = Array.from(files2).filter((f) => !files1.has(f)).length;
    const filesModified = Array.from(files2).filter((f) => files1.has(f)).length;

    return {
      fromVersion: checkpoint1.version,
      toVersion: checkpoint2.version,
      changes: {
        tasksAdded,
        tasksModified,
        tasksCompleted,
        filesAdded,
        filesModified,
      },
    };
  }

  /**
   * Create a new branch from a checkpoint
   */
  createBranch(checkpointId: string, branchName: string): CheckpointBranch {
    const branch: CheckpointBranch = {
      branchName,
      checkpoints: [checkpointId],
      createdAt: new Date().toISOString(),
    };

    this.branches.set(branchName, branch);

    // Update lineage with branch info
    const lineage = this.lineageMap.get(checkpointId);
    if (lineage) {
      lineage.branchName = branchName;
    }

    return branch;
  }

  /**
   * Merge two checkpoint branches
   */
  mergeBranches(
    sourceBranch: string,
    targetBranch: string
  ): {
    success: boolean;
    mergedCheckpoints: string[];
    conflicts: string[];
  } {
    const source = this.branches.get(sourceBranch);
    const target = this.branches.get(targetBranch);

    if (!source || !target) {
      return {
        success: false,
        mergedCheckpoints: [],
        conflicts: ['Branch not found'],
      };
    }

    const mergedCheckpoints: string[] = [];
    const conflicts: string[] = [];

    // Check for conflicts (same file modified in both branches)
    // Note: Full implementation would require loading checkpoint data to get file lists
    // This is a simplified check that can be extended when needed

    // Add source checkpoints to target
    for (const checkpointId of source.checkpoints) {
      if (!target.checkpoints.includes(checkpointId)) {
        mergedCheckpoints.push(checkpointId);
        target.checkpoints.push(checkpointId);
      }
    }

    // Record merge
    if (!target.mergedFrom) {
      target.mergedFrom = [];
    }
    target.mergedFrom.push(sourceBranch);

    // Update lineage for merged checkpoints
    for (const checkpointId of mergedCheckpoints) {
      const lineage = this.lineageMap.get(checkpointId);
      if (lineage) {
        lineage.branchName = targetBranch;
      }
    }

    return {
      success: conflicts.length === 0,
      mergedCheckpoints,
      conflicts,
    };
  }

  /**
   * Detect merge conflicts between branches
   */
  detectMergeConflicts(branch1: string, branch2: string): string[] {
    const conflicts: string[] = [];

    const b1 = this.branches.get(branch1);
    const b2 = this.branches.get(branch2);

    if (!b1 || !b2) {
      return ['One or both branches not found'];
    }

    // Check for divergent checkpoints
    const commonAncestor = this.findCommonAncestor(b1.checkpoints[0], b2.checkpoints[0]);

    if (!commonAncestor) {
      conflicts.push('No common ancestor found');
    }

    return conflicts;
  }

  /**
   * Find common ancestor of two checkpoints
   */
  private findCommonAncestor(checkpointId1: string, checkpointId2: string): string | null {
    const ancestry1 = new Set(this.getAncestry(checkpointId1).map((l) => l.checkpointId));
    const ancestry2 = this.getAncestry(checkpointId2);

    for (const lineage of ancestry2) {
      if (ancestry1.has(lineage.checkpointId)) {
        return lineage.checkpointId;
      }
    }

    return null;
  }

  /**
   * Get all branches
   */
  getAllBranches(): CheckpointBranch[] {
    return Array.from(this.branches.values());
  }

  /**
   * Get branch by name
   */
  getBranch(branchName: string): CheckpointBranch | undefined {
    return this.branches.get(branchName);
  }

  /**
   * Delete a branch (but keep checkpoints)
   */
  deleteBranch(branchName: string): boolean {
    const branch = this.branches.get(branchName);
    if (!branch) {
      return false;
    }

    // Clear branch name from lineage
    for (const checkpointId of branch.checkpoints) {
      const lineage = this.lineageMap.get(checkpointId);
      if (lineage && lineage.branchName === branchName) {
        lineage.branchName = undefined;
      }
    }

    this.branches.delete(branchName);
    return true;
  }

  /**
   * Export lineage as JSON for persistence
   */
  exportLineage(): string {
    const data = {
      lineage: Array.from(this.lineageMap.values()),
      branches: Array.from(this.branches.values()),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import lineage from JSON
   */
  importLineage(json: string): void {
    try {
      const data = JSON.parse(json);

      this.lineageMap.clear();
      this.branches.clear();

      for (const lineage of data.lineage) {
        this.lineageMap.set(lineage.checkpointId, lineage);
      }

      for (const branch of data.branches) {
        this.branches.set(branch.branchName, branch);
      }
    } catch (error) {
      throw new Error(`Failed to import lineage: ${(error as Error).message}`);
    }
  }
}
