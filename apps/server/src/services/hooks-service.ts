/**
 * Hooks Service
 *
 * Manages hook lifecycle (register, update, remove) and provides default hooks
 * for common operations (pre-task, post-task, pre-commit).
 *
 * SECURITY: Default hooks use safe file system operations only.
 * Shell commands and child_process are blocked for security.
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import type { EventType } from '@automaker/types';
import type {
  Hook,
  HookType,
  CreateHookInput,
  UpdateHookInput,
  HookValidationResult,
  HookStats,
  HookContext,
  HookResult,
} from '@automaker/types';
import { HooksManager } from '../lib/hooks-manager.js';

export interface HooksServiceConfig {
  /** Directory to store hook configurations */
  hooksDir?: string;

  /** Whether to initialize default hooks */
  initializeDefaults?: boolean;
}

export class HooksService {
  private eventEmitter: EventEmitter;
  private hooksManager: HooksManager;
  private hooksDir: string;
  private hooksFile: string;
  private hooks: Map<string, Hook> = new Map();

  constructor(dataDir: string, events: EventEmitter, config?: HooksServiceConfig) {
    this.eventEmitter = events;
    this.hooksDir = config?.hooksDir ?? path.join(dataDir, 'hooks');
    this.hooksFile = path.join(this.hooksDir, 'hooks.json');
    this.hooksManager = new HooksManager({ emitEvents: true });
    this.hooksManager.setEventEmitter(events);
  }

  /**
   * Initialize hooks service
   */
  async initialize(): Promise<void> {
    await secureFs.mkdir(this.hooksDir, { recursive: true });
    await this.loadHooks();

    // Initialize default hooks if no hooks exist
    if (this.hooks.size === 0) {
      await this.initializeDefaultHooks();
    }
  }

  /**
   * Load hooks from file
   */
  private async loadHooks(): Promise<void> {
    try {
      const data = (await secureFs.readFile(this.hooksFile, 'utf-8')) as string;
      const hooks: Hook[] = JSON.parse(data);

      this.hooks.clear();
      for (const hook of hooks) {
        this.hooks.set(hook.id, hook);
      }
    } catch {
      // File doesn't exist or is invalid, start with empty hooks
      this.hooks.clear();
    }
  }

  /**
   * Save hooks to file
   */
  private async saveHooks(): Promise<void> {
    const hooks = Array.from(this.hooks.values());
    await secureFs.writeFile(this.hooksFile, JSON.stringify(hooks, null, 2), 'utf-8');
  }

