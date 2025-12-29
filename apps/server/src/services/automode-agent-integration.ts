/**
 * AutoMode-Specialized Agent Integration
 *
 * This module provides integration between AutoModeService and the specialized
 * worker agent system. It enables AutoMode to use specialized agents for
 * different phases of feature implementation.
 */

import { AgentType, type ParsedTask } from '@automaker/types';
import { specializedAgentService } from '../agents/specialized-agent-service.js';
import type { EventEmitter } from '../lib/events.js';

/**
 * Integration configuration for using specialized agents in AutoMode
 */
export interface AutoModeAgentConfig {
  /** Whether to use specialized agents (true) or generic agent (false) */
  useSpecializedAgents: boolean;

  /** Which agent to use for planning phase */
  planningAgent?: AgentType;

  /** Which agent to use for implementation tasks */
  implementationAgent?: AgentType;

  /** Which agent to use for testing tasks */
  testingAgent?: AgentType;

  /** Whether to automatically classify tasks */
  autoClassifyTasks: boolean;
}

/**
 * Default configuration for specialized agent integration
 */
const DEFAULT_CONFIG: AutoModeAgentConfig = {
  useSpecializedAgents: true,
  planningAgent: 'planning',
  implementationAgent: 'implementation',
  testingAgent: 'testing',
  autoClassifyTasks: true,
};

/**
 * Agent execution metadata for tracking
 */
export interface AgentExecutionMetadata {
  taskType: 'planning' | 'implementation' | 'testing';
  agentType: AgentType;
  taskId?: string;
  duration: number;
  success: boolean;
}

/**
 * Integration service for AutoMode + Specialized Agents
 */
export class AutoModeAgentIntegration {
  private events: EventEmitter;
  private config: AutoModeAgentConfig;
  private executionHistory: AgentExecutionMetadata[] = [];

