/**
 * Telemetry Service - Collects and manages telemetry data for machine integration
 *
 * This service provides:
 * - Agent execution metrics (duration, tokens, errors)
 * - Checkpoint creation/restore tracking
 * - Beads integration statistics
 * - System health and performance monitoring
 *
 * All data is stored locally and never sent externally.
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';

/**
 * Telemetry event types
 */
export type TelemetryEventType =
  | 'agent_start'
  | 'agent_complete'
  | 'agent_error'
  | 'checkpoint_created'
  | 'checkpoint_restored'
  | 'checkpoint_deleted'
  | 'beads_issue_created'
  | 'beads_issue_updated'
  | 'beads_dependency_created'
  | 'feature_start'
  | 'feature_complete'
  | 'feature_error';

/**
 * Base telemetry event
 */
export interface TelemetryEvent {
  /** Event type */
  type: TelemetryEventType;
  /** ISO timestamp of when the event occurred */
  timestamp: string;
  /** Session ID for grouping related events */
  sessionId?: string;
  /** Feature ID if associated with a feature */
  featureId?: string;
  /** Beads issue ID if associated with an issue */
  beadsIssueId?: string;
}

/**
 * Agent execution telemetry
 */
export interface AgentTelemetryEvent extends TelemetryEvent {
  type: 'agent_start' | 'agent_complete' | 'agent_error';
  /** Model used for the agent */
  model?: string;
  /** Provider used (claude, cursor, etc.) */
  provider?: string;
  /** Number of messages in the conversation */
  messageCount?: number;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Error message if agent failed */
  error?: string;
}

/**
 * Checkpoint telemetry
 */
export interface CheckpointTelemetryEvent extends TelemetryEvent {
  type: 'checkpoint_created' | 'checkpoint_restored' | 'checkpoint_deleted';
  /** Checkpoint ID */
  checkpointId: string;
  /** Number of files in the checkpoint */
  fileCount?: number;
  /** Size of checkpoint in bytes */
  sizeBytes?: number;
  /** Time to create/restore in milliseconds */
  operationTime?: number;
}

/**
 * Beads integration telemetry
 */
export interface BeadsTelemetryEvent extends TelemetryEvent {
  type: 'beads_issue_created' | 'beads_issue_updated' | 'beads_dependency_created';
  /** Issue type */
  issueType?: string;
  /** Issue status */
  issueStatus?: string;
  /** Dependency type */
  dependencyType?: string;
}

/**
 * Feature execution telemetry
 */
export interface FeatureTelemetryEvent extends TelemetryEvent {
  type: 'feature_start' | 'feature_complete' | 'feature_error';
  /** Feature title */
  featureTitle?: string;
  /** Number of tasks in the feature */
  taskCount?: number;
  /** Planning mode used */
  planningMode?: string;
  /** Total duration in milliseconds */
  duration?: number;
  /** Error message if feature failed */
  error?: string;
}

/**
 * Aggregated telemetry statistics
 */
export interface TelemetryStats {
  /** Total agent executions */
  totalAgentExecutions: number;
  /** Successful agent executions */
  successfulAgentExecutions: number;
  /** Failed agent executions */
  failedAgentExecutions: number;
  /** Average agent duration in milliseconds */
  avgAgentDuration: number;
  /** Total checkpoints created */
  totalCheckpointsCreated: number;
  /** Total checkpoints restored */
  totalCheckpointsRestored: number;
  /** Total beads operations */
  totalBeadsOperations: number;
  /** Total features executed */
  totalFeaturesExecuted: number;
  /** Successful features */
  successfulFeatures: number;
  /** Failed features */
  failedFeatures: number;
}

/**
 * Telemetry summary for a session
 */
export interface SessionSummary {
  /** Session ID */
  sessionId: string;
  /** Session start time */
  startTime: string;
  /** Session end time (if ended) */
  endTime?: string;
  /** Number of events in the session */
  eventCount: number;
  /** Events in the session */
  events: TelemetryEvent[];
}

