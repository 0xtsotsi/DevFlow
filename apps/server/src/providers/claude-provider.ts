/**
 * Claude Provider - Executes queries using Claude Agent SDK or CLI
 *
 * Routes through unified client when CLI auth is configured.
 * Falls back to SDK for API key auth. Enhanced with capability probing,
 * telemetry parsing, and authentication status tracking.
 */

import { query, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider, type AuthMethod, type RateLimit } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ContentBlock,
} from './types.js';
import type { TelemetryParser } from '../lib/telemetry.js';
import { claudeTelemetryParser } from './claude-telemetry.js';
import { getAuthStatus } from '../lib/claude-auth-manager.js';

export class ClaudeProvider extends BaseProvider {
  /** Telemetry parser for Claude output */
  public readonly telemetryParser: TelemetryParser = claudeTelemetryParser;

  getName(): string {
    return 'claude';
  }

  /**
   * Check if the provider is currently authenticated
   *
   * @returns Whether the provider has valid authentication
   */
  async isAuthenticated(): Promise<boolean> {
    const status = await this.detectInstallation();
    return status.authenticated ?? false;
  }

  /**
   * Get provider capabilities
   *
   * Returns a summary of Claude's capabilities.
   *
   * @returns Provider capabilities object
   */
  getCapabilities(): {
    supportsPlanning: boolean;
    supportsVision: boolean;
    supportsTools: boolean;
    supportsStreaming: boolean;
    supportsSystemPrompt: boolean;
    supportsConversationHistory: boolean;
    supportsMCP: boolean;
    supportsThinking: boolean;
    maxContextWindow: number;
    maxOutputTokens: number;
  } {
    // Derive max values from available models to ensure consistency
    const models = this.getAvailableModels();
    const maxContextWindow = Math.max(...models.map((m) => m.contextWindow ?? 0));
    const maxOutputTokens = Math.max(...models.map((m) => m.maxOutputTokens ?? 0));

    return {
      supportsPlanning: true,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
      supportsConversationHistory: true,
      supportsMCP: true,
      supportsThinking: true,
      maxContextWindow,
      maxOutputTokens,
    };
  }

  /**
   * Get authentication methods supported by Claude
   * @returns Array of supported authentication methods
   */
  getAuthenticationMethods(): AuthMethod[] {
    return ['api-key'];
  }

  /**
   * Get rate limits for Claude API
   * @returns Rate limit information
   */
  getRateLimits(): RateLimit {
    return {
      requestsPerMinute: 50,
      concurrent: 5,
    };
  }

  /**
   * Execute a query using Claude Agent SDK or CLI (if configured)
   *
   * Routes through unified client when CLI auth is configured.
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory,
      sdkSessionId,
    } = options;

    // Check if we should use CLI auth
    const authStatus = await getAuthStatus();
    const useCLI =
      authStatus.method === 'cli' ||
      (authStatus.method === 'auto' && authStatus.cli?.installed && authStatus.cli?.authenticated);

    if (useCLI) {
      // Use unified client for CLI mode
      console.log('[ClaudeProvider] Using CLI authentication');
      const { executeUnifiedQuery } = await import('../lib/unified-claude-client.js');

      // Convert array prompt to AsyncIterable if needed
      let cliPrompt: string | AsyncIterable<ProviderMessage>;
      if (Array.isArray(prompt)) {
        // For multi-part prompts with images, we need to convert to AsyncIterable
        cliPrompt = (async function* () {
          // Extract text content from array format
          let textContent = '';
          for (const item of prompt) {
            if (item.type === 'text' && item.text) {
              textContent += item.text;
            } else if (item.source) {
              // Image content - CLI mode doesn't support images well
              // Add a placeholder
              textContent += '[Image content]';
            }
          }
          yield {
            type: 'user',
            message: {
              role: 'user',
              content: [{ type: 'text', text: textContent }],
            },
          } as ProviderMessage;
        })();
      } else {
        cliPrompt = prompt;
      }

      yield* executeUnifiedQuery({
        prompt: cliPrompt,
        model,
        cwd,
        systemPrompt,
        maxTurns,
        allowedTools,
        abortController,
        conversationHistory,
        sdkSessionId,
        forceAuthMethod: 'cli',
      });
      return;
    }

    // Use SDK for API key mode (original behavior)
    console.log('[ClaudeProvider] Using API key authentication');

    // Build Claude SDK options
    const defaultTools = [
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'Bash',
      'WebSearch',
      'WebFetch',
      'create_beads_issue', // NEW: Create Beads issues from agent tools
      'query_beads_memory', // NEW: Search past issues for context
      'spawn_helper_agent', // NEW: Spawn specialized helper agents
    ];
    const toolsToUse = allowedTools || defaultTools;

    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      allowedTools: toolsToUse,
      permissionMode: 'acceptEdits',
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      },
      abortController,
      // Resume existing SDK session if we have a session ID
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
    };

    // Build prompt payload
    let promptPayload: string | AsyncIterable<SDKUserMessage>;

    if (Array.isArray(prompt)) {
      // Multi-part prompt (with images)
      promptPayload = (async function* () {
        const multiPartPrompt = {
          type: 'user' as const,
          session_id: '',
          message: {
            role: 'user' as const,
            content: prompt as ContentBlock[],
          },
          parent_tool_use_id: null,
        };
        yield multiPartPrompt as SDKUserMessage;
      })();
    } else {
      // Simple text prompt
      promptPayload = prompt;
    }

    // Execute via Claude Agent SDK
    try {
      const stream = query({ prompt: promptPayload, options: sdkOptions });

      // Stream messages directly - they're already in the correct format
      for await (const msg of stream) {
        yield msg as ProviderMessage;
      }
    } catch (error) {
      console.error('[ClaudeProvider] executeQuery() error during execution:', error);
      throw error;
    }
  }

  /**
   * Detect Claude SDK installation (always available via npm)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    // Claude SDK is always available since it's a dependency
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    const status: InstallationStatus = {
      installed: true,
      method: 'sdk',
      hasApiKey,
      authenticated: hasApiKey,
    };

    return status;
  }

  /**
   * Get available Claude models
   */
  getAvailableModels(): ModelDefinition[] {
    const models = [
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        modelString: 'claude-opus-4-5-20251101',
        provider: 'anthropic',
        description: 'Most capable Claude model',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
        default: true,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        modelString: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        description: 'Balanced performance and cost',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        modelString: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        description: 'Fast and capable',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        modelString: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        description: 'Fastest Claude model',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ] satisfies ModelDefinition[];
    return models;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'thinking'];
    return supportedFeatures.includes(feature);
  }
}
