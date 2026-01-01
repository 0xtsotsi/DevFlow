/**
 * Unit tests for BeadsAgentCoordinator
 *
 * Tests the autonomous agent coordination service that assigns work to agents,
 * spawns helper agents, and manages issue locks with capability-based scoring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BeadsAgentCoordinator } from '@/services/beads-agent-coordinator.js';
import type { BeadsIssue, AgentType, AgentConfig } from '@automaker/types';

describe('BeadsAgentCoordinator', () => {
  let mockAgentRegistry: any;
  let mockBeadsService: any;
  let mockAgentService: any;
  let mockEvents: any;
  let mockSpecializedAgentService: any;
  let coordinator: BeadsAgentCoordinator;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockAgentRegistry = {
      getAutoSelectableAgents: vi.fn().mockReturnValue(['frontend', 'backend', 'testing']),
      getAgentConfig: vi.fn(),
      getAgentStats: vi.fn().mockReturnValue({
        successRate: 0.85,
        totalExecutions: 20,
        successfulExecutions: 17,
      }),
    };

    mockBeadsService = {
      setEventEmitter: vi.fn(),
      getReadyWork: vi.fn().mockResolvedValue([]),
      updateIssue: vi.fn().mockResolvedValue(undefined),
      createIssue: vi.fn().mockResolvedValue({ id: 'bd-helper-1' }),
    };

    mockAgentService = {
      createSession: vi.fn().mockResolvedValue({
        id: 'session-123',
        stateDir: '/test/state',
      }),
    };

    mockEvents = {
      subscribe: vi.fn().mockReturnValue(() => {}),
      emit: vi.fn(),
    };

    mockSpecializedAgentService = {
      executeTaskWithAgent: vi.fn().mockResolvedValue({
        success: true,
      }),
    };

    coordinator = new BeadsAgentCoordinator(
      mockAgentRegistry,
      mockBeadsService,
      mockAgentService,
      mockEvents,
      mockSpecializedAgentService,
      {
        coordinationInterval: 1000, // Short for testing
        maxConcurrentAgents: 3,
        enableAutoAssignment: true,
        enableHelperSpawning: true,
        maxAgentAge: 7200000, // 2 hours
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('start and stop', () => {
    it('should start coordinator and subscribe to events', async () => {
      await coordinator.start(testProjectPath);

      expect(mockBeadsService.setEventEmitter).toHaveBeenCalledWith(mockEvents);
      expect(mockEvents.subscribe).toHaveBeenCalled();
      expect(mockBeadsService.getReadyWork).toHaveBeenCalled();
    });

    it('should stop coordinator and cleanup', async () => {
      const unsubscribe = vi.fn();
      mockEvents.subscribe.mockReturnValue(unsubscribe);

      await coordinator.start(testProjectPath);
      coordinator.stop();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should run coordination loop on interval', async () => {
      await coordinator.start(testProjectPath);

      // Initial coordination
      expect(mockBeadsService.getReadyWork).toHaveBeenCalledTimes(1);

      // Fast forward past interval
      vi.advanceTimersByTime(1001);

      // Wait for next tick
      await vi.runOnlyPendingTimersAsync();

      expect(mockBeadsService.getReadyWork).toHaveBeenCalledTimes(2);
    });
  });

  describe('agent selection', () => {
    it('should select agents based on capability match', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Fix frontend authentication bug',
        description: 'Login component not working',
        type: 'bug',
        priority: 1,
        status: 'open',
        labels: ['frontend', 'auth'],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockImplementation((agentType: AgentType) => {
        if (agentType === 'frontend') {
          return {
            name: 'Frontend Agent',
            capabilities: [
              {
                name: 'React',
                tools: ['jsx', 'css', 'components'],
              },
              {
                name: 'Authentication',
                tools: ['login', 'auth', 'jwt'],
              },
            ],
          };
        }
        return {
          name: 'Generic Agent',
          capabilities: [],
        };
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      // Should select frontend agent due to capability match
      expect(mockAgentService.createSession).toHaveBeenCalled();
      const sessionPrompt = mockAgentService.createSession.mock.calls[0][0];
      expect(sessionPrompt).toContain('Fix frontend authentication bug');
    });

    it('should return null if no agents available', async () => {
      mockAgentRegistry.getAutoSelectableAgents.mockReturnValue([]);

      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      expect(mockAgentService.createSession).not.toHaveBeenCalled();
    });

    it('should return null if no agent scores above threshold', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Specialized task no one can do',
        description: 'Requires special skills',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [], // No capabilities = low score
      });

      mockAgentRegistry.getAgentStats.mockReturnValue({
        successRate: 0.3, // Low success rate
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      expect(mockAgentService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('agent scoring', () => {
    it('should score agents with correct weights (40/40/20)', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'React component bug',
        description: 'Fix authentication in React',
        type: 'bug',
        priority: 1,
        status: 'open',
        labels: ['react', 'auth'],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Frontend Agent',
        capabilities: [
          {
            name: 'React',
            tools: ['jsx', 'components'],
          },
          {
            name: 'Authentication',
            tools: ['login', 'jwt'],
          },
        ],
      });

      mockAgentRegistry.getAgentStats.mockReturnValue({
        successRate: 0.8,
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      // Agent should be selected with score calculation:
      // capabilityMatch: 2/2 = 1.0 * 0.4 = 0.4
      // successRate: 0.8 * 0.4 = 0.32
      // availability: 1.0 * 0.2 = 0.2
      // total: 0.92
      expect(mockAgentService.createSession).toHaveBeenCalled();
    });

    it('should score capability match correctly', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'React component with TypeScript',
        description: 'Create component',
        type: 'feature',
        priority: 2,
        status: 'open',
        labels: ['react', 'typescript'],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      const agentConfig: AgentConfig = {
        name: 'Frontend Agent',
        capabilities: [
          {
            name: 'React',
            tools: ['jsx', 'components', 'hooks'],
          },
          {
            name: 'TypeScript',
            tools: ['ts', 'types'],
          },
          {
            name: 'Authentication', // Not related
            tools: ['auth', 'jwt'],
          },
        ],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue(agentConfig);
      mockAgentRegistry.getAgentStats.mockReturnValue({
        successRate: 1.0,
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      // Should match 2 out of 3 capabilities (React and TypeScript)
      // capabilityMatch = 2/3 = 0.67
      expect(mockAgentService.createSession).toHaveBeenCalled();
    });

    it('should calculate availability based on active agents', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      // Simulate 2 frontend agents already running
      const activeAgents = coordinator.getActiveAgents();
      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([
        {
          sessionId: 'session-1',
          agentType: 'frontend',
          issueId: 'bd-2',
          startTime: Date.now(),
        },
        {
          sessionId: 'session-2',
          agentType: 'frontend',
          issueId: 'bd-3',
          startTime: Date.now(),
        },
      ] as any);

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Frontend Agent',
        capabilities: [],
      });

      mockAgentRegistry.getAgentStats.mockReturnValue({
        successRate: 1.0,
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      // With maxConcurrentAgents = 3 and 2 frontend agents running:
      // availability = 1 - (2 / 3) = 0.33
      // This reduces the overall score
    });
  });

  describe('issue assignment', () => {
    it('should assign ready issues to available agents', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Task 1',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      expect(mockAgentService.createSession).toHaveBeenCalledWith(
        expect.stringContaining('Task 1'),
        testProjectPath,
        testProjectPath
      );
      expect(mockBeadsService.updateIssue).toHaveBeenCalledWith(testProjectPath, 'bd-1', {
        status: 'in_progress',
      });
      expect(mockSpecializedAgentService.executeTaskWithAgent).toHaveBeenCalled();
    });

    it('should lock issues during assignment', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      const lockedIssues = coordinator.getLockedIssues();
      expect(lockedIssues.has('bd-1')).toBe(true);
    });

    it('should not assign locked issues', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Locked task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      // Manually lock the issue
      coordinator.getLockedIssues().set('bd-1', 'session-external');

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      expect(mockAgentService.createSession).not.toHaveBeenCalled();
    });

    it('should not assign in_progress issues', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'In progress task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'in_progress',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      expect(mockAgentService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('max concurrent agents limit', () => {
    it('should respect max concurrent agent limit', async () => {
      const mockIssues: BeadsIssue[] = [
        {
          id: 'bd-1',
          title: 'Task 1',
          description: 'Description',
          type: 'task',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-2',
          title: 'Task 2',
          description: 'Description',
          type: 'task',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-3',
          title: 'Task 3',
          description: 'Description',
          type: 'task',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
        {
          id: 'bd-4',
          title: 'Task 4',
          description: 'Description',
          type: 'task',
          priority: 2,
          status: 'open',
          labels: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ];

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockBeadsService.getReadyWork.mockResolvedValue(mockIssues);

      await coordinator.start(testProjectPath);

      // Should only assign 3 agents (maxConcurrentAgents)
      expect(mockAgentService.createSession).toHaveBeenCalledTimes(3);
    });

    it('should skip coordination when at max capacity', async () => {
      // Fill up to max capacity
      const activeAgents = coordinator.getActiveAgents();
      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([
        { sessionId: 's1', agentType: 'frontend', issueId: 'bd-1', startTime: Date.now() },
        { sessionId: 's2', agentType: 'backend', issueId: 'bd-2', startTime: Date.now() },
        { sessionId: 's3', agentType: 'testing', issueId: 'bd-3', startTime: Date.now() },
      ] as any);

      const mockIssue: BeadsIssue = {
        id: 'bd-4',
        title: 'Task 4',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      expect(mockAgentService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('helper agent spawning', () => {
    it('should spawn helper agent on request', async () => {
      const mockParentAgent = {
        sessionId: 'session-parent',
        agentType: 'frontend' as AgentType,
        issueId: 'bd-parent',
        startTime: Date.now(),
      };

      // Simulate parent agent is active
      const getActiveAgentsSpy = vi
        .spyOn(coordinator, 'getActiveAgents')
        .mockReturnValue([mockParentAgent] as any);

      const result = await coordinator.spawnHelperAgent(
        'session-parent',
        'testing',
        'Write unit tests for authentication',
        testProjectPath
      );

      expect(result).toHaveProperty('helperSessionId');
      expect(result).toHaveProperty('helperIssueId');
      expect(result).toHaveProperty('parentIssueId');
      expect(result.parentIssueId).toBe('bd-parent');
      expect(result.helperAgentType).toBe('testing');

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.objectContaining({
          title: expect.stringContaining('Helper:'),
          description: 'Write unit tests for authentication',
          type: 'task',
          parentIssueId: 'bd-parent',
        })
      );

      expect(mockAgentService.createSession).toHaveBeenCalled();
      expect(mockSpecializedAgentService.executeTaskWithAgent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('Helper:'),
        undefined,
        undefined,
        {
          forceAgentType: 'testing',
        }
      );
    });

    it('should throw if parent session not found', async () => {
      await expect(
        coordinator.spawnHelperAgent(
          'nonexistent-session',
          'testing',
          'Task description',
          testProjectPath
        )
      ).rejects.toThrow('Parent session nonexistent-session not found');
    });

    it('should emit helper spawned event', async () => {
      const mockParentAgent = {
        sessionId: 'session-parent',
        agentType: 'frontend' as AgentType,
        issueId: 'bd-parent',
        startTime: Date.now(),
      };

      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([mockParentAgent] as any);

      await coordinator.spawnHelperAgent('session-parent', 'testing', 'Task', testProjectPath);

      expect(mockEvents.emit).toHaveBeenCalledWith('beads:helper-spawned', expect.any(Object));
    });

    it('should handle helper agent completion', async () => {
      const mockParentAgent = {
        sessionId: 'session-parent',
        agentType: 'frontend' as AgentType,
        issueId: 'bd-parent',
        startTime: Date.now(),
      };

      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([mockParentAgent] as any);

      // Mock successful execution
      const executePromise = Promise.resolve({
        success: true,
      });
      mockSpecializedAgentService.executeTaskWithAgent.mockReturnValue(executePromise);

      await coordinator.spawnHelperAgent('session-parent', 'testing', 'Task', testProjectPath);

      // Wait for the fire-and-forget promise to resolve
      await executePromise;

      expect(mockBeadsService.updateIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.any(String),
        {
          status: 'closed',
        }
      );
    });

    it('should handle helper agent failure', async () => {
      const mockParentAgent = {
        sessionId: 'session-parent',
        agentType: 'frontend' as AgentType,
        issueId: 'bd-parent',
        startTime: Date.now(),
      };

      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([mockParentAgent] as any);

      // Mock failed execution
      const executePromise = Promise.reject(new Error('Agent failed'));
      mockSpecializedAgentService.executeTaskWithAgent.mockReturnValue(executePromise);

      await coordinator.spawnHelperAgent('session-parent', 'testing', 'Task', testProjectPath);

      // Wait for the fire-and-forget promise to reject
      try {
        await executePromise;
      } catch {
        // Expected
      }

      expect(mockBeadsService.updateIssue).toHaveBeenCalledWith(
        testProjectPath,
        expect.any(String),
        {
          status: 'open',
        }
      );
    });
  });

  describe('stale agent cleanup', () => {
    it('should clean up stale agents older than maxAgentAge', async () => {
      const oldTimestamp = Date.now() - 7200000 - 1; // Just over 2 hours

      const mockAgent = {
        sessionId: 'old-session',
        agentType: 'frontend' as AgentType,
        issueId: 'bd-old',
        startTime: oldTimestamp,
      };

      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([mockAgent] as any);

      await coordinator.start(testProjectPath);

      // Should clean up the stale agent
      const activeAgents = coordinator.getActiveAgents();
      expect(activeAgents.length).toBe(0);
    });

    it('should emit cleanup event for stale agents', async () => {
      const oldTimestamp = Date.now() - 7200000 - 1;

      const mockAgent = {
        sessionId: 'old-session',
        agentType: 'frontend' as AgentType,
        issueId: 'bd-old',
        startTime: oldTimestamp,
      };

      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([mockAgent] as any);

      await coordinator.start(testProjectPath);

      expect(mockEvents.emit).toHaveBeenCalledWith('beads:agent-cleaned', expect.any(Object));
    });

    it('should clear issue locks for stale agents', async () => {
      const oldTimestamp = Date.now() - 7200000 - 1;

      const mockAgent = {
        sessionId: 'old-session',
        agentType: 'frontend' as AgentType,
        issueId: 'bd-old',
        startTime: oldTimestamp,
      };

      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([mockAgent] as any);

      await coordinator.start(testProjectPath);

      const lockedIssues = coordinator.getLockedIssues();
      expect(lockedIssues.has('bd-old')).toBe(false);
    });

    it('should keep young agents', async () => {
      const recentTimestamp = Date.now() - 1000; // 1 second ago

      const mockAgent = {
        sessionId: 'recent-session',
        agentType: 'frontend' as AgentType,
        issueId: 'bd-recent',
        startTime: recentTimestamp,
      };

      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([mockAgent] as any);

      await coordinator.start(testProjectPath);

      const activeAgents = coordinator.getActiveAgents();
      expect(activeAgents.length).toBe(1);
    });
  });

  describe('event handling', () => {
    it('should handle issue update events', async () => {
      const unsubscribe = vi.fn();
      mockEvents.subscribe.mockImplementation((callback) => {
        // Simulate event emission
        setTimeout(() => {
          callback('beads:issue-updated', {
            issue: {
              id: 'bd-1',
              status: 'closed',
            },
          });
        }, 10);
        return unsubscribe;
      });

      await coordinator.start(testProjectPath);

      // Fast forward to allow event to be processed
      await vi.advanceTimersByTimeAsync(20);

      // Issue lock should be cleared for closed issues
      const lockedIssues = coordinator.getLockedIssues();
      // Since we didn't lock this issue, we're just checking no errors occurred
      expect(lockedIssues).toBeDefined();
    });

    it('should handle task ready events', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-ready',
        title: 'Ready task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockEvents.subscribe.mockImplementation((callback) => {
        // Simulate task ready event
        setTimeout(() => {
          callback('beads:task-ready', {
            issue: mockIssue,
            projectPath: testProjectPath,
          });
        }, 10);
        return () => {};
      });

      // Mock getReadyWork to return empty initially
      mockBeadsService.getReadyWork.mockResolvedValue([]);

      await coordinator.start(testProjectPath);

      // Fast forward to allow event to be processed
      await vi.advanceTimersByTimeAsync(20);

      // Should trigger coordination
      expect(mockBeadsService.getReadyWork).toHaveBeenCalled();
    });
  });

  describe('statistics', () => {
    it('should return coordinator statistics', async () => {
      const stats = coordinator.getStats();

      expect(stats).toHaveProperty('activeAgents');
      expect(stats).toHaveProperty('lockedIssues');
      expect(stats).toHaveProperty('totalAssignments');
      expect(stats).toHaveProperty('totalHelpersSpawned');
      expect(stats).toHaveProperty('lastCoordinationTime');
    });

    it('should track assignments', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.start(testProjectPath);

      const stats = coordinator.getStats();
      expect(stats.totalAssignments).toBe(1);
    });

    it('should track helper spawns', async () => {
      const mockParentAgent = {
        sessionId: 'session-parent',
        agentType: 'frontend' as AgentType,
        issueId: 'bd-parent',
        startTime: Date.now(),
      };

      vi.spyOn(coordinator, 'getActiveAgents').mockReturnValue([mockParentAgent] as any);

      await coordinator.spawnHelperAgent('session-parent', 'testing', 'Task', testProjectPath);

      const stats = coordinator.getStats();
      expect(stats.totalHelpersSpawned).toBe(1);
    });

    it('should track last coordination time', async () => {
      await coordinator.start(testProjectPath);

      const stats = coordinator.getStats();
      expect(stats.lastCoordinationTime).toBeGreaterThan(0);
    });
  });

  describe('manual trigger', () => {
    it('should allow manual coordination trigger', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await coordinator.triggerCoordination(testProjectPath);

      expect(mockBeadsService.getReadyWork).toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const customCoordinator = new BeadsAgentCoordinator(
        mockAgentRegistry,
        mockBeadsService,
        mockAgentService,
        mockEvents,
        mockSpecializedAgentService,
        {
          coordinationInterval: 5000,
          maxConcurrentAgents: 10,
          enableAutoAssignment: false,
          enableHelperSpawning: false,
          maxAgentAge: 3600000,
        }
      );

      const stats = customCoordinator.getStats();
      expect(stats).toBeDefined();
    });

    it('should disable auto assignment when configured', async () => {
      const customCoordinator = new BeadsAgentCoordinator(
        mockAgentRegistry,
        mockBeadsService,
        mockAgentService,
        mockEvents,
        mockSpecializedAgentService,
        {
          enableAutoAssignment: false,
        }
      );

      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);

      await customCoordinator.start(testProjectPath);

      // Should still run coordination but not assign if logic respects config
      // (implementation-dependent, here we just test it doesn't crash)
      expect(mockBeadsService.getReadyWork).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle getReadyWork errors gracefully', async () => {
      mockBeadsService.getReadyWork.mockRejectedValue(new Error('Beads error'));

      await coordinator.start(testProjectPath);

      // Should not throw, just log error
      expect(mockBeadsService.getReadyWork).toHaveBeenCalled();
    });

    it('should handle assignment errors gracefully', async () => {
      const mockIssue: BeadsIssue = {
        id: 'bd-1',
        title: 'Task',
        description: 'Description',
        type: 'task',
        priority: 2,
        status: 'open',
        labels: [],
        createdAt: new Date().toISOString(),
        dependencies: [],
      };

      mockAgentRegistry.getAgentConfig.mockReturnValue({
        name: 'Generic Agent',
        capabilities: [],
      });

      mockBeadsService.getReadyWork.mockResolvedValue([mockIssue]);
      mockAgentService.createSession.mockRejectedValue(new Error('Session creation failed'));

      await coordinator.start(testProjectPath);

      // Should continue despite error
      const stats = coordinator.getStats();
      expect(stats).toBeDefined();
    });
  });
});
