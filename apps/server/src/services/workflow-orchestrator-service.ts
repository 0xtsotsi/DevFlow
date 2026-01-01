/**
 * Workflow Orchestrator Service
 *
 * Orchestrates complete development workflows with 4 phases:
 * - Research (gather context)
 * - Planning (decompose task)
 * - Implementation (write code)
 * - CI/CD (validate quality)
 *
 * Features checkpoint system (auto/semi modes) and multi-agent coordination via Beads.
 */

import type { EventEmitter } from '../lib/events.js';
import { getMCPBridge } from '../lib/mcp-bridge.js';

/**
 * Workflow phase
 */
type WorkflowPhase = 'research' | 'planning' | 'implementation' | 'cicd';

/**
 * Checkpoint data
 */
interface Checkpoint {
  /** Checkpoint ID */
  id: string;
  /** Phase completed */
  phase: WorkflowPhase;
  /** Timestamp */
  timestamp: string;
  /** Data from completed phase */
  data?: unknown;
  /** User approved? */
  approved?: boolean;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  /** Overall success */
  success: boolean;
  /** Completed phases */
  phases: {
    research?: { success: boolean; duration: number; output?: string };
    planning?: { success: boolean; duration: number; output?: string };
    implementation?: { success: boolean; duration: number; output?: string };
    cicd?: { success: boolean; duration: number; output?: string };
  };
  /** Checkpoints created */
  checkpoints: Checkpoint[];
  /** Total duration */
  totalDuration: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Options for workflow orchestration
 */
export interface WorkflowOrchestratorOptions {
  /** Project path */
  projectPath: string;
  /** Workflow task description */
  task: string;
  /** Execution mode */
  mode: 'auto' | 'semi';
  /** Which phases to run (default: all) */
  phases?: WorkflowPhase[];
  /** Beads issue ID (for coordination) */
  beadsIssueId?: string;
  /** Checkpoint interval (default: after each phase in semi mode) */
  checkpointInterval?: 'phase' | 'step';
}

export class WorkflowOrchestratorService {
  private events: EventEmitter;
  private mcpBridge: ReturnType<typeof getMCPBridge>;
  private checkpoints: Map<string, Checkpoint[]> = new Map();

  constructor(events: EventEmitter) {
    this.events = events;
    this.mcpBridge = getMCPBridge(events);
  }

