# ADR-006: Feature Flag Strategy for Gradual Rollout

## Status

**Accepted**

## Context

DevFlow is adopting several Gastown-inspired features (enhanced scoring, patrol system, MEOW hierarchy, quality metrics). These features represent significant behavioral changes that could:

- Break existing workflows
- Introduce bugs in production
- Change user expectations
- Increase operational complexity

To manage risk, we need a strategy for gradually introducing these features to users while maintaining stability.

### Decision Drivers

- **Stability**: DevFlow is a development tool; stability is paramount
- **User Control**: Users should control when to adopt new features
- **Observability**: Need to monitor feature performance in production
- **Rollback**: Must be able to quickly disable problematic features
- **Testing**: Features should be validated with subsets of users before general availability
- **Documentation**: Clear guidance on feature enablement

## Current Environment Variables

DevFlow already uses environment variables for configuration:

```bash
# Existing Beads flags
BEADS_AUTO_ISSUES_ENABLED=true
BEADS_DEDUPLICATION_ENABLED=true
BEADS_MEMORY_CACHE_TTL=300000
BEADS_COORDINATION_ENABLED=true
BEADS_HELPER_SPAWNING_ENABLED=true
```

This provides a precedent for feature flagging.

## Considered Alternatives

### Alternative 1: No Feature Flags (All Features On)

**Description**: Deploy all Gastown-inspired features as default, no opt-out.

**Pros**:

- All users get benefits immediately
- Single code path to maintain
- Simpler documentation

**Cons**:

- **High Risk**: Bugs affect all users
- **No Rollback**: Must redeploy to disable features
- **User Resistance**: Forced changes might upset users
- **Testing**: No way to test with subset of users
- **Support Burden**: All issues from all users at once

### Alternative 2: Static Configuration Files

**Description**: Use JSON/YAML config files (`.devflowrc.json`) for feature flags.

**Example**:

```json
{
  "features": {
    "enhancedScoring": true,
    "patrolSystem": false,
    "qualityMetrics": true
  }
}
```

**Pros**:

- Version controllable (commit config with code)
- Clear documentation (one file to read)
- Project-specific settings (can commit to repo)

**Cons**:

- **File Management**: Need to create, read, parse config files
- **Path Resolution**: Where to store config? Repo root? User home?
- **Merge Conflicts**: Config file conflicts in team workflows
- **Runtime Changes**: Requires restart to update
- **Permissions**: File system access issues in some environments

### Alternative 3: Remote Feature Flag Service

**Description**: Use a service like LaunchDarkly, Flagsmith, or custom API.

**Pros**:

- Real-time updates without restart
- Advanced targeting (user segments, rollouts)
- Analytics integration
- Professional tooling

**Cons**:

- **External Dependency**: Relies on third-party service
- **Cost**: Paid services add expense
- **Network Dependency**: Requires internet connection
- **Over-engineering**: More complexity than needed for current scale
- **Privacy**: Might send usage data to external service

### Alternative 4: Environment Variables with Feature Flag Service Class (SELECTED)

**Description**: Use environment variables for configuration, wrap in a FeatureFlagService for management.

**Implementation**:

```typescript
// .env
GASTOWN_ENHANCED_SCORING_ENABLED = false;
GASTOWN_PATROL_WITNESS_ENABLED = false;
GASTOWN_QUALITY_METRICS_ENABLED = true;

// Feature flag service
class FeatureFlagService {
  private flags: Map<string, boolean>;

  constructor() {
    this.flags = new Map([
      ['enhanced_scoring', process.env.GASTOWN_ENHANCED_SCORING_ENABLED === 'true'],
      ['patrol_witness', process.env.GASTOWN_PATROL_WITNESS_ENABLED === 'true'],
      ['quality_metrics', process.env.GASTOWN_QUALITY_METRICS_ENABLED === 'true'],
    ]);
  }

  isEnabled(flag: string): boolean {
    return this.flags.get(flag) ?? false;
  }
}
```

**Pros**:

- **Simple**: Uses existing environment variable mechanism
- **Familiar**: DevOps and developers already know env vars
- **Container-Ready**: Works in Docker/K8s naturally
- **Easy Rollback**: Change env var, restart service
- **No New Dependencies**: Uses Node.js built-in `process.env`
- **Documentable**: Can document flags in `.env.example`
- **Type-Safe**: Service provides compile-time checks

**Cons**:

- **Requires Restart**: Changes need service restart
- **Environment Clutter**: Many env vars can be overwhelming
- **No Targeting**: Can't enable for specific users (all-or-nothing)

### Alternative 5: Hybrid - Env Vars + Per-Project Config

**Description**: Global defaults via env vars, project overrides via `.devflow/config.json`.

