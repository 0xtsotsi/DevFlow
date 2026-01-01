---
name: research
description: Conduct comprehensive research using parallel agents (codebase, web, Beads memory)
---

# Research Skill

This command orchestrates parallel research agents to gather comprehensive context for development tasks.

## Step 1: Parse Research Request

Extract the research query or topic from the user's request. The query should describe:

- The feature or concept to research
- Specific questions to answer
- Context needed for implementation

Example queries:

- "Research how to implement JWT authentication in Node.js"
- "Find examples of React state management patterns"
- "Research best practices for TypeScript error handling"

## Step 2: Spawn Parallel Research Agents

**CRITICAL**: Use a SINGLE response with MULTIPLE Task tool calls to run agents in parallel.

### Codebase Research Agent

- **Agent type**: "general-purpose"
- **Task**: Search codebase for relevant patterns and examples
- **Input**: Provide the research query and project path
- **Instructions**:
  - Use Grep MCP to search for relevant code patterns in the codebase
  - Search for similar implementations, patterns, and usage examples
  - Look for related files, imports, and dependencies
  - Extract code snippets that demonstrate the pattern
  - Summarize findings with:
    - Number of matches found
    - List of related files with line numbers
    - Code examples with context
    - Implementation patterns observed

### Web Research Agent

- **Agent type**: "general-purpose"
- **Task**: Search web for best practices and examples
- **Input**: Provide the research query
- **Instructions**:
  - Use Exa MCP to search for documentation, tutorials, and examples
  - Focus on:
    - Official documentation
    - Best practices and patterns
    - Real-world examples from GitHub
    - Stack Overflow discussions
    - Blog posts and tutorials
  - Summarize findings with:
    - Key insights and recommendations
    - Links to relevant resources
    - Code examples from the web
    - Common patterns and anti-patterns

### Beads Memory Agent

- **Agent type**: "general-purpose"
- **Task**: Query Beads for related past issues and decisions
- **Input**: Provide the research query and project path
- **Instructions**:
  - Use query_beads_memory tool to search past issues
  - Look for:
    - Similar features previously implemented
    - Related bugs and fixes
    - Past decisions and rationale
    - Blockers and dependencies
  - Summarize findings with:
    - Related issues with status
    - Past decisions and their outcomes
    - Lessons learned
    - Relevant context from closed issues

**Example of spawning agents in parallel:**

```
In a SINGLE message, make THREE Task tool calls:
1. Task tool call for codebase-research agent
2. Task tool call for web-research agent
3. Task tool call for beads-memory agent
```

## Step 3: Aggregate and Summarize Results

After all agents complete, aggregate their findings and generate a comprehensive summary:

1. **Key Findings**: Consolidate important discoveries from all agents
2. **Code Examples**: Extract relevant code snippets from codebase and web research
3. **Recommendations**: Synthesize best practices and patterns
4. **Related Context**: Link to past issues, decisions, and related code
5. **Implementation Guidance**: Provide actionable next steps

## Step 4: Generate Research Report

Present the research results in a structured format:

```markdown
# Research Results: [Query]

## Key Findings

- [Finding 1]
- [Finding 2]
- [Finding 3]

## Codebase Patterns

Found X related implementations:

- `path/to/file.ts` (line N): [Description]
- `path/to/file.ts` (line N): [Description]

## Web Research Insights

Best practices:

- [Insight 1] with source: [URL]
- [Insight 2] with source: [URL]

## Past Decisions (from Beads)

- Issue #[ID]: [Decision] - [Rationale]

## Recommendations

1. [Recommendation 1]
2. [Recommendation 2]
3. [Recommendation 3]

## Next Steps

- [Action 1]
- [Action 2]
```

## Notes

- All agents run in parallel to minimize total research time
- Each agent has a 30-second timeout
- Results are cached where possible for performance
- Token estimation prevents context overflow
- Research is logged to events for monitoring
