/**
 * Pipeline-Beads Integration Service
 *
 * Integrates Pipeline workflow automation with Beads autonomous memory system.
 * Provides hierarchical issue tracking and helper agent spawning for pipeline steps.
 *
 * Features:
 * - Creates pipeline epic with step sub-tasks
 * - Spawns helper agents for pipeline steps
 * - Tracks pipeline execution in Beads
 * - Auto-advances pipeline on step completion
 */

import type { EventEmitter } from '../lib/events.js';
import type { PipelineStep, Feature } from '@automaker/types';
import type { BeadsService } from './beads-service.js';
import type { BeadsIssue } from '@automaker/types';

export interface PipelineEpic {
  epicId: string;
  phaseIds: Record<string, BeadsIssue>;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface PipelineStepResult {
  helperIssueId?: string;
  output: string;
  success: boolean;
  error?: string;
}

/**
 * Pipeline-Beads Integration Service
 *
 * Manages the integration between Pipeline workflow and Beads autonomous memory.
 */
export class PipelineBeadsIntegration {
  private unsubscribe?: () => void;

  constructor(
    private beadsService: BeadsService,
    private events: EventEmitter
  ) {
    // Listen for Beads issue updates to auto-advance pipeline
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for Beads issue updates
   */
  private setupEventListeners(): void {
    // When a pipeline step issue is closed, advance to next step
    this.unsubscribe = this.events.subscribe(async (type, payload) => {
      if (type === 'beads:issue-updated') {
        const eventPayload = payload as { issue: BeadsIssue; projectPath: string };
        if (
          eventPayload.issue?.labels?.includes('pipeline-step') &&
          eventPayload.issue.status === 'closed'
        ) {
          await this.handlePipelineStepClosed(eventPayload.projectPath, eventPayload.issue);
        }
      }
    });
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    this.unsubscribe?.();
  }

  /**
   * Create a pipeline epic in Beads with hierarchical structure
   *
   * Structure:
   * bd-xyz: "Feature: [title]" (epic)
   * ├── bd-xyz.1: "Step 1: [step1]" (task)
   * ├── bd-xyz.2: "Step 2: [step2]" (task)
   * └── bd-xyz.3: "Step 3: [step3]" (task)
   */
  async createPipelineEpic(
    projectPath: string,
    feature: Feature,
    steps: PipelineStep[]
  ): Promise<PipelineEpic> {
    const title = this.extractTitle(feature.description);
    const epicTitle = `Pipeline: ${title}`;
    const workflowId = this.generateWorkflowId();

    // Create epic issue
    const epic = await this.beadsService.createIssue(projectPath, {
      title: epicTitle,
      description: `Automated pipeline execution for feature: ${feature.id}\n\n${feature.description}`,
      type: 'epic',
      priority: 2,
      labels: ['pipeline', 'workflow', workflowId],
    });

    const phaseIds: Record<string, BeadsIssue> = {};

    // Create phase issues with dependencies
    let previousPhaseId: string | null = null;

    for (const step of steps) {
      const stepTitle = `Step ${step.order + 1}: ${step.name}`;
      const stepDescription = this.buildStepDescription(step, feature);

      const stepIssue = await this.beadsService.createIssue(projectPath, {
        title: stepTitle,
        description: stepDescription,
        type: 'task',
        priority: 2,
        parentIssueId: epic.id,
        labels: ['pipeline-step', 'pipeline', step.id, workflowId],
      });

      phaseIds[step.id] = stepIssue;

      // Add blocking dependency from previous step
      if (previousPhaseId) {
        await this.beadsService.addDependency(projectPath, stepIssue.id, previousPhaseId, 'blocks');
      }

      previousPhaseId = stepIssue.id;
    }

    this.events.emit('pipeline:epic-created', {
      epicId: epic.id,
      featureId: feature.id,
      projectPath,
      workflowId,
      stepCount: steps.length,
    });

    return {
      epicId: epic.id,
      phaseIds,
      workflowId,
      status: 'running',
    };
  }

  /**
   * Execute a pipeline step with Beads helper agent
   *
   * Creates a helper agent issue and returns the issue ID for tracking.
   */
  async executeStepWithBeads(
    projectPath: string,
    step: PipelineStep,
    feature: Feature,
    _featureId: string
  ): Promise<PipelineStepResult> {
    try {
      // If step has spawnBeadsHelper flag, create a helper agent issue
      if (step.spawnBeadsHelper && step.beadsHelperType) {
        const helperIssue = await this.beadsService.createIssue(projectPath, {
          title: `[Pipeline Helper] ${step.name} for ${feature.id}`,
          description: `Helper agent for pipeline step: ${step.name}\n\nFeature: ${feature.id}\n\nInstructions:\n${step.instructions}`,
          type: 'task',
          priority: step.beadsHelperType === 'feature' ? 2 : 3,
          labels: ['pipeline-helper', step.id, feature.id],
        });

        return {
          helperIssueId: helperIssue.id,
          output: `Created Beads helper issue: ${helperIssue.id}`,
          success: true,
        };
      }

      // Otherwise, just create a tracking issue
      const trackingIssue = await this.beadsService.createIssue(projectPath, {
        title: `[Pipeline] ${step.name} completed for ${feature.id}`,
        description: `Pipeline step executed: ${step.name}`,
        type: 'task',
        priority: 3,
        labels: ['pipeline-step-complete', step.id, feature.id],
      });

      return {
        helperIssueId: trackingIssue.id,
        output: `Pipeline step completed: ${step.name}`,
        success: true,
      };
    } catch (error) {
      return {
        output: '',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Build a description for a pipeline step issue
   */
  private buildStepDescription(step: PipelineStep, feature: Feature): string {
    return `## Pipeline Step: ${step.name}

**Feature ID:** ${feature.id}
**Description:** ${feature.description}

### Instructions
${step.instructions}

### Notes
This step is part of an automated pipeline workflow. The feature implementation will be completed before this step begins.
`;
  }

  /**
   * Extract a title from feature description
   */
  private extractTitle(description: string): string {
    const lines = description.trim().split('\n');
    const firstLine = lines[0]?.trim() || description;
    // Remove markdown heading characters if present
    return firstLine.replace(/^#+\s*/, '').substring(0, 50);
  }

  /**
   * Generate a unique workflow ID
   */
  private generateWorkflowId(): string {
    return `pipeline_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Handle pipeline step closed - advance to next step
   */
  private async handlePipelineStepClosed(
    projectPath: string,
    closedIssue: BeadsIssue
  ): Promise<void> {
    try {
      // Find the workflow label
      const workflowLabel = closedIssue.labels?.find((l) => l.startsWith('pipeline_'));
      if (!workflowLabel) return;

      // Find all issues in this workflow
      const allIssues = await this.beadsService.listIssues(projectPath, {
        labels: [workflowLabel],
      });

      const openSteps = allIssues.filter(
        (i) => i.status === 'open' && i.labels?.includes('pipeline-step')
      );
      const hasClosedSteps = allIssues.some(
        (i) => i.status === 'closed' && i.labels?.includes('pipeline-step')
      );

      if (openSteps.length > 0) {
        // Find the next open step and mark it as ready
        const nextStep = openSteps.sort((a, b) => {
          // Sort by step number in title
          const aNum = parseInt(a.title.match(/Step (\d+)/)?.[1] || '999', 10);
          const bNum = parseInt(b.title.match(/Step (\d+)/)?.[1] || '999', 10);
          return aNum - bNum;
        })[0];

        // Emit event that next step is ready
        this.events.emit('pipeline:step-ready', {
          projectPath,
          stepId: nextStep.id,
          workflowId: workflowLabel,
        });
      } else if (hasClosedSteps && openSteps.length === 0) {
        // All steps closed, emit workflow complete
        this.events.emit('pipeline:workflow-complete', {
          projectPath,
          workflowId: workflowLabel,
        });
      }
    } catch (error) {
      console.error('[PipelineBeadsIntegration] Error handling step closed:', error);
    }
  }
}
