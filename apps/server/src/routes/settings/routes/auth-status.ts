/**
 * GET /api/settings/auth - Get Claude authentication status
 *
 * Returns current auth configuration including:
 * - Configured auth method (api_key, cli, auto)
 * - CLI detection status
 * - API key status
 * - Effective auth method (what will actually be used)
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import { getAuthStatus } from '../../../lib/claude-auth-manager.js';

export function createAuthStatusHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const authStatus = await getAuthStatus();
      const globalSettings = await settingsService.getGlobalSettings();

      res.json({
        success: true,
        config: {
          method: globalSettings.claudeAuthMethod || 'auto',
        },
        status: authStatus,
      });
    } catch (error) {
      console.error('[Settings] Auth status error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get auth status',
      });
    }
  };
}