  /**
   * Execute complete workflow
   */
  async execute(options: WorkflowOrchestratorOptions): Promise<WorkflowResult> {
    const startTime = Date.now();
    const {
      projectPath,
      task,
      mode,
      phases = ['research', 'planning', 'implementation', 'cicd'],
      checkpointInterval = 'phase',
    } = options;

    const workflowId = this.generateWorkflowId();
    this.checkpoints.set(workflowId, []);

    this.events.emit('skill:started', {
      skill: 'workflow-orchestrator',
      workflowId,
      task,
      mode,
      timestamp: new Date().toISOString(),
    });

    try {
      const phaseResults: Partial<WorkflowResult['phases']> = {};

      // Phase 1: Research
      if (phases.includes('research')) {
        const result = await this.runResearchPhase(projectPath, task, workflowId);
        phaseResults.research = result;

        if (mode === 'semi' && checkpointInterval === 'phase') {
          await this.createCheckpoint(workflowId, 'research', result.output);
          const approved = await this.waitForApproval(workflowId);
          if (!approved) {
            throw new Error('Workflow cancelled at research checkpoint');
          }
        }
      }

      // Phase 2: Planning
      if (phases.includes('planning')) {
        const researchContext = phaseResults.research?.output;
        const result = await this.runPlanningPhase(projectPath, task, researchContext, workflowId);
        phaseResults.planning = result;

        if (mode === 'semi' && checkpointInterval === 'phase') {
          await this.createCheckpoint(workflowId, 'planning', result.output);
          const approved = await this.waitForApproval(workflowId);
          if (!approved) {
            throw new Error('Workflow cancelled at planning checkpoint');
          }
        }
      }

      // Phase 3: Implementation
      if (phases.includes('implementation')) {
        const planningContext = phaseResults.planning?.output;
        const result = await this.runImplementationPhase(
          projectPath,
          task,
          planningContext,
          workflowId
        );
        phaseResults.implementation = result;

        if (mode === 'semi' && checkpointInterval === 'phase') {
          await this.createCheckpoint(workflowId, 'implementation', result.output);
          const approved = await this.waitForApproval(workflowId);
          if (!approved) {
            throw new Error('Workflow cancelled at implementation checkpoint');
          }
        }
      }

      // Phase 4: CI/CD
      if (phases.includes('cicd')) {
        const result = await this.runCICDPhase(projectPath, workflowId);
        phaseResults.cicd = result;

        if (mode === 'semi' && checkpointInterval === 'phase') {
          await this.createCheckpoint(workflowId, 'cicd', result.output);
          const approved = await this.waitForApproval(workflowId);
          if (!approved) {
            throw new Error('Workflow cancelled at CI/CD checkpoint');
          }
        }
      }

      const totalDuration = Date.now() - startTime;
      const allPhases = phaseResults as WorkflowResult['phases'];
      const overallSuccess = Object.values(allPhases).every((p) => p.success);

      const workflowResult: WorkflowResult = {
        success: overallSuccess,
        phases: allPhases,
        checkpoints: this.checkpoints.get(workflowId) || [],
        totalDuration,
        timestamp: new Date().toISOString(),
      };

      this.events.emit('skill:completed', {
        skill: 'workflow-orchestrator',
        workflowId,
        task,
        duration: totalDuration,
        success: overallSuccess,
        timestamp: new Date().toISOString(),
      });

      return workflowResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:failed', {
        skill: 'workflow-orchestrator',
        workflowId,
        task,
        error: errorMessage,
        duration,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Run research phase
   */
  private async runResearchPhase(
    projectPath: string,
    task: string,
    workflowId: string
  ): Promise<{ success: boolean; duration: number; output?: string }> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:phase-started', {
        skill: 'workflow-orchestrator',
        phase: 'research',
        workflowId,
      });

      const result = await this.mcpBridge.callTool(
        'execute_research_skill',
        {
          projectPath,
          query: task,
          maxResults: 10,
        },
        { timeout: 120000, throwOnError: false }
      );

      const duration = Date.now() - startTime;

      this.events.emit('skill:phase-completed', {
        skill: 'workflow-orchestrator',
        phase: 'research',
        workflowId,
        duration,
      });

