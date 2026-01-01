/**
 * Unit tests for BeadsLiveLinkService
 *
 * Tests the autonomous agent memory service that auto-creates Beads issues
 * from agent errors and requests with rate limiting and deduplication.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BeadsLiveLinkService } from '@/services/beads-live-link-service.js';
import type { BeadsIssue } from '@automaker/types';

describe('BeadsLiveLinkService', () => {
  let mockBeadsService: any;
  let mockEvents: any;
  let service: BeadsLiveLinkService;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockBeadsService = {
      validateBeadsInProject: vi.fn().mockResolvedValue({
        installed: true,
        initialized: true,
        canInitialize: false,
      }),
      initializeBeads: vi.fn().mockResolvedValue(undefined),
      createIssue: vi.fn().mockResolvedValue({ id: 'bd-test-1' }),
      searchIssues: vi.fn().mockResolvedValue([]),
      getIssue: vi.fn().mockResolvedValue(null),
    };

    // Store the actual callback so we can invoke it in tests
    let capturedCallback: any;
    mockEvents = {
      subscribe: vi.fn().mockImplementation((callback) => {
        capturedCallback = callback;
        return () => {};
      }),
      emit: vi.fn(),
      // Allow test code to access the callback
      _getCallback: () => capturedCallback,
    };

    service = new BeadsLiveLinkService(mockBeadsService, mockEvents, {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('should initialize successfully when Beads is installed', async () => {
      await service.initialize(testProjectPath);

      expect(mockBeadsService.validateBeadsInProject).toHaveBeenCalledWith(testProjectPath);
      expect(mockEvents.subscribe).toHaveBeenCalled();
      expect(mockBeadsService.initializeBeads).not.toHaveBeenCalled();
    });

    it('should initialize Beads if not initialized but can be', async () => {
      mockBeadsService.validateBeadsInProject.mockResolvedValue({
        installed: true,
        initialized: false,
        canInitialize: true,
      });

      await service.initialize(testProjectPath);

      expect(mockBeadsService.initializeBeads).toHaveBeenCalledWith(testProjectPath);
    });

    it('should not create issues if Beads is not installed', async () => {
      mockBeadsService.validateBeadsInProject.mockResolvedValue({
        installed: false,
        initialized: false,
        canInitialize: false,
      });

      await service.initialize(testProjectPath);

      expect(mockEvents.subscribe).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should unsubscribe and clear cache', async () => {
      const unsubscribe = vi.fn();
      mockEvents.subscribe.mockReturnValue(unsubscribe);

      await service.initialize(testProjectPath);
      service.shutdown();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('auto-create issues from agent errors', () => {
    beforeEach(async () => {
      await service.initialize(testProjectPath);
    });

    it('should create issue from agent error', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'TypeError: Cannot read property',
        description: 'Error details',
        type: 'bug',
        priority: 2,
        status: 'open',
        labels: ['auto-created', 'agent-error', 'medium'],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockBeadsService.createIssue.mockResolvedValue(mockIssue);

      // Simulate agent error event
      const callback = mockEvents._getCallback();
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-123',
        error: 'TypeError: Cannot read property "x" of undefined',
        message: {
          id: 'msg-1',
          content: 'Error occurred',
          timestamp: new Date().toISOString(),
        },
      });

      // Wait for async handling
      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          type: 'bug',
          priority: 2,
          labels: expect.arrayContaining(['auto-created', 'agent-error', 'medium']),
        })
      );
    });

    it('should assess error severity as critical', async () => {
      const callback = mockEvents._getCallback();
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-123',
        error: 'Segmentation fault',
        message: {
          id: 'msg-1',
          content: 'Fatal error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          priority: 0, // P0 for critical
          labels: expect.arrayContaining(['critical']),
        })
      );
    });

    it('should assess error severity as high', async () => {
      const callback = mockEvents._getCallback();
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-123',
        error: 'Authentication failed',
        message: {
          id: 'msg-1',
          content: 'Auth error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          priority: 1, // P1 for high
          labels: expect.arrayContaining(['high']),
        })
      );
    });

    it('should assess error severity as medium', async () => {
      const callback = mockEvents._getCallback();
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-123',
        error: 'TypeError: undefined is not a function',
        message: {
          id: 'msg-1',
          content: 'Type error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          priority: 2, // P2 for medium
          labels: expect.arrayContaining(['medium']),
        })
      );
    });

    it('should assess error severity as low by default', async () => {
      const callback = mockEvents._getCallback();
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-123',
        error: 'Warning: some warning message',
        message: {
          id: 'msg-1',
          content: 'Warning',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          priority: 3, // P3 for low
          labels: expect.arrayContaining(['low']),
        })
      );
    });
  });

  describe('rate limiting', () => {
    let callback: any;

    beforeEach(async () => {
      service = new BeadsLiveLinkService(mockBeadsService, mockEvents, {
        maxAutoIssuesPerHour: 20,
      });
      await service.initialize(testProjectPath);
      callback = mockEvents._getCallback(); // Capture callback AFTER service init
    });

    it('should allow creating issues up to the limit', async () => {
      // Create 20 issues
      for (let i = 0; i < 20; i++) {
        callback('agent:stream', {
          type: 'error',
          sessionId: `session-${i}`,
          error: `Error ${i}`,
          message: {
            id: `msg-${i}`,
            content: 'Error',
            timestamp: new Date().toISOString(),
          },
        });
      }

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(20);
    });

    it('should reject issue creation beyond rate limit', async () => {
      // Create 20 issues
      for (let i = 0; i < 20; i++) {
        callback('agent:stream', {
          type: 'error',
          sessionId: `session-${i}`,
          error: `Error ${i}`,
          message: {
            id: `msg-${i}`,
            content: 'Error',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // 21st issue should be rate limited
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-21',
        error: 'Error 21',
        message: {
          id: 'msg-21',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(20);
    });

    it('should reset rate limit after 1 hour', async () => {
      // Create 20 issues
      for (let i = 0; i < 20; i++) {
        callback('agent:stream', {
          type: 'error',
          sessionId: `session-${i}`,
          error: `Error ${i}`,
          message: {
            id: `msg-${i}`,
            content: 'Error',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Fast forward 1 hour
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Should allow more issues
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-21',
        error: 'Error 21',
        message: {
          id: 'msg-21',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(21);
    });
  });

  describe('deduplication', () => {
    let callback: any;

    beforeEach(async () => {
      service = new BeadsLiveLinkService(mockBeadsService, mockEvents, {
        enableDeduplication: true,
      });
      await service.initialize(testProjectPath);
      callback = mockEvents._getCallback(); // Capture callback AFTER service init
    });

    it('should detect and deduplicate same error', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Error',
        description: 'Error details',
        type: 'bug',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockBeadsService.createIssue.mockResolvedValue(mockIssue);
      // Make getIssue return the mock issue after it's created
      mockBeadsService.getIssue.mockResolvedValue(mockIssue);

      const errorMsg = 'TypeError: Cannot read property "x" of undefined';

      // First error - creates issue
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-1',
        error: errorMsg,
        message: {
          id: 'msg-1',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      // Second same error - should be deduplicated
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-2',
        error: errorMsg,
        message: {
          id: 'msg-2',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(1);
    });

    it('should normalize error for deduplication', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Error',
        description: 'Error details',
        type: 'bug',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockBeadsService.createIssue.mockResolvedValue(mockIssue);
      mockBeadsService.getIssue.mockResolvedValue(mockIssue);

      // First error with path
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-1',
        error: 'Error at /path/to/file.js:123',
        message: {
          id: 'msg-1',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      // Same error with different path - should be deduplicated
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-2',
        error: 'Error at /other/path/file.ts:456',
        message: {
          id: 'msg-2',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(1);
    });

    it('should expire deduplication cache after 24 hours', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Error',
        description: 'Error details',
        type: 'bug',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockBeadsService.createIssue.mockResolvedValue(mockIssue);

      const errorMsg = 'TypeError: Cannot read property';

      // First error
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-1',
        error: errorMsg,
        message: {
          id: 'msg-1',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      // Fast forward 24 hours
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

      // Same error - should create new issue since cache expired
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-2',
        error: errorMsg,
        message: {
          id: 'msg-2',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(2);
    });
  });

  describe('handle agent-requested issues', () => {
    let callback: any;

    beforeEach(async () => {
      await service.initialize(testProjectPath);
      callback = mockEvents._getCallback();
    });

    it('should create issue from agent request', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Implement feature X',
        description: 'Requested by agent',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: ['agent-requested', 'session:session-123'],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockBeadsService.createIssue.mockResolvedValue(mockIssue);

      callback('agent:stream', {
        type: 'request',
        request: 'create-issue',
        sessionId: 'session-123',
        title: 'Implement feature X',
        description: 'Need to implement feature X',
        issueType: 'feature',
        priority: 1,
      });

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          title: 'Implement feature X',
          description: 'Need to implement feature X',
          type: 'feature',
          priority: 1,
          labels: ['agent-requested', 'session:session-123'],
        })
      );
    });

    it('should use defaults for missing fields', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Task',
        description: 'Requested by agent in session session-123',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: ['agent-requested', 'session:session-123'],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockBeadsService.createIssue.mockResolvedValue(mockIssue);

      callback('agent:stream', {
        type: 'request',
        request: 'create-issue',
        sessionId: 'session-123',
        title: 'Task',
      });

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          type: 'task',
          priority: 2,
          labels: ['agent-requested', 'session:session-123'],
        })
      );
    });
  });

  describe('error description formatting', () => {
    let callback: any;

    beforeEach(async () => {
      await service.initialize(testProjectPath);
      callback = mockEvents._getCallback();
    });

    it('should format error description with context', async () => {
      const timestamp = '2024-01-15T10:30:00.000Z';

      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-123',
        error: 'TypeError: Cannot read property',
        message: {
          id: 'msg-1',
          content: 'Error occurred',
          timestamp,
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          description: expect.stringContaining('session-123'),
        })
      );
    });

    it('should extract error title', async () => {
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-123',
        error: 'TypeError: Cannot read property "x" of undefined\nStack trace...',
        message: {
          id: 'msg-1',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          title: 'TypeError: Cannot read property "x" of undefined',
        })
      );
    });

    it('should truncate long error titles', async () => {
      const longTitle = 'a'.repeat(100);

      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-123',
        error: longTitle,
        message: {
          id: 'msg-1',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      await vi.runAllTimersAsync();

      const callArgs = mockBeadsService.createIssue.mock.calls[0][1];
      expect(callArgs.title.length).toBeLessThanOrEqual(63); // 60 + '...'
      expect(callArgs.title).toMatch(/\.\.\.$/);
    });
  });

  describe('getStats', () => {
    it('should return service statistics', async () => {
      await service.initialize(testProjectPath);

      const stats = service.getStats();

      expect(stats).toHaveProperty('autoIssueCount');
      expect(stats).toHaveProperty('maxAutoIssuesPerHour');
      expect(stats).toHaveProperty('resetTime');
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('config');
      expect(stats.maxAutoIssuesPerHour).toBe(20);
    });
  });

  describe('configuration', () => {
    it('should use custom config values', () => {
      const customService = new BeadsLiveLinkService(mockBeadsService, mockEvents, {
        autoCreateOnErrors: false,
        autoCreateOnRequests: false,
        maxAutoIssuesPerHour: 10,
        enableDeduplication: false,
      });

      const stats = customService.getStats();

      expect(stats.config.autoCreateOnErrors).toBe(false);
      expect(stats.config.autoCreateOnRequests).toBe(false);
      expect(stats.config.maxAutoIssuesPerHour).toBe(10);
      expect(stats.config.enableDeduplication).toBe(false);
    });

    it('should not create errors when disabled', async () => {
      const customService = new BeadsLiveLinkService(mockBeadsService, mockEvents, {
        autoCreateOnErrors: false,
      });

      await customService.initialize(testProjectPath);

      const callback = mockEvents._getCallback();
      callback('agent:stream', {
        type: 'error',
        sessionId: 'session-123',
        error: 'Test error',
        message: {
          id: 'msg-1',
          content: 'Error',
          timestamp: new Date().toISOString(),
        },
      });

      expect(mockBeadsService.createIssue).not.toHaveBeenCalled();
    });
  });
});
