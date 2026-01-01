/**
 * Unit tests for BeadsMemoryService
 *
 * Tests the autonomous agent memory service that queries past Beads issues
 * for context, decision extraction, and semantic search.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BeadsMemoryService } from '@/services/beads-memory-service.js';
import type { BeadsIssue } from '@automaker/types';

describe('BeadsMemoryService', () => {
  let mockBeadsService: any;
  let mockMcpBridge: any;
  let service: BeadsMemoryService;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockBeadsService = {
      searchIssues: vi.fn().mockResolvedValue([]),
      getIssue: vi.fn(),
      getDependencies: vi.fn().mockResolvedValue({
        blockedBy: [],
        blocks: [],
        dependsOn: [],
      }),
    };

    mockMcpBridge = {
      isAvailable: vi.fn().mockReturnValue(false),
      callTool: vi.fn(),
    };

    service = new BeadsMemoryService(mockBeadsService, mockMcpBridge);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('queryRelevantContext', () => {
    it('should query context by keywords', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Fix authentication bug',
          description: 'Login fails',
          type: 'bug',
          priority: 1,
          status: 'open',
          labels: ['auth', 'bug'],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-2',
          title: 'Add user profile feature',
          description: 'User profile page',
          type: 'feature',
          priority: 2,
          status: 'open',
          labels: ['feature'],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(
        testProjectPath,
        'Fix login authentication'
      );

      expect(mockBeadsService.searchIssues).toHaveBeenCalled();
      expect(context.relatedBugs).toHaveLength(1);
      expect(context.relatedBugs[0].id).toBe('bd-1');
      expect(context.relatedFeatures).toHaveLength(1);
      expect(context.relatedFeatures[0].id).toBe('bd-2');
    });

    it('should categorize issues by type', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Bug 1',
          description: 'Bug description',
          type: 'bug',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-2',
          title: 'Feature 1',
          description: 'Feature description',
          type: 'feature',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-3',
          title: 'Epic 1',
          description: 'Epic description',
          type: 'epic',
          priority: 1,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-4',
          title: 'Task 1',
          description: 'Task description',
          type: 'task',
          priority: 3,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      expect(context.relatedBugs).toHaveLength(1);
      expect(context.relatedBugs[0].type).toBe('bug');
      expect(context.relatedFeatures).toHaveLength(2); // feature + epic
      expect(context.relatedFeatures[0].type).toBe('feature');
      expect(context.relatedFeatures[1].type).toBe('epic');
    });

    it('should filter by status based on options', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Open issue',
          description: 'Open',
          type: 'bug',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-2',
          title: 'Closed issue',
          description: 'Closed',
          type: 'bug',
          priority: 2,
          status: 'closed',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-3',
          title: 'In progress issue',
          description: 'In progress',
          type: 'bug',
          priority: 2,
          status: 'in_progress',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      // Exclude closed issues
      const context1 = await service.queryRelevantContext(testProjectPath, 'Task', {
        includeClosed: false,
      });

      expect(context1.relatedBugs).toHaveLength(2);
      expect(context1.relatedBugs.every((i) => i.status !== 'closed')).toBe(true);

      // Exclude in-progress issues
      const context2 = await service.queryRelevantContext(testProjectPath, 'Task', {
        includeInProgress: false,
      });

      expect(context2.relatedBugs.every((i) => i.status !== 'in_progress')).toBe(true);
    });

    it('should find similar issues with semantic search', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Fix authentication login bug',
          description: 'Users cannot login',
          type: 'bug',
          priority: 1,
          status: 'open',
          labels: ['auth', 'login'],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-2',
          title: 'Update user profile',
          description: 'Profile updates',
          type: 'feature',
          priority: 2,
          status: 'open',
          labels: ['profile'],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(
        testProjectPath,
        'Fix user authentication and login issues'
      );

      // bd-1 should be more similar (matches "authentication" and "login")
      expect(context.similarIssues.length).toBeGreaterThan(0);
      expect(context.similarIssues[0].id).toBe('bd-1');
    });

    it('should respect cache TTL', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Issue',
          description: 'Description',
          type: 'bug',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      // First call
      const context1 = await service.queryRelevantContext(testProjectPath, 'Task');
      expect(mockBeadsService.searchIssues).toHaveBeenCalledTimes(1);

      // Second call within cache TTL - should hit cache
      const context2 = await service.queryRelevantContext(testProjectPath, 'Task');
      expect(mockBeadsService.searchIssues).toHaveBeenCalledTimes(1);

      expect(context2).toEqual(context1);

      // Fast forward past cache TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Third call - should miss cache
      const context3 = await service.queryRelevantContext(testProjectPath, 'Task');
      expect(mockBeadsService.searchIssues).toHaveBeenCalledTimes(2);
    });
  });

  describe('extractDecisions', () => {
    it('should extract decisions from closed issues', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Closed issue',
          description: 'We decided to use option A.\nDecision: Use PostgreSQL for database.',
          type: 'bug',
          priority: 2,
          status: 'closed',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Database decision');

      expect(context.pastDecisions).toHaveLength(1);
      expect(context.pastDecisions[0].decision).toContain('PostgreSQL');
      expect(context.pastDecisions[0].issue.id).toBe('bd-1');
    });

    it('should find decision with resolution marker', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Issue',
          description: 'Resolution: Implement using Redux',
          type: 'bug',
          priority: 2,
          status: 'closed',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'State management');

      expect(context.pastDecisions).toHaveLength(1);
      expect(context.pastDecisions[0].decision).toContain('Redux');
    });

    it('should find decision with solution marker', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Issue',
          description: 'Solution: Use async/await pattern',
          type: 'bug',
          priority: 2,
          status: 'closed',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Async pattern');

      expect(context.pastDecisions).toHaveLength(1);
      expect(context.pastDecisions[0].decision).toContain('async/await');
    });

    it('should limit decision length', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Issue',
          description: 'Decision: ' + 'a'.repeat(1000),
          type: 'bug',
          priority: 2,
          status: 'closed',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      expect(context.pastDecisions[0].decision.length).toBeLessThanOrEqual(500);
    });

    it('should limit to 5 decisions', async () => {
      const mockIssues: BeadsIssue[] = Array.from({ length: 10 }, (_, i) => ({
        id: `bd-${i}`,
        title: `Issue ${i}`,
        description: `Decision: Decision ${i}`,
        type: 'bug',
        priority: 2,
        status: 'closed',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      }));

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      expect(context.pastDecisions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('findBlockingIssues', () => {
    it('should identify blocking issues', async () => {
      const blockingIssue: BeadsIssue = {
        id: 'bd-blocker',
        title: 'Blocking issue',
        description: 'Blocks work',
        type: 'bug',
        priority: 0,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Blocked issue',
          description: 'Blocked by bd-blocker',
          type: 'task',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);
      mockBeadsService.getDependencies.mockResolvedValue({
        blockedBy: ['bd-blocker'],
        blocks: [],
        dependsOn: [],
      });
      mockBeadsService.getIssue.mockResolvedValue(blockingIssue);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      expect(context.blockedBy).toHaveLength(1);
      expect(context.blockedBy[0].id).toBe('bd-1');
    });

    it('should ignore closed blockers', async () => {
      const closedBlocker: BeadsIssue = {
        id: 'bd-blocker',
        title: 'Closed blocker',
        description: 'Was blocking',
        type: 'bug',
        priority: 0,
        status: 'closed',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Issue',
          description: 'Description',
          type: 'task',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);
      mockBeadsService.getDependencies.mockResolvedValue({
        blockedBy: ['bd-blocker'],
        blocks: [],
        dependsOn: [],
      });
      mockBeadsService.getIssue.mockResolvedValue(closedBlocker);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      expect(context.blockedBy).toHaveLength(0);
    });

    it('should limit to 5 blocking issues', async () => {
      const mockIssues: BeadsIssue[] = Array.from({ length: 10 }, (_, i) => ({
        id: `bd-${i}`,
        title: `Issue ${i}`,
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      }));

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);
      mockBeadsService.getDependencies.mockResolvedValue({
        blockedBy: ['blocker'],
        blocks: [],
        dependsOn: [],
      });
      mockBeadsService.getIssue.mockResolvedValue({
        id: 'blocker',
        title: 'Blocker',
        description: 'Blocking',
        type: 'bug',
        priority: 0,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      });

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      expect(context.blockedBy.length).toBeLessThanOrEqual(5);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate token count accurately', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Issue with 100 char title and 400 char description',
          description: 'a'.repeat(400),
          type: 'bug',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-2',
          title: 'Feature',
          description: 'b'.repeat(200),
          type: 'feature',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      // Total chars: ~100 + 400 + 50 + 200 = 750
      // Estimated tokens: 750 / 4 = ~188
      expect(context.totalTokenEstimate).toBeGreaterThan(150);
      expect(context.totalTokenEstimate).toBeLessThan(250);
    });
  });

  describe('generateSummary', () => {
    it('should use Exa MCP when available', async () => {
      mockMcpBridge.isAvailable.mockReturnValue(true);
      mockMcpBridge.callTool.mockResolvedValue({
        success: true,
        data: [
          {
            title: 'Best Practices',
            url: 'https://example.com/practices',
            snippet: 'Implementation guide',
          },
        ],
      });

      const mockIssues: BeadsIssue[] = [];
      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(
        testProjectPath,
        'Implement authentication'
      );

      expect(mockMcpBridge.callTool).toHaveBeenCalledWith(
        'mcp__exa__web_search_exa',
        expect.objectContaining({
          query: expect.stringContaining('best practices'),
        })
      );
      expect(context.summary).toContain('Best Practices');
    });

    it('should fall back to basic summary when MCP unavailable', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Related bug',
          description: 'Bug description',
          type: 'bug',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      expect(context.summary).toContain('Memory Context');
      expect(context.summary).toContain('Related Bugs');
      expect(mockMcpBridge.callTool).not.toHaveBeenCalled();
    });

    it('should include token warning for large context', async () => {
      const mockIssues: BeadsIssue[] = Array.from({ length: 10 }, (_, i) => ({
        id: `bd-${i}`,
        title: 'a'.repeat(100),
        description: 'b'.repeat(1000),
        type: 'bug',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      }));

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      expect(context.summary).toContain('Warning');
      expect(context.summary).toContain('tokens');
    });
  });

  describe('extractKeywords', () => {
    it('should extract meaningful keywords', async () => {
      const mockIssues: BeadsIssue[] = [];
      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      await service.queryRelevantContext(
        testProjectPath,
        'Implement user authentication with JWT tokens'
      );

      // Should extract keywords like "implement", "user", "authentication", "tokens"
      // Filter out short words and common words
      expect(mockBeadsService.searchIssues).toHaveBeenCalled();
    });

    it('should filter stop words', async () => {
      const mockIssues: BeadsIssue[] = [];
      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      await service.queryRelevantContext(
        testProjectPath,
        'This task with that feature from the project have been completed'
      );

      // Should filter out: "this", "that", "with", "from", "have", "been"
      expect(mockBeadsService.searchIssues).toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      service.clearCache();
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should return cache stats', async () => {
      const mockIssues: BeadsIssue[] = [];
      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      await service.queryRelevantContext(testProjectPath, 'Task');

      const stats = service.getCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.entries).toHaveLength(1);
      expect(stats.entries[0]).toHaveProperty('key');
      expect(stats.entries[0]).toHaveProperty('age');
    });

    it('should cleanup old cache entries when max size reached', async () => {
      const mockIssues: BeadsIssue[] = [];
      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      // Create 101 unique queries to exceed max cache size
      for (let i = 0; i < 101; i++) {
        await service.queryRelevantContext(testProjectPath, `Task ${i}`);
      }

      const stats = service.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(100);
    });
  });

  describe('query options', () => {
    it('should use default maxResults', async () => {
      const mockIssues: BeadsIssue[] = Array.from({ length: 20 }, (_, i) => ({
        id: `bd-${i}`,
        title: `Issue ${i}`,
        description: 'Description',
        type: 'bug',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      }));

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      // Should limit to default maxResults of 10
      expect(context.relatedBugs.length).toBeLessThanOrEqual(10);
    });

    it('should use custom maxResults', async () => {
      const mockIssues: BeadsIssue[] = Array.from({ length: 20 }, (_, i) => ({
        id: `bd-${i}`,
        title: `Issue ${i}`,
        description: 'Description',
        type: 'bug',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      }));

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Task', {
        maxResults: 5,
      });

      expect(context.relatedBugs.length).toBeLessThanOrEqual(5);
    });

    it('should use custom minSimilarity', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Similar issue',
          description: 'Similar description',
          type: 'bug',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(
        testProjectPath,
        'Similar issue with description',
        {
          minSimilarity: 0.8, // High threshold
        }
      );

      // Should filter based on minSimilarity
      expect(context.similarIssues).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle search errors gracefully', async () => {
      mockBeadsService.searchIssues.mockRejectedValue(new Error('Search failed'));

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      // Should return empty context instead of throwing
      expect(context).toBeDefined();
      expect(context.relatedBugs).toEqual([]);
      expect(context.relatedFeatures).toEqual([]);
    });

    it('should handle dependency check errors', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Issue',
          description: 'Description',
          type: 'task',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);
      mockBeadsService.getDependencies.mockRejectedValue(new Error('Dependency check failed'));

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      // Should continue despite error
      expect(context).toBeDefined();
    });

    it('should handle Exa MCP errors gracefully', async () => {
      mockMcpBridge.isAvailable.mockReturnValue(true);
      mockMcpBridge.callTool.mockRejectedValue(new Error('MCP error'));

      const mockIssues: BeadsIssue[] = [];
      mockBeadsService.searchIssues.mockResolvedValue(mockIssues);

      const context = await service.queryRelevantContext(testProjectPath, 'Task');

      // Should fall back to basic summary
      expect(context.summary).toContain('Memory Context');
    });
  });
});
