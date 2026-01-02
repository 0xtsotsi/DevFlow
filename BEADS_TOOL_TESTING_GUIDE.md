# Beads Tool Testing Guide

## Overview

Comprehensive test suite to verify that agents can use Beads tools correctly in DevFlow. This includes tests for agent tool access, tool usage tracking, and monitoring integration.

## Test Files

### 1. Unit Tests: Beads Tool Access Verification

**File:** `apps/server/tests/unit/agents/beads-tool-usage.test.ts`

**Purpose:** Verify each agent has the correct Beads tools in their `allowedTools` configuration.

**Test Coverage:**

- **Agent Tool Access** (22 tests)
  - Verifies each agent type has access to the correct Beads tools
  - Tests that agents without Beads tools don't have them
  - Checks that Beads tools are included in capabilities where appropriate

- **Beads Tool Distribution** (4 tests)
  - Validates tool distribution across all agents
  - Ensures correct count of agents with each Beads tool
  - Verifies all agents with Beads tools have `allowedTools` defined

- **Tool Access Patterns** (5 tests)
  - Validates expected patterns of tool access
  - Ensures agents have the right combination of tools for their role

- **Edge Cases** (4 tests)
  - Handles agents with undefined `allowedTools`
  - Ensures no duplicate tools in any agent configuration
  - Validates all Beads tool names are correct

- **System Prompt References** (6 tests)
  - Verifies agent system prompts reference Beads tools appropriately
  - Ensures documentation in prompts matches tool access

**Key Test Results:**

- Planning Agent: `query_beads_memory`, `spawn_helper_agent` (not `create_beads_issue`)
- Testing Agent: `create_beads_issue`, `query_beads_memory` (not `spawn_helper_agent`)
- Review Agent: `create_beads_issue` only (not `query_beads_memory`, `spawn_helper_agent`)
- Debug Agent: `create_beads_issue`, `query_beads_memory` (not `spawn_helper_agent`)
- Documentation Agent: `create_beads_issue`, `query_beads_memory` (not `spawn_helper_agent`)
- Refactoring Agent: `create_beads_issue`, `query_beads_memory` (not `spawn_helper_agent`)
- Orchestration Agent: All Beads tools in capabilities (not `allowedTools`)
- Implementation Agent: No Beads tools (`allowedTools` is `undefined`)
- Generic Agent: No Beads tools (`allowedTools` is `undefined`)

**Total Tests:** 41 tests

### 2. Integration Tests: Agent Monitoring

**File:** `apps/server/tests/integration/agent-monitoring.test.ts`

**Purpose:** Test tool usage tracking functionality and statistics recording.

**Test Coverage:**

- **Tool Usage Tracking** (5 tests)
  - Tracks when agents use Beads tools
  - Tracks multiple tool uses in a session
  - Tracks tool usage across multiple sessions
  - Differentiates between Beads and non-Beads tools
  - Emits tool usage events

- **Statistics Recording** (6 tests)
  - Records successful session completion
  - Records aborted sessions
  - Calculates average response time
  - Tracks error counts
  - Tracks message counts
  - Updates last activity time

- **Health Status Tracking** (5 tests)
  - Reports active sessions
  - Reports completed sessions
  - Reports error sessions
  - Calculates average duration

- **Performance Metrics** (5 tests)
  - Tracks total requests
  - Tracks successful vs failed requests
  - Tracks total tool calls
  - Tracks uptime

- **Session Management** (5 tests)
  - Gets active sessions
  - Returns null for non-existent sessions
  - Handles session auto-creation on agent stream events
  - Handles tool use events from agent streams
  - Handles error events from agent streams

- **Monitoring Snapshot** (4 tests)
  - Generates comprehensive snapshot
  - Includes active sessions in snapshot
  - Includes health status in snapshot
  - Includes performance metrics in snapshot

- **Cleanup and Maintenance** (3 tests)
  - Clears old sessions
  - Does not clear active sessions
  - Resets all metrics

