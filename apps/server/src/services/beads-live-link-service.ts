/**
 * Beads Live Link Service
 *
 * Subscribes to agent events and automatically creates Beads issues for errors and requests.
 * Provides autonomous agent memory by tracking problems and tasks in the dependency-aware issue tracker.
 *
 * Features:
 * - Auto-create issues on agent errors (with severity assessment)
 * - Auto-create issues on agent requests
 * - Rate limiting (max 20 issues/hour)
 * - Deduplication (24-hour cache)
 * - Smart priority assignment based on severity
 */

import * as crypto from 'crypto';
import type { EventEmitter } from '../lib/events.js';
import { BeadsService } from './beads-service.js';
import type { BeadsIssue, CreateBeadsIssueInput } from '@automaker/types';

interface Message {
  id: string;
  content: string;
  timestamp: string;
}

interface AgentErrorData {
  sessionId: string;
  type: 'error';
  error: string;
  message: Message;
}

interface AgentRequestData {
  sessionId: string;
  type: 'request';
  request: 'create-issue';
  title: string;
  description?: string;
  issueType?: 'bug' | 'feature' | 'task';
  priority?: number;
}

export interface BeadsLiveLinkConfig {
  autoCreateOnErrors: boolean;
  autoCreateOnRequests: boolean;
  maxAutoIssuesPerHour: number;
  enableDeduplication: boolean;
}

export class BeadsLiveLinkService {
  private beadsService: BeadsService;
  private events: EventEmitter;
  private config: BeadsLiveLinkConfig;
  private projectPath?: string;
  private unsubscribe?: () => void;
  private autoIssueCount: number = 0;
  private autoIssueResetTime: number;
  private errorCache: Map<string, { issueId: string; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    beadsService: BeadsService,
    events: EventEmitter,
    config: Partial<BeadsLiveLinkConfig> = {}
  ) {
    this.beadsService = beadsService;
    this.events = events;
    this.config = {
      autoCreateOnErrors: config.autoCreateOnErrors ?? true,
      autoCreateOnRequests: config.autoCreateOnRequests ?? true,
      maxAutoIssuesPerHour: config.maxAutoIssuesPerHour ?? 20,
      enableDeduplication: config.enableDeduplication ?? true,
    };
    this.autoIssueResetTime = Date.now() + 60 * 60 * 1000; // 1 hour from now
  }

