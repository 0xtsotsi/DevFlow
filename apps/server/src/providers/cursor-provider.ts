/**
 * Cursor Provider - Executes queries using Cursor CLI
 *
 * Wraps the Cursor CLI for seamless integration with the provider architecture.
 * Cursor must be installed and configured separately by the user.
 */

import { spawn } from 'child_process';
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';

export class CursorProvider extends BaseProvider {
  getName(): string {
    return 'cursor';
  }

  /**
   * Execute a query using Cursor CLI
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, cwd, systemPrompt } = options;

    // Cursor CLI path from config or default
    const cursorPath = this.config.cliPath || 'cursor';

    // Build arguments for Cursor CLI
    const args = ['ai', '--model', model];

    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    // Add prompt as argument
    if (typeof prompt === 'string') {
      args.push(prompt);
    }

    // Spawn Cursor process
    const cursorProcess = spawn(cursorPath, args, {
      cwd,
      env: { ...process.env, ...this.config.env },
    });

    const sessionId = `cursor-${Date.now()}`;

    // Create a promise that resolves when the process completes
    const completionPromise = new Promise<void>((resolve, reject) => {
      cursorProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Cursor process exited with code ${code}`));
        }
      });

      cursorProcess.on('error', (error) => {
        reject(error);
      });
    });

    // Stream stdout
    for await (const chunk of cursorProcess.stdout) {
      const text = chunk.toString();

      yield {
        type: 'assistant',
        session_id: sessionId,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text }],
        },
      };
    }

    // Wait for process completion
    await completionPromise;
  }

  /**
   * Detect Cursor CLI installation
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const cursorPath = this.config.cliPath || 'cursor';

    return new Promise((resolve) => {
      const cursorProcess = spawn(cursorPath, ['--version'], {
        env: { ...process.env, ...this.config.env },
      });

      let output = '';
      let errorOutput = '';

      cursorProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      cursorProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      cursorProcess.on('close', (code) => {
        if (code === 0 && output) {
          const versionMatch = output.match(/version\s+(\d+\.\d+\.\d+)/i);
          resolve({
            installed: true,
            method: 'cli',
            path: cursorPath,
            version: versionMatch ? versionMatch[1] : 'unknown',
            hasApiKey: false, // Cursor uses its own auth
            authenticated: false, // Cursor uses its own auth
          });
        } else {
          resolve({
            installed: false,
            error: errorOutput || 'Cursor CLI not found',
          });
        }
      });

      cursorProcess.on('error', () => {
        resolve({
          installed: false,
          error: 'Cursor CLI not found',
        });
      });
    });
  }

  /**
   * Get available Cursor models
   */
  getAvailableModels(): ModelDefinition[] {
    const models = [
      {
        id: 'cursor-opus-4-5',
        name: 'Cursor Opus 4.5',
        modelString: 'cursor-opus-4-5',
        provider: 'cursor',
        description: 'Most capable Cursor model (via Claude Opus 4.5)',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
        default: true,
      },
      {
        id: 'cursor-sonnet-4',
        name: 'Cursor Sonnet 4',
        modelString: 'cursor-sonnet-4',
        provider: 'cursor',
        description: 'Balanced performance and cost (via Claude Sonnet 4)',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'cursor-haiku-4-5',
        name: 'Cursor Haiku 4.5',
        modelString: 'cursor-haiku-4-5',
        provider: 'cursor',
        description: 'Fastest Cursor model (via Claude Haiku 4.5)',
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
    const supportedFeatures = ['tools', 'text', 'vision'];
    return supportedFeatures.includes(feature);
  }
}
