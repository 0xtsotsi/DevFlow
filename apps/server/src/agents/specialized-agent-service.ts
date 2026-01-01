/**
 * Specialized Agent Service
 *
 * Orchestrates the use of specialized worker agents. This service integrates
 * with the AutoModeService to provide intelligent agent selection and execution
 * based on task classification.
 */

import { ProviderFactory } from '../providers/provider-factory.js';
import type {
  AgentType,
  AgentConfig,
  AgentExecutionContext,
  AgentExecutionResult,
  ExecuteOptions,
  ConversationMessage,
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
      conversationHistory?: ConversationMessage[];
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
      // Calculate duration even for failed executions
      const duration = Date.now() - startTime;

      // Build failure result
      const result: AgentExecutionResult = {
        agentType,
        success: false,
        output: '',
        toolsUsed: [],
        duration,
        error: error instanceof Error ? error.message : String(error),
      };

      // Record execution in registry
      agentRegistry.recordExecution(result);

      return result;
    }
  }

  /**
   * Execute a multi-agent workflow where different agents handle different aspects
   */
  async executeMultiAgentWorkflow(
    context: AgentExecutionContext,
    workflow: Array<{
      taskPrompt: string;
      agentType?: AgentType; // Optional: auto-classify if not specified
      imagePaths?: string[];
      dependsOn?: string[]; // Names of previous steps this depends on
    }>,
    model?: string
  ): Promise<
    Array<{
      stepName: string;
      result: AgentExecutionResult;
    }>
  > {
    const results: Array<{ stepName: string; result: AgentExecutionResult }> = [];
    const stepOutputs = new Map<string, string>();

    // Execute steps in order, respecting dependencies
    for (let i = 0; i < workflow.length; i++) {
      const step = workflow[i];
      const stepName = `Step ${i + 1}`;

      // Check if dependencies are met
      if (step.dependsOn) {
        const missingDeps = step.dependsOn.filter((dep) => !stepOutputs.has(dep));
        if (missingDeps.length > 0) {
          throw new Error(`Step ${i + 1} has missing dependencies: ${missingDeps.join(', ')}`);
        }
      }

      // Augment prompt with outputs from dependencies
      let augmentedPrompt = step.taskPrompt;
      if (step.dependsOn && step.dependsOn.length > 0) {
        augmentedPrompt += '\n\n## Context from Previous Steps\n\n';
        for (const dep of step.dependsOn) {
          const depOutput = stepOutputs.get(dep);
          if (depOutput) {
            augmentedPrompt += `### ${dep}\n${depOutput}\n\n`;
          }
        }
      }

      // Execute the step
      const result = await this.executeTaskWithAgent(
        context,
        augmentedPrompt,
        step.imagePaths,
        model,
        {
          forceAgentType: step.agentType,
        }
      );

      // Store output for dependent steps
      if (result.success) {
        stepOutputs.set(stepName, result.output);
      }

      results.push({ stepName, result });

      // Stop if a step fails
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * Build system prompt by combining agent's system prompt with context
   */
  private buildSystemPrompt(agentConfig: AgentConfig, context: AgentExecutionContext): string {
    let systemPrompt = agentConfig.systemPrompt;

    // Add feature context if available
    if (context.featureId) {
      systemPrompt += `\n\n## Current Context\nYou are working on feature: ${context.featureId}\n`;
    }

    // Add current task if available
    if (context.currentTask) {
      systemPrompt += `Current task: ${context.currentTask}\n`;
    }

    // Add user feedback if available
    if (context.userFeedback) {
      systemPrompt += `\n## User Feedback\n${context.userFeedback}\n`;
    }

    return systemPrompt;
  }

  /**
   * Get information about all available agents
   */
  getAvailableAgents(): Array<{
    type: AgentType;
    config: AgentConfig;
    stats: ReturnType<typeof agentRegistry.getAgentStats>;
  }> {
    const agentTypes = agentRegistry.getAvailableAgentTypes();
    const agents = agentTypes.map((type) => {
      const config = agentRegistry.getAgentConfig(type);
      const stats = agentRegistry.getAgentStats(type);

      return {
        type,
        config: config!,
        stats,
      };
    });

    return agents;
  }

  /**
   * Get recommended agents based on usage and success rates
   */
  getRecommendedAgents(count = 3): ReturnType<typeof agentRegistry.getRecommendedAgents> {
    return agentRegistry.getRecommendedAgents(count);
  }

  /**
   * Get agent usage statistics
   */
  getAgentStats(agentType: AgentType): ReturnType<typeof agentRegistry.getAgentStats> {
    return agentRegistry.getAgentStats(agentType);
  }

  /**
   * Get all agent statistics
   */
  getAllAgentStats(): ReturnType<typeof agentRegistry.getAllAgentStats> {
    return agentRegistry.getAllAgentStats();
  }

  /**
   * Reset agent statistics (useful for testing)
   */
  resetStats(agentType?: AgentType): void {
    if (agentType) {
      agentRegistry.resetAgentStats(agentType);
    } else {
      agentRegistry.resetAllStats();
    }
  }

  /**
   * Register a custom agent
   */
  registerCustomAgent(
    agentType: AgentType,
    config: AgentConfig
  ): ReturnType<typeof agentRegistry.registerCustomAgent> {
    return agentRegistry.registerCustomAgent(agentType, config);
  }

  /**
   * Unregister a custom agent
   */
  unregisterAgent(agentType: AgentType): boolean {
    return agentRegistry.unregisterAgent(agentType);
  }
}

// Export singleton instance
export const specializedAgentService = new SpecializedAgentService();