  /**
   * Initialize the live link service for a project
   * Subscribes to agent events and validates Beads installation
   */
  async initialize(projectPath: string): Promise<void> {
    this.projectPath = projectPath;

    // Validate Beads is installed
    const validation = await this.beadsService.validateBeadsInProject(projectPath);

    if (!validation.installed) {
      console.warn('[BeadsLiveLink] Beads CLI not installed, auto-issue creation disabled');
      return;
    }

    // Auto-initialize Beads if needed
    if (!validation.initialized && validation.canInitialize) {
      console.log('[BeadsLiveLink] Initializing Beads in project');
      await this.beadsService.initializeBeads(projectPath);
    }

    // Subscribe to agent events
    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'agent:stream') {
        this.handleAgentStream(payload as AgentErrorData | AgentRequestData).catch((error) => {
          console.error('[BeadsLiveLink] Error handling agent stream:', error);
        });
      }
    });

    console.log('[BeadsLiveLink] Service initialized for project:', projectPath);
  }

  /**
   * Shutdown the live link service
   */
  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.errorCache.clear();
    console.log('[BeadsLiveLink] Service shut down');
  }

  /**
   * Handle incoming agent stream events
   * Routes to appropriate handler based on event type
   */
  private async handleAgentStream(data: AgentErrorData | AgentRequestData): Promise<void> {
    if (!this.projectPath) {
      return;
    }

    try {
      if (data.type === 'error' && this.config.autoCreateOnErrors) {
        await this.handleAgentError(data);
      } else if (data.type === 'request' && this.config.autoCreateOnRequests) {
        await this.handleAgentRequest(data);
      }
    } catch (error) {
      // Don't throw - log and continue to avoid disrupting agent streams
      console.error('[BeadsLiveLink] Error in handleAgentStream:', error);
    }
  }

  /**
   * Handle agent error events
   * Creates Beads issues for errors with appropriate priority
   */
  private async handleAgentError(data: AgentErrorData): Promise<BeadsIssue | null> {
    if (!this.projectPath) {
      return null;
    }

    try {
      // Check rate limiting
      if (!this.canCreateAutoIssue()) {
        console.log('[BeadsLiveLink] Rate limit reached, skipping error issue creation');
        return null;
      }

      // Check for duplicates if enabled
      if (this.config.enableDeduplication) {
        const existingIssue = await this.findExistingIssue(data.error);
        if (existingIssue) {
          console.log('[BeadsLiveLink] Duplicate error detected, skipping issue creation');
          return existingIssue;
        }
      }

      // Assess error severity
      const severity = this.assessErrorSeverity(data.error);

      // Map severity to priority (critical->P0, high->P1, medium->P2, low->P3)
      const priorityMap: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      const priority = priorityMap[severity] ?? 2;

      // Create issue
      const issueInput: CreateBeadsIssueInput = {
        title: this.extractErrorTitle(data.error),
        description: this.formatErrorDescription(data),
        type: 'bug',
        priority,
        labels: ['auto-created', 'agent-error', severity],
      };

      const issue = await this.beadsService.createIssue(this.projectPath, issueInput);

      // Cache for deduplication
      const errorHash = this.hashError(data.error);
      this.errorCache.set(errorHash, {
        issueId: issue.id,
        timestamp: Date.now(),
      });

      this.autoIssueCount++;
      console.log(
        `[BeadsLiveLink] Created issue ${issue.id} for ${severity} severity error (priority ${priority})`
      );

      return issue;
    } catch (error) {
      console.error('[BeadsLiveLink] Error handling agent error:', error);
      return null;
    }
  }

  /**
   * Handle agent request events
   * Creates Beads issues when agents explicitly request them
   */
  private async handleAgentRequest(data: AgentRequestData): Promise<BeadsIssue | null> {
    if (!this.projectPath) {
      return null;
    }

    try {
      // Check rate limiting
      if (!this.canCreateAutoIssue()) {
        console.log('[BeadsLiveLink] Rate limit reached, skipping request issue creation');
        return null;
      }

      // Create issue with agent-provided details
      const issueInput: CreateBeadsIssueInput = {
        title: data.title,
        description: data.description ?? `Requested by agent in session ${data.sessionId}`,
        type: data.issueType ?? 'task',
        priority: data.priority ?? 2,
        labels: ['agent-requested', `session:${data.sessionId}`],
      };

      const issue = await this.beadsService.createIssue(this.projectPath, issueInput);

      this.autoIssueCount++;
      console.log(`[BeadsLiveLink] Created issue ${issue.id} for agent request`);

      return issue;
    } catch (error) {
      console.error('[BeadsLiveLink] Error handling agent request:', error);
      return null;
    }
  }

  /**
   * Assess error severity based on error message content
   * Returns: 'low' | 'medium' | 'high' | 'critical'
   */
  private assessErrorSeverity(error: string): 'low' | 'medium' | 'high' | 'critical' {
    const normalizedError = error.toLowerCase();

    // Critical: System failures
    const criticalPatterns = [
      'segmentation fault',
      'segfault',
      'database corrupted',
      'out of memory',
      'fatal error',
      'system cannot find',
      'heap corruption',
      'stack overflow',
    ];

    // High: Major failures
    const highPatterns = [
      'authentication failed',
      'auth failed',
      'econnrefused',
      'connection refused',
      'cannot find module',
      'permission denied',
      'eacces',
      'enotfound',
      'etimedout',
      'unhandled exception',
      'unhandled rejection',
    ];

    // Medium: Runtime errors
    const mediumPatterns = [
      'typeerror',
      'referenceerror',
      'syntaxerror',
      'validation',
      'parse error',
      'invalid input',
      'argument',
      'undefined is not',
      'cannot read',
      'cannot set',
    ];

    // Check patterns in priority order
    if (criticalPatterns.some((pattern) => normalizedError.includes(pattern))) {
      return 'critical';
    }
    if (highPatterns.some((pattern) => normalizedError.includes(pattern))) {
      return 'high';
    }
    if (mediumPatterns.some((pattern) => normalizedError.includes(pattern))) {
      return 'medium';
    }

    // Default to low for warnings
    return 'low';
  }

  /**
   * Check if auto-issue can be created based on rate limiting
   * Resets counter after hour has elapsed
   */
  private canCreateAutoIssue(): boolean {
    const now = Date.now();

    // Reset counter if hour has elapsed
    if (now > this.autoIssueResetTime) {
      this.autoIssueCount = 0;
      this.autoIssueResetTime = now + 60 * 60 * 1000;
    }

    return this.autoIssueCount < this.config.maxAutoIssuesPerHour;
  }

  /**
   * Find existing issue for duplicate detection
   * Checks cache first, then searches Beads for similar issues
   */
  private async findExistingIssue(error: string): Promise<BeadsIssue | null> {
    if (!this.projectPath) {
      return null;
    }

    const errorHash = this.hashError(error);

    // Check cache first
    const cached = this.errorCache.get(errorHash);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.CACHE_TTL) {
        // Verify issue still exists
        try {
          const issue = await this.beadsService.getIssue(this.projectPath, cached.issueId);
          if (issue && issue.status !== 'closed') {
            return issue;
          }
        } catch {
          // Issue doesn't exist, remove from cache
          this.errorCache.delete(errorHash);
        }
      } else {
        // Cache expired
        this.errorCache.delete(errorHash);
      }
    }

    // Search for similar open issues by keywords
    const keywords = this.extractKeywords(error);
    for (const keyword of keywords) {
      try {
        const issues = await this.beadsService.searchIssues(this.projectPath, keyword, {
          limit: 5,
        });

        // Find open issue with matching keyword
        const matchingIssue = issues.find((issue) => {
          return (
            issue.status !== 'closed' &&
            (issue.title.toLowerCase().includes(keyword) ||
              issue.description.toLowerCase().includes(keyword))
          );
        });

        if (matchingIssue) {
          // Cache the match
          this.errorCache.set(errorHash, {
            issueId: matchingIssue.id,
            timestamp: Date.now(),
          });
          return matchingIssue;
        }
      } catch {
        // Search failed, continue
        continue;
      }
    }

    return null;
  }

  /**
   * Hash error message for deduplication
   * Normalizes error by removing numbers, paths, and line numbers
   */
  private hashError(error: string): string {
    // Normalize: remove numbers, file paths, line numbers, memory addresses
    const normalized = error
      .toLowerCase()
      .replace(/\b\d+\b/g, 'N') // Numbers
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID') // UUIDs
      .replace(/0x[a-f0-9]+/gi, 'ADDR') // Memory addresses
      .replace(/[/\\][\w./\\-]+/g, 'PATH') // File paths (both Unix and Windows)
      .replace(/:\d+/g, ':LINE') // Line numbers
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Extract keywords from error message for searching
   * Returns meaningful error type identifiers
   */
  private extractKeywords(error: string): string[] {
    const normalized = error.toLowerCase();
    const keywords: string[] = [];

    // Extract error type
    const errorTypeMatch = normalized.match(/([a-z]+error|warning|exception)/i);
    if (errorTypeMatch) {
      keywords.push(errorTypeMatch[1]);
    }

    // Extract key phrases
    const keyPhrases = [
      'cannot find module',
      'permission denied',
      'authentication failed',
      'connection refused',
      'typeerror',
      'referenceerror',
      'validation',
    ];

    for (const phrase of keyPhrases) {
      if (normalized.includes(phrase)) {
        keywords.push(phrase);
      }
    }

    return keywords.length > 0 ? keywords : ['error'];
  }

  /**
   * Extract a short title from error message
   */
  private extractErrorTitle(error: string): string {
    // First line or first 60 chars
    const firstLine = error.split('\n')[0].trim();
    return firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
  }

  /**
   * Format error description with context
   */
  private formatErrorDescription(data: AgentErrorData): string {
    const timestamp = new Date(data.message.timestamp).toLocaleString();
    return `**Error occurred at:** ${timestamp}

**Session ID:** ${data.sessionId}

**Error Message:**
\`\`\`
${data.error}
\`\`\`

**Context:**
This issue was automatically created by the Beads Live Link service when an agent encountered an error during execution.`;
  }

  /**
   * Get statistics about the live link service
   */
  getStats() {
    return {
      autoIssueCount: this.autoIssueCount,
      maxAutoIssuesPerHour: this.config.maxAutoIssuesPerHour,
      resetTime: new Date(this.autoIssueResetTime).toISOString(),
      cacheSize: this.errorCache.size,
      config: this.config,
    };
  }
}
