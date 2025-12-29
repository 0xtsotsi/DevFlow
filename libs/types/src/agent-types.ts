/**
 * Specialized Worker Agent Types
 *
 * Defines the types and interfaces for specialized worker agents that handle
 * specific types of tasks in the AutoMode system.
 */

/**
 * Agent type enumeration - defines all available specialized agent types
 */
export enum AgentType {
  /**
   * Planning agent - creates specifications, breaks down features into tasks
   */
  PLANNING = 'planning',

  /**
   * Implementation agent - writes code, implements features
   */
  IMPLEMENTATION = 'implementation',

  /**
   * Testing agent - writes tests, verifies functionality
   */
  TESTING = 'testing',

  /**
   * Review agent - reviews code for quality, security, best practices
   */
  REVIEW = 'review',

  /**
   * Debug agent - diagnoses and fixes issues
   */
  DEBUG = 'debug',

  /**
   * Documentation agent - writes and updates documentation
   */
  DOCUMENTATION = 'documentation',

  /**
   * Refactoring agent - improves code structure and maintainability
   */
  REFACTORING = 'refactoring',

  /**
   * Generic agent - handles general-purpose tasks
   */
  GENERIC = 'generic',
}

/**
 * Agent capability - defines what an agent can do
 */
export interface AgentCapability {
  /** Capability name (e.g., "write-tests", "review-code") */
  name: string;

  /** Capability description */
  description: string;

  /** Related tools the agent can use */
  tools: string[];

  /** Confidence score for this capability (0-1) */
  confidence: number;
}

/**
 * Agent configuration - defines how an agent should behave
 */
export interface AgentConfig {
  /** Agent type */
  type: AgentType;

  /** Agent name (human-readable) */
  name: string;

  /** Agent description */
  description: string;

  /** System prompt for this agent */
  systemPrompt: string;

  /** Default max turns for this agent */
  defaultMaxTurns: number;

  /** Allowed tools for this agent (empty = all tools) */
  allowedTools?: string[];

  /** Agent capabilities */
  capabilities: AgentCapability[];

  /** Model preference (optional, overrides feature model) */
  preferredModel?: string;

  /** Temperature for this agent (0-1) */
  temperature?: number;

  /** Whether this agent can be auto-selected */
  autoSelectable: boolean;

  /** Priority for task selection (higher = preferred) */
  priority: number;
}

/**
 * Task classification result
 */
export interface TaskClassification {
  /** Classified task type */
  agentType: AgentType;

  /** Confidence score (0-1) */
  confidence: number;

  /** Reason for classification */
  reason: string;

  /** Alternative agent types that could handle this task */
  alternatives: Array<{
    type: AgentType;
    confidence: number;
    reason: string;
  }>;
}

/**
 * Task analysis result
 */
export interface TaskAnalysis {
  /** Original task prompt */
  prompt: string;

  /** Extracted keywords */
  keywords: string[];

  /** Detected file patterns */
  filePatterns: string[];

  /** Language detection (if applicable) */
  language?: string;

  /** Estimated complexity (1-10) */
  complexity: number;

  /** Has test-related keywords */
  isTestRelated: boolean;

  /** Has documentation keywords */
  isDocumentationRelated: boolean;

  /** Has debugging keywords */
  isDebugRelated: boolean;
}

/**
 * Agent registry entry
 */
export interface AgentRegistryEntry {
  /** Agent configuration */
  config: AgentConfig;

  /** Usage statistics */
  stats: {
    usageCount: number;
    successRate: number;
    avgDuration: number;
    lastUsed: number;
  };
}

/**
 * Agent execution context
 */
export interface AgentExecutionContext {
  /** Feature being worked on */
  featureId: string;

  /** Project path */
  projectPath: string;

  /** Working directory */
  cwd: string;

  /** Current task (if part of a larger plan) */
  currentTask?: string;

  /** Previous context (for follow-up work) */
  previousContext?: string;

  /** Abort controller */
  abortController: AbortController;
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  /** Agent type used */
  agentType: AgentType;

  /** Whether execution was successful */
  success: boolean;

  /** Output from the agent */
  output: string;

  /** Tools used during execution */
  toolsUsed: Array<{ name: string; count: number }>;

  /** Duration in milliseconds */
  duration: number;

  /** Error if unsuccessful */
  error?: string;
}
