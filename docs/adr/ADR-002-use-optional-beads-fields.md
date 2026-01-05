# ADR-002: Use Optional Beads Fields Instead of Schema Migration

## Status

**Accepted**

## Context

Gastown's Witness and Refinery systems track output quality metrics for agent tasks. In DevFlow, we need similar capabilities to:

- Track agent output quality scores
- Monitor validation pass/fail rates
- Store refinement iterations for improved outputs
- Enable reputation-based agent selection (Deacon-inspired)

The Beads database schema currently supports core issue tracking:

- Basic fields: `id`, `title`, `description`, `status`, `type`, `priority`, `labels`
- Dependencies: `blocks`, `related`, `parent`, `discovered-from`
- Metadata: `createdAt`, `updatedAt`, `closedAt`

We need to decide how to add quality metrics without breaking existing Beads CLI compatibility.

### Decision Drivers

- **Beads CLI Compatibility**: Must continue working with standard `bd` command
- **Schema Stability**: Avoid database migrations that break user workflows
- **Backward Compatibility**: Existing Beads databases must continue working
- **Performance**: Quality queries should be efficient
- **Flexibility**: Metrics should be optional and extensible

## Considered Alternatives

### Alternative 1: Beads Schema Migration

**Description**: Extend Beads SQLite schema with new tables for quality metrics.

**Example Schema**:

```sql
CREATE TABLE agent_metrics (
  issue_id TEXT PRIMARY KEY,
  quality_score REAL,
  validation_passed BOOLEAN,
  refinement_count INTEGER,
  FOREIGN KEY (issue_id) REFERENCES issues(id)
);
```

**Pros**:

- Proper relational structure
- Efficient queries with indexes
- Data integrity through foreign keys

**Cons**:

- **Breaks Beads CLI compatibility**: Custom schema not recognized by standard `bd` tools
- **Migration complexity**: All existing databases need migration
- **Fork maintenance**: Diverges from upstream Beads, hard to merge updates
- **User disruption**: Requires database versioning and upgrade scripts
- **Risk**: Migration failures could corrupt user data

### Alternative 2: JSON Metadata in Beads Labels

**Description**: Store quality metrics as JSON in the `labels` array field.

**Example**:

```json
{
  "labels": ["quality:0.85", "validation:passed", "refinements:3", "agent:research-agent"]
}
```

**Pros**:

- Beads CLI compatible (labels are standard)
- No schema changes
- Easy to filter with `bd list --labels`

**Cons**:

- **Parsing overhead**: Must parse strings to extract values
- **Type safety**: No schema enforcement, prone to parsing errors
- **Limited structure**: Flat strings can't represent complex nested data
- **Query inefficiency**: Can't use SQL indexes for numeric ranges
- **Namespace risk**: Label strings might conflict with user labels

### Alternative 3: Optional Fields in TypeScript Layer (SELECTED)

**Description**: Keep Beads schema unchanged, track quality metrics in memory/persistence layer. Use Beads' extensible metadata approach.

**Implementation**:

```typescript
// In-memory quality tracking (not in Beads DB)
interface IssueQualityMetrics {
  issueId: string;
  qualityScore: number; // 0-1
  validationPassed: boolean;
  refinementCount: number;
  lastValidatedAt: string;
  agentReputationDelta: number; // -0.1 to +0.1
}

// Stored in DevFlow's own metadata storage
// NOT in Beads SQLite database
const qualityCache = new Map<string, IssueQualityMetrics>();
```

**Pros**:

- **Zero Beads changes**: 100% compatible with standard Beads CLI
- **No migrations**: Existing databases work unchanged
- **Type-safe**: TypeScript interfaces provide structure
- **Flexible**: Easy to extend with new metrics
- **Performance**: In-memory cache is fast
- **Persistence**: Can store in DevFlow's own JSON/SQLite files
- **Rollback**: Metrics can be discarded without affecting Beads

**Cons**:

