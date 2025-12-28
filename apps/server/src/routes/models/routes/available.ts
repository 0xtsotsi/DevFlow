/**
 * GET /available endpoint - Get available models
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { ProviderFactory } from '../../../providers/provider-factory.js';

interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
}

export function createAvailableHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get models from all registered providers
      const allModels = ProviderFactory.getAllAvailableModels();

      // Map provider models to API format
      const models: ModelDefinition[] = allModels.map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        contextWindow: model.contextWindow || 200000,
        maxOutputTokens: model.maxOutputTokens || 8192,
        supportsVision: model.supportsVision || false,
        supportsTools: model.supportsTools || false,
      }));

      res.json({ success: true, models });
    } catch (error) {
      logError(error, 'Get available models failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
