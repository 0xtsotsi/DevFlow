# ADR-007: Event Namespace Isolation (gastown: prefix)

## Status

**Accepted**

## Context

DevFlow uses an event-driven architecture for service communication. The EventEmitter is used by:

- BeadsAgentCoordinator: `beads:agent-assigned`, `beads:helper-spawned`, `beads:agent-completed`
- BeadsService: `beads:issue-created`, `beads:issue-updated`, `beads:issue-closed`
- BeadsLiveLink: `beads:auto-issue-created`
- BeadsMemoryService: `beads:memory-query`
- AutoModeService: `agent:started`, `agent:completed`, `agent:failed`
- CheckpointService: `checkpoint:created`, `checkpoint:restored`

As we add Gastown-inspired features (Witness, Refinery, Deacon, QualityMetrics), we'll emit new events for:

- Output validation results
- Quality metric updates
- Reputation changes
- Patrol system state changes
- Feature flag changes

We need a naming convention that:

1. Organizes events by feature/subsystem
2. Prevents naming conflicts
3. Makes event sources clear
4. Supports future extensibility

### Current Event Patterns

```typescript
// Beads-related events
'beads:agent-assigned';
'beads:issue-created';
'beads:sync-completed';

// Agent lifecycle events
'agent:started';
'agent:completed';
'agent:failed';

// Checkpoint events
'checkpoint:created';
'checkpoint:restored';
```

### Decision Drivers

- **Clarity**: Event names should clearly indicate their source
- **Namespacing**: Avoid conflicts between subsystems
- **Discoverability**: Easy to find all events for a feature
- **Consistency**: Follow existing patterns
- **Future-Proof**: Accommodate new features without renaming

## Considered Alternatives

### Alternative 1: Use Existing `beads:` Namespace

**Description**: Add all Gastown-inspired events under the `beads:` prefix.

**Examples**:

```typescript
'beads:witness-validation';
'beads:quality-recorded';
'beads:reputation-updated';
'beads:patrol-refinement-started';
```

**Pros**:

- Consistent with current Beads events
- Fewer top-level namespaces
- Clear relationship to Beads system

**Cons**:

- **Misleading**: Not all events are directly from Beads (e.g., quality metrics)
- **Namespace Pollution**: `beads:` becomes too broad
- **Coupling**: Ties Gastown features too tightly to Beads
- **Discovery**: Hard to find "all patrol events" (mixed with other beads events)

### Alternative 2: Feature-Based Namespaces (witness:, refinery:, deacon:)

**Description**: Use separate namespace for each Gastown component.

**Examples**:

```typescript
'witness:validation-complete';
'witness:validation-failed';
'refinery:refinement-started';
'refinery:refinement-complete';
'deacon:reputation-updated';
'deacon:agent-score-changed';
'quality:metric-recorded';
'quality:persistence-complete';
```

**Pros**:

- **Clear Source**: Event origin is obvious
- **Easy Filtering**: Can subscribe to all `witness:*` events
- **Decoupled**: Each component has its own namespace
- **Extensible**: Easy to add new components

**Cons**:

- **Namespace Proliferation**: Many top-level namespaces to manage
- **Scattered**: Related events spread across namespaces (e.g., validation → quality → reputation)
- **Inconsistent**: Doesn't follow `beads:` pattern
- **Documentation**: Need to document each namespace separately

### Alternative 3: Single `gastown:` Namespace (SELECTED)

**Description**: Use `gastown:` prefix for all Gastown-inspired features, with subsystem as second level.

**Examples**:

```typescript
// Witness events
'gastown:witness:validation-complete';
'gastown:witness:validation-failed';

// Refinery events
'gastown:refinery:refinement-started';
'gastown:refinery:refinement-complete';

// Deacon events
'gastown:deacon:reputation-updated';
'gastown:deacon:agent-score-changed';

// Quality metrics events
'gastown:quality:metric-recorded';
'gastown:quality:persistence-complete';

// General patrol events
'gastown:patrol:cycle-started';
'gastown:patrol:cycle-complete';
```

**Pros**:

- **Logical Grouping**: All Gastown events under one parent namespace
- **Hierarchical**: `gastown:*` captures all, `gastown:witness:*` captures subsystem
- **Clear Origin**: Obvious these are from Gastown-inspired features
- **Namespaced**: Won't conflict with `beads:`, `agent:`, `checkpoint:`
- **Discoverable**: Easy to find all related events
- **Future-Proof**: New Gastown features fit naturally under `gastown:`
- **Documentable**: Single section in docs for all Gastown events

**Cons**:

- **Namespace Length**: Events are longer (`gastown:witness:validation-complete`)
- **Misattribution**: "Gastown" implies direct integration, not inspiration
- **Learning Curve**: Need to explain `gastown:` vs `beads:` distinction

