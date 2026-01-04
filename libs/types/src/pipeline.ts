/**
 * Pipeline types for DevFlow custom workflow steps
 */

export interface PipelineStep {
  id: string;
  name: string;
  order: number;
  instructions: string;
  colorClass: string;
  createdAt: string;
  updatedAt: string;
  agentType?: string;
  allowedTools?: string[];
  // Beads integration - optional flag to spawn helper agent
  spawnBeadsHelper?: boolean;
  beadsHelperType?: string;
}

export interface PipelineConfig {
  version: 1;
  steps: PipelineStep[];
}

export type PipelineStatus = `pipeline_${string}`;

export type FeatureStatusWithPipeline =
  | 'backlog'
  | 'in_progress'
  | 'waiting_approval'
  | 'verified'
  | 'completed'
  | PipelineStatus;
