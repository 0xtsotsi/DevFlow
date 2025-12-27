/**
 * Feature-Beads Bidirectional Sync Service
 *
 * Synchronizes Features and Beads issues bidirectionally:
 * - Creating a feature auto-creates a Beads issue
 * - Feature status changes sync to Beads issue
 * - Beads issue status changes sync to Feature
 * - Detects and reports divergence between the two systems
 */

import fsCallback from 'fs';
import path from 'path';
import { createLogger } from '@automaker/utils';
import type { Feature, FeatureStatus } from '@automaker/types';
import type { BeadsIssue, BeadsIssueStatus } from '@automaker/types';
import { BeadsService } from './beads-service.js';
import { FeatureLoader } from './feature-loader.js';

const logger = createLogger('FeatureBeadsSync');

/**
 * Mapping between Feature status and Beads issue status
 */
const FEATURE_TO_BEADS_STATUS: Record<FeatureStatus, BeadsIssueStatus> = {
  pending: 'open',
  running: 'in_progress',
  completed: 'closed',
  failed: 'open',
  verified: 'closed',
};

/**
 * Mapping between Beads issue status and Feature status
 * Note: Not all Beads statuses map cleanly to Feature statuses
 */
const BEADS_TO_FEATURE_STATUS: Partial<Record<BeadsIssueStatus, FeatureStatus>> = {
  open: 'pending',
  in_progress: 'running',
  closed: 'completed',
};

