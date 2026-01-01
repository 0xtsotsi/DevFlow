/**
 * Agent Registry
 *
 * Manages the registration, configuration, and usage statistics of
 * specialized worker agents. Provides methods to query, select, and
 * track agent performance.
 */

import type {
  AgentType,
  AgentConfig,
  AgentRegistryEntry,
  AgentExecutionResult,
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
      task: result.output.substring(0, 100), // Truncate for storage
      classifiedAs: result.agentType,
      confidence: 1.0, // We don't track this in execution results
      success: result.success,
    });

    // Keep history manageable
    if (this.classificationHistory.length > 1000) {
      this.classificationHistory = this.classificationHistory.slice(-500);
    }
  }

  /**
   * Get agent usage statistics
   */
  getAgentStats(agentType: AgentType): AgentRegistryEntry['stats'] | null {
    const entry = this.agents.get(agentType);
    return entry?.stats || null;
  }

  /**
   * Get all agents' usage statistics
   */
  getAllAgentStats(): Map<AgentType, AgentRegistryEntry['stats']> {
    const stats = new Map<AgentType, AgentRegistryEntry['stats']>();

    for (const [agentType, entry] of this.agents.entries()) {
      stats.set(agentType, { ...entry.stats });
    }

    return stats;
  }

  /**
   * Get classification history
   */
  getClassificationHistory(limit?: number): typeof this.classificationHistory {
    if (limit) {
      return this.classificationHistory.slice(-limit);
    }
    return [...this.classificationHistory];
  }

  /**
   * Reset statistics for an agent (useful for testing or fresh starts)
   */
  resetAgentStats(agentType: AgentType): void {
    const entry = this.agents.get(agentType);
    if (entry) {
      entry.stats = {
        usageCount: 0,
        successRate: 1.0,
        avgDuration: 0,
        lastUsed: 0,
      };
    }
  }

  /**
   * Reset all statistics
   */
  resetAllStats(): void {
    for (const agentType of this.agents.keys()) {
      this.resetAgentStats(agentType);
    }
    this.classificationHistory = [];
  }

  /**
   * Get recommended agents based on historical performance
   */
  getRecommendedAgents(count = 3): Array<{
    agentType: AgentType;
    config: AgentConfig;
    stats: AgentRegistryEntry['stats'];
    score: number;
  }> {
    const recommendations = Array.from(this.agents.entries())
      .filter(([_, entry]) => entry.config.autoSelectable)
      .map(([agentType, entry]) => {
        // Calculate a composite score
        const usageScore = Math.min(entry.stats.usageCount / 100, 1); // Cap at 100 uses
        const successScore = entry.stats.successRate;
        const recencyScore =
          entry.stats.lastUsed > 0
            ? Math.max(0, 1 - (Date.now() - entry.stats.lastUsed) / (30 * 24 * 60 * 60 * 1000)) // Decay over 30 days
            : 0.5;

        // Weighted score
        const score = usageScore * 0.3 + successScore * 0.5 + recencyScore * 0.2;

        return {
          agentType,
          config: entry.config,
          stats: entry.stats,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, count);

    return recommendations;
  }

  /**
   * Get agent that has been most successful for similar tasks
   */
  getBestAgentForTask(taskPrompt: string, similarTasksThreshold = 0.7): AgentType | null {
    // Find similar tasks in history
    const taskLower = taskPrompt.toLowerCase();
    const taskWords = taskLower.split(/\s+/).filter((w) => w.length > 3);

    // Score each historical task by similarity
    const similarTasks = this.classificationHistory.filter((record) => {
      const recordWords = record.task
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const commonWords = taskWords.filter((w) => recordWords.includes(w));
      const similarity = commonWords.length / Math.max(taskWords.length, recordWords.length);
      return similarity >= similarTasksThreshold;
    });

    if (similarTasks.length === 0) {
      return null;
    }

    // Find most successful agent for similar tasks
    const agentSuccess = new Map<AgentType, { success: number; total: number }>();

    for (const record of similarTasks) {
      const stats = agentSuccess.get(record.classifiedAs) || { success: 0, total: 0 };
      stats.total++;
      if (record.success) {
        stats.success++;
      }
      agentSuccess.set(record.classifiedAs, stats);
    }

    // Find agent with highest success rate among those with enough data
    let bestAgent: AgentType | null = null;
    let bestSuccessRate = 0;
    const minSamples = 3;

    for (const [agentType, stats] of agentSuccess.entries()) {
      if (stats.total >= minSamples) {
        const successRate = stats.success / stats.total;
        if (successRate > bestSuccessRate) {
          bestSuccessRate = successRate;
          bestAgent = agentType;
        }
      }
    }

    return bestAgent;
  }

  /**
   * Export registry state (for persistence)
   */
  exportState(): {
    agents: Record<string, AgentRegistryEntry>;
    history: Array<{
      timestamp: number;
      task: string;
      classifiedAs: AgentType;
      confidence: number;
      success: boolean;
    }>;
  } {
    const agents: Record<string, AgentRegistryEntry> = {};

    for (const [agentType, entry] of this.agents.entries()) {
      agents[agentType] = entry;
    }

    return {
      agents,
      history: this.classificationHistory,
    };
  }

  /**
   * Import registry state (for loading persisted state)
   */
  importState(state: {
    agents: Record<string, AgentRegistryEntry>;
    history: Array<{
      timestamp: number;
      task: string;
      classifiedAs: AgentType;
      confidence: number;
      success: boolean;
    }>;
  }): void {
    for (const [agentType, entry] of Object.entries(state.agents)) {
      this.agents.set(agentType as AgentType, entry);
    }
    this.classificationHistory = state.history;
  }

  /**
   * Validate agent configuration
   */
  validateAgentConfig(config: AgentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.name || config.name.trim().length === 0) {
      errors.push('Agent name is required');
    }

    if (!config.description || config.description.trim().length === 0) {
      errors.push('Agent description is required');
    }

    if (!config.systemPrompt || config.systemPrompt.trim().length === 0) {
      errors.push('System prompt is required');
    }

    if (config.defaultMaxTurns < 1 || config.defaultMaxTurns > 1000) {
      errors.push('Default max turns must be between 1 and 1000');
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (config.capabilities.length === 0) {
      errors.push('Agent must have at least one capability');
    }

    for (const cap of config.capabilities) {
      if (!cap.name || cap.name.trim().length === 0) {
        errors.push(`Capability name is required`);
      }
      if (cap.confidence < 0 || cap.confidence > 1) {
        errors.push(`Capability confidence must be between 0 and 1`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Register a custom agent (for extensibility)
   */
  registerCustomAgent(
    agentType: AgentType,
    config: AgentConfig
  ): { success: boolean; error?: string } {
    // Validate configuration
    const validation = this.validateAgentConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid agent configuration: ${validation.errors.join(', ')}`,
      };
    }

    // Register the agent
    this.agents.set(agentType, {
      config,
      stats: {
        usageCount: 0,
        successRate: 1.0,
        avgDuration: 0,
        lastUsed: 0,
      },
    });

    return { success: true };
  }

  /**
   * Unregister a custom agent
   */
  unregisterAgent(agentType: AgentType): boolean {
    // Don't allow unregistering built-in agents
    const builtInAgents: AgentType[] = [
      'planning',
      'implementation',
      'testing',
      'review',
      'debug',
      'documentation',
      'refactoring',
      'generic',
    ];

    if (builtInAgents.includes(agentType)) {
      return false;
    }

    return this.agents.delete(agentType);
  }
}

// Export singleton instance
export const agentRegistry = new AgentRegistry();
