/**
 * POST /create endpoint - Create a new beads issue
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';
import { createBeadsIssueSchema } from '../../../lib/beads-validation.js';

/**
 * Creates an Express request handler for creating a beads issue.
 *
 * The handler uses Zod schema validation to validate the request body,
 * calls the provided service to create the issue, and sends a JSON response:
 * on success `{ success: true, issue }`, on validation failure a 400 with `{ success: false, error }`,
 * and on internal error a 500 with `{ success: false, error }`.
 *
 * @returns An Express-compatible request handler that performs the described validation, creation, and responses.
 */
export function createCreateHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate and parse request body using Zod schema
      const validationResult = createBeadsIssueSchema.safeParse(req.body.issue);
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationResult.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }

      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const issue = validationResult.data;
      const createdIssue = await beadsService.createIssue(projectPath, issue);
      res.json({ success: true, issue: createdIssue });
    } catch (error) {
      logError(error, 'Create issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
