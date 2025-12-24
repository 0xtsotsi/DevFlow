/**
 * POST /api/beads/create - Create new issue
 */

import type { Request, Response } from 'express';
import { logError } from '../common.js';
import { runBd, type BdOptions } from '../client/cli-wrapper.js';

export function createCreateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, description, type, priority, labels, dependencies } = req.body as {
        title?: string;
        description?: string;
        type?: string;
        priority?: number;
        labels?: string[];
        dependencies?: string[];
      };

      if (!title) {
        res.status(400).json({ success: false, error: 'Title is required' });
        return;
      }

      // Build command arguments
      const args = ['create', title];

      if (description) {
        args.push('--description', description);
      }

      if (type) {
        args.push('--type', type);
      }

      if (priority !== undefined) {
        args.push('--priority', priority.toString());
      }

      if (labels && labels.length > 0) {
        for (const label of labels) {
          args.push('--label', label);
        }
      }

      if (dependencies && dependencies.length > 0) {
        for (const dep of dependencies) {
          args.push('--depends-on', dep);
        }
      }

      const options: BdOptions = { noDb: true };

      // Execute bd create command
      const output = await runBd(args, options);

      // Extract issue ID from output (format: "Created issue: df-123")
      const match = output.match(/Created issue: (\S+)/);
      const issueId = match ? match[1] : null;

      if (!issueId) {
        throw new Error('Failed to parse created issue ID');
      }

      // Fetch the created issue details
      const { fetchIssueDetail } = await import('../client/list-adapters.js');
      const issue = await fetchIssueDetail(issueId, options);

      res.json({
        success: true,
        data: issue,
      });
    } catch (error) {
      logError(error, 'Create issue failed');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };
}
