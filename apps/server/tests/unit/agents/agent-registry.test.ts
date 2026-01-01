/**
 * Agent Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry } from '../../../src/agents/agent-registry.js';
import type { AgentType, AgentExecutionResult } from '@automaker/types';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  describe('initialization', () => {
    it('should initialize with all built-in agent types', () => {
      const agentTypes = registry.getAvailableAgentTypes();

      expect(agentTypes).toContain('planning');
      expect(agentTypes).toContain('implementation');
      expect(agentTypes).toContain('testing');
      expect(agentTypes).toContain('review');
      expect(agentTypes).toContain('debug');
      expect(agentTypes).toContain('documentation');
      expect(agentTypes).toContain('refactoring');
      expect(agentTypes).toContain('generic');
    });

    it('should have valid configurations for all agents', () => {
      const agentTypes = registry.getAvailableAgentTypes();

      for (const agentType of agentTypes) {
        const config = registry.getAgentConfig(agentType);
        expect(config).not.toBeNull();
        expect(config?.name).toBeTruthy();
        expect(config?.description).toBeTruthy();
        expect(config?.systemPrompt).toBeTruthy();
        expect(config?.capabilities.length).toBeGreaterThan(0);
      }
    });

    it('should initialize all agents with default stats', () => {
      const agentTypes = registry.getAvailableAgentTypes();

      for (const agentType of agentTypes) {
        const stats = registry.getAgentStats(agentType);
        expect(stats).toEqual({
          usageCount: 0,
          successRate: 1.0,
          avgDuration: 0,
          lastUsed: 0,
        });
      }
    });
  });

  describe('getAutoSelectableAgents', () => {
    it('should return only auto-selectable agents', () => {
      const agents = registry.getAutoSelectableAgents();

      for (const agentType of agents) {
        const config = registry.getAgentConfig(agentType);
        expect(config?.autoSelectable).toBe(true);
      }
    });

    it('should sort agents by priority', () => {
      const agents = registry.getAutoSelectableAgents();
      const priorities = agents.map((agentType) => {
        const config = registry.getAgentConfig(agentType);
        return config?.priority || 0;
      });

      // Check that priorities are in descending order
      for (let i = 1; i < priorities.length; i++) {
        expect(priorities[i] <= priorities[i - 1]).toBe(true);
      }
    });
  });

  describe('getAgentsWithTool', () => {
    it('should return agents that can use a specific tool', () => {
      // Planning agent allows Read, Glob, Grep
      const agents = registry.getAgentsWithTool('Read');

      expect(agents).toContain('planning');
      expect(agents).toContain('generic'); // No restrictions
    });

    it('should return all agents when no tool restrictions exist', () => {
      const agents = registry.getAgentsWithTool('AnyTool');

      // Generic agent has no restrictions, so it should be included
      expect(agents).toContain('generic');
    });
  });

  describe('getAgentForCapability', () => {
    it('should return the best agent for a capability', () => {
      const agent = registry.getAgentForCapability('create-specifications');

      expect(agent).toBe('planning');
    });

    it('should return null for unknown capability', () => {
      const agent = registry.getAgentForCapability('unknown-capability');

      expect(agent).toBeNull();
    });
  });

  describe('recordExecution', () => {
    it('should update agent statistics after recording execution', () => {
      const result: AgentExecutionResult = {
        agentType: 'implementation',
        success: true,
        output: 'Task completed successfully',
        toolsUsed: [{ name: 'Write', count: 3 }],
        duration: 5000,
      };

      registry.recordExecution(result);

      const stats = registry.getAgentStats('implementation');
      expect(stats?.usageCount).toBe(1);
      expect(stats?.lastUsed).toBeGreaterThan(0);
    });

    it('should calculate success rate correctly', () => {
      // Record 3 successful executions
      for (let i = 0; i < 3; i++) {
        registry.recordExecution({
          agentType: 'implementation',
          success: true,
          output: 'Success',
          toolsUsed: [],
          duration: 1000,
        });
      }

      // Record 1 failed execution
      registry.recordExecution({
        agentType: 'implementation',
        success: false,
        output: '',
        toolsUsed: [],
        duration: 500,
        error: 'Test error',
      });

      const stats = registry.getAgentStats('implementation');
      expect(stats?.successRate).toBeGreaterThan(0.7);
      expect(stats?.successRate).toBeLessThan(1.0);
    });

    it('should calculate average duration correctly', () => {
      registry.recordExecution({
        agentType: 'implementation',
        success: true,
        output: 'Task 1',
        toolsUsed: [],
        duration: 2000,
      });

      registry.recordExecution({
        agentType: 'implementation',
        success: true,
        output: 'Task 2',
        toolsUsed: [],
        duration: 4000,
      });

      const stats = registry.getAgentStats('implementation');
      expect(stats?.avgDuration).toBeGreaterThan(0);
      // Average should be around 3000ms (using exponential moving average)
      expect(stats?.avgDuration).toBeGreaterThan(2000);
      expect(stats?.avgDuration).toBeLessThan(4000);
    });
  });

  describe('resetAgentStats', () => {
    it('should reset statistics for a specific agent', () => {
      // Record some executions
      registry.recordExecution({
        agentType: 'implementation',
        success: true,
        output: 'Test',
        toolsUsed: [],
        duration: 1000,
      });

      // Reset
      registry.resetAgentStats('implementation');

      const stats = registry.getAgentStats('implementation');
      expect(stats).toEqual({
        usageCount: 0,
        successRate: 1.0,
        avgDuration: 0,
        lastUsed: 0,
      });
    });
  });

  describe('resetAllStats', () => {
    it('should reset statistics for all agents', () => {
      // Record executions for multiple agents
      registry.recordExecution({
        agentType: 'implementation',
        success: true,
        output: 'Test',
        toolsUsed: [],
        duration: 1000,
      });

      registry.recordExecution({
        agentType: 'testing',
        success: true,
        output: 'Test',
        toolsUsed: [],
        duration: 1000,
      });

      // Reset all
      registry.resetAllStats();

      const allStats = registry.getAllAgentStats();
      for (const [, stats] of allStats) {
        expect(stats.usageCount).toBe(0);
        expect(stats.successRate).toBe(1.0);
        expect(stats.avgDuration).toBe(0);
        expect(stats.lastUsed).toBe(0);
      }
    });
  });

  describe('getRecommendedAgents', () => {
    it('should return recommended agents based on performance', () => {
      // Record some executions with varying success
      registry.recordExecution({
        agentType: 'implementation',
        success: true,
        output: 'Test',
        toolsUsed: [],
        duration: 1000,
      });

      registry.recordExecution({
        agentType: 'implementation',
        success: true,
        output: 'Test',
        toolsUsed: [],
        duration: 1000,
      });

      const recommendations = registry.getRecommendedAgents(3);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.length).toBeLessThanOrEqual(3);
      expect(recommendations[0]).toHaveProperty('agentType');
      expect(recommendations[0]).toHaveProperty('config');
      expect(recommendations[0]).toHaveProperty('stats');
      expect(recommendations[0]).toHaveProperty('score');
    });

    it('should limit recommendations to specified count', () => {
      const recommendations = registry.getRecommendedAgents(2);

      expect(recommendations.length).toBeLessThanOrEqual(2);
    });
  });

  describe('registerCustomAgent', () => {
    it('should register a custom agent with valid configuration', () => {
      const customConfig = {
        type: 'custom' as AgentType,
        name: 'Custom Agent',
        description: 'A custom specialized agent',
        systemPrompt: 'You are a custom agent',
        defaultMaxTurns: 50,
        capabilities: [
          {
            name: 'custom-task',
            description: 'Performs custom tasks',
            tools: [],
            confidence: 0.8,
          },
        ],
        autoSelectable: true,
        priority: 5,
      };

      const result = registry.registerCustomAgent('custom', customConfig);

      expect(result.success).toBe(true);

      const config = registry.getAgentConfig('custom');
      expect(config).toEqual(customConfig);
    });

    it('should reject invalid agent configuration', () => {
      const invalidConfig = {
        type: 'custom' as AgentType,
        name: '', // Invalid: empty name
        description: 'Test',
        systemPrompt: 'Test',
        defaultMaxTurns: 50,
        capabilities: [],
        autoSelectable: true,
        priority: 5,
      };

      const result = registry.registerCustomAgent('custom', invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent name is required');
    });
  });

  describe('unregisterAgent', () => {
    it('should not allow unregistering built-in agents', () => {
      const result = registry.unregisterAgent('implementation');

      expect(result).toBe(false);

      // Agent should still exist
      const config = registry.getAgentConfig('implementation');
      expect(config).not.toBeNull();
    });

    it('should unregister custom agents', () => {
      // Register a custom agent
      const customConfig = {
        type: 'custom' as AgentType,
        name: 'Custom Agent',
        description: 'Test',
        systemPrompt: 'Test',
        defaultMaxTurns: 50,
        capabilities: [
          {
            name: 'test',
            description: 'Test',
            tools: [],
            confidence: 0.8,
          },
        ],
        autoSelectable: true,
        priority: 5,
      };

      registry.registerCustomAgent('custom', customConfig);

      // Unregister it
      const result = registry.unregisterAgent('custom');

      expect(result).toBe(true);

      // Agent should be gone
      const config = registry.getAgentConfig('custom');
      expect(config).toBeNull();
    });
  });

  describe('export and import state', () => {
    it('should export and import registry state correctly', () => {
      // Record some executions
      registry.recordExecution({
        agentType: 'implementation',
        success: true,
        output: 'Test',
        toolsUsed: [],
        duration: 1000,
      });

      // Export state
      const exportedState = registry.exportState();

      expect(exportedState.agents).toBeDefined();
      expect(exportedState.history).toBeDefined();
      expect(exportedState.history.length).toBeGreaterThan(0);

      // Create new registry and import state
      const newRegistry = new AgentRegistry();
      newRegistry.importState(exportedState);

      // Check that stats were imported
      const stats = newRegistry.getAgentStats('implementation');
      expect(stats?.usageCount).toBe(1);
    });
  });
});
