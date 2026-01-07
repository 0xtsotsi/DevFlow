/**
 * Sentry Error Domain Model
 *
 * Rich domain model following Rails-style architecture principles.
 * Encapsulates Sentry error data with behavior for severity assessment,
 * Beads issue conversion, and description formatting.
 *
 * Key Design Principles:
 * - Models do the work (behavior in model, not service)
 * - Runtime validation with Zod
 * - Branded types for type safety
 * - Single responsibility: Sentry error handling
 *
 * @see plans/update-sentry-with-mcp-integration-deepened.md
 */

import { z } from 'zod';
import type { MCPBridge } from '../lib/mcp-bridge.js';
import type { BeadsIssue, CreateBeadsIssueInput } from '@devflow/types';

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Sentry Event ID (32-character hex string)
 * Example: "c49541c747cb4d8aa3efb70ca5aba243"
 */
export type SentryEventId = string & { readonly __brand: unique symbol };

/**
 * Sentry Issue ID (e.g., "PROJECT-123")
 * Example: "CLOUDFLARE-MCP-41"
 */
export type SentryIssueId = string & { readonly __brand: unique symbol };

// ============================================================================
// Type Guards for Branded Types
// ============================================================================

/**
 * Validate and cast to SentryEventId
 */
export function toSentryEventId(id: string): SentryEventId {
  if (!/^[0-9a-fA-F]{32}$/.test(id)) {
    throw new Error(`Invalid Sentry Event ID format: ${id}`);
  }
  return id as SentryEventId;
}

/**
 * Validate and cast to SentryIssueId
 */
