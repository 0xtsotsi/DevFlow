/**
 * GET /api/beads/assignments - Get agent assignment status
 */

import type { Request, Response } from 'express';
import type { BeadsAgentCoordinator } from '../../../services/beads-agent-coordinator.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Creates an Express handler that returns current agent assignments.
 *
 * The returned async middleware retrieves the active agent assignments from
 * the BeadsAgentCoordinator and returns them as a JSON array.
 * On success it responds with `{ success: true, assignments }`;
 * on failure it logs the error and responds with HTTP 500 and a standardized error message.
 *
 * @param coordinator - The BeadsAgentCoordinator instance to query for assignments
 * @returns An Express-compatible async middleware (req, res) that returns agent assignments
 */
export function createAssignmentsHandler(coordinator: BeadsAgentCoordinator) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Get active agents from coordinator
      const activeAgents = coordinator.getActiveAgents();

      // Build assignments array with issueId, agentType, and assignedAt timestamp
      const assignments = activeAgents.map((agent) => {
        const assignedAt = new Date(agent.startTime).toISOString();
        return {
          issueId: agent.issueId,
          agentType: agent.agentType,
          assignedAt,
        };
      });

      res.json({ success: true, assignments });
    } catch (error) {
      logError(error, 'Get assignments failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
