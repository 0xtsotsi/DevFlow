/**
 * Feature Tools
 *
 * MCP tools for managing DevFlow Kanban features.
 */

import type { DevFlowClient } from '../client.js';
import { z } from 'zod';

/**
 * Register feature tools with the MCP server
 */
export function registerFeatureTools(server: any, client: DevFlowClient): void {
  // List Features
  server.registerTool(
    'list_features',
    {
      description: 'List Kanban features with optional filters',
      inputSchema: {
        status: z
          .array(z.string())
          .optional()
          .describe('Filter by status (e.g., ["backlog", "in-progress"])'),
        type: z.array(z.string()).optional().describe('Filter by feature type'),
        limit: z.number().optional().describe('Maximum number of features to return'),
      },
    },
    async (args: { status?: string[]; type?: string[]; limit?: number }) => {
      const result = await client.listFeatures(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing features: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const features = result.data || [];
      if (features.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No features found',
            },
          ],
        };
      }

      const formatted = features
        .map(
          (f: {
            id: string;
            title: string;
            status: string;
            type: string;
            priority?: number;
            description?: string;
          }) =>
            `- [${f.id}] ${f.title}\n  Status: ${f.status}\n  Type: ${f.type}\n  Priority: ${f.priority || 'none'}\n  ${f.description || ''}`
        )
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Features:\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // Get Feature
  server.registerTool(
    'get_feature',
    {
      description: 'Get details of a specific feature',
      inputSchema: {
        id: z.string().describe('Feature ID'),
      },
    },
    async (args: { id: string }) => {
      const result = await client.getFeature(args.id);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting feature: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const f = result.data;
      const formatted = f
        ? `ID: ${f.id}\nTitle: ${f.title}\nStatus: ${f.status}\nType: ${f.type}\nPriority: ${f.priority || 'none'}\nDescription: ${f.description || 'none'}\nCreated: ${f.createdAt || 'unknown'}\nUpdated: ${f.updatedAt || 'unknown'}`
        : 'Feature not found';

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

  // Create Feature
  server.registerTool(
    'create_feature',
    {
      description: 'Create a new Kanban feature',
      inputSchema: {
        title: z.string().describe('Feature title'),
        description: z.string().optional().describe('Feature description'),
        type: z.string().optional().describe('Feature type (default: feature)'),
        priority: z.number().optional().describe('Priority level (0-4)'),
        status: z.string().optional().describe('Initial status (default: backlog)'),
      },
    },
    async (args: {
      title: string;
      description?: string;
      type?: string;
      priority?: number;
      status?: string;
    }) => {
      const result = await client.createFeature(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating feature: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const f = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `Feature created: ${f?.id} - ${f?.title}`,
          },
        ],
      };
    }
  );

  // Update Feature
  server.registerTool(
    'update_feature',
    {
      description: 'Update an existing feature',
      inputSchema: {
        id: z.string().describe('Feature ID'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        status: z.string().optional().describe('New status'),
        type: z.string().optional().describe('New type'),
        priority: z.number().optional().describe('New priority (0-4)'),
      },
    },
    async (args: {
      id: string;
      title?: string;
      description?: string;
      status?: string;
      type?: string;
      priority?: number;
    }) => {
      const { id, ...params } = args;
      const result = await client.updateFeature(id, params);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error updating feature: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Feature ${id} updated`,
          },
        ],
      };
    }
  );

  // Delete Feature
  server.registerTool(
    'delete_feature',
    {
      description: 'Delete a feature',
      inputSchema: {
        id: z.string().describe('Feature ID to delete'),
      },
    },
    async (args: { id: string }) => {
      const result = await client.deleteFeature(args.id);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deleting feature: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Feature ${args.id} deleted`,
          },
        ],
      };
    }
  );
}
