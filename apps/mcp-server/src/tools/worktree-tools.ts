/**
 * Worktree Tools
 *
 * MCP tools for Git worktree operations via DevFlow.
 */

import type { DevFlowClient } from '../client.js';
import { z } from 'zod';

/**
 * Register worktree tools with the MCP server
 */
export function registerWorktreeTools(server: any, client: DevFlowClient): void {
  // Get Worktree Status
  server.registerTool(
    'get_worktree_status',
    {
      description: 'Get current Git worktree status',
      inputSchema: {
        path: z.string().optional().describe('Project path (defaults to current)'),
      },
    },
    async (args: { path?: string }) => {
      const result = await client.getWorktreeStatus(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting worktree status: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const status = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `Worktree Status:\n  Branch: ${status?.branch || 'unknown'}\n  Status: ${status?.status || 'unknown'}`,
          },
        ],
      };
    }
  );

  // Get Diffs
  server.registerTool(
    'get_git_diffs',
    {
      description: 'Get Git diffs for uncommitted changes',
      inputSchema: {
        path: z.string().optional().describe('Project path (defaults to current)'),
      },
    },
    async (args: { path?: string }) => {
      const result = await client.getDiffs(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting diffs: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const diffs = result.data?.diffs || [];
      if (diffs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No uncommitted changes',
            },
          ],
        };
      }

      const formatted = diffs
        .map((d: { file: string; diff: string }) => `--- ${d.file}\n${d.diff}`)
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
      };
    }
  );

  // Commit Changes
  server.registerTool(
    'commit_changes',
    {
      description: 'Commit Git changes with a message',
      inputSchema: {
        path: z.string().optional().describe('Project path (defaults to current)'),
        message: z.string().describe('Commit message'),
      },
    },
    async (args: { path?: string; message: string }) => {
      const result = await client.commitChanges(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error committing changes: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Changes committed: ${result.data?.commit || 'unknown'}`,
          },
        ],
      };
    }
  );
}
