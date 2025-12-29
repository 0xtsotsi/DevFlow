/**
 * GET /api/beads/show/:id - Get issue details
 */

import type { Request, Response } from 'express';
import { logError } from '../common.js';
import { fetchIssueDetail } from '../client/list-adapters.js';

export function createShowHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ success: false, error: 'Issue ID is required' });
        return;
      }

      const issue = await fetchIssueDetail(id, { noDb: true });

      res.json({
        success: true,
        data: issue,
      });
    } catch (error) {
      logError(error, 'Show issue failed');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };
}
