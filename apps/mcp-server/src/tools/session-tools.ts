/**
 * Session Tools
 *
 * MCP tools for managing DevFlow sessions.
 */

import type { DevFlowClient } from '../client.js';
import { z } from 'zod';

/**
 * Register session tools with the MCP server
 */
export function registerSessionTools(server: any, client: DevFlowClient): void {
  // List Sessions
  server.registerTool(
    'list_sessions',
    {
      description: 'List all DevFlow agent sessions',
      inputSchema: {},
    },
    async () => {
      const result = await client.listSessions();

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing sessions: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const sessions = result.data || [];
      if (sessions.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No sessions found',
            },
          ],
        };
      }

      const formatted = sessions
        .map(
          (s: {
            sessionId: string;
            workingDirectory: string;
            isRunning: boolean;
            model?: string;
            createdAt?: string;
          }) =>
            `- ${s.sessionId}\n  Directory: ${s.workingDirectory}\n  Running: ${s.isRunning}\n  Model: ${s.model || 'default'}\n  Created: ${s.createdAt || 'unknown'}`
        )
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Sessions:\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // Create Session
  server.registerTool(
    'create_session',
    {
      description: 'Create a new DevFlow agent session',
      inputSchema: {
        sessionId: z.string().optional().describe('Custom session ID'),
        workingDirectory: z.string().optional().describe('Project directory path'),
        name: z.string().optional().describe('Display name for the session'),
        tags: z.array(z.string()).optional().describe('Tags for organizing sessions'),
      },
    },
    async (args: {
      sessionId?: string;
      workingDirectory?: string;
      name?: string;
      tags?: string[];
    }) => {
      const result = await client.createSession(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating session: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const session = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `Session created: ${session?.sessionId}`,
          },
        ],
      };
    }
  );

  // Update Session
  server.registerTool(
    'update_session',
    {
      description: 'Update session metadata (name, tags, archive status)',
      inputSchema: {
        sessionId: z.string().describe('Session ID to update'),
        name: z.string().optional().describe('New display name'),
        tags: z.array(z.string()).optional().describe('Tags to set'),
        archived: z.boolean().optional().describe('Archive status'),
      },
    },
    async (args: { sessionId: string; name?: string; tags?: string[]; archived?: boolean }) => {
      const { sessionId, ...params } = args;
      const result = await client.updateSession(sessionId, params);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error updating session: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Session ${sessionId} updated`,
          },
        ],
      };
    }
  );

  // Archive Session
  server.registerTool(
    'archive_session',
    {
      description: 'Archive a session (move to archived state)',
      inputSchema: {
        sessionId: z.string().describe('Session ID to archive'),
      },
    },
    async (args: { sessionId: string }) => {
      const result = await client.archiveSession(args.sessionId);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error archiving session: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Session ${args.sessionId} archived`,
          },
        ],
      };
    }
  );

  // Delete Session
  server.registerTool(
    'delete_session',
    {
      description: 'Permanently delete a session',
      inputSchema: {
        sessionId: z.string().describe('Session ID to delete'),
      },
    },
    async (args: { sessionId: string }) => {
      const result = await client.deleteSession(args.sessionId);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deleting session: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Session ${args.sessionId} deleted`,
          },
        ],
      };
    }
  );
}
