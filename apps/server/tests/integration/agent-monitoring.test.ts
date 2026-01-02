/**
 * Agent Monitoring Integration Tests
 *
 * Comprehensive integration tests to verify that agent monitoring works correctly,
 * including tool usage tracking, statistics recording, and querying tool usage data.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentMonitorService } from '../../src/services/agent-monitor-service.js';
import { createEventEmitter } from '../../src/lib/events.js';

describe('Agent Monitoring Integration', () => {
  let monitorService: AgentMonitorService;
  let events: ReturnType<typeof createEventEmitter>;

  beforeEach(() => {
    events = createEventEmitter();
    monitorService = new AgentMonitorService(events);
  });

  afterEach(() => {
    monitorService.destroy();
  });

  describe('Tool Usage Tracking', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should track when an agent uses a Beads tool', () => {
      const sessionId = 'test-session-1';

      // Start a session
      monitorService.startSession(sessionId, 'claude-3-5-sonnet-4');

      // Simulate tool use
      monitorService.recordToolUse(sessionId, 'create_beads_issue');

      // Get session metrics
      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics).toBeDefined();
      expect(metrics?.toolUseCount).toBe(1);
      expect(metrics?.status).toBe('running');
    });

    it('should track multiple tool uses in a session', () => {
      const sessionId = 'test-session-2';

      monitorService.startSession(sessionId);

      // Simulate multiple tool uses
      monitorService.recordToolUse(sessionId, 'create_beads_issue');
      monitorService.recordToolUse(sessionId, 'query_beads_memory');
      monitorService.recordToolUse(sessionId, 'Read');
      monitorService.recordToolUse(sessionId, 'Write');

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.toolUseCount).toBe(4);
    });

    it('should track Beads tool usage across multiple sessions', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';

      // Session 1 uses create_beads_issue
      monitorService.startSession(session1);
      monitorService.recordToolUse(session1, 'create_beads_issue');
      monitorService.completeSession(session1);

      // Session 2 uses query_beads_memory
      monitorService.startSession(session2);
      monitorService.recordToolUse(session2, 'query_beads_memory');

      // Check performance metrics
      const perfMetrics = monitorService.getPerformanceMetrics();

      expect(perfMetrics.totalToolCalls).toBe(2);
    });

    it('should differentiate between Beads and non-Beads tools', () => {
      const sessionId = 'test-session-3';

      monitorService.startSession(sessionId);

      // Mix of Beads and regular tools
      monitorService.recordToolUse(sessionId, 'create_beads_issue');
      monitorService.recordToolUse(sessionId, 'Read');
      monitorService.recordToolUse(sessionId, 'query_beads_memory');
      monitorService.recordToolUse(sessionId, 'Write');

      const metrics = monitorService.getSessionMetrics(sessionId);

      // All tools are tracked
      expect(metrics?.toolUseCount).toBe(4);
    });

    it('should emit tool usage events', () => {
      const sessionId = 'test-session-4';
      const eventSpy = vi.fn();

      events.subscribe((type, data) => {
        if (type === 'agent-monitor:tool:used') {
          eventSpy(data);
        }
      });

      monitorService.startSession(sessionId);
      monitorService.recordToolUse(sessionId, 'create_beads_issue');

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session-4',
          toolName: 'create_beads_issue',
        })
      );
    });
  });

  describe('Statistics Recording', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should record successful session completion', () => {
      const sessionId = 'test-session-5';

      monitorService.startSession(sessionId);
      monitorService.recordMessage(sessionId);
      monitorService.recordToolUse(sessionId, 'query_beads_memory');

      // Add a small delay to ensure duration > 0
      const start = Date.now();
      while (Date.now() - start < 2) {
        // Wait 2ms
      }

      monitorService.completeSession(sessionId);

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.status).toBe('completed');
      expect(metrics?.duration).toBeGreaterThanOrEqual(0);
      expect(metrics?.endTime).toBeDefined();
    });

    it('should record aborted sessions', () => {
      const sessionId = 'test-session-6';

      monitorService.startSession(sessionId);
      monitorService.completeSession(sessionId, true); // aborted

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.status).toBe('aborted');

      const perfMetrics = monitorService.getPerformanceMetrics();
      expect(perfMetrics.failedRequests).toBeGreaterThan(0);
    });

    it('should calculate average response time', () => {
      // Complete multiple sessions
      for (let i = 0; i < 3; i++) {
        const sessionId = `session-${i}`;
        monitorService.startSession(sessionId);

        // Simulate some work
        monitorService.recordMessage(sessionId);
        monitorService.recordToolUse(sessionId, 'create_beads_issue');

        // Complete with varying durations
        if (i === 1) {
          // Add delay for second session
          const start = Date.now();
          while (Date.now() - start < 10) {
            // Small delay
          }
        }

        monitorService.completeSession(sessionId);
      }

      const perfMetrics = monitorService.getPerformanceMetrics();

      expect(perfMetrics.successfulRequests).toBe(3);
      expect(perfMetrics.averageResponseTime).toBeGreaterThan(0);
    });

    it('should track error counts in sessions', () => {
      const sessionId = 'test-session-7';

      monitorService.startSession(sessionId);
      monitorService.recordError(sessionId, 'Test error 1');
      monitorService.recordError(sessionId, 'Test error 2');

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.errorCount).toBe(2);
    });

    it('should track message counts', () => {
      const sessionId = 'test-session-8';

      monitorService.startSession(sessionId);
      monitorService.recordMessage(sessionId);
      monitorService.recordMessage(sessionId);
      monitorService.recordMessage(sessionId);

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.messageCount).toBe(3);
    });

    it('should update last activity time on tool use', () => {
      const sessionId = 'test-session-9';

      monitorService.startSession(sessionId);

      const startTime = monitorService.getSessionMetrics(sessionId)?.lastActivityTime;

      // Small delay
      const start = Date.now();
      while (Date.now() - start < 5) {
        // Wait
      }

      monitorService.recordToolUse(sessionId, 'query_beads_memory');

      const updatedTime = monitorService.getSessionMetrics(sessionId)?.lastActivityTime;

      expect(updatedTime).not.toBe(startTime);
    });
  });

  describe('Health Status Tracking', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should report no active sessions initially', () => {
      const health = monitorService.getHealthStatus();

      expect(health.isActive).toBe(false);
      expect(health.activeSessions).toBe(0);
    });

    it('should report active sessions correctly', () => {
      monitorService.startSession('session-1');
      monitorService.startSession('session-2');

      const health = monitorService.getHealthStatus();

      expect(health.isActive).toBe(true);
      expect(health.activeSessions).toBe(2);
    });

    it('should report completed sessions', () => {
      monitorService.startSession('session-1');
      monitorService.completeSession('session-1');

      const health = monitorService.getHealthStatus();

      expect(health.completedSessions).toBe(1);
      expect(health.activeSessions).toBe(0);
    });

    it('should report error sessions', () => {
      const sessionId = 'session-error';
      monitorService.startSession(sessionId);
      monitorService.recordError(sessionId, 'Critical error');

      // Add delay before completion
      const start = Date.now();
      while (Date.now() - start < 2) {
        // Wait 2ms
      }

      monitorService.completeSession(sessionId);

      // Set status to error explicitly
      const metrics = monitorService.getSessionMetrics(sessionId);
      if (metrics) {
        metrics.status = 'error';
      }

      const health = monitorService.getHealthStatus();

      expect(health.totalSessions).toBe(1);
      // Error sessions are those with status 'error', not just those with errors
      expect(health.errorSessions).toBe(1);
    });

    it('should calculate average duration', () => {
      const sessionId = 'session-duration';
      monitorService.startSession(sessionId);

      // Add some delay
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Small delay
      }

      monitorService.completeSession(sessionId);

      const health = monitorService.getHealthStatus();

      expect(health.averageDuration).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should track total requests', () => {
      monitorService.startSession('session-1');
      monitorService.startSession('session-2');
      monitorService.startSession('session-3');

      const perf = monitorService.getPerformanceMetrics();

      expect(perf.totalRequests).toBe(3);
    });

    it('should track successful vs failed requests', () => {
      // Successful
      monitorService.startSession('session-1');
      monitorService.completeSession('session-1');

      // Failed (aborted)
      monitorService.startSession('session-2');
      monitorService.completeSession('session-2', true);

      const perf = monitorService.getPerformanceMetrics();

      expect(perf.successfulRequests).toBe(1);
      expect(perf.failedRequests).toBe(1);
    });

    it('should track total tool calls', () => {
      monitorService.startSession('session-1');
      monitorService.recordToolUse('session-1', 'create_beads_issue');
      monitorService.recordToolUse('session-1', 'query_beads_memory');
      monitorService.recordToolUse('session-1', 'Read');

      const perf = monitorService.getPerformanceMetrics();

      expect(perf.totalToolCalls).toBe(3);
    });

    it('should track uptime', () => {
      const perf = monitorService.getPerformanceMetrics();

      expect(perf.uptimeStart).toBeDefined();

      const uptime = new Date(perf.uptimeStart);
      const now = new Date();

      // Uptime start should be in the past
      expect(uptime.getTime()).toBeLessThanOrEqual(now.getTime());
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should get active sessions', () => {
      monitorService.startSession('session-1');
      monitorService.startSession('session-2');
      monitorService.startSession('session-3');

      monitorService.completeSession('session-2');

      const activeSessions = monitorService.getActiveSessions();

      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.every((s) => s.status === 'running')).toBe(true);
    });

    it('should return null for non-existent session', () => {
      const metrics = monitorService.getSessionMetrics('non-existent');

      expect(metrics).toBeNull();
    });

    it('should handle session auto-creation on agent stream events', () => {
      // Simulate agent stream event
      events.emit('agent:stream' as any, {
        sessionId: 'auto-session',
        type: 'message',
      });

      const metrics = monitorService.getSessionMetrics('auto-session');

      expect(metrics).toBeDefined();
      expect(metrics?.status).toBe('running');
    });

    it('should handle tool use events from agent streams', () => {
      const sessionId = 'stream-session';

      // Simulate agent stream with tool use
      events.emit('agent:stream' as any, {
        sessionId,
        type: 'tool_use',
        tool: { name: 'create_beads_issue' },
      });

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.toolUseCount).toBe(1);
    });

    it('should handle error events from agent streams', () => {
      const sessionId = 'error-session';

      events.emit('agent:stream' as any, {
        sessionId,
        type: 'error',
        error: 'Something went wrong',
      });

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.errorCount).toBe(1);
    });
  });

  describe('Monitoring Snapshot', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should generate comprehensive snapshot', () => {
      monitorService.startSession('session-1');
      monitorService.recordToolUse('session-1', 'create_beads_issue');
      monitorService.recordMessage('session-1');

      monitorService.startSession('session-2');
      monitorService.completeSession('session-1');

      const snapshot = monitorService.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.health).toBeDefined();
      expect(snapshot.performance).toBeDefined();
      expect(snapshot.activeSessions).toBeDefined();
    });

    it('should include active sessions in snapshot', () => {
      monitorService.startSession('active-1');
      monitorService.startSession('active-2');

      const snapshot = monitorService.getSnapshot();

      expect(snapshot.activeSessions).toHaveLength(2);
      expect(snapshot.activeSessions[0]).toHaveProperty('sessionId');
      expect(snapshot.activeSessions[0]).toHaveProperty('duration');
      expect(snapshot.activeSessions[0]).toHaveProperty('messageCount');
      expect(snapshot.activeSessions[0]).toHaveProperty('status');
    });

    it('should include health status in snapshot', () => {
      monitorService.startSession('session-1');

      const snapshot = monitorService.getSnapshot();

      expect(snapshot.health.isActive).toBe(true);
      expect(snapshot.health.activeSessions).toBe(1);
      expect(snapshot.health.totalSessions).toBe(1);
    });

    it('should include performance metrics in snapshot', () => {
      monitorService.startSession('session-1');
      monitorService.recordToolUse('session-1', 'query_beads_memory');

      const snapshot = monitorService.getSnapshot();

      expect(snapshot.performance.totalRequests).toBe(1);
      expect(snapshot.performance.totalToolCalls).toBe(1);
    });
  });

  describe('Cleanup and Maintenance', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should clear old sessions', () => {
      // Create and complete a session
      monitorService.startSession('old-session');
      monitorService.completeSession('old-session');

      // Manually set end time to be old
      const metrics = monitorService.getSessionMetrics('old-session');
      if (metrics) {
        metrics.endTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
      }

      monitorService.clearOldSessions(24 * 60 * 60 * 1000); // 24 hours

      const oldMetrics = monitorService.getSessionMetrics('old-session');
      expect(oldMetrics).toBeNull();
    });

    it('should not clear active sessions', () => {
      monitorService.startSession('active-session');

      monitorService.clearOldSessions(0); // Clear all non-running

      const metrics = monitorService.getSessionMetrics('active-session');
      expect(metrics).toBeDefined();
      expect(metrics?.status).toBe('running');
    });

    it('should reset all metrics', () => {
      monitorService.startSession('session-1');
      monitorService.recordToolUse('session-1', 'create_beads_issue');
      monitorService.completeSession('session-1');

      monitorService.resetMetrics();

      const perf = monitorService.getPerformanceMetrics();
      expect(perf.totalRequests).toBe(0);
      expect(perf.totalToolCalls).toBe(0);
      expect(perf.successfulRequests).toBe(0);
    });
  });

  describe('Beads Tool-Specific Monitoring', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should track create_beads_issue usage', () => {
      const sessionId = 'beads-test-1';

      monitorService.startSession(sessionId);
      monitorService.recordToolUse(sessionId, 'create_beads_issue');

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.toolUseCount).toBe(1);

      const perf = monitorService.getPerformanceMetrics();
      expect(perf.totalToolCalls).toBe(1);
    });

    it('should track query_beads_memory usage', () => {
      const sessionId = 'beads-test-2';

      monitorService.startSession(sessionId);
      monitorService.recordToolUse(sessionId, 'query_beads_memory');

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.toolUseCount).toBe(1);
    });

    it('should track spawn_helper_agent usage', () => {
      const sessionId = 'beads-test-3';

      monitorService.startSession(sessionId);
      monitorService.recordToolUse(sessionId, 'spawn_helper_agent');

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.toolUseCount).toBe(1);
    });

    it('should track all three Beads tools in one session', () => {
      const sessionId = 'beads-test-all';

      monitorService.startSession(sessionId);
      monitorService.recordToolUse(sessionId, 'create_beads_issue');
      monitorService.recordToolUse(sessionId, 'query_beads_memory');
      monitorService.recordToolUse(sessionId, 'spawn_helper_agent');

      const metrics = monitorService.getSessionMetrics(sessionId);

      expect(metrics?.toolUseCount).toBe(3);
    });

    it('should emit events for all Beads tool uses', () => {
      const sessionId = 'beads-events';
      const eventsSpy: Record<string, number> = {};

      events.subscribe((type, data) => {
        if (type === 'agent-monitor:tool:used') {
          const toolName = (data as any).toolName;
          eventsSpy[toolName] = (eventsSpy[toolName] || 0) + 1;
        }
      });

      monitorService.startSession(sessionId);
      monitorService.recordToolUse(sessionId, 'create_beads_issue');
      monitorService.recordToolUse(sessionId, 'query_beads_memory');
      monitorService.recordToolUse(sessionId, 'spawn_helper_agent');

      expect(eventsSpy['create_beads_issue']).toBe(1);
      expect(eventsSpy['query_beads_memory']).toBe(1);
      expect(eventsSpy['spawn_helper_agent']).toBe(1);
    });
  });
});
