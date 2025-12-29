/**
 * Agent Registry
 *
 * Manages the registration, configuration, and usage statistics of
 * specialized worker agents. Provides methods to query, select, and
 * track agent performance.
 */

import {
  AgentType,
  type AgentConfig,
  type AgentRegistryEntry,
  type AgentExecutionResult,
} from '@automaker/types';
import { getAgentConfigurations } from './agent-prompts.js';

/**
 * Agent Registry - manages available agents and their statistics
 */
export class AgentRegistry {
  private agents: Map<AgentType, AgentRegistryEntry>;
  private classificationHistory: Array<{
    timestamp: number;
    task: string;
    classifiedAs: AgentType;
    confidence: number;
    success: boolean;
  }> = [];

  constructor() {
    // Initialize with all agent configurations
    const configs = getAgentConfigurations();
    this.agents = new Map();

    for (const [agentType, config] of Object.entries(configs)) {
      this.agents.set(agentType as AgentType, {
        config,
        stats: {
          usageCount: 0,
          successRate: 1.0, // Start optimistic
          avgDuration: 0,
          lastUsed: 0,
        },
      });
    }
  }

  /**
   * Get all available agent types
   */
  getAvailableAgentTypes(): AgentType[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get agent configuration by type
   */
  getAgentConfig(agentType: AgentType): AgentConfig | null {
    const entry = this.agents.get(agentType);
    return entry?.config || null;
  }

  /**
   * Get agent registry entry by type
   */
  getAgentEntry(agentType: AgentType): AgentRegistryEntry | null {
    return this.agents.get(agentType) || null;
  }

  /**
   * Get all auto-selectable agents sorted by priority
   */
  getAutoSelectableAgents(): AgentType[] {
    const agents = Array.from(this.agents.entries())
      .filter(([_, entry]) => entry.config.autoSelectable)
      .sort((a, b) => b[1].config.priority - a[1].config.priority);

    return agents.map(([agentType]) => agentType);
  }

  /**
   * Get agents that can use a specific tool
   */
  getAgentsWithTool(toolName: string): AgentType[] {
    const result: AgentType[] = [];

    for (const [agentType, entry] of this.agents.entries()) {
      const { allowedTools } = entry.config;

      // If no tools are restricted, agent can use any tool
      if (!allowedTools || allowedTools.length === 0) {
        result.push(agentType);
        continue;
      }

      // Check if tool is in allowed list
      if (allowedTools.includes(toolName)) {
        result.push(agentType);
      }
    }

    return result;
  }

  /**
   * Get the best agent for a given capability
   */
  getAgentForCapability(capabilityName: string): AgentType | null {
    let bestAgent: AgentType | null = null;
    let bestConfidence = 0;

    for (const [agentType, entry] of this.agents.entries()) {
      const capability = entry.config.capabilities.find((cap) => cap.name === capabilityName);

      if (capability && capability.confidence > bestConfidence) {
        bestConfidence = capability.confidence;
        bestAgent = agentType;
      }
    }

    return bestAgent;
  }

  /**
   * Record agent execution and update statistics
   */
  recordExecution(result: AgentExecutionResult): void {
    const entry = this.agents.get(result.agentType);

    if (!entry) {
      console.warn(`[AgentRegistry] Unknown agent type: ${result.agentType}`);
      return;
    }

    const { stats } = entry;

    // Update usage count
    stats.usageCount++;

    // Update success rate using exponential moving average
    const success = result.success ? 1 : 0;
    stats.successRate = stats.successRate * 0.9 + success * 0.1;

    // Update average duration using exponential moving average
    if (stats.avgDuration === 0) {
      stats.avgDuration = result.duration;
    } else {
      stats.avgDuration = stats.avgDuration * 0.9 + result.duration * 0.1;
    }

    // Update last used timestamp
    stats.lastUsed = Date.now();

    // Record in classification history
    this.classificationHistory.push({
      timestamp: Date.now(),
      task: result.output.substring(0, 100), // Truncated output as task identifier
      classifiedAs: result.agentType,
      confidence: 1, // Not tracking confidence in results
      success: result.success,
    });

    // Keep history bounded
    if (this.classificationHistory.length > 1000) {
      this.classificationHistory = this.classificationHistory.slice(-500);
    }
  }

  /**
   * Get agent statistics
   */
  getAgentStats(agentType: AgentType): {
    usageCount: number;
    successRate: number;
    avgDuration: number;
    lastUsed: number;
  } | null {
    const entry = this.agents.get(agentType);
    return entry?.stats || null;
  }

  /**
   * Get all agent statistics
   */
  getAllAgentStats(): Map<
    AgentType,
    { usageCount: number; successRate: number; avgDuration: number; lastUsed: number }
  > {
    const stats = new Map();
    for (const [agentType, entry] of this.agents.entries()) {
      stats.set(agentType, { ...entry.stats });
    }
    return stats;
  }

  /**
   * Get the best agent for a task based on historical performance
   */
  getBestAgentForTask(taskDescription: string): AgentType | null {
    // Look for similar past tasks
    const lowerTask = taskDescription.toLowerCase();

    // Find recent similar successful executions
    const recentHistory = this.classificationHistory
      .filter((entry) => entry.success && Date.now() - entry.timestamp < 7 * 24 * 60 * 60 * 1000)
      .slice(-50);

    for (const entry of recentHistory) {
      // Simple similarity check
      const entryWords = entry.task.toLowerCase().split(/\s+/);
      const taskWords = lowerTask.split(/\s+/);
      const commonWords = entryWords.filter((w) => taskWords.includes(w));

      if (commonWords.length >= 2) {
        return entry.classifiedAs;
      }
    }

    // No historical match, return null
    return null;
  }

  /**
   * Get recommendation for task execution
   */
  getRecommendation(taskDescription: string): {
    agentType: AgentType;
    confidence: number;
    reason: string;
  } {
    // Check historical data first
    const historicalAgent = this.getBestAgentForTask(taskDescription);

    if (historicalAgent) {
      const stats = this.getAgentStats(historicalAgent);
      return {
        agentType: historicalAgent,
        confidence: stats?.successRate || 0.8,
        reason: 'Successfully used for similar tasks',
      };
    }

    // Default to implementation agent
    return {
      agentType: AgentType.IMPLEMENTATION,
      confidence: 0.7,
      reason: 'Default agent for general tasks',
    };
  }

  /**
   * Register a custom agent
   */
  registerCustomAgent(config: AgentConfig): void {
    this.agents.set(config.type, {
      config,
      stats: {
        usageCount: 0,
        successRate: 1.0,
        avgDuration: 0,
        lastUsed: 0,
      },
    });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentType: AgentType): boolean {
    return this.agents.delete(agentType);
  }

  /**
   * Reset all statistics
   */
  resetStats(): void {
    for (const entry of this.agents.values()) {
      entry.stats = {
        usageCount: 0,
        successRate: 1.0,
        avgDuration: 0,
        lastUsed: 0,
      };
    }
    this.classificationHistory = [];
  }

  /**
   * Export registry state
   */
  exportState(): {
    agents: Record<string, AgentRegistryEntry>;
    history: typeof this.classificationHistory;
  } {
    const agents: Record<string, AgentRegistryEntry> = {};
    for (const [key, value] of this.agents.entries()) {
      agents[key] = value;
    }

    return {
      agents,
      history: this.classificationHistory,
    };
  }

  /**
   * Import registry state
   */
  importState(state: {
    agents: Record<string, AgentRegistryEntry>;
    history: typeof this.classificationHistory;
  }): void {
    this.agents = new Map();
    for (const [key, value] of Object.entries(state.agents)) {
      this.agents.set(key as AgentType, value);
    }
    this.classificationHistory = state.history;
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry();
