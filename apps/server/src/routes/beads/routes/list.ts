/**
 * POST /list endpoint - List all beads issues for a project
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';
import { listBeadsIssuesFiltersSchema } from '../../../lib/beads-validation.js';

/**
 * Creates an Express handler that lists bead issues for a given project.
 *
 * The returned async middleware expects req.body to contain `projectPath` (string) and an optional
 * `filters` object that will be validated against the listBeadsIssuesFiltersSchema.
 * If `projectPath` is missing the handler responds with HTTP 400 and an error JSON;
 * on success it responds with `{ success: true, issues }`; on failure it
 * logs the error and responds with HTTP 500 and a standardized error message.
 *
 * @returns An Express-compatible async middleware (req, res) that lists issues for the specified project.
 */
export function createListHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string; filters?: unknown };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Validate filters if provided
      let filters: Parameters<BeadsService['listIssues']>[1] | undefined = undefined;
      if (req.body.filters !== undefined) {
        const filtersResult = listBeadsIssuesFiltersSchema.safeParse(req.body.filters);
        if (!filtersResult.success) {
          res.status(400).json({
            success: false,
            error: 'Invalid filters',
            details: filtersResult.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
          return;
        }
        filters = filtersResult.data;
      }

      const issues = await beadsService.listIssues(projectPath, filters);
      res.json({ success: true, issues });
    } catch (error) {
      logError(error, 'List issues failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