export class TelemetryService {
  private telemetryDir: string;
  private eventsFile: string;
  private sessionsFile: string;
  private currentSession: string | null = null;
  private sessionStartTime: string | null = null;
  private events: TelemetryEvent[] = [];
  private sessions: Map<string, SessionSummary> = new Map();
  private eventEmitter: EventEmitter;

  constructor(dataDir: string, eventEmitter: EventEmitter) {
    this.telemetryDir = path.join(dataDir, 'telemetry');
    this.eventsFile = path.join(this.telemetryDir, 'events.jsonl');
    this.sessionsFile = path.join(this.telemetryDir, 'sessions.json');
    this.eventEmitter = eventEmitter;
  }

  async initialize(): Promise<void> {
    await secureFs.mkdir(this.telemetryDir, { recursive: true });

    // Load existing events
    await this.loadEvents();

    // Load existing sessions
    await this.loadSessions();
  }

  /**
   * Start a new telemetry session
   */
  startSession(sessionId: string): void {
    this.currentSession = sessionId;
    this.sessionStartTime = new Date().toISOString();

    this.sessions.set(sessionId, {
      sessionId,
      startTime: this.sessionStartTime,
      eventCount: 0,
      events: [],
    });

    this.saveSessions();
  }

  /**
   * End the current session
   */
  endSession(): void {
    if (!this.currentSession || !this.sessionStartTime) {
      return;
    }

    const session = this.sessions.get(this.currentSession);
    if (session) {
      session.endTime = new Date().toISOString();
      this.sessions.set(this.currentSession, session);
    }

    this.saveSessions();
    this.currentSession = null;
    this.sessionStartTime = null;
  }

  /**
   * Record an agent start event
   */
  recordAgentStart(params: {
    sessionId?: string;
    featureId?: string;
    model?: string;
    provider?: string;
  }): void {
    this.recordEvent({
      type: 'agent_start',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      model: params.model,
      provider: params.provider,
    });
  }

  /**
   * Record an agent complete event
   */
  recordAgentComplete(params: {
    sessionId?: string;
    featureId?: string;
    model?: string;
    provider?: string;
    messageCount?: number;
    duration: number;
  }): void {
    this.recordEvent({
      type: 'agent_complete',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      model: params.model,
      provider: params.provider,
      messageCount: params.messageCount,
      duration: params.duration,
    });
  }

  /**
   * Record an agent error event
   */
  recordAgentError(params: {
    sessionId?: string;
    featureId?: string;
    model?: string;
    provider?: string;
    error: string;
    duration?: number;
  }): void {
    this.recordEvent({
      type: 'agent_error',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      model: params.model,
      provider: params.provider,
      error: params.error,
      duration: params.duration,
    });
  }

  /**
   * Record a checkpoint creation event
   */
  recordCheckpointCreated(params: {
    sessionId?: string;
    featureId?: string;
    checkpointId: string;
    fileCount?: number;
    sizeBytes?: number;
    operationTime?: number;
  }): void {
    this.recordEvent({
      type: 'checkpoint_created',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      checkpointId: params.checkpointId,
      fileCount: params.fileCount,
      sizeBytes: params.sizeBytes,
      operationTime: params.operationTime,
    });
  }

  /**
   * Record a checkpoint restore event
   */
  recordCheckpointRestored(params: {
    sessionId?: string;
    featureId?: string;
    checkpointId: string;
    fileCount?: number;
    operationTime?: number;
  }): void {
    this.recordEvent({
      type: 'checkpoint_restored',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      checkpointId: params.checkpointId,
      fileCount: params.fileCount,
      operationTime: params.operationTime,
    });
  }

  /**
   * Record a checkpoint deletion event
   */
  recordCheckpointDeleted(params: {
    sessionId?: string;
    featureId?: string;
    checkpointId: string;
  }): void {
    this.recordEvent({
      type: 'checkpoint_deleted',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      checkpointId: params.checkpointId,
    });
  }