export class FeatureBeadsSyncService {
  private beadsService: BeadsService;
  private featureLoader: FeatureLoader;
  private projectPath: string;
  private cleanupWatch: (() => void) | null = null;
  private isWatching = false;
  private lastKnownIssues: Map<string, BeadsIssue> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.beadsService = new BeadsService();
    this.featureLoader = new FeatureLoader();
  }

  /**
   * Start watching for Beads database changes
   */
  async startWatching(): Promise<void> {
    if (this.isWatching) {
      logger.warn('[FeatureBeadsSync] Already watching Beads database');
      return;
    }

    try {
      // Validate Beads is initialized
      const validation = await this.beadsService.validateBeadsInProject(this.projectPath);
      if (!validation.initialized) {
        logger.warn('[FeatureBeadsSync] Beads not initialized, skipping watch');
        return;
      }

      // Load initial state
      await this.loadInitialState();

      // Start watching
      this.cleanupWatch = await this.beadsService.watchDatabase(
        this.projectPath,
        async () => {
          try {
            await this.onBeadsDatabaseChanged();
          } catch (error) {
            logger.error('[FeatureBeadsSync] Error handling Beads change:', error);
          }
        }
      );

      this.isWatching = true;
      logger.info('[FeatureBeadsSync] Started watching Beads database');
    } catch (error) {
      logger.error('[FeatureBeadsSync] Failed to start watching:', error);
      throw error;
    }
  }

  /**
   * Stop watching for Beads database changes
   */
  stopWatching(): void {
    if (this.cleanupWatch) {
      this.cleanupWatch();
      this.cleanupWatch = null;
      this.isWatching = false;
      logger.info('[FeatureBeadsSync] Stopped watching Beads database');
    }
  }

  /**
   * Load initial state of Beads issues
   */
  private async loadInitialState(): Promise<void> {
    try {
      const issues = await this.beadsService.listIssues(this.projectPath);
      this.lastKnownIssues.clear();
      for (const issue of issues) {
        this.lastKnownIssues.set(issue.id, issue);
      }
      logger.debug(`[FeatureBeadsSync] Loaded ${issues.length} issues from Beads`);
    } catch (error) {
      logger.error('[FeatureBeadsSync] Failed to load initial state:', error);
    }
  }

  /**
   * Handle Beads database changes
   */
  private async onBeadsDatabaseChanged(): Promise<void> {
    logger.debug('[FeatureBeadsSync] Beads database changed, checking for updates...');

    try {
      // Reload all issues
      const issues = await this.beadsService.listIssues(this.projectPath);

      for (const issue of issues) {
        const lastKnown = this.lastKnownIssues.get(issue.id);

        // Check if this is a new issue or an existing issue with status change
        if (!lastKnown) {
          // New issue - check if it's linked to a feature
          if (issue.featureId) {
            logger.debug(
              `[FeatureBeadsSync] New Beads issue ${issue.id} linked to feature ${issue.featureId}`
            );
            this.lastKnownIssues.set(issue.id, issue);
          }
        } else if (lastKnown.status !== issue.status) {
          // Status changed - sync to feature if linked
          if (issue.featureId) {
            logger.debug(
              `[FeatureBeadsSync] Beads issue ${issue.id} status changed: ${lastKnown.status} -> ${issue.status}`
            );
            await this.onIssueStatusChanged(issue);
          }

          // Update our cache
          this.lastKnownIssues.set(issue.id, issue);
        }
      }

      // Check for deleted issues
      for (const [issueId, issue] of this.lastKnownIssues) {
        if (!issues.find((i) => i.id === issueId)) {
          logger.debug(`[FeatureBeadsSync] Beads issue ${issueId} was deleted`);
          this.lastKnownIssues.delete(issueId);
        }
      }
    } catch (error) {
      logger.error('[FeatureBeadsSync] Error handling database change:', error);
    }
  }

  /**
   * Handle feature creation - auto-create corresponding Beads issue
   */
  async onFeatureCreated(feature: Feature): Promise<BeadsIssue | null> {
    try {
      // Validate Beads is initialized
      const validation = await this.beadsService.validateBeadsInProject(this.projectPath);
      if (!validation.initialized) {
        logger.warn(
          '[FeatureBeadsSync] Beads not initialized, skipping issue creation for feature'
        );
        return null;
      }

      // Check if feature already has a linked Beads issue
      const existingIssues = await this.beadsService.listIssues(this.projectPath, {
        titleContains: feature.id,
      });

      const linkedIssue = existingIssues.find((issue) => issue.featureId === feature.id);
      if (linkedIssue) {
        logger.info(
          `[FeatureBeadsSync] Feature ${feature.id} already has linked Beads issue ${linkedIssue.id}`
        );
        return linkedIssue;
      }

      // Create new Beads issue
      const issueInput = {
        title: this.truncateTitle(feature.title || feature.description),
        description: this.generateIssueDescription(feature),
        type: 'feature' as const,
        priority: this.mapPriority(feature.priority),
        labels: this.generateLabels(feature),
      };

      const newIssue = await this.beadsService.createIssue(this.projectPath, issueInput);

      // Update issue with featureId reference
      await this.beadsService.updateIssue(this.projectPath, newIssue.id, {
        labels: [...newIssue.labels, `feature:${feature.id}`],
      });

      logger.info(
        `[FeatureBeadsSync] Created Beads issue ${newIssue.id} for feature ${feature.id}`
      );

      // Update cache
      this.lastKnownIssues.set(newIssue.id, {
        ...newIssue,
        featureId: feature.id,
        labels: [...newIssue.labels, `feature:${feature.id}`],
      });

      return newIssue;
    } catch (error) {
      logger.error(
        `[FeatureBeadsSync] Failed to create Beads issue for feature ${feature.id}:`,
        error
      );
      return null;
    }
  }

  /**
   * Handle feature status changes - sync to Beads issue
   */
  async onFeatureStatusChanged(feature: Feature): Promise<void> {
    try {
      // Find the linked Beads issue
      const issues = await this.beadsService.listIssues(this.projectPath);
      const linkedIssue = issues.find((issue) =>
        issue.labels.includes(`feature:${feature.id}`)
      );

      if (!linkedIssue) {
        logger.warn(
          `[FeatureBeadsSync] No linked Beads issue found for feature ${feature.id}`
        );
        return;
      }

      // Map Feature status to Beads status
      const newStatus = FEATURE_TO_BEADS_STATUS[feature.status as FeatureStatus];
      if (!newStatus) {
        logger.warn(
          `[FeatureBeadsSync] No status mapping for Feature status "${feature.status}"`
        );
        return;
      }

      // Check if status actually changed
      if (linkedIssue.status === newStatus) {
        return;
      }

      // Update Beads issue status
      await this.beadsService.updateIssue(this.projectPath, linkedIssue.id, {
        status: newStatus,
      });

      logger.info(
        `[FeatureBeadsSync] Synced Feature ${feature.id} status "${feature.status}" to Beads issue ${linkedIssue.id} as "${newStatus}"`
      );

      // Update cache
      this.lastKnownIssues.set(linkedIssue.id, {
        ...linkedIssue,
        status: newStatus,
      });
    } catch (error) {
      logger.error(
        `[FeatureBeadsSync] Failed to sync status for feature ${feature.id}:`,
        error
      );
    }
  }

  /**
   * Handle Beads issue status changes - sync to Feature
   */
  async onIssueStatusChanged(issue: BeadsIssue): Promise<void> {
    try {
      // Extract featureId from labels
      const featureIdLabel = issue.labels.find((label) => label.startsWith('feature:'));
      if (!featureIdLabel) {
        return;
      }

      const featureId = featureIdLabel.split(':')[1];
      if (!featureId) {
        return;
      }

      // Load the feature
      const feature = await this.featureLoader.get(this.projectPath, featureId);
      if (!feature) {
        logger.warn(
          `[FeatureBeadsSync] Feature ${featureId} not found for Beads issue ${issue.id}`
        );
        return;
      }

      // Map Beads status to Feature status
      const newStatus = BEADS_TO_FEATURE_STATUS[issue.status];
      if (!newStatus) {
        logger.warn(
          `[FeatureBeadsSync] No status mapping for Beads status "${issue.status}"`
        );
        return;
      }

      // Check if status actually changed
      if (feature.status === newStatus) {
        return;
      }

      // Update feature status
      await this.featureLoader.update(this.projectPath, featureId, {
        status: newStatus,
      });

      logger.info(
        `[FeatureBeadsSync] Synced Beads issue ${issue.id} status "${issue.status}" to Feature ${featureId} as "${newStatus}"`
      );
    } catch (error) {
      logger.error(
        `[FeatureBeadsSync] Failed to sync Beads issue ${issue.id} status to feature:`,
        error
      );
    }
  }

  /**
   * Sync Feature status to Beads issue (explicit call)
   */
  async syncFeatureStatus(featureId: string): Promise<void> {
    try {
      const feature = await this.featureLoader.get(this.projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      await this.onFeatureStatusChanged(feature);
    } catch (error) {
      logger.error(`[FeatureBeadsSync] Failed to sync feature ${featureId} status:`, error);
      throw error;
    }
  }

  /**
   * Sync Beads issue status to Feature (explicit call)
   */
  async syncIssueStatus(issueId: string): Promise<void> {
    try {
      const issue = await this.beadsService.getIssue(this.projectPath, issueId);
      if (!issue) {
        throw new Error(`Beads issue ${issueId} not found`);
      }

      await this.onIssueStatusChanged(issue);
    } catch (error) {
      logger.error(`[FeatureBeadsSync] Failed to sync issue ${issueId} status:`, error);
      throw error;
    }
  }

  /**
   * Validate and detect divergence between Features and Beads issues
   */
  async validateSync(): Promise<{
    isHealthy: boolean;
    divergences: Array<{
      type: 'missing-issue' | 'missing-feature' | 'status-mismatch';
      featureId?: string;
      issueId?: string;
      featureStatus?: string;
      issueStatus?: string;
    }>;
  }> {
    const divergences: Array<{
      type: 'missing-issue' | 'missing-feature' | 'status-mismatch';
      featureId?: string;
      issueId?: string;
      featureStatus?: string;
      issueStatus?: string;
    }> = [];

    try {
      // Get all features
      const features = await this.featureLoader.getAll(this.projectPath);

      // Get all Beads issues
      const issues = await this.beadsService.listIssues(this.projectPath);

      // Build lookup maps
      const featureToIssueMap = new Map<string, BeadsIssue>();
      const issueToFeatureMap = new Map<string, Feature>();

      for (const issue of issues) {
        const featureIdLabel = issue.labels.find((label) => label.startsWith('feature:'));
        if (featureIdLabel) {
          const featureId = featureIdLabel.split(':')[1];
          if (featureId) {
            featureToIssueMap.set(featureId, issue);
          }
        }
      }

      for (const feature of features) {
        issueToFeatureMap.set(feature.id, feature);
      }

      // Check for features without Beads issues
      for (const feature of features) {
        const linkedIssue = featureToIssueMap.get(feature.id);
        if (!linkedIssue) {
          divergences.push({
            type: 'missing-issue',
            featureId: feature.id,
          });
        } else {
          // Check for status mismatches
          const expectedBeadsStatus =
            FEATURE_TO_BEADS_STATUS[feature.status as FeatureStatus];
          if (expectedBeadsStatus && linkedIssue.status !== expectedBeadsStatus) {
            divergences.push({
              type: 'status-mismatch',
              featureId: feature.id,
              issueId: linkedIssue.id,
              featureStatus: feature.status,
              issueStatus: linkedIssue.status,
            });
          }
        }
      }

      // Check for Beads issues without features (optional, may be legitimate)
      for (const issue of issues) {
        const featureIdLabel = issue.labels.find((label) => label.startsWith('feature:'));
        if (featureIdLabel) {
          const featureId = featureIdLabel.split(':')[1];
          if (featureId && !issueToFeatureMap.has(featureId)) {
            divergences.push({
              type: 'missing-feature',
              featureId,
              issueId: issue.id,
            });
          }
        }
      }

      const isHealthy = divergences.length === 0;

      if (!isHealthy) {
        logger.warn(
          `[FeatureBeadsSync] Detected ${divergences.length} divergence(s) between Features and Beads`
        );
      }

      return { isHealthy, divergences };
    } catch (error) {
      logger.error('[FeatureBeadsSync] Failed to validate sync:', error);
      throw error;
    }
  }

  /**
   * Truncate title to fit Beads issue title length limits
   */
  private truncateTitle(title: string, maxLength = 100): string {
    if (title.length <= maxLength) {
      return title;
    }
    return title.substring(0, maxLength - 3) + '...';
  }

  /**
   * Generate Beads issue description from feature
   */
  private generateIssueDescription(feature: Feature): string {
    const parts: string[] = [];

    if (feature.title && feature.title !== feature.description) {
      parts.push(`**Title:** ${feature.title}\n`);
    }

    parts.push(`**Description:** ${feature.description}`);

    if (feature.category) {
      parts.push(`\n**Category:** ${feature.category}`);
    }

    if (feature.priority !== undefined) {
      parts.push(`\n**Priority:** ${feature.priority}`);
    }

    if (feature.spec) {
      parts.push(`\n**Spec:** ${feature.spec}`);
    }

    parts.push(`\n**Feature ID:** ${feature.id}`);
    parts.push(`\n**Auto-linked from DevFlow Feature**`);

    return parts.join('');
  }

  /**
   * Map Feature priority to Beads priority (0=highest, 4=lowest)
   */
  private mapPriority(priority?: number): 0 | 1 | 2 | 3 | 4 {
    if (priority === undefined) {
      return 2; // Default to medium priority
    }

    // Map 1-10 scale to 0-4 scale (inverted)
    if (priority >= 9) return 0;
    if (priority >= 7) return 1;
    if (priority >= 5) return 2;
    if (priority >= 3) return 3;
    return 4;
  }

  /**
   * Generate labels for Beads issue
   */
  private generateLabels(feature: Feature): string[] {
    const labels: string[] = [];

    if (feature.category) {
      // Convert category to label format (lowercase, replace spaces with hyphens)
      labels.push(feature.category.toLowerCase().replace(/\s+/g, '-'));
    }

    // Add feature ID label for tracking
    labels.push(`feature:${feature.id}`);

    return labels;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopWatching();
    this.lastKnownIssues.clear();
  }
}
