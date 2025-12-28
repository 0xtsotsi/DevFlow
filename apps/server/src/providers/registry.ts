/**
 * Provider Registry - Singleton registry managing all AI engine providers
 *
 * The registry maintains a collection of available providers, handles
 * auto-discovery at module load, and provides lifecycle hooks for
 * provider initialization.
 *
 * Features:
 * - Map-based storage for O(1) provider lookup
 * - Auto-discovery via onRegister lifecycle hook
 * - Provider metadata tracking
 * - Authentication status caching
 * - Telemetry parser routing
 */

import type { BaseProvider } from './base-provider.js';
import type { ModelDefinition, InstallationStatus, ProviderConfig } from './types.js';

/**
 * Telemetry parser function type
 * Parses raw provider output into standardized telemetry
 */
export interface TelemetryParser {
  (output: string): ParsedTelemetry | null;
}

/**
 * Standardized telemetry format across all providers
 */
export interface ParsedTelemetry {
  /** Input tokens consumed */
  tokensIn: number;
  /** Output tokens generated */
  tokensOut: number;
  /** Cache read tokens (prompt caching) */
  cached: number;
  /** Estimated cost in USD */
  cost: number;
  /** Duration in milliseconds */
  duration: number;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Provider metadata stored in the registry
 */
export interface ProviderMetadata {
  /** Unique provider identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Provider instance */
  provider: BaseProvider;
  /** Installation status */
  installationStatus?: InstallationStatus;
  /** Authentication status */
  isAuthenticated: boolean;
  /** Last authentication check timestamp */
  lastAuthCheck?: number;
  /** Provider configuration */
  config: ProviderConfig;
  /** Telemetry parser for this provider */
  telemetryParser?: TelemetryParser;
  /** Available models */
  models: ModelDefinition[];
  /** Priority for fallback selection (higher = preferred) */
  priority: number;
  /** Whether this provider is currently active */
  active: boolean;
}

/**
 * Callback type for provider registration events
 */
export type RegisterCallback = (metadata: ProviderMetadata) => void | Promise<void>;

/**
 * Provider Registry singleton class
 *
 * Manages all registered AI engine providers with auto-discovery,
 * lifecycle hooks, and runtime capability detection.
 */
export class EngineRegistry {
  private providers = new Map<string, ProviderMetadata>();
  private registerCallbacks: RegisterCallback[] = [];

  /**
   * Register a provider with the registry
   *
   * @param id Unique provider identifier
   * @param provider Provider instance
   * @param config Optional provider configuration
   * @returns The registered provider metadata
   */
  register(id: string, provider: BaseProvider, config: ProviderConfig = {}): ProviderMetadata {
    // Check if already registered
    if (this.providers.has(id)) {
      console.warn(`[EngineRegistry] Provider "${id}" is already registered, skipping`);
      return this.providers.get(id)!;
    }

    const metadata: ProviderMetadata = {
      id,
      name: provider.getName(),
      provider,
      isAuthenticated: false,
      config,
      models: provider.getAvailableModels(),
      priority: 0,
      active: true,
    };

    // Store in registry
    this.providers.set(id, metadata);

    console.log(`[EngineRegistry] Registered provider "${id}" (${metadata.name})`);

    // Trigger registration hook
    this.onRegister(metadata);

    return metadata;
  }

  /**
   * Get a provider by ID
   *
   * @param id Provider identifier
   * @returns Provider metadata or undefined if not found
   */
  get(id: string): ProviderMetadata | undefined {
    return this.providers.get(id);
  }

  /**
   * Get the provider instance for a given model
   *
   * @param modelId Model identifier
   * @returns Provider instance or null if not found
   */
  getProviderForModel(modelId: string): BaseProvider | null {
    const lowerModel = modelId.toLowerCase();

    // Find provider that has this model
    for (const metadata of this.providers.values()) {
      for (const model of metadata.models) {
        if (model.modelString.toLowerCase() === lowerModel) {
          return metadata.provider;
        }
      }
    }

    return null;
  }

  /**
   * Get provider metadata by model ID
   *
   * @param modelId Model identifier
   * @returns Provider metadata or undefined if not found
   */
  getMetadataForModel(modelId: string): ProviderMetadata | undefined {
    const lowerModel = modelId.toLowerCase();

    for (const metadata of this.providers.values()) {
      for (const model of metadata.models) {
        if (model.modelString.toLowerCase() === lowerModel) {
          return metadata;
        }
      }
    }

    return undefined;
  }

