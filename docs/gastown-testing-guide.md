# Gastown-Inspired Features Testing Guide

## Overview

This guide provides a comprehensive testing strategy for the Gastown-inspired autonomous agent memory system. The Gastown features enable AI agents to track their work, learn from past experiences, and coordinate autonomously using the Beads issue tracker.

**Gastown Features:**

- **BeadsLiveLinkService** - Auto-creates Beads issues from agent errors and requests
- **BeadsMemoryService** - Queries past issues as agent context with semantic search
- **BeadsAgentCoordinator** - Autonomous agent coordination and task assignment
- **BeadsOrchestrator** - Multi-agent execution planning with dependency resolution
- **ResearchService** - Code research with Beads integration (via Exa, Greptile, LSP)

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Testing Pyramid](#testing-pyramid)
3. [Unit Testing Requirements](#unit-testing-requirements)
4. [Integration Testing Scenarios](#integration-testing-scenarios)
5. [E2E Testing Cases](#e2e-testing-cases)
6. [Performance Testing](#performance-testing)
7. [Test Fixtures and Mocks](#test-fixtures-and-mocks)
8. [Coverage Requirements](#coverage-requirements)
9. [CI/CD Integration](#cicd-integration)
10. [Testing Checklist](#testing-checklist)

---

## Testing Philosophy

### Core Principles

1. **Test Behavior, Not Implementation**
   - Focus on what the code does, not how it does it
   - Test public interfaces and APIs
   - Avoid testing private methods directly

2. **Arrange-Act-Assert (AAA) Pattern**

   ```typescript
   it('should create issue on agent error', async () => {
     // Arrange: Setup test data and mocks
     const service = setupService();
     mockBeadsService.createIssue.mockResolvedValue({ id: 'bd-1' });

     // Act: Execute the behavior
     await service.handleAgentError(errorData);

     // Assert: Verify expected outcomes
     expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
       expect.objectContaining({ type: 'bug' })
     );
   });
   ```

3. **Test Isolation**
   - Each test should be independent
   - Use `beforeEach`/`afterEach` for cleanup
   - Avoid shared state between tests

4. **Mock External Dependencies**
   - Mock Beads CLI calls
   - Mock MCP tools (Exa, Greptile, LSP)
   - Mock file system operations
   - Mock event emitters

5. **Test Edge Cases and Error Paths**
   - Empty results
   - Null/undefined inputs
   - Network failures
   - Malformed data
   - Concurrent operations

6. **Use Descriptive Test Names**

   ```typescript
   // Good
   it('should prevent duplicate issues within 24 hours', async () => {});

   // Bad
   it('test duplicates', async () => {});
   ```

---

## Testing Pyramid

```
         E2E Tests (10%)
        /              \
     Integration (30%)
    /                    \
   Unit Tests (60%)
```

### Unit Tests (60%)

- Fast execution (< 1ms per test)
- No external dependencies
- Mock everything
- Test individual functions and classes

### Integration Tests (30%)

- Medium execution time (< 100ms per test)
- Test interaction between services
- Use real EventEmitter
- Mock external APIs (Beads CLI, MCP)

### E2E Tests (10%)

- Slow execution (< 5s per test)
- Full system integration
- Test critical user flows
- Minimal mocking

---

## Unit Testing Requirements

### 1. BeadsLiveLinkService

**File:** `apps/server/src/services/beads-live-link-service.ts` (485 lines)

#### Test Suite: `initialize()`

**Test Cases:**

```typescript
describe('initialize', () => {
  it('should initialize successfully when Beads is installed and initialized');
  it('should auto-initialize Beads if not initialized but can be');
  it('should warn but not crash when Beads CLI is not installed');
  it('should subscribe to agent events after successful initialization');
  it('should not subscribe when Beads cannot be initialized');
});
```

**Example Test:**

```typescript
it('should initialize successfully when Beads is installed', async () => {
  mockBeadsService.validateBeadsInProject.mockResolvedValue({
    installed: true,
    initialized: true,
    canInitialize: false,
  });

  await service.initialize(testProjectPath);

  expect(mockBeadsService.validateBeadsInProject).toHaveBeenCalledWith(testProjectPath);
  expect(mockEvents.subscribe).toHaveBeenCalled();
  expect(mockBeadsService.initializeBeads).not.toHaveBeenCalled();
});
```

#### Test Suite: `handleAgentError()`

**Test Cases:**

```typescript
describe('handleAgentError', () => {
  it('should create bug issue with Critical severity for crash errors');
  it('should create bug issue with High severity for timeout errors');
  it('should create bug issue with Medium severity for validation errors');
  it('should create bug issue with Low severity for minor errors');
  it('should extract error context from agent message');
  it('should assign P0 priority for Critical errors');
  it('should assign P1 priority for High errors');
  it('should assign P2 priority for Medium errors');
  it('should assign P3 priority for Low errors');
  it('should include session ID in issue description');
  it('should include timestamp in issue description');
  it('should include error stack trace if available');
  it('should emit beads:auto-issue-created event');
  it('should not create issue when autoCreateOnErrors is false');
});
```

**Severity Mapping Tests:**

```typescript
describe('severity assessment', () => {
  const errorCases = [
    { error: 'Process crashed', severity: 'Critical', priority: 0 },
    { error: 'Connection timeout', severity: 'High', priority: 1 },
    { error: 'Validation failed', severity: 'Medium', priority: 2 },
    { error: 'Minor issue', severity: 'Low', priority: 3 },
  ];

  errorCases.forEach(({ error, severity, priority }) => {
    it(`should assess "${error}" as ${severity} (P${priority})`, async () => {
      const callback = mockEvents._getCallback();
      const errorData: AgentErrorData = {
        sessionId: 'test-session',
        type: 'error',
        error,
        message: { id: 'msg-1', content: 'Error occurred', timestamp: new Date().toISOString() },
      };

      callback('agent:stream', errorData);

      expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'bug',
          priority,
          labels: expect.arrayContaining([severity, 'auto-created']),
        })
      );
    });
  });
});
```

#### Test Suite: `handleAgentRequest()`

**Test Cases:**

```typescript
describe('handleAgentRequest', () => {
  it('should create feature issue when requested by agent');
  it('should create task issue when requested by agent');
  it('should create bug issue when requested by agent');
  it('should use provided title and description');
  it('should use custom priority if specified');
  it('should add agent-requested label');
  it('should include session ID in metadata');
  it('should not create issue when autoCreateOnRequests is false');
  it('should emit beads:auto-issue-created event');
});
```

#### Test Suite: Rate Limiting

**Test Cases:**

```typescript
describe('rate limiting', () => {
  it('should create up to maxAutoIssuesPerHour issues');
  it('should block issue creation after limit reached');
  it('should reset counter after 1 hour');
  it('should emit warning when limit reached');
  it('should allow agent-requested issues after limit (different counter)');

  it('should enforce 20 issues per hour limit', async () => {
    const config = { maxAutoIssuesPerHour: 20 };
    const service = new BeadsLiveLinkService(mockBeadsService, mockEvents, config);
    await service.initialize(testProjectPath);

    const callback = mockEvents._getCallback();

    // Create 20 errors (should all succeed)
    for (let i = 0; i < 20; i++) {
      callback('agent:stream', createErrorData(`Error ${i}`));
      await vi.runAllTimersAsync();
    }

    expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(20);

    // 21st error should be blocked
    callback('agent:stream', createErrorData('Error 21'));
    await vi.runAllTimersAsync();

    expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(20); // No new call
  });
});
```

#### Test Suite: Deduplication

**Test Cases:**

```typescript
describe('deduplication', () => {
  it('should detect duplicate errors within 24 hours');
  it('should create new issue after cache TTL expires');
  it('should hash error content for deduplication key');
  it('should return existing issue ID for duplicates');
  it('should not create duplicate issues for similar errors');
  it('should cache issue ID and timestamp');
  it('should clear cache on shutdown');

  it('should prevent duplicate issues within 24 hours', async () => {
    const service = new BeadsLiveLinkService(mockBeadsService, mockEvents, {
      enableDeduplication: true,
    });
    await service.initialize(testProjectPath);

    const callback = mockEvents._getCallback();
    const errorData = createErrorData('Duplicate error');

    // First error
    mockBeadsService.createIssue.mockResolvedValueOnce({ id: 'bd-1' });
    callback('agent:stream', errorData);
    await vi.runAllTimersAsync();

    // Second identical error
    callback('agent:stream', errorData);
    await vi.runAllTimersAsync();

    expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(1);
  });
});
```

#### Test Suite: `shutdown()`

**Test Cases:**

```typescript
describe('shutdown', () => {
  it('should unsubscribe from events');
  it('should clear error cache');
  it('should reset rate limit counters');
  it('should handle shutdown when not initialized');
});
```

---

### 2. BeadsMemoryService

**File:** `apps/server/src/services/beads-memory-service.ts` (627 lines)

#### Test Suite: `queryRelevantContext()`

**Test Cases:**

```typescript
describe('queryRelevantContext', () => {
  it('should extract keywords from task description');
  it('should search Beads issues by keywords');
  it('should categorize issues by type (bugs, features, tasks, epics)');
  it('should extract decisions from closed issues');
  it('should find blocking issues');
  it('should find semantically similar issues using MCP');
  it('should generate AI summary of context');
  it('should estimate token count for context');
  it('should respect maxResults option');
  it('should respect includeClosed option');
  it('should respect includeInProgress option');
  it('should respect minSimilarity threshold');
  it('should return empty context when no issues found');
  it('should handle MCP unavailability gracefully');
});
```

**Example Test:**

```typescript
it('should categorize issues by type', async () => {
  const mockIssues: BeadsIssue[] = [
    {
      id: 'bd-1',
      title: 'Bug 1',
      description: 'Bug',
      type: 'bug',
      priority: 2,
      status: 'open',
      labels: [],
    },
    {
      id: 'bd-2',
      title: 'Feature 1',
      description: 'Feature',
      type: 'feature',
      priority: 2,
      status: 'open',
      labels: [],
    },
    {
      id: 'bd-3',
      title: 'Epic 1',
      description: 'Epic',
      type: 'epic',
      priority: 1,
      status: 'open',
      labels: [],
    },
    {
      id: 'bd-4',
      title: 'Task 1',
      description: 'Task',
      type: 'task',
      priority: 3,
      status: 'open',
      labels: [],
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
```

#### Test Suite: Caching

**Test Cases:**

```typescript
describe('caching', () => {
  it('should cache query results for 5 minutes');
  it('should return cached result on repeated query');
  it('should invalidate cache after TTL expires');
  it('should limit cache size to MAX_CACHE_SIZE');
  it('should use query hash as cache key');
  it('should handle cache misses');

  it('should cache query results for 5 minutes', async () => {
    mockBeadsService.searchIssues.mockResolvedValue([createMockIssue('bd-1')]);

    // First call
    const context1 = await service.queryRelevantContext(testProjectPath, 'Test query');
    expect(mockBeadsService.searchIssues).toHaveBeenCalledTimes(1);

    // Second call (should use cache)
    const context2 = await service.queryRelevantContext(testProjectPath, 'Test query');
    expect(mockBeadsService.searchIssues).toHaveBeenCalledTimes(1); // No new call

    expect(context1).toEqual(context2);
  });
});
```

#### Test Suite: Token Estimation

**Test Cases:**

```typescript
describe('token estimation', () => {
  it('should estimate tokens for issue titles (~0.25 tokens per char)');
  it('should estimate tokens for issue descriptions (~0.25 tokens per char)');
  it('should estimate tokens for AI summary');
  it('should return total token estimate in context');
  it('should prevent context overflow when maxTokens approached');
  it('should prioritize high-priority issues when truncating');

  it('should estimate token count accurately', async () => {
    const longDescription = 'A'.repeat(1000); // ~250 tokens
    mockBeadsService.searchIssues.mockResolvedValue([
      createMockIssue('bd-1', 'Title', longDescription),
    ]);

    const context = await service.queryRelevantContext(testProjectPath, 'Test');

    expect(context.totalTokenEstimate).toBeGreaterThan(250);
    expect(context.totalTokenEstimate).toBeLessThan(500);
  });
});
```

#### Test Suite: Decision Extraction

**Test Cases:**

```typescript
describe('decision extraction', () => {
  it('should extract decisions from closed issue descriptions');
  it('should look for decision markers like "DECISION:"');
  it('should look for resolution markers like "RESOLVED:"');
  it('should return decision with issue reference');
  it('should handle issues without explicit decisions');
  it('should include technical decisions (architecture, APIs)');
  it('should include product decisions (features, priorities)');
});
```

---

### 3. BeadsAgentCoordinator

**File:** `apps/server/src/services/beads-agent-coordinator.ts` (803 lines)

#### Test Suite: `start()` and `stop()`

**Test Cases:**

```typescript
describe('start and stop', () => {
  it('should start coordinator and subscribe to events');
  it('should initialize BeadsService event emitter');
  it('should begin coordination loop at specified interval');
  it('should stop coordinator and cleanup interval');
  it('should unsubscribe from events on stop');
  it('should handle multiple start calls gracefully');
  it('should handle stop without start gracefully');
});
```

#### Test Suite: Agent Selection Scoring

**Test Cases:**

```typescript
describe('agent selection scoring', () => {
  it('should calculate score: 40% capability match + 40% success rate + 20% availability');
  it('should prioritize agents with matching capabilities');
  it('should prioritize agents with high success rate');
  it('should prioritize agents with low active task count');
  it('should return agent with highest score');
  it('should handle no available agents');
  it('should update agent availability after assignment');
  it('should respect maxConcurrentAgents limit');

  it('should score agents by capability, success rate, and availability', async () => {
    const agents = [
      { type: 'frontend', capabilities: ['react'], successRate: 0.9, activeTasks: 1 },
      { type: 'backend', capabilities: ['api'], successRate: 0.8, activeTasks: 0 },
      { type: 'testing', capabilities: ['jest'], successRate: 0.7, activeTasks: 2 },
    ];

    // For a React task:
    // Frontend: 0.4 * 1.0 + 0.4 * 0.9 + 0.2 * 0.5 = 0.86
    // Backend:  0.4 * 0.0 + 0.4 * 0.8 + 0.2 * 1.0 = 0.52
    // Testing:  0.4 * 0.0 + 0.4 * 0.7 + 0.2 * 0.0 = 0.28

    const selected = await coordinator.selectBestAgent(agents, 'react-task');

    expect(selected.type).toBe('frontend');
  });
});
```

#### Test Suite: Auto-Assignment

**Test Cases:**

```typescript
describe('auto-assignment', () => {
  it('should assign ready work to available agents');
  it('should only assign issues with no blockers');
  it('should respect issue priority (P0 first)');
  it('should lock assigned issues');
  it('should emit beads:agent-assigned event');
  it('should not assign when maxConcurrentAgents reached');
  it('should handle no ready work gracefully');
  it('should handle no available agents gracefully');
  it('should track assignment in activeAgents map');
  it('should increment totalAssignments counter');

  it('should auto-assign ready work to best agent', async () => {
    const readyIssues = [
      createMockIssue('bd-1', 'Fix login bug', 'bug', 1, 'open', []),
      createMockIssue('bd-2', 'Add user profile', 'feature', 2, 'open', []),
    ];

    mockBeadsService.getReadyWork.mockResolvedValue(readyIssues);
    mockAgentRegistry.getAutoSelectableAgents.mockReturnValue(['debug', 'frontend']);

    await coordinator.start(testProjectPath);
    await vi.runAllTimersAsync(); // Run coordination loop

    expect(mockAgentService.createSession).toHaveBeenCalledTimes(2);
    expect(mockBeadsService.updateIssue).toHaveBeenCalledWith(
      testProjectPath,
      'bd-1',
      expect.objectContaining({ status: 'in_progress' })
    );
  });
});
```

#### Test Suite: Helper Agent Spawning

**Test Cases:**

```typescript
describe('helper agent spawning', () => {
  it('should spawn helper agent when requested');
  it('should create child issue for helper agent');
  it('should link child issue to parent issue');
  it('should set helper agent type based on helperType');
  it('should emit beads:helper-spawned event');
  it('should handle helper agent completion');
  it('should handle helper agent failure');
  it('should not spawn when enableHelperSpawning is false');
  it('should track totalHelpersSpawned counter');
  it('should include parent issue context in helper description');

  it('should spawn helper agent for subtask', async () => {
    const result = await coordinator.spawnHelperAgent(
      'parent-session',
      'testing',
      'Write unit tests for auth module',
      testProjectPath
    );

    expect(result.helperSessionId).toBeDefined();
    expect(result.helperIssueId).toBeDefined();
    expect(result.parentIssueId).toBeDefined();
    expect(result.helperAgentType).toBe('testing');

    expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
      testProjectPath,
      expect.objectContaining({
        parentIssueId: expect.any(String),
        type: 'task',
        labels: expect.arrayContaining(['helper', 'testing']),
      })
    );

    expect(mockSpecializedAgentService.executeTaskWithAgent).toHaveBeenCalled();
  });
});
```

#### Test Suite: Issue Locking

**Test Cases:**

```typescript
describe('issue locking', () => {
  it('should lock issue when assigning to agent');
  it('should prevent multiple agents from claiming same issue');
  it('should unlock issue when agent completes');
  it('should unlock issue when agent fails');
  it('should handle lock contention gracefully');
  it('should track locked issues in issueLocks map');
  it('should emit lock/unlock events');
});
```

#### Test Suite: Stale Agent Cleanup

**Test Cases:**

```typescript
describe('stale agent cleanup', () => {
  it('should cleanup agents older than maxAgentAge');
  it('should unlock issues held by stale agents');
  it('should mark issues as open when agent goes stale');
  it('should emit beads:agent-timeout event');
  it('should handle no stale agents gracefully');
  it('should run cleanup during coordination loop');

  it('should cleanup stale agents after 2 hours', async () => {
    const staleSessionId = 'stale-session';
    coordinator['activeAgents'].set(staleSessionId, {
      sessionId: staleSessionId,
      agentType: 'frontend',
      issueId: 'bd-stale',
      startTime: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
    });

    await coordinator.start(testProjectPath);
    await vi.runAllTimersAsync();

    expect(coordinator['activeAgents'].has(staleSessionId)).toBe(false);
    expect(mockBeadsService.updateIssue).toHaveBeenCalledWith(
      testProjectPath,
      'bd-stale',
      expect.objectContaining({ status: 'open' })
    );
  });
});
```

#### Test Suite: Statistics

**Test Cases:**

```typescript
describe('statistics', () => {
  it('should return coordinator statistics');
  it('should report active agent count');
  it('should report locked issue count');
  it('should report total assignments');
  it('should report total helpers spawned');
  it('should report last coordination time');
  it('should update stats in real-time');
});
```

---

### 4. BeadsOrchestrator

**File:** `apps/server/src/services/beads-orchestrator.ts`

#### Test Suite: `createExecutionPlan()`

**Test Cases:**

```typescript
describe('createExecutionPlan', () => {
  it('should create execution plan for multiple features');
  it('should resolve cross-feature dependencies');
  it('should mark features ready when no blockers');
  it('should mark features blocked when dependencies exist');
  it('should sort by priority when respectPriorities is true');
  it('should put ready tasks before blocked tasks');
  it('should handle empty feature list');
  it('should handle missing issues gracefully');
  it('should include feature and issue IDs in plan');
  it('should include priority in plan');

  it('should create execution plan with dependencies', async () => {
    const features = [
      { id: 'feat-1', issueId: 'bd-1' },
      { id: 'feat-2', issueId: 'bd-2' },
    ];

    mockBeadsService.resolveCrossFeatureDependencies.mockResolvedValue([
      { featureId: 'feat-1', readyToStart: true, blockingFeatures: [] },
      { featureId: 'feat-2', readyToStart: false, blockingFeatures: ['feat-1'] },
    ]);

    mockBeadsService.getIssue.mockImplementation(async (_, id) => ({
      id,
      title: `Issue ${id}`,
      description: '',
      status: 'open',
      type: 'feature',
      priority: id === 'bd-1' ? 1 : 2,
      labels: [],
    }));

    const plan = await orchestrator.createExecutionPlan(features, {
      projectPath: testProjectPath,
      respectPriorities: true,
      respectDependencies: true,
    });

    expect(plan).toHaveLength(2);
    expect(plan[0].featureId).toBe('feat-1');
    expect(plan[0].canStart).toBe(true);
    expect(plan[1].featureId).toBe('feat-2');
    expect(plan[1].canStart).toBe(false);
    expect(plan[1].blockedBy).toContain('feat-1');
  });
});
```

#### Test Suite: `trackEpicProgress()`

**Test Cases:**

```typescript
describe('trackEpicProgress', () => {
  it('should calculate epic completion percentage');
  it('should count completed subtasks');
  it('should identify ready subtasks');
  it('should return epic summary');
  it('should handle epics with no subtasks');
  it('should handle epics with all completed subtasks');
  it('should handle epics with no completed subtasks');
});
```

---

### 5. ResearchService (with Beads Integration)

**File:** `apps/server/src/services/research-service.ts`

#### Test Suite: `researchForIssue()`

**Test Cases:**

```typescript
describe('researchForIssue', () => {
  it('should search codebase for implementation examples');
  it('should find similar GitHub issues via Grep MCP');
  it('should analyze dependencies via TypeScript LSP');
  it('should synthesize actionable recommendations');
  it('should return IssueResearchResult');
  it('should include code examples in result');
  it('should include similar GitHub issues in result');
  it('should include dependency conflicts in result');
  it('should handle missing MCP tools gracefully');
  it('should cache research results');
  it('should measure research duration');

  it('should conduct comprehensive research for Beads issue', async () => {
    mockMCPBridge.callTool
      .mockResolvedValueOnce(['code example 1', 'code example 2']) // Exa code search
      .mockResolvedValueOnce([{ title: 'Similar issue', url: 'https://github.com/test/1' }]); // Grep GitHub search

    const result = await researchService.researchForIssue(
      'bd-123',
      'Implement user authentication',
      testProjectPath
    );

    expect(result.issueId).toBe('bd-123');
    expect(result.codeExamples).toHaveLength(2);
    expect(result.similarGitHubIssues).toHaveLength(1);
    expect(result.recommendations).toBeDefined();
    expect(result.researchedAt).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
  });
});
```

---

## Integration Testing Scenarios

### 1. Agent Error to Beads Issue Flow

**Test File:** `apps/server/tests/integration/beads-live-link.integration.test.ts`

```typescript
describe('Agent Error to Beads Issue Flow', () => {
  it('should create Beads issue when agent encounters error', async () => {
    // Setup
    const { service, mockEvents } = await setupLiveLinkService();
    const agentSession = await startAgentSession();

    // Simulate agent error
    agentSession.emit('error', new Error('Database connection failed'));

    // Wait for issue creation
    await vi.waitUntil(() => mockBeadsService.createIssue.mock.calls.length > 0);

    // Verify
    const createdIssue = await mockBeadsService.getIssue(lastCreatedIssueId);
    expect(createdIssue.type).toBe('bug');
    expect(createdIssue.priority).toBe(1); // High
    expect(createdIssue.labels).toContain('auto-created');
    expect(createdIssue.labels).toContain('High');
  });
});
```

### 2. Agent Memory Query Flow

**Test File:** `apps/server/tests/integration/beads-memory.integration.test.ts`

```typescript
describe('Agent Memory Query Flow', () => {
  it('should provide context from past issues to agent', async () => {
    // Setup: Create historical issues
    await createBeadsIssue({ type: 'bug', title: 'Auth token expires' });
    await createBeadsIssue({ type: 'feature', title: 'Add refresh tokens' });

    // Query memory
    const context = await beadsMemoryService.queryRelevantContext(
      testProjectPath,
      'Fix authentication token expiry'
    );

    // Verify
    expect(context.relatedBugs).toHaveLength(1);
    expect(context.relatedBugs[0].title).toContain('Auth token');
    expect(context.summary).toContain('refresh token');
  });
});
```

### 3. Agent Coordination Flow

**Test File:** `apps/server/tests/integration/beads-coordinator.integration.test.ts`

```typescript
describe('Agent Coordination Flow', () => {
  it('should auto-assign work to best available agent', async () => {
    // Setup: Create ready issues
    await createBeadsIssue({
      type: 'bug',
      title: 'Fix login bug',
      priority: 1,
      status: 'open',
    });

    // Start coordinator
    await coordinator.start(testProjectPath);
    await vi.waitUntil(() => agentService.createSession.mock.calls.length > 0);

    // Verify agent assignment
    expect(agentService.createSession).toHaveBeenCalled();
    const assignedIssue = await beadsService.getIssue(testProjectPath, 'bd-1');
    expect(assignedIssue.status).toBe('in_progress');
  });

  it('should spawn helper agent for subtasks', async () => {
    const parentSession = 'session-parent';

    // Spawn helper
    const result = await coordinator.spawnHelperAgent(
      parentSession,
      'testing',
      'Write tests for auth module',
      testProjectPath
    );

    // Verify helper created
    expect(result.helperSessionId).toBeDefined();
    expect(result.helperIssueId).toBeDefined();

    const helperIssue = await beadsService.getIssue(testProjectPath, result.helperIssueId);
    expect(helperIssue.parentIssueId).toBeDefined();
    expect(helperIssue.labels).toContain('helper');
  });
});
```

### 4. Multi-Agent Orchestration Flow

**Test File:** `apps/server/tests/integration/beads-orchestrator.integration.test.ts`

```typescript
describe('Multi-Agent Orchestration Flow', () => {
  it('should coordinate multiple agents with dependencies', async () => {
    // Setup: Create dependent features
    const authIssue = await createBeadsIssue({ type: 'feature', title: 'Auth API', priority: 1 });
    const profileIssue = await createBeadsIssue({
      type: 'feature',
      title: 'User Profile API',
      priority: 2,
    });

    // Add dependency
    await beadsService.addDependency(testProjectPath, profileIssue.id, {
      issueId: authIssue.id,
      type: 'blocks',
    });

    // Create execution plan
    const plan = await orchestrator.createExecutionPlan(
      [
        { id: 'auth', issueId: authIssue.id },
        { id: 'profile', issueId: profileIssue.id },
      ],
      { projectPath: testProjectPath, respectDependencies: true }
    );

    // Verify ordering
    expect(plan[0].featureId).toBe('auth');
    expect(plan[0].canStart).toBe(true);
    expect(plan[1].featureId).toBe('profile');
    expect(plan[1].canStart).toBe(false);
    expect(plan[1].blockedBy).toContain('auth');
  });
});
```

### 5. Research Integration Flow

**Test File:** `apps/server/tests/integration/research-beads.integration.test.ts`

```typescript
describe('Research Integration Flow', () => {
  it('should research Beads issue before agent execution', async () => {
    // Create issue
    const issue = await createBeadsIssue({
      type: 'feature',
      title: 'Implement OAuth2 login',
    });

    // Research
    const research = await researchService.researchForIssue(issue.id, issue.title, testProjectPath);

    // Verify research conducted
    expect(research.codeExamples.length).toBeGreaterThan(0);
    expect(research.similarGitHubIssues.length).toBeGreaterThan(0);
    expect(research.recommendations.length).toBeGreaterThan(0);

    // Agent should use research
    const context = await beadsMemoryService.queryRelevantContext(testProjectPath, issue.title);

    // Research should be in memory
    expect(context.summary).toContain(research.recommendations[0]);
  });
});
```

---

## E2E Testing Cases

### E2E Test 1: Agent Error Recovery

**Test File:** `apps/server/tests/e2e/agent-error-recovery.e2e.test.ts`

```typescript
describe('E2E: Agent Error Recovery', () => {
  it('should track error from failed agent execution and enable recovery', async () => {
    // 1. Start agent session
    const session = await agentService.createSession(testProjectPath);

    // 2. Agent encounters error
    const error = new Error('Module not found: @lib/auth');
    await agentService.handleError(session.id, error);

    // 3. Verify Beads issue created
    const issues = await beadsService.searchIssues(testProjectPath, {
      titleContains: 'Module not found',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('bug');
    expect(issues[0].priority).toBe(1); // High

    // 4. Another agent queries memory
    const context = await beadsMemoryService.queryRelevantContext(
      testProjectPath,
      'Fix auth module import'
    );

    // 5. Context includes the error
    expect(context.relatedBugs).toHaveLength(1);
    expect(context.relatedBugs[0].title).toContain('Module not found');

    // 6. Agent fixes issue using context
    await agentService.executeTask(context.relatedBugs[0].id);

    // 7. Issue marked as closed
    const updatedIssue = await beadsService.getIssue(testProjectPath, issues[0].id);
    expect(updatedIssue.status).toBe('closed');
  });
});
```

### E2E Test 2: Autonomous Multi-Agent Feature

**Test File:** `apps/server/tests/e2e/autonomous-feature.e2e.test.ts`

```typescript
describe('E2E: Autonomous Multi-Agent Feature', () => {
  it('should coordinate multiple agents to implement feature', async () => {
    // 1. Create feature epic
    const epic = await beadsService.createIssue(testProjectPath, {
      title: 'User Authentication System',
      type: 'epic',
      priority: 1,
    });

    // 2. Create subtasks
    const loginTask = await beadsService.createIssue(testProjectPath, {
      title: 'Implement login API',
      type: 'task',
      parentIssueId: epic.id,
      priority: 1,
    });

    const registerTask = await beadsService.createIssue(testProjectPath, {
      title: 'Implement registration API',
      type: 'task',
      parentIssueId: epic.id,
      priority: 2,
    });

    // 3. Start coordinator
    await coordinator.start(testProjectPath);

    // 4. Wait for assignments
    await vi.waitUntil(async () => {
      const loginIssue = await beadsService.getIssue(testProjectPath, loginTask.id);
      const registerIssue = await beadsService.getIssue(testProjectPath, registerTask.id);
      return loginIssue.status === 'in_progress' && registerIssue.status === 'in_progress';
    });

    // 5. Verify both agents assigned
    const stats = coordinator.getStats();
    expect(stats.activeAgents).toBe(2);

    // 6. Verify issues locked
    expect(await coordinator.isLocked(loginTask.id)).toBe(true);
    expect(await coordinator.isLocked(registerTask.id)).toBe(true);

    // 7. Simulate agent completion
    await coordinator.markAgentComplete('session-1', loginTask.id);
    await coordinator.markAgentComplete('session-2', registerTask.id);

    // 8. Verify issues closed
    const finalLoginIssue = await beadsService.getIssue(testProjectPath, loginTask.id);
    const finalRegisterIssue = await beadsService.getIssue(testProjectPath, registerTask.id);
    expect(finalLoginIssue.status).toBe('closed');
    expect(finalRegisterIssue.status).toBe('closed');
  });
});
```

### E2E Test 3: Agent Spawns Helper

**Test File:** `apps/server/tests/e2e/helper-spawning.e2e.test.ts`

```typescript
describe('E2E: Agent Spawns Helper', () => {
  it('should spawn helper agent for testing subtask', async () => {
    // 1. Main agent working on feature
    const parentSession = await agentService.createSession(testProjectPath);
    const parentIssue = await beadsService.createIssue(testProjectPath, {
      title: 'Add user authentication',
      type: 'feature',
    });

    // 2. Main agent spawns testing helper
    const result = await coordinator.spawnHelperAgent(
      parentSession.id,
      'testing',
      'Write unit tests for auth module',
      testProjectPath
    );

    // 3. Verify helper issue created
    expect(result.helperIssueId).toBeDefined();
    const helperIssue = await beadsService.getIssue(testProjectPath, result.helperIssueId);
    expect(helperIssue.parentIssueId).toBe(parentIssue.id);
    expect(helperIssue.type).toBe('task');
    expect(helperIssue.labels).toContain('helper');
    expect(helperIssue.labels).toContain('testing');

    // 4. Verify helper agent started
    expect(result.helperSessionId).toBeDefined();

    // 5. Helper completes task
    await coordinator.markAgentComplete(result.helperSessionId, result.helperIssueId);

    // 6. Verify helper issue closed
    const finalHelperIssue = await beadsService.getIssue(testProjectPath, result.helperIssueId);
    expect(finalHelperIssue.status).toBe('closed');

    // 7. Parent issue updated with helper result
    const finalParentIssue = await beadsService.getIssue(testProjectPath, parentIssue.id);
    expect(finalParentIssue.description).toContain('Tests written by helper agent');
  });
});
```

---

## Performance Testing

### 1. Memory Service Performance

**Test File:** `apps/server/tests/performance/beads-memory.performance.test.ts`

```typescript
describe('Performance: BeadsMemoryService', () => {
  it('should query context within 100ms with 1000 issues', async () => {
    // Setup: Create 1000 issues
    for (let i = 0; i < 1000; i++) {
      await beadsService.createIssue(testProjectPath, {
        title: `Issue ${i}`,
        description: 'Test issue',
        type: i % 2 === 0 ? 'bug' : 'feature',
      });
    }

    // Measure query time
    const startTime = Date.now();
    const context = await beadsMemoryService.queryRelevantContext(
      testProjectPath,
      'Fix authentication bug'
    );
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100);
    expect(context.relatedBugs.length).toBeGreaterThan(0);
  });

  it('should cache queries to improve performance', async () => {
    // First query (slow)
    const t1 = Date.now();
    await beadsMemoryService.queryRelevantContext(testProjectPath, 'Test query');
    const d1 = Date.now() - t1;

    // Second query (fast - from cache)
    const t2 = Date.now();
    await beadsMemoryService.queryRelevantContext(testProjectPath, 'Test query');
    const d2 = Date.now() - t2;

    expect(d2).toBeLessThan(d1 / 10); // At least 10x faster
  });
});
```

### 2. Coordinator Performance

**Test File:** `apps/server/tests/performance/coordinator.performance.test.ts`

```typescript
describe('Performance: BeadsAgentCoordinator', () => {
  it('should coordinate 50 issues within 5 seconds', async () => {
    // Create 50 ready issues
    for (let i = 0; i < 50; i++) {
      await beadsService.createIssue(testProjectPath, {
        title: `Task ${i}`,
        type: 'task',
        priority: 2,
      });
    }

    // Start coordinator
    const startTime = Date.now();
    await coordinator.start(testProjectPath);

    // Wait for all assignments
    await vi.waitUntil(() => coordinator.getStats().activeAgents === 50);

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(5000);
    expect(coordinator.getStats().activeAgents).toBe(50);
  });

  it('should handle coordination loop efficiently', async () => {
    await coordinator.start(testProjectPath);

    // Run for 10 iterations
    for (let i = 0; i < 10; i++) {
      await vi.runAllTimersAsync();
    }

    // Coordination should not block
    const stats = coordinator.getStats();
    expect(stats.lastCoordinationTime).toBeGreaterThan(0);
  });
});
```

### 3. Live Link Rate Limiting Performance

**Test File:** `apps/server/tests/performance/live-link.performance.test.ts`

```typescript
describe('Performance: BeadsLiveLinkService', () => {
  it('should handle rapid error bursts without creating spam', async () => {
    const service = await setupLiveLinkService({ maxAutoIssuesPerHour: 20 });

    // Simulate 100 rapid errors
    const startTime = Date.now();
    for (let i = 0; i < 100; i++) {
      service.handleAgentError(createErrorData(`Error ${i}`));
    }
    await vi.runAllTimersAsync();
    const duration = Date.now() - startTime;

    // Should only create 20 issues (rate limited)
    expect(mockBeadsService.createIssue).toHaveBeenCalledTimes(20);

    // Should process quickly (< 1s)
    expect(duration).toBeLessThan(1000);
  });
});
```

---

## Test Fixtures and Mocks

### Fixture: Mock Beads Issue

**File:** `apps/server/tests/fixtures/beads-fixtures.ts`

```typescript
import type { BeadsIssue } from '@automaker/types';

export function createMockIssue(
  id: string,
  title: string = 'Test Issue',
  description: string = 'Test description',
  type: 'bug' | 'feature' | 'task' | 'epic' = 'task',
  priority: number = 2,
  status: 'open' | 'in_progress' | 'blocked' | 'closed' = 'open',
  labels: string[] = []
): BeadsIssue {
  return {
    id,
    title,
    description,
    type,
    priority,
    status,
    labels,
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createMockErrorData(sessionId: string, error: string): AgentErrorData {
  return {
    sessionId,
    type: 'error',
    error,
    message: {
      id: `msg-${Date.now()}`,
      content: error,
      timestamp: new Date().toISOString(),
    },
  };
}

export function createMockRequestData(
  sessionId: string,
  title: string,
  description?: string
): AgentRequestData {
  return {
    sessionId,
    type: 'request',
    request: 'create-issue',
    title,
    description,
  };
}
```

### Mock: MCP Bridge

**File:** `apps/server/tests/mocks/mcp-bridge.mock.ts`

```typescript
export function createMockMCPBridge() {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    callTool: vi.fn(),
    isToolAvailable: vi.fn().mockReturnValue(true),

    // Mock Exa code search
    mockCodeSearch: (results: string[]) => {
      return vi.fn().mockResolvedValue(results);
    },

    // Mock Grep GitHub search
    mockGitHubSearch: (issues: Array<{ title: string; url: string }>) => {
      return vi.fn().mockResolvedValue(issues);
    },

    // Mock LSP analysis
    mockLSPAnalysis: (analysis: any) => {
      return vi.fn().mockResolvedValue(analysis);
    },
  };
}
```

### Mock: Agent Registry

**File:** `apps/server/tests/mocks/agent-registry.mock.ts`

```typescript
import type { AgentType, AgentConfig } from '@automaker/types';

export function createMockAgentRegistry() {
  const agents: Map<AgentType, AgentConfig> = new Map([
    [
      'frontend',
      {
        type: 'frontend',
        name: 'Frontend Specialist',
        description: 'Handles UI components',
        systemPrompt: '...',
        defaultMaxTurns: 10,
        capabilities: [
          { name: 'react', description: 'React expertise', tools: [], confidence: 0.9 },
        ],
        autoSelectable: true,
        priority: 10,
      },
    ],
    [
      'backend',
      {
        type: 'backend',
        name: 'Backend Specialist',
        description: 'Handles server logic',
        systemPrompt: '...',
        defaultMaxTurns: 10,
        capabilities: [{ name: 'api', description: 'API design', tools: [], confidence: 0.85 }],
        autoSelectable: true,
        priority: 9,
      },
    ],
    [
      'testing',
      {
        type: 'testing',
        name: 'Testing Specialist',
        description: 'Writes tests',
        systemPrompt: '...',
        defaultMaxTurns: 10,
        capabilities: [{ name: 'jest', description: 'Unit testing', tools: [], confidence: 0.95 }],
        autoSelectable: true,
        priority: 8,
      },
    ],
  ]);

  return {
    getAutoSelectableAgents: vi.fn().mockReturnValue(['frontend', 'backend', 'testing']),
    getAgentConfig: vi.fn((type) => agents.get(type) || null),
    getAgentStats: vi.fn().mockReturnValue({
      usageCount: 10,
      successRate: 0.85,
      avgDuration: 5000,
      lastUsed: Date.now(),
    }),
  };
}
```

### Mock: Beads Service

**File:** `apps/server/tests/mocks/beads-service.mock.ts`

```typescript
export function createMockBeadsService() {
  return {
    validateBeadsInProject: vi.fn().mockResolvedValue({
      installed: true,
      initialized: true,
      canInitialize: false,
      version: '1.0.0',
    }),
    initializeBeads: vi.fn().mockResolvedValue(undefined),
    createIssue: vi.fn().mockResolvedValue({ id: `bd-${Date.now()}` }),
    getIssue: vi.fn(),
    updateIssue: vi.fn().mockResolvedValue(undefined),
    searchIssues: vi.fn().mockResolvedValue([]),
    getDependencies: vi.fn().mockResolvedValue({
      blockedBy: [],
      blocks: [],
      dependsOn: [],
    }),
    addDependency: vi.fn().mockResolvedValue(undefined),
    removeDependency: vi.fn().mockResolvedValue(undefined),
    getReadyWork: vi.fn().mockResolvedValue([]),
    resolveCrossFeatureDependencies: vi.fn().mockResolvedValue([]),
    setEventEmitter: vi.fn(),
  };
}
```

---

## Coverage Requirements

### Minimum Coverage Targets

| Component               | Lines   | Branches | Functions | Statements |
| ----------------------- | ------- | -------- | --------- | ---------- |
| BeadsLiveLinkService    | 85%     | 80%      | 90%       | 85%        |
| BeadsMemoryService      | 85%     | 80%      | 90%       | 85%        |
| BeadsAgentCoordinator   | 85%     | 80%      | 90%       | 85%        |
| BeadsOrchestrator       | 80%     | 75%      | 85%       | 80%        |
| ResearchService (Beads) | 80%     | 75%      | 85%       | 80%        |
| **Overall**             | **82%** | **78%**  | **88%**   | \*\*82%    |

### Coverage Report Generation

```bash
# Generate coverage report
npm run test:server:coverage

# View HTML report
open apps/server/coverage/index.html
```

### Coverage Exclusions

```typescript
// .vitest coverage exclusions
/* istanbul ignore next */
// Configuration validation and edge cases that are hard to test

/* istanbul ignore file */
// Test utilities and fixtures

// Type definitions
// .d.ts files
```

### Critical Paths (Must Cover 100%)

1. **Error to Issue Creation** - Agent error must always create issue
2. **Rate Limiting** - Must prevent spam
3. **Deduplication** - Must prevent duplicates within 24h
4. **Agent Assignment** - Must not assign same issue to multiple agents
5. **Issue Locking** - Must prevent race conditions
6. **Cache Invalidation** - Must expire caches correctly

---

## CI/CD Integration

### GitHub Actions Workflow

**File:** `.github/workflows/test-gastown.yml`

```yaml
name: Test Gastown Features

on:
  pull_request:
    paths:
      - 'apps/server/src/services/beads-*.ts'
      - 'apps/server/tests/**/*beads*.test.ts'
      - 'libs/types/src/beads.ts'
  push:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build:packages
      - run: npm run test:server -- --coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: apps/server/coverage/coverage-final.json
          flags: gastown

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build:packages
      - run: npm run test:server -- apps/server/tests/integration/*beads*.test.ts

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build:packages
      - run: npm run test:server -- apps/server/tests/e2e/*.e2e.test.ts

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build:packages
      - run: npm run test:server -- apps/server/tests/performance/*.performance.test.ts
```

### Pre-Commit Hook

**File:** `.husky/pre-commit`

```bash
#!/bin/sh

# Run Gastown tests on changed files
. "$(dirname "$0")/_/husky.sh"

# Check if Gastown files changed
if git diff --cached --name-only | grep -E 'beads-.*\.(ts|js)$'; then
  echo "Running Gastown feature tests..."
  npm run test:server -- --run apps/server/tests/unit/services/beads-*.test.ts
fi
```

---

## Testing Checklist

### Pre-Implementation

- [ ] Review feature requirements
- [ ] Identify test scenarios
- [ ] Create test fixtures and mocks
- [ ] Set up test data
- [ ] Define coverage targets

### During Implementation

- [ ] Write unit tests first (TDD)
- [ ] Test all public methods
- [ ] Test edge cases
- [ ] Test error paths
- [ ] Mock external dependencies
- [ ] Verify test isolation

### Post-Implementation

- [ ] Run all tests (unit, integration, E2E)
- [ ] Check coverage meets targets
- [ ] Run performance tests
- [ ] Test with real Beads CLI (manual)
- [ ] Test with real MCP tools (manual)
- [ ] Load testing (if applicable)

### Pre-Merge

- [ ] All tests pass locally
- [ ] All tests pass in CI
- [ ] Coverage meets requirements
- [ ] No flaky tests
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Code review approved

### Feature-Specific Checklists

#### BeadsLiveLinkService

- [ ] Creates issues on errors
- [ ] Creates issues on requests
- [ ] Rate limiting enforced
- [ ] Deduplication working
- [ ] Severity assessment accurate
- [ ] Events emitted correctly
- [ ] Shutdown cleans up

#### BeadsMemoryService

- [ ] Queries issues by keywords
- [ ] Categorizes by type
- [ ] Extracts decisions
- [ ] Finds blocking issues
- [ ] Semantic search works
- [ ] Caching works
- [ ] Token estimation accurate

#### BeadsAgentCoordinator

- [ ] Auto-assigns ready work
- [ ] Selects best agent
- [ ] Spawns helpers
- [ ] Locks issues
- [ ] Cleans up stale agents
- [ ] Tracks statistics
- [ ] Respects concurrency limits

#### BeadsOrchestrator

- [ ] Creates execution plans
- [ ] Resolves dependencies
- [ ] Respects priorities
- [ ] Tracks epic progress
- [ ] Handles missing issues

#### ResearchService (Beads)

- [ ] Searches codebase
- [ ] Finds GitHub issues
- [ ] Analyzes dependencies
- [ ] Synthesizes recommendations
- [ ] Returns complete results

---

## Running Tests

### Run All Gastown Tests

```bash
# Unit tests
npm run test:server -- apps/server/tests/unit/services/beads-*.test.ts

# Integration tests
npm run test:server -- apps/server/tests/integration/*beads*.test.ts

# E2E tests
npm run test:server -- apps/server/tests/e2e/*.e2e.test.ts

# Performance tests
npm run test:server -- apps/server/tests/performance/*.performance.test.ts

# All Gastown tests
npm run test:server -- --grep "Beads|Gastown"
```

### Run Specific Test File

```bash
npm run test:server -- beads-live-link-service.test.ts
```

### Run with Coverage

```bash
npm run test:server:coverage -- beads-*.test.ts
```

### Watch Mode

```bash
npm run test:server -- --watch beads-*.test.ts
```

### Debug Tests

```bash
# Run with Node inspector
node --inspect-brk node_modules/.bin/vitest --run beads-*.test.ts
```

---

## Test Data Management

### Test Database Setup

```typescript
// test/setup.ts
import { execSync } from 'child_process';

export function setupTestBeadsDB(testPath: string) {
  // Initialize temporary Beads database
  execSync(`cd ${testPath} && bd init --no-prompt`);

  // Create test issues
  execSync(`bd create "Test Bug 1" --type bug --priority 1`);
  execSync(`bd create "Test Feature 1" --type feature --priority 2`);
  execSync(`bd create "Test Task 1" --type task --priority 3`);
}

export function cleanupTestBeadsDB(testPath: string) {
  // Remove Beads database
  execSync(`rm -rf ${testPath}/.beads`);
}
```

### Test Data Sets

**File:** `apps/server/tests/data/beads-test-data.json`

```json
{
  "issues": [
    {
      "id": "bd-test-1",
      "title": "Authentication token expires prematurely",
      "description": "JWT tokens expire after 5 minutes instead of 1 hour",
      "type": "bug",
      "priority": 1,
      "status": "open",
      "labels": ["auth", "jwt", "urgent"]
    },
    {
      "id": "bd-test-2",
      "title": "Implement OAuth2 login",
      "description": "Add Google and GitHub OAuth providers",
      "type": "feature",
      "priority": 2,
      "status": "open",
      "labels": ["auth", "oauth"]
    },
    {
      "id": "bd-test-3",
      "title": "Add refresh token rotation",
      "description": "DECISION: Implement refresh token rotation for better security",
      "type": "feature",
      "priority": 2,
      "status": "closed",
      "labels": ["auth", "security"]
    }
  ],
  "dependencies": [
    {
      "from": "bd-test-2",
      "to": "bd-test-1",
      "type": "blocks"
    }
  ]
}
```

---

## Troubleshooting Tests

### Common Issues

**1. Tests Fail with "Beads CLI not found"**

```bash
# Install Beads CLI globally
npm install -g @beads/cli

# Or mock in tests
mockBeadsService.validateBeadsInProject.mockResolvedValue({
  installed: true,
  initialized: true
});
```

**2. MCP Tools Not Available**

```typescript
// Mock MCP bridge
mockMCPBridge.isAvailable.mockReturnValue(true);
mockMCPBridge.callTool.mockResolvedValue([]);
```

**3. Tests Timeout**

```typescript
// Increase timeout for slow tests
it(
  'should handle large datasets',
  async () => {
    // Test code
  },
  { timeout: 10000 }
); // 10 seconds
```

**4. Race Conditions in Tests**

```typescript
// Wait for async operations
await vi.waitUntil(() => conditionMet);

// Or run timers
await vi.runAllTimersAsync();
```

---

## Best Practices

### 1. Test Naming

```typescript
// Good - descriptive
it('should create issue with Critical severity when agent crashes', async () => {});

// Bad - vague
it('test error', async () => {});
```

### 2. Test Organization

```typescript
describe('BeadsLiveLinkService', () => {
  describe('initialize', () => {
    it('should initialize successfully');
    it('should warn when Beads not installed');
  });

  describe('handleAgentError', () => {
    describe('severity assessment', () => {
      it('should assess crash as Critical');
      it('should assess timeout as High');
    });
  });
});
```

### 3. Setup/Teardown

```typescript
beforeEach(async () => {
  // Fresh setup for each test
  service = new BeadsLiveLinkService(mockBeadsService, mockEvents);
  await service.initialize(testProjectPath);
});

afterEach(async () => {
  // Clean up
  service.shutdown();
  vi.clearAllMocks();
});
```

### 4. Mock Verification

```typescript
it('should call BeadsService with correct parameters', async () => {
  await service.handleAgentError(errorData);

  expect(mockBeadsService.createIssue).toHaveBeenCalledWith(
    testProjectPath,
    expect.objectContaining({
      type: 'bug',
      priority: 1,
      labels: expect.arrayContaining(['Critical', 'auto-created']),
    })
  );
});
```

### 5. Async Testing

```typescript
// Use async/await
it('should create issue', async () => {
  const result = await service.createIssue(data);
  expect(result).toBeDefined();
});

// Wait for conditions
it('should update status', async () => {
  await service.assignAgent('bd-1', 'agent-1');
  await vi.waitUntil(async () => {
    const issue = await beadsService.getIssue('bd-1');
    return issue.status === 'in_progress';
  });
});
```

---

## Continuous Improvement

### Test Metrics to Track

1. **Test Execution Time** - Aim for < 5 seconds for full suite
2. **Flaky Test Rate** - Target: 0%
3. **Coverage Trends** - Improve over time
4. **Bug Detection Rate** - Catch bugs in development

### Regular Maintenance

- [ ] Review and update tests monthly
- [ ] Remove obsolete tests
- [ ] Refactor duplicated test code
- [ ] Update fixtures and mocks
- [ ] Performance tune slow tests
- [ ] Add tests for new bugs

---

## Appendix

### A. Test File Template

```typescript
/**
 * Unit tests for [ServiceName]
 *
 * [Brief description of what is being tested]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { [ServiceName] } from '@/services/[service-name].js';
import type { [RelevantTypes] } from '@automaker/types';

describe('[ServiceName]', () => {
  let [mocks];
  let service: [ServiceName];
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup mocks
    [mocks] = setupMocks();

    // Create service
    service = new [ServiceName]([mocks]);
  });

  afterEach(() => {
    service.destroy?.();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('[method name]', () => {
    it('should [expected behavior]', async () => {
      // Arrange
      const input = [test data];

      // Act
      const result = await service.[method](input);

      // Assert
      expect(result).toEqual([expected]);
    });
  });
});
```

### B. Useful Vitest Matchers

```typescript
// Object matching
expect(result).toEqual(expected);
expect(result).toMatchObject({ id: 'bd-1' });
expect(result).toHaveProperty('status', 'open');

// Array matching
expect(array).toHaveLength(5);
expect(array).toContain(item);
expect(array).toContainEqual({ id: 'bd-1' });

// Async
await expect(promise).resolves.toEqual(expected);
await expect(promise).rejects.toThrow('error');

// Function calls
expect(mock).toHaveBeenCalled();
expect(mock).toHaveBeenCalledTimes(3);
expect(mock).toHaveBeenCalledWith(arg1, arg2);
expect(mock).toHaveBeenLastCalledWith(lastArg);
expect(mock).toHaveBeenNthCalledWith(2, nthArg);

// Timers
vi.useFakeTimers();
vi.runAllTimers();
vi.runAllTimersAsync();
vi.advanceTimersByTime(1000);
```

### C. Debugging Tips

```typescript
// Console log in tests (will show in vitest output)
console.log('Debug:', result);

// Use debugger statement
debugger; // Execution will pause if running in Node inspector

// Increase verbosity
npm run test:server -- --verbose

// Run single test
npm run test:server -- -t "should create issue"

// Skip tests
it.skip('flaky test', async () => {});
it.only('focused test', async () => {}); // Run only this
```

---

## Conclusion

This comprehensive testing guide ensures the Gastown-inspired features are thoroughly tested before rollout. Follow the testing philosophy, implement the required test cases, and use the provided fixtures and mocks to maintain code quality and prevent regressions.

**Remember:** Well-tested code is maintainable code. Invest in tests upfront to save time debugging later.
