/**
 * Beads Custom Tools for Claude Agent SDK
 *
 * Implements custom tools that agents can use to interact with Beads:
 * - create_beads_issue: Create issues in Beads
 * - query_beads_memory: Search past issues for context
 * - spawn_helper_agent: Request specialized helper agents
 *
 * These tools are injected into the agent execution flow through
 * event interception and tool call handling.
 */

import { BeadsService } from '../services/beads-service.js';
import { BeadsMemoryService } from '../services/beads-memory-service.js';
import type { BeadsAgentCoordinator } from '../services/beads-agent-coordinator.js';
import type { EventEmitter } from './events.js';
import type { CreateBeadsIssueInput, BeadsIssueType } from '@automaker/types';

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Context for tool execution
 */
export interface ToolContext {
  projectPath: string;
  sessionId?: string;
}

/**
 * Type for helper agent types
 */
type AgentType =
  | 'planning'
  | 'implementation'
  | 'testing'
  | 'review'
  | 'debug'
  | 'documentation'
  | 'refactoring'
  | 'orchestration'
  | 'generic';

/**
 * Beads Custom Tools Handler
 *
 * Intercepts tool calls and executes Beads-specific operations
 */
export class BeadsToolsHandler {
  private beadsService: BeadsService;
  private beadsMemoryService: BeadsMemoryService;
  private beadsAgentCoordinator: BeadsAgentCoordinator | null;
  private events: EventEmitter;

  constructor(
    beadsService: BeadsService,
    beadsMemoryService: BeadsMemoryService,
    beadsAgentCoordinator: BeadsAgentCoordinator | null,
    events: EventEmitter
  ) {
    this.beadsService = beadsService;
    this.beadsMemoryService = beadsMemoryService;
    this.beadsAgentCoordinator = beadsAgentCoordinator;
    this.events = events;
  }

  /**
   * Check if a tool name is a Beads tool
   */
  isBeadsTool(toolName: string): boolean {
    return ['create_beads_issue', 'query_beads_memory', 'spawn_helper_agent'].includes(toolName);
  }

