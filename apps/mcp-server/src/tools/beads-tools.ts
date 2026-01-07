/**
 * Beads Tools
 *
 * MCP tools for interacting with the Beads issue tracker.
 */

import type { DevFlowClient } from '../client.js';
import { z } from 'zod';

/**
 * Register Beads tools with the MCP server
 */
export function registerBeadsTools(server: any, client: DevFlowClient): void {
  // List Beads Issues
  server.registerTool(
    'list_beads_issues',
    {
      description: 'List Beads issues with optional filters',
      inputSchema: {
        status: z
          .array(z.string())
          .optional()
          .describe('Filter by status (open, in_progress, blocked, closed)'),
        type: z
          .array(z.string())
          .optional()
          .describe('Filter by type (bug, feature, task, epic, chore)'),
        priorityMin: z.number().optional().describe('Minimum priority (0-4)'),
        priorityMax: z.number().optional().describe('Maximum priority (0-4)'),
        limit: z.number().optional().describe('Maximum number of issues to return'),
      },
    },
    async (args: {
      status?: string[];
      type?: string[];
      priorityMin?: number;
      priorityMax?: number;
      limit?: number;
    }) => {
      const result = await client.listBeadsIssues(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing Beads issues: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const issues = result.data || [];
      if (issues.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No Beads issues found',
            },
          ],
        };
      }

      const formatted = issues
        .map(
          (issue: {
            id: string;
            title: string;
            status: string;
            type: string;
            priority: number;
            labels: string[];
            description?: string;
          }) =>
            `- [${issue.id}] ${issue.title}\n  Status: ${issue.status}\n  Type: ${issue.type}\n  Priority: P${issue.priority}\n  Labels: ${issue.labels.join(', ') || 'none'}\n  ${issue.description?.substring(0, 100) || ''}${issue.description && issue.description.length > 100 ? '...' : ''}`
        )
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Beads Issues:\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // Create Beads Issue
  server.registerTool(
    'create_beads_issue',
    {
      description: 'Create a new Beads issue',
      inputSchema: {
        title: z.string().describe('Issue title'),
        description: z.string().optional().describe('Issue description'),
        type: z.enum(['bug', 'feature', 'task', 'epic', 'chore']).optional().describe('Issue type'),
        priority: z.number().min(0).max(4).optional().describe('Priority (0=critical, 4=low)'),
        labels: z.array(z.string()).optional().describe('Labels for the issue'),
      },
    },
    async (args: {
      title: string;
      description?: string;
      type?: 'bug' | 'feature' | 'task' | 'epic' | 'chore';
      priority?: number;
      labels?: string[];
    }) => {
      const result = await client.createBeadsIssue(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating Beads issue: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const issue = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `Beads issue created: ${issue?.id} - ${issue?.title}`,
          },
        ],
      };
    }
  );

  // Update Beads Issue
  server.registerTool(
    'update_beads_issue',
    {
      description: 'Update an existing Beads issue',
      inputSchema: {
        id: z.string().describe('Issue ID'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        status: z
          .enum(['open', 'in_progress', 'blocked', 'closed'])
          .optional()
          .describe('New status'),
        type: z.enum(['bug', 'feature', 'task', 'epic', 'chore']).optional().describe('New type'),
        priority: z.number().min(0).max(4).optional().describe('New priority (0-4)'),
        labels: z.array(z.string()).optional().describe('New labels'),
      },
    },
    async (args: {
      id: string;
      title?: string;
      description?: string;
      status?: 'open' | 'in_progress' | 'blocked' | 'closed';
      type?: 'bug' | 'feature' | 'task' | 'epic' | 'chore';
      priority?: number;
      labels?: string[];
    }) => {
      const { id, ...params } = args;
      const result = await client.updateBeadsIssue(id, params);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error updating Beads issue: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Beads issue ${id} updated`,
          },
        ],
      };
    }
  );

  // Delete Beads Issue
  server.registerTool(
    'delete_beads_issue',
    {
      description: 'Delete a Beads issue',
      inputSchema: {
        id: z.string().describe('Issue ID to delete'),
      },
    },
    async (args: { id: string }) => {
      const result = await client.deleteBeadsIssue(args.id);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deleting Beads issue: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Beads issue ${args.id} deleted`,
          },
        ],
      };
    }
  );

  // Get Ready Work
  server.registerTool(
    'get_ready_work',
    {
      description: 'Get ready (unblocked) work items from Beads',
      inputSchema: {},
    },
    async () => {
      const result = await client.getReadyWork();

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting ready work: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const issues = result.data || [];
      if (issues.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No ready work available - all issues are blocked or closed',
            },
          ],
        };
      }

      const formatted = issues
        .map(
          (issue: { id: string; title: string; type: string; priority: number }) =>
            `- [${issue.id}] ${issue.title} (${issue.type}, P${issue.priority})`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Ready Work:\n\n${formatted}`,
          },
        ],
      };
    }
  );
}
