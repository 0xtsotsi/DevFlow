/**
 * POST /api/providers/test - Test a provider's authentication
 */

import type { Request, Response } from 'express';
import { EngineRegistry } from '../../../providers/registry.js';
import { authCache } from '../../../providers/auth-cache.js';
import { getErrorMessage, logError } from '../common.js';

export function createTestProviderHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;

      if (!providerId) {
        res.status(400).json({ success: false, error: 'Provider ID is required' });
        return;
      }

      const metadata = EngineRegistry.get(providerId);

      if (!metadata) {
        res.status(404).json({ success: false, error: `Provider "${providerId}" not found` });
        return;
      }

      // Check auth with cache
      const isAuthenticated = await authCache.getOrCompute(providerId, async () => {
        if (
          'isAuthenticated' in metadata.provider &&
          typeof metadata.provider.isAuthenticated === 'function'
        ) {
          return await metadata.provider.isAuthenticated();
        }
        // Fall back to detectInstallation
        const status = await metadata.provider.detectInstallation();
        return status.authenticated ?? false;
      });

      // Update metadata
      EngineRegistry.update(providerId, { isAuthenticated });

      res.json({
        success: true,
        providerId,
        authenticated: isAuthenticated,
        timestamp: Date.now(),
      });
    } catch (error) {
      logError(error, 'Test provider failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