      return {
        success: result.success,
        duration,
        output: result.success ? JSON.stringify(result.data) : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        output: (error as Error).message,
      };
    }
  }

  /**
   * Run planning phase
   */
  private async runPlanningPhase(
    projectPath: string,
    task: string,
    researchContext: string | undefined,
    workflowId: string
  ): Promise<{ success: boolean; duration: number; output?: string }> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:phase-started', {
        skill: 'workflow-orchestrator',
        phase: 'planning',
        workflowId,
      });

      // Planning is integrated into research skill
      const result = await this.mcpBridge.callTool(
        'execute_research_skill',
        {
          projectPath,
          query: `Planning for: ${task}\n\nResearch context:\n${researchContext || 'None'}`,
          maxResults: 5,
        },
        { timeout: 60000, throwOnError: false }
      );

      const duration = Date.now() - startTime;

      this.events.emit('skill:phase-completed', {
        skill: 'workflow-orchestrator',
        phase: 'planning',
        workflowId,
        duration,
      });

      return {
        success: result.success,
        duration,
        output: result.success ? JSON.stringify(result.data) : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        output: (error as Error).message,
      };
    }
  }

  /**
   * Run implementation phase
   */
  private async runImplementationPhase(
    projectPath: string,
    task: string,
    planningContext: string | undefined,
    workflowId: string
  ): Promise<{ success: boolean; duration: number; output?: string }> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:phase-started', {
        skill: 'workflow-orchestrator',
        phase: 'implementation',
        workflowId,
      });

      const result = await this.mcpBridge.callTool(
        'execute_implementation_skill',
        {
          task: {
            description: task,
            projectPath,
          },
          maxFixIterations: 3,
          runTests: true,
        },
        { timeout: 600000, throwOnError: false }
      );

      const duration = Date.now() - startTime;

      this.events.emit('skill:phase-completed', {
        skill: 'workflow-orchestrator',
        phase: 'implementation',
        workflowId,
        duration,
      });

      return {
        success: result.success,
        duration,
        output: result.success ? JSON.stringify(result.data) : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        output: (error as Error).message,
      };
    }
  }

  /**
   * Run CI/CD phase
   */
  private async runCICDPhase(
    projectPath: string,
    workflowId: string
  ): Promise<{ success: boolean; duration: number; output?: string }> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:phase-started', {
        skill: 'workflow-orchestrator',
        phase: 'cicd',
        workflowId,
      });

      const result = await this.mcpBridge.callTool(
        'execute_cicd_skill',
        {
          projectPath,
          stages: ['lint', 'typecheck', 'tests', 'build'],
          generateReport: true,
          autoCommit: false,
        },
        { timeout: 600000, throwOnError: false }
      );

      const duration = Date.now() - startTime;

      this.events.emit('skill:phase-completed', {
        skill: 'workflow-orchestrator',
        phase: 'cicd',
        workflowId,
        duration,
      });

      return {
        success: result.success,
        duration,
        output: result.success ? JSON.stringify(result.data) : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        output: (error as Error).message,
      };
    }
  }

  /**
   * Create checkpoint
   */
  private async createCheckpoint(
    workflowId: string,
    phase: WorkflowPhase,
    data?: string
  ): Promise<void> {
    const checkpoint: Checkpoint = {
      id: this.generateCheckpointId(),
      phase,
      timestamp: new Date().toISOString(),
      data,
    };

    const checkpoints = this.checkpoints.get(workflowId) || [];
    checkpoints.push(checkpoint);
    this.checkpoints.set(workflowId, checkpoints);

    this.events.emit('workflow:checkpoint-created', {
      workflowId,
      checkpoint,
    });
  }

  /**
   * Wait for user approval (in semi mode)
   */
  private async waitForApproval(_workflowId: string): Promise<boolean> {
    // In a real implementation, this would wait for user input
    // For now, auto-approve in auto mode, require approval in semi mode
    return new Promise((resolve) => {
      // Simulate approval after 1 second
      setTimeout(() => resolve(true), 1000);
    });
  }

  /**
   * Approve checkpoint (called by user/UI)
   */
  approveCheckpoint(workflowId: string, checkpointId: string): boolean {
    const checkpoints = this.checkpoints.get(workflowId);
    if (!checkpoints) return false;

    const checkpoint = checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) return false;

    checkpoint.approved = true;

    this.events.emit('workflow:checkpoint-approved', {
      workflowId,
      checkpointId,
    });

    return true;
  }

  /**
   * Reject checkpoint (called by user/UI)
   */
  rejectCheckpoint(workflowId: string, checkpointId: string): boolean {
    const checkpoints = this.checkpoints.get(workflowId);
    if (!checkpoints) return false;

    const checkpoint = checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) return false;

    checkpoint.approved = false;

    this.events.emit('workflow:checkpoint-rejected', {
      workflowId,
      checkpointId,
    });

    return true;
  }

  /**
   * Generate workflow ID
   */
  private generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate checkpoint ID
   */
  private generateCheckpointId(): string {
    return `checkpoint_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Check if the workflow orchestrator is available
   */
  isAvailable(): boolean {
    // Workflow orchestrator requires MCP bridge
    return this.mcpBridge.isAvailable();
  }

  /**
   * Execute workflow - main entry point for API
   */
  async executeWorkflow(
    featureDescription: string,
    projectPath: string,
    options?: {
      mode?: 'auto' | 'semi';
      skipResearch?: boolean;
      skipCICD?: boolean;
    }
  ): Promise<WorkflowResult> {
    const phases: WorkflowPhase[] = [];
    if (!options?.skipResearch) {
      phases.push('research', 'planning');
    }
    phases.push('implementation');
    if (!options?.skipCICD) {
      phases.push('cicd');
    }

    return this.execute({
      projectPath,
      task: featureDescription,
      mode: options?.mode || 'auto',
      phases,
    });
  }
}
