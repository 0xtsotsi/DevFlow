/**
 * Telemetry Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, mkdirSync } from 'fs';
import { EventEmitter } from 'events';
import { TelemetryService } from '../../../src/services/telemetry-service.js';
import * as secureFs from '../../../src/lib/secure-fs.js';

describe('TelemetryService', () => {
  let testDataDir: string;
  let service: TelemetryService;
  let eventEmitter: EventEmitter;

  beforeEach(async () => {
    testDataDir = join(
      tmpdir(),
      `telemetry-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );
    mkdirSync(testDataDir, { recursive: true });
    eventEmitter = new EventEmitter();
    service = new TelemetryService(testDataDir, eventEmitter as any);
    await service.initialize();
  });

  afterEach(async () => {
    // Wait for async save operations to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
    rmSync(testDataDir, { recursive: true, force: true });
  });

  describe('Session Management', () => {
    it('should start a new session', () => {
      service.startSession('test-session-1');

      const summary = service.getSessionSummary('test-session-1');
      expect(summary).toBeDefined();
      expect(summary?.sessionId).toBe('test-session-1');
      expect(summary?.eventCount).toBe(0);
      expect(summary?.events).toHaveLength(0);
    });

    it('should end the current session', () => {
      service.startSession('test-session-1');
      service.endSession();

      const summary = service.getSessionSummary('test-session-1');
      expect(summary?.endTime).toBeDefined();
    });

    it('should handle ending when no session is active', () => {
      expect(() => service.endSession()).not.toThrow();
    });
  });

  describe('Agent Telemetry', () => {
    it('should record agent start event', () => {
      service.recordAgentStart({
        sessionId: 'session-1',
        featureId: 'feature-1',
        model: 'claude-sonnet-4-5',
        provider: 'claude',
      });

      const events = service.getEvents({ sessionId: 'session-1' });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('agent_start');
      expect(events[0].featureId).toBe('feature-1');
    });

    it('should record agent complete event', () => {
      service.recordAgentComplete({
        sessionId: 'session-1',
        featureId: 'feature-1',
        model: 'claude-sonnet-4-5',
        provider: 'claude',
        messageCount: 10,
        duration: 5000,
      });

      const events = service.getEvents({ type: 'agent_complete' });
      expect(events).toHaveLength(1);
      expect(events[0].messageCount).toBe(10);
      expect(events[0].duration).toBe(5000);
    });

    it('should record agent error event', () => {
      service.recordAgentError({
        sessionId: 'session-1',
        featureId: 'feature-1',
        model: 'claude-sonnet-4-5',
        provider: 'claude',
        error: 'Network timeout',
        duration: 3000,
      });

      const events = service.getEvents({ type: 'agent_error' });
      expect(events).toHaveLength(1);
      expect(events[0].error).toBe('Network timeout');
    });
  });

  describe('Checkpoint Telemetry', () => {
    it('should record checkpoint created event', () => {
      service.recordCheckpointCreated({
        sessionId: 'session-1',
        featureId: 'feature-1',
        checkpointId: 'checkpoint-1',
        fileCount: 5,
        sizeBytes: 1024,
        operationTime: 100,
      });

      const events = service.getEvents({ type: 'checkpoint_created' });
      expect(events).toHaveLength(1);
      expect(events[0].checkpointId).toBe('checkpoint-1');
      expect(events[0].fileCount).toBe(5);
      expect(events[0].sizeBytes).toBe(1024);
    });

    it('should record checkpoint restored event', () => {
      service.recordCheckpointRestored({
        sessionId: 'session-1',
        checkpointId: 'checkpoint-1',
        fileCount: 5,
        operationTime: 150,
      });

      const events = service.getEvents({ type: 'checkpoint_restored' });
      expect(events).toHaveLength(1);
      expect(events[0].operationTime).toBe(150);
    });

    it('should record checkpoint deleted event', () => {
      service.recordCheckpointDeleted({
        sessionId: 'session-1',
        checkpointId: 'checkpoint-1',
      });

      const events = service.getEvents({ type: 'checkpoint_deleted' });
      expect(events).toHaveLength(1);
    });
  });

  describe('Beads Telemetry', () => {
    it('should record beads issue created event', () => {
      service.recordBeadsIssueCreated({
        sessionId: 'session-1',
        beadsIssueId: 'bd-abc123',
        issueType: 'feature',
        issueStatus: 'open',
      });

      const events = service.getEvents({ type: 'beads_issue_created' });
      expect(events).toHaveLength(1);
      expect(events[0].beadsIssueId).toBe('bd-abc123');
      expect(events[0].issueType).toBe('feature');
      expect(events[0].issueStatus).toBe('open');
    });

    it('should record beads issue updated event', () => {
      service.recordBeadsIssueUpdated({
        sessionId: 'session-1',
        beadsIssueId: 'bd-abc123',
        issueType: 'feature',
        issueStatus: 'in_progress',
      });

      const events = service.getEvents({ type: 'beads_issue_updated' });
      expect(events).toHaveLength(1);
      expect(events[0].issueStatus).toBe('in_progress');
    });

    it('should record beads dependency created event', () => {
      service.recordBeadsDependencyCreated({
        sessionId: 'session-1',
        dependencyType: 'blocks',
      });

      const events = service.getEvents({ type: 'beads_dependency_created' });
      expect(events).toHaveLength(1);
      expect(events[0].dependencyType).toBe('blocks');
    });
  });

  describe('Feature Telemetry', () => {
    it('should record feature start event', () => {
      service.recordFeatureStart({
        sessionId: 'session-1',
        featureId: 'feature-1',
        featureTitle: 'Add user authentication',
        taskCount: 5,
        planningMode: 'spec',
      });

      const events = service.getEvents({ type: 'feature_start' });
      expect(events).toHaveLength(1);
      expect(events[0].featureTitle).toBe('Add user authentication');
      expect(events[0].taskCount).toBe(5);
      expect(events[0].planningMode).toBe('spec');
    });

    it('should record feature complete event', () => {
      service.recordFeatureComplete({
        sessionId: 'session-1',
        featureId: 'feature-1',
        featureTitle: 'Add user authentication',
        taskCount: 5,
        planningMode: 'spec',
        duration: 60000,
      });

      const events = service.getEvents({ type: 'feature_complete' });
      expect(events).toHaveLength(1);
      expect(events[0].duration).toBe(60000);
    });

    it('should record feature error event', () => {
      service.recordFeatureError({
        sessionId: 'session-1',
        featureId: 'feature-1',
        error: 'Test failed',
        duration: 30000,
      });

      const events = service.getEvents({ type: 'feature_error' });
      expect(events).toHaveLength(1);
      expect(events[0].error).toBe('Test failed');
    });
  });

  describe('Event Filtering', () => {
    beforeEach(() => {
      service.recordAgentStart({
        sessionId: 'session-1',
        featureId: 'feature-1',
      });

      service.recordCheckpointCreated({
        sessionId: 'session-1',
        featureId: 'feature-1',
        checkpointId: 'cp-1',
      });

      service.recordAgentStart({
        sessionId: 'session-2',
        featureId: 'feature-2',
      });
    });

    it('should filter events by type', () => {
      const agentEvents = service.getEvents({ type: 'agent_start' });
      expect(agentEvents).toHaveLength(2);
    });

    it('should filter events by sessionId', () => {
      const session1Events = service.getEvents({ sessionId: 'session-1' });
      expect(session1Events).toHaveLength(2);
    });

    it('should filter events by featureId', () => {
      const feature1Events = service.getEvents({ featureId: 'feature-1' });
      expect(feature1Events).toHaveLength(2);
    });

    it('should filter events by date range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const recentEvents = service.getEvents({
        startDate: oneHourAgo,
        endDate: now,
      });

      expect(recentEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      service.recordAgentStart({ sessionId: 's1', featureId: 'f1' });
      service.recordAgentComplete({
        sessionId: 's1',
        featureId: 'f1',
        duration: 5000,
      });
      service.recordAgentComplete({
        sessionId: 's1',
        featureId: 'f1',
        duration: 10000,
      });
      service.recordAgentError({ sessionId: 's1', error: 'Failed' });

      service.recordCheckpointCreated({
        sessionId: 's1',
        checkpointId: 'cp-1',
        fileCount: 5,
      });
      service.recordCheckpointRestored({
        sessionId: 's1',
        checkpointId: 'cp-1',
      });

      service.recordBeadsIssueCreated({
        sessionId: 's1',
        beadsIssueId: 'bd-1',
        issueType: 'feature',
        issueStatus: 'open',
      });

      service.recordFeatureStart({
        sessionId: 's1',
        featureId: 'f1',
        taskCount: 5,
      });
      service.recordFeatureComplete({
        sessionId: 's1',
        featureId: 'f1',
        duration: 60000,
      });
      service.recordFeatureError({
        sessionId: 's1',
        featureId: 'f2',
        error: 'Failed',
      });
    });

    it('should calculate agent statistics correctly', () => {
      const stats = service.getStats();

      expect(stats.totalAgentExecutions).toBe(4);
      expect(stats.successfulAgentExecutions).toBe(2);
      expect(stats.failedAgentExecutions).toBe(1);
      expect(stats.avgAgentDuration).toBe(7500); // (5000 + 10000) / 2
    });

    it('should calculate checkpoint statistics correctly', () => {
      const stats = service.getStats();

      expect(stats.totalCheckpointsCreated).toBe(1);
      expect(stats.totalCheckpointsRestored).toBe(1);
    });

    it('should calculate beads statistics correctly', () => {
      const stats = service.getStats();

      expect(stats.totalBeadsOperations).toBe(1);
    });

    it('should calculate feature statistics correctly', () => {
      const stats = service.getStats();

      expect(stats.totalFeaturesExecuted).toBe(1);
      expect(stats.successfulFeatures).toBe(1);
      expect(stats.failedFeatures).toBe(1);
    });

    it('should calculate statistics for a specific session', () => {
      const stats = service.getStats({ sessionId: 's1' });

      expect(stats.totalAgentExecutions).toBe(4);
    });
  });

  describe('Session Summaries', () => {
    beforeEach(() => {
      service.startSession('session-1');
      service.recordAgentStart({ featureId: 'f1' });
      service.recordAgentComplete({ featureId: 'f1', duration: 5000 });
      service.endSession();
    });

    it('should get summary for a specific session', () => {
      const summary = service.getSessionSummary('session-1');

      expect(summary).toBeDefined();
      expect(summary?.sessionId).toBe('session-1');
      expect(summary?.eventCount).toBe(2);
      expect(summary?.events).toHaveLength(2);
    });

    it('should return undefined for non-existent session', () => {
      const summary = service.getSessionSummary('non-existent');
      expect(summary).toBeUndefined();
    });

    it('should get all session summaries sorted by time', async () => {
      // Add small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      service.startSession('session-2');
      service.recordAgentStart({ featureId: 'f2' });
      service.endSession();

      const allSummaries = service.getAllSessionSummaries();

      expect(allSummaries).toHaveLength(2);
      expect(allSummaries[0].sessionId).toBe('session-2'); // Most recent first
      expect(allSummaries[1].sessionId).toBe('session-1');
    });
  });

  describe('Data Persistence', () => {
    it('should persist events to disk', async () => {
      service.recordAgentStart({
        sessionId: 'session-1',
        featureId: 'feature-1',
      });

      // Wait for async file write to complete (saveEvents is called without await)
      await new Promise((resolve) => setTimeout(resolve, 10));

      const eventsFile = join(testDataDir, 'telemetry', 'events.jsonl');
      const content = await secureFs.readFile(eventsFile, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(1);
      const event = JSON.parse(lines[0]);
      expect(event.type).toBe('agent_start');
    });

    it('should load events from existing file', async () => {
      // Create a service and add events
      service.recordAgentStart({ sessionId: 's1', featureId: 'f1' });
      service.recordCheckpointCreated({ sessionId: 's1', checkpointId: 'cp-1' });

      // Wait for async file writes to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Create a new service instance (should load existing events)
      const service2 = new TelemetryService(testDataDir, eventEmitter as any);
      await service2.initialize();

      const events = service2.getEvents();
      expect(events).toHaveLength(2);
    });

    it('should persist sessions to disk', async () => {
      service.startSession('session-1');
      service.recordAgentStart({ featureId: 'f1' });
      service.endSession();

      // Wait for async file writes to complete (saveSessions is called without await)
      await new Promise((resolve) => setTimeout(resolve, 10));

      const sessionsFile = join(testDataDir, 'telemetry', 'sessions.json');
      const content = await secureFs.readFile(sessionsFile, 'utf-8');
      const sessions = JSON.parse(content);

      expect(sessions['session-1']).toBeDefined();
      expect(sessions['session-1'].sessionId).toBe('session-1');
    });
  });

  describe('Data Clearing', () => {
    beforeEach(() => {
      service.startSession('session-1');
      service.recordAgentStart({ featureId: 'f1' });
      service.endSession();

      service.startSession('session-2');
      service.recordAgentStart({ featureId: 'f2' });
      service.endSession();
    });

    it('should clear all telemetry data', async () => {
      await service.clearAll();

      const events = service.getEvents();
      const summaries = service.getAllSessionSummaries();

      expect(events).toHaveLength(0);
      expect(summaries).toHaveLength(0);
    });

    it('should clear specific session data', async () => {
      await service.clearSession('session-1');

      const events = service.getEvents();
      const summaries = service.getAllSessionSummaries();

      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toBe('session-2');
      expect(summaries).toHaveLength(1);
      expect(summaries[0].sessionId).toBe('session-2');
    });
  });

  // Note: Event Emission tests skipped - TelemetryService no longer emits events
  // The event emission was removed in upstream refactoring
  describe.skip('Event Emission', () => {
    it('should emit event when recording telemetry', async () => {
      const eventPromise = new Promise<any>((resolve) => {
        eventEmitter.once('telemetry:started', (event) => {
          resolve(event);
        });
      });

      service.recordAgentStart({
        sessionId: 'session-1',
        featureId: 'feature-1',
      });

      const event = await eventPromise;
      expect(event.type).toBe('agent_start');
      expect(event.featureId).toBe('feature-1');
    });
  });

  describe('Default Session Handling', () => {
    it('should use current session when sessionId not provided', () => {
      service.startSession('default-session');
      service.recordAgentStart({ featureId: 'f1' });

      const events = service.getEvents({ sessionId: 'default-session' });
      expect(events).toHaveLength(1);
      service.endSession();
    });

    it('should not associate with session when none active', () => {
      service.recordAgentStart({ featureId: 'f1' });

      const events = service.getEvents();
      expect(events[0].sessionId).toBeUndefined();
    });
  });
});