### Alternative 4: Subsystem-Based Namespaces (patrol:, quality:)

**Description**: Use descriptive namespace for functional area, not Gastown name.

**Examples**:

```typescript
// Patrol system
'patrol:witness:validation-complete';
'patrol:refinery:refinement-started';
'patrol:deacon:reputation-updated';

// Quality system
'quality:metric-recorded';
'quality:agent-score-updated';
```

**Pros**:

- **Descriptive**: Namespace describes function, not origin
- **Clearer**: "patrol" is more intuitive than "gastown"
- **Decoupled**: Not tied to Gastown name

**Cons**:

- **Vague**: "patrol" doesn't clearly indicate it's Gastown-inspired
- **Generic**: Might conflict with other patrol-like systems in future
- **Inconsistent**: Doesn't acknowledge Gastown as inspiration
- **Documentation**: Harder to trace decisions back to Gastown research

### Alternative 5: Hybrid - `beads:gastown:` Namespace

**Description**: Nest Gastown events under Beads namespace.

**Examples**:

```typescript
'beads:gastown:witness:validation-complete';
'beads:gastown:quality:metric-recorded';
```

**Pros**:

- Shows relationship to Beads system
- Hierarchical organization

**Cons**:

- **Too Deep**: Three-level namespace is verbose
- **Confusing**: Why "beads:gastown" if not full Gastown?
- **Inconsistent**: Other Beads events don't have third level

## Decision

**Single `gastown:` Namespace (Alternative 3).**

All Gastown-inspired features will use the `gastown:` event namespace prefix, with subsystem names as second level: `gastown:<subsystem>:<action>`.

## Rationale

1. **Clear Attribution**: The `gastown:` prefix makes it obvious these events are inspired by Gastown architecture. This is important for transparency and documentation.

2. **Namespace Isolation**: By using `gastown:` instead of `beads:`, we avoid polluting the Beads namespace. Gastown-inspired features are a separate concern from core Beads functionality.

3. **Hierarchical Filtering**: Subsystems like `witness`, `refinery`, `deacon` as second levels allow filtering:
   - Subscribe to `gastown:*` for all Gastown events
   - Subscribe to `gastown:witness:*` for Witness-specific events

4. **Future Extensibility**: If we add more Gastown-inspired features, they fit naturally under `gastown:` without conflicts.

5. **Documentation**: All Gastown events are grouped in documentation, making it easy to understand the system as a whole.

6. **Consistent with Existing Pattern**: We already use `beads:`, `agent:`, `checkpoint:`. Adding `gastown:` follows the same pattern.

7. **Attribution**: Using `gastown:` (rather than generic names like `patrol:`) properly attributes the architectural inspiration to Gastown project.

## Event Naming Convention

### Format

```
gastown:<subsystem>:<action>
```

### Subsystem Names

- `witness` - Output validation
- `refinery` - Output refinement
- `deacon` - Reputation tracking
- `quality` - Quality metrics
- `patrol` - General patrol system (cross-subsystem events)

### Actions

Use past tense for completed events, present tense for ongoing:

- `validation-complete` (past)
- `validation-started` (past)
- `refinement-started` (past)
- `metric-recorded` (past)
- `reputation-updated` (past)

## Event Catalog

### Witness Events

```typescript
'gastown:witness:validation-started';
// { agentType, issueId, outputId }

'gastown:witness:validation-complete';
// { agentType, issueId, outputId, result: ValidationResult }

'gastown:witness:validation-failed';
// { agentType, issueId, outputId, failures: string[] }
```

### Refinery Events

```typescript
'gastown:refinery:refinement-started';
// { agentType, issueId, outputId, validationFailures }

'gastown:refinery:refinement-complete';
// { agentType, issueId, outputId, refinedOutput, iterations }

'gastown:refinery:refinement-failed';
// { agentType, issueId, outputId, reason }
```

### Deacon Events

```typescript
'gastown:deacon:reputation-updated';
// { agentType, oldReputation, newReputation, reason }

'gastown:deacon:agent-score-changed';
// { agentType, oldScore, newScore, factors }

'gastown:deacon:selection-influenced';
// { issueId, selectedAgent, alternatives, deaconScores }
```

### Quality Events

```typescript
'gastown:quality:metric-recorded';
// { issueId, agentType, qualityScore, validationId }

'gastown:quality:persistence-complete';
// { metricsCount, filePath, duration }

'gastown:quality:agent-history-queried';
// { agentType, historyLength, avgQuality }
```

### General Patrol Events

