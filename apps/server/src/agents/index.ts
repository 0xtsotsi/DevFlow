/**
 * Specialized Agent System
 *
 * Exports the complete specialized worker agent system for integration
 * with AutoMode and other services.
 */

export { AgentRegistry, agentRegistry } from './agent-registry.js';
export { TaskClassifier, taskClassifier } from './task-classifier.js';
export { SpecializedAgentService, specializedAgentService } from './specialized-agent-service.js';
export {
  getAgentConfigurations,
  getAgentConfiguration,
  AGENT_SYSTEM_PROMPTS,
  AGENT_CAPABILITIES,
} from './agent-prompts.js';

// Re-export AgentType enum as value
export { AgentType } from '@automaker/types';

// Re-export types from @automaker/types for convenience
export type {
  AgentConfig,
  AgentCapability,
  TaskClassification,
  TaskAnalysis,
  AgentRegistryEntry,
  AgentExecutionContext,
  AgentExecutionResult,
} from '@automaker/types';
