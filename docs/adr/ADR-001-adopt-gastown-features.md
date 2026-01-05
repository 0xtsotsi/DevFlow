# ADR-001: Adopt Gastown-inspired Features Without Full Integration

## Status

**Accepted**

## Context

Gastown is a sophisticated multi-agent orchestration system that provides advanced features like:

- **Witness System**: Automated monitoring and validation of agent outputs
- **Refinery**: Output quality improvement through iterative refinement
- **Deacon**: Reputation-based agent selection and trust scoring
- **MEOW Workflow**: Hierarchical task decomposition (Missions → Epochs → Operations → Work)

DevFlow currently has a working Beads integration for task management and agent coordination. The question is whether to:

1. Fully integrate Gastown as a dependency
2. Adopt only Gastown's conceptual patterns and implement them ourselves
3. Ignore Gastown and continue with current approach

### Decision Drivers

- **Complexity**: Full Gastown integration would add significant complexity
- **Maintenance**: External dependencies increase maintenance burden
- **Compatibility**: Need to ensure compatibility with existing Beads integration
- **Control**: Want to maintain control over architecture and evolution
- **Value**: Gastown features (agent scoring, output validation, hierarchical workflows) provide value
- **Timeline**: Limited development resources, need pragmatic approach

## Considered Alternatives

### Alternative 1: Full Gastown Integration

**Description**: Import Gastown as a dependency and use its components directly.

**Pros**:

- Get all Gastown features immediately
- Leverage battle-tested code
- Benefit from Gastown community updates

**Cons**:

- Heavy dependency (~50MB+)
- Complex integration with existing Beads system
- Loss of architectural control
- Potential conflicts with existing agent coordination
- Steep learning curve for team
- Harder to customize for DevFlow needs
- License/attribution concerns

### Alternative 2: Ignore Gastown Entirely

**Description**: Continue with current DevFlow architecture without Gastown influence.

**Pros**:

- Simpler architecture
- No external dependencies
- Team already familiar with codebase

**Cons**:

- Miss out on proven patterns (agent scoring, output validation)
- Need to reinvent wheels
- Potential competitive disadvantage
- Limited innovation in agent coordination

### Alternative 3: Adopt Gastown Patterns, Implement Independently (SELECTED)

**Description**: Study Gastown's architecture and implement key features using our own stack, adapted to DevFlow's needs.

**Pros**:

- Maintain architectural control
- Lean implementation (~10% of Gastown's size)
- Seamless integration with existing Beads system
- Can prioritize high-value features
- Customize for DevFlow's specific use cases
- No dependency hell
- Team learns patterns deeply

**Cons**:

- Initial development effort
- Need to study Gastown codebase
- Responsibility for maintenance

## Decision

**Adopt Gastown patterns and implement independently.**

We will implement Gastown-inspired features using DevFlow's existing infrastructure:

- **Enhanced Agent Scoring** (Deacon-inspired): Improve BeadsAgentCoordinator scoring
- **Optional Fields in Beads** (Witness/Refinery-inspired): Add quality metrics without schema changes
- **MEOW-like Hierarchy**: Leverage Beads' existing parent/child relationships
- **Feature Flags**: Gradual rollout using environment variables

## Rationale

1. **Architectural Control**: DevFlow has a unique value proposition as a development studio. Full Gastown integration would compromise our vision.

2. **Beads Synergy**: Our existing Beads integration provides task management, dependency tracking, and agent coordination. Gastown features can be layered on top without disruption.

3. **Selective Implementation**: Not all Gastown features are equally valuable. We can prioritize:
   - Agent reputation scoring (high value)
   - Output validation (medium value)
   - Hierarchical workflows (medium value)
   - Witness/Refinery (lower value, can be added later)

4. **Maintenance**: Independent implementation means we control updates, bug fixes, and evolution. No waiting on upstream changes.

5. **Performance**: Leaner implementation means faster startup, lower memory footprint, and easier debugging.

## Consequences

### Positive

- **Maintainable Architecture**: Code remains in one cohesive system
- **Gradual Adoption**: Can adopt features incrementally as needed
- **Custom Fit**: Solutions tailored to DevFlow's specific needs
- **No Dependency Bloat**: Avoid adding 50MB+ of Gastown code
- **Team Learning**: Team gains deep understanding of patterns
- **Flexibility**: Easy to adapt or extend as requirements evolve

### Negative

- **Initial Investment**: Requires development time to implement features
- **Maintenance Responsibility**: We own the code, no upstream bug fixes
- **Feature Parity**: May not implement all Gastown features
- **Provenance**: Need to attribute patterns to Gastown appropriately

### Implementation Strategy

- **Phase 1**: Enhanced agent scoring (ADR-003)
- **Phase 2**: Optional quality metrics (ADR-002)
- **Phase 3**: MEOW workflow hierarchy (ADR-005)
- **Phase 4**: Patrol system (ADR-004) - future consideration

## Related Decisions

- [ADR-002: Use Optional Beads Fields Instead of Schema Migration](ADR-002-use-optional-beads-fields.md)
- [ADR-003: Implement Enhanced Agent Scoring as Opt-in](ADR-003-enhanced-agent-scoring.md)
- [ADR-004: Patrol System Architecture](ADR-004-patrol-system.md)
- [ADR-005: MEOW Workflow Hierarchy](ADR-005-meow-workflow-hierarchy.md)
- [ADR-006: Feature Flag Strategy](ADR-006-feature-flag-strategy.md)

## References

- Gastown Repository: [hypertext-code/gastown](https://github.com/hypertext-code/gastown)
- Beads Documentation: `/home/codespace/DevFlow/CLAUDE.md` (Beads Autonomous Memory System section)
- BeadsAgentCoordinator: `/home/codespace/DevFlow/apps/server/src/services/beads-agent-coordinator.ts`
