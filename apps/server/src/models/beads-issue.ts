/**
 * Beads Issue Domain Model
 *
 * Encapsulates Beads issue data with business logic for status management,
 * dependency checking, and Sentry integration. Follows Rails-style architecture
 * where models do the work.
 */

import type {
  BeadsIssue,
  BeadsIssueStatus,
  BeadsIssueType,
  BeadsIssuePriority,
  CreateBeadsIssueInput,
  BeadsDependency,
} from '@devflow/types';
import { SentryError } from './sentry-error.js';

/**
 * Beads Issue Domain Model
 *
 * Wraps the BeadsIssue type with business logic methods for issue management.
 * Models do the work, services coordinate.
 */
export class BeadsIssueModel {
  private constructor(public readonly data: BeadsIssue) {}

  /**
   * Factory method: Create from Sentry error
   */
  static fromSentryError(
    sentryError: SentryError,
    sessionId?: string,
    parentIssueId?: string
  ): BeadsIssueModel {
    const input: CreateBeadsIssueInput = {
      title: sentryError.toTitle(),
      description: sentryError.toDescription(sessionId),
      type: 'bug',
      priority: sentryError.toBeadsPriority() as BeadsIssuePriority,
      labels: sentryError.toLabels(),
      parentIssueId,
    };

    return BeadsIssueModel.create(input);
  }

  /**
   * Factory method: Create from input data
   */
  static create(input: CreateBeadsIssueInput & { id?: string }): BeadsIssueModel {
    const now = new Date().toISOString();

    const data: BeadsIssue = {
      id: input.id || `temp-${Date.now()}`,
      title: input.title,
      description: input.description || '',
      status: input.status || 'open',
      type: input.type || 'task',
      priority: (input.priority ?? 2) as BeadsIssuePriority,
      labels: input.labels || [],
      createdAt: now,
      updatedAt: now,
      parentIssueId: input.parentIssueId,
    };

    return new BeadsIssueModel(data);
  }

  /**
   * Factory method: Wrap existing BeadsIssue data
   */
  static fromData(data: BeadsIssue): BeadsIssueModel {
    return new BeadsIssueModel(data);
  }

  /**
   * Idempotently update issue with new Sentry event data
   *
   * This method is safe to call multiple times with the same event.
   * It only updates if the event is new.
   */
  updateWithSentryEvent(sentryError: SentryError, sessionId?: string): BeadsIssueModel {
    // Check if this event is already tracked (by eventId in labels)
    const hasExistingEvent = this.data.labels.includes(`sentry-event:${sentryError.eventId}`);

    if (hasExistingEvent) {
      // Already tracked, no update needed (idempotent)
      return this;
    }

    // Add new event information
    const newLabels = [...this.data.labels, `sentry-event:${sentryError.eventId}`];

    // Append new event to description
    const newDescription =
      this.data.description +
      '\n\n---\n\n**New Occurrence:**\n' +
      sentryError.toDescription(sessionId);

    // Update severity if new event is more severe
    const currentSeverity = this.extractSeverityFromLabels();
    const newSeverity = sentryError.severity;
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const shouldUpdateSeverity =
      severityOrder.indexOf(newSeverity) > severityOrder.indexOf(currentSeverity);

    const newPriority = shouldUpdateSeverity ? sentryError.toBeadsPriority() : this.data.priority;

    // Update status to open if it was closed (new occurrence)
    const newStatus: BeadsIssueStatus = this.data.status === 'closed' ? 'open' : this.data.status;

    const updatedData: BeadsIssue = {
      ...this.data,
      description: newDescription,
      priority: newPriority as BeadsIssuePriority,
      status: newStatus,
      labels: shouldUpdateSeverity ? sentryError.toLabels().concat(newLabels) : newLabels,
      updatedAt: new Date().toISOString(),
    };

    return new BeadsIssueModel(updatedData);
  }

  /**
   * Check if issue is ready to start (no blockers)
   */
  isReadyToStart(): boolean {
    // Closed issues are not ready to start
    if (this.data.status === 'closed') {
      return false;
    }

    // In-progress issues are already started
    if (this.data.status === 'in_progress') {
      return false;
    }

    // Check for blocking dependencies
    return !this.isBlocked();
  }

  /**
   * Check if issue is blocked by dependencies
   */
  isBlocked(): boolean {
    if (!this.data.dependencies || this.data.dependencies.length === 0) {
      return false;
    }

    // Check if any dependencies are blockers
    return this.data.dependencies.some((dep) => dep.type === 'blocks' || dep.type === 'parent');
  }

  /**
   * Check if issue can be transitioned to in_progress
   */
  canStart(): boolean {
    return this.data.status === 'open' && this.isReadyToStart();
  }