**Pros**:

- Flexibility for different projects
- Global defaults for easy setup

**Cons**:

- **Complexity**: Two sources of truth
- **Conflicts**: Which takes precedence?
- **Documentation**: Harder to explain behavior

## Decision

**Environment Variables with Feature Flag Service Class (Alternative 4).**

We will use environment variables for all Gastown-inspired feature flags, wrapped in a FeatureFlagService for type-safe access.

## Rationale

1. **Simplicity**: Environment variables are the simplest mechanism that meets our needs. No new infrastructure, no external dependencies.

2. **Precedent**: We already use environment variables for Beads configuration. Adding more is consistent.

3. **Container-Ready**: DevFlow might run in containers/CI. Environment variables are the standard configuration mechanism for containers.

4. **No Privacy Concerns**: Unlike remote services, env vars keep all configuration local.

5. **Easy Rollback**: If a feature causes problems, change the env var and restart. Fast and safe.

6. **Documentation-Friendly**: Can list all flags in `.env.example` with clear descriptions.

7. **Future-Proof**: If we later need advanced targeting, can migrate to remote service while keeping env var interface as fallback.

## Implementation

### Environment Variable Naming Convention

```bash
# Pattern: GASTOWN_<FEATURE>_<OPTION>=<value>

# Example flags
GASTOWN_ENHANCED_SCORING_ENABLED=false
GASTOWN_ENHANCED_SCORING_WEIGHTS='{"quality":0.15,"speed":0.1}'
GASTOWN_PATROL_WITNESS_ENABLED=false
GASTOWN_PATROL_DEACON_ENABLED=false
GASTOWN_PATROL_REFINERY_ENABLED=false
GASTOWN_QUALITY_METRICS_ENABLED=true
GASTOWN_QUALITY_PERSISTENCE_ENABLED=true
GASTOWN_MEOW_HIERARCHY_ENABLED=false
```

### FeatureFlagService

```typescript
// apps/server/src/services/feature-flag-service.ts

export class FeatureFlagService {
  private flags: Map<string, boolean | string | number>;

  constructor() {
    this.flags = new Map();

    // Initialize from environment
    this.loadFromEnv();
  }

  private loadFromEnv(): void {
    // Boolean flags
    this.flags.set('enhanced_scoring', this.getBool('GASTOWN_ENHANCED_SCORING_ENABLED', false));
    this.flags.set('patrol_witness', this.getBool('GASTOWN_PATROL_WITNESS_ENABLED', false));
    this.flags.set('patrol_deacon', this.getBool('GASTOWN_PATROL_DEACON_ENABLED', false));
    this.flags.set('patrol_refinery', this.getBool('GASTOWN_PATROL_REFINERY_ENABLED', false));
    this.flags.set('quality_metrics', this.getBool('GASTOWN_QUALITY_METRICS_ENABLED', true));
    this.flags.set(
      'quality_persistence',
      this.getBool('GASTOWN_QUALITY_PERSISTENCE_ENABLED', true)
    );
    this.flags.set('meow_hierarchy', this.getBool('GASTOWN_MEOW_HIERARCHY_ENABLED', false));

    // String/JSON flags
    const weights = process.env.GASTOWN_ENHANCED_SCORING_WEIGHTS;
    if (weights) {
      try {
        this.flags.set('enhanced_scoring_weights', JSON.parse(weights));
      } catch (e) {
        console.warn('Invalid JSON in GASTOWN_ENHANCED_SCORING_WEIGHTS');
      }
    }
  }

  isEnabled(flag: string): boolean {
    return this.flags.get(flag) === true;
  }

  get<T>(flag: string, defaultValue: T): T {
    return (this.flags.get(flag) ?? defaultValue) as T;
  }

  private getBool(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value === 'true' || value === '1';
  }

  // Runtime reload (for development/testing)
  reload(): void {
    this.flags.clear();
    this.loadFromEnv();
  }
}

// Singleton instance
export const featureFlags = new FeatureFlagService();
```

### Usage in Services

```typescript
// BeadsAgentCoordinator
import { featureFlags } from './feature-flag-service.js';

class BeadsAgentCoordinator {
  async selectBestAgent(issue: BeadsIssue): Promise<AgentType | null> {
    if (featureFlags.isEnabled('enhanced_scoring')) {
      return this.selectAgentEnhanced(issue);
    } else {
      return this.selectAgentBasic(issue);
    }
  }
}

// WitnessService
class WitnessService {
  async validateOutput(output: string): Promise<ValidationResult> {
    if (!featureFlags.isEnabled('patrol_witness')) {
      return { passed: true, score: 1.0 }; // pass all if disabled
    }

    return this.performValidation(output);
  }
}
```

