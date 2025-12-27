/**
 * Provider Capability Probe - Runtime detection of provider capabilities
 *
 * Probes providers at runtime to discover their capabilities, limits,
 * and authentication status. Results are cached to reduce overhead.
 *
 * Features:
 * - Authentication method detection
 * - Capability testing (vision, tools, streaming, etc.)
 * - Rate limit probing
 * - Capability caching with TTL
 * - Model availability checking
 */

import type { BaseProvider } from './base-provider.js';
import type { ModelDefinition } from './types.js';

/**
 * Authentication methods supported by providers
 */
export type AuthMethod = 'api-key' | 'oauth' | 'cli-auth' | 'none';

/**
 * Supported capability flags
 */
export interface ProviderCapability {
  /** Authentication methods available */
  authMethods: AuthMethod[];
  /** Whether the provider supports planning mode */
  supportsPlanning: boolean;
  /** Whether the provider supports vision/image input */
  supportsVision: boolean;
  /** Whether the provider supports tool/function calling */
  supportsTools: boolean;
  /** Whether the provider supports streaming responses */
  supportsStreaming: boolean;
  /** Whether the provider supports system prompts */
  supportsSystemPrompt: boolean;
  /** Whether the provider supports conversation history */
  supportsConversationHistory: boolean;
  /** Whether the provider supports MCP servers */
  supportsMCP: boolean;
  /** Whether the provider supports thinking mode */
  supportsThinking: boolean;
  /** Maximum context window (tokens) */
  maxContextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Rate limit (requests per minute) if known */
  rateLimit?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    concurrent?: number;
  };
  /** Provider-specific capabilities */
  customCapabilities?: Record<string, boolean | number | string>;
}

/**
 * Cached capability result with TTL
 */
interface CachedCapability {
  capability: ProviderCapability;
  timestamp: number;
}

/**
 * Provider limits discovered through probing
 */
export interface ProviderLimits {
  /** Maximum concurrent requests */
  maxConcurrent: number;
  /** Request timeout in milliseconds */
  requestTimeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry backoff base in milliseconds */
  retryBackoffBase: number;
}

/**
 * Result of a capability probe
 */
export interface ProbeResult {
  providerId: string;
  capability: ProviderCapability;
  limits: ProviderLimits;
  timestamp: number;
  cacheHit: boolean;
}

/**
 * Default capability set for providers
 */
const DEFAULT_CAPABILITY: ProviderCapability = {
  authMethods: ['api-key'],
  supportsPlanning: false,
  supportsVision: false,
  supportsTools: false,
  supportsStreaming: false,
  supportsSystemPrompt: false,
  supportsConversationHistory: false,
  supportsMCP: false,
  supportsThinking: false,
  maxContextWindow: 0,
  maxOutputTokens: 0,
};

/**
 * Default limits for providers
 */
const DEFAULT_LIMITS: ProviderLimits = {
  maxConcurrent: 3,
  requestTimeout: 120000, // 2 minutes
  maxRetries: 3,
  retryBackoffBase: 1000, // 1 second
};

/**
 * Cache TTL in milliseconds (5 minutes)
 */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Provider Capability Probe class
 *
 * Probes providers to detect their capabilities and limits.
 * Results are cached to minimize redundant probes.
 */
export class ProviderCapabilityProbe {
  private cache = new Map<string, CachedCapability>();
  private cacheTTL: number;

  constructor(cacheTTL: number = CACHE_TTL) {
    this.cacheTTL = cacheTTL;
  }

  /**
   * Probe authentication methods for a provider
   *
   * @param provider Provider instance
   * @returns Available authentication methods
   */
  async detectAuth(provider: BaseProvider): Promise<AuthMethod[]> {
    const methods: AuthMethod[] = [];
    const name = provider.getName();

    // Check for API key authentication
    if (name === 'claude' && process.env.ANTHROPIC_API_KEY) {
      methods.push('api-key');
    }

    // Check for CLI-based authentication
    const installStatus = await provider.detectInstallation();
    if (installStatus.authenticated) {
      if (installStatus.method === 'cli') {
        methods.push('cli-auth');
      }
    }

    // Default to 'none' if no auth found but provider is installed
    if (methods.length === 0 && installStatus.installed) {
      methods.push('none');
    }

    return methods;
  }

  /**
   * Test if a provider supports a specific capability
   *
   * @param provider Provider instance
   * @param capability Capability name to test
   * @returns Whether the capability is supported
   */
  async testCapability(provider: BaseProvider, capability: string): Promise<boolean> {
    // Check using the provider's supportsFeature method
    return provider.supportsFeature(capability);
  }

  /**
   * Probe a provider's rate limits
   *
   * Note: Most providers don't expose rate limits programmatically.
   * This returns known limits for supported providers.
   *
   * @param provider Provider instance
   * @returns Rate limit information or undefined
   */
  async probeLimits(provider: BaseProvider): Promise<ProviderCapability['rateLimit']> {
    const name = provider.getName();

    // Known rate limits for popular providers
    switch (name) {
      case 'claude':
        return {
          requestsPerMinute: 50, // Default for most tiers
          concurrent: 5,
        };
      case 'cursor':
        return {
          requestsPerMinute: 60,
          concurrent: 3,
        };
      default:
        return undefined;
    }
  }

