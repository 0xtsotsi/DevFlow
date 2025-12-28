# Checkpoint System

The checkpoint system provides state persistence and recovery capabilities for multi-agent orchestration in DevFlow. It enables agents to save their progress, recover from failures, and roll back to previous states.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Checkpoint System                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │ CheckpointService│  │ SharedAgentState │  │CheckpointMetadata│ │
│  │                 │  │                  │  │    Manager      │ │
│  │ - createCheckpoint│  │ - setState      │  │ - Lineage       │ │
│  │ - restoreCheckpoint│ │ - getState      │  │ - Branching     │ │
│  │ - listCheckpoints │  │ - subscribe     │  │ - Merging       │ │
│  │ - deleteCheckpoint │  │ - transactions │  │                 │ │
│  └────────┬─────────┘  └────────┬─────────┘  └─────────────────┘ │
│           │                     │                                  │
│           └─────────────────────┴──────────────────┐              │
│                                                      │              │
│                                   ┌────────────────▼──────────────┐│
│                                   │     AutoModeService            ││
│                                   │                                ││
│                                   │ - detectFailedAgents()         ││
│                                   │ - recoverAgent()               ││
│                                   │ - rollbackFeature()            ││
│                                   └────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. CheckpointService

**Location**: `apps/server/src/services/checkpoint-service.ts`

Manages checkpoint creation, storage, and retrieval.

#### API

```typescript
class CheckpointService {
  // Create a new checkpoint
  async createCheckpoint(
    checkpointId: string,
    agents: AgentInfo[],
    state: AgentState,
    description?: string
  ): Promise<CheckpointMetadata>;

  // Restore a checkpoint
  async restoreCheckpoint(checkpointId: string): Promise<CheckpointMetadata>;

  // List all checkpoints (optionally filtered by feature)
  async listCheckpoints(featureId?: string): Promise<CheckpointMetadata[]>;

  // Delete a checkpoint
  async deleteCheckpoint(checkpointId: string): Promise<void>;

  // Get checkpoint lineage for a feature
  async getCheckpointLineage(featureId: string): Promise<CheckpointMetadata[]>;

  // Diff two checkpoints
  async diffCheckpoints(checkpointId1: string, checkpointId2: string): Promise<CheckpointDiff>;

  // Merge two checkpoints
  async mergeCheckpoints(
    sourceCheckpointId: string,
    targetCheckpointId: string
  ): Promise<MergePlan>;
}
```

#### Storage

Checkpoints are stored as JSON files in `.automaker/checkpoints/`:

```
.automaker/checkpoints/
├── cp-feature1-001.json
├── cp-feature1-002.json
└── cp-feature2-001.json
```

#### Checkpoint Metadata

```typescript
interface CheckpointMetadata {
  checkpointId: string; // Unique identifier
  featureId: string; // Associated feature
  createdAt: string; // ISO timestamp
  parentCheckpointId?: string; // Parent checkpoint for lineage
  version: number; // Monotonically increasing version
  agents: AgentInfo[]; // Agent states at checkpoint time
  state: AgentState; // Full agent state
  description?: string; // Optional description
}
```

### 2. SharedAgentState

**Location**: `apps/server/src/lib/shared-agent-state.ts`

Provides a centralized key-value store for state shared across agents.

#### API

```typescript
class SharedAgentState {
  // Set a state value (notifies subscribers)
  setState<T>(key: string, value: T): void;

  // Get a state value
  getState<T>(key: string): T | undefined;

  // Check if key exists
  hasState(key: string): boolean;

  // Delete a state value
  deleteState(key: string): void;

  // Subscribe to state changes for a key
  subscribe<T>(key: string, callback: StateCallback<T>): () => void;

  // Subscribe to all state changes
  subscribeAll(callback: StateCallback): () => void;

  // Get snapshot of all state
  getAllState(): Record<string, unknown>;

  // Begin a transaction for atomic updates
  beginTransaction(): StateTransaction;

  // Clear all state
  clearAllState(): void;
}
```

