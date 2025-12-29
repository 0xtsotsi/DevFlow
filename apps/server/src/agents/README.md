# Specialized Worker Agents System

## Overview

The Specialized Worker Agents System provides a comprehensive framework for using AI agents with specialized expertise for different types of software engineering tasks. Instead of using a generic agent for everything, this system intelligently routes tasks to the most appropriate specialized agent.

## Architecture

### Core Components

1. **Agent Types** (`@automaker/types`)
   - Defines all available agent types and their interfaces
   - Includes `AgentType`, `AgentConfig`, `TaskClassification`, etc.

2. **Agent Registry** (`agent-registry.ts`)
   - Manages available agents and their configurations
   - Tracks usage statistics and success rates
   - Provides agent selection based on historical performance

3. **Task Classifier** (`task-classifier.ts`)
   - Analyzes task prompts to determine the best agent
   - Uses keyword matching, pattern recognition, and heuristics
   - Provides confidence scores and alternative suggestions

4. **Agent Prompts** (`agent-prompts.ts`)
   - Contains specialized system prompts for each agent type
   - Defines agent capabilities and configurations
   - Ensures consistent behavior across agent executions

5. **Specialized Agent Service** (`specialized-agent-service.ts`)
   - Orchestrates agent selection and execution
   - Provides unified API for working with specialized agents
   - Supports multi-agent workflows

6. **AutoMode Integration** (`automode-agent-integration.ts`)
   - Integrates specialized agents with AutoModeService
   - Enables intelligent task routing during feature implementation
   - Tracks execution metrics and provides recommendations

## Available Agent Types

### 1. Planning Agent
**Best for:** Creating specifications, breaking down features, designing architecture

**Keywords:** plan, specification, design, architecture, requirements, user story

**Capabilities:**
- Create detailed feature specifications
- Break down features into implementation tasks
- Identify dependencies and risks

**Tools:** Read, Glob, Grep (exploration-focused)

### 2. Implementation Agent
**Best for:** Writing code, implementing features, building functionality

**Keywords:** implement, create, build, add, develop, write code

**Capabilities:**
- Write new code following patterns
- Modify existing code
- Follow project conventions

**Tools:** All tools (no restrictions)

### 3. Testing Agent
**Best for:** Writing tests, verifying functionality, ensuring quality

**Keywords:** test, verify, validate, assert, coverage

**Capabilities:**
- Write unit and integration tests
- Verify implementations work correctly
- Test edge cases and error conditions

**Tools:** Write, Edit, Read, Bash (for running tests)

### 4. Review Agent
**Best for:** Code review, quality assurance, security checks

**Keywords:** review, audit, quality, best practices, security

**Capabilities:**
- Review code for quality and best practices
- Identify bugs and security issues
- Provide constructive feedback

**Tools:** Read, Grep (analysis-focused)

### 5. Debug Agent
**Best for:** Fixing bugs, diagnosing errors, troubleshooting issues

**Keywords:** bug, error, fix, debug, issue, broken, crash

**Capabilities:**
- Diagnose and understand errors
- Fix bugs and issues
- Prevent future issues

**Tools:** Edit, Write, Read, Bash (for debugging)

### 6. Documentation Agent
**Best for:** Writing docs, updating README, creating guides

**Keywords:** document, readme, comment, explain, guide, tutorial

**Capabilities:**
- Write user and developer documentation
- Update README and project docs
- Create clear, comprehensive documentation

**Tools:** Write, Edit, Read

### 7. Refactoring Agent
**Best for:** Improving code structure, reducing complexity, eliminating duplication

**Keywords:** refactor, restructure, clean up, simplify, reorganize

**Capabilities:**
- Refactor code for better structure
- Remove code duplication
- Apply design patterns appropriately

**Tools:** Edit, Read, Write

### 8. Generic Agent
**Best for:** General-purpose tasks that don't require specialization

**Keywords:** help, assist, task, general

