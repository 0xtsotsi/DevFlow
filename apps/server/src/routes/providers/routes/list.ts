/**
 * GET /api/providers/list - List all registered providers
 */

import type { Request, Response } from 'express';
import { providerRegistry } from '../../../providers/registry.js';
import { getErrorMessage, logError } from '../common.js';

interface ProviderInfo {
  id: string;
  name: string;
  active: boolean;
  isAuthenticated: boolean;
  modelCount: number;
  priority: number;
  capabilities?: {
    supportsPlanning: boolean;
    supportsVision: boolean;
    supportsTools: boolean;
    maxContextWindow: number;
  };
}

export function createListProvidersHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const providers = providerRegistry.getAll();
      const providerInfos: ProviderInfo[] = [];

      for (const metadata of providers) {
        const info: ProviderInfo = {
          id: metadata.id,
          name: metadata.name,
          active: metadata.active,
          isAuthenticated: metadata.isAuthenticated,
          modelCount: metadata.models.length,
          priority: metadata.priority,
        };

        // Include capabilities if provider supports getCapabilities method
        if (metadata.provider.getCapabilities) {
          info.capabilities = (
            metadata.provider as { getCapabilities(): ProviderInfo['capabilities'] }
          ).getCapabilities();
        }

        providerInfos.push(info);
      }

      res.json({
        success: true,
        providers: providerInfos,
        count: providerInfos.length,
      });
    } catch (error) {
      logError(error, 'List providers failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
