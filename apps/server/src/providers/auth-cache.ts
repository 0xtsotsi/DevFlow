/**
 * Auth Cache - Cache authentication status with TTL
 *
 * Caches authentication status for providers to avoid repeated
 * expensive auth checks. Includes cache statistics and invalidation.
 *
 * Features:
 * - Map-based storage for O(1) lookups
 * - Configurable TTL (default 5 minutes)
 * - Cache statistics (hits, misses, size)
 * - Selective and full cache invalidation
 * - Automatic cleanup of expired entries
 */

/**
 * Cached authentication status
 */
interface CachedAuthStatus {
  /** Whether the provider is authenticated */
  authenticated: boolean;
  /** Timestamp when the entry was cached */
  timestamp: number;
  /** Optional error message if auth failed */
  error?: string;
}

/**
 * Cache statistics
 */
export interface AuthCacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current cache size */
  size: number;
  /** Hit rate (0-1) */
  hitRate: number;
}

/**
 * Default cache TTL in milliseconds (5 minutes)
 */
const DEFAULT_TTL = 5 * 60 * 1000;

/**
 * Auth Cache class
 *
 * Caches authentication status with TTL to reduce redundant
 * authentication checks against providers.
 */
export class AuthCache {
  private cache = new Map<string, CachedAuthStatus>();
  private ttl: number;
  private hits = 0;
  private misses = 0;

  constructor(ttl: number = DEFAULT_TTL) {
    this.ttl = ttl;
  }

  /**
   * Check if a provider is authenticated (cached)
   *
   * @param providerId Provider identifier
   * @returns Authentication status or undefined if not cached/expired
   */
  isAuthenticated(providerId: string): boolean | undefined {
    const entry = this.cache.get(providerId);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(providerId);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.authenticated;
  }

  /**
   * Set authentication status for a provider
   *
   * @param providerId Provider identifier
   * @param authenticated Whether the provider is authenticated
   * @param error Optional error message if auth failed
   */
  set(providerId: string, authenticated: boolean, error?: string): void {
    this.cache.set(providerId, {
      authenticated,
      timestamp: Date.now(),
      error,
    });
  }

  /**
   * Check authentication with a fallback function
   *
   * If the value is cached and valid, returns the cached value.
   * Otherwise, calls the provided function to get the status
   * and caches the result.
   *
   * @param providerId Provider identifier
   * @param fn Function to call if cache miss
   * @returns Authentication status
   */
  async getOrCompute(providerId: string, fn: () => Promise<boolean> | boolean): Promise<boolean> {
    const cached = this.isAuthenticated(providerId);

    if (cached !== undefined) {
      return cached;
    }

    // Cache miss - compute and cache
    const result = await fn();
    this.set(providerId, result);
    return result;
  }

  /**
   * Invalidate cache for a specific provider
   *
   * @param providerId Provider identifier
   * @returns Whether an entry was invalidated
   */
  invalidate(providerId: string): boolean {
    return this.cache.delete(providerId);
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired cache entries
   *
   * @returns Number of entries cleaned
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   */
  getStats(): AuthCacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate,
    };
  }

  /**
   * Reset cache statistics
   *
   * Keeps the cache entries but resets hit/miss counters.
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get all cached provider IDs
   *
   * @returns Array of provider IDs with cached auth status
   */
  getProviderIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if a provider has a cached entry (even if expired)
   *
   * @param providerId Provider identifier
   * @returns Whether the provider has a cached entry
   */
  has(providerId: string): boolean {
    return this.cache.has(providerId);
  }

  /**
   * Get the age of a cached entry in milliseconds
   *
   * @param providerId Provider identifier
   * @returns Age in milliseconds or undefined if not found
   */
  getAge(providerId: string): number | undefined {
    const entry = this.cache.get(providerId);

    if (!entry) {
      return undefined;
    }

    return Date.now() - entry.timestamp;
  }

  /**
   * Get the remaining TTL for a cached entry
   *
   * @param providerId Provider identifier
   * @returns Remaining TTL in milliseconds or undefined if not found
   */
  getRemainingTTL(providerId: string): number | undefined {
    const age = this.getAge(providerId);

    if (age === undefined) {
      return undefined;
    }

    return Math.max(0, this.ttl - age);
  }

  /**
   * Get the error message for a failed authentication
   *
   * @param providerId Provider identifier
   * @returns Error message or undefined
   */
  getError(providerId: string): string | undefined {
    const entry = this.cache.get(providerId);
    return entry?.error;
  }

  /**
   * Update the TTL for the cache
   *
   * @param ttl New TTL in milliseconds
   */
  setTTL(ttl: number): void {
    this.ttl = ttl;
  }

  /**
   * Get the current TTL
   *
   * @returns TTL in milliseconds
   */
  getTTL(): number {
    return this.ttl;
  }

  /**
   * Get the current cache size
   *
   * @returns Number of cached entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear all cache entries and reset statistics
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

/**
 * Global singleton instance of the auth cache
 */
export const authCache = new AuthCache();
