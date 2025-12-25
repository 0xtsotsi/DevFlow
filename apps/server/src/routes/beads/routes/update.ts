/**
 * POST /update endpoint - Update an existing beads issue
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';
import { updateBeadsIssueSchema, beadsIssueIdSchema } from '../../../lib/beads-validation.js';

/**
 * Create an Express route handler that updates an existing beads issue.
 *
 * @param beadsService - Service used to perform the issue update
 * @returns An Express request handler that validates `projectPath`, `issueId`, and `updates` from the request body, calls the service to apply changes, and sends JSON responses: on success `{ success: true, issue }`, on validation failure a 400 with `{ success: false, error }`, and on unexpected errors a 500 with `{ success: false, error }`.
 */
export function createUpdateHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueId } = req.body as { projectPath: string; issueId: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Validate issue ID
      const issueIdResult = beadsIssueIdSchema.safeParse(issueId);
      if (!issueIdResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid issue ID',
          details: issueIdResult.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }

      // Validate updates using Zod schema
      const updatesResult = updateBeadsIssueSchema.safeParse(req.body.updates);
      if (!updatesResult.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: updatesResult.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }

      const updates = updatesResult.data;
      const updatedIssue = await beadsService.updateIssue(projectPath, issueId, updates);
      res.json({ success: true, issue: updatedIssue });
    } catch (error) {
      logError(error, 'Update issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
