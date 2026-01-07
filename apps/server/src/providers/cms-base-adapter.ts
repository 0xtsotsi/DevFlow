/**
 * Abstract base class for CMS (Content Management System) adapters
 *
 * This class defines the contract that all CMS adapters must implement
 * for Rank.brnd's article publishing functionality.
 */

/// <reference lib="dom" />

import type {
  CMSConfig,
  CMSContent,
  CMSPublishResult,
  CMSConnectionResult,
  CMSValidationResult,
  CMSCapabilities,
  CMSPlatform,
  CMSConnectionStatus,
  CMSEvent,
  CMSEventType,
  CMSListOptions,
  CMSListResult,
  CMSContentSummary,
  CMSMediaUploadOptions,
  CMSMediaUploadResult,
} from '@devflow/types';

/**
 * Fetch request options interface (compatible with both Node.js and browser)
 */
interface FetchRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormData | null;
  cache?: string;
  credentials?: string;
  redirect?: string;
  referrer?: string;
  referrerPolicy?: string;
  signal?: AbortSignal | null;
  keepalive?: boolean;
  mode?: string;
}

/**
 * Event listener type for CMS events
 */
export type CMSEventListener = (event: CMSEvent) => void;

/**
 * Abstract base class for CMS adapters
 *
 * All CMS adapters (WordPress, Ghost, Webflow, etc.) must extend this class
 * and implement the abstract methods to provide platform-specific functionality.
 *
 * @example
 * ```typescript
 * class GhostAdapter extends BaseCMSAdapter {
 *   getPlatform(): CMSPlatform { return 'ghost'; }
 *
 *   async connect(): Promise<CMSConnectionResult> {
 *     // Ghost-specific connection logic
 *   }
 *
 *   async publish(content: CMSContent): Promise<CMSPublishResult> {
 *     // Ghost-specific publishing logic
 *   }
 *
 *   // ... other implementations
 * }
 * ```
 */
export abstract class BaseCMSAdapter {
  protected config: CMSConfig;
  protected connectionStatus: CMSConnectionStatus = 'disconnected';
  private eventListeners: Map<CMSEventType, Set<CMSEventListener>> = new Map();

  constructor(config: CMSConfig) {
    this.config = config;
  }

  // ============================================================================
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ============================================================================

  /**
   * Get the CMS platform identifier
   * @returns The platform type (e.g., 'wordpress', 'ghost', 'webflow')
   */
  abstract getPlatform(): CMSPlatform;

  /**
   * Establish a connection to the CMS
   *
   * This method should:
   * - Validate credentials/API keys
   * - Test the connection to the CMS API
   * - Fetch basic site information
   * - Update connection status
   *
   * @returns Connection result with site info and available resources
   * @throws Should not throw - return error in result instead
   *
   * @example
   * ```typescript
   * const result = await adapter.connect();
   * if (result.success) {
   *   console.log(`Connected to ${result.siteInfo?.name}`);
   * } else {
   *   console.error(`Failed: ${result.error?.message}`);
   * }
   * ```
   */
  abstract connect(): Promise<CMSConnectionResult>;

  /**
   * Publish content to the CMS
   *
   * This method should:
   * - Transform content to the CMS's expected format
   * - Handle image uploads if needed
   * - Create or update the post/article
   * - Return the published URL and content ID
   *
   * @param content The content to publish
   * @returns Publish result with URL and content ID
   * @throws Should not throw - return error in result instead
   *
   * @example
   * ```typescript
   * const result = await adapter.publish({
   *   title: 'My Article',
   *   body: '<p>Content here...</p>',
   *   format: 'html',
   *   status: 'published'
   * });
   * ```
   */
  abstract publish(content: CMSContent): Promise<CMSPublishResult>;

  /**
   * Validate the CMS configuration
   *
   * This method should:
   * - Check required fields are present
   * - Validate URL format
   * - Verify API key/credential format (not validity)
   * - Return any warnings about optional missing fields
   *
   * @returns Validation result with errors and warnings
   *
   * @example
   * ```typescript
   * const validation = adapter.validate();
   * if (!validation.valid) {
   *   validation.errors.forEach(e => console.error(e.message));
   * }
   * ```
   */
  abstract validate(): CMSValidationResult;

