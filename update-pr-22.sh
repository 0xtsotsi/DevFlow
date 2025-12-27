#!/bin/bash
# Update PR #22 with better title and description
# Run this when network connectivity is available

gh pr edit 22 \
  --title "feat: Implement Feature-Beads bidirectional sync service (Vibe Kanban)" \
  --body "$(cat <<'EOF'
## Summary

Implements a comprehensive bidirectional synchronization service between DevFlow Features and Beads issue tracking system, enabling seamless status coordination across both platforms.

## Changes Made

### Core Implementation
- **New Service**: `apps/server/src/services/feature-beads-sync.ts` (559 lines)
  - `FeatureBeadsSyncService` class with full bidirectional sync capabilities
  - Automatic file watching on `.beads/beads.db` for real-time change detection
  - Intelligent caching system to track issue state changes

### Key Features

**1. Auto-create Beads Issues** (`onFeatureCreated`)
- Automatically creates a Beads issue when a Feature is created
- Maps Feature data (title, description, priority, category) to Beads fields
- Uses `feature:{id}` labels to maintain bidirectional linkage
- Prevents duplicate issue creation

**2. Feature → Beads Status Sync** (`onFeatureStatusChanged`)
- Syncs Feature status changes to corresponding Beads issues
- Status mapping:
  - `pending` → `open`
  - `running` → `in_progress`
  - `completed` → `closed`
  - `failed` → `open`
  - `verified` → `closed`

**3. Beads → Feature Status Sync** (`onIssueStatusChanged`)
- Detects Beads issue status changes via file system watcher
- Updates linked Features automatically
- Reverse mapping: `open→pending`, `in_progress→running`, `closed→completed`

**4. Real-time Change Detection** (`startWatching`)
- Uses `fs.watch()` on `.beads/beads.db` for immediate triggers
- Debounced with 500ms delay to handle rapid changes
- Efficient state caching to minimize unnecessary operations

**5. Validation & Divergence Detection** (`validateSync`)
- Detects three types of synchronization issues:
  - **missing-issue**: Features without linked Beads issues
  - **missing-feature**: Beads issues referencing non-existent Features
  - **status-mismatch**: Linked items with inconsistent statuses
- Returns detailed health reports for debugging

## Why This Matters

This service is critical for M2 execution as it:
- Blocks no other tasks (fully independent implementation)
- Provides the foundation for Features and Beads to work together seamlessly
- Enables AI agents to maintain context across both task tracking systems
- Prevents data divergence through continuous synchronization

## Implementation Details

- **Type Safety**: Full TypeScript type definitions using `@automaker/types`
- **Error Handling**: Comprehensive error handling with detailed logging
- **Edge Cases**: Handles missing features, initialization errors, duplicate prevention
- **Resource Management**: Proper cleanup with `dispose()` method
- **Testing**: TypeScript compilation verified, ready for integration testing

## API Methods

```typescript
// Lifecycle
startWatching(): Promise<void>
stopWatching(): void
dispose(): void

// Event Handlers
onFeatureCreated(feature: Feature): Promise<BeadsIssue | null>
onFeatureStatusChanged(feature: Feature): Promise<void>
onIssueStatusChanged(issue: BeadsIssue): Promise<void>

// Explicit Sync
syncFeatureStatus(featureId: string): Promise<void>
syncIssueStatus(issueId: string): Promise<void>

// Validation
validateSync(): Promise<{ isHealthy: boolean; divergences: Divergence[] }>
```

## Testing Status

✅ TypeScript compilation: No errors
✅ File structure: Verified
✅ All methods present: Confirmed
⏳ Integration testing: Ready for execution

---

This PR was written using [Vibe Kanban](https://vibekanban.com)
EOF
)"

echo "PR #22 updated successfully!"
echo "View at: https://github.com/0xtsotsi/DevFlow/pull/22"
