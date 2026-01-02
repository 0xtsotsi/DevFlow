/**
 * Agent Test Utilities
 *
 * Helper functions for testing agent configurations, tool access, and monitoring
 */

import type { AgentType, AgentConfig } from '@automaker/types';
import { getAgentConfigurations } from '../../../../src/agents/agent-prompts.js';

/**
 * Beads tool names
 */
export const BEADS_TOOLS = {
  CREATE_ISSUE: 'create_beads_issue',
  QUERY_MEMORY: 'query_beads_memory',
  SPAWN_HELPER: 'spawn_helper_agent',
} as const;

/**
 * All Beads tool names as an array
 */
export const ALL_BEADS_TOOLS = Object.values(BEADS_TOOLS);

/**
 * Expected Beads tool access for each agent type
 */
export const EXPECTED_BEADS_TOOL_ACCESS: Record<
  AgentType,
  {
    createIssue: boolean;
    queryMemory: boolean;
    spawnHelper: boolean;
  }
> = {
  planning: {
    createIssue: false,
    queryMemory: true,
    spawnHelper: true,
  },
  implementation: {
    createIssue: false,
    queryMemory: false,
    spawnHelper: false,
  },
  testing: {
    createIssue: true,
    queryMemory: true,
    spawnHelper: false,
  },
  review: {
    createIssue: true,
    queryMemory: false,
    spawnHelper: false,
  },
  debug: {
    createIssue: true,
    queryMemory: true,
    spawnHelper: false,
  },
  documentation: {
    createIssue: false,
    queryMemory: false,
    spawnHelper: false,
  },
  refactoring: {
    createIssue: false,
    queryMemory: false,
    spawnHelper: false,
  },
  orchestration: {
    createIssue: true,
    queryMemory: true,
    spawnHelper: true,
  },
  generic: {
    createIssue: false,
    queryMemory: false,
    spawnHelper: false,
  },
};

/**
 * Create a mock agent configuration with specified tools
 */
export function createMockAgent(type: AgentType, allowedTools: string[] = []): AgentConfig {
  return {
    type,
    name: `${type} Agent`,
    description: `Mock ${type} agent for testing`,
    systemPrompt: `You are a ${type} agent`,
    defaultMaxTurns: 20,
    allowedTools,
    capabilities: [
      {
        name: 'test-capability',
        description: 'Test capability',
        tools: allowedTools,
        confidence: 0.8,
      },
    ],
    temperature: 0.5,
    autoSelectable: true,
    priority: 5,
  };
}

/**
 * Create a mock agent with all Beads tools
 */
export function createMockAgentWithAllBeadsTools(type: AgentType): AgentConfig {
  return createMockAgent(type, [...ALL_BEADS_TOOLS]);
}

/**
 * Create a mock agent with no Beads tools
 */
export function createMockAgentWithNoBeadsTools(type: AgentType): AgentConfig {
  return createMockAgent(type, ['Read', 'Write', 'Edit']);
}

/**
 * Get all agent configurations
 */
export function getAllAgentConfigurations(): Record<AgentType, AgentConfig> {
  return getAgentConfigurations();
}

/**
 * Get agents that have access to a specific Beads tool
 */
export function getAgentsWithBeadsTool(toolName: string): AgentType[] {
  const configs = getAllAgentConfigurations();

  return Object.entries(configs)
    .filter(([, config]) => config.allowedTools?.includes(toolName))
    .map(([type]) => type as AgentType);
}

/**
 * Check if an agent has access to a specific Beads tool
 */
export function agentHasToolAccess(agentType: AgentType, toolName: string): boolean {
  const configs = getAllAgentConfigurations();
  const agent = configs[agentType];

  return agent.allowedTools?.includes(toolName) ?? false;
}

/**
 * Get all Beads tools for an agent
 */
