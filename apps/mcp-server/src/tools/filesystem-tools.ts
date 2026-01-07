/**
 * File System Tools
 *
 * MCP tools for file system operations via DevFlow.
 */

import type { DevFlowClient } from '../client.js';
import { z } from 'zod';

/**
 * Register file system tools with the MCP server
 */
export function registerFilesystemTools(server: any, client: DevFlowClient): void {
  // Read File
  server.registerTool(
    'read_file',
    {
      description: 'Read file contents from the project',
      inputSchema: {
        path: z.string().describe('File path to read'),
      },
    },
    async (args: { path: string }) => {
      const result = await client.readFile(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error reading file: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.data?.content || '',
          },
        ],
      };
    }
  );

  // Write File
  server.registerTool(
    'write_file',
    {
      description: 'Write content to a file',
      inputSchema: {
        path: z.string().describe('File path to write'),
        content: z.string().describe('Content to write'),
      },
    },
    async (args: { path: string; content: string }) => {
      const result = await client.writeFile(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error writing file: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `File written: ${args.path}`,
          },
        ],
      };
    }
  );

  // Read Directory
  server.registerTool(
    'read_directory',
    {
      description: 'List directory contents',
      inputSchema: {
        path: z.string().describe('Directory path'),
      },
    },
    async (args: { path: string }) => {
      const result = await client.readDir(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error reading directory: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const entries = result.data?.entries || [];
      const formatted = entries
        .map(
          (e: { name: string; type: string }) =>
            `${e.type === 'directory' ? '[DIR]' : '[FILE]'} ${e.name}`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: formatted || 'Empty directory',
          },
        ],
      };
    }
  );

  // Path Exists
  server.registerTool(
    'path_exists',
    {
      description: 'Check if a file or directory exists',
      inputSchema: {
        path: z.string().describe('Path to check'),
      },
    },
    async (args: { path: string }) => {
      const result = await client.pathExists(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error checking path: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `${args.path}: ${result.data?.exists ? 'exists' : 'does not exist'}`,
          },
        ],
      };
    }
  );

  // Get Stats
  server.registerTool(
    'get_file_stats',
    {
      description: 'Get file or directory statistics',
      inputSchema: {
        path: z.string().describe('Path to get stats for'),
      },
    },
    async (args: { path: string }) => {
      const result = await client.getStats(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting stats: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const stats = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `${args.path}\n  Type: ${stats?.type}\n  Size: ${stats?.size || 0} bytes\n  Modified: ${stats?.modified || 'unknown'}`,
          },
        ],
      };
    }
  );
}
