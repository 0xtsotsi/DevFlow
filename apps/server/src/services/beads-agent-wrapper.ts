/**
 * Beads Agent Wrapper Service
 *
 * Wraps the AgentService to inject Beads tool handling into agent execution.
 * Intercepts agent tool use events and executes custom Beads tools.
 *
 * This enables agents to use Beads tools (create_beads_issue, query_beads_memory,
 * spawn_helper_agent) even though they're not built into the Claude Agent SDK.
 */

import type { EventEmitter } from '../lib/events.js';

interface ToolUseEvent {
  name: string;
  input: Record<string, unknown>;
  sessionId: string;
  projectPath?: string;
}

interface AgentStreamEvent {
  sessionId: string;
  workingDirectory?: string;
  type: 'message' | 'stream' | 'tool_use' | 'complete';
  tool?: { name: string; input: Record<string, unknown> };
  messageId?: string;
  content?: string;
  isComplete?: boolean;
  toolUses?: unknown[];
}

interface BeadsToolsHandler {
  isBeadsTool(toolName: string): boolean;
  executeTool(
    toolName: string,
    input: Record<string, unknown>,
    context: { projectPath: string; sessionId?: string }
  ): Promise<{ success: boolean; data?: unknown; error?: string }>;
  formatToolResult(result: { success: boolean; data?: unknown; error?: string }): string;
}

/**
 * Beads Agent Wrapper Service
 *
 * Listens for agent tool use events and intercepts Beads-specific tools
 */
export class BeadsAgentWrapperService {
  private events: EventEmitter;
  private unsubscribe?: () => void;
  private activeSessions = new Map<string, string>(); // sessionId -> projectPath

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Initialize the wrapper service
   * Subscribes to agent events and intercepts tool use
   */
  initialize(): void {
    console.log('[BeadsAgentWrapper] Initializing agent wrapper service...');

    // Subscribe to agent:stream events (emitted by AgentService.emitAgentEvent)
    this.unsubscribe = this.events.subscribe((type: string, payload: unknown) => {
      if (type === 'agent:stream') {
        const event = payload as AgentStreamEvent;

        // Handle tool_use events
        if (event.type === 'tool_use' && event.tool) {
          this.handleToolUse({
            name: event.tool.name,
            input: event.tool.input as Record<string, unknown>,
            sessionId: event.sessionId,
            projectPath: event.workingDirectory,
          }).catch((error) => {
            console.error('[BeadsAgentWrapper] Error handling tool use:', error);
          });
        }
      }
    });

    console.log('[BeadsAgentWrapper] ✓ Agent wrapper service initialized');
  }

  /**
   * Shutdown the wrapper service
   */
  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.activeSessions.clear();
    console.log('[BeadsAgentWrapper] Agent wrapper service shut down');
  }

  /**
   * Handle tool use from agent
   * Intercept Beads tools and execute them
   */
  private async handleToolUse(event: ToolUseEvent): Promise<void> {
    const { name, input, sessionId, projectPath } = event;

    // Project path is now included in the event from AgentService
    if (!projectPath) {
      console.warn(
        `[BeadsAgentWrapper] No project path for session ${sessionId}, skipping tool ${name}`
      );
      return;
    }

    // Check if this is a Beads tool
    const beadsToolsHandler = (global as { beadsToolsHandler?: unknown }).beadsToolsHandler as
      | BeadsToolsHandler
      | undefined;

    if (!beadsToolsHandler) {
      console.warn('[BeadsAgentWrapper] BeadsToolsHandler not initialized');
      return;
    }

    // Type guard to check if it's our handler
    if (
      typeof beadsToolsHandler !== 'object' ||
      beadsToolsHandler === null ||
      !('isBeadsTool' in beadsToolsHandler) ||
      typeof beadsToolsHandler.isBeadsTool !== 'function'
    ) {
      return;
    }

    const handler = beadsToolsHandler;

    if (!handler.isBeadsTool(name)) {
      // Not a Beads tool, ignore
      return;
    }

    console.log(`[BeadsAgentWrapper] Intercepting Beads tool: ${name}`);

    // Execute the tool
    const context = {
      projectPath,
      sessionId,
    };

    try {
      const result = await handler.executeTool(name, input, context);

      // Format result for agent
      const formattedResult = handler.formatToolResult(result);

      // Emit response event that the agent stream can pick up
      this.events.emit('beads:tool-response', {
        toolName: name,
        sessionId,
        result: formattedResult,
        success: result.success,
      });

      console.log(`[BeadsAgentWrapper] Tool ${name} completed: ${result.success ? '✓' : '✗'}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[BeadsAgentWrapper] Tool ${name} failed:`, errorMessage);

      // Emit error response
      this.events.emit('beads:tool-response', {
        toolName: name,
        sessionId,
        result: `❌ Error: ${errorMessage}`,
        success: false,
      });
    }
  }

  /**
   * Register a session's project path for tool execution
   * Call this when starting an agent session
   */
  registerSession(sessionId: string, projectPath: string): void {
    this.activeSessions.set(sessionId, projectPath);
    console.log(`[BeadsAgentWrapper] Registered session ${sessionId} for project ${projectPath}`);
  }

  /**
   * Unregister a session
   * Call this when ending an agent session
   */
  unregisterSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }
}
