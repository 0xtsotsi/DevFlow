/**
 * Beads Live Link Service (Simplified)
 *
 * Subscribes to agent events and automatically creates Beads issues for errors and requests.
 * Refactored to use domain models (Rails-style architecture) - models do the work,
 * services coordinate.
 *
 * Features:
 * - Auto-create issues on agent errors (using SentryError model)
 * - Auto-create issues on agent requests
 * - Rate limiting (max 20 issues/hour)
 * - Deduplication (24-hour cache using Sentry event IDs)
 * - Smart priority assignment (delegated to SentryError model)
 */

import type { EventEmitter } from '../lib/events.js';
import { BeadsService } from './beads-service.js';
import { SentryError } from '../models/sentry-error.js';
import { BeadsIssueModel } from '../models/beads-issue.js';
import type { BeadsIssue, CreateBeadsIssueInput } from '@devflow/types';

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
   * Uses SentryError model for severity assessment and PII redaction
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

      // Use SentryError model to process the error
      const sentryError = SentryError.fromErrorString(data.error);

      // Check for duplicates using Sentry event ID
      if (this.config.enableDeduplication) {
        const existingIssue = await this.findExistingIssue(sentryError.eventId);
        if (existingIssue) {
          console.log('[BeadsLiveLink] Duplicate error detected, skipping issue creation');
          return existingIssue;
        }
      }

      // Create BeadsIssueModel from SentryError
      const issueModel = BeadsIssueModel.fromSentryError(sentryError, data.sessionId);

      // Create issue via BeadsService
      const issue = await this.beadsService.createIssue(
        this.projectPath,
        issueModel.toCreateInput()
      );

      // Cache for deduplication using Sentry event ID
      this.errorCache.set(sentryError.eventId, {
        issueId: issue.id,
        timestamp: Date.now(),
      });

      this.autoIssueCount++;
      console.log(
        `[BeadsLiveLink] Created issue ${issue.id} for ${sentryError.severity} severity error (priority ${sentryError.toBeadsPriority()})`
      );

      return issue;
    } catch (error) {
      console.error('[BeadsLiveLink] Error handling agent error:', error);
      return null;
    }
  }

  /**
   * Handle agent request events
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
   * Check if auto-issue can be created based on rate limiting
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
   * Find existing issue for duplicate detection using Sentry event ID
   */
  private async findExistingIssue(eventId: string): Promise<BeadsIssue | null> {
    if (!this.projectPath) {
      return null;
    }

    // Check cache first
    const cached = this.errorCache.get(eventId);
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
          this.errorCache.delete(eventId);
        }
      } else {
        // Cache expired
        this.errorCache.delete(eventId);
      }
    }

    return null;
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