export function getBeadsToolsForAgent(agentType: AgentType): string[] {
  const configs = getAllAgentConfigurations();
  const agent = configs[agentType];

  if (!agent.allowedTools) {
    return [];
  }

  return agent.allowedTools.filter((tool) => ALL_BEADS_TOOLS.includes(tool as any));
}

/**
 * Assert that an agent has exactly the expected Beads tools
 */
export function assertAgentBeadsToolAccess(
  agentType: AgentType,
  expectedAccess: { createIssue: boolean; queryMemory: boolean; spawnHelper: boolean }
): void {
  const hasCreate = agentHasToolAccess(agentType, BEADS_TOOLS.CREATE_ISSUE);
  const hasQuery = agentHasToolAccess(agentType, BEADS_TOOLS.QUERY_MEMORY);
  const hasSpawn = agentHasToolAccess(agentType, BEADS_TOOLS.SPAWN_HELPER);

  const expectedTools: string[] = [];
  if (expectedAccess.createIssue) expectedTools.push(BEADS_TOOLS.CREATE_ISSUE);
  if (expectedAccess.queryMemory) expectedTools.push(BEADS_TOOLS.QUERY_MEMORY);
  if (expectedAccess.spawnHelper) expectedTools.push(BEADS_TOOLS.SPAWN_HELPER);

  const actualTools = getBeadsToolsForAgent(agentType);

  expect(hasCreate).toBe(expectedAccess.createIssue);
  expect(hasQuery).toBe(expectedAccess.queryMemory);
  expect(hasSpawn).toBe(expectedAccess.spawnHelper);

  expect(actualTools).toEqual(expect.arrayContaining(expectedTools));
  expect(actualTools.length).toBe(expectedTools.length);
}

/**
 * Assert that an agent's system prompt references a Beads tool
 */
export function assertAgentPromptReferencesTool(agentType: AgentType, toolName: string): boolean {
  const configs = getAllAgentConfigurations();
  const prompt = configs[agentType].systemPrompt;

  return prompt.includes(toolName);
}

/**
 * Get count of agents with access to each Beads tool
 */
export function getBeadsToolAccessStats(): Record<string, number> {
  const configs = getAllAgentConfigurations();

  const stats: Record<string, number> = {
    [BEADS_TOOLS.CREATE_ISSUE]: 0,
    [BEADS_TOOLS.QUERY_MEMORY]: 0,
    [BEADS_TOOLS.SPAWN_HELPER]: 0,
  };

  for (const [, config] of Object.entries(configs)) {
    if (!config.allowedTools) continue;

    for (const tool of ALL_BEADS_TOOLS) {
      if (config.allowedTools.includes(tool)) {
        stats[tool]++;
      }
    }
  }

  return stats;
}

/**
 * Verify that all Beads tools have valid names
 */
export function validateBeadsToolNames(tools: string[]): boolean {
  return tools.every((tool) => ALL_BEADS_TOOLS.includes(tool as any));
}

/**
 * Get agent types with specific Beads tool access pattern
 */
export function getAgentsWithToolPattern(pattern: (tools: string[]) => boolean): AgentType[] {
  const configs = getAllAgentConfigurations();

  return Object.entries(configs)
    .filter(([, config]) => {
      if (!config.allowedTools) return false;
      return pattern(config.allowedTools);
    })
    .map(([type]) => type as AgentType);
}

/**
 * Test helper: Verify agent has no duplicate tools
 */
export function assertNoDuplicateTools(agentType: AgentType): void {
  const configs = getAllAgentConfigurations();
  const agent = configs[agentType];

  if (!agent.allowedTools) {
    return; // No tools means no duplicates
  }

  const uniqueTools = new Set(agent.allowedTools);
  expect(agent.allowedTools.length).toBe(uniqueTools.size);
}

/**
 * Test helper: Verify all agent tools are valid
 */
