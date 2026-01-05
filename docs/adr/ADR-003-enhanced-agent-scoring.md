# ADR-003: Implement Enhanced Agent Scoring as Opt-in

## Status

**Accepted**

## Context

The current BeadsAgentCoordinator implements basic agent selection scoring:

```typescript
// Current implementation (simplified)
score = capabilityMatch * 0.4 + successRate * 0.4 + availability * 0.2;
```

This is a good foundation, but Gastown's Deacon system suggests additional factors could improve selection:

- **Historical Performance**: Track agent success rate on similar tasks
- **Output Quality**: Average quality scores from past executions
- **Speed/Performance**: Average completion time
- **Refinement Rate**: How often agent outputs need correction
- **Reputation Decay**: Reduce weight of old data over time

### Decision Drivers

- **Backward Compatibility**: Existing coordination behavior must remain stable
- **Incremental Adoption**: Users should control when to use enhanced scoring
- **Performance**: Scoring should not slow down coordination loop
- **Observability**: Users should understand why agents are selected
- **Flexibility**: Different projects might need different scoring weights

## Considered Alternatives

### Alternative 1: Replace Current Scoring with Enhanced Version

**Description**: Immediately upgrade all agent selection to use enhanced scoring.

**Pros**:

- All users benefit from improvements immediately
- Single code path to maintain
- Simpler testing (no conditional logic)

**Cons**:

- **Breaking Change**: Existing workflows may behave differently
- **Unproven**: Enhanced scoring not validated in production
- **Hard to Revert**: If issues arise, difficult to roll back
- **One Size Fits All**: Doesn't account for project-specific needs
- **Risk**: Could introduce coordination instability

### Alternative 2: Enhanced Scoring as Opt-in Feature (SELECTED)

**Description**: Add enhanced scoring behind a feature flag. Projects explicitly enable it.

**Configuration**:

```typescript
// .env or project config
BEADS_ENHANCED_SCORING_ENABLED = true;
BEADS_SCORING_WEIGHTS = '{"quality":0.3,"speed":0.1,"refinement":0.2}';
```

**Pros**:

- **Backward Compatible**: Existing projects unaffected
- **Gradual Rollout**: Can test with beta users first
- **Easy Revert**: Disable flag if issues arise
- **Customizable**: Projects can tune weights
- **A/B Testing**: Can compare old vs new scoring
- **Low Risk**: Fail-safe approach

**Cons**:

- **Feature Flag Management**: Additional configuration complexity
- **Testing Overhead**: Must test both code paths
- **Documentation**: Need to explain when to use enhanced scoring
- **Adoption Risk**: Users might not opt in, missing benefits

### Alternative 3: Parallel Scoring with Recommendation

**Description**: Run both scoring systems, log differences, recommend enhanced but don't auto-apply.

**Pros**:

- Full visibility into differences
- No behavior changes until user decides
- Great for validation/testing

**Cons**:

- **Performance Overhead**: Running both algorithms doubles work
- **Complexity**: Need to compare and reconcile results
- **User Confusion**: What does user do with two scores?
- **Indecision**: Users might never switch to enhanced

### Alternative 4: Adaptive Scoring Based on Project Size

**Description**: Automatically use enhanced scoring for large projects (>50 issues), basic for small.

**Pros**:

- Automatic optimization
- No user configuration needed
- Scales with project complexity

**Cons**:

- **Magic Threshold**: Why 50? Why not 100?
- **Inconsistency**: Same task scored differently in different projects
- **Unpredictable**: Users can't control behavior
- **Testing**: Hard to validate all scenarios

## Decision

**Enhanced Scoring as Opt-in Feature (Alternative 2).**

We will implement enhanced agent scoring behind a feature flag, with sensible defaults for weights.

## Rationale

1. **Stability First**: DevFlow is a development tool. Stability is more important than bleeding-edge features. Existing users should not experience unexpected behavior changes.

2. **Validation Opportunity**: Opt-in allows us to validate enhanced scoring with willing early adopters before recommending it broadly.

3. **Project Diversity**: Different projects have different needs. A small prototype project might prioritize speed, while a production app prioritizes quality. Opt-in lets them choose.

4. **Easy Migration**: Users can enable the flag, observe behavior, and disable if needed. This is safer than a forced migration.

5. **A/B Testing**: We can compare outcomes between projects using basic vs enhanced scoring, gather data, and improve the algorithm.

## Implementation

### Configuration

```typescript
// .env.example
# Enable enhanced agent scoring (Deacon-inspired)
BEADS_ENHANCED_SCORING_ENABLED=false

# Scoring weights (must sum to 1.0)
# - capability: Task capability match (0.0-1.0)
# - success_rate: Historical success rate (0.0-1.0)
# - availability: Current workload (0.0-1.0)
# - quality: Average output quality (0.0-1.0) [new]
# - speed: Average completion speed (0.0-1.0) [new]
# - refinement: Low refinement rate is better (0.0-1.0) [new]
BEADS_SCORING_WEIGHTS='{"capability":0.25,"success_rate":0.25,"availability":0.15,"quality":0.15,"speed":0.1,"refinement":0.1}'
```

