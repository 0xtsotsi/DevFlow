/**
 * GET /api/beads/ready - Get ready work (no blockers)
 */

import type { Request, Response } from 'express';
import { logError } from '../common.js';
import { fetchReady } from '../client/list-adapters.js';

export function createReadyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const issues = await fetchReady({ noDb: true });

      res.json({
        success: true,
        data: {
          issues,
          count: issues.length,
        },
      });
    } catch (error) {
      logError(error, 'Get ready failed');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };
}
