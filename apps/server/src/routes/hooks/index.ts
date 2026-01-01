/**
 * Hooks Routes - HTTP API for hook management
 */

import { Router } from 'express';
import type { HooksService } from '../../services/hooks-service.js';
import type { HookType } from '@automaker/types';
import { getErrorMessage, logError } from '../agent/common.js';

export function createHooksRoutes(hooksService: HooksService): Router {
  const router = Router();

  // GET /api/hooks - List hooks
  router.get('/', async (req, res) => {
    try {
      const { type, enabled } = req.query;

      const filters: {
        type?: HookType;
        enabled?: boolean;
      } = {};

      if (type) {
        filters.type = type as HookType;
      }

      if (enabled !== undefined) {
        filters.enabled = enabled === 'true';
      }

      const hooks = hooksService.getHooks(filters);

      res.json({
        success: true,
        hooks,
        stats: hooksService.getStats(),
      });
    } catch (error) {
      logError(error, 'List hooks failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // GET /api/hooks/:id - Get hook by ID
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const hook = hooksService.getHook(id);

      if (!hook) {
        res.status(404).json({
          success: false,
          error: `Hook not found: ${id}`,
        });
        return;
      }

      res.json({ success: true, hook });
    } catch (error) {
      logError(error, 'Get hook failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /api/hooks - Register new hook
  router.post('/', async (req, res) => {
    try {
      const input = req.body;

      // Validate input
      const validation = hooksService.validateHook(input);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validation.errors,
        });
        return;
      }

      const hook = await hooksService.registerHook(input);

      res.status(201).json({ success: true, hook });
    } catch (error) {
      logError(error, 'Register hook failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // PUT /api/hooks/:id - Update hook
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const hook = await hooksService.updateHook(id, updates);

      res.json({ success: true, hook });
    } catch (error) {
      logError(error, 'Update hook failed');

      // Check if it's a "not found" error
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }

      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // DELETE /api/hooks/:id - Remove hook
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      await hooksService.removeHook(id);

      res.json({ success: true, message: 'Hook removed' });
    } catch (error) {
      logError(error, 'Remove hook failed');

      // Check if it's a "not found" error
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }

      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /api/hooks/validate - Validate hook without registering
  router.post('/validate', async (req, res) => {
    try {
      const input = req.body;

      const validation = hooksService.validateHook(input);

      res.json({ success: true, validation });
    } catch (error) {
      logError(error, 'Validate hook failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // GET /api/hooks/stats - Get hook statistics
  router.get('/stats', async (req, res) => {
    try {
      const stats = hooksService.getStats();

      res.json({ success: true, stats });
    } catch (error) {
      logError(error, 'Get hook stats failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  return router;
}
