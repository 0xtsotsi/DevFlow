#!/usr/bin/env node
/**
 * DevFlow MCP Server
 *
 * Model Context Protocol server for DevFlow AI Development Studio.
 * Exposes DevFlow's capabilities as MCP tools for use in Claude Code.
 *
 * Environment Variables:
 *   DEVFLOW_SERVER_URL - DevFlow server URL (default: http://localhost:3008)
 *   DEVFLOW_API_KEY - API key for authentication (required)
 *   DEVFLOW_WS_URL - WebSocket URL for events (optional, derived from server URL)
 *   DEVFLOW_TIMEOUT - Request timeout in milliseconds (default: 30000)
 *   DEVFLOW_ENABLE_EVENTS - Enable WebSocket event streaming (default: true)
 *   DEVFLOW_MAX_RETRIES - Maximum retry attempts (default: 3)
 *   DEVFLOW_RETRY_DELAY - Retry delay in milliseconds (default: 1000)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfigFromEnv, validateConfig, type DevFlowMCPServerConfig } from './config.js';
import { DevFlowClient } from './client.js';
import { DevFlowEventStream } from './events.js';
import { registerAgentTools } from './tools/agent-tools.js';
import { registerSessionTools } from './tools/session-tools.js';
import { registerFeatureTools } from './tools/feature-tools.js';
import { registerBeadsTools } from './tools/beads-tools.js';
import { registerSkillsTools } from './tools/skills-tools.js';
import { registerFilesystemTools } from './tools/filesystem-tools.js';
import { registerWorktreeTools } from './tools/worktree-tools.js';

/**
 * Main DevFlow MCP Server class
 */
class DevFlowMCPServer {
  private server: McpServer;
  private config: DevFlowMCPServerConfig;
  private client: DevFlowClient;
  private eventStream: DevFlowEventStream;
  private transport: StdioServerTransport | SSEServerTransport | null = null;

  constructor(config?: DevFlowMCPServerConfig) {
    // Load config from environment or use provided config
    this.config = config || getConfigFromEnv();
    validateConfig(this.config);

    // Create MCP server
    this.server = new McpServer({
      name: 'devflow-mcp-server',
      version: '1.0.0',
    });

    // Create DevFlow API client
    this.client = new DevFlowClient(this.config);

    // Create event stream (optional)
    this.eventStream = new DevFlowEventStream(this.config);

    // Register all tools
    this.registerTools();

    // Register event resources for streaming
    this.registerEventResources();
  }

  /**
   * Register all MCP tools
   */
  private registerTools(): void {
    // Agent Tools
    registerAgentTools(this.server, this.client);

    // Session Tools
    registerSessionTools(this.server, this.client);

    // Feature Tools
    registerFeatureTools(this.server, this.client);

    // Beads Tools
    registerBeadsTools(this.server, this.client);

    // Skills Tools
    registerSkillsTools(this.server, this.client);

    // File System Tools
    registerFilesystemTools(this.server, this.client);

    // Worktree Tools
    registerWorktreeTools(this.server, this.client);

    console.log('[DevFlow MCP] All tools registered');
  }

  /**
   * Register event resources for real-time streaming
   */
  private registerEventResources(): void {
    if (!this.config.enableEvents) {
      return;
    }

    // Register a resource for the latest events
    this.server.registerResource(
      'events',
      'latest',
      {
        description: 'Latest DevFlow events from the event stream',
        mimeType: 'application/json',
      },
      async () => {
        // Return accumulated events
        return {
          contents: [
            {
              uri: 'devflow:///events/latest',
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  connected: this.eventStream.isConnected(),
                  message: 'Event stream is available for real-time updates',
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    console.log('[DevFlow MCP] Event resources registered');
  }

  /**
   * Connect using stdio transport
   */
  async connectStdio(): Promise<void> {
    if (this.transport) {
      throw new Error('Already connected');
    }

    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);

    console.error('[DevFlow MCP] Server connected via stdio');
  }

  /**
   * Connect using SSE transport for HTTP
   */
  async connectSSE(port: number = 3009): Promise<void> {
    if (this.transport) {
      throw new Error('Already connected');
    }

    // Import express for SSE endpoint
    const express = await import('express');
    const app = express.default() as any;

    // Create SSE transport
    this.transport = new SSEServerTransport('/message', app);

    // Start HTTP server
    const server = app.listen(port, () => {
      console.error(`[DevFlow MCP] Server listening on port ${port}`);
      console.error(`[DevFlow MCP] SSE endpoint: http://localhost:${port}/message`);
    });

    await this.server.connect(this.transport as SSEServerTransport);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      server.close();
      this.disconnect();
    });
  }

  /**
   * Start the server with auto-detection of transport
   */
  async start(): Promise<void> {
    // Connect event stream if enabled
    if (this.config.enableEvents) {
      this.eventStream.connect();
    }

    // Auto-detect transport based on environment
    // If running as a subprocess (stdio is a TTY), use stdio
    // Otherwise, use SSE for HTTP connections
    if (process.stdin.isTTY) {
      await this.connectSSE();
    } else {
      await this.connectStdio();
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.eventStream.disconnect();
    console.error('[DevFlow MCP] Server disconnected');
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const server = new DevFlowMCPServer();
    await server.start();

    // Keep process alive for stdio mode
    if (!process.stdin.isTTY) {
      console.error('[DevFlow MCP] Server running, waiting for messages...');
    }
  } catch (error) {
    console.error('[DevFlow MCP] Fatal error:', error);
    process.exit(1);
  }
}

// Run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[DevFlow MCP] Unhandled error:', error);
    process.exit(1);
  });
}

export { DevFlowMCPServer as DevFlowMCPServer };
export { getConfigFromEnv, validateConfig };
export { DevFlowClient };
export { DevFlowEventStream };
export * from './config.js';
export * from './client.js';
