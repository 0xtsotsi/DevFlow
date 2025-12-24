/**
 * POST /api/beads/update - Update issue
 */

import type { Request, Response } from 'express';
import { logError } from '../common.js';
import { runBd, type BdOptions } from '../client/cli-wrapper.js';

export function createUpdateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        id,
        status,
        priority,
        type,
        title,
        description,
        addLabels,
        removeLabels,
        addDependencies,
        removeDependencies,
      } = req.body as {
        id?: string;
        status?: string;
        priority?: number;
        type?: string;
        title?: string;
        description?: string;
        addLabels?: string[];
        removeLabels?: string[];
        addDependencies?: string[];
        removeDependencies?: string[];
      };

      if (!id) {
        res.status(400).json({ success: false, error: 'Issue ID is required' });
        return;
      }

      // Build command arguments
      const args = ['update', id];

      if (status) {
        args.push('--status', status);
      }

      if (priority !== undefined) {
        args.push('--priority', priority.toString());
      }

      if (type) {
        args.push('--type', type);
      }

      if (title) {
        args.push('--title', title);
      }

      if (description) {
        args.push('--description', description);
      }

      if (addLabels && addLabels.length > 0) {
        for (const label of addLabels) {
          args.push('--add-label', label);
        }
      }

      if (removeLabels && removeLabels.length > 0) {
        for (const label of removeLabels) {
          args.push('--remove-label', label);
        }
      }

      if (addDependencies && addDependencies.length > 0) {
        for (const dep of addDependencies) {
          args.push('--add-dep', dep);
        }
      }

      if (removeDependencies && removeDependencies.length > 0) {
        for (const dep of removeDependencies) {
          args.push('--remove-dep', dep);
        }
      }

      const options: BdOptions = { noDb: true };

      // Execute bd update command
      await runBd(args, options);

      // Fetch the updated issue details
      const { fetchIssueDetail } = await import('../client/list-adapters.js');
      const issue = await fetchIssueDetail(id, options);

      res.json({
        success: true,
        data: issue,
      });
    } catch (error) {
      logError(error, 'Update issue failed');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };
}