  /**
   * Initialize default hooks
   *
   * SECURITY: These hooks use safe file system operations only.
   * They do NOT use child_process or shell commands which could be
   * exploited for command injection.
   *
   * Note: Hooks that previously used git commands now use placeholder
   * implementations. To fully enable git-based hooks, implement a
   * GitService that provides safe, wrapper methods for git operations.
   */
  private async initializeDefaultHooks(): Promise<void> {
    const defaultHooks: CreateHookInput[] = [
      // Pre-task hooks
      {
        type: 'pre-task',
        name: 'Check Project Path',
        description: 'Verify project path exists and is accessible',
        mode: 'blocking',
        enabled: true,
        priority: 100,
        timeout: 10000,
        implementation: `
          // Safe file system check only - no shell commands
          const path = require('path');
          const fs = require('fs');

          try {
            const projectPath = context.projectPath;
            if (!projectPath) {
              return {
                success: false,
                message: 'Project path not provided in context'
              };
            }

            // Check if path exists using safe fs operations
            fs.accessSync(projectPath, fs.constants.R_OK);

            return {
              success: true,
              message: 'Project path is accessible'
            };
          } catch (error) {
            return {
              success: false,
              message: \`Project path check failed: \${error.message}\`
            };
          }
        `,
      },
      {
        type: 'pre-task',
        name: 'Check MCP Availability',
        description: 'Verify required MCP servers are available',
        mode: 'non-blocking',
        enabled: true,
        priority: 90,
        timeout: 5000,
        implementation: `
          const path = require('path');
          const fs = require('fs');

          try {
            const mcpPath = path.join(context.projectPath, '.mcp.json');
            fs.accessSync(mcpPath, fs.constants.R_OK);
            return { success: true, message: 'MCP configuration found' };
          } catch {
            // Not a blocking error - MCP may not be configured
            return {
              success: true,
              message: 'MCP configuration not found (optional)'
            };
          }
        `,
      },

      // Post-task hooks
      {
        type: 'post-task',
        name: 'Post-Task Reflection',
        description: 'Generate reflection on task execution for continuous improvement',
        mode: 'non-blocking',
        enabled: true,
        priority: 50,
        timeout: 30000,
        implementation: `
          // Post-task reflection hook for continuous improvement
          // This hook runs after task completion to generate insights
          // Note: Full reflection requires conversation history which is
          // available via the ReflectSkillService, not in hook context
          return {
            success: true,
            message: 'Post-task reflection noted. Use /reflect skill for detailed analysis.',
            data: {
              hint: 'Run reflect skill with conversation history for detailed analysis',
              sessionId: context.sessionId
            }
          };
        `,
      },
      {
        type: 'post-task',
        name: 'Log Task Completion',
        description: 'Log task completion metadata for monitoring',
        mode: 'non-blocking',
        enabled: true,
        priority: 40,
        timeout: 5000,
        implementation: `
          // Simple logging hook - no external commands
          const timestamp = new Date().toISOString();
          console.log(\`[Hook] Task completed at \${timestamp} for session: \${context.sessionId}\`);

          return {
            success: true,
            message: 'Task completion logged',
            data: {
              sessionId: context.sessionId,
              timestamp
            }
          };
        `,
      },

      // Pre-commit hooks - NOTE: These are now informational only
      // Actual test/typecheck validation should be done via CI/CD pipeline
      {
        type: 'pre-commit',
        name: 'Pre-Commit Checklist',
        description: 'Display pre-commit checklist for developer verification',
        mode: 'non-blocking',
        enabled: true,
        priority: 100,
        timeout: 5000,
        implementation: `
          // Informational hook - reminds developer of best practices
          // Actual validation should be done via CI/CD pipeline
          return {
            success: true,
            message: 'Pre-commit checklist: Ensure tests pass, code is formatted, and no debug code remains.',
            data: {
              checklist: [
                'Run tests: npm run test:all',
                'Format code: npm run format',
                'Typecheck: npm run typecheck',
                'Remove debug code (console.log, debugger, etc.)'
              ],
              hint: 'For actual validation, use the /cicd skill or run CI/CD pipeline'
            }
          };
        `,
      },
      {
        type: 'pre-commit',
        name: 'Check Package Files',
        description: 'Verify package.json and lockfile are present',
        mode: 'non-blocking',
        enabled: true,
        priority: 90,
        timeout: 5000,
        implementation: `
          const path = require('path');
          const fs = require('fs');

          const packageJsonPath = path.join(context.projectPath, 'package.json');
          const lockfilePath = path.join(context.projectPath, 'package-lock.json');

          const results = [];

          try {
            fs.accessSync(packageJsonPath, fs.constants.R_OK);
            results.push('package.json found');
          } catch {
            results.push('WARNING: package.json not found');
          }

          try {
            fs.accessSync(lockfilePath, fs.constants.R_OK);
            results.push('package-lock.json found');
          } catch {
            results.push('WARNING: package-lock.json not found');
          }

          return {
            success: true,
            message: results.join(', '),
            data: { results }
          };
        `,
      },
    ];

    for (const hookInput of defaultHooks) {
      await this.registerHook(hookInput);
    }
  }

  /**
   * Register a new hook
   *
   * @param input - Hook creation input
   * @returns Created hook
   */
  async registerHook(input: CreateHookInput): Promise<Hook> {
    // Validate implementation
    const validation = this.hooksManager.validateImplementation(input.implementation);
    if (!validation.valid) {
      throw new Error(`Invalid hook implementation: ${validation.error}`);
    }

    const hook: Hook = {
      id: this.generateHookId(input.type, input.name),
      type: input.type,
      name: input.name,
      description: input.description ?? '',
      mode: input.mode ?? 'blocking',
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      timeout: input.timeout ?? 30000,
      implementation: input.implementation,
      config: input.config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.hooks.set(hook.id, hook);
    await this.saveHooks();

    this.emitEvent('hook:registered', { hookId: hook.id, hookType: hook.type });

    return hook;
  }

  /**
   * Update an existing hook
   *
   * @param hookId - Hook ID to update
   * @param updates - Update input
   * @returns Updated hook
   */
  async updateHook(hookId: string, updates: UpdateHookInput): Promise<Hook> {
    const hook = this.hooks.get(hookId);
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    // Validate implementation if provided
    if (updates.implementation) {
      const validation = this.hooksManager.validateImplementation(updates.implementation);
      if (!validation.valid) {
        throw new Error(`Invalid hook implementation: ${validation.error}`);
      }
    }

    const updatedHook: Hook = {
      ...hook,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.mode !== undefined && { mode: updates.mode }),
      ...(updates.enabled !== undefined && { enabled: updates.enabled }),
      ...(updates.priority !== undefined && { priority: updates.priority }),
      ...(updates.timeout !== undefined && { timeout: updates.timeout }),
      ...(updates.implementation !== undefined && { implementation: updates.implementation }),
      ...(updates.config !== undefined && { config: updates.config }),
      updatedAt: new Date().toISOString(),
    };

    this.hooks.set(hookId, updatedHook);
    await this.saveHooks();

    this.emitEvent('hook:updated', { hookId, hookType: updatedHook.type });

    return updatedHook;
  }

