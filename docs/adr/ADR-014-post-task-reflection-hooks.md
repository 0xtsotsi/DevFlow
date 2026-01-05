# ADR-014: Post-Task Reflection Hooks

**Status**: Accepted
**Date**: 2025-01-05
**Decision Makers**: DevFlow Team
**Related ADRs**: [ADR-011](ADR-011-hooks-system.md), [ADR-013](ADR-013-reflect-skill.md)

## Context and Problem Statement

DevFlow needs a mechanism to automatically trigger reflection after tasks complete. The Reflect skill exists (ADR-013) but requires manual invocation. We want to integrate reflection into the normal workflow without requiring explicit user action.

Key requirements:

1. **Automatic Triggering**: Reflection should happen automatically after task completion
2. **Non-Blocking**: Should not prevent workflow completion
3. **Optional**: Users should be able to disable if not needed
4. **Storage**: Reflections should be stored for future reference

## Decision Drivers

- **Automation**: Reduce manual steps in the improvement cycle
- **Safety**: Should not block task completion or introduce failures
- **Observability**: Reflections should be accessible and useful
- **Integration**: Works with existing hooks system (ADR-011)

## Considered Options

### Option 1: Blocking Post-Task Reflection Hook

Reflection runs as a blocking hook after each task.

**Good**:

- Guarantees reflection is completed before marking task done
- User sees reflection immediately

**Bad**:

- Adds delay to task completion
- If reflection fails, task appears to fail
- Poor UX for quick tasks

### Option 2: Non-Blocking Post-Task Reflection Hook

Reflection runs as a non-blocking hook that doesn't affect task status.

**Good**:

- Doesn't delay task completion
- Reflection failures don't affect task status
- Can run in background
- Better UX

**Bad**:

- Reflection may complete after user moves on
- Less immediate feedback
- Needs separate mechanism to view results

### Option 3: Manual Reflection Only

Users must manually invoke reflection after each task.

**Good**:

- No overhead
- Full user control

**Bad**:

- Easy to forget
- Inconsistent adoption
- Lost learning opportunities

### Option 4: Scheduled Async Reflection

Reflection is queued and processed asynchronously.

**Good**:

- Zero delay for task completion
- Can batch process reflections

**Bad**:

- Requires queue infrastructure
- More complex implementation
- Less predictable timing

## Decision Outcome

**Chosen option**: Option 2 - Non-Blocking Post-Task Reflection Hook

A non-blocking hook provides the best balance of automation and user experience. Reflections happen automatically but don't interfere with task completion.

### Consequences

**Positive**:

- Automatic reflection after every task
- No delay to task completion
- Reflections stored for future reference
- Can be disabled by users

**Negative**:

- Reflections complete asynchronously (less immediate)
- Users may need to check separate location for results
- Initial hook runs will have placeholder behavior (full reflection requires conversation history)

**Neutral**:

- Hook provides hint to use Reflect skill for detailed analysis
- Future: Can integrate with conversation history for full automation

## Architecture

### Hook Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Execution Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │  Pre-Task    │ → → │   Execute    │ → → │  Post-Task   │   │
│  │    Hooks     │     │     Task     │     │    Hooks     │   │
│  └──────────────┘     └──────────────┘     └──────────────┘   │
│                                                     │           │
│                                        ┌────────────────────┐  │
│                                        │ Post-Task          │  │
│                                        │ Reflection Hook    │  │
│                                        │ (non-blocking)      │  │
│                                        └────────────────────┘  │
│                                                     │           │
│                                                     ↓           │
│                                        ┌────────────────────┐  │
│                                        │ Hint: Use /reflect │  │
│                                        │ for detailed       │  │
│                                        │ analysis           │  │
│                                        └────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Hook Definition

```javascript
{
  type: 'post-task',
  name: 'Post-Task Reflection',
  description: 'Generate reflection on task execution for continuous improvement',
  mode: 'non-blocking',
  enabled: true,
  priority: 50,
  timeout: 30000,
  implementation: `
    // Post-task reflection hook for continuous improvement
    // This hook runs after task completion to generate insights
    // Note: Full reflection requires conversation history which is
    // available via the ReflectSkillService, not in hook context
    return {
      success: true,
      message: 'Post-task reflection noted. Use /reflect skill for detailed analysis.',
      data: {
        hint: 'Run reflect skill with conversation history for detailed analysis',
        sessionId: context.sessionId
      }
    };
  `
}
```

### Integration with Reflect Skill

The hook provides a bridge to the full Reflect skill:

```typescript
// Hook returns hint
{
  data: {
    hint: 'Run reflect skill with conversation history for detailed analysis',
    sessionId: context.sessionId
  }
}

// User can then invoke:
// /reflect --session <sessionId> --conversation <history>
```

### Future Enhancement: Full Integration

With conversation history access, the hook could:

1. Automatically trigger ReflectSkillService
2. Store reflection in Beads memory
3. Provide immediate feedback

```typescript
// Future implementation
async function postTaskReflectionHook(context: HookContext) {
  const conversation = await getConversationHistory(context.sessionId);
  const reflection = await reflectSkillService.execute({
    projectPath: context.projectPath,
    sessionId: context.sessionId,
    conversation,
    storeInBeads: true,
  });

  return {
    success: true,
    message: `Reflection complete: ${reflection.successScore * 100}% success score`,
    data: reflection,
  };
}
```

## Configuration

Enable/disable the reflection hook via the hooks service:

```bash
# Disable reflection hook
PUT /api/hooks/post-task-reflection
{
  "enabled": false
}
```

Or via environment variable (future):

```bash
# Disable automatic reflection
POST_TASK_REFLECTION_ENABLED=false
```

## Usage

### With Current Implementation

1. Task completes
2. Post-task reflection hook runs
3. Hook returns hint to use Reflect skill
4. User can manually invoke `/reflect` with conversation history

### With Future Enhancement

1. Task completes
2. Post-task reflection hook runs
3. Reflection is automatically generated
4. Reflection stored in Beads memory
5. User can query reflections via API

## API

### Disable Reflection Hook

```bash
PUT /api/hooks/post-task-reflection-hook
{
  "enabled": false
}
```

### Get Reflection History

```bash
GET /api/skills/reflect/history?projectPath=/path/to/project
```

### Clear Reflection History

```bash
DELETE /api/skills/reflect/history?projectPath=/path/to/project
```

## File Locations

| File                                                | Purpose         |
| --------------------------------------------------- | --------------- |
| `apps/server/src/services/hooks-service.ts`         | Hook definition |
| `apps/server/src/services/reflect-skill-service.ts` | Reflect skill   |
| `docs/adr/ADR-014-post-task-reflection-hooks.md`    | This ADR        |

## Related Links

- [Hooks System ADR](ADR-011-hooks-system.md) - Hooks architecture
- [Reflect Skill ADR](ADR-013-reflect-skill.md) - Reflect skill details
- [Hooks Guide](../HOOKS_GUIDE.md) - Hooks usage guide
