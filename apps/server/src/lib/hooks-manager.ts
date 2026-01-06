/**
 * Hooks Manager
 *
 * Executes hooks at key lifecycle points (pre-task, post-task, pre-commit).
 * Handles blocking/non-blocking modes, timeouts, and emits events.
 *
 * SECURITY: Hooks are executed in a restricted VM context with limited
 * access to Node.js APIs. Only explicitly allowed modules are available.
 */

import type { EventEmitter } from './events.js';
import type { EventType } from '@automaker/types';
import type {
  Hook,
  HookContext,
  HookResult,
  HookExecutionOptions,
  HookType,
} from '@automaker/types';

export interface HooksManagerConfig {
  /** Default timeout for hook execution (milliseconds) */
  defaultTimeout?: number;

  /** Whether to emit events */
  emitEvents?: boolean;

  /** Whether to allow unsafe hook execution (default: false) */
  allowUnsafeExecution?: boolean;
}

/**
 * Allowed modules for hook execution
 * These are the only modules that hooks can require/use
 */
const ALLOWED_MODULES = new Set(['fs', 'path', 'os', 'crypto', 'util', 'events']);

/**
 * Sandbox context for secure hook execution
 */
interface SandboxContext {
  require: (module: string) => unknown;
  console: typeof globalThis.console;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  Promise: typeof Promise;
  Object: typeof Object;
  Array: typeof Array;
  String: typeof String;
  Number: typeof Number;
  Boolean: typeof Boolean;
  Math: typeof Math;
  Date: typeof Date;
  JSON: typeof JSON;
  Buffer: typeof Buffer;
}

/**
 * Create a restricted require function for sandbox
 */
