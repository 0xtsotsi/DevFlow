# Specialized Worker Agents - Quick Start Guide

## 5-Minute Setup

### 1. Import the Service

```typescript
import { specializedAgentService } from './agents';
```

### 2. Classify a Task

```typescript
const { recommendedAgent, classification, analysis } =
  specializedAgentService.classifyTask(
    "Your task description here"
  );

console.log(`Recommended: ${recommendedAgent} (${(classification.confidence * 100).toFixed(0)}% confidence)`);
```

### 3. Execute with Optimal Agent

```typescript
const result = await specializedAgentService.executeTaskWithAgent(
  {
    featureId: 'my-feature',
    projectPath: process.cwd(),
    cwd: process.cwd(),
    abortController: new AbortController(),
  },
  "Your task description here"
);

console.log(`${result.success ? '✓' : '✗'} ${result.agentType}: ${result.duration}ms`);
```

## Common Patterns

### Force Specific Agent

```typescript
const result = await specializedAgentService.executeTaskWithAgent(
  context,
  taskPrompt,
  undefined, // model
  { forceAgentType: 'testing' } // Force testing agent
);
```

### Multi-Step Workflow

```typescript
const results = await specializedAgentService.executeMultiAgentWorkflow(
  context,
  [
    {
      taskPrompt: 'Create specification for user authentication',
      agentType: 'planning',
    },
    {
      taskPrompt: 'Implement authentication based on spec above',
      agentType: 'implementation',
      dependsOn: ['Step 1'],
    },
    {
      taskPrompt: 'Write tests for authentication',
      agentType: 'testing',
      dependsOn: ['Step 2'],
    },
  ]
);
```

### Get Agent Statistics

```typescript
const agents = specializedAgentService.getAvailableAgents();
agents.forEach(({ type, config, stats }) => {
  console.log(`${config.name}:`);
  console.log(`  Used: ${stats?.usageCount || 0} times`);
  console.log(`  Success rate: ${((stats?.successRate || 0) * 100).toFixed(0)}%`);
  console.log(`  Avg duration: ${((stats?.avgDuration || 0) / 1000).toFixed(1)}s`);
});
```

## Agent Types Cheat Sheet

| Agent | Best For | Keywords |
|-------|----------|----------|
| **planning** | Specs, design, task breakdown | plan, spec, design, architecture, requirements |
| **implementation** | Writing code, features | implement, create, build, develop |
| **testing** | Tests, verification | test, verify, validate, coverage |
| **review** | Code review, QA | review, audit, quality, security |
| **debug** | Fixing bugs | bug, error, fix, debug, broken |
| **documentation** | Docs, README | document, readme, guide, tutorial |
| **refactoring** | Code improvement | refactor, clean up, simplify, restructure |
| **generic** | General tasks | help, assist, task |

## Integration with AutoMode

```typescript
import { createAutoModeAgentIntegration } from './services/automode-agent-integration';

// Create integration
const integration = createAutoModeAgentIntegration(events, {
  useSpecializedAgents: true,
  autoClassifyTasks: true,
});

// Execute task
const { agentType, success, duration } =
  await integration.executeTaskWithSpecializedAgent({
    task: parsedTask,
    phase: 'implementation',
    context: executionContext,
    taskPrompt: taskPrompt,
  });

// Get stats
const stats = integration.getExecutionStats();
```

## Tips

✓ **Be specific** in task descriptions for better classification
✓ **Use multi-agent workflows** for complex features
✓ **Monitor statistics** to optimize agent selection
✓ **Provide feedback** via execution results for learning
✓ **Customize agents** for domain-specific tasks

✗ **Don't** force agent types unless necessary
✗ **Don't** ignore low confidence warnings
✗ **Don't** skip testing when implementing features
✗ **Don't** use generic agent for specialized tasks

## Troubleshooting

**Wrong agent selected?**
- Check task description clarity
- Consider forcing specific agent type
- Review classification confidence

**Poor results?**
- Check agent statistics
- Review system prompt
- Verify tool access
- Consider custom agent

**Need customization?**
- Register custom agent
- Override system prompt
- Adjust capabilities
- Set priority and auto-selectable flag

## Learn More

See `apps/server/src/agents/README.md` for comprehensive documentation.
