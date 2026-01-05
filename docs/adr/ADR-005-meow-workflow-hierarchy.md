# ADR-005: MEOW Workflow Hierarchy Using Existing Beads Structures

## Status

**Accepted**

## Context

Gastown's MEOW system provides a hierarchical task decomposition:

- **Mission**: High-level objective (e.g., "Build user authentication system")
- **Epoch**: Major phase of a mission (e.g., "Design database schema")
- **Operation**: Concrete task within an epoch (e.g., "Create User model")
- **Work**: Atomic unit of work (e.g., "Define User interface")

This hierarchy provides natural organization and helps agents understand task context. DevFlow currently uses Beads, which has similar parent/child relationships. The question is whether to:

1. Adopt MEOW terminology and structure explicitly
2. Use Beads' existing hierarchy without MEOW concepts
3. Create a new DevFlow-specific hierarchy

### Current Beads Capabilities

Beads supports hierarchical relationships through:

- `parentIssueId`: Links child to parent
- `childIssueIds`: Lists all children
- `dependencies`: Links between issues (blocks, related, discovered-from)

### Decision Drivers

- **User Familiarity**: DevFlow users know Beads, not MEOW
- **CLI Compatibility**: Must work with standard `bd` commands
- **Semantics**: Hierarchy should convey meaningful relationships
- **Tool Support**: Can leverage Beads CLI for hierarchy operations
- **Migration**: Existing Beads databases should continue working

## Considered Alternatives

### Alternative 1: Explicit MEOW Implementation

**Description**: Add MEOW concepts to Beads with new types and explicit levels.

**Implementation**:

```typescript
// Add new issue types to Beads
type BeadsIssueType =
  | 'bug'
  | 'feature'
  | 'task'
  | 'epic'
  | 'mission' // NEW
  | 'epoch' // NEW
  | 'operation' // NEW
  | 'work'; // NEW

interface MEOWHierarchy {
  mission: BeadsIssue; // bd-m1
  epochs: BeadsIssue[]; // bd-m1.1, bd-m1.2
  operations: BeadsIssue[][]; // nested
  work: BeadsIssue[][][]; // deeply nested
}
```

**Pros**:

- Clear hierarchy semantics
- Explicit levels for agents to understand
- Matches Gastown's proven approach

**Cons**:

- **Beads CLI Incompatibility**: `bd` doesn't know about MEOW types
- **Database Changes**: Need schema migration or custom parsing
- **User Confusion**: DevFlow users must learn MEOW concepts
- **Rigid Structure**: Forced 4-level hierarchy might not fit all workflows
- **Parsing Complexity**: Custom logic needed to extract MEOW structure from flat issues

### Alternative 2: Use Beads Labels for MEOW Levels

**Description**: Keep Beads types, use labels to indicate MEOW level.

**Implementation**:

```typescript
// Standard Beads types
type BeadsIssueType = 'bug' | 'feature' | 'task' | 'epic' | 'chore';

// Use labels for MEOW levels
{
  title: 'Build user auth',
  type: 'epic',
  labels: ['meow-level:mission']  // label indicates MEOW
}

{
  title: 'Design database',
  type: 'task',
  parentIssueId: 'bd-m1',
  labels: ['meow-level:epoch']
}
```

**Pros**:

- Beads CLI compatible (labels are standard)
- No schema changes
- Can query with `bd list --labels`

**Cons**:

- **Parsing Overhead**: Must parse labels to detect MEOW level
- **Type Safety**: No compile-time guarantee of MEOW structure
- **Query Inefficiency**: Can't use SQL for MEOW queries
- **Namespace Pollution**: Labels mixed with user tags
- **Validation**: Easy to create invalid MEOW hierarchies (e.g., epoch without parent)

### Alternative 3: Map MEOW to Existing Beads Hierarchy (SELECTED)

**Description**: Use Beads' existing parent/child relationships, map MEOW concepts to Beads types organically.

**Mapping**:

