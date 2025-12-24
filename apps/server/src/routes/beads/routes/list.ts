/**
 * GET /api/beads/list - List all issues
 */

import type { Request, Response } from 'express';
import { logError } from '../common.js';
import {
  fetchAllIssues,
  fetchOpenIssues,
  fetchInProgressIssues,
  fetchBlockedIssues,
  fetchClosedIssues,
  fetchByType,
  fetchByPriority,
  fetchByLabel,
} from '../client/list-adapters.js';

export function createListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, type, priority, label } = req.query as {
        status?: string;
        type?: string;
        priority?: string;
        label?: string;
      };

      let issues;

      // Handle different filter types
      if (status) {
        switch (status) {
          case 'open':
            issues = await fetchOpenIssues({ noDb: true });
            break;
          case 'in_progress':
            issues = await fetchInProgressIssues({ noDb: true });
            break;
          case 'blocked':
            issues = await fetchBlockedIssues({ noDb: true });
            break;
          case 'closed':
            issues = await fetchClosedIssues({ noDb: true });
            break;
          default:
            issues = await fetchAllIssues({ noDb: true });
        }
      } else if (type) {
        issues = await fetchByType(type, { noDb: true });
      } else if (priority) {
        issues = await fetchByPriority(parseInt(priority, 10), { noDb: true });
      } else if (label) {
        issues = await fetchByLabel(label, { noDb: true });
      } else {
        issues = await fetchAllIssues({ noDb: true });
      }

      res.json({
        success: true,
        data: {
          issues,
          count: issues.length,
        },
      });
    } catch (error) {
      logError(error, 'List issues failed');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };
}
