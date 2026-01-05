/**
 * Agent Model Preference Types
 *
 * Defines types for configuring which Claude model each agent type uses.
 * This allows users to optimize for cost vs. quality by selecting different
 * models for different agent types.
 */

import type { AgentModel } from './model.js';
import type { AgentType } from './agent-types.js';

/**
 * Agent model configuration for a single agent type
 */
export interface AgentModelConfig {
  /** Agent type */
  agentType: AgentType;
  /** Which Claude model to use */
  model: AgentModel;
}

/**
 * Complete agent model settings stored in global settings
 * Version field allows for schema migration in the future
 */
export interface AgentModelSettings {
  /** Version for schema migration */
  version: 1;
  /** Model selection per agent type */
  agents: Record<AgentType, AgentModel>;
}

/**
 * Default model assignments based on task complexity
 * These provide a balance of cost and performance
 */
export const DEFAULT_AGENT_MODELS: Record<AgentType, AgentModel> = {
  // Planning benefits from Sonnet's reasoning (not too slow, not too expensive)
  planning: 'sonnet',
  // Implementation uses Sonnet for balanced quality/speed
  implementation: 'sonnet',
  // Testing can use Haiku for high-volume test generation (80% cost savings)
  testing: 'haiku',
  // Review uses Sonnet for standard code review quality
  review: 'sonnet',
  // Debug uses Sonnet for most cases (can upgrade to Opus for complex bugs)
  debug: 'sonnet',
  // Documentation uses Sonnet for balanced quality
  documentation: 'sonnet',
  // Refactoring uses Sonnet for understanding code structure
  refactoring: 'sonnet',
  // Orchestration uses Sonnet for coordinating workflows
  orchestration: 'sonnet',
  // Generic tasks use Sonnet as default
  generic: 'sonnet',
};

/**
 * Agent type metadata for UI display
 */
export const AGENT_TYPE_METADATA: Record<
  AgentType,
  {
    label: string;
    description: string;
    recommended: AgentModel;
    canUseHaiku: boolean;
    canUseOpus: boolean;
  }
> = {
  planning: {
    label: 'Planning Agent',
    description: 'Creates specifications and breaks down features',
    recommended: 'sonnet',
    canUseHaiku: true,
    canUseOpus: true,
  },
  implementation: {
    label: 'Implementation Agent',
    description: 'Writes clean, maintainable code',
    recommended: 'sonnet',
    canUseHaiku: true,
    canUseOpus: true,
  },
  testing: {
    label: 'Testing Agent',
    description: 'Writes comprehensive tests',
    recommended: 'haiku',
    canUseHaiku: true,
    canUseOpus: true,
  },
  review: {
    label: 'Review Agent',
    description: 'Code review and quality assurance',
    recommended: 'sonnet',
    canUseHaiku: false, // Review needs quality
    canUseOpus: true,
  },
  debug: {
    label: 'Debug Agent',
    description: 'Diagnoses and fixes issues',
    recommended: 'sonnet',
    canUseHaiku: true,
    canUseOpus: true,
  },
  documentation: {
    label: 'Documentation Agent',
    description: 'Writes clear documentation',
    recommended: 'sonnet',
    canUseHaiku: true,
    canUseOpus: true,
  },
  refactoring: {
    label: 'Refactoring Agent',
    description: 'Improves code structure',
    recommended: 'sonnet',
    canUseHaiku: false, // Refactoring needs understanding
    canUseOpus: true,
  },
  orchestration: {
    label: 'Orchestration Agent',
    description: 'Coordinates multi-phase workflows',
    recommended: 'sonnet',
    canUseHaiku: false, // Orchestration needs coordination
    canUseOpus: true,
  },
  generic: {
    label: 'Generic Agent',
    description: 'Handles general-purpose tasks',
    recommended: 'sonnet',
    canUseHaiku: true,
    canUseOpus: true,
  },
};

/**
 * Model display information
 */
export const AGENT_MODEL_INFO: Record<
  AgentModel,
  {
    label: string;
    badge: string;
    description: string;
    colorClass: string;
  }
> = {
  haiku: {
    label: 'Haiku',
    badge: 'Fast',
    description: 'Fastest, good for simple tasks (80% cost savings)',
    colorClass: 'text-green-500',
  },
  sonnet: {
    label: 'Sonnet',
    badge: 'Balanced',
    description: 'Balanced performance with strong reasoning',
    colorClass: 'text-blue-500',
  },
  opus: {
    label: 'Opus',
    badge: 'Premium',
    description: 'Most capable model for complex work',
    colorClass: 'text-purple-500',
  },
};
