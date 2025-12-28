/**
 * AutoMode-Specialized Agent Integration
 *
 * This module provides integration between AutoModeService and the specialized
 * worker agent system. It enables AutoMode to use specialized agents for
 * different phases of feature implementation.
 */

import type { AgentType, ParsedTask } from '@automaker/types';
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
    const startTime = Date.now();

    // Determine which agent to use
    let agentType: AgentType;

    if (this.config.autoClassifyTasks && params.phase === 'implementation') {
      // Classify the task to find the best agent
      const classification = this.classifyTask(params.task);
      agentType = classification.agentType;

      // Emit classification event
      this.events.emit('auto-mode:event', {
        type: 'agent_task_classified',
        featureId: params.context.featureId,
        taskId: params.task.id,
        taskDescription: params.task.description,
        agentType,
        confidence: classification.confidence,
        reason: classification.reason,
      });
    } else {
      // Use the configured agent for this phase
      agentType = this.getAgentForPhase(params.phase);
    }

    // Emit agent start event
    this.events.emit('auto-mode:event', {
      type: 'agent_execution_start',
      featureId: params.context.featureId,
      taskId: params.task.id,
      taskDescription: params.task.description,
      phase: params.phase,
      agentType,
    });

    // Execute with the specialized agent
    const result = await specializedAgentService.executeTaskWithAgent(
      {
        featureId: params.context.featureId,
        projectPath: params.context.projectPath,
        cwd: params.context.cwd,
        currentTask: params.task.description,
        previousContext: params.context.previousContext,
        userFeedback: params.context.userFeedback,
        abortController: params.context.abortController,
      },
      params.taskPrompt,
      params.imagePaths,
      params.model,
      {
        forceAgentType: agentType,
      }
    );

    const duration = Date.now() - startTime;

    // Record execution metadata
    this.executionHistory.push({
      taskType: params.phase,
      agentType,
      taskId: params.task.id,
      duration,
      success: result.success,
    });

    // Emit agent completion event
    this.events.emit('auto-mode:event', {
      type: 'agent_execution_complete',
      featureId: params.context.featureId,
      taskId: params.task.id,
      taskDescription: params.task.description,
      phase: params.phase,
      agentType,
      duration,
      success: result.success,
      toolsUsed: result.toolsUsed,
    });

    return {
      output: result.output,
      agentType,
      duration,
      success: result.success,
    };
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): {
    totalExecutions: number;
    byAgentType: Record<AgentType, number>;
    byPhase: Record<'planning' | 'implementation' | 'testing', number>;
    avgDurationByAgent: Record<AgentType, number>;
    successRateByAgent: Record<AgentType, number>;
  } {
    const stats = {
      totalExecutions: this.executionHistory.length,
      byAgentType: {} as Record<AgentType, number>,
      byPhase: { planning: 0, implementation: 0, testing: 0 },
      avgDurationByAgent: {} as Record<AgentType, number>,
      successRateByAgent: {} as Record<AgentType, number>,
    };

    const durationsByAgent: Record<AgentType, number[]> = {};
    const successByAgent: Record<AgentType, { success: number; total: number }> = {};

    for (const execution of this.executionHistory) {
      // Count by agent type
      stats.byAgentType[execution.agentType] =
        (stats.byAgentType[execution.agentType] || 0) + 1;

      // Count by phase
      stats.byPhase[execution.taskType]++;

      // Track durations
      if (!durationsByAgent[execution.agentType]) {
        durationsByAgent[execution.agentType] = [];
      }
      durationsByAgent[execution.agentType].push(execution.duration);

      // Track success rates
      if (!successByAgent[execution.agentType]) {
        successByAgent[execution.agentType] = { success: 0, total: 0 };
      }
      successByAgent[execution.agentType].total++;
      if (execution.success) {
        successByAgent[execution.agentType].success++;
      }
    }

    // Calculate averages
    for (const [agentType, durations] of Object.entries(durationsByAgent)) {
      const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      stats.avgDurationByAgent[agentType as AgentType] = avg;
    }

    // Calculate success rates
    for (const [agentType, record] of Object.entries(successByAgent)) {
      const rate = record.success / record.total;
      stats.successRateByAgent[agentType as AgentType] = rate;
    }

    return stats;
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
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Get recommendations for optimizing agent selection
   */
  getRecommendations(): Array<{
    type: 'agent_usage' | 'performance' | 'configuration';
    message: string;
    suggestion?: string;
  }> {
    const recommendations: Array<{
      type: 'agent_usage' | 'performance' | 'configuration';
      message: string;
      suggestion?: string;
    }> = [];
    const stats = this.getExecutionStats();

    // Check if specialized agents are being used
    if (!this.config.useSpecializedAgents) {
      recommendations.push({
        type: 'configuration',
        message: 'Specialized agents are disabled',
        suggestion: 'Enable useSpecializedAgents to leverage specialized agents for different task types',
      });
    }

    // Check auto-classification
    if (!this.config.autoClassifyTasks) {
      recommendations.push({
        type: 'configuration',
        message: 'Auto-classification is disabled',
        suggestion: 'Enable autoClassifyTasks to automatically select the best agent for each task',
      });
    }

    // Check for underutilized agents
    for (const [agentType, count] of Object.entries(stats.byAgentType)) {
      if (count === 0) {
        recommendations.push({
          type: 'agent_usage',
          message: `Agent ${agentType} has not been used`,
          suggestion: `Consider if tasks could benefit from using the ${agentType} agent`,
        });
      }
    }

    // Check for low success rates
    for (const [agentType, rate] of Object.entries(stats.successRateByAgent)) {
      if (rate < 0.7 && stats.byAgentType[agentType as AgentType] >= 5) {
        recommendations.push({
          type: 'performance',
          message: `Agent ${agentType} has a low success rate (${(rate * 100).toFixed(0)}%)`,
          suggestion: `Review ${agentType} agent's system prompt or consider using a different agent for these tasks`,
        });
      }
    }

    // Check for slow agents
    for (const [agentType, avgDuration] of Object.entries(stats.avgDurationByAgent)) {
      if (avgDuration > 60000 && stats.byAgentType[agentType as AgentType] >= 5) {
        // > 1 minute average
        recommendations.push({
          type: 'performance',
          message: `Agent ${agentType} has a high average duration (${(avgDuration / 1000).toFixed(0)}s)`,
          suggestion: `Consider optimizing ${agentType} agent's maxTurns or system prompt for faster execution`,
        });
      }
    }

    return recommendations;
  }
}

/**
 * Create an integration instance for use with AutoModeService
 */
export function createAutoModeAgentIntegration(
  events: EventEmitter,
  config?: Partial<AutoModeAgentConfig>
): AutoModeAgentIntegration {
  return new AutoModeAgentIntegration(events, config);
}
