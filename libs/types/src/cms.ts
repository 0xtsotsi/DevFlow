/**
 * CMS (Content Management System) Integration Types
 *
 * Type definitions for CMS adapters used in Rank.brnd for publishing
 * articles across multiple platforms (WordPress, Ghost, Webflow, etc.)
 */

/**
 * Supported CMS platforms
 */
export type CMSPlatform =
  | 'wordpress'
  | 'ghost'
  | 'webflow'
  | 'shopify'
  | 'notion'
  | 'medium'
  | 'contentful'
  | 'strapi'
  | 'sanity'
  | 'hubspot'
  | 'squarespace'
  | 'wix'
  | 'drupal'
  | 'custom';

/**
 * Authentication methods supported by CMS platforms
 */
export type CMSAuthMethod =
  | 'api-key'
  | 'oauth2'
  | 'jwt'
  | 'basic-auth'
  | 'admin-api'
  | 'content-api';

/**
 * Connection status for CMS integrations
 */
export type CMSConnectionStatus = 'connected' | 'disconnected' | 'error' | 'pending' | 'expired';

/**
 * Content status for published articles
 */
export type CMSContentStatus = 'draft' | 'published' | 'scheduled' | 'pending_review' | 'archived';

/**
 * Configuration for connecting to a CMS
 */
export interface CMSConfig {
  /** Unique identifier for this CMS connection */
  id: string;

  /** The CMS platform type */
  platform: CMSPlatform;

  /** Display name for this connection */
  name: string;

  /** Base URL of the CMS instance */
  baseUrl: string;

  /** Authentication method used */
  authMethod: CMSAuthMethod;

  /** API key or access token */
  apiKey?: string;

  /** OAuth2 client credentials */
  oauth?: {
    clientId: string;
    clientSecret: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };

  /** Admin API key (for platforms like Ghost) */
  adminApiKey?: string;

  /** Content API key (for read-only access) */
  contentApiKey?: string;

  /** Custom headers to include with requests */
  headers?: Record<string, string>;

  /** API version (if applicable) */
  apiVersion?: string;

  /** Webhook secret for incoming webhooks */
  webhookSecret?: string;

  /** Whether SSL verification is enabled */
  sslVerify?: boolean;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Additional platform-specific options */
  options?: Record<string, unknown>;
}

/**
 * Content to be published to a CMS
 */
export interface CMSContent {
  /** Title of the content */
  title: string;

  /** Main content body (HTML or Markdown based on platform) */
  body: string;

  /** Content format */
  format: 'html' | 'markdown' | 'json' | 'blocks';

  /** URL slug for the content */
  slug?: string;

  /** Excerpt or summary */
  excerpt?: string;

  /** Featured image URL */
  featuredImage?: string;

  /** Author information */
  author?: {
    id?: string;
    name?: string;
    email?: string;
  };

  /** Categories or collections */
  categories?: string[];

  /** Tags */
  tags?: string[];

  /** SEO metadata */
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    canonicalUrl?: string;
    ogImage?: string;
    keywords?: string[];
    noIndex?: boolean;
    noFollow?: boolean;
  };

  /** Custom fields for the platform */
  customFields?: Record<string, unknown>;

  /** Publication status */
  status?: CMSContentStatus;

  /** Scheduled publish date (ISO 8601 format) */
  scheduledAt?: string;

  /** Template or layout to use */
  template?: string;

  /** Visibility settings */
  visibility?: 'public' | 'private' | 'password-protected' | 'members-only';

  /** Password for protected content */
  password?: string;
}

/**
 * Result from a CMS publish operation
 */
export interface CMSPublishResult {
  /** Whether the operation was successful */
  success: boolean;

  /** ID of the published content on the CMS */
  contentId?: string;

  /** URL where the content is published */
  url?: string;

  /** Current status of the content */
  status?: CMSContentStatus;

  /** Revision or version number */
  revision?: number;

  /** Timestamp when published */
  publishedAt?: string;

  /** Error information if failed */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  /** Warnings that occurred during publishing */
  warnings?: string[];

  /** Raw response from the CMS API */
  rawResponse?: unknown;
}

/**
 * Result from a CMS connection attempt
 */
export interface CMSConnectionResult {
  /** Whether the connection was successful */
  success: boolean;

  /** Current connection status */
  status: CMSConnectionStatus;

  /** Information about the CMS instance */
  siteInfo?: {
    name: string;
    url: string;
    version?: string;
    timezone?: string;
    language?: string;
  };

  /** Available content types/post types */
  contentTypes?: string[];

  /** Available categories */
  categories?: Array<{ id: string; name: string; slug: string }>;

  /** Available tags */
  tags?: Array<{ id: string; name: string; slug: string }>;