  /**
   * Get maximum context window from available models
   *
   * @param models Array of model definitions
   * @returns Maximum context window size
   */
  getMaxContextWindow(models: ModelDefinition[]): number {
    let max = 0;

    for (const model of models) {
      if (model.contextWindow && model.contextWindow > max) {
        max = model.contextWindow;
      }
    }

    return max;
  }

  /**
   * Get maximum output tokens from available models
   *
   * @param models Array of model definitions
   * @returns Maximum output tokens
   */
  getMaxOutputTokens(models: ModelDefinition[]): number {
    let max = 0;

    for (const model of models) {
      if (model.maxOutputTokens && model.maxOutputTokens > max) {
        max = model.maxOutputTokens;
      }
    }

    return max;
  }

  /**
   * Full capability probe for a provider
   *
   * Probes all capabilities and returns a complete capability set.
   * Results are cached for the TTL duration.
   *
   * @param providerId Provider identifier
   * @param provider Provider instance
   * @returns Provider capability set
   */
  async probe(providerId: string, provider: BaseProvider): Promise<ProviderCapability> {
    // Check cache
    const cached = this.cache.get(providerId);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.cacheTTL) {
      console.log(`[CapabilityProbe] Cache hit for provider "${providerId}"`);
      return cached.capability;
    }

    console.log(`[CapabilityProbe] Probing capabilities for provider "${providerId}"`);

    const models = provider.getAvailableModels();
    const authMethods = await this.detectAuth(provider);

    // Build capability set
    const capability: ProviderCapability = {
      ...DEFAULT_CAPABILITY,
      authMethods,
      maxContextWindow: this.getMaxContextWindow(models),
      maxOutputTokens: this.getMaxOutputTokens(models),
    };

    // Test individual capabilities
    capability.supportsVision = await this.testCapability(provider, 'vision');
    capability.supportsTools = await this.testCapability(provider, 'tools');
    capability.supportsStreaming = await this.testCapability(provider, 'streaming');
    capability.supportsSystemPrompt = await this.testCapability(provider, 'system-prompt');
    capability.supportsConversationHistory = await this.testCapability(
      provider,
      'conversation-history'
    );
    capability.supportsMCP = await this.testCapability(provider, 'mcp');
    capability.supportsThinking = await this.testCapability(provider, 'thinking');

    // Check if provider supports planning (has streaming + tools)
    capability.supportsPlanning = capability.supportsStreaming && capability.supportsTools;

    // Probe rate limits
    capability.rateLimit = await this.probeLimits(provider);

    // Cache the result
    this.cache.set(providerId, {
      capability,
      timestamp: now,
    });

    return capability;
  }

  /**
   * Quick probe for a single provider with result metadata
   *
   * @param providerId Provider identifier
   * @param provider Provider instance
   * @returns Full probe result with metadata
   */
  async probeWithResult(providerId: string, provider: BaseProvider): Promise<ProbeResult> {
    const cached = this.cache.get(providerId);
    const cacheHit = !!cached && Date.now() - cached.timestamp < this.cacheTTL;

    const capability = await this.probe(providerId, provider);

    return {
      providerId,
      capability,
      limits: DEFAULT_LIMITS,
      timestamp: Date.now(),
      cacheHit,
    };
  }

  /**
   * Probe multiple providers
   *
   * @param providers Map of provider IDs to provider instances
   * @returns Map of provider IDs to probe results
   */
  async probeAll(providers: Map<string, BaseProvider>): Promise<Map<string, ProbeResult>> {
    const results = new Map<string, ProbeResult>();

    for (const [id, provider] of providers.entries()) {
      try {
        const result = await this.probeWithResult(id, provider);
        results.set(id, result);
      } catch (error) {
        console.error(`[CapabilityProbe] Failed to probe provider "${id}":`, error);
      }
    }

    return results;
  }

  /**
   * Invalidate cache for a specific provider
   *
   * @param providerId Provider identifier
   */
  invalidateCache(providerId: string): void {
    this.cache.delete(providerId);
  }

  /**
   * Invalidate all cached capabilities
   */
  invalidateAllCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   */
  getCacheStats(): { hits: number; misses: number; size: number } {
    // For simplicity, we're not tracking hits/misses in this implementation
    // A production version would add counters for better observability
    return {
      hits: 0,
      misses: 0,
      size: this.cache.size,
    };
  }

  /**
   * Clean expired cache entries
   *
   * @returns Number of entries cleaned
   */
  cleanExpiredCache(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.cacheTTL) {
        this.cache.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Global singleton instance of the capability probe
 */
export const capabilityProbe = new ProviderCapabilityProbe();
