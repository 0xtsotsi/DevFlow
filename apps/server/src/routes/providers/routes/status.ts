/**
 * GET /api/providers/status - Show active provider and fallbacks
 */

import type { Request, Response } from 'express';
import { EngineRegistry } from '../../../providers/registry.js';
import { getErrorMessage, logError } from '../common.js';

export function createStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const primary = EngineRegistry.getPrimary();
      const fallbackChain = primary
        ? EngineRegistry.getFallbackChain(primary.id)
        : EngineRegistry.getFallbackChain();

      const allProviders = EngineRegistry.getAll();

      res.json({
        success: true,
        primary: primary
          ? {
              id: primary.id,
              name: primary.name,
              isAuthenticated: primary.isAuthenticated,
              priority: primary.priority,
            }
          : null,
        fallbacks: fallbackChain.map((m) => ({
          id: m.id,
          name: m.name,
          isAuthenticated: m.isAuthenticated,
          priority: m.priority,
        })),
        allProviders: allProviders.map((m) => ({
          id: m.id,
          name: m.name,
          isAuthenticated: m.isAuthenticated,
          active: m.active,
          priority: m.priority,
        })),
        count: {
          total: allProviders.length,
          authenticated: allProviders.filter((p) => p.isAuthenticated).length,
          active: allProviders.filter((p) => p.active).length,
        },
      });
    } catch (error) {
      logError(error, 'Get provider status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