  /** Available authors */
  authors?: Array<{ id: string; name: string; email?: string }>;

  /** Error information if failed */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  /** Timestamp of the connection attempt */
  connectedAt?: string;

  /** Token expiration if applicable */
  expiresAt?: string;
}

/**
 * Validation result for CMS configuration or content
 */
export interface CMSValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors */
  errors: Array<{
    field: string;
    code: string;
    message: string;
  }>;

  /** Validation warnings */
  warnings?: Array<{
    field: string;
    code: string;
    message: string;
  }>;

  /** Suggested fixes */
  suggestions?: string[];
}

/**
 * CMS adapter capabilities
 */
export interface CMSCapabilities {
  /** Supports draft content */
  supportsDrafts: boolean;

  /** Supports scheduled publishing */
  supportsScheduling: boolean;

  /** Supports content revisions */
  supportsRevisions: boolean;

  /** Supports custom fields */
  supportsCustomFields: boolean;

  /** Supports media uploads */
  supportsMediaUpload: boolean;

  /** Supports categories/taxonomies */
  supportsCategories: boolean;

  /** Supports tags */
  supportsTags: boolean;

  /** Supports SEO metadata */
  supportsSEO: boolean;

  /** Supports multiple authors */
  supportsMultipleAuthors: boolean;

  /** Supports content templates */
  supportsTemplates: boolean;

  /** Supports webhooks */
  supportsWebhooks: boolean;

  /** Supports bulk operations */
  supportsBulkOperations: boolean;

  /** Supported content formats */
  supportedFormats: Array<'html' | 'markdown' | 'json' | 'blocks'>;

  /** Maximum content size in bytes */
  maxContentSize?: number;

  /** Rate limit (requests per minute) */
  rateLimit?: number;
}

/**
 * Event types emitted by CMS adapters
 */
export type CMSEventType =
  | 'connected'
  | 'disconnected'
  | 'published'
  | 'updated'
  | 'deleted'
  | 'error'
  | 'rate-limited'
  | 'token-refreshed';

/**
 * Event payload for CMS adapter events
 */
export interface CMSEvent {
  type: CMSEventType;
  timestamp: string;
  platform: CMSPlatform;
  connectionId: string;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Options for listing content from a CMS
 */
export interface CMSListOptions {
  /** Filter by status */
  status?: CMSContentStatus | CMSContentStatus[];

  /** Filter by author */
  author?: string;

  /** Filter by category */
  category?: string;

  /** Filter by tag */
  tag?: string;

  /** Search query */
  search?: string;

  /** Number of items per page */
  limit?: number;

  /** Page number or cursor */
  page?: number | string;

  /** Sort field */
  sortBy?: 'created' | 'updated' | 'published' | 'title';

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';

  /** Include only specific fields */
  fields?: string[];

  /** Date range filter */
  dateRange?: {
    from?: string;
    to?: string;
  };
}

/**
 * Paginated list result from a CMS
 */
export interface CMSListResult<T = CMSContentSummary> {
  /** List of items */
  items: T[];

  /** Pagination metadata */
  pagination: {
    total: number;
    page: number | string;
    limit: number;
    hasMore: boolean;
    nextPage?: number | string;
    prevPage?: number | string;
  };
}

/**
 * Summary of content from a CMS (for listing)
 */
export interface CMSContentSummary {
  /** Content ID on the CMS */
  id: string;

  /** Content title */
  title: string;

  /** URL slug */
  slug: string;

  /** Current status */
  status: CMSContentStatus;

  /** Public URL */
  url?: string;

  /** Author name */
  author?: string;

  /** Creation date */
  createdAt: string;

  /** Last update date */
  updatedAt: string;

  /** Publication date */
  publishedAt?: string;

  /** Featured image thumbnail */
  thumbnail?: string;

  /** Excerpt */
  excerpt?: string;
}

/**
 * Media upload options
 */
export interface CMSMediaUploadOptions {
  /** File data (Buffer or base64 string) */
  file: Buffer | string;

  /** File name */
  filename: string;

  /** MIME type */
  mimeType: string;

  /** Alt text for accessibility */
  altText?: string;

  /** Caption */
  caption?: string;

  /** Target folder/directory */
  folder?: string;
}

/**
 * Result from media upload
 */
export interface CMSMediaUploadResult {
  /** Whether upload was successful */
  success: boolean;

  /** Media ID on the CMS */
  mediaId?: string;

  /** Public URL of the uploaded media */
  url?: string;

  /** Thumbnail URL */
  thumbnailUrl?: string;

  /** Width in pixels (for images) */
  width?: number;

  /** Height in pixels (for images) */
  height?: number;

  /** File size in bytes */
  size?: number;

  /** Error information if failed */
  error?: {
    code: string;
    message: string;
  };
}