- **Beads Tool-Specific Monitoring** (5 tests)
  - Tracks `create_beads_issue` usage
  - Tracks `query_beads_memory` usage
  - Tracks `spawn_helper_agent` usage
  - Tracks all three Beads tools in one session
  - Emits events for all Beads tool uses

**Total Tests:** 37 tests

### 3. Test Utilities

**File:** `apps/server/tests/unit/agents/helpers/agent-test-utils.ts`

**Purpose:** Helper functions for testing agent configurations and tool access.

**Key Functions:**

- `createMockAgent()` - Create mock agent configuration
- `createMockAgentWithAllBeadsTools()` - Create agent with all Beads tools
- `createMockAgentWithNoBeadsTools()` - Create agent without Beads tools
- `getAgentsWithBeadsTool()` - Get agents with access to a specific tool
- `agentHasToolAccess()` - Check if agent has access to a tool
- `getBeadsToolsForAgent()` - Get all Beads tools for an agent
- `assertAgentBeadsToolAccess()` - Assert agent has expected tool access
- `getBeadsToolAccessStats()` - Get count of agents with each tool
- `verifyExpectedToolAccess()` - Verify tool access matches expectations

## Running the Tests

### Run All Beads Tool Tests

```bash
npm run test:server -- beads-tool-usage
npm run test:server -- agent-monitoring
```

### Run All Server Tests

```bash
npm run test:server
```

### Run with Coverage

```bash
npm run test:server -- --coverage
```

## Success Criteria

All tests pass:

- ✅ 41 unit tests for Beads tool access
- ✅ 37 integration tests for agent monitoring
- ✅ All 78 tests comprehensive and well-documented
- ✅ Tests follow Vitest patterns used in the codebase
- ✅ Tests can be run with `npm run test:server`
- ✅ No breaking changes to existing tests (1080 tests still passing)

## Test Structure

### Vitest Pattern

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  describe('Specific Aspect', () => {
    it('should do something specific', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Assertions

- Clear, descriptive test names
- Single assertion per test when possible
- Good use of Vitest matchers (`toContain`, `toBeGreaterThan`, etc.)
- Proper setup and teardown with `beforeEach`/`afterEach`

## What Was Tested

### Agent Tool Access

✅ Each agent type has correct Beads tools in `allowedTools`
✅ Agents without Beads tools don't have them
✅ No duplicate tools in any agent configuration
✅ All Beads tool names are valid

### Tool Usage Tracking

✅ Tools are tracked when used
✅ Statistics are recorded correctly
✅ Events are emitted for tool usage
✅ Multiple tools can be tracked in a session

### Agent Monitoring

✅ Sessions are tracked from start to completion
✅ Health status is accurately reported
✅ Performance metrics are collected
✅ Old sessions are cleaned up

### Edge Cases

✅ Agents with undefined `allowedTools` are handled
✅ Non-existent sessions return null
✅ Auto-creation of sessions on agent events works
✅ Error conditions are tracked

## Integration with Existing Code

The tests integrate with:

- `apps/server/src/agents/agent-prompts.ts` - Agent configurations
- `apps/server/src/services/agent-monitor-service.ts` - Monitoring service
- `apps/server/src/lib/events.ts` - Event system
- Existing test patterns and utilities

## Future Enhancements

Potential improvements:

1. Add tests for tool usage authorization
2. Add tests for tool usage limits and rate limiting
3. Add performance benchmarks for tool usage tracking
4. Add tests for tool usage analytics and reporting
5. Add visual regression tests for monitoring UI

## Maintenance

When adding new Beads tools:

1. Update `BEADS_TOOLS` in test utilities
2. Add tests for new tool in `beads-tool-usage.test.ts`
3. Add monitoring tests in `agent-monitoring.test.ts`
4. Update expected access patterns

When modifying agent configurations:

1. Update expected tool access in tests
2. Verify system prompt references match
3. Run full test suite to ensure no regressions
