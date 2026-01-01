/**
 * Agent Monitor Service - Monitors agent execution and health
 *
 * Provides:
 * - Real-time monitoring of agent sessions
 * - Performance metrics tracking (latency, token usage, duration)
 * - Health checks and error tracking
 * - Resource utilization monitoring
 * - Event aggregation and statistics
 */

import type { EventEmitter } from '../lib/events.js';
import type { EventType } from '@automaker/types';

// Monitoring metrics interfaces
interface AgentSessionMetrics {
  sessionId: string;
  startTime: string;
  endTime?: string;
  duration?: number; // in milliseconds
  status: 'running' | 'completed' | 'error' | 'aborted';
  messageCount: number;
  toolUseCount: number;
  errorCount: number;
  lastActivityTime: string;
  model?: string;
}

interface AgentHealthStatus {
  isActive: boolean;
  activeSessions: number;
  totalSessions: number;
  completedSessions: number;
  errorSessions: number;
  abortedSessions: number;
  averageDuration: number; // milliseconds
  lastErrorTime?: string;
  lastError?: string;
}

interface PerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number; // milliseconds
  totalTokensUsed: number;
  totalToolCalls: number;
  uptimeStart: string;
}

interface MonitorSnapshot {
  timestamp: string;
  health: AgentHealthStatus;
  performance: PerformanceMetrics;
  activeSessions: Array<{
    sessionId: string;
    duration: number;
    messageCount: number;
    status: string;
  }>;
}

