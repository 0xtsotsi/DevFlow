/**
 * Abstract base class for AI model providers
 */

import type {
  ProviderConfig,
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
} from './types.js';

/**
 * Authentication method type
 */
export type AuthMethod = 'api-key' | 'oauth' | 'cli-auth' | 'none';

/**
 * Rate limit information
 */
export interface RateLimit {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  concurrent?: number;
}

/**
 * Base provider class that all provider implementations must extend
 */
export abstract class BaseProvider {
  protected config: ProviderConfig;
  protected name: string;

  constructor(config: ProviderConfig = {}) {
    this.config = config;
    this.name = this.getName();
  }

  /**
   * Get the provider name (e.g., "claude", "cursor")
   */
  abstract getName(): string;

  /**
   * Execute a query and stream responses
   * @param options Execution options
   * @returns AsyncGenerator yielding provider messages
   */
  abstract executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage>;

  /**
   * Detect if the provider is installed and configured
   * @returns Installation status
   */
  abstract detectInstallation(): Promise<InstallationStatus>;

  /**
   * Get available models for this provider
   * @returns Array of model definitions
   */
  abstract getAvailableModels(): ModelDefinition[];

  /**
   * Get the authentication methods supported by this provider
   * @returns Array of supported authentication methods
   */
  getAuthenticationMethods(): AuthMethod[] {
    // Default implementation - override in subclasses
    return ['none'];
  }

  /**
   * Get the rate limits for this provider
   * @returns Rate limit information or undefined
   */
  getRateLimits(): RateLimit | undefined {
    // Default implementation - override in subclasses
    return undefined;
  }

  /**
   * Get provider capabilities
   * @returns Capability information or undefined
   */
  getCapabilities?(): {
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
    // Default implementation - override in subclasses
    return undefined;
  }

  /**
   * Validate the provider configuration
   * @returns Validation result
   */
  validateConfig(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Base validation (can be overridden)
    if (!this.config) {
      errors.push('Provider config is missing');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if the provider supports a specific feature
   * @param feature Feature name (e.g., "vision", "tools", "mcp")
   * @returns Whether the feature is supported
   */
  supportsFeature(feature: string): boolean {
    // Default implementation - override in subclasses
    const commonFeatures = ['tools', 'text'];
    return commonFeatures.includes(feature);
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return this.config;
  }

  /**
   * Update provider configuration
   */
  setConfig(config: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
