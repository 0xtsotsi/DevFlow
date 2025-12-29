/**
 * Specialized Agent Service
 *
 * Orchestrates the use of specialized worker agents. This service integrates
 * with the AutoModeService to provide intelligent agent selection and execution
 * based on task classification.
 */

import { ProviderFactory } from '../providers/provider-factory.js';
import {
  AgentType,
  type AgentConfig,
  type AgentExecutionContext,
  type AgentExecutionResult,
  type ExecuteOptions,
} from '@automaker/types';
import { agentRegistry } from './agent-registry.js';
import { taskClassifier } from './task-classifier.js';

/**
 * Specialized Agent Service
 *
 * Manages the selection and execution of specialized worker agents.
 */
export class SpecializedAgentService {
  /**
   * Classify a task and recommend the best agent
   */
  classifyTask(
    taskPrompt: string,
    filePaths?: string[]
  ): {
    classification: ReturnType<typeof taskClassifier.classifyTask>;
    analysis: ReturnType<typeof taskClassifier.analyzeTask>;
    recommendedAgent: AgentType;
  } {
    // Analyze the task
    const analysis = taskClassifier.analyzeTask(taskPrompt, filePaths);

    // Classify the task
    const classification = taskClassifier.classifyTask(analysis);

    // Check if we have historical data for similar tasks
    const bestHistoricalAgent = agentRegistry.getBestAgentForTask(taskPrompt);

    // Use historical agent if available and confidence is high
    let recommendedAgent = classification.agentType;
    if (bestHistoricalAgent && classification.confidence < 0.8) {
      recommendedAgent = bestHistoricalAgent;
    }

    return {
      classification,
      analysis,
      recommendedAgent,
    };
  }

  /**
   * Execute a task using the most appropriate specialized agent
   */
  async executeTaskWithAgent(
    context: AgentExecutionContext,
    taskPrompt: string,
    imagePaths?: string[],
    model?: string,
    options?: {
      forceAgentType?: AgentType; // Override automatic classification
      conversationHistory?: Array<{
        role: string;
        content: string | Array<{ type: string; text?: string }>;
      }>;
      previousContent?: string;
    }
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    // Determine which agent to use
    let agentType: AgentType;

    if (options?.forceAgentType) {
      agentType = options.forceAgentType;
    } else {
      const { recommendedAgent } = this.classifyTask(taskPrompt);
      agentType = recommendedAgent;
    }

    // Get agent configuration
    const agentConfig = agentRegistry.getAgentConfig(agentType);
    if (!agentConfig) {
      throw new Error(`Agent configuration not found for type: ${agentType}`);
    }

    // Merge agent-specific tools with any global restrictions
    let allowedTools = agentConfig.allowedTools;
    if (!allowedTools || allowedTools.length === 0) {
      // No tool restrictions for this agent
      allowedTools = undefined;
    }

    try {
      // Get provider
      const provider = ProviderFactory.getProviderForModel(model || 'claude-sonnet-4-5-20250929');

      // Build execution options
      const executeOptions: ExecuteOptions = {
        prompt: taskPrompt,
        model: model || 'claude-sonnet-4-5-20250929',
        cwd: context.cwd,
        systemPrompt: this.buildSystemPrompt(agentConfig, context),
        maxTurns: agentConfig.defaultMaxTurns,
        allowedTools,
        abortController: context.abortController,
        conversationHistory: options?.conversationHistory,
      };

      // Execute the task
      const stream = provider.executeQuery(executeOptions);
      let output = '';
      const toolsUsed = new Map<string, number>();

      // Process the stream
      for await (const msg of stream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              output += block.text || '';
            } else if (block.type === 'tool_use') {
              const toolName = block.name || 'unknown';
              toolsUsed.set(toolName, (toolsUsed.get(toolName) || 0) + 1);
            }
          }
        } else if (msg.type === 'error') {
          throw new Error(msg.error || 'Unknown error during agent execution');
        } else if (msg.type === 'result' && msg.subtype === 'success') {
          output += msg.result || '';
        }
      }

      // Calculate duration
      const duration = Date.now() - startTime;

      // Build result
      const result: AgentExecutionResult = {
        agentType,
        success: true,
        output,
        toolsUsed: Array.from(toolsUsed.entries()).map(([name, count]) => ({ name, count })),
        duration,
      };

      // Record execution in registry
      agentRegistry.recordExecution(result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: AgentExecutionResult = {
        agentType,
        success: false,
        output: '',
        toolsUsed: [],
        duration,
        error: errorMessage,
      };

      // Record failed execution
      agentRegistry.recordExecution(result);

      return result;
    }
  }

  /**
   * Execute a multi-agent workflow
   */
  async executeMultiAgentWorkflow(
    context: AgentExecutionContext,
    phases: Array<{
      agentType: AgentType;
      taskPrompt: string;
      imagePaths?: string[];
    }>,
    model?: string
  ): Promise<{
    results: AgentExecutionResult[];
    totalDuration: number;
    success: boolean;
  }> {
    const startTime = Date.now();
    const results: AgentExecutionResult[] = [];

    for (const phase of phases) {
      // Pass previous output as context
      const previousOutput =
        results.length > 0
          ? `\n\nPrevious phase output:\n${results[results.length - 1].output}`
          : '';

      const result = await this.executeTaskWithAgent(
        context,
        phase.taskPrompt + previousOutput,
        phase.imagePaths,
        model,
        { forceAgentType: phase.agentType }
      );

      results.push(result);

      // Stop if a phase fails
      if (!result.success) {
        break;
      }
    }

    const totalDuration = Date.now() - startTime;
    const success = results.every((r) => r.success);

    return {
      results,
      totalDuration,
      success,
    };
  }

  /**
   * Get available agents
   */
  getAvailableAgents(): Array<{
    type: AgentType;
    name: string;
    description: string;
    priority: number;
  }> {
    const agentTypes = agentRegistry.getAutoSelectableAgents();

    return agentTypes.map((type) => {
      const config = agentRegistry.getAgentConfig(type);
      return {
        type,
        name: config?.name || type,
        description: config?.description || '',
        priority: config?.priority || 0,
      };
    });
  }

  /**
   * Get agent statistics
   */
  getStatistics(): Record<
    string,
    {
      usageCount: number;
      successRate: number;
      avgDuration: number;
    }
  > {
    const allStats = agentRegistry.getAllAgentStats();
    const stats: Record<string, { usageCount: number; successRate: number; avgDuration: number }> =
      {};

    for (const [agentType, agentStats] of allStats.entries()) {
      stats[agentType] = {
        usageCount: agentStats.usageCount,
        successRate: agentStats.successRate,
        avgDuration: agentStats.avgDuration,
      };
    }

    return stats;
  }

  /**
   * Build system prompt for an agent
   */
  private buildSystemPrompt(config: AgentConfig, context: AgentExecutionContext): string {
    let prompt = config.systemPrompt;

    // Add context-specific information
    const contextInfo = `
## Current Context
- Feature ID: ${context.featureId}
- Working Directory: ${context.cwd}
${context.currentTask ? `- Current Task: ${context.currentTask}` : ''}
${context.previousContext ? `- Previous Context: ${context.previousContext.substring(0, 200)}...` : ''}

Remember to use the available tools to explore the codebase before making changes.
Always follow existing patterns and conventions.
`;

    return prompt + contextInfo;
  }
}

// Singleton instance
export const specializedAgentService = new SpecializedAgentService();
