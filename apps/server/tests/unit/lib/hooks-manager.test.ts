import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HooksManager } from '@/lib/hooks-manager.js';
import type { Hook, HookType } from '@automaker/types';

describe('HooksManager', () => {
  let hooksManager: HooksManager;

  beforeEach(() => {
    hooksManager = new HooksManager({ emitEvents: false });
  });

  describe('executeHooks', () => {
    it('should execute hooks in priority order', async () => {
      const hooks: Hook[] = [
        {
          id: 'hook-1',
          type: 'pre-task',
          name: 'Low Priority Hook',
          enabled: true,
          mode: 'blocking',
          priority: 10,
          timeout: 5000,
          implementation: 'return true;',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'hook-2',
          type: 'pre-task',
          name: 'High Priority Hook',
          enabled: true,
          mode: 'blocking',
          priority: 100,
          timeout: 5000,
          implementation: 'return true;',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const context = {
        sessionId: 'test-session',
        projectPath: '/test',
      };

      const results = await hooksManager.executeHooks('pre-task', hooks, context);

      expect(results).toHaveLength(2);
      expect(results[0].hook.id).toBe('hook-2'); // High priority first
    });

    it('should stop on blocking hook failure', async () => {
      const hooks: Hook[] = [
        {
          id: 'hook-1',
          type: 'pre-task',
          name: 'Failing Hook',
          enabled: true,
          mode: 'blocking',
          priority: 100,
          timeout: 5000,
          implementation: 'return false;',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'hook-2',
          type: 'pre-task',
          name: 'Skipped Hook',
          enabled: true,
          mode: 'blocking',
          priority: 50,
          timeout: 5000,
          implementation: 'return true;',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const context = {
        sessionId: 'test-session',
        projectPath: '/test',
      };

      await expect(hooksManager.executeHooks('pre-task', hooks, context)).rejects.toThrow();
    });
  });

  describe('validateImplementation', () => {
    it('should validate correct implementation', () => {
      const result = hooksManager.validateImplementation('return true;');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid implementation', () => {
      const result = hooksManager.validateImplementation('return true');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should calculate hook statistics', () => {
      const hooks: Hook[] = [
        {
          id: 'hook-1',
          type: 'pre-task',
          name: 'Hook 1',
          enabled: true,
          mode: 'blocking',
          priority: 50,
          timeout: 5000,
          implementation: 'return true;',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'hook-2',
          type: 'post-task',
          name: 'Hook 2',
          enabled: false,
          mode: 'non-blocking',
          priority: 50,
          timeout: 5000,
          implementation: 'return true;',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const stats = hooksManager.getStats(hooks);

      expect(stats.total).toBe(2);
      expect(stats.enabled).toBe(1);
      expect(stats.byType['pre-task']).toBe(1);
      expect(stats.byType['post-task']).toBe(1);
    });
  });
});
