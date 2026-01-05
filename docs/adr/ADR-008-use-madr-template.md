# ADR-008: Use MADR Template for Architecture Decision Records

**Status**: Accepted
**Date**: 2025-01-05
**Decision Makers**: DevFlow Team
**Related ADRs**: None

## Context and Problem Statement

DevFlow has been using a custom ADR format based on Michael Nygard's original template. However, the current format lacks:

1. **Structured decision drivers** - No explicit list of factors influencing decisions
2. **Option comparison** - Alternatives are not systematically evaluated
3. **Status lifecycle tracking** - Limited status transitions
4. **Template standardization** - Each ADR varies slightly in format

As the project grows and more architectural decisions are made, we need a more rigorous template that:

- Forces consideration of alternatives
- Makes decision drivers explicit
- Standardizes format across all ADRs
- Follows 2025 industry best practices

## Decision Drivers

- **Consistency**: All ADRs should follow a uniform format
- **Decision quality**: Template should encourage thorough evaluation of alternatives
- **Industry alignment**: Use a recognized, modern standard (2025)
- **Maintainability**: Template should be easy to create and maintain
- **Tooling compatibility**: Format should work with existing ADR tooling

## Considered Options

### Option 1: Continue Current Format

Keep the existing custom format based on Michael Nygard's original ADR template.

**Good**:

- Existing ADRs (001-007) already use this format
- Familiar to the team
- Simple and straightforward

**Bad**:

- Less structured than modern alternatives
- No explicit decision drivers section
- Alternatives not systematically compared
- Not aligned with 2025 best practices

### Option 2: MADR (Markdown Any Decision Records)

Adopt the MADR template, a modern ADR format that improves upon Nygard's original.

**Good**:

- Industry-recognized standard (widely adopted in 2025)
- Explicit decision drivers section
- Structured option comparison with pros/cons
- Clear status tracking (Proposed, Accepted, Deprecated, Superseded)
- Supports linking between related ADRs
- Markdown-native, tool-friendly
- Excellent documentation and examples

**Bad**:

- Different from existing ADRs format (migration needed for consistency)
- Slightly more verbose than current format
- Requires training for team members

### Option 3: UK Government ADR Template

Use the UK Government's ADR template, designed for large-scale projects.

**Good**:

- Comprehensive and rigorous
- Designed for enterprise use
- Strong governance features

**Bad**:

- Overly complex for our needs
- Designed for very large organizations
- Requires more overhead than MADR
- Less adoption in open-source community

### Option 4: Custom Enhanced Template

Create a custom hybrid template combining best elements from multiple approaches.

**Good**:

- Can tailor to specific needs
- Control over evolution

**Bad**:

- Maintenance burden
- No external tooling support
- No industry recognition
- Reinventing the wheel

## Decision Outcome

**Chosen option**: Option 2 - MADR (Markdown Any Decision Records)

Because it provides the best balance of structure, industry adoption, and maintainability. MADR is the 2025 standard for ADRs, with excellent tooling support and widespread community adoption.

### Consequences

**Positive**:

- All future ADRs will have consistent, high-quality documentation
- Decision-making process becomes more transparent
- Easier to understand why decisions were made
- Better support for ADR maintenance and review
- Compatible with ADR visualization tools

**Negative**:

- Format difference from ADR-001 through ADR-007 creates inconsistency
- Team needs to learn new format
- Slightly more verbose than current format

**Neutral**:

- Existing ADRs (001-007) will not be retroactively migrated
- New ADRs (008+) will use MADR format
- ADR README will be updated to document both formats

## MADR Template

All new ADRs (008+) must follow this template:

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

## Implementation Notes

1. **ADR Naming**: Use `ADR-XXX-title.md` format where XXX is sequential number
2. **Status Values**:
   - `Proposed`: Initial draft, under discussion
   - `Accepted`: Decision made, implementation approved
   - `Deprecated`: No longer recommended but still in use
   - `Superseded`: Replaced by newer ADR (link to replacement)
3. **Related ADRs**: Always link to related decisions for context
4. **Review Process**: ADRs should be reviewed annually (see [ADR Review Process](review-process.md))

## Related Links

- [MADR Specification](https://github.com/adr/madr)
- [MADR Documentation](https://adr.github.io/madr/)
- [Why MADR](https://github.com/adr/madr/blob/3.0.0/docs/decision-record-template.md#why-madr)
- [Existing DevFlow ADRs](./README.md)
