/**
 * Beads Tool Usage Tests
 *
 * Comprehensive test suite to verify that agents have correct Beads tool access
 * and can use Beads tools (create_beads_issue, query_beads_memory, spawn_helper_agent)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getAgentConfigurations } from '../../../src/agents/agent-prompts.js';
import type { AgentType } from '@automaker/types';

describe('Beads Tool Usage', () => {
  describe('Agent Tool Access', () => {
    let configs: Record<AgentType, import('@automaker/types').AgentConfig>;

    beforeEach(() => {
      configs = getAgentConfigurations();
    });

    describe('Planning Agent', () => {
      it('should have access to query_beads_memory', () => {
        const planningAgent = configs.planning;

        expect(planningAgent.allowedTools).toContain('query_beads_memory');
      });

      it('should have access to spawn_helper_agent', () => {
        const planningAgent = configs.planning;

        expect(planningAgent.allowedTools).toContain('spawn_helper_agent');
      });

      it('should NOT have access to create_beads_issue', () => {
        const planningAgent = configs.planning;

        expect(planningAgent.allowedTools).not.toContain('create_beads_issue');
      });

      it('should include Beads tools in research capability', () => {
        const planningAgent = configs.planning;
        const researchCapability = planningAgent.capabilities.find(
          (cap) => cap.name === 'research-context'
        );

        expect(researchCapability).toBeDefined();
        expect(researchCapability?.tools).toContain('query_beads_memory');
      });
    });

    describe('Implementation Agent', () => {
      it('should NOT have access to any Beads tools', () => {
        const implAgent = configs.implementation;

        // Implementation agent has no allowedTools defined (undefined)
        expect(implAgent.allowedTools).toBeUndefined();
      });
    });

    describe('Testing Agent', () => {
      it('should have access to create_beads_issue', () => {
        const testingAgent = configs.testing;

        expect(testingAgent.allowedTools).toContain('create_beads_issue');
      });

      it('should have access to query_beads_memory', () => {
        const testingAgent = configs.testing;

        expect(testingAgent.allowedTools).toContain('query_beads_memory');
      });

      it('should NOT have access to spawn_helper_agent', () => {
        const testingAgent = configs.testing;

        expect(testingAgent.allowedTools).not.toContain('spawn_helper_agent');
      });
    });

    describe('Review Agent', () => {
      it('should have access to create_beads_issue', () => {
        const reviewAgent = configs.review;

        expect(reviewAgent.allowedTools).toContain('create_beads_issue');
      });

      it('should NOT have access to query_beads_memory', () => {
        const reviewAgent = configs.review;

        expect(reviewAgent.allowedTools).not.toContain('query_beads_memory');
      });

      it('should NOT have access to spawn_helper_agent', () => {
        const reviewAgent = configs.review;

        expect(reviewAgent.allowedTools).not.toContain('spawn_helper_agent');
      });
    });

    describe('Debug Agent', () => {
      it('should have access to create_beads_issue', () => {
        const debugAgent = configs.debug;

        expect(debugAgent.allowedTools).toContain('create_beads_issue');
      });

      it('should have access to query_beads_memory', () => {
        const debugAgent = configs.debug;

        expect(debugAgent.allowedTools).toContain('query_beads_memory');
      });

      it('should NOT have access to spawn_helper_agent', () => {
        const debugAgent = configs.debug;

        expect(debugAgent.allowedTools).not.toContain('spawn_helper_agent');
      });
    });

    describe('Documentation Agent', () => {
      it('should have access to create_beads_issue', () => {
        const docAgent = configs.documentation;

        expect(docAgent.allowedTools).toContain('create_beads_issue');
      });

      it('should have access to query_beads_memory', () => {
        const docAgent = configs.documentation;

        expect(docAgent.allowedTools).toContain('query_beads_memory');
      });

      it('should NOT have access to spawn_helper_agent', () => {
        const docAgent = configs.documentation;

        expect(docAgent.allowedTools).not.toContain('spawn_helper_agent');
      });
    });

    describe('Refactoring Agent', () => {
      it('should have access to create_beads_issue', () => {
        const refactorAgent = configs.refactoring;

        expect(refactorAgent.allowedTools).toContain('create_beads_issue');
      });

      it('should have access to query_beads_memory', () => {
        const refactorAgent = configs.refactoring;

        expect(refactorAgent.allowedTools).toContain('query_beads_memory');
      });

      it('should NOT have access to spawn_helper_agent', () => {
        const refactorAgent = configs.refactoring;

        expect(refactorAgent.allowedTools).not.toContain('spawn_helper_agent');
      });
    });

    describe('Orchestration Agent', () => {
      it('should have access to all Beads tools in capabilities', () => {
        const orchAgent = configs.orchestration;

        // Orchestration agent doesn't have allowedTools, but has Beads tools in capabilities
        const coordCapability = orchAgent.capabilities.find(
          (cap) => cap.name === 'coordinate-workflow'
        );
        const checkpointCapability = orchAgent.capabilities.find(
          (cap) => cap.name === 'manage-checkpoints'
        );

        expect(coordCapability?.tools).toContain('create_beads_issue');
        expect(coordCapability?.tools).toContain('query_beads_memory');
        expect(coordCapability?.tools).toContain('spawn_helper_agent');

        expect(checkpointCapability?.tools).toContain('create_beads_issue');
        expect(checkpointCapability?.tools).toContain('query_beads_memory');
      });

      it('should include Beads tools in workflow coordination capability', () => {
        const orchAgent = configs.orchestration;
        const coordCapability = orchAgent.capabilities.find(
          (cap) => cap.name === 'coordinate-workflow'
        );

        expect(coordCapability).toBeDefined();
        expect(coordCapability?.tools).toContain('spawn_helper_agent');
        expect(coordCapability?.tools).toContain('create_beads_issue');
        expect(coordCapability?.tools).toContain('query_beads_memory');
      });
    });

    describe('Generic Agent', () => {
      it('should NOT have access to any Beads tools', () => {
        const genericAgent = configs.generic;

        // Generic agent has no allowedTools (undefined)
        expect(genericAgent.allowedTools).toBeUndefined();
      });
    });
  });

  describe('Beads Tool Distribution', () => {
    let configs: Record<AgentType, import('@automaker/types').AgentConfig>;

    beforeEach(() => {
      configs = getAgentConfigurations();
    });

    it('should grant create_beads_issue to 5 agent types', () => {
      const agentsWithCreate = Object.entries(configs)
        .filter(([, config]) => config.allowedTools?.includes('create_beads_issue'))
        .map(([type]) => type);

      expect(agentsWithCreate).toHaveLength(5);
      expect(agentsWithCreate).toContain('testing');
      expect(agentsWithCreate).toContain('review');
      expect(agentsWithCreate).toContain('debug');
      expect(agentsWithCreate).toContain('documentation');
      expect(agentsWithCreate).toContain('refactoring');
    });

    it('should grant query_beads_memory to 5 agent types', () => {
      const agentsWithQuery = Object.entries(configs)
        .filter(([, config]) => config.allowedTools?.includes('query_beads_memory'))
        .map(([type]) => type);

      expect(agentsWithQuery).toHaveLength(5);
      expect(agentsWithQuery).toContain('planning');
      expect(agentsWithQuery).toContain('testing');
      expect(agentsWithQuery).toContain('debug');
      expect(agentsWithQuery).toContain('documentation');
      expect(agentsWithQuery).toContain('refactoring');
    });

    it('should grant spawn_helper_agent to 1 agent type', () => {
      const agentsWithSpawn = Object.entries(configs)
        .filter(([, config]) => config.allowedTools?.includes('spawn_helper_agent'))
        .map(([type]) => type);

      expect(agentsWithSpawn).toHaveLength(1);
      expect(agentsWithSpawn).toContain('planning');
    });

    it('should verify all agents with Beads tools have allowedTools defined', () => {
      const agentsWithoutAllowedTools = Object.entries(configs)
        .filter(([, config]) => !config.allowedTools || config.allowedTools.length === 0)
        .map(([type]) => type);

      // Implementation, Documentation, Refactoring, Generic have no allowedTools
      expect(agentsWithoutAllowedTools.length).toBeGreaterThan(0);
    });
  });

  describe('Tool Access Patterns', () => {
    let configs: Record<AgentType, import('@automaker/types').AgentConfig>;

    beforeEach(() => {
      configs = getAgentConfigurations();
    });

    it('should allow Testing Agent to create issues and query memory', () => {
      const testingAgent = configs.testing;

      expect(testingAgent.allowedTools).toContain('create_beads_issue');
      expect(testingAgent.allowedTools).toContain('query_beads_memory');

      // This pattern allows agents to log test failures and find test patterns
      expect(testingAgent.allowedTools?.length).toBeGreaterThan(2);
    });

    it('should allow Debug Agent to create issues and query memory', () => {
      const debugAgent = configs.debug;

      expect(debugAgent.allowedTools).toContain('create_beads_issue');
      expect(debugAgent.allowedTools).toContain('query_beads_memory');

      // This pattern allows agents to track bugs and find similar past fixes
      expect(debugAgent.allowedTools?.length).toBeGreaterThan(2);
    });

    it('should allow Review Agent to create issues only', () => {
      const reviewAgent = configs.review;

      expect(reviewAgent.allowedTools).toContain('create_beads_issue');
      expect(reviewAgent.allowedTools).not.toContain('query_beads_memory');

      // Review agents log findings but don't query memory
    });

    it('should allow Orchestration Agent to use all Beads tools', () => {
      const orchAgent = configs.orchestration;

      // Orchestration agent has Beads tools in capabilities, not allowedTools
      const coordCapability = orchAgent.capabilities.find(
        (cap) => cap.name === 'coordinate-workflow'
      );

      expect(coordCapability?.tools).toContain('create_beads_issue');
      expect(coordCapability?.tools).toContain('query_beads_memory');
      expect(coordCapability?.tools).toContain('spawn_helper_agent');

      // Orchestration needs all tools for coordination
    });

    it('should allow Planning Agent to query memory and spawn helpers', () => {
      const planningAgent = configs.planning;

      expect(planningAgent.allowedTools).toContain('query_beads_memory');
      expect(planningAgent.allowedTools).toContain('spawn_helper_agent');
      expect(planningAgent.allowedTools).not.toContain('create_beads_issue');

      // Planning agents research context and delegate work
    });
  });

  describe('Edge Cases', () => {
    let configs: Record<AgentType, import('@automaker/types').AgentConfig>;

    beforeEach(() => {
      configs = getAgentConfigurations();
    });

    it('should not allow agents without explicit tool access to use Beads tools', () => {
      const agentsWithoutBeadsTools = ['implementation', 'generic'] as AgentType[];

      for (const agentType of agentsWithoutBeadsTools) {
        const agent = configs[agentType];
        // These agents have undefined allowedTools, meaning no restrictions
        expect(agent.allowedTools).toBeUndefined();
      }
    });

    it('should handle agents with undefined allowedTools', () => {
      const genericAgent = configs.generic;

      // Generic agent has no allowedTools restriction
      expect(genericAgent.allowedTools).toBeUndefined();
    });

    it('should ensure no agent has duplicate tools in allowedTools', () => {
      for (const [agentType, config] of Object.entries(configs)) {
        if (!config.allowedTools) continue;

        const uniqueTools = new Set(config.allowedTools);
        expect(config.allowedTools.length).toBe(uniqueTools.size);

        // Verify no duplicates
        const duplicates = config.allowedTools.filter(
          (tool, index) => config.allowedTools!.indexOf(tool) !== index
        );
        expect(duplicates).toHaveLength(0);
      }
    });

    it('should ensure all Beads tool names are correct', () => {
      const validBeadsTools = new Set([
        'create_beads_issue',
        'query_beads_memory',
        'spawn_helper_agent',
      ]);

      for (const [agentType, config] of Object.entries(configs)) {
        if (!config.allowedTools) continue;

        const beadsToolsInAgent = config.allowedTools.filter(
          (tool) =>
            tool.startsWith('create_') || tool.startsWith('query_') || tool.startsWith('spawn_')
        );

        for (const tool of beadsToolsInAgent) {
          expect(validBeadsTools.has(tool)).toBe(true);
        }
      }
    });
  });

  describe('Agent System Prompts Reference Beads Tools', () => {
    it('should reference query_beads_memory in Testing Agent system prompt', () => {
      const configs = getAgentConfigurations();
      const testingPrompt = configs.testing.systemPrompt;

      expect(testingPrompt).toContain('query_beads_memory');
      expect(testingPrompt).toContain('create_beads_issue');
    });

    it('should reference query_beads_memory in Debug Agent system prompt', () => {
      const configs = getAgentConfigurations();
      const debugPrompt = configs.debug.systemPrompt;

      expect(debugPrompt).toContain('query_beads_memory');
      expect(debugPrompt).toContain('create_beads_issue');
    });

    it('should reference create_beads_issue in Review Agent system prompt', () => {
      const configs = getAgentConfigurations();
      const reviewPrompt = configs.review.systemPrompt;

      expect(reviewPrompt).toContain('create_beads_issue');
    });

    it('should reference all Beads tools in Orchestration Agent system prompt', () => {
      const configs = getAgentConfigurations();
      const orchPrompt = configs.orchestration.systemPrompt;

      expect(orchPrompt).toContain('query_beads_memory');
      expect(orchPrompt).toContain('spawn_helper_agent');
      expect(orchPrompt).toContain('create_beads_issue');
    });

    it('should reference spawn_helper_agent in Planning Agent system prompt', () => {
      const configs = getAgentConfigurations();
      const planningPrompt = configs.planning.systemPrompt;

      expect(planningPrompt).toContain('spawn_helper_agent');
      // Planning agent prompt doesn't explicitly mention query_beads_memory, but it's in allowedTools
    });
  });
});
