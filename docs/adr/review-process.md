# ADR Review Process

This document describes the process for reviewing and maintaining Architecture Decision Records (ADRs) in DevFlow.

## Overview

ADRs are living documents that should be reviewed periodically to ensure they remain accurate and relevant. This process defines:

- When to review ADRs
- How to conduct reviews
- How to update ADR status
- How to deprecate or supersede ADRs

## Review Schedule

### Annual Review

All ADRs should be reviewed annually to ensure they remain current.

- **Trigger**: 12 months since last review (or creation date)
- **Owner**: Architecture team
- **Outcome**: Update status, add notes, or mark as deprecated/superseded

### Event-Triggered Review

An ADR may be reviewed outside the annual cycle when:

- A significant system change affects the decision
- A new technology makes the decision obsolete
- Team feedback suggests the decision should be revisited
- A related ADR is created or updated

## Review Process

### 1. Identify ADRs for Review

Run the ADR review script to identify ADRs due for review:

```bash
node scripts/adr-review.mjs --check
```

This outputs a list of ADRs that haven't been reviewed in over 12 months.

### 2. Review the ADR

For each ADR, consider:

**Validity**:

- Is the decision still accurate?
- Does the implementation match the decision?
- Are the consequences still valid?

**Relevance**:

- Is the ADR still referenced in code or documentation?
- Does it affect current development?
- Is it useful for onboarding?

**Status**:

- Should the status remain "Accepted"?
- Should it be marked "Deprecated"?
- Should it be "Superseded" by a new ADR?

### 3. Update the ADR

If changes are needed:

1. **Update the Status**: Change `Status` field if appropriate
2. **Add Review Notes**: Add a `## Review Notes` section with findings
3. **Update Last Reviewed**: Add a `Last Reviewed` field

Example review notes:

```markdown
## Review Notes

### Review Date: 2025-01-05

**Status**: Remains Accepted

**Findings**:

- Decision is still accurate
- Implementation matches the documented approach
- No new technologies have made this obsolete

**Actions**: None
```

### 4. Update Related ADRs

If an ADR is deprecated or superseded:

1. Add a `Superseded By` field linking to the new ADR
2. Update the new ADR's `Related ADRs` to reference the old one
3. Add a note explaining why the change occurred

## Status Transitions

### Accepted → Deprecated

Mark an ADR as **Deprecated** when:

- The decision is no longer recommended but is still in use
- A better approach exists but migration hasn't occurred
- The technology is end-of-life but not yet replaced

```markdown
**Status**: Deprecated
**Deprecated**: 2025-01-05
**Reason**: New technology X provides better performance
**Migration Plan**: Migrate to new system by Q2 2025
```

### Accepted → Superseded

Mark an ADR as **Superseded** when:

- A new ADR completely replaces the decision
- The old approach has been fully migrated away from
- The new ADR provides a comprehensive replacement

```markdown
**Status**: Superseded
**Superseded By**: ADR-015
**Superseded Date**: 2025-01-05
**Migration Note**: All systems migrated to new approach in Dec 2024
```

### Proposed → Accepted

Move an ADR from **Proposed** to **Accepted** when:

- The team has reviewed and approved the decision
- Implementation has begun or is planned
- Consensus has been reached

### Accepted → Proposed

Rarely, an ADR may move back to **Proposed** if:

- New information casts doubt on the decision
- Implementation revealed unexpected issues
- The decision needs further discussion

## ADR Review Script

The `scripts/adr-review.mjs` script automates ADR review checks:

```bash
# Check for ADRs needing review
node scripts/adr-review.mjs --check

# Generate review report
node scripts/adr-review.mjs --report

# Update review dates
node scripts/adr-review.mjs --update ADR-XXX-title.md
```

### Script Features

- **Stale Detection**: Identifies ADRs not reviewed in 12+ months
- **Status Check**: Reports on current ADR status distribution
- **Link Validation**: Checks that related ADR links are valid
- **Template Compliance**: Verifies MADR format adherence

## Review Checklist

When reviewing an ADR, use this checklist:

- [ ] Is the status (Accepted/Proposed/Deprecated/Superseded) still correct?
- [ ] Is the decision still being followed in practice?
- [ ] Are the consequences still accurate?
- [ ] Are related ADRs properly linked?
- [ ] Has the implementation matched the decision?
- [ ] Should this ADR be deprecated or superseded?
- [ ] Are review notes added (if reviewed before)?

## Review Outcomes

After review, an ADR should have one of these outcomes:

| Outcome      | Action                  | Status Change         |
| ------------ | ----------------------- | --------------------- |
| Still Valid  | Add review notes        | No change             |
| Needs Update | Update content          | No change             |
| Deprecated   | Add deprecation notes   | Accepted → Deprecated |
| Superseded   | Link to new ADR         | Accepted → Superseded |
| Reaffirmed   | Add reaffirmation notes | No change             |

## Automation

### GitHub Actions (Optional)

A GitHub Action can automatically create review issues:

```yaml
name: ADR Review Check
on:
  schedule:
    - cron: '0 0 1 * *' # First day of each month
jobs:
  check-adrs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check ADR Reviews
        run: node scripts/adr-review.mjs --check
```

## Related Documentation

- [ADR-008](ADR-008-use-madr-template.md) - MADR template specification
- [ADR README](README.md) - ADR index and overview
- [CLAUDE.md](../CLAUDE.md) - Project documentation
