# ADR-004: Patrol System Architecture (Witness, Refinery, Deacon)

## Status

**Proposed**

## Context

Gastown implements a "Patrol System" with three components that monitor and improve agent outputs:

1. **Witness**: Validates agent outputs against acceptance criteria
2. **Refinery**: Iteratively refines outputs that fail validation
3. **Deacon**: Tracks agent reputation and influences selection

DevFlow needs similar capabilities to ensure high-quality autonomous development work. However, we must decide how deeply to integrate these concepts given our existing architecture.

### Decision Drivers

- **Quality Assurance**: Autonomous agents need validation to prevent bad code
- **Learning System**: Agents should improve from feedback
- **Complexity vs Value**: Each patrol component adds complexity
- **Integration Points**: Must work with existing Beads coordination
- **User Control**: Developers should oversee autonomous systems

## Current DevFlow Capabilities

- **BeadsAgentCoordinator**: Autonomous task assignment
- **QualityMetricsService**: Quality score tracking (planned per ADR-002)
- **ResearchService**: Web + codebase research before implementation
- **AutoModeService**: Multi-agent orchestration for features
- **CheckpointService**: State persistence and rollback

## Considered Alternatives

### Alternative 1: Full Patrol System (All Three Components)

**Description**: Implement Witness, Refinery, and Deacon as separate services, fully integrated into agent workflow.

**Architecture**:

```
Agent Request → Witness (validate plan)
                ↓
            Agent Execute
                ↓
            Witness (validate output)
                ↓
         Refinery (if failed, refine)
                ↓
            Deacon (update reputation)
```

**Pros**:

- Complete quality assurance system
- Agents learn from failures
- High code quality through iteration
- Proven pattern from Gastown

**Cons**:

- **High Complexity**: Three new services to build and maintain
- **Performance Overhead**: Multiple validation/refinement cycles slow execution
- **Debugging Difficulty**: Hard to trace which patrol component modified output
- **Cost**: More LLM calls = higher API costs
- **Over-engineering**: Might be more than needed for current use cases

### Alternative 2: Witness Only (Validation, No Refinement)

**Description**: Implement Witness to validate outputs, but fail fast instead of refining.

**Architecture**:

```
Agent Request → Witness (validate plan)
                ↓
            Agent Execute
                ↓
            Witness (validate output)
                ↓
         If failed: report error, stop
```

**Pros**:

- Simpler than full patrol
- Catch errors before they cause problems
- Clear failure modes
- Lower cost (no refinement iterations)

**Cons**:

- **No Self-Improvement**: Agents don't learn to do better
- **Manual Intervention**: Users must fix failed tasks
- **Lower Autonomy**: Less "hands-off" operation
- **Wasted Work**: Failed agent runs can't be salvaged

### Alternative 3: Phased Implementation (RECOMMENDED)

**Description**: Start with Witness validation, add Refinement/Deacon later based on needs.

**Phase 1 - Witness** (Immediate):

```typescript
// Validate agent outputs against criteria
class WitnessService {
  async validateOutput(output: string, criteria: ValidationCriteria): Promise<ValidationResult> {
    // Use LLM to check:
    // - Code quality (linting, typecheck)
    // - Test coverage
    // - Security issues
    // - Performance concerns
    // - Documentation completeness
  }
}
```

**Phase 2 - Deacon** (After Witness is stable):

```typescript
// Track agent reputation from validation results
class DeaconService {
  async updateReputation(agentType: AgentType, validationResult: ValidationResult): void {
    // Update agent success rate
    // Track quality trends
    // Adjust selection weights
  }
}
```

**Phase 3 - Refinery** (Future, if needed):

```typescript
// Refine failed outputs automatically
class RefineryService {
  async refineOutput(
    failedOutput: string,
    validationResult: ValidationResult,
    maxIterations: number = 3
  ): Promise<string> {
    // Iteratively improve until validation passes
    // or max iterations reached
  }
}
```

**Pros**:

- **Incremental Complexity**: Build one thing at a time
- **Validate Each Layer**: Ensure Witness works before adding Refinery
- **Learn from Usage**: Real data informs Deacon reputation algorithm
- **Cancel Anytime**: Can stop after Phase 1/2 if Phase 3 isn't needed
- **Flexibility**: Each phase is independently useful

**Cons**:

- **Longer Timeline**: Full system takes longer to complete
- **Incomplete Initially**: Early users don't get full patrol benefits
- **Planning Overhead**: Need to design for future phases

### Alternative 4: Lightweight Validation (Not Full Patrol)

**Description**: Simple validation without dedicated patrol services.

**Implementation**:

```typescript
// Add validation hooks to existing services
class AgentService {
  async execute(...) {
    const output = await this.runAgent(...);

    // Simple validation (no separate Witness service)
    if (this.config.enableValidation) {
      const passed = await this.runTests(output);
      if (!passed) {
        throw new Error('Validation failed');
      }
    }

    return output;
  }
}
```

**Pros**:

- Minimal complexity
- Uses existing services
- Fast to implement

**Cons**:

- **Limited Validation**: Only test results, no code quality checks
- **No Reputation Tracking**: Can't improve agent selection
- **No Refinement**: Can't fix failed outputs
- **Scattered Logic**: Validation mixed with agent execution

## Decision

**Phased Implementation (Alternative 3), starting with Witness.**

We will implement the patrol system incrementally:

1. **Phase 1 (Now)**: WitnessService for output validation
2. **Phase 2 (Future)**: DeaconService for reputation tracking
3. **Phase 3 (Future)**: RefineryService for automatic refinement

## Rationale