### .env.example Documentation

```bash
# .env.example

# ==========================================
# GASTOWN-INSPIRED FEATURES
# ==========================================

# Enhanced Agent Scoring (Deacon-inspired)
# Enables multi-factor agent selection with quality, speed, and refinement metrics
GASTOWN_ENHANCED_SCORING_ENABLED=false

# Custom weights for enhanced scoring (JSON format)
# Defaults: {"capability":0.25,"success_rate":0.25,"availability":0.15,"quality":0.15,"speed":0.1,"refinement":0.1}
# GASTOWN_ENHANCED_SCORING_WEIGHTS='{"quality":0.2,"speed":0.15}'

# Patrol System - Witness (Output Validation)
# Validates agent outputs against quality criteria
GASTOWN_PATROL_WITNESS_ENABLED=false

# Patrol System - Deacon (Reputation Tracking)
# Tracks agent reputation for improved selection
GASTOWN_PATROL_DEACON_ENABLED=false

# Patrol System - Refinery (Automatic Refinement)
# Iteratively refines failed outputs (requires Witness)
GASTOWN_PATROL_REFINERY_ENABLED=false

# Quality Metrics Tracking
# Records quality scores for agent outputs
GASTOWN_QUALITY_METRICS_ENABLED=true

# Quality Metrics Persistence
# Persist quality metrics to disk
GASTOWN_QUALITY_PERSISTENCE_ENABLED=true

# MEOW Hierarchy Display
# Show MEOW-level labels in UI (Mission, Epoch, Operation, Work)
GASTOWN_MEOW_HIERARCHY_ENABLED=false
```

### Rollout Strategy

**Phase 1: Internal Testing** (Week 1-2)

```bash
# Enable all features for internal testing
GASTOWN_ENHANCED_SCORING_ENABLED=true
GASTOWN_PATROL_WITNESS_ENABLED=true
GASTOWN_QUALITY_METRICS_ENABLED=true
```

**Phase 2: Beta Users** (Week 3-4)

```bash
# Enable select features for beta testers
GASTOWN_ENHANCED_SCORING_ENABLED=false  # opt-in
GASTOWN_PATROL_WITNESS_ENABLED=false    # opt-in
GASTOWN_QUALITY_METRICS_ENABLED=true    # default on (safe)
```

**Phase 3: General Availability** (Month 2-3)

```bash
# Gradually enable features as defaults
GASTOWN_QUALITY_METRICS_ENABLED=true     # already default
GASTOWN_ENHANCED_SCORING_ENABLED=true    # enable as default
GASTOWN_PATROL_WITNESS_ENABLED=false     # still opt-in (risky)
```

### Monitoring

```typescript
// Emit feature flag events
this.events.emit('feature:flag-checked', {
  flag: 'enhanced_scoring',
  enabled: featureFlags.isEnabled('enhanced_scoring'),
  timestamp: Date.now(),
});

this.events.emit('feature:agent-selected', {
  issueId: issue.id,
  agentType: selectedAgent,
  scoringMode: featureFlags.isEnabled('enhanced_scoring') ? 'enhanced' : 'basic',
});
```

## Consequences

### Positive

- **Safe Rollout**: Features can be enabled gradually
- **Easy Rollback**: Disable problematic features instantly
- **User Control**: Users control their exposure to new features
- **Testing**: Can test with subset of environments
- **Observable**: Can log flag checks to monitor usage
- **No New Infrastructure**: Uses existing env var mechanism

### Negative

- **Restart Required**: Changes need service restart
- **Environment Clutter**: Many flags can be overwhelming
- **Documentation Burden**: Must maintain `.env.example`
- **Testing Overhead**: Must test with flags on/off

## Best Practices

1. **Default Off**: New features should default to `false` for safety
2. **Clear Naming**: Use `GASTOWN_<FEATURE>_<OPTION>` pattern
3. **Documentation**: Update `.env.example` with every new flag
4. **Validation**: Parse and validate flag values at startup
5. **Logging**: Log flag checks to monitor usage
6. **Deprecation**: Document deprecated flags before removal

## Related Decisions

- [ADR-001: Adopt Gastown-inspired Features Without Full Integration](ADR-001-adopt-gastown-features.md)
- [ADR-003: Implement Enhanced Agent Scoring as Opt-in](ADR-003-enhanced-agent-scoring.md)
- [ADR-004: Patrol System Architecture](ADR-004-patrol-system.md)

## References

- FeatureFlagService: `/home/codespace/DevFlow/apps/server/src/services/feature-flag-service.ts` (to be created)
- Environment Configuration: `/home/codespace/DevFlow/.env.example`
