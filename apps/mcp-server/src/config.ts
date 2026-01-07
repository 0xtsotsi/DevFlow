/**
 * MCP Server Configuration
 *
 * Configuration management for the DevFlow MCP server.
 */

export interface DevFlowMCPServerConfig {
  /** DevFlow server URL */
  serverUrl: string;

  /** API key for authentication */
  apiKey: string;

  /** WebSocket URL for events (optional, defaults to serverUrl with ws protocol) */
  wsUrl?: string;

  /** Connection timeout in milliseconds */
  timeout?: number;

  /** Whether to enable WebSocket event streaming */
  enableEvents?: boolean;

  /** Maximum retry attempts for failed requests */
  maxRetries?: number;

  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Get configuration from environment variables
 */
export function getConfigFromEnv(): DevFlowMCPServerConfig {
  const serverUrl = process.env.DEVFLOW_SERVER_URL || 'http://localhost:3008';
  const apiKey = process.env.DEVFLOW_API_KEY || '';

  if (!apiKey) {
    throw new Error('DEVFLOW_API_KEY environment variable is required');
  }

  // Derive WebSocket URL from server URL if not provided
  let wsUrl = process.env.DEVFLOW_WS_URL;
  if (!wsUrl) {
    try {
      const url = new URL(serverUrl);
      wsUrl = url.protocol === 'https:' ? `wss://${url.host}` : `ws://${url.host}`;
    } catch {
      wsUrl = 'ws://localhost:3008';
    }
  }

  return {
    serverUrl,
    apiKey,
    wsUrl,
    timeout: parseInt(process.env.DEVFLOW_TIMEOUT || '30000', 10),
    enableEvents: process.env.DEVFLOW_ENABLE_EVENTS !== 'false',
    maxRetries: parseInt(process.env.DEVFLOW_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.DEVFLOW_RETRY_DELAY || '1000', 10),
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: DevFlowMCPServerConfig): void {
  if (!config.serverUrl) {
    throw new Error('serverUrl is required');
  }
  if (!config.apiKey) {
    throw new Error('apiKey is required');
  }

  try {
    new URL(config.serverUrl);
  } catch {
    throw new Error('serverUrl must be a valid URL');
  }
}