  /**
   * Remove a hook
   *
   * @param hookId - Hook ID to remove
   */
  async removeHook(hookId: string): Promise<void> {
    if (!this.hooks.has(hookId)) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    const hook = this.hooks.get(hookId)!;
    this.hooks.delete(hookId);
    await this.saveHooks();

    this.emitEvent('hook:removed', { hookId, hookType: hook.type });
  }

  /**
   * Get a hook by ID
   *
   * @param hookId - Hook ID
   * @returns Hook or undefined
   */
  getHook(hookId: string): Hook | undefined {
    return this.hooks.get(hookId);
  }

  /**
   * Get all hooks
   *
   * @param filters - Optional filters
   * @returns Array of hooks
   */
  getHooks(filters?: { type?: HookType; enabled?: boolean }): Hook[] {
    let hooks = Array.from(this.hooks.values());

    if (filters?.type) {
      hooks = hooks.filter((h) => h.type === filters.type);
    }

    if (filters?.enabled !== undefined) {
      hooks = hooks.filter((h) => h.enabled === filters.enabled);
    }

    return hooks;
  }

  /**
   * Execute hooks of a specific type
   *
   * @param hookType - Type of hooks to execute
   * @param context - Execution context
   * @param options - Execution options
   * @returns Array of hook results
   */
  async executeHooks(
    hookType: HookType,
    context: Omit<HookContext, 'hook'>,
    options?: { continueOnError?: boolean; timeout?: number }
  ): Promise<HookResult[]> {
    const hooks = this.getHooks({ type: hookType });
    return this.hooksManager.executeHooks(hookType, hooks, context, options);
  }

  /**
   * Validate hook configuration
   *
   * @param input - Hook creation input
   * @returns Validation result
   */
  validateHook(input: CreateHookInput): HookValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!input.type) {
      errors.push('Hook type is required');
    }
    if (!input.name) {
      errors.push('Hook name is required');
    }
    if (!input.implementation) {
      errors.push('Hook implementation is required');
    }

    // Validate implementation syntax
    if (input.implementation) {
      const validation = this.hooksManager.validateImplementation(input.implementation);
      if (!validation.valid) {
        errors.push(validation.error ?? 'Invalid implementation syntax');
      }
    }

    // Warnings
    if (input.priority === undefined) {
      warnings.push('No priority specified, will default to 0');
    }
    if (input.timeout === undefined) {
      warnings.push('No timeout specified, will default to 30000ms');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get hook statistics
   *
   * @returns Hook statistics
   */
  getStats(): HookStats {
    const hooks = Array.from(this.hooks.values());
    const stats = this.hooksManager.getStats(hooks);

    return {
      totalHooks: stats.total,
      hooksByType: stats.byType,
      enabledHooks: stats.enabled,
      executionStats: {
        total: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        avgExecutionTime: 0,
      },
    };
  }

  /**
   * Generate a unique hook ID
   *
   * @param type - Hook type
   * @param name - Hook name
   * @returns Hook ID
   */
  private generateHookId(type: HookType, name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const base = `${type}-${slug}`;
    let counter = 1;
    let id = base;

    while (this.hooks.has(id)) {
      id = `${base}-${counter}`;
      counter++;
    }

    return id;
  }

  /**
   * Emit a hook event
   *
   * @param type - Event type
   * @param payload - Event payload
   */
  private emitEvent(type: EventType, payload: unknown): void {
    this.eventEmitter.emit(type, payload);
  }
}