- **Separate persistence**: Need to maintain DevFlow metadata files
- **Sync complexity**: Must keep metrics aligned with Beads issues
- **Query limitations**: Can't use Beads CLI to query quality metrics directly

### Alternative 4: Hybrid - Labels for CLI + In-Memory for App

**Description**: Store critical metrics in Beads labels for CLI visibility, keep detailed metrics in memory.

**Pros**:

- Best of both worlds: CLI visibility + detailed tracking
- Backward compatible

**Cons**:

- **Duplication**: Same data in two places
- **Sync issues**: Labels and cache might diverge
- **Complexity**: More moving parts

## Decision

**Use Optional Fields in TypeScript Layer (Alternative 3).**

Quality metrics will be tracked separately from Beads database:

1. In-memory cache for active sessions
2. Optional persistence in DevFlow metadata (`.devflow/quality-metrics.json`)
3. NOT stored in Beads SQLite database

## Rationale

1. **Beads Compatibility**: This is the primary concern. Beads is an external tool that users interact with directly. Changing its schema breaks that workflow.

2. **Concern Separation**: Beads tracks task management (what to do). Quality metrics track execution quality (how well it was done). These are separate concerns.

3. **Flexibility**: Quality metrics are experimental. We might change the schema. By keeping them separate, we can iterate without touching Beads.

4. **Performance**: Quality metrics are needed during agent execution (in-memory). They don't need to be queryable via `bd` CLI.

5. **Simplicity**: No migration scripts, no version conflicts, no data corruption risk.

## Implementation

### Service Layer

```typescript
// apps/server/src/services/quality-metrics-service.ts
export class QualityMetricsService {
  private metrics: Map<string, IssueQualityMetrics> = new Map();
  private persistencePath = '.devflow/quality-metrics.json';

  // Record quality score for an issue
  recordQuality(issueId: string, score: number): void {
    const existing = this.metrics.get(issueId) || {};
    this.metrics.set(issueId, {
      ...existing,
      issueId,
      qualityScore: score,
      lastValidatedAt: new Date().toISOString(),
    });
    this.persist();
  }

  // Get metrics for an issue
  getMetrics(issueId: string): IssueQualityMetrics | undefined {
    return this.metrics.get(issueId);
  }

  // Get all metrics for an agent
  getAgentHistory(agentType: string): IssueQualityMetrics[] {
    // Filter by agent assignments
  }
}
```

### Integration with BeadsAgentCoordinator

```typescript
// When agent completes, record quality
const result = await agentService.execute(agentType, task);
if (result.qualityScore) {
  qualityMetrics.recordQuality(issueId, result.qualityScore);
}
```

## Consequences

### Positive

- **No Breaking Changes**: Existing Beads databases continue working
- **CLI Compatibility**: Users can still use `bd` commands normally
- **Iterative Development**: Easy to add/remove metrics
- **Performance**: In-memory operations are fast
- **Safety**: Can't corrupt Beads database

### Negative

- **Separate Management**: Quality data in separate files
- **CLI Limitations**: Can't query quality via `bd list`
- **Sync Responsibility**: Must align metrics with Beads issue lifecycle
- **Additional Code**: Need persistence layer for metrics

### Migration Path

If future requirements demand CLI-queryable quality metrics, we can:

1. Add selected metrics to Beads labels (Alternative 2)
2. Implement quality queries via DevFlow API (not Beads CLI)
3. Contribute quality metrics to upstream Beads as optional fields

## Related Decisions

- [ADR-001: Adopt Gastown-inspired Features Without Full Integration](ADR-001-adopt-gastown-features.md)
- [ADR-003: Implement Enhanced Agent Scoring as Opt-in](ADR-003-enhanced-agent-scoring.md)

## References

- Beads Types: `/home/codespace/DevFlow/libs/types/src/beads.ts`
- BeadsService: `/home/codespace/DevFlow/apps/server/src/services/beads-service.ts`
- Quality Metrics Implementation: `/home/codespace/DevFlow/apps/server/src/services/quality-metrics-service.ts` (planned)