  /**
   * Record a beads issue creation event
   */
  recordBeadsIssueCreated(params: {
    sessionId?: string;
    featureId?: string;
    beadsIssueId: string;
    issueType: string;
    issueStatus: string;
  }): void {
    this.recordEvent({
      type: 'beads_issue_created',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      beadsIssueId: params.beadsIssueId,
      issueType: params.issueType,
      issueStatus: params.issueStatus,
    });
  }

  /**
   * Record a beads issue update event
   */
  recordBeadsIssueUpdated(params: {
    sessionId?: string;
    featureId?: string;
    beadsIssueId: string;
    issueType?: string;
    issueStatus?: string;
  }): void {
    this.recordEvent({
      type: 'beads_issue_updated',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      beadsIssueId: params.beadsIssueId,
      issueType: params.issueType,
      issueStatus: params.issueStatus,
    });
  }

  /**
   * Record a beads dependency creation event
   */
  recordBeadsDependencyCreated(params: {
    sessionId?: string;
    featureId?: string;
    dependencyType: string;
  }): void {
    this.recordEvent({
      type: 'beads_dependency_created',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      dependencyType: params.dependencyType,
    });
  }

  /**
   * Record a feature start event
   */
  recordFeatureStart(params: {
    sessionId?: string;
    featureId: string;
    featureTitle?: string;
    taskCount?: number;
    planningMode?: string;
  }): void {
    this.recordEvent({
      type: 'feature_start',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      featureTitle: params.featureTitle,
      taskCount: params.taskCount,
      planningMode: params.planningMode,
    });
  }

  /**
   * Record a feature complete event
   */
  recordFeatureComplete(params: {
    sessionId?: string;
    featureId: string;
    featureTitle?: string;
    taskCount?: number;
    planningMode?: string;
    duration: number;
  }): void {
    this.recordEvent({
      type: 'feature_complete',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      featureTitle: params.featureTitle,
      taskCount: params.taskCount,
      planningMode: params.planningMode,
      duration: params.duration,
    });
  }

  /**
   * Record a feature error event
   */
  recordFeatureError(params: {
    sessionId?: string;
    featureId: string;
    featureTitle?: string;
    error: string;
    duration?: number;
  }): void {
    this.recordEvent({
      type: 'feature_error',
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId || this.currentSession || undefined,
      featureId: params.featureId,
      featureTitle: params.featureTitle,
      error: params.error,
      duration: params.duration,
    });
  }

  /**
   * Get all events
   */
  getEvents(filters?: {
    type?: TelemetryEventType;
    sessionId?: string;
    featureId?: string;
    startDate?: Date;
    endDate?: Date;
  }): TelemetryEvent[] {
    let filtered = this.events;

    if (filters?.type) {
      filtered = filtered.filter((e) => e.type === filters.type);
    }

    if (filters?.sessionId) {
      filtered = filtered.filter((e) => e.sessionId === filters.sessionId);
    }

    if (filters?.featureId) {
      filtered = filtered.filter((e) => e.featureId === filters.featureId);
    }

    if (filters?.startDate) {
      filtered = filtered.filter((e) => new Date(e.timestamp) >= filters.startDate!);
    }

    if (filters?.endDate) {
      filtered = filtered.filter((e) => new Date(e.timestamp) <= filters.endDate!);
    }

    return filtered;
  }