#### Transactions

Atomic updates are supported via transactions:

```typescript
const tx = sharedState.beginTransaction();
try {
  tx.update('user:name', 'Alice');
  tx.update('user:email', 'alice@example.com');
  tx.delete('user:temp');
  await tx.commit();
} catch (error) {
  tx.rollback();
}
```

#### Subscriptions

Agents can subscribe to state changes:

```typescript
const unsubscribe = sharedState.subscribe('feature:status', (change) => {
  console.log(`${change.key}: ${change.oldValue} → ${change.newValue}`);
});

// Later: unsubscribe();
```

### 3. CheckpointMetadata Manager

**Location**: `apps/server/src/lib/checkpoint-metadata.ts`

Manages checkpoint lineage, branching, and merge operations.

#### API

```typescript
class CheckpointMetadataManager {
  // Initialize lineage from existing checkpoints
  async initializeLineage(checkpoints: CheckpointMetadata[]): Promise<void>;

  // Get lineage for a checkpoint
  getLineage(checkpointId: string): CheckpointLineage | undefined;

  // Get full ancestry chain (root → checkpoint)
  getAncestry(checkpointId: string): CheckpointLineage[];

  // Get all descendants of a checkpoint
  getDescendants(checkpointId: string): CheckpointLineage[];

  // Create diff between two checkpoints
  createDiff(
    checkpoint1: CheckpointMetadata,
    checkpoint2: CheckpointMetadata
  ): CheckpointVersionDiff;

  // Create a new branch from a checkpoint
  createBranch(checkpointId: string, branchName: string): CheckpointBranch;

  // Merge two branches
  mergeBranches(sourceBranch: string, targetBranch: string): MergeResult;

  // Detect merge conflicts
  detectMergeConflicts(branch1: string, branch2: string): string[];

  // Export/import lineage
  exportLineage(): string;
  importLineage(json: string): void;
}
```

### 4. Recovery Methods (AutoModeService)

**Location**: `apps/server/src/services/auto-mode-service.ts`

#### Detect Failed Agents

```typescript
async detectFailedAgents(projectPath: string): Promise<FailedAgent[]>
```

Detects agents that are:

- **Timeout**: No activity for >30 minutes
- **Stuck**: No progress updates for >10 minutes
- **Error**: Entered error state

#### Recover Agent

```typescript
async recoverAgent(
  projectPath: string,
  agentId: string,
  checkpointId: string
): Promise<RecoveryResult>
```

Recovers a failed agent by:

1. Loading the checkpoint state
2. Finding the last completed task
3. Resuming from the next task
4. Updating the feature plan spec

#### Rollback Feature

```typescript
async rollbackFeature(
  projectPath: string,
  featureId: string,
  checkpointId: string
): Promise<RollbackResult>
```

Rolls back a feature to a previous checkpoint by:

1. Stopping the feature if running
2. Restoring state from checkpoint
3. Optionally reverting file changes

## Usage Examples

### Creating a Checkpoint

```typescript
import { CheckpointService } from './services/checkpoint-service.js';

const checkpointService = new CheckpointService(projectPath);

const agents = [
  {
    agentId: 'agent-1',
    status: 'running',
    taskHistory: [
      { taskId: 'T001', description: 'Create model', status: 'completed' },
      { taskId: 'T002', description: 'Create service', status: 'in_progress' },
    ],
  },
];

const state = {
  featureId: 'feature-auth',
  taskHistory: agents[0].taskHistory,
  filesModified: ['src/models/user.ts', 'src/services/auth.ts'],
  context: 'Implementing authentication flow',
  timestamp: new Date().toISOString(),
};

const checkpoint = await checkpointService.createCheckpoint(
  'cp-auth-001',
  agents,
  state,
  'After completing user model'
);
```

### Recovering from a Failure