```
MEOW Level    → Beads Type/Usage
─────────────────────────────────
Mission       → epic with no parent (top-level)
Epoch         → feature or epic with parent
Operation     → task with parent
Work          → chore or sub-task with parent
```

**No new types or schema changes**. Use standard Beads relationships and let hierarchy emerge naturally from task decomposition.

**Pros**:

- **Zero Breaking Changes**: Works with existing Beads databases
- **CLI Compatible**: Standard `bd` commands work naturally
- **User Familiarity**: DevFlow users already understand Beads types
- **Flexible Hierarchy**: Depth can vary (some missions need 3 levels, some need 5)
- **Tool Support**: Beads CLI parent/child operations work
- **Simple Migration**: No conversion needed for existing data

**Cons**:

- **Implicit Semantics**: MEOW levels not explicitly labeled
- **Agent Confusion**: Agents must infer level from depth/type
- **Less Structure**: No enforced 4-level hierarchy
- **Ambiguity**: Is a top-level task a Mission or just a task?

### Alternative 4: Hybrid - Labels for Explicit MEOW + Beads for Storage

**Description**: Store hierarchy in Beads, add MEOW labels for clarity when needed.

**Implementation**:

```typescript
// Most issues use standard Beads types
{
  id: 'bd-1',
  type: 'epic',  // implicitly a Mission
  parentIssueId: null
}

{
  id: 'bd-2',
  type: 'feature',  // implicitly an Epoch
  parentIssueId: 'bd-1'
}

// Optional: add MEOW labels for clarity
{
  id: 'bd-1',
  type: 'epic',
  labels: ['meow:mission']  // explicit label
}
```

**Pros**:

- Backward compatible (labels optional)
- Can add MEOW clarity where needed
- Standard Beads operations work

**Cons**:

- **Inconsistent**: Some issues have MEOW labels, some don't
- **Maintenance Overhead**: Keep labels in sync with hierarchy
- **Limited Value**: Labels don't enforce structure
- **Parsing Complexity**: Code must handle labeled and unlabeled

## Decision

**Map MEOW to Existing Beads Hierarchy (Alternative 3).**

We will NOT explicitly implement MEOW as a separate concept. Instead, we'll leverage Beads' existing parent/child relationships and standard issue types to achieve similar organizational benefits.

## Rationale

1. **Beads Already Has Hierarchy**: The parent/child relationships in Beads provide the same organizational structure as MEOW. Adding MEOW on top would be redundant.

2. **User Familiarity**: DevFlow users know Beads. Teaching them MEOW would add cognitive load without proportional benefit.

3. **Flexibility Over Rigidity**: MEOW's 4-level hierarchy is prescriptive. Real-world projects vary:
   - Small bug fix: Might only need 2 levels
   - Large feature: Might need 5+ levels
   - Beads supports variable depth naturally

4. **CLI Compatibility**: This is critical. Users interact with Beads via `bd` CLI. Adding MEOW-specific concepts would break that workflow or require custom tools.

5. **Type System**: Beads' existing types (`epic`, `feature`, `task`, `chore`) are sufficient to express hierarchy:
   - Top-level `epic` = Mission
   - `feature` or `epic` with parent = Epoch
   - `task` with parent = Operation
   - `chore` or sub-task with parent = Work

6. **No Migration Needed**: Existing Beads databases work as-is. No conversion or schema changes required.

## Implementation

### Issue Creation Guidelines

When creating hierarchical issues, follow these conventions:

```typescript
// Mission: Top-level epic
const mission = await beadsService.createIssue({
  title: 'Build user authentication system',
  type: 'epic',
  parentIssueId: null, // top-level
  description: 'Complete auth system including login, signup, password reset',
});

// Epoch: Major phase
const epoch1 = await beadsService.createIssue({
  title: 'Design database schema',
  type: 'feature',
  parentIssueId: mission.id, // child of Mission
  description: 'Design Users, Sessions, PasswordReset tables',
});

// Operation: Concrete task
const operation1 = await beadsService.createIssue({
  title: 'Create User model',
  type: 'task',
  parentIssueId: epoch1.id, // child of Epoch
  description: 'Define User interface with fields',
});

// Work: Atomic unit
const work1 = await beadsService.createIssue({
  title: 'Add email field',
  type: 'chore',
  parentIssueId: operation1.id, // child of Operation
  description: 'Add email: string to User interface',
});
```