  /**
   * Get telemetry statistics
   */
  getStats(filters?: {
    sessionId?: string;
    featureId?: string;
    startDate?: Date;
    endDate?: Date;
  }): TelemetryStats {
    const events = this.getEvents(filters);

    const agentEvents = events.filter(
      (e): e is AgentTelemetryEvent =>
        e.type === 'agent_start' || e.type === 'agent_complete' || e.type === 'agent_error'
    );

    const agentCompletes = agentEvents.filter((e) => e.type === 'agent_complete');
    const agentErrors = agentEvents.filter((e) => e.type === 'agent_error');

    const avgAgentDuration =
      agentCompletes.length > 0
        ? agentCompletes.reduce((sum, e) => sum + (e.duration || 0), 0) / agentCompletes.length
        : 0;

    const checkpointEvents = events.filter(
      (e): e is CheckpointTelemetryEvent =>
        e.type === 'checkpoint_created' ||
        e.type === 'checkpoint_restored' ||
        e.type === 'checkpoint_deleted'
    );

    const beadsEvents = events.filter(
      (e): e is BeadsTelemetryEvent =>
        e.type === 'beads_issue_created' ||
        e.type === 'beads_issue_updated' ||
        e.type === 'beads_dependency_created'
    );

    const featureEvents = events.filter(
      (e): e is FeatureTelemetryEvent =>
        e.type === 'feature_start' || e.type === 'feature_complete' || e.type === 'feature_error'
    );

    const featureCompletes = featureEvents.filter((e) => e.type === 'feature_complete');
    const featureErrors = featureEvents.filter((e) => e.type === 'feature_error');

    return {
      totalAgentExecutions: agentEvents.length,
      successfulAgentExecutions: agentCompletes.length,
      failedAgentExecutions: agentErrors.length,
      avgAgentDuration: Math.round(avgAgentDuration),
      totalCheckpointsCreated: checkpointEvents.filter((e) => e.type === 'checkpoint_created')
        .length,
      totalCheckpointsRestored: checkpointEvents.filter((e) => e.type === 'checkpoint_restored')
        .length,
      totalBeadsOperations: beadsEvents.length,
      totalFeaturesExecuted: featureEvents.filter((e) => e.type === 'feature_start').length,
      successfulFeatures: featureCompletes.length,
      failedFeatures: featureErrors.length,
    };
  }

  /**
   * Get a session summary
   */
  getSessionSummary(sessionId: string): SessionSummary | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all session summaries
   */
  getAllSessionSummaries(): SessionSummary[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  /**
   * Clear all telemetry data
   */
  async clearAll(): Promise<void> {
    this.events = [];
    this.sessions.clear();
    await secureFs.writeFile(this.eventsFile, '');
    await secureFs.writeFile(this.sessionsFile, JSON.stringify({}, null, 2));
  }

  /**
   * Clear events for a specific session
   */
  async clearSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.events = this.events.filter((e) => e.sessionId !== sessionId);
    await this.saveEvents();
    await this.saveSessions();
  }

  /**
   * Record a telemetry event
   */
  private recordEvent(event: TelemetryEvent): void {
    this.events.push(event);

    // Add to session if we have one
    if (event.sessionId) {
      const session = this.sessions.get(event.sessionId);
      if (session) {
        session.events.push(event);
        session.eventCount = session.events.length;
      }
    }

    // Emit event for real-time monitoring
    this.eventEmitter.emit('telemetry:event', event);

    // Persist to disk
    this.saveEvents();
  }

  /**
   * Load events from disk
   */
  private async loadEvents(): Promise<void> {
    try {
      const content = await secureFs.readFile(this.eventsFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      this.events = lines.map((line) => JSON.parse(line));
    } catch (error) {
      // File doesn't exist yet, that's okay
      this.events = [];
    }
  }

  /**
   * Load sessions from disk
   */
  private async loadSessions(): Promise<void> {
    try {
      const content = await secureFs.readFile(this.sessionsFile, 'utf-8');
      const sessionsObj = JSON.parse(content);
      this.sessions = new Map(Object.entries(sessionsObj));
    } catch (error) {
      // File doesn't exist yet, that's okay
      this.sessions = new Map();
    }
  }

  /**
   * Save events to disk (JSONL format)
   */
  private async saveEvents(): Promise<void> {
    const content = this.events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await secureFs.writeFile(this.eventsFile, content);
  }

  /**
   * Save sessions to disk
   */
  private async saveSessions(): Promise<void> {
    const sessionsObj = Object.fromEntries(this.sessions);
    await secureFs.writeFile(this.sessionsFile, JSON.stringify(sessionsObj, null, 2));
  }
}