export class AgentMonitorService {
  private sessions = new Map<string, AgentSessionMetrics>();
  private events: EventEmitter;
  private performanceMetrics: PerformanceMetrics;
  private cleanupInterval?: NodeJS.Timeout;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor(events: EventEmitter) {
    this.events = events;
    this.performanceMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      totalToolCalls: 0,
      uptimeStart: new Date().toISOString(),
    };
  }

  /**
   * Initialize the monitor service and start listening to events
   */
  async initialize(): Promise<void> {
    // Subscribe to agent events
    this.subscribeToEvents();

    // Start periodic cleanup
    this.startCleanupInterval();

    console.log('[AgentMonitorService] Initialized and monitoring agent events');
  }

  /**
   * Start monitoring a new agent session
   */
  startSession(sessionId: string, model?: string): void {
    const metrics: AgentSessionMetrics = {
      sessionId,
      startTime: new Date().toISOString(),
      status: 'running',
      messageCount: 0,
      toolUseCount: 0,
      errorCount: 0,
      lastActivityTime: new Date().toISOString(),
      model,
    };

    this.sessions.set(sessionId, metrics);
    this.performanceMetrics.totalRequests++;

    this.emitMonitorEvent('session:started', { sessionId, model });
  }

  /**
   * Record a message event in a session
   */
  recordMessage(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messageCount++;
      session.lastActivityTime = new Date().toISOString();
    }
  }

  /**
   * Record a tool use event in a session
   */
  recordToolUse(sessionId: string, toolName: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.toolUseCount++;
      session.lastActivityTime = new Date().toISOString();
      this.performanceMetrics.totalToolCalls++;
    }

    this.emitMonitorEvent('tool:used', { sessionId, toolName });
  }

  /**
   * Record an error in a session
   */
  recordError(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.errorCount++;
      this.performanceMetrics.failedRequests++;
    }

    this.emitMonitorEvent('session:error', { sessionId, error });
  }

  /**
   * Mark a session as completed
   */
  completeSession(sessionId: string, aborted = false): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(session.startTime).getTime();

    session.endTime = endTime;
    session.duration = duration;
    session.status = aborted ? 'aborted' : 'completed';

    if (aborted) {
      this.performanceMetrics.failedRequests++;
    } else {
      this.performanceMetrics.successfulRequests++;
    }

    // Update average response time
    this.updateAverageResponseTime(duration);

    this.emitMonitorEvent('session:completed', {
      sessionId,
      duration,
      status: session.status,
    });
  }

  /**
   * Get current health status
   */
  getHealthStatus(): AgentHealthStatus {
    const activeSessions = Array.from(this.sessions.values()).filter((s) => s.status === 'running');

    const allSessions = Array.from(this.sessions.values());
    const completedSessions = allSessions.filter((s) => s.status === 'completed');
    const errorSessions = allSessions.filter((s) => s.status === 'error');
    const abortedSessions = allSessions.filter((s) => s.status === 'aborted');

    const avgDuration =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0) /
          completedSessions.length
        : 0;

    return {
      isActive: activeSessions.length > 0,
      activeSessions: activeSessions.length,
      totalSessions: allSessions.length,
      completedSessions: completedSessions.length,
      errorSessions: errorSessions.length,
      abortedSessions: abortedSessions.length,
      averageDuration: Math.round(avgDuration),
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get metrics for a specific session
   */
  getSessionMetrics(sessionId: string): AgentSessionMetrics | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): AgentSessionMetrics[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === 'running');
  }

  /**
   * Get a comprehensive monitoring snapshot
   */
  getSnapshot(): MonitorSnapshot {
    const health = this.getHealthStatus();
    const performance = this.getPerformanceMetrics();
    const activeSessions = this.getActiveSessions().map((s) => ({
      sessionId: s.sessionId,
      duration: Date.now() - new Date(s.startTime).getTime(),
      messageCount: s.messageCount,
      status: s.status,
    }));

    return {
      timestamp: new Date().toISOString(),
      health,
      performance,
      activeSessions,
    };
  }

  /**
   * Clear old session data
   */
  clearOldSessions(olderThanMs: number): void {
    const cutoff = Date.now() - olderThanMs;
    let cleared = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionTime = new Date(session.endTime || session.startTime).getTime();
      if (sessionTime < cutoff && session.status !== 'running') {
        this.sessions.delete(sessionId);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(
        `[AgentMonitorService] Cleared ${cleared} old sessions (older than ${olderThanMs}ms)`
      );
    }
  }

  /**
   * Reset all metrics (useful for testing or manual reset)
   */
  resetMetrics(): void {
    this.sessions.clear();
    this.performanceMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      totalToolCalls: 0,
      uptimeStart: new Date().toISOString(),
    };

    this.emitMonitorEvent('metrics:reset', {});
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    this.sessions.clear();
    console.log('[AgentMonitorService] Destroyed');
  }

  // Private methods

  private subscribeToEvents(): void {
    this.events.subscribe((type, payload) => {
      const data = payload as Record<string, unknown>;

      switch (type) {
        case 'agent:stream':
          this.handleAgentStreamEvent(data);
          break;
        case 'feature:started':
          this.handleFeatureStartedEvent(data);
          break;
        case 'feature:completed':
        case 'feature:stopped':
        case 'feature:error':
          this.handleFeatureEndedEvent(type, data);
          break;
        case 'auto-mode:started':
          this.handleAutoModeStartedEvent(data);
          break;
        case 'auto-mode:stopped':
        case 'auto-mode:error':
          this.handleAutoModeEndedEvent(type, data);
          break;
      }
    });
  }

  private handleAgentStreamEvent(data: Record<string, unknown>): void {
    const sessionId = data.sessionId as string;

    if (!sessionId) return;

    // Initialize session if not exists
    if (!this.sessions.has(sessionId)) {
      this.startSession(sessionId);
    }

    const messageType = data.type as string;

    switch (messageType) {
      case 'message':
        this.recordMessage(sessionId);
        break;
      case 'tool_use': {
        const tool = data.tool as { name: string };
        if (tool?.name) {
          this.recordToolUse(sessionId, tool.name);
        }
        break;
      }
      case 'error': {
        const error = data.error as string;
        if (error) {
          this.recordError(sessionId, error);
        }
        break;
      }
      case 'complete':
        this.completeSession(sessionId);
        break;
    }
  }

  private handleFeatureStartedEvent(data: Record<string, unknown>): void {
    const featureId = data.featureId as string;
    if (featureId) {
      this.startSession(`feature:${featureId}`);
      this.emitMonitorEvent('feature:monitoring', { featureId });
    }
  }

  private handleFeatureEndedEvent(eventType: string, data: Record<string, unknown>): void {
    const featureId = data.featureId as string;
    if (!featureId) return;

    const sessionId = `feature:${featureId}`;
    const aborted = eventType === 'feature:stopped';

    this.completeSession(sessionId, aborted);

    if (eventType === 'feature:error') {
      const error = data.error as string;
      this.recordError(sessionId, error || 'Unknown error');
    }
  }

  private handleAutoModeStartedEvent(data: Record<string, unknown>): void {
    const featureId = data.featureId as string;
    if (featureId) {
      this.startSession(`auto-mode:${featureId}`);
      this.emitMonitorEvent('auto-mode:monitoring', { featureId });
    }
  }

  private handleAutoModeEndedEvent(eventType: string, data: Record<string, unknown>): void {
    const featureId = data.featureId as string;
    if (!featureId) return;

    const sessionId = `auto-mode:${featureId}`;
    const aborted = eventType === 'auto-mode:stopped';

    this.completeSession(sessionId, aborted);

    if (eventType === 'auto-mode:error') {
      const error = data.error as string;
      this.recordError(sessionId, error || 'Unknown error');
    }
  }

  private updateAverageResponseTime(duration: number): void {
    const successful = this.performanceMetrics.successfulRequests;
    const currentAvg = this.performanceMetrics.averageResponseTime;

    // Calculate moving average
    this.performanceMetrics.averageResponseTime =
      (currentAvg * (successful - 1) + duration) / successful;
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      // Clean up sessions older than 24 hours that are not running
      this.clearOldSessions(24 * 60 * 60 * 1000);

      // Check for stale sessions (running but no activity for timeout period)
      this.cleanupStaleSessions();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status !== 'running') continue;

      const lastActivity = new Date(session.lastActivityTime).getTime();
      const staleTime = now - lastActivity;

      if (staleTime > this.SESSION_TIMEOUT) {
        // Mark stale session as aborted
        session.status = 'aborted';
        session.endTime = new Date().toISOString();
        session.duration = now - new Date(session.startTime).getTime();
        this.performanceMetrics.failedRequests++;

        this.emitMonitorEvent('session:timeout', {
          sessionId,
          staleTime,
        });

        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[AgentMonitorService] Cleaned up ${cleaned} stale sessions`);
    }
  }

  private emitMonitorEvent(type: string, data: Record<string, unknown>): void {
    this.events.emit(`agent-monitor:${type}` as EventType, data);
  }
}
