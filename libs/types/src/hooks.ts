/**
 * Hooks System Type Definitions
 *
 * Provides a flexible hook system for intercepting and customizing
 * agent behavior at key lifecycle points (pre-task, post-task, pre-commit).
 * Hooks enable validation, checks, transformations, and notifications.
 */

/**
 * Hook type enumeration - defines all available hook points
 */
export type HookType =
  | 'pre-task' // Before agent starts working on a task
  | 'post-task' // After agent completes a task
  | 'pre-commit'; // Before committing changes

/**
 * Hook execution mode
 */
export type HookMode = 'blocking' | 'non-blocking'; // Hook must pass before operation continues

/**
 * Hook status result
 */
export type HookStatus =
  | 'passed' // Hook executed successfully
  | 'failed' // Hook execution failed
  | 'blocked'; // Hook blocked the operation

/**
 * Hook configuration
 */
export interface Hook {
  /** Unique hook identifier */
  id: string;

  /** Hook type (when it executes) */
  type: HookType;

  /** Hook name (human-readable) */
  name: string;

  /** Hook description */
  description: string;

  /** Execution mode (blocking or non-blocking) */
  mode: HookMode;

  /** Whether hook is enabled */
  enabled: boolean;

  /** Hook priority (higher = earlier execution) */
  priority: number;

  /** Maximum execution time in milliseconds (default: 30000) */
  timeout: number;

  /** Hook function implementation (as a string for serialization) */
  implementation: string;

  /** Optional hook configuration */
  config?: Record<string, unknown>;

  /** Timestamp when hook was created */
  createdAt: string;

  /** Timestamp when hook was last updated */
  updatedAt: string;
}

/**
 * Input for creating a new hook
 */
export interface CreateHookInput {
  /** Hook type (when it executes) */
  type: HookType;

  /** Hook name (human-readable) */
  name: string;

  /** Hook description */
  description?: string;

  /** Execution mode (default: 'blocking') */
  mode?: HookMode;

  /** Whether hook is enabled (default: true) */
  enabled?: boolean;

  /** Hook priority (default: 0) */
  priority?: number;

  /** Maximum execution time in milliseconds (default: 30000) */
  timeout?: number;

  /** Hook function implementation (as a string) */
  implementation: string;

  /** Optional hook configuration */
  config?: Record<string, unknown>;
}

/**
 * Input for updating an existing hook
 */
export interface UpdateHookInput {
  /** Hook name */
  name?: string;

  /** Hook description */
  description?: string;

  /** Execution mode */
  mode?: HookMode;

  /** Whether hook is enabled */
  enabled?: boolean;

  /** Hook priority */
  priority?: number;

  /** Maximum execution time in milliseconds */
  timeout?: number;

  /** Hook function implementation */
  implementation?: string;

  /** Optional hook configuration */
  config?: Record<string, unknown>;
}

/**
 * Hook execution context
 * Provides information about the current operation
 */
export interface HookContext {
  /** Hook being executed */
  hook: Hook;

  /** Project path where hook is executing */
  projectPath: string;

  /** Session ID of the agent */
  sessionId: string;

  /** Feature ID (if applicable) */
  featureId?: string;

  /** Task description */
  task?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Hook execution result
 */
export interface HookResult {
  /** Hook that was executed */
  hook: Hook;

  /** Execution status */
  status: HookStatus;

  /** Result message */
  message: string;

  /** Additional data returned by hook */
  data?: Record<string, unknown>;

  /** Error if hook failed */
  error?: Error;

  /** Execution time in milliseconds */
  executionTime: number;

  /** Timestamp when hook was executed */
  executedAt: string;
}

/**
 * Hook execution options
 */
export interface HookExecutionOptions {
  /** Whether to continue on failure (default: false) */
  continueOnError?: boolean;

  /** Custom timeout in milliseconds (overrides hook timeout) */
  timeout?: number;

  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Hook validation result
 */
export interface HookValidationResult {
  /** Whether hook is valid */
  valid: boolean;

  /** Validation errors */
  errors: string[];

  /** Validation warnings */
  warnings: string[];
}

/**
 * Hook statistics
 */
export interface HookStats {
  /** Total number of hooks */
  totalHooks: number;

  /** Number of hooks by type */
  hooksByType: Partial<Record<HookType, number>>;

  /** Number of enabled hooks */
  enabledHooks: number;

  /** Execution statistics */
  executionStats: {
    /** Total executions */
    total: number;

    /** Successful executions */
    passed: number;

    /** Failed executions */
    failed: number;

    /** Blocked operations */
    blocked: number;

    /** Average execution time in milliseconds */
    avgExecutionTime: number;
  };
}