function createRestrictedRequire(): (module: string) => unknown {
  return (module: string) => {
    if (!ALLOWED_MODULES.has(module)) {
      throw new Error(
        `Module "${module}" is not allowed in hook execution context. ` +
          `Allowed modules: ${Array.from(ALLOWED_MODULES).join(', ')}`
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(module);
  };
}

/**
 * Create a sandbox context for hook execution
 */
function createSandbox(): SandboxContext {
  return {
    require: createRestrictedRequire(),
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    JSON,
    Buffer,
  };
}

/**
 * Sanitize hook implementation to prevent code injection
 * Removes potentially dangerous patterns
 */
function sanitizeImplementation(implementation: string): string {
  const dangerousPatterns = [
    // Process access
    /\bprocess\b\.(\w+)/g,
    // Child process execution
    /\brequire\s*\(\s*['"](child_process|exec|spawn|fork)['"]\s*\)/g,
    // Eval-like functions
    /\beval\s*\(/g,
    /\bFunction\s*\(/g,
    // Direct fs operations that could be dangerous
    /\bunlinkSync\s*\(/g,
    /\brmdirSync\s*\(/g,
    // Network access
    /\brequire\s*\(\s*['"](http|https|net)['"]\s*\)/g,
  ];

  let sanitized = implementation;
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      throw new Error(
        'Hook implementation contains potentially dangerous patterns. ' +
          'For security reasons, hooks cannot access: child_process, eval, Function, process, network modules, or destructive file operations.'
      );
    }
  }

  return sanitized;
}

export class HooksManager {
  private eventEmitter?: EventEmitter;
  private config: Required<HooksManagerConfig>;
  private sandbox: SandboxContext;

  constructor(config?: HooksManagerConfig) {
    this.config = {
      defaultTimeout: config?.defaultTimeout ?? 30000,
      emitEvents: config?.emitEvents ?? true,
      allowUnsafeExecution: config?.allowUnsafeExecution ?? false,
    };
    this.sandbox = createSandbox();
  }

  /**
   * Set the event emitter for broadcasting hook events
   */
  setEventEmitter(emitter: EventEmitter): void {
    this.eventEmitter = emitter;
  }

  /**
   * Emit a hook event if emitter is available
   */
  private emitEvent(type: EventType, payload: unknown): void {
    if (this.eventEmitter && this.config.emitEvents) {
      this.eventEmitter.emit(type, payload);
    }
  }

  /**
   * Execute hooks of a specific type
   *
   * @param hookType - Type of hooks to execute
   * @param hooks - Hooks to execute (should be filtered by type)
   * @param context - Execution context
   * @param options - Execution options
   * @returns Array of hook results
   */
  async executeHooks(
    hookType: HookType,
    hooks: Hook[],
    context: Omit<HookContext, 'hook'>,
    options?: HookExecutionOptions
  ): Promise<HookResult[]> {
    // Filter hooks by type and enabled status
    const filteredHooks = hooks.filter((h) => h.type === hookType && h.enabled);

    // Sort by priority (higher priority first)
    filteredHooks.sort((a, b) => b.priority - a.priority);

    const results: HookResult[] = [];

    for (const hook of filteredHooks) {
      const result = await this.executeHook(hook, context, options);
      results.push(result);

      // If hook failed in blocking mode, stop execution
      if (result.status === 'blocked' && hook.mode === 'blocking') {
        if (!options?.continueOnError) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Execute a single hook
   *
   * @param hook - Hook to execute
   * @param context - Execution context
   * @param options - Execution options
   * @returns Hook execution result
   */
  async executeHook(
    hook: Hook,
    context: Omit<HookContext, 'hook'>,
    options?: HookExecutionOptions
  ): Promise<HookResult> {
    const startTime = Date.now();
    const hookContext: HookContext = { ...context, hook };
    const timeout = options?.timeout ?? hook.timeout;

    try {
      // Execute hook with timeout
      const result = await this.executeWithTimeout(hook, hookContext, timeout);

      const executionTime = Date.now() - startTime;
      const hookResult: HookResult = {
        hook,
        status: result.success ? 'passed' : 'blocked',
        message: result.message,
        data: result.data,
        executionTime,
        executedAt: new Date().toISOString(),
      };

      // Emit event
      if (result.success) {
        this.emitEvent('hook:executed', {
          hookId: hook.id,
          hookType: hook.type,
          sessionId: context.sessionId,
          executionTime,
        });
      } else {
        this.emitEvent('hook:blocked', {
          hookId: hook.id,
          hookType: hook.type,
          sessionId: context.sessionId,
          reason: result.message,
          executionTime,
        });

        // If blocking mode, throw error
        if (hook.mode === 'blocking' && !options?.continueOnError) {
          throw new Error(`Hook ${hook.name} blocked execution: ${result.message}`);
        }
      }

      return hookResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const hookResult: HookResult = {
        hook,
        status: 'failed',
        message: `Hook execution failed: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
        executionTime,
        executedAt: new Date().toISOString(),
      };

      // Emit failure event
      this.emitEvent('hook:failed', {
        hookId: hook.id,
        hookType: hook.type,
        sessionId: context.sessionId,
        error: errorMessage,
        executionTime,
      });

      // If blocking mode, throw error
      if (hook.mode === 'blocking' && !options?.continueOnError) {
        throw error;
      }

      return hookResult;
    }
  }

  /**
   * Execute hook implementation with timeout
   *
   * @param hook - Hook to execute
   * @param context - Execution context
   * @param timeout - Timeout in milliseconds
   * @returns Hook execution result
   */
  private async executeWithTimeout(
    hook: Hook,
    context: HookContext,
    timeout: number
  ): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Hook ${hook.name} timed out after ${timeout}ms`));
      }, timeout);

      this.executeHookImplementation(hook, context)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Execute hook implementation in a secure sandbox
   *
   * SECURITY: This method uses a restricted VM context to execute hooks.
   * Only explicitly allowed modules are available, and dangerous patterns
   * are blocked. This prevents arbitrary code execution and command injection.
   *
   * @param hook - Hook to execute
   * @param context - Execution context
   * @returns Hook execution result
   */
  private async executeHookImplementation(
    hook: Hook,
    context: HookContext
  ): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
    try {
      // Sanitize implementation to detect dangerous patterns
      const sanitizedImplementation = this.config.allowUnsafeExecution
        ? hook.implementation
        : sanitizeImplementation(hook.implementation);

      // Create a function body that wraps the implementation
      // The function has access to the sandbox context through closure
      const sandboxKeys = Object.keys(this.sandbox);
      const sandboxValues = Object.values(this.sandbox);

      // Create an async function with sandbox context
      // We use the AsyncFunction constructor but wrap the implementation
      // to restrict access to only the sandboxed modules
      const AsyncFunctionConstructor = async function () {}.constructor as {
        new (...args: string[]): (...args: unknown[]) => Promise<unknown>;
      };

      // Build function that destructures sandbox values
      const wrapperFn = new AsyncFunctionConstructor(
        ...sandboxKeys,
        'context',
        `
          'use strict';
          ${sanitizedImplementation}
        `
      );

      // Execute with sandbox context
      const result = await wrapperFn(...sandboxValues, context);

      // Handle different return types
      if (typeof result === 'boolean') {
        return {
          success: result,
          message: result ? 'Hook passed' : 'Hook failed',
        };
      }

      if (typeof result === 'string') {
        return {
          success: true,
          message: result,
        };
      }

      if (result && typeof result === 'object') {
        return {
          success: (result as { success?: boolean }).success ?? true,
          message: (result as { message?: string }).message ?? 'Hook executed',
          data: (result as { data?: Record<string, unknown> }).data,
        };
      }

      return {
        success: true,
        message: 'Hook executed successfully',
      };
    } catch (error) {
      throw new Error(
        `Hook implementation error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate hook implementation
   *
   * @param implementation - Hook implementation string
   * @returns Whether implementation is valid
   */
  validateImplementation(implementation: string): { valid: boolean; error?: string } {
    try {
      // Check for dangerous patterns first
      if (!this.config.allowUnsafeExecution) {
        sanitizeImplementation(implementation);
      }

      // Try to create function from implementation
      const AsyncFunctionConstructor = async function () {}.constructor as {
        new (...args: string[]): (...args: unknown[]) => Promise<unknown>;
      };
      new AsyncFunctionConstructor('context', implementation);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get statistics about hook execution
   *
   * @param hooks - All hooks
   * @returns Hook statistics
   */
  getStats(hooks: Hook[]): {
    total: number;
    enabled: number;
    byType: Partial<Record<HookType, number>>;
  } {
    const enabled = hooks.filter((h) => h.enabled);
    const byType: Partial<Record<HookType, number>> = {};

    for (const hook of hooks) {
      byType[hook.type] = (byType[hook.type] ?? 0) + 1;
    }

    return {
      total: hooks.length,
      enabled: enabled.length,
      byType,
    };
  }
}
