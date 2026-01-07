# Rails-Style Architecture Migration Plan

## Overview

DevFlow is gradually migrating from complex service layers to Rails-style architecture. This document outlines the direction, principles, and migration strategy.

## Goal

**10x simpler codebase over time through gradual migration**

## Rails Principles We're Adopting

### 1. Models Do the Work

**Current State:**

- Services contain business logic
- Models are just data containers
- Complex service orchestration

**Target State:**

- Models encapsulate behavior + data
- Services coordinate models
- Rich domain models

**Example:**

```typescript
// ❌ Current: Service does everything
class AgentService {
  async executeTask(agentType, task) {
    const config = this.getAgentConfig(agentType);
    const model = this.resolveModel(agentType);
    const provider = this.getProvider(model);
    return provider.execute(config);
  }
}

// ✅ Target: Agent model knows how to execute itself
class Agent {
  constructor(agentType, settingsService) {
    this.type = agentType;
    this.settingsService = settingsService;
  }

  async execute(task) {
    const config = this.getConfig();
    const model = await this.resolveModel();
    const provider = this.getProvider(model);
    return provider.execute({ ...config, task });
  }

  // Private methods on the model
  private getConfig() {
    /* ... */
  }
  private async resolveModel() {
    /* ... */
  }
  private getProvider(model) {
    /* ... */
  }
}

// Service just coordinates
class AgentService {
  constructor(private agent: Agent) {}

  async executeTask(task) {
    return this.agent.execute(task);
  }
}
```

### 2. Services Coordinate Models

**Services should:**

- Orchestrate multiple models
- Handle cross-cutting concerns (transactions, events)
- Provide API boundaries

**Services should NOT:**

- Contain business logic that belongs in models
- Duplicate model behavior
- Add unnecessary abstraction layers

### 3. No Abstraction Without 3+ Use Cases

**Before creating abstraction:**

1. Will this be used in 3+ places?
2. Does it simplify the code or add complexity?
3. Is it following convention or reinventing the wheel?

**Example:**

```typescript
// ❌ Over-abstraction (used once)
abstract class BaseAgentFactory<T> {
  abstract createAgent(config: T): Agent;
  abstract validateConfig(config: T): boolean;
  // 10 more abstract methods...
}

// ✅ Simple factory (used 3+ times)
function createAgent(type: AgentType): Agent {
  const config = AGENT_CONFIGS[type];
  return new Agent(type, config);
}
```

### 4. Convention Over Configuration

**Establish conventions:**

- Model naming: `Model` suffix (e.g., `Agent`, `Feature`)
- Service naming: `Service` suffix (e.g., `AgentService`, `FeatureService`)
- File organization: Group by domain, not layer

```bash
# ❌ Current: Grouped by layer
src/
  agents/
    agent-registry.ts
    specialized-agent-service.ts
  services/
    agent-service.ts
    feature-service.ts

# ✅ Target: Grouped by domain
src/
  domains/
    agent/
      model.ts          # Agent model
      service.ts        # Agent coordination service
      registry.ts       # Agent lookup
    feature/
      model.ts          # Feature model
      service.ts        # Feature service
      repository.ts     # Feature persistence
```

## Migration Strategy

### Phase 1: Foundation (Week 1-2)

**Create Core Model Examples:**

1. **Agent Model** (`apps/server/src/domains/agent/model.ts`)
   - Move agent behavior from SpecializedAgentService
   - Encapsulate: config, model resolution, execution
   - Keep service as coordinator

2. **Feature Model** (`apps/server/src/domains/feature/model.ts`)
   - Move feature logic from FeatureService
   - Encapsulate: CRUD, validation, state transitions
   - Keep service for orchestration

3. **Beads Issue Model** (`apps/server/src/domains/beads/model.ts`)
   - Move issue logic from BeadsService
   - Encapsulate: lifecycle, assignments, state
   - Keep service for events and coordination

### Phase 2: Incremental Migration (Week 3-8)

**For Each Domain:**

1. **Identify business logic** in services
2. **Extract to model** as methods
3. **Update service** to delegate to model
4. **Test thoroughly** (no breaking changes)
5. **Repeat** for next domain

**Order of Migration:**

1. Agent → Beads Issue → Feature → Pipeline
2. Settings → Providers → Workspace
3. AutoMode → Hooks → Skills

### Phase 3: Cleanup (Week 9-10)

**After migration:**

1. Remove unused service methods
2. Flatten unnecessary abstractions
3. Consolidate duplicate code
4. Update imports and references
5. Update tests

## Measuring Progress

### Metrics

| Metric             | Current      | Target          |
| ------------------ | ------------ | --------------- |
| Service layers     | ~15 services | ~5 coordinators |
| Model complexity   | Data only    | Rich behavior   |
| Lines per class    | ~500 lines   | ~200 lines      |
| Abstraction layers | 4-5 layers   | 2-3 layers      |
| Code duplication   | ~30%         | <5%             |

### Success Criteria

- ✅ Models contain business logic
- ✅ Services coordinate only
- ✅ No premature abstractions
- ✅ Code follows conventions
- ✅ Simpler to understand and modify

## Next Steps

### Immediate (This Week)

1. **Create Agent Model** (`apps/server/src/domains/agent/model.ts`)

   ```typescript
   export class Agent {
     constructor(
       private type: AgentType,
       private settingsService?: SettingsService
     ) {}

     async execute(task: string): Promise<AgentResult> {
       const config = this.getConfig();
       const model = await this.resolveModel();
       const provider = this.getProvider(model);
       return provider.execute({ ...config, task });
     }

     private getConfig() {
       /* from agent registry */
     }
     private async resolveModel() {
       /* from settings helpers */
     }
     private getProvider(model) {
       /* from provider factory */
     }
   }
   ```

2. **Update SpecializedAgentService** to use Agent model

   ```typescript
   class SpecializedAgentService {
     async executeTask(agentType, task) {
       const agent = new Agent(agentType, this.settingsService);
       return agent.execute(task);
     }
   }
   ```

3. **Test and verify** no breaking changes

### Follow-up (Next Weeks)

- Migrate Beads Issue, Feature, Pipeline models
- Remove unnecessary service layers
- Consolidate duplicate code
- Update architecture documentation

## Key Resources

- [Rails Architecture Guide](https://guides.rubyonrails.org/active_record_basics.html)
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [Pragmatic Programmer](https://pragprog.com/titles/tpp20/)

---

**Status:** In Progress (Gradual Migration)

**Last Updated:** 2026-01-07

**Owner:** DevFlow Team