  /**
   * Check if issue can be closed
   */
  canClose(): boolean {
    return this.data.status !== 'closed';
  }

  /**
   * Transition issue to in_progress
   */
  start(): BeadsIssueModel {
    if (!this.canStart()) {
      throw new Error(
        `Issue ${this.data.id} cannot be started (current status: ${this.data.status})`
      );
    }

    const updatedData: BeadsIssue = {
      ...this.data,
      status: 'in_progress',
      updatedAt: new Date().toISOString(),
    };

    return new BeadsIssueModel(updatedData);
  }

  /**
   * Transition issue to closed
   */
  close(): BeadsIssueModel {
    if (!this.canClose()) {
      throw new Error(`Issue ${this.data.id} is already closed`);
    }

    const updatedData: BeadsIssue = {
      ...this.data,
      status: 'closed',
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return new BeadsIssueModel(updatedData);
  }

  /**
   * Add a dependency to this issue
   */
  addDependency(issueId: string, type: BeadsDependency['type']): BeadsIssueModel {
    const newDependency: BeadsDependency = { issueId, type };

    const dependencies = this.data.dependencies || [];
    const existingIndex = dependencies.findIndex((d) => d.issueId === issueId);

    let updatedDependencies: BeadsDependency[];
    if (existingIndex >= 0) {
      // Update existing dependency
      updatedDependencies = [...dependencies];
      updatedDependencies[existingIndex] = newDependency;
    } else {
      // Add new dependency
      updatedDependencies = [...dependencies, newDependency];
    }

    const updatedData: BeadsIssue = {
      ...this.data,
      dependencies: updatedDependencies,
      updatedAt: new Date().toISOString(),
    };

    return new BeadsIssueModel(updatedData);
  }

  /**
   * Remove a dependency from this issue
   */
  removeDependency(issueId: string): BeadsIssueModel {
    if (!this.data.dependencies) {
      return this;
    }

    const updatedDependencies = this.data.dependencies.filter((d) => d.issueId !== issueId);

    const updatedData: BeadsIssue = {
      ...this.data,
      dependencies: updatedDependencies,
      updatedAt: new Date().toISOString(),
    };

    return new BeadsIssueModel(updatedData);
  }

  /**
   * Add a label to this issue
   */
  addLabel(label: string): BeadsIssueModel {
    if (this.data.labels.includes(label)) {
      return this; // Label already exists
    }

    const updatedData: BeadsIssue = {
      ...this.data,
      labels: [...this.data.labels, label],
      updatedAt: new Date().toISOString(),
    };

    return new BeadsIssueModel(updatedData);
  }

  /**
   * Remove a label from this issue
   */
  removeLabel(label: string): BeadsIssueModel {
    const updatedLabels = this.data.labels.filter((l) => l !== label);

    const updatedData: BeadsIssue = {
      ...this.data,
      labels: updatedLabels,
      updatedAt: new Date().toISOString(),
    };

    return new BeadsIssueModel(updatedData);
  }

  /**
   * Convert to plain BeadsIssue data (for API responses)
   */
  toJSON(): BeadsIssue {
    return { ...this.data };
  }

  /**
   * Convert to CreateBeadsIssueInput (for creating issues)
   */
  toCreateInput(): CreateBeadsIssueInput {
    return {
      title: this.data.title,
      description: this.data.description,
      type: this.data.type,
      priority: this.data.priority,
      labels: this.data.labels,
      parentIssueId: this.data.parentIssueId,
    };
  }

  /**
   * Extract severity from labels
   */
  private extractSeverityFromLabels(): string {
    const severityLabel = this.data.labels.find((l) =>
      ['critical', 'high', 'medium', 'low'].includes(l)
    );
    return severityLabel || 'low';
  }

  /**
   * Get display name for the issue
   */
  get displayName(): string {
    return `${this.data.id}: ${this.data.title}`;
  }

  /**
   * Check if issue is auto-created (from Sentry or agent errors)
   */
  get isAutoCreated(): boolean {
    return this.data.labels.includes('auto-created');
  }

  /**
   * Check if issue is a Sentry error
   */
  get isSentryError(): boolean {
    return this.data.labels.includes('sentry-error');
  }

  /**
   * Check if issue is an agent error
   */
  get isAgentError(): boolean {
    return this.data.labels.includes('agent-error');
  }

  /**
   * Get issue age in milliseconds
   */
  get age(): number {
    const created = new Date(this.data.createdAt || Date.now()).getTime();
    return Date.now() - created;
  }

  /**
   * Get age in human-readable format
   */
  get ageHuman(): string {
    const seconds = Math.floor(this.age / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d`;
    }
    if (hours > 0) {
      return `${hours}h`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  }
}
