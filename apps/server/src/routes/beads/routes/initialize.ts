/**
 * POST /initialize endpoint - Initialize Beads in a project
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Creates an Express route handler that initializes Beads in a project directory.
 *
 * @param beadsService - Service used to perform the initialization
 * @returns An Express request handler that responds with `{ success: true }` on success
 * and with HTTP 500 and `{ success: false, error }` on failure
 */
export function createInitializeHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      await beadsService.initializeBeads(projectPath);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Initialize Beads failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
