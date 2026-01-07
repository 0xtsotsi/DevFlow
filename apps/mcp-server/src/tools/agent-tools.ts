/**
 * Agent Tools
 *
 * MCP tools for interacting with DevFlow agent sessions.
 */

import type { DevFlowClient } from '../client.js';
import { z } from 'zod';

/**
 * Register agent tools with the MCP server
 */
export function registerAgentTools(server: any, client: DevFlowClient): void {
  // Start/Resume Agent
  server.registerTool(
    'start_agent',
    {
      description: 'Start or resume a conversation with a Claude AI agent in DevFlow',
      inputSchema: {
        sessionId: z.string().optional().describe('Optional session ID to resume existing session'),
        workingDirectory: z.string().describe('Project directory path'),
        message: z.string().optional().describe('Initial message to send'),
        model: z.string().optional().describe('Claude model to use (e.g., claude-sonnet-4.5)'),
      },
    },
    async (args: {
      sessionId?: string;
      workingDirectory: string;
      message?: string;
      model?: string;
    }) => {
      const result = await client.startAgent(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error starting agent: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Agent session started: ${result.data?.sessionId}`,
          },
        ],
      };
    }
  );

  // Send Message
  server.registerTool(
    'send_message',
    {
      description: 'Send a message to a running DevFlow agent session',
      inputSchema: {
        sessionId: z.string().describe('Agent session ID'),
        message: z.string().describe('Message to send to the agent'),
        imagePaths: z.array(z.string()).optional().describe('Optional image attachments'),
      },
    },
    async (args: { sessionId: string; message: string; imagePaths?: string[] }) => {
      const result = await client.sendMessage(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error sending message: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.data?.response || 'Message sent',
          },
        ],
      };
    }
  );

  // Get History
  server.registerTool(
    'get_conversation_history',
    {
      description: 'Get conversation history for an agent session',
      inputSchema: {
        sessionId: z.string().describe('Agent session ID'),
      },
    },
    async (args: { sessionId: string }) => {
      const result = await client.getHistory(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting history: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const history = result.data || [];
      const formatted = history
        .map((msg: { role: string; content: string }) => `[${msg.role}]: ${msg.content}`)
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: formatted || 'No conversation history',
          },
        ],
      };
    }
  );

  // Stop Agent
  server.registerTool(
    'stop_agent',
    {
      description: 'Stop a running agent session',
      inputSchema: {
        sessionId: z.string().describe('Agent session ID to stop'),
      },
    },
    async (args: { sessionId: string }) => {
      const result = await client.stopAgent(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error stopping agent: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Agent ${args.sessionId} stopped`,
          },
        ],
      };
    }
  );

  // Clear Conversation
  server.registerTool(
    'clear_conversation',
    {
      description: 'Clear conversation history for an agent session',
      inputSchema: {
        sessionId: z.string().describe('Agent session ID'),
      },
    },
    async (args: { sessionId: string }) => {
      const result = await client.clearConversation(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error clearing conversation: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Conversation cleared for session ${args.sessionId}`,
          },
        ],
      };
    }
  );
}