### Hierarchy Detection

Agents can determine an issue's level by checking its depth:

```typescript
function getMEOWLevel(issue: BeadsIssue): 'mission' | 'epoch' | 'operation' | 'work' {
  const depth = getHierarchyDepth(issue); // 0 = top-level

  switch (depth) {
    case 0:
      return 'mission'; // top-level epic
    case 1:
      return 'epoch'; // child of top-level
    case 2:
      return 'operation'; // child of epoch
    default:
      return 'work'; // deeper levels
  }
}

async function getHierarchyDepth(issue: BeadsIssue): Promise<number> {
  let depth = 0;
  let current = issue;

  while (current.parentIssueId) {
    const parent = await beadsService.getIssue(current.parentIssueId);
    if (!parent) break;
    depth++;
    current = parent;
  }

  return depth;
}
```

### Enhanced Hierarchy Display

The UI can show hierarchical context without explicit MEOW labels:

```
📁 Build user authentication system (epic)
  └── 📂 Design database schema (feature)
      └── 📄 Create User model (task)
          └── ✅ Add email field (chore)
```

### Agent Context

When assigning work to agents, provide hierarchy context:

```typescript
async function assignAgent(issue: BeadsIssue) {
  const context = await getHierarchyContext(issue);

  // Agent receives:
  const agentPrompt = `
Task: ${issue.title}
Description: ${issue.description}

Context:
- This is part of: ${context.parent?.title} (operation)
- Which is part of: ${context.grandparent?.title} (epoch)
- Under mission: ${context.root?.title}

Related work: ${context.siblings.map((s) => s.title).join(', ')}
  `;
}
```

### Optional MEOW Labeling (For Visualization Only)

If explicit MEOW labels are useful for visualization, add them as display-only metadata (not in Beads DB):

```typescript
// UI rendering helper
function getMEOWLabel(issue: BeadsIssue): string {
  const depth = getHierarchyDepth(issue);
  const labels = ['Mission', 'Epoch', 'Operation', 'Work'];
  return labels[Math.min(depth, 3)] || 'Work';
}
```

## Consequences

### Positive

- **Zero Breaking Changes**: Existing Beads databases work unchanged
- **CLI Compatibility**: All `bd` commands work as before
- **User Familiarity**: No new concepts to learn
- **Flexible Depth**: Hierarchy depth adapts to project needs
- **Simple Implementation**: No new types or schema
- **Tool Support**: Beads CLI parent/child operations work naturally

### Negative

- **Implicit Semantics**: MEOW levels not explicitly labeled in data
- **Agent Inference**: Agents must calculate depth to understand level
- **Less Structure**: No enforced 4-level hierarchy
- **Ambiguity**: Top-level task vs mission distinction is semantic only

### Migration

No migration needed. Existing Beads hierarchies work as-is.

## Future Enhancements

If explicit MEOW concepts become valuable, we can add:

1. Optional labels for visualization: `['meow-level:mission']`
2. UI filters to show specific MEOW levels
3. Agent prompts that explain level semantics
4. Analytics on hierarchy depth and branching

All of these can be added without breaking existing databases or CLI workflows.

## Related Decisions

- [ADR-001: Adopt Gastown-inspired Features Without Full Integration](ADR-001-adopt-gastown-features.md)
- [ADR-002: Use Optional Beads Fields Instead of Schema Migration](ADR-002-use-optional-beads-fields.md)

## References

- Beads Types: `/home/codespace/DevFlow/libs/types/src/beads.ts`
- BeadsService: `/home/codespace/DevFlow/apps/server/src/services/beads-service.ts`
- Gastown MEOW: [hypertext-code/gastown](https://github.com/hypertext-code/gastown)