  /**
   * Disconnect from the CMS
   *
   * This method should:
   * - Clean up any active connections
   * - Revoke tokens if applicable
   * - Update connection status
   *
   * @returns Promise that resolves when disconnection is complete
   *
   * @example
   * ```typescript
   * await adapter.disconnect();
   * console.log('Disconnected from CMS');
   * ```
   */
  abstract disconnect(): Promise<void>;

  /**
   * Get the capabilities of this CMS adapter
   *
   * @returns Object describing what features this CMS supports
   *
   * @example
   * ```typescript
   * const caps = adapter.getCapabilities();
   * if (caps.supportsScheduling) {
   *   // Enable scheduling UI
   * }
   * ```
   */
  abstract getCapabilities(): CMSCapabilities;

  // ============================================================================
  // OPTIONAL ABSTRACT METHODS - Override in subclasses if supported
  // ============================================================================

  /**
   * Update existing content on the CMS
   *
   * @param _contentId The ID of the content to update
   * @param _content The updated content
   * @returns Publish result with updated info
   */
  async update(_contentId: string, _content: Partial<CMSContent>): Promise<CMSPublishResult> {
    return {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: `Update is not implemented for ${this.getPlatform()}`,
      },
    };
  }

  /**
   * Delete content from the CMS
   *
   * @param _contentId The ID of the content to delete
   * @returns Whether deletion was successful
   */
  async delete(
    _contentId: string
  ): Promise<{ success: boolean; error?: { code: string; message: string } }> {
    return {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: `Delete is not implemented for ${this.getPlatform()}`,
      },
    };
  }

  /**
   * Get content by ID from the CMS
   *
   * @param _contentId The ID of the content to fetch
   * @returns The content summary or null if not found
   */
  async getContent(_contentId: string): Promise<CMSContentSummary | null> {
    return null;
  }

  /**
   * List content from the CMS
   *
   * @param options Filtering and pagination options
   * @returns Paginated list of content summaries
   */
  async listContent(options?: CMSListOptions): Promise<CMSListResult> {
    return {
      items: [],
      pagination: {
        total: 0,
        page: 1,
        limit: options?.limit || 10,
        hasMore: false,
      },
    };
  }

  /**
   * Upload media to the CMS
   *
   * @param _options Media upload options including file data
   * @returns Upload result with media URL
   */
  async uploadMedia(_options: CMSMediaUploadOptions): Promise<CMSMediaUploadResult> {
    return {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: `Media upload is not implemented for ${this.getPlatform()}`,
      },
    };
  }

  /**
   * Refresh OAuth tokens if applicable
   *
   * @returns Whether refresh was successful
   */
  async refreshTokens(): Promise<boolean> {
    return false;
  }

  // ============================================================================
  // CONCRETE METHODS - Shared functionality across all adapters
  // ============================================================================

  /**
   * Get the current configuration
   * @returns The CMS configuration
   */
  getConfig(): CMSConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   * @param config Partial configuration to merge
   */
  setConfig(config: Partial<CMSConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get the current connection status
   * @returns The connection status
   */
  getConnectionStatus(): CMSConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Check if currently connected
   * @returns Whether the adapter is connected
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  /**
   * Get the connection ID (from config)
   * @returns The connection ID
   */
  getConnectionId(): string {
    return this.config.id;
  }

  /**
   * Get the display name for this connection
   * @returns The display name
   */
  getDisplayName(): string {
    return this.config.name;
  }

  /**
   * Subscribe to CMS events
   *
   * @param eventType The event type to listen for
   * @param listener The callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = adapter.on('published', (event) => {
   *   console.log('Content published:', event.data);
   * });
   *
   * // Later: unsubscribe();
   * ```
   */
  on(eventType: CMSEventType, listener: CMSEventListener): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Remove an event listener
   *
   * @param eventType The event type
   * @param listener The callback to remove
   */
  off(eventType: CMSEventType, listener: CMSEventListener): void {
    this.eventListeners.get(eventType)?.delete(listener);
  }

  /**
   * Emit an event to all listeners
   *
   * @param eventType The event type to emit
   * @param data Optional data to include
   * @param error Optional error information
   */
  protected emit(
    eventType: CMSEventType,
    data?: unknown,
    error?: { code: string; message: string }
  ): void {
    const event: CMSEvent = {
      type: eventType,
      timestamp: new Date().toISOString(),
      platform: this.getPlatform(),
      connectionId: this.config.id,
      data,
      error,
    };

    this.eventListeners.get(eventType)?.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        console.error(`Error in CMS event listener for ${eventType}:`, e);
      }
    });
  }

  /**
   * Update connection status and emit event
   *
   * @param status The new connection status
   * @param error Optional error information
   */
  protected setConnectionStatus(
    status: CMSConnectionStatus,
    error?: { code: string; message: string }
  ): void {
    const previousStatus = this.connectionStatus;
    this.connectionStatus = status;

    if (status === 'connected' && previousStatus !== 'connected') {
      this.emit('connected');
    } else if (status === 'disconnected' && previousStatus === 'connected') {
      this.emit('disconnected');
    } else if (status === 'error') {
      this.emit('error', undefined, error);
    }
  }

  /**
   * Generate a slug from a title
   *
   * @param title The title to convert
   * @returns URL-safe slug
   */
  protected generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .substring(0, 100); // Limit length
  }

  /**
   * Validate URL format
   *
   * @param url URL to validate
   * @returns Whether the URL is valid
   */
  protected isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure URL has protocol
   *
   * @param url URL to normalize
   * @returns URL with https:// prefix if missing
   */
  protected normalizeUrl(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }

  /**
   * Create base validation result checking common fields
   *
   * @returns Validation result with common checks
   */
  protected validateBaseConfig(): CMSValidationResult {
    const errors: CMSValidationResult['errors'] = [];
    const warnings: CMSValidationResult['warnings'] = [];

    // Check required fields
    if (!this.config.id) {
      errors.push({ field: 'id', code: 'REQUIRED', message: 'Connection ID is required' });
    }

    if (!this.config.name) {
      errors.push({ field: 'name', code: 'REQUIRED', message: 'Connection name is required' });
    }

    if (!this.config.baseUrl) {
      errors.push({ field: 'baseUrl', code: 'REQUIRED', message: 'Base URL is required' });
    } else if (!this.isValidUrl(this.normalizeUrl(this.config.baseUrl))) {
      errors.push({
        field: 'baseUrl',
        code: 'INVALID_FORMAT',
        message: 'Base URL is not a valid URL',
      });
    }

    // Check authentication
    const hasAuth =
      this.config.apiKey ||
      this.config.adminApiKey ||
      this.config.contentApiKey ||
      this.config.oauth?.accessToken;

    if (!hasAuth) {
      warnings?.push({
        field: 'authentication',
        code: 'MISSING_AUTH',
        message: 'No authentication credentials provided',
      });
    }

    // Check timeout
    if (this.config.timeout && this.config.timeout < 1000) {
      warnings?.push({
        field: 'timeout',
        code: 'LOW_TIMEOUT',
        message: 'Timeout is very low (less than 1 second)',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Make an HTTP request with common error handling
   *
   * @param url Request URL
   * @param options Fetch options
   * @returns Response data or error
   */
  protected async makeRequest<T>(
    url: string,
    options: Partial<FetchRequestOptions> = {}
  ): Promise<{ data?: T; error?: { code: string; message: string; status?: number } }> {
    try {
      const controller = new AbortController();
      const timeout = this.config.timeout || 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.config.headers,
        ...(options.headers as Record<string, string>),
      };

      // Add API key if present
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      } as RequestInit); // eslint-disable-line no-undef

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage: string;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || errorText;
        } catch {
          errorMessage = errorText || response.statusText;
        }

        // Check for rate limiting
        if (response.status === 429) {
          this.emit('rate-limited');
        }

        return {
          error: {
            code: `HTTP_${response.status}`,
            message: errorMessage,
            status: response.status,
          },
        };
      }

      const data = await response.json();
      return { data };
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          return {
            error: {
              code: 'TIMEOUT',
              message: `Request timed out after ${this.config.timeout || 30000}ms`,
            },
          };
        }
        return {
          error: {
            code: 'NETWORK_ERROR',
            message: err.message,
          },
        };
      }
      return {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unknown error occurred',
        },
      };
    }
  }
}

/**
 * Type guard to check if an object is a BaseCMSAdapter
 */
export function isCMSAdapter(obj: unknown): obj is BaseCMSAdapter {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'connect' in obj &&
    'publish' in obj &&
    'validate' in obj &&
    'disconnect' in obj &&
    typeof (obj as BaseCMSAdapter).connect === 'function' &&
    typeof (obj as BaseCMSAdapter).publish === 'function' &&
    typeof (obj as BaseCMSAdapter).validate === 'function' &&
    typeof (obj as BaseCMSAdapter).disconnect === 'function'
  );
}
