/**
 * Plan to Issues Service
 *
 * Converts approved plans into trackable Beads issues with dependencies.
 * Enables plan-driven development by generating task issues from approved specifications.
 */

import type { BeadsIssue, CreateBeadsIssueInput, BeadsDependencyType } from '@automaker/types';
import { BeadsService } from './beads-service.js';

/**
 * Parsed task from a plan specification
 */
interface ParsedTask {
  id: string; // e.g., "T001"
  description: string;
  filePath?: string;
  phase?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Options for generating issues from a plan
 */
export interface GenerateIssuesOptions {
  /** Dry-run mode: preview issues without creating them */
  dryRun?: boolean;
  /** Feature ID to link issues to */
  featureId?: string;
  /** Default priority for generated issues (0-4) */
  defaultPriority?: number;
  /** Default labels to add to all issues */
  defaultLabels?: string[];
  /** Parent issue ID (if creating subtasks) */
  parentIssueId?: string;
}

/**
 * Result of generating issues from a plan
 */
export interface GenerateIssuesResult {
  /** Issues that were created (or would be created in dry-run) */
  issues: Array<{
    task: ParsedTask;
    beadsIssue?: BeadsIssue;
    error?: string;
  }>;
  /** Dependencies that were established */
  dependencies: Array<{
    fromIssueId: string;
    toIssueId: string;
    type: BeadsDependencyType;
  }>;
  /** Whether the operation was a dry run */
  dryRun: boolean;
  /** Total number of tasks processed */
  totalTasks: number;
  /** Number of successfully created issues */
  createdIssues: number;
  /** Number of failed issue creations */
  failedIssues: number;
}

/**
 * Service for converting approved plans into Beads issues
 */
export class PlanToIssuesService {
  constructor(private beadsService: BeadsService) {}