```typescript
'gastown:patrol:cycle-started';
// { issueId, agentType, stages: ['witness', 'refinery'] }

'gastown:patrol:cycle-complete';
// { issueId, agentType, duration, results }

'gastown:patrol:cycle-failed';
// { issueId, agentType, stage, reason }
```

### Feature Flag Events

```typescript
'gastown:feature:flag-checked';
// { flag, enabled, timestamp }

'gastown:feature:flags-reloaded';
// { flagsCount, timestamp }
```

## Implementation

### Event Constants

```typescript
// apps/server/src/lib/gastown-events.ts

export const GASTOWN_EVENTS = {
  // Witness
  WITNESS_VALIDATION_STARTED: 'gastown:witness:validation-started',
  WITNESS_VALIDATION_COMPLETE: 'gastown:witness:validation-complete',
  WITNESS_VALIDATION_FAILED: 'gastown:witness:validation-failed',

  // Refinery
  REFINERY_REFINEMENT_STARTED: 'gastown:refinery:refinement-started',
  REFINERY_REFINEMENT_COMPLETE: 'gastown:refinery:refinement-complete',
  REFINERY_REFINEMENT_FAILED: 'gastown:refinery:refinement-failed',

  // Deacon
  DEACON_REPUTATION_UPDATED: 'gastown:deacon:reputation-updated',
  DEACON_AGENT_SCORE_CHANGED: 'gastown:deacon:agent-score-changed',
  DEACON_SELECTION_INFLUENCED: 'gastown:deacon:selection-influenced',

  // Quality
  QUALITY_METRIC_RECORDED: 'gastown:quality:metric-recorded',
  QUALITY_PERSISTENCE_COMPLETE: 'gastown:quality:persistence-complete',

  // Patrol
  PATROL_CYCLE_STARTED: 'gastown:patrol:cycle-started',
  PATROL_CYCLE_COMPLETE: 'gastown:patrol:cycle-complete',

  // Feature Flags
  FEATURE_FLAG_CHECKED: 'gastown:feature:flag-checked',
} as const;
```

### Usage in Services

```typescript
import { GASTOWN_EVENTS } from '../lib/gastown-events.js';

class WitnessService {
  async validateOutput(...) {
    this.events.emit(GASTOWN_EVENTS.WITNESS_VALIDATION_STARTED, {
      agentType,
      issueId,
      outputId
    });

    const result = await this.performValidation(...);

    this.events.emit(GASTOWN_EVENTS.WITNESS_VALIDATION_COMPLETE, {
      agentType,
      issueId,
      outputId,
      result
    });

    return result;
  }
}
```

### Event Documentation

Add to `/home/codespace/DevFlow/docs/gastown-events.md`:

```markdown
# Gastown Events

All events emitted by Gastown-inspired features use the `gastown:` namespace prefix.

## Subsystem Events

### Witness (`gastown:witness:*`)

...

### Refinery (`gastown:refinery:*`)

...
```

## Consequences

### Positive

- **Namespace Isolation**: Gastown events won't conflict with other systems
- **Clear Organization**: Easy to find and understand all Gastown events
- **Hierarchical Filtering**: Can subscribe to `gastown:*` or `gastown:witness:*`
- **Future-Proof**: New Gastown features fit naturally
- **Proper Attribution**: Clear these are inspired by Gastown
- **Documentation**: Single section in docs for all events

### Negative

- **Namespace Proliferation**: Adds another top-level namespace
- **Verbose Names**: Events are longer (`gastown:witness:validation-complete`)
- **Potential Confusion**: Might imply tighter Gastown integration than exists

### Migration

No migration needed. New events use `gastown:` namespace, existing events unchanged.

## Best Practices

1. **Use Constants**: Import events from `gastown-events.ts`, don't use string literals
2. **Emit Consistently**: Always emit both `_STARTED` and `_COMPLETE` events
3. **Include Context**: Event payloads should include `issueId`, `agentType` where relevant
4. **Document Events**: Add all events to `gastown-events.md` documentation
5. **Error Events**: Use `_FAILED` suffix for failures
6. **Test Events**: Unit tests should verify events are emitted correctly

## Related Decisions

- [ADR-001: Adopt Gastown-inspired Features Without Full Integration](ADR-001-adopt-gastown-features.md)
- [ADR-004: Patrol System Architecture](ADR-004-patrol-system.md)
- [ADR-006: Feature Flag Strategy for Gradual Rollout](ADR-006-feature-flag-strategy.md)

## References

- Event Types: `/home/codespace/DevFlow/libs/types/src/events.ts`
- EventEmitter: `/home/codespace/DevFlow/apps/server/src/lib/events.ts`
- Gastown Events Documentation: `/home/codespace/DevFlow/docs/gastown-events.md` (to be created)