export function toSentryIssueId(id: string): SentryIssueId {
  if (!id || id.length === 0) {
    throw new Error('Sentry Issue ID cannot be empty');
  }
  return id as SentryIssueId;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema for Sentry issue data from MCP
 */
export const SentryIssueSchema = z.object({
  issueId: z.string(),
  title: z.string(),
  permalink: z.string().url(),
  level: z.enum(['fatal', 'error', 'warning', 'info', 'debug']),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  count: z.number().int().positive(),
});

/**
 * Zod schema for Sentry event data from MCP
 */
export const SentryEventSchema = z.object({
  eventId: z.string(),
  issueId: z.string().optional(),
  message: z.string(),
  stacktrace: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
  level: z.enum(['fatal', 'error', 'warning', 'info', 'debug']),
});

/**
 * Zod schema for Sentry error details
 */
export const SentryErrorDetailsSchema = z.object({
  issue: SentryIssueSchema.optional(),
  event: SentryEventSchema,
});

// Export inferred types
export type SentryIssue = z.infer<typeof SentryIssueSchema>;
export type SentryEvent = z.infer<typeof SentryEventSchema>;
export type SentryErrorDetails = z.infer<typeof SentryErrorDetailsSchema>;

// ============================================================================
// Severity Levels
// ============================================================================

/**
 * Severity assessment for Sentry errors
 * Based on error level and message content
 */
export type SentrySeverity = 'critical' | 'high' | 'medium' | 'low';

// ============================================================================
// Sentry Error Domain Model
// ============================================================================

/**
 * Sentry Error Domain Model
 *
 * Rich domain model that encapsulates Sentry error data with behavior.
 * Follows Rails-style "models do the work" principle.
 *
 * Key Responsibilities:
 * - Assess error severity based on level and message
 * - Convert to Beads issue with appropriate priority
 * - Extract concise title from error message
 * - Format markdown description with context
 */
export class SentryError {
  private eventId: SentryEventId;
  private issueId?: SentryIssueId;
  private error: Error;
  private context: Record<string, unknown>;
  private mcpBridge: MCPBridge;
  private details?: SentryErrorDetails;

  /**
   * Create a new SentryError instance
   *
   * @param eventId - Sentry event ID (32-char hex)
   * @param error - The error object
   * @param context - Additional context (request info, user data, etc.)
   * @param mcpBridge - MCP bridge for fetching Sentry details
   * @param issueId - Optional Sentry issue ID (e.g., "PROJECT-123")
   */
  constructor(
    eventId: string,
    error: Error,
    context: Record<string, unknown>,
    mcpBridge: MCPBridge,
    issueId?: string
  ) {
    // Validate and brand the event ID
    this.eventId = toSentryEventId(eventId);

    // Validate and brand the issue ID if provided
    if (issueId) {
      this.issueId = toSentryIssueId(issueId);
    }

    this.error = error;
    this.context = context;
    this.mcpBridge = mcpBridge;
  }

  // ==========================================================================
  // Public Methods - Domain Behavior
  // ==========================================================================

  /**
   * Assess error severity based on level and message content
   *
   * Severity Logic:
   * - Critical: Fatal errors, connection refused, database failures
   * - High: Error level with network/timeout issues
   * - Medium: Warning level, application errors
   * - Low: Info/debug level, non-critical issues
   *
   * @returns Severity assessment
   */
  assessSeverity(): SentrySeverity {
    const message = this.error.message.toLowerCase();
    const stack = this.error.stack?.toLowerCase() || '';

    // Critical: Fatal errors, connection refused, database failures
    if (
      message.includes('econnrefused') ||
      message.includes('connection refused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('connection reset') ||
      (message.includes('database') && message.includes('error')) ||
      message.includes('fatal') ||
      stack.includes('econnrefused')
    ) {
      return 'critical';
    }

    // High: Network errors, timeouts, authentication failures
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('eai_again')
    ) {
      return 'high';
    }

    // Medium: Application errors, validation failures
    if (
      message.includes('error') ||
      message.includes('invalid') ||
      message.includes('validation') ||
      message.includes('not found') ||
      message.includes('failed')
    ) {
      return 'medium';
    }

    // Low: Info/debug level, warnings
    return 'low';
  }

  /**
   * Map severity to Beads issue priority (0-4, where 0 is highest)
   *
   * Mapping:
   * - critical → 0 (P0 - highest priority)
   * - high → 1 (P1)
   * - medium → 2 (P2)
   * - low → 3 (P3)
   *
   * @returns Beads issue priority number
   */
  toBeadsPriority(): 0 | 1 | 2 | 3 {
    const severity = this.assessSeverity();

    const priorityMap: Record<SentrySeverity, 0 | 1 | 2 | 3> = {
      critical: 0, // P0
      high: 1, // P1
      medium: 2, // P2
      low: 3, // P3
    };

    return priorityMap[severity];
  }

  /**
   * Convert to Beads issue format
   *
   * Creates a Beads issue from the Sentry error with:
   * - Auto-generated title from error message
   * - Formatted markdown description with stack trace
   * - Priority based on severity assessment
   * - Labels for Sentry event/issue tracking
   * - Type: 'bug' (Sentry errors are always bugs)
   *
   * @returns Beads issue input for creation
   */
  toBeadsIssue(): CreateBeadsIssueInput {
    return {
      title: this.extractTitle(),
      description: this.formatDescription(),
      type: 'bug',
      priority: this.toBeadsPriority(),
      labels: this.generateLabels(),
      status: 'open',
    };
  }

  /**
   * Extract short title from error message
   *
   * Rules:
   * - Take first line of error message
   * - Truncate to 80 chars if too long
   * - Remove stack trace info
   * - Add "Sentry Error:" prefix
   *
   * @returns Concise error title
   */
  extractTitle(): string {
    // Get first line of error message
    const firstLine = this.error.message.split('\n')[0].trim();

    // Truncate if too long
    const truncated = firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;

    // Add prefix
    return `Sentry Error: ${truncated}`;
  }

  /**
   * Format markdown description with full error details
   *
   * Includes:
   * - Error message
   * - Stack trace (sanitized)
   * - Context (request info, user data, etc.)
   * - Sentry event/issue links
   * - Severity assessment
   *
   * @returns Formatted markdown description
   */
  formatDescription(): string {
    const severity = this.assessSeverity();
    const sentryUrl = this.getSentryUrl();

    return `
## Error Details

**Message:** ${this.error.message}

**Severity:** ${severity.toUpperCase()}

**Time:** ${new Date().toISOString()}

## Stack Trace

\`\`\`
${this.sanitizeStackTrace(this.error.stack || 'No stack trace available')}
\`\`\`

## Context

\`\`\`json
${this.formatContext()}
\`\`\`

## Sentry Links

- **Event ID:** \`${this.eventId}\`
${this.issueId ? `- **Issue ID:** \`${this.issueId}\`` : ''}
- **View in Sentry:** [Open Event](${sentryUrl})

## Next Steps

1. Review the error in Sentry for full context
2. Check logs for related events
3. Reproduce the error locally if possible
4. Create a fix and test thoroughly
5. Deploy and monitor for recurrence
    `.trim();
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Generate labels for the Beads issue
   *
   * Labels include:
   * - sentry-event:EVENT_ID
   * - sentry-issue:ISSUE_ID (if available)
   * - severity:SEVERITY
   * - auto-created
   *
   * @returns Array of label strings
   */
  private generateLabels(): string[] {
    const labels = [
      `sentry-event:${this.eventId}`,
      `severity:${this.assessSeverity()}`,
      'auto-created',
    ];

    if (this.issueId) {
      labels.push(`sentry-issue:${this.issueId}`);
    }

    return labels;
  }

  /**
   * Sanitize stack trace for display
   *
   * Removes:
   * - File paths (keep only filename and line)
   * - Absolute paths
   * - Sensitive information markers
   *
   * @param stack - Raw stack trace
   * @returns Sanitized stack trace
   */
  private sanitizeStackTrace(stack: string): string {
    return stack
      .split('\n')
      .map((line) => {
        // Remove absolute paths, keep only filename:line
        return line
          .replace(/^.*\/apps\//, 'apps/')
          .replace(/^.*\/libs\//, 'libs/')
          .replace(/^.*\/node_modules\//, 'node_modules/')
          .replace(/^.*@/, '');
      })
      .join('\n');
  }

  /**
   * Format context object as JSON
   *
   * Handles circular references and limits output size
   *
   * @returns Formatted context JSON string
   */
  private formatContext(): string {
    try {
      // Remove circular references and limit depth
      const context = this.context;

      // Check if context is empty
      if (Object.keys(context).length === 0) {
        return '{}';
      }

      // Stringify with indentation
      return JSON.stringify(context, null, 2);
    } catch (error) {
      return `Error formatting context: ${(error as Error).message}`;
    }
  }

  /**
   * Generate Sentry URL for the event
   *
   * Format: https://sentry.io/organizations/{org}/issues/?query={eventId}
   *
   * @returns Sentry dashboard URL
   */
  private getSentryUrl(): string {
    const dsn = process.env.SENTRY_DSN;

    if (!dsn) {
      return '#';
    }

    try {
      // Extract org slug and project ID from DSN
      // DSN format: https://{key}@o{org}.ingest.sentry.io/{project}
      const dsnPattern = /https:\/\/.*@o(\d+)\.ingest\.sentry\.io\/(\d+)/;
      const match = dsn.match(dsnPattern);

      if (match) {
        const [, orgId, projectId] = match;
        return `https://sentry.io/organizations/${orgId}/issues/?project=${projectId}&query=${this.eventId}`;
      }

      return '#';
    } catch (error) {
      return '#';
    }
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  /**
   * Get the Sentry event ID
   */
  getEventId(): SentryEventId {
    return this.eventId;
  }

  /**
   * Get the Sentry issue ID (if available)
   */
  getIssueId(): SentryIssueId | undefined {
    return this.issueId;
  }

  /**
   * Get the underlying error object
   */
  getError(): Error {
    return this.error;
  }

  /**
   * Get the error context
   */
  getContext(): Record<string, unknown> {
    return this.context;
  }
}

// ============================================================================
// Static Factory Methods
// ============================================================================

/**
 * Create SentryError from error string
 *
 * @param eventId - Sentry event ID
 * @param errorMessage - Error message string
 * @param context - Additional context
 * @param mcpBridge - MCP bridge instance
 * @param issueId - Optional Sentry issue ID
 * @returns SentryError instance
 */
export function createSentryError(
  eventId: string,
  errorMessage: string,
  context: Record<string, unknown>,
  mcpBridge: MCPBridge,
  issueId?: string
): SentryError {
  const error = new Error(errorMessage);
  return new SentryError(eventId, error, context, mcpBridge, issueId);
}