export function assertAllToolsValid(agentType: AgentType): void {
  const configs = getAllAgentConfigurations();
  const agent = configs[agentType];

  if (!agent.allowedTools) {
    return;
  }

  // Check that Beads tools are valid
  const beadsTools = agent.allowedTools.filter(
    (tool) => tool.startsWith('create_') || tool.startsWith('query_') || tool.startsWith('spawn_')
  );

  for (const tool of beadsTools) {
    expect(ALL_BEADS_TOOLS).toContain(tool);
  }
}

/**
 * Mock tool usage event for testing
 */
export interface MockToolUsageEvent {
  sessionId: string;
  toolName: string;
  timestamp?: number;
}

/**
 * Create a mock tool usage event
 */
export function createMockToolUsageEvent(sessionId: string, toolName: string): MockToolUsageEvent {
  return {
    sessionId,
    toolName,
    timestamp: Date.now(),
  };
}

/**
 * Create multiple mock tool usage events for testing
 */
export function createMockToolUsageSequence(
  sessionId: string,
  tools: string[]
): MockToolUsageEvent[] {
  return tools.map((toolName) => createMockToolUsageEvent(sessionId, toolName));
}

/**
 * Expected agent type for a given capability
 */
export const CAPABILITY_TO_AGENT: Record<string, AgentType> = {
  'create-specifications': 'planning',
  'breakdown-tasks': 'planning',
  'research-context': 'planning',
  'write-code': 'implementation',
  'modify-code': 'implementation',
  'auto-fix': 'implementation',
  'write-tests': 'testing',
  'verify-functionality': 'testing',
  'review-code': 'review',
  'identify-issues': 'review',
  'diagnose-errors': 'debug',
  'fix-bugs': 'debug',
  'write-docs': 'documentation',
  'update-readme': 'documentation',
  'refactor-code': 'refactoring',
  'eliminate-duplication': 'refactoring',
  'coordinate-workflow': 'orchestration',
  'manage-checkpoints': 'orchestration',
};

/**
 * Get agents that should have access to Beads tools based on their role
 */
export function getAgentsThatShouldHaveBeadsTools(): AgentType[] {
  return Object.entries(EXPECTED_BEADS_TOOL_ACCESS)
    .filter(([, access]) => access.createIssue || access.queryMemory || access.spawnHelper)
    .map(([type]) => type as AgentType);
}

/**
 * Verify tool access matches expected patterns
 */
export function verifyExpectedToolAccess(): {
  correct: number;
  incorrect: Array<{ agentType: AgentType; issue: string }>;
} {
  const configs = getAllAgentConfigurations();
  const incorrect: Array<{ agentType: AgentType; issue: string }> = [];
  let correct = 0;

  for (const [agentType, expected] of Object.entries(EXPECTED_BEADS_TOOL_ACCESS)) {
    const agent = configs[agentType as AgentType];

    const hasCreate = agent.allowedTools?.includes(BEADS_TOOLS.CREATE_ISSUE) ?? false;
    const hasQuery = agent.allowedTools?.includes(BEADS_TOOLS.QUERY_MEMORY) ?? false;
    const hasSpawn = agent.allowedTools?.includes(BEADS_TOOLS.SPAWN_HELPER) ?? false;

    if (
      hasCreate === expected.createIssue &&
      hasQuery === expected.queryMemory &&
      hasSpawn === expected.spawnHelper
    ) {
      correct++;
    } else {
      const issues: string[] = [];
      if (hasCreate !== expected.createIssue) {
        issues.push(`create_beads_issue: ${hasCreate} (expected ${expected.createIssue})`);
      }
      if (hasQuery !== expected.queryMemory) {
        issues.push(`query_beads_memory: ${hasQuery} (expected ${expected.queryMemory})`);
      }
      if (hasSpawn !== expected.spawnHelper) {
        issues.push(`spawn_helper_agent: ${hasSpawn} (expected ${expected.spawnHelper})`);
      }

      incorrect.push({
        agentType: agentType as AgentType,
        issue: issues.join(', '),
      });
    }
  }

  return { correct, incorrect };
}