**Capabilities:**
- Handle diverse software engineering tasks
- Adapt approach based on task
- Provide good judgment across domains

**Tools:** All tools (no restrictions)

## Usage Examples

### Basic Task Classification

```typescript
import { specializedAgentService } from './agents';

// Classify a task and get recommended agent
const { recommendedAgent, classification, analysis } =
  specializedAgentService.classifyTask(
    "Write comprehensive tests for the user authentication module"
  );

console.log(`Recommended agent: ${recommendedAgent}`);
console.log(`Confidence: ${classification.confidence}`);
console.log(`Keywords: ${analysis.keywords.join(', ')}`);
```

### Executing a Task with Specialized Agent

```typescript
import { specializedAgentService } from './agents';

// Execute task with automatically selected agent
const result = await specializedAgentService.executeTaskWithAgent(
  {
    featureId: 'auth-tests',
    projectPath: '/path/to/project',
    cwd: '/path/to/project',
    abortController: new AbortController(),
  },
  "Write comprehensive tests for the user authentication module"
);

console.log(`Agent used: ${result.agentType}`);
console.log(`Success: ${result.success}`);
console.log(`Duration: ${result.duration}ms`);
console.log(`Tools used: ${result.toolsUsed.map(t => t.name).join(', ')}`);
```

### Force Specific Agent Type

```typescript
// Use testing agent even if classifier suggests otherwise
const result = await specializedAgentService.executeTaskWithAgent(
  {
    featureId: 'my-feature',
    projectPath: '/path/to/project',
    cwd: '/path/to/project',
    abortController: new AbortController(),
  },
  "Implement the feature",
  undefined, // model
  {
    forceAgentType: 'implementation', // Force implementation agent
  }
);
```

### Multi-Agent Workflow

```typescript
// Execute multiple agents in sequence
const results = await specializedAgentService.executeMultiAgentWorkflow(
  {
    featureId: 'user-service',
    projectPath: '/path/to/project',
    cwd: '/path/to/project',
    abortController: new AbortController(),
  },
  [
    {
      taskPrompt: 'Create a specification for the user service',
      agentType: 'planning',
    },
    {
      taskPrompt: 'Implement the user service based on the specification above',
      agentType: 'implementation',
      dependsOn: ['Step 1'],
    },
    {
      taskPrompt: 'Write comprehensive tests for the user service',
      agentType: 'testing',
      dependsOn: ['Step 2'],
    },
  ]
);

console.log(`Completed ${results.length} steps`);
for (const step of results) {
  console.log(`${step.stepName}: ${step.result.success ? '✓' : '✗'}`);
}
```

### Getting Agent Information

```typescript
// Get all available agents
const agents = specializedAgentService.getAvailableAgents();

for (const agent of agents) {
  console.log(`\n${agent.config.name}`);
  console.log(`  Type: ${agent.type}`);
  console.log(`  Description: ${agent.config.description}`);
  console.log(`  Priority: ${agent.config.priority}`);
  console.log(`  Usage count: ${agent.stats?.usageCount || 0}`);
  console.log(`  Success rate: ${((agent.stats?.successRate || 0) * 100).toFixed(0)}%`);
}

// Get recommended agents based on performance
const recommended = specializedAgentService.getRecommendedAgents(3);
console.log('\nTop recommended agents:');
for (const rec of recommended) {
  console.log(`  ${rec.config.name} (score: ${rec.score.toFixed(2)})`);
}
```

### Integration with AutoMode

```typescript
import { createAutoModeAgentIntegration } from './services/automode-agent-integration';

// Create integration instance
const integration = createAutoModeAgentIntegration(events, {
  useSpecializedAgents: true,
  autoClassifyTasks: true,
  planningAgent: 'planning',
  implementationAgent: 'implementation',
  testingAgent: 'testing',
});

// Use integration during feature execution
const { agentType, duration, success } =
  await integration.executeTaskWithSpecializedAgent({
    task: { id: 'T001', description: 'Write tests', status: 'pending' },
    phase: 'testing',
    context: {
      featureId: 'my-feature',
      projectPath: '/path/to/project',
      cwd: '/path/to/project',
      abortController: new AbortController(),
    },
    taskPrompt: 'Write comprehensive tests for the auth module',
  });

// Get statistics and recommendations
const stats = integration.getExecutionStats();
const recommendations = integration.getRecommendations();
```