  /**
   * Execute a Beads tool
   */
  async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'create_beads_issue':
          return await this.createBeadsIssue(input, context);
        case 'query_beads_memory':
          return await this.queryBeadsMemory(input, context);
        case 'spawn_helper_agent':
          return await this.spawnHelperAgent(input, context);
        default:
          return {
            success: false,
            error: `Unknown Beads tool: ${toolName}`,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[BeadsTools] Error executing ${toolName}:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Create a Beads issue
   *
   * Input schema:
   * - title: string (required)
   * - description?: string
   * - type?: 'bug' | 'feature' | 'task'
   * - priority?: number (0-3)
   */
  private async createBeadsIssue(
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { title, description, type, priority } = input;

    // Validate input
    if (!title || typeof title !== 'string') {
      return {
        success: false,
        error: 'create_beads_issue requires a title (string)',
      };
    }

    const issueInput: CreateBeadsIssueInput = {
      title,
      description: typeof description === 'string' ? description : undefined,
      type: (type === 'bug' || type === 'feature' || type === 'task' ? type : undefined) as
        | BeadsIssueType
        | undefined,
      priority: typeof priority === 'number' ? priority : undefined,
    };

    try {
      const issue = await this.beadsService.createIssue(context.projectPath, issueInput);
      console.log(`[BeadsTools] Created issue ${issue.id}: ${issue.title}`);

      // Emit event for tracking
      this.events.emit('beads:tool-issue-created', {
        issueId: issue.id,
        sessionId: context.sessionId,
        tool: 'create_beads_issue',
      });

      return {
        success: true,
        data: {
          id: issue.id,
          title: issue.title,
          status: issue.status,
          type: issue.type,
          priority: issue.priority,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to create Beads issue: ${errorMessage}`,
      };
    }
  }

  /**
   * Query Beads memory for relevant context
   *
   * Input schema:
   * - query: string (required) - Search query
   * - maxResults?: number (default: 10)
   */
  private async queryBeadsMemory(
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { query, maxResults } = input;

    // Validate input
    if (!query || typeof query !== 'string') {
      return {
        success: false,
        error: 'query_beads_memory requires a query (string)',
      };
    }

    try {
      const contextResult = await this.beadsMemoryService.queryRelevantContext(
        context.projectPath,
        query,
        {
          maxResults: typeof maxResults === 'number' ? maxResults : 10,
          includeClosed: true,
        }
      );

      console.log(
        `[BeadsTools] Queried memory for "${query}": ${contextResult.relatedBugs.length + contextResult.relatedFeatures.length} issues found`
      );

      // Emit event for tracking
      this.events.emit('beads:tool-memory-queried', {
        query,
        resultCount: contextResult.relatedBugs.length + contextResult.relatedFeatures.length,
        sessionId: context.sessionId,
        tool: 'query_beads_memory',
      });

      return {
        success: true,
        data: {
          query,
          relatedBugs: contextResult.relatedBugs,
          relatedFeatures: contextResult.relatedFeatures,
          pastDecisions: contextResult.pastDecisions,
          blockedBy: contextResult.blockedBy,
          similarIssues: contextResult.similarIssues,
          summary: contextResult.summary,
          totalIssues: contextResult.relatedBugs.length + contextResult.relatedFeatures.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to query Beads memory: ${errorMessage}`,
      };
    }
  }

  /**
   * Spawn a helper agent for a subtask
   *
   * Input schema:
   * - helperType: string (required) - Type of helper agent
   * - taskDescription: string (required) - Description of the task
   */
  private async spawnHelperAgent(
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { helperType, taskDescription } = input;

    // Validate input
    if (!helperType || typeof helperType !== 'string') {
      return {
        success: false,
        error: 'spawn_helper_agent requires helperType (string)',
      };
    }

    if (!taskDescription || typeof taskDescription !== 'string') {
      return {
        success: false,
        error: 'spawn_helper_agent requires taskDescription (string)',
      };
    }

    // Validate helperType is a valid AgentType
    const validAgentTypes: AgentType[] = [
      'planning',
      'implementation',
      'testing',
      'review',
      'debug',
      'documentation',
      'refactoring',
      'orchestration',
      'generic',
    ];

    if (!validAgentTypes.includes(helperType as AgentType)) {
      return {
        success: false,
        error: `Invalid helperType: ${helperType}. Must be one of: ${validAgentTypes.join(', ')}`,
      };
    }

    if (!this.beadsAgentCoordinator) {
      return {
        success: false,
        error: 'BeadsAgentCoordinator is not available. Helper spawning is disabled.',
      };
    }

    if (!context.sessionId) {
      return {
        success: false,
        error: 'Cannot spawn helper agent: no sessionId provided',
      };
    }

    try {
      // First create an issue for the helper task
      const issueInput: CreateBeadsIssueInput = {
        title: `[Helper] ${taskDescription.substring(0, 50)}...`,
        description: `Helper task for ${context.sessionId}\n\n${taskDescription}`,
        type: 'task' as BeadsIssueType,
        priority: 1,
      };

      const issue = await this.beadsService.createIssue(context.projectPath, issueInput);

      // Spawn the helper agent
      const result = await this.beadsAgentCoordinator.spawnHelperAgent(
        context.sessionId,
        helperType as AgentType,
        taskDescription,
        context.projectPath
      );

      console.log(
        `[BeadsTools] Spawned helper agent ${result.helperSessionId} for issue ${issue.id}`
      );

      // Emit event for tracking
      this.events.emit('beads:tool-helper-spawned', {
        helperSessionId: result.helperSessionId,
        helperType,
        issueId: issue.id,
        parentSessionId: context.sessionId,
        tool: 'spawn_helper_agent',
      });

      return {
        success: true,
        data: {
          helperSessionId: result.helperSessionId,
          issueId: issue.id,
          helperType,
          message: `Helper agent ${result.helperSessionId} spawned and assigned to issue ${issue.id}`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to spawn helper agent: ${errorMessage}`,
      };
    }
  }

  /**
   * Format tool result for agent consumption
   */
  formatToolResult(result: ToolResult): string {
    if (!result.success) {
      return `❌ Error: ${result.error}`;
    }

    if (result.data === undefined) {
      return '✅ Operation completed successfully';
    }

    return `✅ Success:\n${JSON.stringify(result.data, null, 2)}`;
  }
}

/**
 * Get singleton instance of BeadsToolsHandler
 */
let beadsToolsHandlerInstance: BeadsToolsHandler | null = null;

export function getBeadsToolsHandler(
  beadsService: BeadsService,
  beadsMemoryService: BeadsMemoryService,
  beadsAgentCoordinator: BeadsAgentCoordinator | null,
  events: EventEmitter
): BeadsToolsHandler {
  if (!beadsToolsHandlerInstance) {
    beadsToolsHandlerInstance = new BeadsToolsHandler(
      beadsService,
      beadsMemoryService,
      beadsAgentCoordinator,
      events
    );
  }
  return beadsToolsHandlerInstance;
}