### Enhanced Scoring Algorithm

```typescript
// apps/server/src/services/beads-agent-coordinator.ts
interface EnhancedScoringWeights {
  capability: number;    // Task match capability
  success_rate: number;  // Historical success
  availability: number;  // Current workload
  quality: number;       // Output quality (new)
  speed: number;         // Completion speed (new)
  refinement: number;    // Low correction rate (new)
}

private calculateEnhancedScore(
  agent: AgentRegistryEntry,
  issue: BeadsIssue,
  weights: EnhancedScoringWeights
): AgentScore {
  // Existing factors
  const capabilityMatch = this.calculateCapabilityMatch(agent, issue);
  const successRate = agent.stats.successRate;
  const availability = this.calculateAvailability(agent);

  // New factors (from QualityMetricsService)
  const quality = this.qualityMetrics.getAverageQuality(agent.config.type);
  const speed = this.calculateSpeedScore(agent.stats.avgDuration);
  const refinement = this.calculateRefinementScore(agent.config.type);

  // Weighted sum
  const score =
    (capabilityMatch * weights.capability) +
    (successRate * weights.success_rate) +
    (availability * weights.availability) +
    (quality * weights.quality) +
    (speed * weights.speed) +
    (refinement * weights.refinement);

  return {
    agentType: agent.config.type,
    score,
    capabilityMatch,
    successRate,
    availability,
    quality,     // new
    speed,       // new
    refinement   // new
  };
}

private calculateSpeedScore(avgDuration: number): number {
  // Faster is better, but clamp to reasonable range
  // Assume 1 minute = 1.0, 10 minutes = 0.0
  const maxDuration = 600000; // 10 minutes in ms
  return Math.max(0, 1 - (avgDuration / maxDuration));
}

private calculateRefinementScore(agentType: AgentType): number {
  // Lower refinement rate is better
  const history = this.qualityMetrics.getAgentHistory(agentType);
  if (history.length === 0) return 0.5; // neutral for new agents

  const avgRefinements = history.reduce((sum, m) => sum + (m.refinementCount || 0), 0) / history.length;
  // 0 refinements = 1.0, 5+ refinements = 0.0
  return Math.max(0, 1 - (avgRefinements / 5));
}
```

### Feature Flag Check

```typescript
async selectBestAgent(issue: BeadsIssue): Promise<AgentType | null> {
  const config = this.loadScoringConfig();

  if (config.enhancedScoringEnabled) {
    return this.selectAgentEnhanced(issue, config.weights);
  } else {
    return this.selectAgentBasic(issue); // existing implementation
  }
}
```

### Monitoring

```typescript
// Emit events for observability
this.events.emit('beads:agent-selected', {
  issueId: issue.id,
  agentType: selectedAgent,
  scoringMode: config.enhancedScoringEnabled ? 'enhanced' : 'basic',
  score: result.score,
  breakdown: {
    capability: result.capabilityMatch,
    success_rate: result.successRate,
    availability: result.availability,
    quality: result.quality,
    speed: result.speed,
    refinement: result.refinement,
  },
});
```

## Consequences

### Positive

- **Stability**: Existing users unaffected
- **Flexibility**: Projects can choose scoring strategy
- **Validation**: Can test with early adopters
- **Customization**: Weights tunable per project
- **Observability**: Events show why agents selected
- **Safety**: Easy to disable if issues arise

### Negative

- **Maintenance Burden**: Two code paths to maintain
- **Testing Overhead**: Must validate both modes
- **Documentation**: Need clear guidance on when to use
- **Adoption Challenge**: Users might not discover feature
- **Default Behavior**: Enhanced scoring off by default = lower impact

### Rollout Plan

1. **Phase 1** (current): Implement enhanced scoring behind flag, default off
2. **Phase 2** (1-2 weeks): Test internally, validate algorithm
3. **Phase 3** (1 month): Enable for beta users, gather feedback
4. **Phase 4** (3 months): Evaluate data, consider making default

## Related Decisions

- [ADR-001: Adopt Gastown-inspired Features Without Full Integration](ADR-001-adopt-gastown-features.md)
- [ADR-002: Use Optional Beads Fields Instead of Schema Migration](ADR-002-use-optional-beads-fields.md)
- [ADR-006: Feature Flag Strategy for Gradual Rollout](ADR-006-feature-flag-strategy.md)

## References

- BeadsAgentCoordinator: `/home/codespace/DevFlow/apps/server/src/services/beads-agent-coordinator.ts`
- AgentRegistry: `/home/codespace/DevFlow/apps/server/src/agents/agent-registry.ts`
- QualityMetricsService: `/home/codespace/DevFlow/apps/server/src/services/quality-metrics-service.ts` (planned per ADR-002)
