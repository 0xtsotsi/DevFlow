/**
 * Cursor Provider - Cursor IDE provider implementation
 *
 * Integrates with Cursor IDE's CLI to execute AI queries. Cursor uses
 * Claude under the hood, providing similar capabilities with Cursor-
 * specific features.
 *
 * Features:
 * - Execute queries via Cursor CLI
 * - Authentication check (CLI availability)
 * - Telemetry parsing for Cursor output
 * - Model listing from Cursor
 */

import { spawn } from 'child_process';
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';
import type { TelemetryParser } from '../lib/telemetry.js';
import { cursorTelemetryParser } from './cursor-telemetry.js';

/**
 * Cursor CLI command name
 */
const CURSOR_CLI = 'cursor';

/**
 * Default models available in Cursor
 */
const CURSOR_MODELS: ModelDefinition[] = [
  {
    id: 'cursor-claude-opus-4-5',
    name: 'Cursor Claude Opus 4.5',
    modelString: 'claude-opus-4-5-20251101',
    provider: 'cursor',
    description: 'Most capable Claude model via Cursor',
    contextWindow: 200000,
    maxOutputTokens: 16000,
    supportsVision: true,
    supportsTools: true,
    tier: 'premium' as const,
  },
  {
    id: 'cursor-claude-sonnet-4',
    name: 'Cursor Claude Sonnet 4',
    modelString: 'claude-sonnet-4-20250514',
    provider: 'cursor',
    description: 'Balanced performance and cost via Cursor',
    contextWindow: 200000,
    maxOutputTokens: 16000,
    supportsVision: true,
    supportsTools: true,
    tier: 'standard' as const,
    default: true,
  },
  {
    id: 'cursor-claude-3-5-sonnet',
    name: 'Cursor Claude 3.5 Sonnet',
    modelString: 'claude-3-5-sonnet-20241022',
    provider: 'cursor',
    description: 'Fast and capable via Cursor',
    contextWindow: 200000,
    maxOutputTokens: 8000,
    supportsVision: true,
    supportsTools: true,
    tier: 'standard' as const,
  },
  {
    id: 'cursor-claude-haiku',
    name: 'Cursor Claude Haiku',
    modelString: 'claude-haiku-4-5-20251001',
    provider: 'cursor',
    description: 'Fastest Claude model via Cursor',
    contextWindow: 200000,
    maxOutputTokens: 8000,
    supportsVision: true,
    supportsTools: true,
    tier: 'basic' as const,
  },
];

/**
 * Cursor Provider class
 *
 * Executes AI queries using Cursor IDE's CLI integration.
 */
export class CursorProvider extends BaseProvider {
  /** Telemetry parser for Cursor output */
  public readonly telemetryParser: TelemetryParser = cursorTelemetryParser;

  /** Path to Cursor CLI (can be overridden) */
  private cliPath: string;

  constructor(cliPath: string = CURSOR_CLI) {
    super();
    this.cliPath = cliPath;
  }

  getName(): string {
    return 'cursor';
  }

  /**
   * Execute a query using Cursor CLI
   *
   * Note: This is a simplified implementation. Cursor CLI integration
   * requires proper streaming support which needs more complex handling.
   * For now, we execute synchronously and yield the result.
   *
   * @param options Execution options
   * @returns AsyncGenerator yielding provider messages
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, cwd, systemPrompt } = options;

    // Build Cursor CLI arguments
    const args = this.buildCursorArgs(model, systemPrompt);

    // Add prompt as argument
    if (typeof prompt === 'string') {
      args.push(prompt);
    }

    try {
      // Run the command and get output
      const output = await this.runCursorCommand(args);

      // Yield the output as an assistant message
      yield {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: output,
            },
          ],
        },
      };

      // Yield final result
      yield {
        type: 'result',
        subtype: 'success',
        result: output,
      };
    } catch (error) {
      yield {
        type: 'error',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Build CLI arguments for Cursor
   *
   * @param model Model identifier
   * @param systemPrompt Optional system prompt
   * @returns Array of CLI arguments
   */
  private buildCursorArgs(model: string, systemPrompt?: string): string[] {
    const args: string[] = [];

    // Note: Actual Cursor CLI arguments may differ based on implementation
    // This is a placeholder for the expected CLI interface

    if (systemPrompt) {
      args.push('--system', systemPrompt);
    }

    args.push('--model', model);

    return args;
  }

  /**
   * Detect Cursor CLI installation and authentication
   *
   * @returns Installation status
   */
  async detectInstallation(): Promise<InstallationStatus> {
    try {
      // Try to run cursor --version to check if it's installed
      const result = await this.runCursorCommand(['--version']);

      const versionMatch = result.match(/version\s+(\d+\.\d+\.\d+)/i);
      const version = versionMatch ? versionMatch[1] : undefined;

      // Check authentication by trying a simple command
      // (Cursor may not have an explicit auth check command)
      const authenticated = true; // Assume authenticated if CLI is available

      return {
        installed: true,
        method: 'cli',
        path: this.cliPath,
        version,
        hasApiKey: true,
        authenticated,
      };
    } catch (error) {
      return {
        installed: false,
        method: 'cli',
        error: (error as Error).message,
      };
    }
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
   * Cursor has similar capabilities to Claude since it uses Claude under the hood.
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
    return {
      supportsPlanning: true,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
      supportsConversationHistory: true,
      supportsMCP: false, // Cursor may not support MCP
      supportsThinking: true,
      maxContextWindow: 200000,
      maxOutputTokens: 16000,
    };
  }

  /**
   * Get available Cursor models
   *
   * @returns Array of model definitions
   */
  getAvailableModels(): ModelDefinition[] {
    return CURSOR_MODELS;
  }

  /**
   * Check if the provider supports a specific feature
   *
   * @param feature Feature name
   * @returns Whether the feature is supported
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'thinking', 'streaming', 'system-prompt'];
    return supportedFeatures.includes(feature);
  }

  /**
   * Run a Cursor CLI command and return the output
   *
   * @param args CLI arguments
   * @returns Command output
   */
  private runCursorCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.cliPath, args);
      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Cursor CLI command failed: ${errorOutput || output}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn Cursor CLI: ${err.message}`));
      });
    });
  }
}