1. **Complexity Management**: Full patrol system is a lot to build at once. Phasing lets us validate each component before adding the next.

2. **Learning from Real Data**: Witness will generate validation data (pass/fail rates, common failure modes). This data should inform Deacon's reputation algorithm and Refinery's refinement strategies.

3. **Cost Control**: Refinement can be expensive (multiple LLM calls). We should establish that refinement is actually needed before building it.

4. **User Feedback**: After users experience Witness, they might tell us they prefer manual refinement over automatic. Or they might want refinement immediately. Phasing lets us adapt.

5. **Cancellation Option**: If Phase 1 (Witness) provides 80% of the value with 20% of the effort, we might stop there and never build Phase 3.

## Phase 1: Witness Implementation

### Architecture

```typescript
// apps/server/src/services/witness-service.ts
export class WitnessService {
  async validateAgentOutput(
    agentType: AgentType,
    issue: BeadsIssue,
    output: AgentOutput
  ): Promise<ValidationResult> {
    const checks = [
      this.checkCodeQuality(output),
      this.checkTests(output),
      this.checkSecurity(output),
      this.checkDocumentation(output),
      this.checkPerformance(output),
    ];

    const results = await Promise.all(checks);
    return this.aggregateResults(results);
  }
}

interface ValidationResult {
  passed: boolean;
  score: number; // 0-1
  checks: {
    name: string;
    passed: boolean;
    details: string;
    suggestions?: string[];
  }[];
  summary: string;
}
```

### Integration with AgentService

```typescript
class AgentService {
  async executeAgent(...) {
    const output = await this.runAgent(...);

    // Witness validation
    const validation = await this.witness.validateAgentOutput(
      agentType,
      issue,
      output
    );

    // Emit validation event (consumed by Deacon later)
    this.events.emit('patrol:witness-validation', {
      agentType,
      issueId: issue.id,
      validation
    });

    // If validation failed, throw error (no refinement yet)
    if (!validation.passed) {
      throw new AgentValidationError(
        'Agent output failed validation',
        validation
      );
    }

    return output;
  }
}
```

### Event Emission

```typescript
// Witness emits events for Deacon (Phase 2) to consume
'patrol:witness-validation': {
  agentType: AgentType;
  issueId: string;
  validation: ValidationResult;
}
```

## Phase 2: Deacon (Future)

```typescript
// apps/server/src/services/deacon-service.ts
export class DeaconService {
  constructor(
    private agentRegistry: AgentRegistry,
    private events: EventEmitter
  ) {
    // Subscribe to Witness validations
    events.subscribe((type, data) => {
      if (type === 'patrol:witness-validation') {
        this.updateReputation(data);
      }
    });
  }

  private updateReputation(data: any) {
    // Update agent reputation based on validation
    const agent = this.agentRegistry.getAgentEntry(data.agentType);
    if (data.validation.passed) {
      agent.stats.successRate *= 1.05; // boost
    } else {
      agent.stats.successRate *= 0.95; // penalty
    }
  }

  getReputation(agentType: AgentType): number {
    // Return reputation score for agent selection
  }
}
```

## Phase 3: Refinery (Future)

Only implement if data shows:

- Witness failure rate > 20%
- Failed outputs could be fixed with minor tweaks
- Users request automatic refinement
- Cost-benefit analysis supports it

## Consequences

### Positive

- **Quality Assurance**: Agent outputs validated before integration
- **Incremental Risk**: Each phase adds complexity gradually
- **Data-Driven**: Real usage data informs future phases
- **Cancel Anytime**: Can stop if value diminishes
- **Clear Separation**: Each service has single responsibility

### Negative

- **Multi-Phase Effort**: Full system takes time to complete
- **Incomplete Initially**: Early users get basic validation only
- **Planning Overhead**: Must design for extensibility
- **Event Coupling**: Future phases depend on current events

## Implementation Timeline

### Phase 1: Witness (1-2 weeks)

- [ ] Create WitnessService
- [ ] Implement validation checks (quality, tests, security)
- [ ] Integrate with AgentService
- [ ] Emit validation events
- [ ] Add to BeadsAgentCoordinator workflow
- [ ] Write tests
- [ ] Document validation criteria

### Phase 2: Deacon (2-3 weeks, after Phase 1)

- [ ] Create DeaconService
- [ ] Subscribe to Witness events
- [ ] Implement reputation tracking
- [ ] Integrate with agent selection (ADR-003)
- [ ] Add reputation API
- [ ] Write tests
- [ ] Document reputation algorithm

### Phase 3: Refinery (3-4 weeks, after Phase 2, if needed)

- [ ] Evaluate Phase 1 data to confirm need
- [ ] Create RefineryService
- [ ] Implement iterative refinement
- [ ] Add refinement limits and safeguards
- [ ] Integrate with AgentService
- [ ] Write tests
- [ ] Document refinement strategies

## Related Decisions

- [ADR-001: Adopt Gastown-inspired Features Without Full Integration](ADR-001-adopt-gastown-features.md)
- [ADR-002: Use Optional Beads Fields Instead of Schema Migration](ADR-002-use-optional-beads-fields.md)
- [ADR-003: Implement Enhanced Agent Scoring as Opt-in](ADR-003-enhanced-agent-scoring.md)

## References

- AgentService: `/home/codespace/DevFlow/apps/server/src/services/agent-service.ts`
- BeadsAgentCoordinator: `/home/codespace/DevFlow/apps/server/src/services/beads-agent-coordinator.ts`
- Gastown Patrol System: [hypertext-code/gastown](https://github.com/hypertext-code/gastown)