  constructor(events: EventEmitter, config?: Partial<AutoModeAgentConfig>) {
    this.events = events;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AutoModeAgentConfig>): void {
    this.config = { ...this.config, ...updates };

    this.events.emit('auto-mode:config-updated', {
      timestamp: Date.now(),
      config: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoModeAgentConfig {
    return { ...this.config };
  }

  /**
   * Classify a parsed task to determine which specialized agent should handle it
   */
  classifyTask(task: ParsedTask): {
    agentType: AgentType;
    confidence: number;
    reason: string;
  } {
    if (!this.config.useSpecializedAgents || !this.config.autoClassifyTasks) {
      // Use default implementation agent
      return {
        agentType: this.config.implementationAgent || 'implementation',
        confidence: 1.0,
        reason: 'Using default implementation agent (auto-classification disabled)',
      };
    }

    // Classify the task based on its description
    const { recommendedAgent, classification } = specializedAgentService.classifyTask(
      task.description
    );

    return {
      agentType: recommendedAgent,
      confidence: classification.confidence,
      reason: classification.reason,
    };
  }

  /**
   * Get the appropriate agent for a given phase
   */
  getAgentForPhase(phase: 'planning' | 'implementation' | 'testing'): AgentType {
    switch (phase) {
      case 'planning':
        return this.config.planningAgent || 'planning';
      case 'testing':
        return this.config.testingAgent || 'testing';
      case 'implementation':
      default:
        return this.config.implementationAgent || 'implementation';
    }
  }

  /**
   * Execute a task using a specialized agent
   */
  async executeTaskWithSpecializedAgent(params: {
    task: ParsedTask;
    phase: 'planning' | 'implementation' | 'testing';
    context: {
      featureId: string;
      projectPath: string;
      cwd: string;
      abortController: AbortController;
      previousContext?: string;
      userFeedback?: string;
    };
    taskPrompt: string;
    imagePaths?: string[];
    model?: string;
  }): Promise<{
    output: string;
    agentType: AgentType;
    duration: number;
    success: boolean;
  }> {
    // Determine which agent to use
    let agentType: AgentType;

    if (this.config.autoClassifyTasks && params.phase === 'implementation') {
      // Auto-classify for implementation tasks
      const classification = this.classifyTask(params.task);
      agentType = classification.agentType;

      this.events.emit('auto-mode:agent-selected', {
        timestamp: Date.now(),
        phase: params.phase,
        agentType,
        confidence: classification.confidence,
        reason: classification.reason,
      });
    } else {
      // Use configured agent for the phase
      agentType = this.getAgentForPhase(params.phase);
    }

    // Build the full prompt
    let fullPrompt = params.taskPrompt;

    if (params.context.previousContext) {
      fullPrompt = `${params.taskPrompt}\n\nPrevious context:\n${params.context.previousContext}`;
    }

    if (params.context.userFeedback) {
      fullPrompt = `${fullPrompt}\n\nUser feedback:\n${params.context.userFeedback}`;
    }

    // Execute with the specialized agent
    const result = await specializedAgentService.executeTaskWithAgent(
      {
        featureId: params.context.featureId,
        projectPath: params.context.projectPath,
        cwd: params.context.cwd,
        currentTask: params.task.description,
        abortController: params.context.abortController,
      },
      fullPrompt,
      params.imagePaths,
      params.model
    );

    // Record execution metadata
    const metadata: AgentExecutionMetadata = {
      taskType: params.phase,
      agentType: result.agentType,
      taskId: params.task.id,
      duration: result.duration,
      success: result.success,
    };

    this.executionHistory.push(metadata);

    // Emit event
    this.events.emit('auto-mode:agent-execution', {
      timestamp: Date.now(),
      metadata,
    });

    return {
      output: result.output,
      agentType: result.agentType,
      duration: result.duration,
      success: result.success,
    };
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): AgentExecutionMetadata[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return [...this.executionHistory];
  }

  /**
   * Get statistics about agent usage
   */
  getStatistics(): {
    byAgentType: Record<string, { count: number; successRate: number; avgDuration: number }>;
    byPhase: Record<string, { count: number; avgDuration: number }>;
    totalExecutions: number;
  } {
    const byAgentType: Record<string, { count: number; successRate: number; avgDuration: number }> =
      {};
    const byPhase: Record<string, { count: number; avgDuration: number }> = {};

    for (const execution of this.executionHistory) {
      // By agent type
      if (!byAgentType[execution.agentType]) {
        byAgentType[execution.agentType] = { count: 0, successRate: 1, avgDuration: 0 };
      }
      byAgentType[execution.agentType].count++;
      byAgentType[execution.agentType].successRate =
        byAgentType[execution.agentType].successRate * 0.9 + (execution.success ? 1 : 0) * 0.1;
      byAgentType[execution.agentType].avgDuration =
        byAgentType[execution.agentType].avgDuration * 0.9 + execution.duration * 0.1;

      // By phase
      if (!byPhase[execution.taskType]) {
        byPhase[execution.taskType] = { count: 0, avgDuration: 0 };
      }
      byPhase[execution.taskType].count++;
      byPhase[execution.taskType].avgDuration =
        byPhase[execution.taskType].avgDuration * 0.9 + execution.duration * 0.1;
    }

    return {
      byAgentType,
      byPhase,
      totalExecutions: this.executionHistory.length,
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Get recommendation for task execution
   */
  getRecommendation(taskDescription: string): {
    agentType: AgentType;
    reason: string;
  } {
    const { recommendedAgent, classification } =
      specializedAgentService.classifyTask(taskDescription);

    return {
      agentType: recommendedAgent,
      reason: classification.reason,
    };
  }
}

/**
 * Create a new AutoMode agent integration instance
 */
export function createAutoModeAgentIntegration(
  events: EventEmitter,
  config?: Partial<AutoModeAgentConfig>
): AutoModeAgentIntegration {
  return new AutoModeAgentIntegration(events, config);
}