  /**
   * Generate Beads issues from an approved plan specification
   *
   * @param projectPath - Path to the project directory
   * @param planContent - The approved plan/specification content
   * @param options - Generation options
   * @returns Result of the generation process
   */
  async generateIssuesFromPlan(
    projectPath: string,
    planContent: string,
    options: GenerateIssuesOptions = {}
  ): Promise<GenerateIssuesResult> {
    const {
      dryRun = false,
      featureId,
      defaultPriority = 2,
      defaultLabels = [],
      parentIssueId,
    } = options;

    // Parse tasks from the plan content
    const tasks = this.parseTasksFromPlan(planContent);

    if (tasks.length === 0) {
      return {
        issues: [],
        dependencies: [],
        dryRun,
        totalTasks: 0,
        createdIssues: 0,
        failedIssues: 0,
      };
    }

    const result: GenerateIssuesResult = {
      issues: [],
      dependencies: [],
      dryRun,
      totalTasks: tasks.length,
      createdIssues: 0,
      failedIssues: 0,
    };

    // Track created issue IDs for dependency linking
    const taskIssueMap = new Map<string, string>();

    // Create issues for each task
    for (const task of tasks) {
      try {
        if (dryRun) {
          // Dry-run: don't actually create the issue
          result.issues.push({
            task,
            beadsIssue: {
              id: '[DRY-RUN-ID]',
              title: `${task.id}: ${task.description}`,
              description: this.buildIssueDescription(task),
              status: 'open',
              type: 'task',
              priority: defaultPriority,
              labels: [...defaultLabels, 'plan-generated'],
              dependencies: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              featureId,
            },
          });
          result.createdIssues++;
        } else {
          // Create the actual issue
          const beadsIssue = await this.createIssueFromTask(
            projectPath,
            task,
            {
              priority: defaultPriority,
              labels: [...defaultLabels, 'plan-generated'],
              featureId,
              parentIssueId,
            }
          );

          result.issues.push({
            task,
            beadsIssue,
          });

          taskIssueMap.set(task.id, beadsIssue.id);
          result.createdIssues++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.issues.push({
          task,
          error: errorMessage,
        });
        result.failedIssues++;

        // On failure, roll back any created issues
        if (!dryRun && result.createdIssues > 0) {
          await this.rollbackIssues(projectPath, taskIssueMap);
          throw new Error(`Failed to create issue for task ${task.id}: ${errorMessage}. Rolled back all created issues.`);
        }
      }
    }

    // Establish dependencies between issues (unless dry-run)
    if (!dryRun && result.createdIssues > 0) {
      const dependencies = await this.establishDependencies(
        projectPath,
        tasks,
        taskIssueMap
      );
      result.dependencies = dependencies;
    } else if (dryRun) {
      // Preview dependencies in dry-run mode
      result.dependencies = this.previewDependencies(tasks, taskIssueMap);
    }

    return result;
  }

  /**
   * Parse tasks from plan/specification content
   * Looks for the ```tasks code block and extracts task lines
   *
   * @param planContent - The plan specification content
   * @returns Array of parsed tasks
   */
  private parseTasksFromPlan(planContent: string): ParsedTask[] {
    const tasks: ParsedTask[] = [];

    // Extract content within ```tasks ... ``` block
    const tasksBlockMatch = planContent.match(/```tasks\s*([\s\S]*?)```/);
    if (!tasksBlockMatch) {
      // Try fallback: look for task lines anywhere in content
      const taskLines = planContent.match(/- \[ \] T\d{3}:.*$/gm);
      if (!taskLines) {
        return tasks;
      }
      // Parse fallback task lines
      let currentPhase: string | undefined;
      for (const line of taskLines) {
        const parsed = this.parseTaskLine(line, currentPhase);
        if (parsed) {
          tasks.push(parsed);
        }
      }
      return tasks;
    }

    const tasksContent = tasksBlockMatch[1];
    const lines = tasksContent.split('\n');

    let currentPhase: string | undefined;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check for phase header (e.g., "## Phase 1: Foundation")
      const phaseMatch = trimmedLine.match(/^##\s*(.+)$/);
      if (phaseMatch) {
        currentPhase = phaseMatch[1].trim();
        continue;
      }

      // Check for task line
      if (trimmedLine.startsWith('- [ ]')) {
        const parsed = this.parseTaskLine(trimmedLine, currentPhase);
        if (parsed) {
          tasks.push(parsed);
        }
      }
    }

    return tasks;
  }

  /**
   * Parse a single task line
   * Format: - [ ] T###: Description | File: path/to/file
   */
  private parseTaskLine(line: string, currentPhase?: string): ParsedTask | null {
    // Match pattern: - [ ] T###: Description | File: path
    const taskMatch = line.match(/- \[ \] (T\d{3}):\s*([^|]+)(?:\|\s*File:\s*(.+))?$/);
    if (!taskMatch) {
      // Try simpler pattern without file
      const simpleMatch = line.match(/- \[ \] (T\d{3}):\s*(.+)$/);
      if (simpleMatch) {
        return {
          id: simpleMatch[1],
          description: simpleMatch[2].trim(),
          phase: currentPhase,
          status: 'pending',
        };
      }
      return null;
    }

    return {
      id: taskMatch[1],
      description: taskMatch[2].trim(),
      filePath: taskMatch[3]?.trim(),
      phase: currentPhase,
      status: 'pending',
    };
  }

  /**
   * Create a Beads issue from a parsed task
   *
   * @param projectPath - Path to the project directory
   * @param task - The parsed task
   * @param options - Issue creation options
   * @returns The created Beads issue
   */
  private async createIssueFromTask(
    projectPath: string,
    task: ParsedTask,
    options: {
      priority?: number;
      labels?: string[];
      featureId?: string;
      parentIssueId?: string;
    } = {}
  ): Promise<BeadsIssue> {
    const { priority = 2, labels = [], featureId, parentIssueId } = options;

    const input: CreateBeadsIssueInput = {
      title: `${task.id}: ${task.description}`,
      description: this.buildIssueDescription(task),
      type: 'task',
      priority,
      labels: [...labels, task.id],
      parentIssueId,
    };

    const issue = await this.beadsService.createIssue(projectPath, input);

    // Link to feature if provided (via description or custom field)
    if (featureId) {
      // Beads doesn't have a native featureId field, so we add it to labels
      // or description for tracking
      const updatedIssue = await this.beadsService.updateIssue(
        projectPath,
        issue.id,
        {
          labels: [...issue.labels, `feature:${featureId}`],
        }
      );
      return updatedIssue;
    }

    return issue;
  }

  /**
   * Build a detailed description for a task issue
   *
   * @param task - The parsed task
   * @returns Formatted description
   */
  private buildIssueDescription(task: ParsedTask): string {
    const lines: string[] = [];

    if (task.phase) {
      lines.push(`**Phase**: ${task.phase}`);
      lines.push('');
    }

    if (task.filePath) {
      lines.push(`**File**: ${task.filePath}`);
      lines.push('');
    }

    lines.push(`**Task ID**: ${task.id}`);
    lines.push('');
    lines.push(task.description);

    return lines.join('\n');
  }

  /**
   * Establish dependencies between issues based on task order
   * Creates a dependency chain: T001 blocks T002, T002 blocks T003, etc.
   *
   * @param projectPath - Path to the project directory
   * @param tasks - Array of parsed tasks
   * @param taskIssueMap - Map of task IDs to Beads issue IDs
   * @returns Array of established dependencies
   */
  private async establishDependencies(
    projectPath: string,
    tasks: ParsedTask[],
    taskIssueMap: Map<string, string>
  ): Promise<Array<{ fromIssueId: string; toIssueId: string; type: BeadsDependencyType }>> {
    const dependencies: Array<{ fromIssueId: string; toIssueId: string; type: BeadsDependencyType }> = [];

    // Create sequential blocking dependencies
    for (let i = 0; i < tasks.length - 1; i++) {
      const currentTask = tasks[i];
      const nextTask = tasks[i + 1];

      const currentIssueId = taskIssueMap.get(currentTask.id);
      const nextIssueId = taskIssueMap.get(nextTask.id);

      if (!currentIssueId || !nextIssueId) {
        continue;
      }

      try {
        // T001 blocks T002 (T002 depends on T001)
        await this.beadsService.addDependency(
          projectPath,
          nextIssueId,
          currentIssueId,
          'blocks'
        );

        dependencies.push({
          fromIssueId: currentIssueId,
          toIssueId: nextIssueId,
          type: 'blocks',
        });
      } catch (error) {
        console.error(`[PlanToIssuesService] Failed to add dependency from ${currentIssueId} to ${nextIssueId}:`, error);
      }
    }

    return dependencies;
  }

  /**
   * Preview dependencies without creating them (for dry-run mode)
   *
   * @param tasks - Array of parsed tasks
   * @param taskIssueMap - Map of task IDs to Beads issue IDs
   * @returns Array of previewed dependencies
   */
  private previewDependencies(
    tasks: ParsedTask[],
    taskIssueMap: Map<string, string>
  ): Array<{ fromIssueId: string; toIssueId: string; type: BeadsDependencyType }> {
    const dependencies: Array<{ fromIssueId: string; toIssueId: string; type: BeadsDependencyType }> = [];

    for (let i = 0; i < tasks.length - 1; i++) {
      const currentTask = tasks[i];
      const nextTask = tasks[i + 1];

      const currentIssueId = taskIssueMap.get(currentTask.id) || `[${currentTask.id}-ID]`;
      const nextIssueId = taskIssueMap.get(nextTask.id) || `[${nextTask.id}-ID]`;

      dependencies.push({
        fromIssueId: currentIssueId,
        toIssueId: nextIssueId,
        type: 'blocks',
      });
    }

    return dependencies;
  }

  /**
   * Rollback issues created during a failed generation
   *
   * @param projectPath - Path to the project directory
   * @param taskIssueMap - Map of task IDs to Beads issue IDs to delete
   */
  private async rollbackIssues(
    projectPath: string,
    taskIssueMap: Map<string, string>
  ): Promise<void> {
    const issueIds = Array.from(taskIssueMap.values());

    for (const issueId of issueIds) {
      try {
        await this.beadsService.deleteIssue(projectPath, issueId, true);
      } catch (error) {
        console.error(`[PlanToIssuesService] Failed to rollback issue ${issueId}:`, error);
      }
    }
  }

  /**
   * Preview issues that would be created from a plan
   * Convenience method for dry-run with default options
   *
   * @param projectPath - Path to the project directory
   * @param planContent - The plan specification content
   * @param featureId - Optional feature ID to link issues to
   * @returns Preview result
   */
  async previewIssues(
    projectPath: string,
    planContent: string,
    featureId?: string
  ): Promise<GenerateIssuesResult> {
    return this.generateIssuesFromPlan(projectPath, planContent, {
      dryRun: true,
      featureId,
    });
  }
}
