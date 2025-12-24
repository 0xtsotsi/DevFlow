/**
 * POST /api/beads/sync - Git synchronization
 */

import type { Request, Response } from 'express';
import { logError } from '../common.js';
import { runBd, type BdOptions } from '../client/cli-wrapper.js';

export function createSyncHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const options: BdOptions = { noDb: true };

      // Execute bd sync command
      const output = await runBd(['sync'], options);

      res.json({
        success: true,
        data: {
          message: 'Sync completed successfully',
          output,
        },
      });
    } catch (error) {
      logError(error, 'Sync failed');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };
}