  /**
   * Get all registered providers
   *
   * @param includeInactive Whether to include inactive providers
   * @returns Array of provider metadata
   */
  getAll(includeInactive = false): ProviderMetadata[] {
    const all = Array.from(this.providers.values());

    if (!includeInactive) {
      return all.filter((p) => p.active);
    }

    return all;
  }

  /**
   * Get all available models from all providers
   *
   * @returns Array of model definitions
   */
  getAllModels(): ModelDefinition[] {
    const models: ModelDefinition[] = [];

    for (const metadata of this.providers.values()) {
      if (metadata.active) {
        models.push(...metadata.models);
      }
    }

    return models;
  }

  /**
   * Get providers by authentication status
   *
   * @param authenticated Whether to get authenticated or unauthenticated providers
   * @returns Array of provider metadata
   */
  getByAuthStatus(authenticated = true): ProviderMetadata[] {
    return this.getAll().filter((p) => p.isAuthenticated === authenticated);
  }

  /**
   * Get the primary provider (highest priority authenticated provider)
   *
   * @returns Primary provider metadata or undefined
   */
  getPrimary(): ProviderMetadata | undefined {
    const authenticated = this.getByAuthStatus(true);

    if (authenticated.length === 0) {
      return undefined;
    }

    // Sort by priority (descending) and return the highest
    return authenticated.sort((a, b) => b.priority - a.priority)[0];
  }

  /**
   * Get fallback chain for a provider
   *
   * Returns ordered list of alternative providers based on priority
   *
   * @param excludeProviderId Provider ID to exclude from fallbacks
   * @returns Array of provider metadata ordered by priority
   */
  getFallbackChain(excludeProviderId?: string): ProviderMetadata[] {
    const candidates = this.getAll().filter((p) => p.isAuthenticated && p.id !== excludeProviderId);

    return candidates.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Update provider metadata
   *
   * @param id Provider identifier
   * @param updates Metadata fields to update
   * @returns Updated metadata or undefined if not found
   */
  update(id: string, updates: Partial<ProviderMetadata>): ProviderMetadata | undefined {
    const metadata = this.providers.get(id);

    if (!metadata) {
      return undefined;
    }

    Object.assign(metadata, updates);
    return metadata;
  }

  /**
   * Set a provider as active or inactive
   *
   * @param id Provider identifier
   * @param active Whether the provider should be active
   * @returns Success status
   */
  setActive(id: string, active: boolean): boolean {
    const metadata = this.providers.get(id);

    if (!metadata) {
      return false;
    }

    metadata.active = active;
    return true;
  }

  /**
   * Unregister a provider
   *
   * @param id Provider identifier
   * @returns Success status
   */
  unregister(id: string): boolean {
    const result = this.providers.delete(id);

    if (result) {
      console.log(`[EngineRegistry] Unregistered provider "${id}"`);
    }

    return result;
  }

  /**
   * Check if a provider is registered
   *
   * @param id Provider identifier
   * @returns Whether the provider is registered
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Get the count of registered providers
   *
   * @param includeInactive Whether to include inactive providers
   * @returns Provider count
   */
  count(includeInactive = false): number {
    return this.getAll(includeInactive).length;
  }

  /**
   * Clear all registered providers
   *
   * Primarily used for testing
   */
  clear(): void {
    this.providers.clear();
    this.registerCallbacks = [];
  }

  /**
   * Add a callback for provider registration events
   *
   * @param callback Function to call when a provider is registered
   */
  onRegisterHook(callback: RegisterCallback): void {
    this.registerCallbacks.push(callback);
  }

  /**
   * Trigger registration callbacks for a provider
   *
   * @param metadata Provider metadata
   */
  private async onRegister(metadata: ProviderMetadata): Promise<void> {
    for (const callback of this.registerCallbacks) {
      try {
        await callback(metadata);
      } catch (error) {
        console.error(
          `[EngineRegistry] Registration callback error for provider "${metadata.id}":`,
          error
        );
      }
    }
  }
}

/**
 * Singleton instance of the provider registry
 */
export const providerRegistry = new EngineRegistry();

/**
 * Convenience function to get a provider by ID
 *
 * @param id Provider identifier
 * @returns Provider metadata or undefined
 */
export function getProvider(id: string): ProviderMetadata | undefined {
  return providerRegistry.get(id);
}

/**
 * Convenience function to get all providers
 *
 * @returns Array of provider metadata
 */
export function getAllProviders(): ProviderMetadata[] {
  return providerRegistry.getAll();
}

/**
 * Convenience function to get the primary provider
 *
 * @returns Primary provider metadata or undefined
 */
export function getPrimaryProvider(): ProviderMetadata | undefined {
  return providerRegistry.getPrimary();
}
