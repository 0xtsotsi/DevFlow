import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentMonitorService } from '@/services/agent-monitor-service.js';

describe('AgentMonitorService', () => {
  let mockEvents: any;
  let monitorService: AgentMonitorService;
  let emittedEvents: Array<{ type: string; data: Record<string, unknown> }>;

  beforeEach(() => {
    emittedEvents = [];

    // Create mock event emitter
    mockEvents = {
      emit: vi.fn((type: string, data: unknown) => {
        emittedEvents.push({ type, data } as { type: string; data: Record<string, unknown> });
      }),
      subscribe: vi.fn((callback: any) => {
        // Store callback to simulate events
        mockEvents.callback = callback;
        return () => {}; // Unsubscribe function
      }),
    };

    monitorService = new AgentMonitorService(mockEvents);
  });

  afterEach(() => {
    monitorService.destroy();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await monitorService.initialize();

      expect(mockEvents.subscribe).toHaveBeenCalled();
      // Events are emitted when sessions are created, not during initialization
    });

    it('should track uptime start time', async () => {
      await monitorService.initialize();

      const metrics = monitorService.getPerformanceMetrics();
      expect(metrics.uptimeStart).toBeDefined();

      const uptimeStart = new Date(metrics.uptimeStart);
      expect(uptimeStart.getTime()).toBeLessThanOrEqual(Date.now());
      expect(uptimeStart.getTime()).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('session management', () => {
    it('should start a new session', async () => {
      await monitorService.initialize();

      monitorService.startSession('test-session-1', 'claude-sonnet-4');

      const session = monitorService.getSessionMetrics('test-session-1');
      expect(session).toBeDefined();
      expect(session?.sessionId).toBe('test-session-1');
      expect(session?.status).toBe('running');
      expect(session?.model).toBe('claude-sonnet-4');
      expect(session?.messageCount).toBe(0);
      expect(session?.toolUseCount).toBe(0);
      expect(session?.errorCount).toBe(0);
    });

    it('should start a session without a model', async () => {
      await monitorService.initialize();

      monitorService.startSession('test-session-2');

      const session = monitorService.getSessionMetrics('test-session-2');
      expect(session?.model).toBeUndefined();
    });

    it('should track multiple sessions independently', async () => {
      await monitorService.initialize();

      monitorService.startSession('session-1');
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 2));
      monitorService.startSession('session-2');

      const session1 = monitorService.getSessionMetrics('session-1');
      const session2 = monitorService.getSessionMetrics('session-2');

      expect(session1?.sessionId).toBe('session-1');
      expect(session2?.sessionId).toBe('session-2');
      expect(session1?.startTime).not.toBe(session2?.startTime);
    });
  });

  describe('metrics tracking', () => {
    beforeEach(async () => {
      await monitorService.initialize();
      monitorService.startSession('test-session');
    });

    it('should record messages', () => {
      monitorService.recordMessage('test-session');

      const session = monitorService.getSessionMetrics('test-session');
      expect(session?.messageCount).toBe(1);

      monitorService.recordMessage('test-session');
      expect(session?.messageCount).toBe(2);
    });

    it('should record tool uses', () => {
      monitorService.recordToolUse('test-session', 'read_file');

      const session = monitorService.getSessionMetrics('test-session');
      expect(session?.toolUseCount).toBe(1);

      monitorService.recordToolUse('test-session', 'write_file');
      expect(session?.toolUseCount).toBe(2);
    });

    it('should track total tool calls in performance metrics', () => {
      monitorService.recordToolUse('test-session', 'read_file');
      monitorService.recordToolUse('test-session', 'write_file');

      const metrics = monitorService.getPerformanceMetrics();
      expect(metrics.totalToolCalls).toBe(2);
    });

    it('should record errors', () => {
      monitorService.recordError('test-session', 'Test error');

      const session = monitorService.getSessionMetrics('test-session');
      expect(session?.errorCount).toBe(1);

      monitorService.recordError('test-session', 'Another error');
      expect(session?.errorCount).toBe(2);
    });

    it('should update last activity time on any event', () => {
      const session = monitorService.getSessionMetrics('test-session');
      const initialTime = session?.lastActivityTime!;

      // Wait a bit to ensure time difference
      setTimeout(() => {
        monitorService.recordMessage('test-session');

        const updatedSession = monitorService.getSessionMetrics('test-session');
        expect(updatedSession?.lastActivityTime).not.toBe(initialTime);
      }, 10);
    });
  });

  describe('session completion', () => {
    beforeEach(async () => {
      await monitorService.initialize();
      monitorService.startSession('test-session');
    });

    it('should complete a session successfully', async () => {
      await new Promise((resolve) => setTimeout(resolve, 2)); // Ensure measurable duration
      monitorService.completeSession('test-session');

      const session = monitorService.getSessionMetrics('test-session');
      expect(session?.status).toBe('completed');
      expect(session?.endTime).toBeDefined();
      expect(session?.duration).toBeDefined();
      expect(session?.duration).toBeGreaterThan(0);
    });

    it('should mark session as aborted', () => {
      monitorService.completeSession('test-session', true);

      const session = monitorService.getSessionMetrics('test-session');
      expect(session?.status).toBe('aborted');
    });

    it('should update performance metrics on completion', () => {
      const initialMetrics = monitorService.getPerformanceMetrics();
      const initialSuccessful = initialMetrics.successfulRequests;

      monitorService.completeSession('test-session');

      const updatedMetrics = monitorService.getPerformanceMetrics();
      expect(updatedMetrics.successfulRequests).toBe(initialSuccessful + 1);
    });

    it('should update performance metrics on abort', () => {
      monitorService.completeSession('test-session', true);

      const metrics = monitorService.getPerformanceMetrics();
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
    });

    it('should calculate average response time', async () => {
      monitorService.startSession('test-session');
      await new Promise((resolve) => setTimeout(resolve, 2));
      monitorService.completeSession('test-session');

      const metrics = monitorService.getPerformanceMetrics();
      expect(metrics.averageResponseTime).toBeGreaterThan(0);

      // Start and complete another session
      monitorService.startSession('test-session-2');
      await new Promise((resolve) => setTimeout(resolve, 2));
      monitorService.completeSession('test-session-2');

      const updatedMetrics = monitorService.getPerformanceMetrics();
      expect(updatedMetrics.averageResponseTime).toBeDefined();
    });

    it('should not complete non-existent session', () => {
      const session = monitorService.getSessionMetrics('non-existent');
      expect(session).toBeNull();

      // Should not throw
      monitorService.completeSession('non-existent');
    });
  });

  describe('health status', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should report inactive when no sessions', () => {
      const health = monitorService.getHealthStatus();

      expect(health.isActive).toBe(false);
      expect(health.activeSessions).toBe(0);
      expect(health.totalSessions).toBe(0);
    });

    it('should report active when sessions are running', () => {
      monitorService.startSession('active-session');

      const health = monitorService.getHealthStatus();

      expect(health.isActive).toBe(true);
      expect(health.activeSessions).toBe(1);
      expect(health.totalSessions).toBe(1);
    });

    it('should track completed sessions', () => {
      monitorService.startSession('completed-session');
      monitorService.completeSession('completed-session');

      const health = monitorService.getHealthStatus();

      expect(health.completedSessions).toBe(1);
      expect(health.activeSessions).toBe(0);
    });

    it('should track aborted sessions', () => {
      monitorService.startSession('aborted-session');
      monitorService.completeSession('aborted-session', true);

      const health = monitorService.getHealthStatus();

      expect(health.abortedSessions).toBe(1);
      expect(health.activeSessions).toBe(0);
    });

    it('should track error sessions', () => {
      monitorService.startSession('error-session');
      monitorService.recordError('error-session', 'Test error');

      // Simulate error status by checking error count
      const session = monitorService.getSessionMetrics('error-session');
      expect(session?.errorCount).toBe(1);
    });

    it('should calculate average duration', async () => {
      monitorService.startSession('session-1');
      await new Promise((resolve) => setTimeout(resolve, 2));
      monitorService.completeSession('session-1');

      monitorService.startSession('session-2');
      await new Promise((resolve) => setTimeout(resolve, 2));
      monitorService.completeSession('session-2');

      const health = monitorService.getHealthStatus();
      expect(health.averageDuration).toBeGreaterThan(0);
    });
  });

  describe('performance metrics', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should track total requests', () => {
      expect(monitorService.getPerformanceMetrics().totalRequests).toBe(0);

      monitorService.startSession('session-1');
      expect(monitorService.getPerformanceMetrics().totalRequests).toBe(1);

      monitorService.startSession('session-2');
      expect(monitorService.getPerformanceMetrics().totalRequests).toBe(2);
    });

    it('should return immutable performance metrics', () => {
      monitorService.startSession('session-1');

      const metrics1 = monitorService.getPerformanceMetrics();
      const metrics2 = monitorService.getPerformanceMetrics();

      expect(metrics1).toEqual(metrics2);
      expect(metrics1).not.toBe(metrics2); // Different reference
    });
  });

  describe('active sessions', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should return empty array when no active sessions', () => {
      const activeSessions = monitorService.getActiveSessions();

      expect(activeSessions).toEqual([]);
      expect(Array.isArray(activeSessions)).toBe(true);
    });

    it('should return running sessions only', () => {
      monitorService.startSession('running-1');
      monitorService.startSession('running-2');
      monitorService.startSession('completed-1');
      monitorService.completeSession('completed-1');

      const activeSessions = monitorService.getActiveSessions();

      expect(activeSessions.length).toBe(2);
      expect(activeSessions.every((s) => s.status === 'running')).toBe(true);
      expect(activeSessions.map((s) => s.sessionId).sort()).toEqual(['running-1', 'running-2']);
    });
  });

  describe('monitoring snapshot', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should include timestamp', () => {
      const snapshot = monitorService.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      const timestamp = new Date(snapshot.timestamp);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should include health status', () => {
      monitorService.startSession('test-session');

      const snapshot = monitorService.getSnapshot();

      expect(snapshot.health).toBeDefined();
      expect(snapshot.health.totalSessions).toBe(1);
    });

    it('should include performance metrics', () => {
      const snapshot = monitorService.getSnapshot();

      expect(snapshot.performance).toBeDefined();
      expect(snapshot.performance.uptimeStart).toBeDefined();
    });

    it('should include active sessions', () => {
      monitorService.startSession('active-1');
      monitorService.startSession('active-2');

      const snapshot = monitorService.getSnapshot();

      expect(snapshot.activeSessions).toBeDefined();
      expect(snapshot.activeSessions.length).toBe(2);
      expect(snapshot.activeSessions[0]).toMatchObject({
        sessionId: expect.any(String),
        duration: expect.any(Number),
        messageCount: expect.any(Number),
        status: 'running',
      });
    });
  });

  describe('session cleanup', () => {
    beforeEach(async () => {
      await monitorService.initialize();
    });

    it('should clear old sessions', () => {
      monitorService.startSession('old-session');
      monitorService.completeSession('old-session');

      // Modify session to make it appear old
      const session = monitorService.getSessionMetrics('old-session');
      if (session) {
        session.endTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
      }

      monitorService.clearOldSessions(24 * 60 * 60 * 1000); // 24 hours

      const oldSession = monitorService.getSessionMetrics('old-session');
      expect(oldSession).toBeNull();
    });

    it('should not clear running sessions', () => {
      monitorService.startSession('running-session');

      monitorService.clearOldSessions(0); // Clear all old sessions

      const runningSession = monitorService.getSessionMetrics('running-session');
      expect(runningSession).toBeDefined();
      expect(runningSession?.status).toBe('running');
    });

    it('should not clear recent completed sessions', () => {
      monitorService.startSession('recent-session');
      monitorService.completeSession('recent-session');

      monitorService.clearOldSessions(24 * 60 * 60 * 1000); // 24 hours

      const recentSession = monitorService.getSessionMetrics('recent-session');
      expect(recentSession).toBeDefined();
    });
  });

  describe('metrics reset', () => {
    beforeEach(async () => {
      await monitorService.initialize();
      monitorService.startSession('session-1');
      monitorService.completeSession('session-1');
    });

    it('should reset all metrics', () => {
      monitorService.resetMetrics();

      const metrics = monitorService.getPerformanceMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
      expect(metrics.totalToolCalls).toBe(0);
    });

    it('should clear all sessions', () => {
      monitorService.resetMetrics();

      const session = monitorService.getSessionMetrics('session-1');
      expect(session).toBeNull();

      const activeSessions = monitorService.getActiveSessions();
      expect(activeSessions).toEqual([]);
    });

    it('should update uptime start time', () => {
      const oldUptimeStart = monitorService.getPerformanceMetrics().uptimeStart;

      // Wait a bit
      setTimeout(() => {
        monitorService.resetMetrics();

        const newUptimeStart = monitorService.getPerformanceMetrics().uptimeStart;

        expect(newUptimeStart).not.toBe(oldUptimeStart);
      }, 10);
    });

    it('should emit metrics reset event', () => {
      monitorService.resetMetrics();

      const resetEvent = emittedEvents.find((e) => e.type === 'monitor:metrics:reset');
      expect(resetEvent).toBeDefined();
    });
  });

  describe('event handling', () => {
    it('should handle agent:stream message events', async () => {
      await monitorService.initialize();

      const eventData = {
        sessionId: 'stream-session',
        type: 'message',
        message: { id: 'msg-1', content: 'Hello' },
      };

      // Simulate event callback
      if (mockEvents.callback) {
        mockEvents.callback('agent:stream', eventData);
      }

      const session = monitorService.getSessionMetrics('stream-session');
      expect(session).toBeDefined();
      expect(session?.messageCount).toBe(1);
    });

    it('should handle agent:stream tool_use events', async () => {
      await monitorService.initialize();

      const eventData = {
        sessionId: 'tool-session',
        type: 'tool_use',
        tool: { name: 'read_file', input: { path: '/test' } },
      };

      if (mockEvents.callback) {
        mockEvents.callback('agent:stream', eventData);
      }

      const session = monitorService.getSessionMetrics('tool-session');
      expect(session?.toolUseCount).toBe(1);
    });

    it('should handle agent:stream error events', async () => {
      await monitorService.initialize();

      const eventData = {
        sessionId: 'error-session',
        type: 'error',
        error: 'Test error',
      };

      if (mockEvents.callback) {
        mockEvents.callback('agent:stream', eventData);
      }

      const session = monitorService.getSessionMetrics('error-session');
      expect(session?.errorCount).toBe(1);
    });

    it('should handle agent:stream complete events', async () => {
      await monitorService.initialize();

      const eventData = {
        sessionId: 'complete-session',
        type: 'complete',
        content: 'Done',
      };

      if (mockEvents.callback) {
        mockEvents.callback('agent:stream', eventData);
      }

      const session = monitorService.getSessionMetrics('complete-session');
      expect(session?.status).toBe('completed');
      expect(session?.endTime).toBeDefined();
    });

    it('should handle feature:started events', async () => {
      await monitorService.initialize();

      const eventData = {
        featureId: 'feature-123',
      };

      if (mockEvents.callback) {
        mockEvents.callback('feature:started', eventData);
      }

      const session = monitorService.getSessionMetrics('feature:feature-123');
      expect(session).toBeDefined();
      expect(session?.status).toBe('running');
    });

    it('should handle feature:completed events', async () => {
      await monitorService.initialize();

      // Start the feature session first
      const startEventData = { featureId: 'feature-456' };
      if (mockEvents.callback) {
        mockEvents.callback('feature:started', startEventData);
      }

      // Complete it
      const completeEventData = { featureId: 'feature-456' };
      if (mockEvents.callback) {
        mockEvents.callback('feature:completed', completeEventData);
      }

      const session = monitorService.getSessionMetrics('feature:feature-456');
      expect(session?.status).toBe('completed');
    });

    it('should handle auto-mode:started events', async () => {
      await monitorService.initialize();

      const eventData = {
        featureId: 'auto-feature-1',
      };

      if (mockEvents.callback) {
        mockEvents.callback('auto-mode:started', eventData);
      }

      const session = monitorService.getSessionMetrics('auto-mode:auto-feature-1');
      expect(session).toBeDefined();
      expect(session?.status).toBe('running');
    });

    it('should handle auto-mode:stopped events', async () => {
      await monitorService.initialize();

      const startEventData = { featureId: 'auto-feature-2' };
      if (mockEvents.callback) {
        mockEvents.callback('auto-mode:started', startEventData);
      }

      const stopEventData = { featureId: 'auto-feature-2' };
      if (mockEvents.callback) {
        mockEvents.callback('auto-mode:stopped', stopEventData);
      }

      const session = monitorService.getSessionMetrics('auto-mode:auto-feature-2');
      expect(session?.status).toBe('aborted');
    });
  });

  describe('cleanup and destruction', () => {
    it('should cleanup on destroy', async () => {
      await monitorService.initialize();
      monitorService.startSession('test-session');

      monitorService.destroy();

      const session = monitorService.getSessionMetrics('test-session');
      expect(session).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle recording events for non-existent session', async () => {
      await monitorService.initialize();

      // Should not throw
      monitorService.recordMessage('non-existent');
      monitorService.recordToolUse('non-existent', 'test_tool');
      monitorService.recordError('non-existent', 'Test error');

      // Session should not be created
      const session = monitorService.getSessionMetrics('non-existent');
      expect(session).toBeNull();
    });

    it('should handle multiple rapid events', async () => {
      await monitorService.initialize();
      monitorService.startSession('rapid-session');

      // Record many events rapidly
      for (let i = 0; i < 100; i++) {
        monitorService.recordMessage('rapid-session');
        monitorService.recordToolUse('rapid-session', `tool_${i}`);
      }

      const session = monitorService.getSessionMetrics('rapid-session');
      expect(session?.messageCount).toBe(100);
      expect(session?.toolUseCount).toBe(100);
    });

    it('should handle sessions with no events before completion', async () => {
      await monitorService.initialize();
      monitorService.startSession('empty-session');

      monitorService.completeSession('empty-session');

      const session = monitorService.getSessionMetrics('empty-session');
      expect(session?.messageCount).toBe(0);
      expect(session?.toolUseCount).toBe(0);
      expect(session?.errorCount).toBe(0);
      expect(session?.status).toBe('completed');
    });
  });
});
