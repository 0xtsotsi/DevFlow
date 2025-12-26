/**
 * PUT /api/settings/auth - Update Claude authentication method
 *
 * Updates the preferred authentication method and persists to settings.
 *
 * Body: { claudeAuthMethod: 'api_key' | 'cli' | 'auto' }
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import { setAuthConfig, getAuthStatus } from '../../../lib/claude-auth-manager.js';

export function createUpdateAuthMethodHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { claudeAuthMethod } = req.body as {
        claudeAuthMethod?: 'api_key' | 'cli' | 'auto';
      };

      // Validate
      if (
        !claudeAuthMethod ||
        !['api_key', 'cli', 'auto'].includes(claudeAuthMethod)
      ) {
        res.status(400).json({
          success: false,
          error:
            'Invalid auth method. Must be api_key, cli, or auto',
        });
        return;
      }

      // Update in-memory config
      setAuthConfig({ method: claudeAuthMethod });

      // Persist to settings
      await settingsService.updateGlobalSettings({ claudeAuthMethod });

      // Return updated status
      const authStatus = await getAuthStatus();

      res.json({
        success: true,
        config: {
          method: claudeAuthMethod,
        },
        status: authStatus,
      });
    } catch (error) {
      console.error('[Settings] Update auth method error:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to update auth method',
      });
    }
  };
}
