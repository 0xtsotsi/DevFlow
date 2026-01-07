/**
 * Skills Tools
 *
 * MCP tools for executing DevFlow skills (Research, Implementation, CI/CD, Workflow).
 */

import type { DevFlowClient } from '../client.js';
import { z } from 'zod';

/**
 * Register skills tools with the MCP server
 */
export function registerSkillsTools(server: any, client: DevFlowClient): void {
  // Research Skill
  server.registerTool(
    'execute_research',
    {
      description: 'Execute comprehensive research using codebase, web, and memory search',
      inputSchema: {
        projectPath: z.string().describe('Project directory path'),
        query: z.string().describe('Research query/question'),
        maxResults: z.number().optional().describe('Maximum number of results (default: 10)'),
      },
    },
    async (args: { projectPath: string; query: string; maxResults?: number }) => {
      const result = await client.executeResearch(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing research: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const data = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `Research Results:\n\n${data?.summary || 'No summary available'}\n\nSources:\n${(data?.sources || []).map((s: string) => `- ${s}`).join('\n')}`,
          },
        ],
      };
    }
  );

  // Implementation Skill
  server.registerTool(
    'execute_implementation',
    {
      description: 'Execute AI-powered code implementation',
      inputSchema: {
        projectPath: z.string().describe('Project directory path'),
        featureId: z.string().optional().describe('Feature ID to implement'),
        description: z.string().describe('Implementation description'),
      },
    },
    async (args: { projectPath: string; featureId?: string; description: string }) => {
      const result = await client.executeImplementation(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing implementation: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const data = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `Implementation ${data?.success ? 'completed' : 'failed'}:\n\n${data?.summary || 'No summary available'}`,
          },
        ],
      };
    }
  );

  // CI/CD Skill
  server.registerTool(
    'run_cicd',
    {
      description: 'Run CI/CD validation (linting, tests, build)',
      inputSchema: {
        projectPath: z.string().describe('Project directory path'),
        skipE2E: z.boolean().optional().describe('Skip E2E tests (default: false)'),
      },
    },
    async (args: { projectPath: string; skipE2E?: boolean }) => {
      const result = await client.runCICD(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error running CI/CD: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const data = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `CI/CD Validation ${data?.success ? 'passed' : 'failed'}:\n\n${data?.report || 'No report available'}`,
          },
        ],
      };
    }
  );

  // Workflow Orchestration
  server.registerTool(
    'execute_workflow',
    {
      description: 'Execute workflow orchestration (research → plan → implement → validate)',
      inputSchema: {
        issueId: z.string().optional().describe('Beads issue ID'),
        projectPath: z.string().describe('Project directory path'),
        mode: z
          .enum(['auto', 'semi'])
          .optional()
          .describe('Execution mode (auto=fully automated, semi=checkpoint approvals)'),
      },
    },
    async (args: { issueId?: string; projectPath: string; mode?: 'auto' | 'semi' }) => {
      const result = await client.executeWorkflow(args);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing workflow: ${result.error}`,
              isError: true,
            },
          ],
        };
      }

      const data = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `Workflow started:\n- ID: ${data?.workflowId || 'unknown'}\n- Status: ${data?.status || 'unknown'}\n- Mode: ${args.mode || 'auto'}`,
          },
        ],
      };
    }
  );
}
