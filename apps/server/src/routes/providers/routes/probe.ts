/**
 * POST /api/providers/probe - Probe provider capabilities
 */

import type { Request, Response } from 'express';
import { providerRegistry } from '../../../providers/registry.js';
import { capabilityProbe } from '../../../providers/capability-probe.js';
import { getErrorMessage, logError } from '../common.js';

export function createProbeProviderHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;

      if (!providerId) {
        res.status(400).json({ success: false, error: 'Provider ID is required' });
        return;
      }

      const metadata = providerRegistry.get(providerId);

      if (!metadata) {
        res.status(404).json({ success: false, error: `Provider "${providerId}" not found` });
        return;
      }

      // Probe capabilities
      const result = await capabilityProbe.probeWithResult(providerId, metadata.provider);

      res.json({
        success: true,
        providerId,
        capability: result.capability,
        limits: result.limits,
        cacheHit: result.cacheHit,
        timestamp: result.timestamp,
      });
    } catch (error) {
      logError(error, 'Probe provider failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /api/providers/probe/all - Probe all providers
 */
export function createProbeAllProvidersHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const providers = providerRegistry.getAll();
      const providersMap = new Map(providers.map((m) => [m.id, m.provider]));

      const results = await capabilityProbe.probeAll(providersMap);

      const response = Array.from(results.entries()).map(([providerId, result]) => ({
        providerId,
        capability: result.capability,
        limits: result.limits,
        cacheHit: result.cacheHit,
        timestamp: result.timestamp,
      }));

      res.json({
        success: true,
        results: response,
        count: response.length,
      });
    } catch (error) {
      logError(error, 'Probe all providers failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