## Agent Selection Process

### 1. Task Analysis
The system analyzes the task prompt to extract:
- Keywords and phrases
- Programming languages mentioned
- File types involved
- Frameworks/technologies
- Task complexity
- Task characteristics (code, testing, docs, debugging)

### 2. Classification
Based on the analysis, the system:
- Matches keywords against agent-specific patterns
- Calculates confidence scores for each agent type
- Considers task characteristics (debugging, testing, etc.)
- Adjusts scores based on complexity and file types

### 3. Historical Data
If available, the system considers:
- Similar tasks completed in the past
- Success rates of different agents for those tasks
- Performance metrics (duration, errors)
- Recency of executions

### 4. Final Selection
The system selects the agent with:
- Highest confidence score from classification
- Best historical performance for similar tasks
- Highest priority among equally-matched agents

## Configuration

### Disabling Specialized Agents

```typescript
const integration = createAutoModeAgentIntegration(events, {
  useSpecializedAgents: false, // Use generic agent only
});
```

### Disabling Auto-Classification

```typescript
const integration = createAutoModeAgentIntegration(events, {
  useSpecializedAgents: true,
  autoClassifyTasks: false, // Always use configured agents
});
```

### Custom Agent Configuration

```typescript
import { agentRegistry } from './agents';

// Register a custom agent
agentRegistry.registerCustomAgent('custom', {
  type: 'custom',
  name: 'Custom Agent',
  description: 'My custom specialized agent',
  systemPrompt: `You are a custom agent with specific expertise...`,
  defaultMaxTurns: 50,
  capabilities: [
    {
      name: 'custom-task',
      description: 'Performs custom tasks',
      tools: ['Read', 'Write'],
      confidence: 0.9,
    },
  ],
  autoSelectable: true,
  priority: 7,
});
```

## Performance Tracking

The system automatically tracks:
- Usage count per agent
- Success rate (exponential moving average)
- Average execution duration
- Last used timestamp
- Classification history

Access this data via:
```typescript
const stats = specializedAgentService.getAllAgentStats();
const history = agentRegistry.getClassificationHistory(100);
```

## Best Practices

1. **Trust the Classifier**: The task classifier is trained to recognize patterns. Let it do its job.

2. **Provide Clear Task Descriptions**: More context = better classification.
   - Bad: "Fix it"
   - Good: "Fix the authentication bug in the login handler"

3. **Use Multi-Agent Workflows**: Break complex tasks into steps, each handled by the appropriate agent.

4. **Monitor Performance**: Check agent statistics regularly to identify opportunities for optimization.

5. **Customize When Needed**: Register custom agents for domain-specific tasks.

6. **Provide Feedback**: The system learns from execution results. Ensure accurate success tracking.

## Testing

Run the test suite:

```bash
npm test -- agents
```

Tests cover:
- Task classification accuracy
- Agent registry management
- Statistics tracking
- Custom agent registration
- Edge cases and error handling

## Future Enhancements

- Machine learning-based classification
- Dynamic agent capability discovery
- Agent collaboration and delegation
- Performance-based auto-tuning
- Agent specialization plugins
- Multi-agent parallel execution

## Contributing

When adding new agent types:

1. Define the agent type in `@automaker/types/agent-types.ts`
2. Create system prompt in `agent-prompts.ts`
3. Add keywords to `task-classifier.ts`
4. Register agent in `getAgentConfigurations()`
5. Add tests for the new agent
6. Update this README

## License

MIT
