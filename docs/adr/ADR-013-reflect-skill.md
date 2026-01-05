# ADR-013: Reflect Skill Architecture

**Status**: Accepted
**Date**: 2025-01-05
**Decision Makers**: DevFlow Team
**Related ADRs**: [ADR-012](ADR-012-skills-system.md), [ADR-009](ADR-009-beads-architecture.md)

## Context and Problem Statement

DevFlow needs a mechanism for AI agents to learn from their experiences and improve over time. Key requirements:

1. **Self-Reflection**: Agents should analyze their own performance
2. **Iterative Improvement**: Failed tasks should be retried with feedback
3. **Memory Integration**: Reflections should be stored for future context
4. **Evaluation**: Consistent criteria for assessing task execution

## Decision Drivers

- **Learning**: Agents should improve from experience
- **Consistency**: Standardized evaluation criteria
- **Integration**: Works with existing Beads memory system
- **Simplicity**: Clear API for triggering reflections
- **Research-Based**: Implements proven patterns from AI research

## Considered Options

### Option 1: External Evaluation Service

Use an external service to evaluate agent performance and provide feedback.

**Good**:

- Separation of concerns
- Could use specialized evaluation models

**Bad**:

- External dependency
- Network latency
- Additional infrastructure
- Privacy concerns (sharing conversations)

### Option 2: Built-In Reflect Skill (Reflexion Pattern)

Implement the Reflexion pattern as an internal skill that analyzes conversation history.

**Good**:

- No external dependencies
- Full control over evaluation logic
- Works offline
- Privacy-preserving
- Integrates with Beads memory
- Based on proven research

**Bad**:

- More implementation complexity
- Evaluation logic needs maintenance
- Requires prompt engineering for quality results

### Option 3: Post-Task Questionnaire

Ask users to rate agent performance after each task.

**Good**:

- Simple to implement
- Direct human feedback

**Bad**:

- User burden (requires manual input)
- Inconsistent feedback
- Not scalable
- Subjective

## Decision Outcome

**Chosen option**: Option 2 - Built-In Reflect Skill (Reflexion Pattern)

The Reflexion pattern is a well-researched approach to agent self-improvement. Implementing it internally provides the best balance of effectiveness, privacy, and integration with DevFlow's architecture.

### Consequences

**Positive**:

- Agents can learn from their mistakes
- Iterative refinement via retry loop
- Reflections stored in Beads for future context
- Consistent evaluation criteria
- Based on proven AI research (Reflexion, LATS)

**Negative**:

- Additional implementation complexity
- Evaluation prompts need tuning
- More conversation data to process

**Neutral**:

- Reflection quality depends on prompt engineering
- Can be triggered manually or via hooks
- History tracked per project

## Architecture

### Reflexion Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    Reflexion Retry Loop                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐     ┌────────────┐     ┌──────────┐             │
│  │ Attempt │ → → │  Reflect   │ → → │ Generate │             │
│  │  Task   │     │ on Result  │     │ Feedback │             │
│  └─────────┘     └────────────┘     └──────────┘             │
│        │                │                  │                  │
│        │                ↓                  │                  │
│        │         ┌────────────┐           │                  │
│        │         │ Evaluate   │           │                  │
│        │         │ Criteria   │           │                  │
│        │         └────────────┘           │                  │
│        │                │                  │                  │
│        │                ↓                  │                  │
│        │         ┌────────────┐           │                  │
│   Score < Threshold?    │           │                  │
│        │         └────────────┘           │                  │
│        │                │ No               │                  │
│        │ Yes           ↓                  │                  │
│        └──────────────────→──────────────────┘              │
│                                  │                           │
│                             Use Feedback                      │
│                             for Next Attempt                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Evaluation Criteria

```typescript
const DEFAULT_EVALUATION_CRITERIA = [
  {
    name: 'task_completion',
    description: 'Was the primary task completed successfully?',
    weight: 0.4,
  },
  {
    name: 'code_quality',
    description: 'Is the code well-structured, readable, and maintainable?',
    weight: 0.3,
  },
  {
    name: 'error_handling',
    description: 'Were errors handled gracefully with informative messages?',
    weight: 0.15,
  },
  {
    name: 'test_coverage',
    description: 'Were appropriate tests added or updated?',
    weight: 0.15,
  },
];
```

