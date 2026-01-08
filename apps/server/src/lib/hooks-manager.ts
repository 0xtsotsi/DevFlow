/**
 * Hooks Manager
 *
 * Executes hooks at key lifecycle points (pre-task, post-task, pre-commit).
 * Handles blocking/non-blocking modes, timeouts, and emits events.
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
}

export class HooksManager {
  private eventEmitter?: EventEmitter;
  private config: Required<HooksManagerConfig>;

  constructor(config?: HooksManagerConfig) {
    this.config = {
      defaultTimeout: config?.defaultTimeout ?? 30000,
      emitEvents: config?.emitEvents ?? true,
    };
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
   * Execute hook implementation
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
      // Create a restricted sandbox environment
      const sandbox = {
        // Safe console methods (read-only)
        console: Object.freeze({
          log: console.log.bind(console),
          info: console.info.bind(console),
          warn: console.warn.bind(console),
          error: console.error.bind(console),
          debug: console.debug.bind(console),
        }),
        // Provide context as the only external variable
        context,
        // Safe constructors
        Object,
        Array,
        String,
        Number,
        Boolean,
        Date,
        Math,
        JSON,
        // Safe Error constructors
        Error,
        TypeError,
        RangeError,
        SyntaxError,
        ReferenceError,
      };

      // Create VM context from sandbox
      const vmContext = createContext(sandbox);

      // Wrap the hook implementation in an async IIFE
      const wrappedCode = `
        (async () => {
          ${hook.implementation}
        })()
      `;

      // Execute in VM sandbox with timeout
      const result = await runInContext(wrappedCode, vmContext, {
        displayErrors: true,
        timeout: this.config.defaultTimeout,
      });

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
      // Try to create function from implementation
      new AsyncFunction('context', implementation);
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

/**
 * AsyncFunction constructor
 * Used to create async functions from strings
 */
interface AsyncFunctionConstructor extends FunctionConstructor {
  new (...args: string[]): (...args: unknown[]) => Promise<unknown>;
}

const AsyncFunction = async function () {}.constructor as unknown as AsyncFunctionConstructor;
