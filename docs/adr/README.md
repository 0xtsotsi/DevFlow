# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for DevFlow, documenting significant architectural choices and their rationale.

## What is an ADR?

An Architecture Decision Record (ADR) is a document that describes an important architectural decision, the context surrounding it, the alternatives considered, and the consequences of the decision.

## ADR Template

DevFlow uses the **MADR** (Markdown Any Decision Records) template for all new ADRs (008+). This template provides:

- **Status tracking**: Proposed, Accepted, Deprecated, Superseded
- **Structured evaluation**: Decision drivers and considered options
- **Clear documentation**: Pros/cons for each alternative
- **Traceability**: Links to related ADRs

See [ADR-008](ADR-008-use-madr-template.md) for the meta-ADR establishing this template.

### MADR Template

```markdown
# ADR-XXX: [Title]

**Status**: Proposed | Accepted | Deprecated | Superseded
**Date**: YYYY-MM-DD
**Decision Makers**: Team
**Related ADRs**: XXXX-YYYY

## Context and Problem Statement

[Describe the context and problem statement]

## Decision Drivers

- [Driver 1]
- [Driver 2]
- [Driver 3]

## Considered Options

### Option 1: [Description]

- **Good**: [pros]
- **Bad**: [cons]

### Option 2: [Description]

- **Good**: [pros]
- **Bad**: [cons]

## Decision Outcome

Chosen option: "Option X", because [justification]

### Consequences

- **Positive**: [expected benefits]
- **Negative**: [expected drawbacks]
- **Neutral**: [other notes]

## Related Links

- [Link 1]
- [Link 2]
```

## ADR Index

### Core Architecture (MADR Format)

| ADR                                          | Title                          | Status   | Date       |
| -------------------------------------------- | ------------------------------ | -------- | ---------- |
| [ADR-008](ADR-008-use-madr-template.md)      | Use MADR Template for ADRs     | Accepted | 2025-01-05 |
| [ADR-009](ADR-009-beads-architecture.md)     | Beads Autonomous Memory System | Accepted | 2025-01-05 |
| [ADR-010](ADR-010-workflow-orchestration.md) | Workflow Orchestration System  | Accepted | 2025-01-05 |
| [ADR-011](ADR-011-hooks-system.md)           | Hooks System Architecture      | Accepted | 2025-01-05 |
| [ADR-012](ADR-012-skills-system.md)          | Skills System Architecture     | Accepted | 2025-01-05 |
| [ADR-013](ADR-013-reflect-skill.md)          | Reflect Skill Architecture     | Accepted | 2025-01-05 |

### Gastown-Inspired Features (Legacy Format)

| ADR                                             | Title                                                    | Status   | Date       |
| ----------------------------------------------- | -------------------------------------------------------- | -------- | ---------- |
| [ADR-001](ADR-001-adopt-gastown-features.md)    | Adopt Gastown-inspired Features Without Full Integration | Accepted | 2025-01-02 |
| [ADR-002](ADR-002-use-optional-beads-fields.md) | Use Optional Beads Fields Instead of Schema Migration    | Accepted | 2025-01-02 |
| [ADR-003](ADR-003-enhanced-agent-scoring.md)    | Implement Enhanced Agent Scoring as Opt-in               | Accepted | 2025-01-02 |
| [ADR-004](ADR-004-patrol-system.md)             | Patrol System Architecture (Witness, Refinery, Deacon)   | Proposed | 2025-01-02 |
| [ADR-005](ADR-005-meow-workflow-hierarchy.md)   | MEOW Workflow Hierarchy Using Existing Beads Structures  | Accepted | 2025-01-02 |
| [ADR-006](ADR-006-feature-flag-strategy.md)     | Feature Flag Strategy for Gradual Rollout                | Accepted | 2025-01-02 |
| [ADR-007](ADR-007-event-namespace-isolation.md) | Event Namespace Isolation (gastown: prefix)              | Accepted | 2025-01-02 |

## ADR Lifecycle

- **Proposed**: Initial draft, under discussion
- **Accepted**: Decision made, implementation in progress
- **Deprecated**: No longer current, kept for historical reference
- **Superseded**: Replaced by a newer ADR (link to replacement)

### Annual Review Process

All ADRs should be reviewed annually to ensure they remain current. See [review-process.md](review-process.md) for details.

## Gastown Integration Strategy

These ADRs document DevFlow's approach to adopting patterns from [Gastown](https://github.com/hypertext-code/gastown) without full integration:

### Core Principles

1. **Inspiration, Not Integration**: We adopt Gastown's proven patterns, not its codebase
2. **Beads Compatibility**: All features work with standard Beads CLI
3. **Gradual Rollout**: Feature flags control adoption
4. **Maintain Control**: Implement independently to preserve architectural control

### Feature Flags

All Gastown-inspired features are controlled by environment variables:

```bash
# .env configuration
GASTOWN_ENHANCED_SCORING_ENABLED=false
GASTOWN_PATROL_WITNESS_ENABLED=false
GASTOWN_QUALITY_METRICS_ENABLED=true
```

### Event System

Gastown-inspired features emit events under the `gastown:` namespace:

```
gastown:witness:validation-complete
gastown:deacon:reputation-updated
gastown:quality:metric-recorded
```

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Project overview and Beads integration
- [WORKFLOW_ORCHESTRATION_GUIDE.md](../WORKFLOW_ORCHESTRATION_GUIDE.md) - Workflow patterns
- [HOOKS_GUIDE.md](../HOOKS_GUIDE.md) - Hooks system documentation
- [SKILLS_GUIDE.md](../SKILLS_GUIDE.md) - Skills system documentation
- [gastown-quick-reference.md](../gastown-quick-reference.md) - Gastown features reference

## Creating New ADRs

When making significant architectural decisions:

1. Create a new ADR file: `ADR-XXX-title.md` (using next sequential number)
2. Use the MADR template (see [ADR-008](ADR-008-use-madr-template.md))
3. Follow the MADR format (Status, Context, Decision Drivers, Options, Decision, Consequences)
4. Link to related ADRs
5. Update this index
6. Run `npm run lint` to ensure formatting

## Questions?

Refer to specific ADRs for detailed rationale, or consult the main [CLAUDE.md](../CLAUDE.md) for project context.