### Reflection Result

```typescript
interface ReflectionResult {
  reflectionId: string;
  sessionId: string;
  successScore: number; // 0.0 to 1.0
  criterionScores: Array<{
    name: string;
    score: number;
    reasoning: string;
  }>;
  insights: string[]; // Key observations
  improvements: string[]; // What to fix
  strengths: string[]; // What went well
  suggestedActions: string[]; // What to do next
  timestamp: string;
  duration: number;
}
```

## API

### Execute Reflection

```bash
POST /api/skills/reflect
{
  "projectPath": "/path/to/project",
  "sessionId": "session-123",
  "conversation": [
    { "role": "user", "content": "Implement feature X" },
    { "role": "assistant", "content": "I'll implement feature X..." }
  ],
  "taskDescription": "Implement feature X with error handling",
  "maxInsights": 5
}
```

**Response:**

```json
{
  "success": true,
  "result": {
    "reflectionId": "reflect-1234567890-abc123",
    "sessionId": "session-123",
    "successScore": 0.75,
    "criterionScores": [
      {
        "name": "task_completion",
        "score": 0.8,
        "reasoning": "Task was completed with minor issues"
      },
      {
        "name": "code_quality",
        "score": 0.7,
        "reasoning": "Code is readable but could be more structured"
      },
      {
        "name": "error_handling",
        "score": 0.6,
        "reasoning": "Basic error handling present"
      },
      {
        "name": "test_coverage",
        "score": 0.9,
        "reasoning": "Comprehensive tests added"
      }
    ],
    "insights": ["Modified 3 files", "Used 5 different tools", "Encountered 2 error patterns"],
    "improvements": ["Add more comprehensive error handling", "Improve code structure"],
    "strengths": ["Test coverage is good", "Task was completed"],
    "suggestedActions": [
      "Address: Add more comprehensive error handling",
      "Address: Improve code structure"
    ],
    "timestamp": "2025-01-05T12:00:00.000Z",
    "duration": 1234
  }
}
```

### Get Reflection History

```bash
GET /api/skills/reflect/history?projectPath=/path/to/project
```

### Clear Reflection History

```bash
DELETE /api/skills/reflect/history?projectPath=/path/to/project
```

## Configuration

Environment variables:

```bash
# Reflect skill
REFLECT_SKILL_ENABLED=true
REFLECT_DEFAULT_CRITERIA=task_completion,code_quality,error_handling,test_coverage
REFLECT_SUCCESS_THRESHOLD=0.8
REFLECT_MAX_REFLECTIONS=3
```

## Research Basis

The Reflect skill implements several proven patterns from AI research:

### Reflexion (2023)

**Paper**: "Reflexion: Language Agents with Verbal Reinforcement Learning"

**Key Ideas**:

- Agents reflect on their failures
- Generate textual feedback for improvement
- Use feedback in subsequent attempts
- Achieves significant performance gains

### LATS (2023)

**Paper**: "Language Agent Tree Search"

**Key Ideas**:

- Tree search with reflection
- Self-evaluation at each node
- Uses reflection to guide exploration

### Self-Evolving Agents

**Pattern**: Agents improve themselves through:

1. Task execution
2. Self-reflection
3. Knowledge synthesis
4. Prompt evolution

## File Locations

| File                                                | Purpose                        |
| --------------------------------------------------- | ------------------------------ |
| `apps/server/src/services/reflect-skill-service.ts` | Main reflect service           |
| `libs/prompts/src/reflect.ts`                       | Reflection prompt templates    |
| `apps/server/src/routes/skills/index.ts`            | Reflect API endpoints          |
| `libs/types/src/reflect.ts`                         | Type definitions (to be added) |

## Related Links

- [Reflexion Paper](https://arxiv.org/abs/2303.11366)
- [LATS Paper](https://arxiv.org/abs/2310.04406)
- [Skills System ADR](ADR-012-skills-system.md) - Skills architecture
- [Beads Architecture ADR](ADR-009-beads-architecture.md) - Memory integration
