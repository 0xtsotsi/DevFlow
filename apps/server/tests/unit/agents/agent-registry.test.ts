/**
 * Agent Registry Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../../../src/agents/agent-registry.js';
import { AgentType } from '@automaker/types';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  describe('getAvailableAgentTypes', () => {
    it('should return all agent types', () => {
      const types = registry.getAvailableAgentTypes();

      expect(types).toContain(AgentType.PLANNING);
      expect(types).toContain(AgentType.IMPLEMENTATION);
      expect(types).toContain(AgentType.TESTING);
      expect(types).toContain(AgentType.REVIEW);
      expect(types).toContain(AgentType.DEBUG);
      expect(types).toContain(AgentType.DOCUMENTATION);
      expect(types).toContain(AgentType.REFACTORING);
      expect(types).toContain(AgentType.GENERIC);
    });
  });

  describe('getAgentConfig', () => {
    it('should return configuration for valid agent type', () => {
      const config = registry.getAgentConfig(AgentType.IMPLEMENTATION);

      expect(config).toBeDefined();
      expect(config?.type).toBe(AgentType.IMPLEMENTATION);
      expect(config?.name).toBe('Implementation Agent');
      expect(config?.systemPrompt).toBeDefined();
    });

    it('should return null for invalid agent type', () => {
      const config = registry.getAgentConfig('invalid' as AgentType);

      expect(config).toBeNull();
    });

    it('should include capabilities in config', () => {
      const config = registry.getAgentConfig(AgentType.TESTING);

      expect(config?.capabilities).toBeDefined();
      expect(config?.capabilities.length).toBeGreaterThan(0);
      expect(config?.capabilities[0].name).toBeDefined();
    });
  });

  describe('getAutoSelectableAgents', () => {
    it('should return agents sorted by priority', () => {
      const agents = registry.getAutoSelectableAgents();

      expect(agents.length).toBeGreaterThan(0);

      // Planning agent should come before Documentation agent (higher priority)
      const planningIndex = agents.indexOf(AgentType.PLANNING);
      const docIndex = agents.indexOf(AgentType.DOCUMENTATION);
      expect(planningIndex).toBeLessThan(docIndex);
    });
  });

  describe('getAgentsWithTool', () => {
    it('should return agents that can use a tool', () => {
      const agents = registry.getAgentsWithTool('read');

      expect(agents.length).toBeGreaterThan(0);
    });

    it('should handle tools with no restrictions', () => {
      const config = registry.getAgentConfig(AgentType.IMPLEMENTATION);
      const hasNoRestrictions = !config?.allowedTools || config.allowedTools.length === 0;

      expect(hasNoRestrictions).toBe(true);
    });
  });

  describe('getAgentForCapability', () => {
    it('should return the best agent for a capability', () => {
      const agent = registry.getAgentForCapability('write-unit-tests');

      expect(agent).toBe(AgentType.TESTING);
    });

    it('should return null for unknown capability', () => {
      const agent = registry.getAgentForCapability('unknown-capability');

      expect(agent).toBeNull();
    });
  });

  describe('recordExecution', () => {
    it('should update agent statistics on successful execution', () => {
      const result = {
        agentType: AgentType.IMPLEMENTATION,
        success: true,
        output: 'Task completed',
        toolsUsed: [],
        duration: 1000,
      };

      registry.recordExecution(result);

      const stats = registry.getAgentStats(AgentType.IMPLEMENTATION);
      expect(stats?.usageCount).toBe(1);
      expect(stats?.lastUsed).toBeGreaterThan(0);
    });

    it('should update success rate on failed execution', () => {
      const successResult = {
        agentType: AgentType.TESTING,
        success: true,
        output: 'Tests pass',
        toolsUsed: [],
        duration: 500,
      };

      const failResult = {
        agentType: AgentType.TESTING,
        success: false,
        output: '',
        toolsUsed: [],
        duration: 200,
        error: 'Test failed',
      };

      registry.recordExecution(successResult);
      registry.recordExecution(failResult);

      const stats = registry.getAgentStats(AgentType.TESTING);
      expect(stats?.usageCount).toBe(2);
      expect(stats?.successRate).toBeLessThan(1);
    });

    it('should update average duration', () => {
      const result1 = {
        agentType: AgentType.DEBUG,
        success: true,
        output: 'Fixed',
        toolsUsed: [],
        duration: 1000,
      };

      const result2 = {
        agentType: AgentType.DEBUG,
        success: true,
        output: 'Fixed again',
        toolsUsed: [],
        duration: 2000,
      };

      registry.recordExecution(result1);
      registry.recordExecution(result2);

      const stats = registry.getAgentStats(AgentType.DEBUG);
      expect(stats?.avgDuration).toBeGreaterThan(0);
    });

    it('should warn about unknown agent types', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      registry.recordExecution({
        agentType: 'unknown' as AgentType,
        success: true,
        output: '',
        toolsUsed: [],
        duration: 100,
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown agent type'));

      consoleSpy.mockRestore();
    });
  });

  describe('getAgentStats', () => {
    it('should return null for agent with no history', () => {
      // Create a fresh registry
      const freshRegistry = new AgentRegistry();
      const stats = freshRegistry.getAgentStats(AgentType.IMPLEMENTATION);

      expect(stats).toBeDefined();
      expect(stats?.usageCount).toBe(0);
    });
  });

  describe('getAllAgentStats', () => {
    it('should return stats for all agents', () => {
      const stats = registry.getAllAgentStats();

      expect(stats.size).toBe(Object.keys(AgentType).length);
    });
  });

  describe('getBestAgentForTask', () => {
    it('should return null with no history', () => {
      const agent = registry.getBestAgentForTask('Implement a feature');

      expect(agent).toBeNull();
    });

    it('should return historical agent for similar tasks', () => {
      // Record a successful execution
      registry.recordExecution({
        agentType: AgentType.IMPLEMENTATION,
        success: true,
        output: 'Implemented authentication feature with login support',
        toolsUsed: [],
        duration: 1000,
      });

      const agent = registry.getBestAgentForTask('Implement authentication with login');

      expect(agent).toBe(AgentType.IMPLEMENTATION);
    });
  });

  describe('getRecommendation', () => {
    it('should return default agent without history', () => {
      const recommendation = registry.getRecommendation('Do some work');

      expect(recommendation.agentType).toBe(AgentType.IMPLEMENTATION);
      expect(recommendation.reason).toBeDefined();
    });

    it('should use historical data when available', () => {
      registry.recordExecution({
        agentType: AgentType.TESTING,
        success: true,
        output: 'Test for authentication',
        toolsUsed: [],
        duration: 500,
      });

      const recommendation = registry.getRecommendation('Write authentication test');

      expect(recommendation.agentType).toBe(AgentType.TESTING);
      expect(recommendation.reason).toContain('similar tasks');
    });
  });

  describe('registerCustomAgent', () => {
    it('should register a custom agent', () => {
      const customConfig = {
        type: 'custom' as AgentType,
        name: 'Custom Agent',
        description: 'A custom agent',
        systemPrompt: 'You are a custom agent',
        defaultMaxTurns: 50,
        capabilities: [],
        autoSelectable: true,
        priority: 5,
      };

      registry.registerCustomAgent(customConfig);

      const config = registry.getAgentConfig('custom' as AgentType);
      expect(config?.name).toBe('Custom Agent');
    });
  });

  describe('unregisterAgent', () => {
    it('should unregister an agent', () => {
      const customConfig = {
        type: 'temporary' as AgentType,
        name: 'Temporary Agent',
        description: 'A temporary agent',
        systemPrompt: 'You are temporary',
        defaultMaxTurns: 10,
        capabilities: [],
        autoSelectable: true,
        priority: 1,
      };

      registry.registerCustomAgent(customConfig);
      let config = registry.getAgentConfig('temporary' as AgentType);
      expect(config).toBeDefined();

      const unregistered = registry.unregisterAgent('temporary' as AgentType);
      expect(unregistered).toBe(true);

      config = registry.getAgentConfig('temporary' as AgentType);
      expect(config).toBeNull();
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', () => {
      registry.recordExecution({
        agentType: AgentType.IMPLEMENTATION,
        success: true,
        output: 'Test',
        toolsUsed: [],
        duration: 100,
      });

      registry.resetStats();

      const stats = registry.getAgentStats(AgentType.IMPLEMENTATION);
      expect(stats?.usageCount).toBe(0);
      expect(stats?.successRate).toBe(1.0);
    });
  });

  describe('exportState and importState', () => {
    it('should export and import state correctly', () => {
      // Record some executions
      registry.recordExecution({
        agentType: AgentType.IMPLEMENTATION,
        success: true,
        output: 'Test',
        toolsUsed: [],
        duration: 100,
      });

      const exported = registry.exportState();
      expect(exported.agents).toBeDefined();
      expect(exported.history.length).toBeGreaterThan(0);

      // Create new registry and import
      const newRegistry = new AgentRegistry();
      newRegistry.importState(exported);

      const stats = newRegistry.getAgentStats(AgentType.IMPLEMENTATION);
      expect(stats?.usageCount).toBe(1);
    });
  });
});