```typescript
// First, detect failed agents
const failedAgents = await autoModeService.detectFailedAgents(projectPath);

for (const failed of failedAgents) {
  console.log(`Failed agent: ${failed.agentId} (${failed.issue})`);

  // Find the latest checkpoint for this feature
  const checkpoints = await checkpointService.listCheckpoints(failed.featureId);
  const latestCheckpoint = checkpoints[0];

  if (latestCheckpoint) {
    // Recover the agent
    const result = await autoModeService.recoverAgent(
      projectPath,
      failed.agentId,
      latestCheckpoint.checkpointId
    );

    if (result.success) {
      console.log(`Recovered: ${result.message}`);
    }
  }
}
```

### Using Shared State

```typescript
import { SharedAgentState } from './lib/shared-agent-state.js';

const sharedState = new SharedAgentState(eventEmitter);

// Agent A sets state
sharedState.setState('feature:auth:status', 'in_progress');
sharedState.setState('feature:auth:progress', 0.5);

// Agent B subscribes to changes
sharedState.subscribe('feature:auth:progress', (change) => {
  console.log(`Progress updated: ${change.newValue}`);
  if (change.newValue >= 1.0) {
    console.log('Authentication feature complete!');
  }
});

// Agent A updates progress
sharedState.setState('feature:auth:progress', 1.0);
```

### Creating a Checkpoint Branch

```typescript
const metadataManager = new CheckpointMetadataManager();

// Initialize from existing checkpoints
const checkpoints = await checkpointService.listCheckpoints();
await metadataManager.initializeLineage(checkpoints);

// Create a branch for experimental changes
const branch = metadataManager.createBranch('cp-main-001', 'experimental-auth');

console.log(`Created branch: ${branch.branchName}`);
```

### Diffing and Merging Checkpoints

```typescript
// Compare two checkpoints
const diff = await checkpointService.diffCheckpoints('cp-001', 'cp-002');

console.log('Changes:');
for (const change of diff.changes) {
  console.log(`  ${change.type}: ${change.path}`);
}

// Merge checkpoints
const mergePlan = await checkpointService.mergeCheckpoints('cp-exp-001', 'cp-main-002');

console.log('Merge plan:');
for (const step of mergePlan.mergePlan) {
  console.log(`  - ${step}`);
}
```

## Events

The checkpoint system emits events via the EventEmitter:

```typescript
'checkpoint:created'; // New checkpoint created
'checkpoint:restored'; // Checkpoint restored
'checkpoint:deleted'; // Checkpoint deleted
'rollback:started'; // Feature rollback started
'rollback:completed'; // Feature rollback completed
'recovery:started'; // Agent recovery started
'recovery:completed'; // Agent recovery completed
'recovery:failed'; // Agent recovery failed
```

## Testing

Unit tests are located at:

- `apps/server/tests/unit/services/checkpoint-service.test.ts`

Run tests:

```bash
npm run test:server -- tests/unit/services/checkpoint-service.test.ts
```

## Design Decisions

### File-Based Storage

Checkpoints are stored as JSON files rather than a database for:

- Simplicity and portability
- Easy inspection and debugging
- Git-friendly (can be committed if needed)
- No external dependencies

### Version Lineage

Each checkpoint tracks its parent for:

- Rollback to any previous state
- Branching and experimental workflows
- Audit trail of all state changes

### Shared State with Subscriptions

The pub/sub pattern enables:

- Reactive agent behavior
- Loose coupling between agents
- Real-time progress updates

### Transaction Support

Atomic updates prevent:

- Partial state inconsistencies
- Race conditions in multi-agent scenarios
- Difficult-to-debug state corruption

## Future Enhancements

- [ ] Compression for large checkpoint states
- [ ] Checkpoint garbage collection/retention policies
- [ ] Distributed checkpoint storage (S3, database)
- [ ] Checkpoint signing for verification
- [ ] Automatic checkpoint creation on milestones
- [ ] Checkpoint diff visualization in UI
- [ ] Merge conflict resolution UI
